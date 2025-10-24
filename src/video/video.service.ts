
import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Worker } from 'worker_threads';
import { Scene } from 'src/utils/saveSceneImages';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class VideoService {
  rootTempDir = path.join(process.cwd(), 'temp');
  fps = 25;
  private activeRequests = new Map<string, Date>();
  private maxActiveRequests = 4; 
  private maxRequestAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

  constructor() {
    this.ensureRootTempDir();
    // Run cleanup every 30 minutes
    this.startPeriodicCleanup();
  }

  private ensureRootTempDir() {
    if (!fs.existsSync(this.rootTempDir)) {
      fs.mkdirSync(this.rootTempDir, { recursive: true });
      console.log(`✅ Created root temp directory: ${this.rootTempDir}`);
    }
  }

  private startPeriodicCleanup() {
    // Clean up old files every 30 minutes
    setInterval(() => {
      console.log(' Running periodic cleanup...');
      this.cleanupOldRequests();
    }, 30 * 60 * 1000);
  }

  private async cleanupOldRequests() {
    try {
      const now = Date.now();
      let deletedCount = 0;

      // Remove requests older than maxRequestAge from tracking
      for (const [requestId, timestamp] of this.activeRequests.entries()) {
        if (now - timestamp.getTime() > this.maxRequestAge) {
          await this.cleanupRequest(requestId);
          this.activeRequests.delete(requestId);
          deletedCount++;
        }
      }

      // If still too many requests, remove oldest ones
      if (this.activeRequests.size > this.maxActiveRequests) {
        const sortedRequests = Array.from(this.activeRequests.entries())
          .sort((a, b) => a[1].getTime() - b[1].getTime());

        const toRemove = sortedRequests.slice(0, this.activeRequests.size - this.maxActiveRequests);
        
        for (const [requestId] of toRemove) {
          await this.cleanupRequest(requestId);
          this.activeRequests.delete(requestId);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(` Cleaned up ${deletedCount} old requests`);
      }

      // Also clean up any orphaned directories not in tracking
      await this.cleanupOrphanedDirectories();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private async cleanupOrphanedDirectories() {
    try {
      if (!fs.existsSync(this.rootTempDir)) {
        return;
      }

      const entries = fs.readdirSync(this.rootTempDir);
      let orphanedCount = 0;

      for (const entry of entries) {
        const fullPath = path.join(this.rootTempDir, entry);
        const stats = fs.statSync(fullPath);

        // If directory and not in active requests, check age
        if (stats.isDirectory() && !this.activeRequests.has(entry)) {
          const age = Date.now() - stats.mtimeMs;
          
          if (age > this.maxRequestAge) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            orphanedCount++;
            console.log(` Removed orphaned directory: ${entry}`);
          }
        }
      }

      if (orphanedCount > 0) {
        console.log(` Cleaned up ${orphanedCount} orphaned directories`);
      }
    } catch (error) {
      console.error('Error cleaning orphaned directories:', error);
    }
  }

  private createRequestDirs(requestId: string) {
    const requestDir = path.join(this.rootTempDir, requestId);
    const assetsDir = path.join(requestDir, 'assets');

    const dirs = {
      requestDir,
      assetsDir,
      imagesDir: path.join(assetsDir, 'images'),
      audioDir: path.join(assetsDir, 'audio'),
      videosDir: path.join(assetsDir, 'videos'),
      logoDir: path.join(assetsDir, 'logo'),
      avatarDir: path.join(assetsDir,'avatar'),
      musicDir: path.join(assetsDir, 'music'),
      clipsDir: path.join(assetsDir, 'clips'),
      assDir: path.join(assetsDir, 'ass'),
      resizedDir: path.join(assetsDir, 'resized'),
      tempDir: path.join(assetsDir, 'temp'),
      outputDir: path.join(requestDir, 'output'),
    };

    console.log(`\n Creating directories for request: ${requestId}`);
    for (const [key, dir] of Object.entries(dirs)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   ✅ ${key}: ${dir}`);
      }
    }

    return dirs;
  }

  async buildVideo(
    scenes: Scene[],
    effectType?: string,
    audio_url?: string,
    logo_url?: string,
    avatar_url?:string,
    background_music_url?: string,
  ): Promise<{
    success: boolean;
    requestId: string;
    finalVideo?: string;
    error?: string;
    stats?: any;
  }> {
    if (!scenes || scenes.length === 0) {
      throw new BadRequestException('Scenes array is required and cannot be empty');
    }

    const requestId = uuidv4();
    console.log(`\n Processing request: ${requestId}`);

    // Track this request
    this.activeRequests.set(requestId, new Date());

    // Clean up old requests before starting new one
    await this.cleanupOldRequests();

    const dirs = this.createRequestDirs(requestId);

    return new Promise((resolve, reject) => {
      try {
        const workerPath = path.resolve(__dirname, 'video-worker.js');
        
        if (!fs.existsSync(workerPath)) {
          throw new Error(`Worker file not found: ${workerPath}`);
        }

        console.log(` Starting worker: ${workerPath}\n`);

        const worker = new Worker(workerPath, {
          workerData: {
            requestId,
            scenes,
            effectType: effectType || 'zoom_effect',
            audio_url,
            logo_url,
            avatar_url,
            background_music_url,
            fps: this.fps,
            dirs,
          },
        });

        const timeout = setTimeout(() => {
          worker.terminate();
          this.activeRequests.delete(requestId);
          reject(new Error('Video processing timeout (30 minutes exceeded)'));
        }, 30 * 60 * 1000);

        worker.on('message', (result) => {
          clearTimeout(timeout);
          console.log('\n✅ Worker completed successfully\n');
          
          if (result.error) {
            this.activeRequests.delete(requestId);
            reject(new Error(result.error));
          } else {
            resolve({
              ...result,
              success: true,
              requestId,
            });
          }
        });

        worker.on('error', (err) => {
          clearTimeout(timeout);
          this.activeRequests.delete(requestId);
          console.error('\n❌ Worker error:', err);
          reject(err);
        });

        worker.on('exit', (code) => {
          clearTimeout(timeout);
          
          if (code !== 0) {
            this.activeRequests.delete(requestId);
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      } catch (error) {
        this.activeRequests.delete(requestId);
        reject(error);
      }
    });
  }

  async validateVideoFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Video file not found: ${filePath}`);
        return false;
      }

      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / 1024 / 1024;

      if (sizeInMB < 0.1) {
        console.warn(` Video file too small: ${sizeInMB.toFixed(2)} MB`);
        return false;
      }

      console.log(`Video file valid: ${sizeInMB.toFixed(2)} MB`);
      return true;
    } catch (error) {
      console.error('Error validating video:', error);
      return false;
    }
  }

  async getOutputVideo(requestId: string): Promise<string | null> {
    try {
      const outputDir = path.join(this.rootTempDir, requestId, 'output');
      
      if (!fs.existsSync(outputDir)) {
        return null;
      }

      const files = fs.readdirSync(outputDir);
      const videoFile = files.find(f => f.startsWith('final_') && f.endsWith('.mp4'));
      
      return videoFile ? path.join(outputDir, videoFile) : null;
    } catch (error) {
      console.error('Error getting output video:', error);
      return null;
    }
  }

  async cleanupRequest(requestId: string): Promise<boolean> {
    try {
      const requestDir = path.join(this.rootTempDir, requestId);
      
      if (!fs.existsSync(requestDir)) {
        console.warn(` Request directory not found: ${requestId}`);
        return false;
      }

      fs.rmSync(requestDir, { recursive: true, force: true });
      console.log(` Cleaned up request: ${requestId}`);
      this.activeRequests.delete(requestId);
      return true;
    } catch (error) {
      console.error('Error cleaning up request:', error);
      return false;
    }
  }

  async cleanupOldFiles(ageInHours: number = 24): Promise<number> {
    try {
      if (!fs.existsSync(this.rootTempDir)) {
        return 0;
      }

      const now = Date.now();
      const ageMs = ageInHours * 60 * 60 * 1000;
      let deletedCount = 0;

      const requestDirs = fs.readdirSync(this.rootTempDir);

      for (const requestId of requestDirs) {
        const requestDir = path.join(this.rootTempDir, requestId);
        
        if (!fs.statSync(requestDir).isDirectory()) {
          continue;
        }

        const stats = fs.statSync(requestDir);

        if (now - stats.mtimeMs > ageMs) {
          fs.rmSync(requestDir, { recursive: true, force: true });
          this.activeRequests.delete(requestId);
          deletedCount++;
          console.log(` Deleted old request: ${requestId}`);
        }
      }

      console.log(`Cleaned up ${deletedCount} old request folders`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old files:', error);
      return 0;
    }
  }

  getActiveRequestsCount(): number {
    return this.activeRequests.size;
  }

  getActiveRequests(): string[] {
    return Array.from(this.activeRequests.keys());
  }
}