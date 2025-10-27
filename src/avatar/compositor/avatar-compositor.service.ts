import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  CompositorOptions 
} from '../types';
import { runFfmpeg } from '../../utils/ffmpeg.utils';

const execPromise = promisify(exec);

export class AvatarCompositorService {

  /**
   * Composite background video with avatar foreground and audio
   */
  async compositeWithAvatar(
    options: CompositorOptions
  ): Promise<void> {
    const {
      backgroundVideoPath,
      avatarForegroundPath,
      audioPath,
      backgroundMusicPath,
      outputPath,
      requestId
    } = options;

    console.log('\n====== AVATAR COMPOSITION ======');
    console.log(`🎬 Request ID: ${requestId}`);
    console.log(`📹 Background: ${path.basename(backgroundVideoPath)}`);
    console.log(`👤 Foreground: ${path.basename(avatarForegroundPath)}`);
    console.log(`🎵 Audio: ${path.basename(audioPath)}`);
    if (backgroundMusicPath) {
      console.log(`🎶 Background Music: ${path.basename(backgroundMusicPath)}`);
    }
    console.log(`💾 Output: ${path.basename(outputPath)}`);

    // Validate input files
    await this.validateInputFiles(options);

    // Get durations for verification
    const bgDuration = await this.getVideoDuration(backgroundVideoPath);
    const fgDuration = await this.getVideoDuration(avatarForegroundPath);

    console.log(`📹 Background duration: ${bgDuration.toFixed(2)}s`);
    console.log(`👤 Foreground duration: ${fgDuration.toFixed(2)}s`);

    // Build FFmpeg command
    const args = this.buildCompositionArgs(options);

    console.log('\n🎨 Compositing layers...');
    console.log(`   Command: ffmpeg ${args.join(' ')}`);

    try {
      await runFfmpeg(args);
      console.log('✅ Composition completed successfully');
    } catch (error: any) {
      console.error(`❌ Composition failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Composite background video with audio only (no avatar)
   */
  async compositeWithoutAvatar(
    backgroundVideoPath: string,
    audioPath: string,
    backgroundMusicPath: string | null,
    outputPath: string,
    requestId: string
  ): Promise<void> {
    console.log('\n====== BACKGROUND + AUDIO COMPOSITION ======');
    console.log(`🎬 Request ID: ${requestId}`);
    console.log(`📹 Background: ${path.basename(backgroundVideoPath)}`);
    console.log(`🎵 Audio: ${path.basename(audioPath)}`);
    if (backgroundMusicPath) {
      console.log(`🎶 Background Music: ${path.basename(backgroundMusicPath)}`);
    }

    const args = this.buildAudioOnlyArgs(
      backgroundVideoPath,
      audioPath,
      backgroundMusicPath,
      outputPath
    );

    console.log('\n🎨 Compositing background + audio...');
    console.log(`   Command: ffmpeg ${args.join(' ')}`);

    try {
      await runFfmpeg(args);
      console.log('✅ Background + Audio composition completed');
    } catch (error: any) {
      console.error(`❌ Background + Audio composition failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build FFmpeg arguments for full composition (background + avatar + audio)
   */
  private buildCompositionArgs(options: CompositorOptions): string[] {
    const {
      backgroundVideoPath,
      avatarForegroundPath,
      audioPath,
      backgroundMusicPath,
      outputPath
    } = options;

    const args = [
      '-y',
      '-i', backgroundVideoPath,
      '-i', avatarForegroundPath,
      '-i', audioPath
    ];

    // Add background music if provided
    if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
      args.push('-i', backgroundMusicPath);
    }

    // Build filter complex
    let filterComplex = '[0:v][1:v]overlay=0:0:shortest=1[outv]';
    let audioFilter = '';

    if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
      // Mix main audio with background music
      audioFilter = '[2:a]volume=1.0[a1]; [3:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest[aout]';
      args.push('-filter_complex', `${filterComplex};${audioFilter}`);
      args.push('-map', '[outv]', '-map', '[aout]');
    } else {
      // Use main audio only
      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]', '-map', '2:a:0');
    }

    // Output settings
    args.push(
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      outputPath
    );

    return args;
  }

  /**
   * Build FFmpeg arguments for audio-only composition
   */
  private buildAudioOnlyArgs(
    backgroundVideoPath: string,
    audioPath: string,
    backgroundMusicPath: string | null,
    outputPath: string
  ): string[] {
    const args = [
      '-y',
      '-i', backgroundVideoPath,
      '-i', audioPath
    ];

    if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
      args.push('-i', backgroundMusicPath);
      args.push(
        '-filter_complex', 
        '[1:a]volume=1.0[a1]; [2:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest[aout]',
        '-map', '0:v:0', '-map', '[aout]'
      );
    } else {
      args.push('-map', '0:v:0', '-map', '1:a:0');
    }

    args.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      outputPath
    );

    return args;
  }

  /**
   * Validate all input files exist
   */
  private async validateInputFiles(options: CompositorOptions): Promise<void> {
    const { backgroundVideoPath, avatarForegroundPath, audioPath, backgroundMusicPath } = options;

    if (!fs.existsSync(backgroundVideoPath)) {
      throw new Error(`Background video not found: ${backgroundVideoPath}`);
    }

    if (!fs.existsSync(avatarForegroundPath)) {
      throw new Error(`Avatar foreground not found: ${avatarForegroundPath}`);
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    if (backgroundMusicPath && !fs.existsSync(backgroundMusicPath)) {
      throw new Error(`Background music not found: ${backgroundMusicPath}`);
    }
  }

  /**
   * Get video duration using ffprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    try {
      const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
      );
      return parseFloat(stdout.trim()) || 0;
    } catch (error: any) {
      console.warn(`Failed to get duration for ${videoPath}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(filePaths: string[]): Promise<void> {
    console.log('🧹 Cleaning up temporary files...');
    
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`   ✅ Deleted: ${path.basename(filePath)}`);
        }
      } catch (error: any) {
        console.warn(`   ⚠️ Failed to delete ${filePath}: ${error.message}`);
      }
    }
  }
}
