import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  Scene, 
  BackgroundGenerationOptions 
} from '../types';
import { runFfmpeg } from '../../utils/ffmpeg.utils';
import { overlayTemplates } from '../../utils/overlayStyles';
import { simple_video_effect } from '../../efffects/basic.effects';
import { card_motion_effectAd } from '../../efffects/cardMotioneffects';
import { zoom_effectAd } from '../../efffects/zoom_effect';
import { cycling_effects_video } from '../../efffects/cycling.effect';

const execPromise = promisify(exec);

export class AvatarBackgroundService {
  

  async generateBackgroundVideo(options: BackgroundGenerationOptions): Promise<string[]> {
    const { scenes, effectType, dirs, fps, templates, templateName, logoPath } = options;
    
    console.log(`\n====== AVATAR BACKGROUND GENERATION ======`);
    console.log(`Effect: ${effectType}`);
    console.log(`Scenes: ${scenes.length}`);
    console.log(`Template: ${templateName || 'default'}`);
    console.log(`Logo: ${logoPath ? 'YES' : 'NO'}`);

    let clipPaths: string[] = [];

    try {
      switch (effectType) {
        case 'basic':
          clipPaths = await simple_video_effect(
            scenes,
            dirs,
            runFfmpeg,
            fps,
            templates,
            templateName || 'basic',
            logoPath
          );
          break;

        case 'card_motion':
          clipPaths = await card_motion_effectAd(
            scenes,
            dirs,
            runFfmpeg,
            fps,
            templates,
            templateName || 'card_motion',
            logoPath
          );
          break;

        case 'zoom_effect':
          clipPaths = await zoom_effectAd(
            scenes,
            dirs,
            runFfmpeg,
            fps,
            templates,
            templateName || 'zoom_effect',
            logoPath
          );
          break;

        case 'cycling':
          clipPaths = await cycling_effects_video(
            scenes,
            dirs,
            runFfmpeg,
            fps,
            templates,
            templateName || 'cycling',
            logoPath
          );
          break;

        default:
          console.warn(`Unknown effect type: ${effectType}, using zoom_effect`);
          clipPaths = await zoom_effectAd(
            scenes,
            dirs,
            runFfmpeg,
            fps,
            templates,
            'zoom_effect',
            logoPath
          );
      }

      console.log(`✅ Background clips generated: ${clipPaths.length}`);
      return clipPaths;

    } catch (error: any) {
      console.error(`❌ Background generation failed: ${error.message}`);
      throw error;
    }
  }

 
  async concatenateBackgroundClips(
    clipPaths: string[], 
    outputPath: string, 
    runFfmpeg: (args: string[]) => Promise<void>
  ): Promise<string> {
    if (clipPaths.length === 0) {
      throw new Error('No clips to concatenate');
    }

    if (clipPaths.length === 1) {
      // Single clip, just copy it
      fs.copyFileSync(clipPaths[0], outputPath);
      return outputPath;
    }

    console.log(`\n🔗 Concatenating ${clipPaths.length} background clips...`);

    // Create concat list file
    const concatListPath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const concatContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    try {
      await runFfmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        outputPath
      ]);

      // Cleanup concat list
      fs.unlinkSync(concatListPath);

      console.log(`✅ Background video concatenated: ${path.basename(outputPath)}`);
      return outputPath;

    } catch (error: any) {
      // Cleanup concat list on error
      if (fs.existsSync(concatListPath)) {
        fs.unlinkSync(concatListPath);
      }
      throw error;
    }
  }

  
  async getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
    try {
      const { stdout } = await execPromise(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
      );
      const [width, height] = stdout.trim().split('x').map(Number);
      return { width, height };
    } catch (error: any) {
      console.error(`Failed to get video dimensions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate background video file
   */
  async validateBackgroundVideo(videoPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(videoPath)) {
        console.error(`Background video not found: ${videoPath}`);
        return false;
      }

      const stats = fs.statSync(videoPath);
      if (stats.size === 0) {
        console.error(`Background video is empty: ${videoPath}`);
        return false;
      }

      // Try to get dimensions to verify it's a valid video
      await this.getVideoDimensions(videoPath);
      
      console.log(`✅ Background video validated: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return true;

    } catch (error: any) {
      console.error(`❌ Background video validation failed: ${error.message}`);
      return false;
    }
  }
}
