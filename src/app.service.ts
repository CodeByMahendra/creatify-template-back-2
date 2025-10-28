import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

















// import * as path from 'path';
// import * as fs from 'fs';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import { 
//   CompositorOptions 
// } from '../types';
// import { runFfmpeg } from '../../utils/ffmpeg.utils';

// const execPromise = promisify(exec);

// export class AvatarCompositorService {

//   /**
//    * Composite background video with avatar foreground and audio
//    */
//   async compositeWithAvatar(
//     options: CompositorOptions
//   ): Promise<void> {
//     const {
//       backgroundVideoPath,
//       avatarForegroundPath,
//       audioPath,
//       backgroundMusicPath,
//       outputPath,
//       requestId
//     } = options;

//     console.log('\n====== AVATAR COMPOSITION ======');
//     console.log(`🎬 Request ID: ${requestId}`);
//     console.log(`📹 Background: ${path.basename(backgroundVideoPath)}`);
//     console.log(`👤 Foreground: ${path.basename(avatarForegroundPath)}`);
//     console.log(`🎵 Audio: ${path.basename(audioPath)}`);
//     if (backgroundMusicPath) {
//       console.log(`🎶 Background Music: ${path.basename(backgroundMusicPath)}`);
//     }
//     console.log(`💾 Output: ${path.basename(outputPath)}`);

//     // Validate input files
//     await this.validateInputFiles(options);

//     // 🔍 DEBUG: Check avatar foreground properties
//     await this.debugAvatarForeground(avatarForegroundPath);

//     // Get durations for verification
//     const bgDuration = await this.getVideoDuration(backgroundVideoPath);
//     const fgDuration = await this.getVideoDuration(avatarForegroundPath);

//     console.log(`📹 Background duration: ${bgDuration.toFixed(2)}s`);
//     console.log(`👤 Foreground duration: ${fgDuration.toFixed(2)}s`);

//     // Build FFmpeg command
//     const args = this.buildCompositionArgs(options);

//     console.log('\n🎨 Compositing layers...');
//     console.log(`   Command: ffmpeg ${args.slice(0, 20).join(' ')}...`);

//     try {
//       await runFfmpeg(args);
//       console.log('✅ Composition completed successfully');
      
//       // 🔍 Verify output
//       await this.verifyOutput(outputPath);
//     } catch (error: any) {
//       console.error(`❌ Composition failed: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * 🔍 DEBUG: Check avatar foreground properties
//    */
//   private async debugAvatarForeground(avatarPath: string): Promise<void> {
//     try {
//       const { stdout } = await execPromise(
//         `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height -of json "${avatarPath}"`
//       );
      
//       const info = JSON.parse(stdout);
//       console.log('\n🔍 Avatar Foreground Info:');
//       console.log(JSON.stringify(info, null, 2));
      
//       // Check if avatar has alpha channel
//       const pixFmt = info.streams?.[0]?.pix_fmt;
//       const hasAlpha = pixFmt?.includes('rgba') || pixFmt?.includes('yuva');
//       console.log(`   Alpha channel: ${hasAlpha ? '✅ YES' : '❌ NO'} (${pixFmt})`);
      
//       if (!hasAlpha) {
//         console.warn('⚠️  WARNING: Avatar foreground does not have alpha channel!');
//       }
//     } catch (err: any) {
//       console.warn(`⚠️  Could not probe avatar: ${err.message}`);
//     }
//   }

//   /**
//    * 🔍 Verify output has correct streams
//    */
//   private async verifyOutput(outputPath: string): Promise<void> {
//     try {
//       const { stdout } = await execPromise(
//         `ffprobe -v error -show_streams -of json "${outputPath}"`
//       );
      
//       const info = JSON.parse(stdout);
//       const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
//       const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');
      
//       console.log('\n🔍 Output Verification:');
//       console.log(`   Video: ${videoStream ? '✅' : '❌'} ${videoStream?.codec_name} ${videoStream?.width}x${videoStream?.height}`);
//       console.log(`   Audio: ${audioStream ? '✅' : '❌'} ${audioStream?.codec_name}`);
//     } catch (err: any) {
//       console.warn(`⚠️  Could not verify output: ${err.message}`);
//     }
//   }

//   async compositeWithoutAvatar(
//     backgroundVideoPath: string,
//     audioPath: string,
//     backgroundMusicPath: string | null,
//     outputPath: string,
//     requestId: string
//   ): Promise<void> {
//     console.log('\n====== BACKGROUND + AUDIO COMPOSITION ======');
//     console.log(`🎬 Request ID: ${requestId}`);
//     console.log(`📹 Background: ${path.basename(backgroundVideoPath)}`);
//     console.log(`🎵 Audio: ${path.basename(audioPath)}`);
//     if (backgroundMusicPath) {
//       console.log(`🎶 Background Music: ${path.basename(backgroundMusicPath)}`);
//     }

//     const args = this.buildAudioOnlyArgs(
//       backgroundVideoPath,
//       audioPath,
//       backgroundMusicPath,
//       outputPath
//     );

//     console.log('\n🎨 Compositing background + audio...');

//     try {
//       await runFfmpeg(args);
//       console.log('✅ Background + Audio composition completed');
//     } catch (error: any) {
//       console.error(`❌ Background + Audio composition failed: ${error.message}`);
//       throw error;
//     }
//   }


//   private buildCompositionArgs(options: CompositorOptions): string[] {
//   const {
//     backgroundVideoPath,
//     avatarForegroundPath,
//     audioPath,
//     backgroundMusicPath,
//     outputPath
//   } = options;

//   console.log('\n🎨 BUILDING COMPOSITION COMMAND');
//   console.log(`   Background: ${path.basename(backgroundVideoPath)}`);
//   console.log(`   Avatar: ${path.basename(avatarForegroundPath)}`);

//   const args = [
//     '-y',
//     '-i', backgroundVideoPath,    // [0:v] [0:a] - Background
//     '-i', avatarForegroundPath,   // [1:v] - Avatar overlay (with alpha)
//     '-i', "C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav",                // [2:a] - Main audio
//   ];

//   if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
//     args.push('-i', backgroundMusicPath); // [3:a] - Background music
//   }


  
//   let filterComplex = '[0:v][1:v]overlay=0:0:format=auto[outv]';

//   // Audio mixing
//   if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
//     const audioMix = '[2:a]volume=1.0[voice];[3:a]volume=0.15[music];[voice][music]amix=inputs=2:duration=longest[aout]';
//     filterComplex = `${filterComplex};${audioMix}`;
//     args.push(
//       '-filter_complex', filterComplex,
//       '-map', '[outv]',
//       '-map', '[aout]'
//     );
//   } else {
//     args.push(
//       '-filter_complex', filterComplex,
//       '-map', '[outv]',
//       '-map', '2:a'
//     );
//   }

//   // Output settings
//   args.push(
//     '-c:v', 'libx264',
//     '-preset', 'medium',
//     '-crf', '23',
//     '-pix_fmt', 'yuv420p',
//     '-c:a', 'aac',
//     '-b:a', '192k',
//     '-movflags', '+faststart',
//     '-shortest',
//     outputPath
//   );

//   console.log(`   ✅ Composition command ready`);
//   return args;
// }
//   /**
//    * Build FFmpeg arguments for audio-only composition
//    */
//   private buildAudioOnlyArgs(
//     backgroundVideoPath: string,
//     audioPath: string,
//     backgroundMusicPath: string | null,
//     outputPath: string
//   ): string[] {
//     const args = [
//       '-y',
//       '-i', backgroundVideoPath,
//       '-i', "C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav",
//     ];

//     if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
//       args.push('-i', backgroundMusicPath);
//       args.push(
//         '-filter_complex', 
//         '[1:a]volume=1.0[a1];[2:a]volume=0.1[a2];[a1][a2]amix=inputs=2:duration=longest:dropout_transition=2[aout]',
//         '-map', '0:v:0', 
//         '-map', '[aout]'
//       );
//     } else {
//       args.push(
//         '-map', '0:v:0', 
//         '-map', '1:a:0'
//       );
//     }

//     args.push(
//       '-c:v', 'copy',
//       '-c:a', 'aac',
//       '-b:a', '192k',
//       '-ar', '44100',
//       '-shortest',
//       outputPath
//     );

//     return args;
//   }

//   /**
//    * Validate all input files exist
//    */
//   private async validateInputFiles(options: CompositorOptions): Promise<void> {
//     const { backgroundVideoPath, avatarForegroundPath, audioPath, backgroundMusicPath } = options;

//     if (!fs.existsSync(backgroundVideoPath)) {
//       throw new Error(`Background video not found: ${backgroundVideoPath}`);
//     }

//     if (!fs.existsSync(avatarForegroundPath)) {
//       throw new Error(`Avatar foreground not found: ${avatarForegroundPath}`);
//     }

//     if (!fs.existsSync(audioPath)) {
//       throw new Error(`Audio file not found: ${audioPath}`);
//     }

//     if (backgroundMusicPath && !fs.existsSync(backgroundMusicPath)) {
//       throw new Error(`Background music not found: ${backgroundMusicPath}`);
//     }

//     // Check file sizes
//     const avatarSize = fs.statSync(avatarForegroundPath).size;
//     console.log(`   Avatar foreground size: ${(avatarSize / 1024 / 1024).toFixed(2)} MB`);
    
//     if (avatarSize < 1000) {
//       throw new Error('Avatar foreground file is too small - generation may have failed');
//     }
//   }

//   /**
//    * Get video duration using ffprobe
//    */
//   private async getVideoDuration(videoPath: string): Promise<number> {
//     try {
//       const { stdout } = await execPromise(
//         `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
//       );
//       return parseFloat(stdout.trim()) || 0;
//     } catch (error: any) {
//       console.warn(`Failed to get duration for ${videoPath}: ${error.message}`);
//       return 0;
//     }
//   }

//   /**
//    * Clean up temporary files
//    */
//   async cleanupTempFiles(filePaths: string[]): Promise<void> {
//     console.log('🧹 Cleaning up temporary files...');
    
//     for (const filePath of filePaths) {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//           console.log(`   ✅ Deleted: ${path.basename(filePath)}`);
//         }
//       } catch (error: any) {
//         console.warn(`   ⚠️ Failed to delete ${filePath}: ${error.message}`);
//       }
//     }
//   }
// }

