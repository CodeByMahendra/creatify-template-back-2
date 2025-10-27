import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (err: any) {
    console.error(`Failed to get duration: ${err.message}`);
    return 0;
  }
}


export async function compositeBackgroundAndForeground(
  backgroundVideoPath: string,
  avatarForegroundPath: string,
  outputPath: string,
  runFfmpeg: (args: string[]) => Promise<void>,
  requestId: string
): Promise<void> {
  
  console.log('\n====== VIDEO COMPOSITION ======');
  console.log(`🎬 Request ID: ${requestId}`);
  console.log(`📹 Background: ${path.basename(backgroundVideoPath)}`);
  console.log(`👤 Foreground: ${path.basename(avatarForegroundPath)}`);
  console.log(`💾 Output: ${path.basename(outputPath)}`);
  
  // Verify input files
  if (!fs.existsSync(backgroundVideoPath)) {
    throw new Error(`Background video not found: ${backgroundVideoPath}`);
  }
  
  if (!fs.existsSync(avatarForegroundPath)) {
    throw new Error(`Avatar foreground video not found: ${avatarForegroundPath}`);
  }
  
  const bgStats = fs.statSync(backgroundVideoPath);
  const fgStats = fs.statSync(avatarForegroundPath);
  
  console.log(`   Background size: ${(bgStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Foreground size: ${(fgStats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Get durations
  const bgDuration = await getVideoDuration(backgroundVideoPath);
  const fgDuration = await getVideoDuration(avatarForegroundPath);
  
  console.log(`   Background duration: ${bgDuration.toFixed(2)}s`);
  console.log(`   Foreground duration: ${fgDuration.toFixed(2)}s`);
  
  // ✅ Overlay avatar on background with alpha blending
  const filterComplex = `[0:v][1:v]overlay=format=auto:shortest=1[outv]`;
  
  const args: string[] = [
    '-y',
    '-i', backgroundVideoPath, 
    '-i', avatarForegroundPath, 
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '0:a?', 
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-shortest',  
    outputPath
  ];
  
  console.log('\n🎨 Compositing layers...');
  console.log(`   Filter: ${filterComplex}`);
  
  try {
    await runFfmpeg(args);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Composite video not created');
    }
    
    const outputStats = fs.statSync(outputPath);
    const outputDuration = await getVideoDuration(outputPath);
    
    console.log(`✅ Composition complete: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Duration: ${outputDuration.toFixed(2)}s`);
    console.log(`   Output: ${outputPath}`);
    
  } catch (err: any) {
    console.error(`❌ Composition failed: ${err.message}`);
    throw new Error(`Video composition failed: ${err.message}`);
  }
}

/**
 * Alternative: Merge with audio mixing if needed
 */
export async function compositeWithAudioMixing(
  backgroundVideoPath: string,
  avatarForegroundPath: string,
  audioPath: string,
  backgroundMusicPath: string | null,
  outputPath: string,
  runFfmpeg: (args: string[]) => Promise<void>,
  requestId: string
): Promise<void> {
  
  console.log('\n====== VIDEO COMPOSITION WITH AUDIO ======');
  console.log(`🎬 Request ID: ${requestId}`);
  
  // Verify files
  if (!fs.existsSync(backgroundVideoPath)) {
    throw new Error(`Background video not found: ${backgroundVideoPath}`);
  }
  if (!fs.existsSync(avatarForegroundPath)) {
    throw new Error(`Avatar foreground not found: ${avatarForegroundPath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  
  // Get durations for verification
  const bgDuration = await getVideoDuration(backgroundVideoPath);
  const fgDuration = await getVideoDuration(avatarForegroundPath);
  
  console.log(`📹 Background: ${bgDuration.toFixed(2)}s`);
  console.log(`👤 Foreground: ${fgDuration.toFixed(2)}s`);
  
  // ✅ IMPORTANT: Use shortest=1 in overlay
  let filterComplex = '[0:v][1:v]overlay=0:0:shortest=1[outv]';
  let audioFilter = '';
  
  const args: string[] = [
    '-y',
    '-i', backgroundVideoPath,
    '-i', avatarForegroundPath,
    '-i', audioPath
  ];
  
  if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
    console.log('🎵 Including background music');
    args.push('-i', backgroundMusicPath);
    
    // Mix main audio + background music
    audioFilter = '[2:a]volume=1.0[a1]; [3:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest:dropout_transition=3[aout]';
    filterComplex += `;${audioFilter}`;
    
    args.push(
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[aout]'
    );
  } else {
    console.log('🔊 Using main audio only');
    args.push(
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '2:a'
    );
  }
  
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',  // ✅ Stop at shortest input
    outputPath
  );
  
  console.log('🎨 Compositing with audio...');
  console.log(`   Video filter: ${filterComplex.substring(0, 100)}...`);
  
  try {
    await runFfmpeg(args);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Final composite not created');
    }
    
    const outputStats = fs.statSync(outputPath);
    const outputDuration = await getVideoDuration(outputPath);
    
    console.log(`✅ Final composition: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Duration: ${outputDuration.toFixed(2)}s`);
    console.log(`   Path: ${outputPath}`);
    
  } catch (err: any) {
    console.error(`❌ Composition failed: ${err.message}`);
    throw new Error(`Video composition with audio failed: ${err.message}`);
  }
}