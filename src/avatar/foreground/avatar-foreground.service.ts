import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  Scene, 
  AvatarConfig, 
  AvatarPosition, 
  AvatarDimensions, 
  AvatarGenerationOptions 
} from '../types';

const execPromise = promisify(exec);

export class AvatarForegroundService {
  
  async getVideoInfo(videoPath: string): Promise<AvatarDimensions> {
  try {
    const ext = path.extname(videoPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
    
    if (isImage) {
      const { stdout: dimStdout } = await execPromise(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
      );
      const [width, height] = dimStdout.trim().split('x').map(Number);
      console.log(`   📷 Image: ${width}x${height}`);
      return { width, height, duration: 0 };
    }
    
    const { stdout: dimStdout } = await execPromise(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
    );
    const [width, height] = dimStdout.trim().split('x').map(Number);
    
    const { stdout: durStdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(durStdout.trim()) || 0;
    
    console.log(`   🎥 Video: ${width}x${height}, ${duration.toFixed(1)}s`);
    return { width, height, duration };
  } catch (err: any) {
    console.error(`Failed to get video info: ${err.message}`);
    throw err;
  }
  }

  calculatePosition(
  position: string,
  canvasWidth: number,
  canvasHeight: number,
  avatarWidth: number,
  avatarHeight: number,
  margin: number,
  xOffset: number = 0,
  yOffset: number = 0
): { x: string; y: string } {
  let x: string;
  let y: string;

  switch (position) {
    case 'top-left':
      x = `${margin + xOffset}`;
      y = `${margin + yOffset}`;
      break;
    case 'top-right':
      x = `${canvasWidth - avatarWidth - margin + xOffset}`;
      y = `${margin + yOffset}`;
      break;
    case 'bottom-left':
      x = `${margin + xOffset}`;
      y = `${canvasHeight - avatarHeight - margin + yOffset}`;
      break;
    case 'bottom-right':
      x = `${canvasWidth - avatarWidth - margin + xOffset}`;
      y = `${canvasHeight - avatarHeight - margin + yOffset}`;
      break;
    case 'center':
      x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
      y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
      break;
    default:
      x = `${margin + xOffset}`;
      y = `${canvasHeight - avatarHeight - margin + yOffset}`;
  }

  return { x, y };
  }

  async createRoundedMask(
  width: number,
  height: number,
  radius: number,
  outputPath: string,
  runFfmpeg: (args: string[]) => Promise<void>
): Promise<void> {
  // Use drawbox filter to create rounded rectangle mask
  const filterComplex = `color=black:s=${width}x${height}:d=1,format=rgba,drawbox=x=0:y=0:w=${width}:h=${height}:color=white@1:t=fill`;
  
  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', filterComplex,
    '-frames:v', '1',
    '-c:v', 'png',
    outputPath
  ];
  
  await runFfmpeg(args);
  }

  async generateFixedPositionAvatar(
  avatarPath: string,
  outputPath: string,
  config: any,
  totalDuration: number,
  canvasWidth: number,
  canvasHeight: number,
  runFfmpeg: (args: string[]) => Promise<void>
): Promise<void> {
  const scale = config.scale || 0.17;
  const opacity = (config.opacity || 250) / 255;
  const margin = config.margin || 10;
  const xOffset = config.x_offset || 0;
  const yOffset = config.y_offset || 0;
  const position = config.position || 'bottom-left';

  const scaledWidth = Math.round(canvasWidth * scale);
  const scaledHeight = Math.round(canvasHeight * scale);

  const { x, y } = this.calculatePosition(
    position,
    canvasWidth,
    canvasHeight,
    scaledWidth,
    scaledHeight,
    margin,
    xOffset,
    yOffset
  );

  console.log(`   📐 Position: ${position}`);
  console.log(`   📏 Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
  console.log(`   📍 XY: (${x}, ${y})`);

  // ✅ FIXED: Use direct input with loop instead of movie filter
  const fps = 25;
  
  let filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},format=rgba`;

  if (opacity < 1.0) {
    filterComplex += `,colorchannelmixer=aa=${opacity}`;
  }

  filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

  const args = [
    '-y',
    '-stream_loop', '-1',  // Loop input indefinitely
    '-i', avatarPath,
    '-filter_complex', filterComplex,
    '-t', totalDuration.toFixed(3),
    '-r', String(fps),
    '-c:v', 'png',
    '-pix_fmt', 'rgba',
    '-an',
    outputPath
  ];

  console.log(`   🎬 Generating avatar video (${totalDuration.toFixed(2)}s)...`);
  await runFfmpeg(args);
  }

  async generateMixModeAvatar(
  avatarPath: string,
  outputPath: string,
  config: any,
  scenes: Scene[],
  totalDuration: number,
  canvasWidth: number,
  canvasHeight: number,
  runFfmpeg: (args: string[]) => Promise<void>
): Promise<void> {
  const smallScale = config.small_scale || 0.17;
  const mainScale = config.main_scale || 0.30;
  const stateDuration = config.state_duration || 7;
  const margin = config.margin || 5;
  const marginBottom = config.margin_bottom || 80;

  console.log(`   🔄 Mix mode: small → full → off`);
  console.log(`   ⏱️  State: ${stateDuration}s each`);

  const tempClips: string[] = [];
  let currentTime = 0;
  const fps = 25;

  while (currentTime < totalDuration) {
    const stateIndex = Math.floor(currentTime / stateDuration) % 3;
    const clipDuration = Math.min(stateDuration, totalDuration - currentTime);
    
    let scale: number;
    let x: string;
    let y: string;

    switch (stateIndex) {
      case 0: // small (bottom-left)
        scale = smallScale;
        x = `${margin}`;
        y = `${canvasHeight - Math.round(canvasHeight * scale) - marginBottom}`;
        break;
      case 1: // full (center)
        scale = mainScale;
        x = `${Math.round((canvasWidth - canvasWidth * scale) / 2)}`;
        y = `${Math.round((canvasHeight - canvasHeight * scale) / 2)}`;
        break;
      case 2: // off (hidden)
        scale = 0.01;
        x = '-10000';
        y = '-10000';
        break;
      default:
        scale = smallScale;
        x = `${margin}`;
        y = `${canvasHeight - Math.round(canvasHeight * scale) - marginBottom}`;
    }

    const scaledW = Math.round(canvasWidth * scale);
    const scaledH = Math.round(canvasHeight * scale);
    const clipPath = outputPath.replace('.mov', `_clip${tempClips.length}.mov`);
    tempClips.push(clipPath);

    // ✅ FIXED: Use direct input with loop instead of movie filter
    let filterComplex = `[0:v]scale=${scaledW}:${scaledH},format=rgba`;
    filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

    const args = [
      '-y',
      '-stream_loop', '-1',  // Loop input indefinitely
      '-i', avatarPath,
      '-filter_complex', filterComplex,
      '-t', clipDuration.toFixed(3),
      '-r', String(fps),
      '-c:v', 'png',
      '-pix_fmt', 'rgba',
      '-an',
      clipPath
    ];

    console.log(`   📦 State ${stateIndex}: ${clipDuration.toFixed(2)}s`);
    await runFfmpeg(args);

    currentTime += clipDuration;
  }

  // Concatenate clips
  console.log(`   🔗 Concatenating ${tempClips.length} clips...`);
  const concatList = path.join(path.dirname(outputPath), 'concat_list.txt');
  fs.writeFileSync(concatList, tempClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  await runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatList,
    '-c', 'copy',
    outputPath
  ]);

  // Cleanup
  tempClips.forEach(clip => {
    if (fs.existsSync(clip)) fs.unlinkSync(clip);
  });
  fs.unlinkSync(concatList);

  console.log(`   ✅ Mix mode complete`);
  }

  async generateAvatarForeground(
  avatarPath: string,
  scenes: Scene[],
  tempDir: string,
  avatarMode: string,
  avatarConfig: AvatarConfig,
  runFfmpeg: (args: string[]) => Promise<void>,
  canvasWidth: number = 1920,
  canvasHeight: number = 1080
): Promise<string | null> {
  console.log(`\n====== AVATAR FOREGROUND GENERATION ======`);
  console.log(`Mode: ${avatarMode}`);
  console.log(`Path: ${avatarPath}`);
  console.log(`Canvas: ${canvasWidth}x${canvasHeight}`);
  console.log(`Scenes: ${scenes.length}`);

  if (!fs.existsSync(avatarPath)) {
    throw new Error(`Avatar file not found: ${avatarPath}`);
  }

  const config = avatarConfig[avatarMode];
  if (!config) {
    throw new Error(`Invalid avatar mode: ${avatarMode}`);
  }

  console.log(`Config:`, JSON.stringify(config, null, 2));

  // Calculate total duration
  const totalDuration = scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
  
  if (!totalDuration || totalDuration <= 0) {
    throw new Error('Total duration is zero. Check scene durations.');
  }
  
  console.log(`Duration: ${totalDuration.toFixed(2)}s`);

  // Check avatar
  const avatarInfo = await this.getVideoInfo(avatarPath);
  
  if (!avatarInfo.width || !avatarInfo.height) {
    throw new Error('Failed to get avatar dimensions');
  }

  const outputPath = path.join(tempDir, `avatar_foreground_${Date.now()}.mov`);

  try {
    const isMixMode = avatarMode.includes('mix_mode') || config.states;

    if (isMixMode) {
      console.log(`🔄 MIX MODE`);
      await this.generateMixModeAvatar(
        avatarPath,
        outputPath,
        config,
        scenes,
        totalDuration,
        canvasWidth,
        canvasHeight,
        runFfmpeg
      );
    } else {
      console.log(`📍 FIXED POSITION`);
      await this.generateFixedPositionAvatar(
        avatarPath,
        outputPath,
        config,
        totalDuration,
        canvasWidth,
        canvasHeight,
        runFfmpeg
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Avatar foreground not created');
    }

    const stats = fs.statSync(outputPath);
    console.log(`✅ Generated: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   ${outputPath}`);

    return outputPath;

  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
    throw err;
  }
  }
}   