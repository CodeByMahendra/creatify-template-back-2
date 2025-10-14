
// import { Injectable } from '@nestjs/common';
// import * as path from 'path';
// import * as fs from 'fs';
// import { runFfmpeg } from 'src/utils/ffmpeg.utils';
// import { overlayTemplates } from 'src/utils/overlayStyles';
// import { zoom_effectAd } from 'src/efffects';
// import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';

// @Injectable()
// export class VideoService {
//   assetsDir = path.join(process.cwd(), 'assets');
//   imagesDir = path.join(this.assetsDir, 'images');
//   audioDir = path.join(this.assetsDir, 'audio');
//   videosDir = path.join(this.assetsDir, 'videos');
//   outputDir = path.join(this.assetsDir, 'output');
//   fps = 25;

//   async buildVideo(scenes: Scene[], effectType?: string, audio_url?: string) {
//     if (!fs.existsSync(this.outputDir)) {
//       fs.mkdirSync(this.outputDir, { recursive: true });
//     }

//     // ----- Save assets locally -----
//     const { updatedScenes: scenesWithAssets } = await saveSceneAssets(
//       scenes,
//       this.assetsDir,
//       audio_url
//     );

//     const updatedScenes = scenesWithAssets.map(scene => ({
//       ...scene,
//       image_filename: scene.image_filename || null,
//       audio_filename: scene.audio_filename || null,
//       // video_filename: scene.video_filename || null,
//     }));

//     // Debug log
//     updatedScenes.forEach((s, idx) => {
//       console.log(`Scene ${idx + 1}: image = ${s.image_filename}, audio = ${s.audio_filename}`);
//     });

//     let clipPaths: string[] = [];
//     const chosenEffect = effectType || 'zoom_efffect';

//     switch (chosenEffect) {
//       case 'zoom_efffect':
//         clipPaths = await zoom_effectAd(
//           updatedScenes,
//           {
//             imagesDir: this.imagesDir,
//             videosDir: this.videosDir,
//             outputDir: this.outputDir,
//           },
//           runFfmpeg,
//           this.fps,
//           overlayTemplates,
//           'zoom_effect'
//         );
//         break;

//       default:
//         throw new Error(`Unknown effect type: ${chosenEffect}`);
//     }

//     // ----- Merge clips -----
//     const listFile = path.join(this.outputDir, 'concat_list.txt');
//     fs.writeFileSync(
//       listFile,
//       clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
//     );

//     const finalPath = path.join(this.outputDir, `final_${chosenEffect}.mp4`);
//     await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath]);

//     fs.unlinkSync(listFile);

//     console.log('✅ Video generated at:', finalPath);

//     return {
//       chosenEffect,
//       finalVideo: finalPath,
//     };
//   }
// }


// ✅ FIXED: video.service.ts - Proper error handling and worker management
import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Worker } from 'worker_threads';
import { Scene } from 'src/utils/saveSceneImages';

@Injectable()
export class VideoService {
  assetsDir = path.join(process.cwd(), 'assets');
  imagesDir = path.join(this.assetsDir, 'images');
  audioDir = path.join(this.assetsDir, 'audio');
  videosDir = path.join(this.assetsDir, 'videos');
  outputDir = path.join(this.assetsDir, 'output');
  fps = 25;

  constructor() {
    // Create directories if they don't exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = [
      this.assetsDir,
      this.imagesDir,
      this.audioDir,
      this.videosDir,
      this.outputDir,
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      }
    }
  }

  async buildVideo(
    scenes: Scene[],
    effectType?: string,
    audio_url?: string
  ): Promise<{
    success: boolean;
    finalVideo?: string;
    error?: string;
    stats?: any;
  }> {
    // Validate input
    if (!scenes || scenes.length === 0) {
      throw new BadRequestException('Scenes array is required and cannot be empty');
    }

   
   

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      try {
        // Get worker file path
        const workerPath = path.resolve(__dirname, 'video-worker.js');
        
        if (!fs.existsSync(workerPath)) {
          throw new Error(`Worker file not found: ${workerPath}`);
        }

        console.log(`🔧 Starting worker: ${workerPath}\n`);

        // Create worker with data
        const worker = new Worker(workerPath, {
          workerData: {
            scenes,
            effectType: effectType || 'zoom_effect',
            audio_url,
            fps: this.fps,
            dirs: {
              assetsDir: this.assetsDir,
              imagesDir: this.imagesDir,
              videosDir: this.videosDir,
              outputDir: this.outputDir,
            },
          },
        });

        // Set timeout for worker (30 minutes max)
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Video processing timeout (30 minutes exceeded)'));
        }, 30 * 60 * 1000);

        // Handle worker messages
        worker.on('message', (result) => {
          clearTimeout(timeout);
          console.log('\n✅ Worker completed successfully\n');
          
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        });

        // Handle worker errors
        worker.on('error', (err) => {
          clearTimeout(timeout);
          console.error('\n❌ Worker error:', err);
          reject(err);
        });

        // Handle worker exit
        worker.on('exit', (code) => {
          clearTimeout(timeout);
          
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Helper method to validate video file
  async validateVideoFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Video file not found: ${filePath}`);
        return false;
      }

      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / 1024 / 1024;

      if (sizeInMB < 0.1) {
        console.warn(`⚠️ Video file too small: ${sizeInMB.toFixed(2)} MB`);
        return false;
      }

      console.log(`✅ Video file valid: ${sizeInMB.toFixed(2)} MB`);
      return true;
    } catch (error) {
      console.error('Error validating video:', error);
      return false;
    }
  }

  // Helper method to get output videos
  async getOutputVideos(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return [];
      }

      const files = fs.readdirSync(this.outputDir);
      return files
        .filter(f => f.startsWith('final_') && f.endsWith('.mp4'))
        .map(f => path.join(this.outputDir, f));
    } catch (error) {
      console.error('Error getting output videos:', error);
      return [];
    }
  }

  // Helper method to cleanup old files
  async cleanupOldFiles(ageInHours: number = 24): Promise<number> {
    try {
      const now = Date.now();
      const ageMs = ageInHours * 60 * 60 * 1000;
      let deletedCount = 0;

      const dirs = [this.outputDir, this.imagesDir];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);

          if (now - stats.mtimeMs > ageMs) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up files:', error);
      return 0;
    }
  }
}

