

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
      case 'top-center':
        x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
        y = `${margin + yOffset}`;
        break;
      case 'bottom-center':
        x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
        y = `${canvasHeight - avatarHeight - margin + yOffset}`;
        break;
      case 'left':
        x = `${margin + xOffset}`;
        y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
        break;
      case 'right':
        x = `${canvasWidth - avatarWidth - margin + xOffset}`;
        y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
        break;
      default:
        x = `${margin + xOffset}`;
        y = `${canvasHeight - avatarHeight - margin + yOffset}`;
    }

    return { x, y };
  }

  /**
   * 🎭 GENERATE MASK FROM AVATAR (Python equivalent)
   * Creates a binary mask by removing background color
   */
  async generateAvatarMask(
    avatarPath: string,
    tempDir: string,
    chromaColor: string = 'white',
    runFfmpeg: (args: string[]) => Promise<void>
  ): Promise<string> {
    console.log(`   🎭 Generating mask from avatar...`);
    
    const rawMaskPath = path.join(tempDir, `raw_mask_${Date.now()}.png`);
    const cleanedMaskPath = path.join(tempDir, `cleaned_mask_${Date.now()}.png`);

    // Step 1: Extract first frame and remove background to create raw mask
    let chromaFilter = '';
    if (chromaColor.toLowerCase() === 'white') {
      chromaFilter = `colorkey=white:0.3:0.2`;
    } else if (chromaColor.toLowerCase() === 'green') {
      chromaFilter = `colorkey=green:0.3:0.2`;
    } else {
      chromaFilter = `colorkey=${chromaColor}:0.3:0.2`;
    }

    // Create raw mask - white where person is, black where background is
    const rawMaskArgs = [
      '-y',
      '-i', avatarPath,
      '-vf', `${chromaFilter},format=gray,geq=lum='if(gt(lum(X,Y),128),255,0)'`,
      '-frames:v', '1',
      '-c:v', 'png',
      rawMaskPath
    ];

    await runFfmpeg(rawMaskArgs);
    console.log(`   ✅ Raw mask created`);

    // Step 2: Clean the mask (erode + blur) - Python cv2 equivalent
    const cleanMaskArgs = [
      '-y',
      '-i', rawMaskPath,
      '-vf', [
        // Threshold to binary
        'geq=lum=\'if(gt(lum(X,Y),128),255,0)\'',
        // Erode (equivalent to cv2.erode with 3x3 kernel)
        'erosion=threshold0=128:coordinates=11:coordinates=31:coordinates=51',
        // Gaussian blur (equivalent to cv2.GaussianBlur with 7x7 kernel)
        'gblur=sigma=2',
        // Normalize
        'normalize=independence=0'
      ].join(','),
      '-frames:v', '1',
      '-c:v', 'png',
      cleanedMaskPath
    ];

    await runFfmpeg(cleanMaskArgs);
    console.log(`   ✅ Cleaned mask created`);

    // Cleanup raw mask
    if (fs.existsSync(rawMaskPath)) {
      fs.unlinkSync(rawMaskPath);
    }

    return cleanedMaskPath;
  }

  /**
   * 🎯 DETECT AND CROP BODY PARTS (Advanced)
   * Automatically detects person boundaries and crops tightly
   */
  async detectBodyBounds(
    avatarPath: string,
    tempDir: string,
    chromaColor: string,
    runFfmpeg: (args: string[]) => Promise<void>
  ): Promise<{ cropFilter: string; detectedWidth: number; detectedHeight: number }> {
    console.log(`   🎯 Detecting body boundaries...`);

    const detectionOutput = path.join(tempDir, `detection_${Date.now()}.txt`);
    
    // Use cropdetect to find actual content boundaries
    let chromaFilter = '';
    if (chromaColor.toLowerCase() === 'white') {
      chromaFilter = `colorkey=white:0.3:0.2,`;
    } else if (chromaColor.toLowerCase() === 'green') {
      chromaFilter = `colorkey=green:0.3:0.2,`;
    } else {
      chromaFilter = `colorkey=${chromaColor}:0.3:0.2,`;
    }

    const detectArgs = [
      '-y',
      '-i', avatarPath,
      '-vf', `${chromaFilter}cropdetect=24:16:0`,
      '-frames:v', '10', // Analyze first 10 frames
      '-f', 'null',
      '-'
    ];

    try {
      const { stderr } = await execPromise(
        `ffmpeg ${detectArgs.join(' ')} 2>&1 | grep "crop=" | tail -1`
      );

      // Parse cropdetect output: crop=w:h:x:y
      const cropMatch = stderr.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
      
      if (cropMatch) {
        const [, w, h, x, y] = cropMatch.map(Number);
        console.log(`   ✅ Detected bounds: ${w}x${h} at (${x},${y})`);
        
        // Add 10% padding around detected area
        const paddingW = Math.round(w * 0.1);
        const paddingH = Math.round(h * 0.1);
        
        return {
          cropFilter: `crop=${w + paddingW}:${h + paddingH}:${Math.max(0, x - paddingW/2)}:${Math.max(0, y - paddingH/2)}`,
          detectedWidth: w + paddingW,
          detectedHeight: h + paddingH
        };
      }
    } catch (err) {
      console.log(`   ⚠️  Auto-detection failed, using full frame`);
    }

    return {
      cropFilter: '',
      detectedWidth: 0,
      detectedHeight: 0
    };
  }

 



// async generateMaskBasedAvatar(
//   avatarPath: string,
//   maskPath: string | null,
//   outputPath: string,
//   config: any,
//   totalDuration: number,
//   canvasWidth: number,
//   canvasHeight: number,
//   runFfmpeg: (args: string[]) => Promise<void>,
//   tempDir: string
// ): Promise<void> {
//   const scale = config.scale || 0.17;
//   const opacity = (config.opacity || 250) / 255;
//   const margin = config.margin || 10;
//   const xOffset = config.x_offset || 0;
//   const yOffset = config.y_offset || 0;
//   const position = config.position || 'bottom-right';

//   let scaledWidth = Math.round(canvasWidth * scale);
//   let scaledHeight = Math.round(canvasHeight * scale);

//   console.log(`\n🎭 MASK-BASED AVATAR GENERATION`);
//   console.log(`   📐 Canvas: ${canvasWidth}x${canvasHeight}`);
//   console.log(`   📏 Avatar Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
//   console.log(`   📍 Position: ${position}`);
//   console.log(`   🎭 Mask: ${maskPath ? '✅' : '❌ (will use chroma key)'}`);
//   console.log(`   ⏱️  Duration: ${totalDuration.toFixed(2)}s`);

//   const fps = 30;

//   // Calculate position
//   const { x, y } = this.calculatePosition(
//     position,
//     canvasWidth,
//     canvasHeight,
//     scaledWidth,
//     scaledHeight,
//     margin,
//     xOffset,
//     yOffset
//   );

//   console.log(`   📍 Calculated Position: x=${x}, y=${y}`);

//   // ============================================
//   // METHOD 1: USE MASK (if provided)
//   // ============================================
//   if (maskPath && fs.existsSync(maskPath)) {
//     console.log(`   🎭 Using PROVIDED MASK`);

//     const filterComplex = [
//       // Scale both avatar and mask to same size
//       `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease[avatar]`,
//       `[1:v]scale=${scaledWidth}:${scaledHeight}[mask]`,
      
//       // Apply mask: Use mask as alpha channel
//       `[avatar][mask]alphamerge[masked]`,
      
//       // Apply opacity if needed
//       opacity < 1.0 ? `[masked]colorchannelmixer=aa=${opacity}[faded]` : `[masked]null[faded]`,
      
//       // Create transparent canvas
//       `color=black@0.0:s=${canvasWidth}x${canvasHeight}:d=${totalDuration}:r=${fps}[canvas]`,
      
//       // Overlay on canvas
//       `[canvas][faded]overlay=x=${x}:y=${y}:format=auto:shortest=0`
//     ].filter(Boolean).join(';');

//     const args = [
//       '-y',
//       '-stream_loop', '-1', '-i', avatarPath,  // [0:v] Avatar
//       '-loop', '1', '-i', maskPath,             // [1:v] Mask
//       '-filter_complex', filterComplex,
//       '-t', totalDuration.toFixed(3),
//       '-r', String(fps),
//       '-c:v', 'prores_ks',
//       '-profile:v', '4',
//       '-pix_fmt', 'yuva444p10le',
//       '-an',
//       outputPath
//     ];

//     console.log(`   🎬 Running FFmpeg with mask...`);
//     await runFfmpeg(args);
//   } 
//   // ============================================
//   // METHOD 2: CHROMA KEY (if no mask)
//   // ============================================
//   else {
//     console.log(`   🔥 Using CHROMA KEY (white background removal)`);

//     const filterComplex = [
//       // Scale avatar
//       `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease[scaled]`,
      
//       // Remove white background + despill
//       `[scaled]colorkey=0xFFFFFF:0.3:0.2,despill=type=0[keyed]`,
      
//       // Force RGBA format
//       `[keyed]format=rgba[rgba]`,
      
//       // Apply opacity
//       opacity < 1.0 ? `[rgba]colorchannelmixer=aa=${opacity}[faded]` : `[rgba]null[faded]`,
      
//       // Create transparent canvas
//       `color=black@0.0:s=${canvasWidth}x${canvasHeight}:d=${totalDuration}:r=${fps}[canvas]`,
      
//       // Overlay
//       `[canvas][faded]overlay=x=${x}:y=${y}:format=auto:shortest=0`
//     ].join(';');

//     const args = [
//       '-y',
//       '-stream_loop', '-1',
//       '-i', avatarPath,
//       '-filter_complex', filterComplex,
//       '-t', totalDuration.toFixed(3),
//       '-r', String(fps),
//       '-c:v', 'prores_ks',
//       '-profile:v', '4',
//       '-pix_fmt', 'yuva444p10le',
//       '-an',
//       outputPath
//     ];

//     console.log(`   🎬 Running FFmpeg with chroma key...`);
//     await runFfmpeg(args);
//   }

//   // Verify output
//   if (!fs.existsSync(outputPath)) {
//     throw new Error('❌ Avatar foreground was NOT created!');
//   }

//   const stats = fs.statSync(outputPath);
//   console.log(`   ✅ Avatar foreground created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

//   if (stats.size < 100000) {
//     throw new Error('❌ Avatar foreground file is too small - generation failed!');
//   }
// }

/**
 * 🎭 GENERATE MASK-BASED AVATAR (UPDATED - Works with pre-processed transparent avatar)
 * Now accepts avatar that already has background removed
 */
async generateMaskBasedAvatar(
  avatarPath: string,
  maskPath: string | null,
  outputPath: string,
  config: any,
  totalDuration: number,
  canvasWidth: number,
  canvasHeight: number,
  runFfmpeg: (args: string[]) => Promise<void>,
  tempDir: string
): Promise<void> {
  const scale = config.scale || 0.17;
  const opacity = (config.opacity || 250) / 255;
  const margin = config.margin || 10;
  const xOffset = config.x_offset || 0;
  const yOffset = config.y_offset || 0;
  const position = config.position || 'bottom-right';
  const removeBackground = config.remove_background || false;

  let scaledWidth = Math.round(canvasWidth * scale);
  let scaledHeight = Math.round(canvasHeight * scale);

  console.log(`\n🎭 MASK-BASED AVATAR GENERATION (UPDATED)`);
  console.log(`   📐 Canvas: ${canvasWidth}x${canvasHeight}`);
  console.log(`   📏 Avatar Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
  console.log(`   📍 Position: ${position}`);
  console.log(`   🎭 Remove Background: ${removeBackground}`);
  console.log(`   🎭 External Mask: ${maskPath ? '✅' : '❌'}`);
  console.log(`   ⏱️  Duration: ${totalDuration.toFixed(2)}s`);

  const fps = 30;

  // Calculate position
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

  console.log(`   📍 Calculated Position: x=${x}, y=${y}`);

  // Check if avatar is already transparent (processed in saveAssets)
  const avatarExt = path.extname(avatarPath).toLowerCase();
  const isPreProcessed = avatarPath.includes('avatar_processed') || 
                         avatarExt === '.png' || 
                         (avatarExt === '.mov' && removeBackground);

  // ============================================
  // METHOD 1: USE EXTERNAL MASK (if provided)
  // ============================================
  if (maskPath && fs.existsSync(maskPath)) {
    console.log(`   🎭 Using EXTERNAL MASK`);

    const filterComplex = [
      // Scale both avatar and mask to same size
      `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease[avatar]`,
      `[1:v]scale=${scaledWidth}:${scaledHeight}[mask]`,
      
      // Apply mask: Use mask as alpha channel
      `[avatar][mask]alphamerge[masked]`,
      
      // Apply opacity if needed
      opacity < 1.0 ? `[masked]colorchannelmixer=aa=${opacity}[faded]` : `[masked]null[faded]`,
      
      // Create transparent canvas
      `color=black@0.0:s=${canvasWidth}x${canvasHeight}:d=${totalDuration}:r=${fps}[canvas]`,
      
      // Overlay on canvas
      `[canvas][faded]overlay=x=${x}:y=${y}:format=auto:shortest=0`
    ].filter(Boolean).join(';');

    const args = [
      '-y',
      '-stream_loop', '-1', '-i', avatarPath,  // [0:v] Avatar
      '-loop', '1', '-i', maskPath,             // [1:v] Mask
      '-filter_complex', filterComplex,
      '-t', totalDuration.toFixed(3),
      '-r', String(fps),
      '-c:v', 'prores_ks',
      '-profile:v', '4',
      '-pix_fmt', 'yuva444p10le',
      '-an',
      outputPath
    ];

    console.log(`   🎬 Running FFmpeg with external mask...`);
    await runFfmpeg(args);
  } 
  // ============================================
  // METHOD 2: USE PRE-PROCESSED TRANSPARENT AVATAR
  // ============================================
  else if (isPreProcessed) {
    console.log(`   ✨ Using PRE-PROCESSED TRANSPARENT AVATAR`);
    console.log(`   ℹ️  Avatar already has background removed in saveAssets`);

    const filterComplex = [
      // Scale avatar (already transparent)
      `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease[scaled]`,
      
      // Ensure RGBA format
      `[scaled]format=rgba[rgba]`,
      
      // Apply opacity
      opacity < 1.0 ? `[rgba]colorchannelmixer=aa=${opacity}[faded]` : `[rgba]null[faded]`,
      
      // Create transparent canvas
      `color=black@0.0:s=${canvasWidth}x${canvasHeight}:d=${totalDuration}:r=${fps}[canvas]`,
      
      // Overlay
      `[canvas][faded]overlay=x=${x}:y=${y}:format=auto:shortest=0`
    ].filter(Boolean).join(';');

    const args = [
      '-y',
      '-stream_loop', '-1',
      '-i', avatarPath,
      '-filter_complex', filterComplex,
      '-t', totalDuration.toFixed(3),
      '-r', String(fps),
      '-c:v', 'prores_ks',
      '-profile:v', '4',
      '-pix_fmt', 'yuva444p10le',
      '-an',
      outputPath
    ];

    console.log(`   🎬 Running FFmpeg with transparent avatar...`);
    await runFfmpeg(args);
  }
  // ============================================
  // METHOD 3: CHROMA KEY (fallback - if avatar not pre-processed)
  // ============================================
  else {
    console.log(`   🔥 Using CHROMA KEY (fallback - avatar not pre-processed)`);
    console.warn(`   ⚠️  Consider pre-processing avatar in saveAssets for better quality`);

    const chromaColor = config.chroma_color || 'white';
    let chromaFilter = '';
    
    if (chromaColor.toLowerCase() === 'white') {
      chromaFilter = 'colorkey=0xFFFFFF:0.3:0.2';
    } else if (chromaColor.toLowerCase() === 'green') {
      chromaFilter = 'colorkey=0x00FF00:0.3:0.2';
    } else {
      chromaFilter = `colorkey=${chromaColor}:0.3:0.2`;
    }

    const filterComplex = [
      // Scale avatar
      `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease[scaled]`,
      
      // Remove background + despill
      `[scaled]${chromaFilter},despill=type=0[keyed]`,
      
      // Force RGBA format
      `[keyed]format=rgba[rgba]`,
      
      // Apply opacity
      opacity < 1.0 ? `[rgba]colorchannelmixer=aa=${opacity}[faded]` : `[rgba]null[faded]`,
      
      // Create transparent canvas
      `color=black@0.0:s=${canvasWidth}x${canvasHeight}:d=${totalDuration}:r=${fps}[canvas]`,
      
      // Overlay
      `[canvas][faded]overlay=x=${x}:y=${y}:format=auto:shortest=0`
    ].join(';');

    const args = [
      '-y',
      '-stream_loop', '-1',
      '-i', avatarPath,
      '-filter_complex', filterComplex,
      '-t', totalDuration.toFixed(3),
      '-r', String(fps),
      '-c:v', 'prores_ks',
      '-profile:v', '4',
      '-pix_fmt', 'yuva444p10le',
      '-an',
      outputPath
    ];

    console.log(`   🎬 Running FFmpeg with chroma key...`);
    await runFfmpeg(args);
  }

  // Verify output
  if (!fs.existsSync(outputPath)) {
    throw new Error('❌ Avatar foreground was NOT created!');
  }

  const stats = fs.statSync(outputPath);
  console.log(`   ✅ Avatar foreground created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  if (stats.size < 100000) {
    throw new Error('❌ Avatar foreground file is too small - generation failed!');
  }
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
    const cornerRadius = config.corner_radius || 0;
    const removeBackground = config.remove_background || false;
    const chromaColor = config.chroma_color || 'white';
    const detectBodyParts = (config.detect_body_parts ?? false) || removeBackground;
    const advancedCropping = (config.advanced_cropping ?? false);
    const effectiveCornerRadius = removeBackground ? 0 : cornerRadius;

    let scaledWidth = Math.round(canvasWidth * scale);
    let scaledHeight = Math.round(canvasHeight * scale);

    console.log(`   📐 Position: ${position}`);
    console.log(`   📏 Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
    console.log(`   🔘 Corner Radius: ${cornerRadius} (effective: ${effectiveCornerRadius})`);
    console.log(`   🎭 Remove Background: ${removeBackground}`);

    const fps = 25;
    let filterComplex = '';
    let backgroundRemovalFilter = '';
    let bodyDetectionFilter = '';
    
    if (removeBackground) {
      console.log(`   🔥 Applying chroma key removal for ${chromaColor} background`);
      
      if (chromaColor.toLowerCase() === 'white') {
        backgroundRemovalFilter = `colorkey=white:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      } else if (chromaColor.toLowerCase() === 'green') {
        backgroundRemovalFilter = `colorkey=green:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      } else {
        backgroundRemovalFilter = `colorkey=${chromaColor}:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      }
    }

    if (detectBodyParts) {
      console.log(`   🎯 Applying body part detection and cropping`);
      
      if (advancedCropping) {
        bodyDetectionFilter = `cropdetect=24:16:0,smartblur=1.5:0.5:0,crop=iw*0.8:ih*0.8:(iw-iw*0.8)/2:(ih-ih*0.8)/2,`;
      } else {
        bodyDetectionFilter = `cropdetect=24:16:0,`;
      }
    }

    if (effectiveCornerRadius >= 100) {
      console.log(`   ⭕ Creating PERFECT CIRCLE`);
      
      const size = Math.min(scaledWidth, scaledHeight);
      scaledWidth = size;
      scaledHeight = size;
      
      const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
      const radius = size / 2;
      const centerX = radius;
      const centerY = radius;

      filterComplex = `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,` +
        `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
        bodyDetectionFilter + backgroundRemovalFilter +
        `format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),255,0)',format=rgba`;

      if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
      filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

    } else if (effectiveCornerRadius > 0) {
      const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
      filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba`;
      if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
      filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

    } else {
      const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
      filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba`;
      if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
      filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;
    }

    const args = ['-y', '-stream_loop', '-1', '-i', avatarPath, '-filter_complex', filterComplex,
      '-t', totalDuration.toFixed(3), '-r', String(fps), '-c:v', 'png', '-pix_fmt', 'rgba', '-an', outputPath];

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
    const removeBackground = config.remove_background || false;
    const chromaColor = config.chroma_color || 'white';
    const detectBodyParts = config.detect_body_parts || false;
    const advancedCropping = config.advanced_cropping || false;
    const marginBottom = config.margin_bottom || 80;
    const cornerRadius = config.corner_radius || 0;
    const effectiveCornerRadius = removeBackground ? 0 : cornerRadius;

    let backgroundRemovalFilter = '';
    let bodyDetectionFilter = '';
    
    if (removeBackground) {
      if (chromaColor.toLowerCase() === 'white') {
        backgroundRemovalFilter = `colorkey=white:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      } else if (chromaColor.toLowerCase() === 'green') {
        backgroundRemovalFilter = `colorkey=green:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      } else {
        backgroundRemovalFilter = `colorkey=${chromaColor}:0.3:0.2,unsharp=5:5:0.8:3:3:0.4,`;
      }
    }

    if (detectBodyParts) {
      if (advancedCropping) {
        bodyDetectionFilter = `cropdetect=24:16:0,smartblur=1.5:0.5:0,crop=iw*0.8:ih*0.8:(iw-iw*0.8)/2:(ih-ih*0.8)/2,`;
      } else {
        bodyDetectionFilter = `cropdetect=24:16:0,`;
      }
    }

    const tempClips: string[] = [];
    let currentTime = 0;
    const fps = 25;

    while (currentTime < totalDuration) {
      const stateIndex = Math.floor(currentTime / stateDuration) % 3;
      const clipDuration = Math.min(stateDuration, totalDuration - currentTime);
      
      let scale: number, baseX: number, baseY: number;
      switch (stateIndex) {
        case 0: scale = smallScale; baseX = margin; baseY = canvasHeight - Math.round(canvasHeight * scale) - marginBottom; break;
        case 1: scale = mainScale; baseX = Math.round((canvasWidth - canvasWidth * scale) / 2); baseY = Math.round((canvasHeight - canvasHeight * scale) / 2); break;
        case 2: scale = 0.01; baseX = -10000; baseY = -10000; break;
        default: scale = smallScale; baseX = margin; baseY = canvasHeight - Math.round(canvasHeight * scale) - marginBottom;
      }

      let scaledW = Math.round(canvasWidth * scale);
      let scaledH = Math.round(canvasHeight * scale);
      const clipPath = outputPath.replace('.mov', `_clip${tempClips.length}.mov`);
      tempClips.push(clipPath);

      let filterComplex = '';
      if (effectiveCornerRadius >= 100 && stateIndex !== 2) {
        const size = Math.min(scaledW, scaledH);
        const radius = size / 2; const centerX = radius; const centerY = radius;
        filterComplex = `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
          bodyDetectionFilter + backgroundRemovalFilter +
          `format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),255,0)',format=rgba,pad=${canvasWidth}:${canvasHeight}:${baseX}:${baseY}:color=#00000000`;
      } else {
        filterComplex = `[0:v]scale=${scaledW}:${scaledH},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba,pad=${canvasWidth}:${canvasHeight}:${baseX}:${baseY}:color=#00000000`;
      }

      await runFfmpeg(['-y', '-stream_loop', '-1', '-i', avatarPath, '-filter_complex', filterComplex, '-t', clipDuration.toFixed(3), '-r', String(fps), '-c:v', 'png', '-pix_fmt', 'rgba', '-an', clipPath]);
      currentTime += clipDuration;
    }

    const concatList = path.join(path.dirname(outputPath), 'concat_list.txt');
    fs.writeFileSync(concatList, tempClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', outputPath]);
    tempClips.forEach(clip => { if (fs.existsSync(clip)) fs.unlinkSync(clip); });
    fs.unlinkSync(concatList);
  }


  async generateAvatarForeground(
    avatarPath: string,
    scenes: Scene[],
    tempDir: string,
    avatarMode: string,
    avatarConfig: AvatarConfig,
    runFfmpeg: (args: string[]) => Promise<void>,
    canvasWidth: number = 1920,
    canvasHeight: number = 1080,
    maskPath?: string
  ): Promise<string | null> {
    console.log(`\n====== AVATAR FOREGROUND GENERATION ======`);
    console.log(`Mode: ${avatarMode}`);
    console.log(`Path: ${avatarPath}`);

    if (!fs.existsSync(avatarPath)) {
      throw new Error(`Avatar file not found: ${avatarPath}`);
    }

    const config = avatarConfig[avatarMode];
    if (!config) {
      throw new Error(`Invalid avatar mode: ${avatarMode}`);
    }

    const totalDuration = scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
    if (!totalDuration || totalDuration <= 0) {
      throw new Error('Total duration is zero.');
    }

    const avatarInfo = await this.getVideoInfo(avatarPath);
    if (!avatarInfo.width || !avatarInfo.height) {
      throw new Error('Failed to get avatar dimensions');
    }

    const outputPath = path.join(tempDir, `avatar_foreground_${Date.now()}.mov`);

    try {
      const isMixMode = avatarMode.includes('mix_mode') || config.states;
      const isMaskMode = avatarMode.includes('mask-based') || config.use_mask;

      if (isMaskMode) {
        console.log(`🎭 MASK-BASED MODE (Python equivalent)`);
        await this.generateMaskBasedAvatar(
          avatarPath, 
          maskPath || null, 
          outputPath, 
          config, 
          totalDuration, 
          canvasWidth, 
          canvasHeight, 
          runFfmpeg,
          tempDir
        );
      } else if (isMixMode) {
        console.log(`🔄 MIX MODE`);
        await this.generateMixModeAvatar(avatarPath, outputPath, config, scenes, totalDuration, canvasWidth, canvasHeight, runFfmpeg);
      } else {
        console.log(`📍 FIXED POSITION`);
        await this.generateFixedPositionAvatar(avatarPath, outputPath, config, totalDuration, canvasWidth, canvasHeight, runFfmpeg);
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Avatar foreground not created');
      }

      const stats = fs.statSync(outputPath);
      console.log(`✅ Generated: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return outputPath;

    } catch (err: any) {
      console.error(`❌ Failed: ${err.message}`);
      throw err;
    }
  }
}


// import * as path from 'path';
// import * as fs from 'fs';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import { 
//   Scene, 
//   AvatarConfig, 
//   AvatarPosition, 
//   AvatarDimensions, 
//   AvatarGenerationOptions 
// } from '../types';

// const execPromise = promisify(exec);

// export class AvatarForegroundService {
  
//   async getVideoInfo(videoPath: string): Promise<AvatarDimensions> {
//     try {
//       const ext = path.extname(videoPath).toLowerCase();
//       const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
      
//       if (isImage) {
//         const { stdout: dimStdout } = await execPromise(
//           `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
//         );
//         const [width, height] = dimStdout.trim().split('x').map(Number);
//         console.log(`   📷 Image: ${width}x${height}`);
//         return { width, height, duration: 0 };
//       }
      
//       const { stdout: dimStdout } = await execPromise(
//         `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
//       );
//       const [width, height] = dimStdout.trim().split('x').map(Number);
      
//       const { stdout: durStdout } = await execPromise(
//         `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
//       );
//       const duration = parseFloat(durStdout.trim()) || 0;
      
//       console.log(`   🎥 Video: ${width}x${height}, ${duration.toFixed(1)}s`);
//       return { width, height, duration };
//     } catch (err: any) {
//       console.error(`Failed to get video info: ${err.message}`);
//       throw err;
//     }
//   }

//   calculatePosition(
//     position: string,
//     canvasWidth: number,
//     canvasHeight: number,
//     avatarWidth: number,
//     avatarHeight: number,
//     margin: number,
//     xOffset: number = 0,
//     yOffset: number = 0
//   ): { x: string; y: string } {
//     let x: string;
//     let y: string;

//     switch (position) {
//       case 'top-left':
//         x = `${margin + xOffset}`;
//         y = `${margin + yOffset}`;
//         break;
//       case 'top-right':
//         x = `${canvasWidth - avatarWidth - margin + xOffset}`;
//         y = `${margin + yOffset}`;
//         break;
//       case 'bottom-left':
//         x = `${margin + xOffset}`;
//         y = `${canvasHeight - avatarHeight - margin + yOffset}`;
//         break;
//       case 'bottom-right':
//         x = `${canvasWidth - avatarWidth - margin + xOffset}`;
//         y = `${canvasHeight - avatarHeight - margin + yOffset}`;
//         break;
//       case 'center':
//         x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
//         y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
//         break;
//       case 'top-center':
//         x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
//         y = `${margin + yOffset}`;
//         break;
//       case 'bottom-center':
//         x = `${(canvasWidth - avatarWidth) / 2 + xOffset}`;
//         y = `${canvasHeight - avatarHeight - margin + yOffset}`;
//         break;
//       case 'left':
//         x = `${margin + xOffset}`;
//         y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
//         break;
//       case 'right':
//         x = `${canvasWidth - avatarWidth - margin + xOffset}`;
//         y = `${(canvasHeight - avatarHeight) / 2 + yOffset}`;
//         break;
//       default:
//         x = `${margin + xOffset}`;
//         y = `${canvasHeight - avatarHeight - margin + yOffset}`;
//     }

//     return { x, y };
//   }

//   async detectAndCropBodyParts(
//     avatarPath: string,
//     outputPath: string,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     console.log(`   🎯 Detecting and cropping body parts...`);
    
//     const args = [
//       '-y',
//       '-i', avatarPath,
//       '-vf', 'cropdetect=24:16:0,scale=iw:ih',
//       '-c:v', 'png',
//       '-pix_fmt', 'rgba',
//       '-frames:v', '1',
//       outputPath
//     ];

//     await runFfmpeg(args);
//   }

//   async applyAdvancedBodyCropping(
//     avatarPath: string,
//     outputPath: string,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     console.log(`   🤖 Applying advanced body part cropping...`);
    
//     const args = [
//       '-y',
//       '-i', avatarPath,
//       '-vf', `cropdetect=24:16:0,smartblur=1.5:0.5:0,crop=iw*0.8:ih*0.8:(iw-iw*0.8)/2:(ih-ih*0.8)/2,scale=iw:ih`,
//       '-c:v', 'png',
//       '-pix_fmt', 'rgba',
//       outputPath
//     ];

//     await runFfmpeg(args);
//   }

//   async createCircleMask(
//     width: number, 
//     height: number, 
//     outputPath: string,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     const size = Math.min(width, height);
//     const radius = size / 2;
    
//     const filterComplex = `color=black@0.0:s=${size}x${size}:d=1[base];` +
//       `[base]drawbox=x=0:y=0:w=${size}:h=${size}:color=white@1.0:t=fill,` +
//       `format=rgba,` +
//       `geq=r='255':g='255':b='255':` +
//       `a='if(lte(hypot(X-${radius},Y-${radius}),${radius}),255,0)'`;

//     const args = [
//       '-y',
//       '-f', 'lavfi',
//       '-i', filterComplex,
//       '-frames:v', '1',
//       '-c:v', 'png',
//       outputPath
//     ];

//     await runFfmpeg(args);
//   }

//   // 🎭 MASK-BASED AVATAR - WORKING VERSION
//   async generateMaskBasedAvatar(
//     avatarPath: string,
//     maskPath: string | null,
//     outputPath: string,
//     config: any,
//     totalDuration: number,
//     canvasWidth: number,
//     canvasHeight: number,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     const scale = config.scale || 0.17;
//     const opacity = (config.opacity || 250) / 255;
//     const margin = config.margin || 10;
//     const xOffset = config.x_offset || 0;
//     const yOffset = config.y_offset || 0;
//     const position = config.position || 'bottom-left';
//     const cornerRadius = config.corner_radius || 0;
//     const removeBackground = config.remove_background || false;
//     const chromaColor = config.chroma_color || 'white';

//     let scaledWidth = Math.round(canvasWidth * scale);
//     let scaledHeight = Math.round(canvasHeight * scale);

//     console.log(`   🎭 MASK-BASED MODE (Creatify-style)`);
//     console.log(`   📐 Position: ${position}`);
//     console.log(`   📏 Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
//     console.log(`   🎨 Remove Background: ${removeBackground}`);

//     const fps = 25;
//     const { x, y } = this.calculatePosition(
//       position,
//       canvasWidth,
//       canvasHeight,
//       scaledWidth,
//       scaledHeight,
//       margin,
//       xOffset,
//       yOffset
//     );

//     let filterComplex = '';
//     let args: string[] = [];

//     // 🔥 CHROMA KEY APPROACH (MOST RELIABLE)
//     if (removeBackground) {
//       console.log(`   🔥 Using chroma key: ${chromaColor}`);
      
//       let chromaFilter = '';
//       if (chromaColor.toLowerCase() === 'white') {
//         chromaFilter = `colorkey=white:0.3:0.2`;
//       } else if (chromaColor.toLowerCase() === 'green') {
//         chromaFilter = `colorkey=green:0.3:0.2,despill=green`;
//       } else {
//         chromaFilter = `colorkey=${chromaColor}:0.3:0.2`;
//       }

//       if (cornerRadius >= 100) {
//         const size = Math.min(scaledWidth, scaledHeight);
//         const radius = size / 2;
//         const centerX = radius;
//         const centerY = radius;

//         filterComplex = 
//           `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,` +
//           `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
//           chromaFilter + `,` +
//           `format=rgba,` +
//           `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),alpha(X,Y),0)'`;
//       } else {
//         filterComplex = 
//           `[0:v]scale=${scaledWidth}:${scaledHeight},` +
//           chromaFilter + `,` +
//           `format=rgba`;
//       }

//       if (opacity < 1.0) {
//         filterComplex += `,colorchannelmixer=aa=${opacity}`;
//       }
//       filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

//       args = [
//         '-y', '-stream_loop', '-1', '-i', avatarPath,
//         '-filter_complex', filterComplex,
//         '-t', totalDuration.toFixed(3), '-r', String(fps),
//         '-c:v', 'png', '-pix_fmt', 'rgba', '-an', outputPath
//       ];
//     }
//     // 📦 SIMPLE MODE (NO BACKGROUND REMOVAL)
//     else {
//       console.log(`   📦 Simple mode (no background removal)`);
      
//       if (cornerRadius >= 100) {
//         const size = Math.min(scaledWidth, scaledHeight);
//         const radius = size / 2;
//         const centerX = radius;
//         const centerY = radius;

//         filterComplex = 
//           `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,` +
//           `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
//           `format=rgba,` +
//           `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),255,0)'`;
//       } else {
//         filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},format=rgba`;
//       }

//       if (opacity < 1.0) {
//         filterComplex += `,colorchannelmixer=aa=${opacity}`;
//       }
//       filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

//       args = [
//         '-y', '-stream_loop', '-1', '-i', avatarPath,
//         '-filter_complex', filterComplex,
//         '-t', totalDuration.toFixed(3), '-r', String(fps),
//         '-c:v', 'png', '-pix_fmt', 'rgba', '-an', outputPath
//       ];
//     }

//     console.log(`   🎬 Generating avatar (${totalDuration.toFixed(2)}s)...`);
//     await runFfmpeg(args);
//   }

//   async generateFixedPositionAvatar(
//     avatarPath: string,
//     outputPath: string,
//     config: any,
//     totalDuration: number,
//     canvasWidth: number,
//     canvasHeight: number,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     const scale = config.scale || 0.17;
//     const opacity = (config.opacity || 250) / 255;
//     const margin = config.margin || 10;
//     const xOffset = config.x_offset || 0;
//     const yOffset = config.y_offset || 0;
//     const position = config.position || 'bottom-left';
//     const cornerRadius = config.corner_radius || 0;
//     const removeBackground = config.remove_background || false;
//     const chromaColor = config.chroma_color || 'white';
//     const detectBodyParts = (config.detect_body_parts ?? false) || removeBackground;
//     const advancedCropping = (config.advanced_cropping ?? false);
//     const effectiveCornerRadius = removeBackground ? 0 : cornerRadius;

//     let scaledWidth = Math.round(canvasWidth * scale);
//     let scaledHeight = Math.round(canvasHeight * scale);

//     console.log(`   📐 Position: ${position}`);
//     console.log(`   📏 Scale: ${scale} → ${scaledWidth}x${scaledHeight}`);
//     console.log(`   🔘 Corner Radius: ${cornerRadius} (effective: ${effectiveCornerRadius})`);
//     console.log(`   🎭 Remove Background: ${removeBackground}`);

//     const fps = 25;
//     let filterComplex = '';
//     let backgroundRemovalFilter = '';
//     let bodyDetectionFilter = '';
    
//     if (removeBackground) {
//       console.log(`   🔥 Applying chroma key removal for ${chromaColor} background`);
      
//       if (chromaColor.toLowerCase() === 'white') {
//         backgroundRemovalFilter = `colorkey=white:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       } else if (chromaColor.toLowerCase() === 'green') {
//         backgroundRemovalFilter = `colorkey=green:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       } else {
//         backgroundRemovalFilter = `colorkey=${chromaColor}:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       }
//     }

//     if (detectBodyParts) {
//       console.log(`   🎯 Applying body part detection and cropping`);
      
//       if (advancedCropping) {
//         bodyDetectionFilter = `cropdetect=24:16:0,smartblur=1.5:0.5:0,crop=iw*0.8:ih*0.8:(iw-iw*0.8)/2:(ih-ih*0.8)/2,`;
//       } else {
//         bodyDetectionFilter = `cropdetect=24:16:0,`;
//       }
//     }

//     if (effectiveCornerRadius >= 100) {
//       console.log(`   ⭕ Creating PERFECT CIRCLE`);
      
//       const size = Math.min(scaledWidth, scaledHeight);
//       scaledWidth = size;
//       scaledHeight = size;
      
//       const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
//       const radius = size / 2;
//       const centerX = radius;
//       const centerY = radius;

//       filterComplex = `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,` +
//         `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
//         bodyDetectionFilter + backgroundRemovalFilter +
//         `format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),255,0)',format=rgba`;

//       if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
//       filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

//     } else if (effectiveCornerRadius > 0) {
//       const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
//       filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba`;
//       if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
//       filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;

//     } else {
//       const { x, y } = this.calculatePosition(position, canvasWidth, canvasHeight, scaledWidth, scaledHeight, margin, xOffset, yOffset);
//       filterComplex = `[0:v]scale=${scaledWidth}:${scaledHeight},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba`;
//       if (opacity < 1.0) filterComplex += `,colorchannelmixer=aa=${opacity}`;
//       filterComplex += `,pad=${canvasWidth}:${canvasHeight}:${x}:${y}:color=#00000000`;
//     }

//     const args = ['-y', '-stream_loop', '-1', '-i', avatarPath, '-filter_complex', filterComplex,
//       '-t', totalDuration.toFixed(3), '-r', String(fps), '-c:v', 'png', '-pix_fmt', 'rgba', '-an', outputPath];

//     console.log(`   🎬 Generating avatar video (${totalDuration.toFixed(2)}s)...`);
//     await runFfmpeg(args);
//   }

//   async generateMixModeAvatar(
//     avatarPath: string,
//     outputPath: string,
//     config: any,
//     scenes: Scene[],
//     totalDuration: number,
//     canvasWidth: number,
//     canvasHeight: number,
//     runFfmpeg: (args: string[]) => Promise<void>
//   ): Promise<void> {
//     const smallScale = config.small_scale || 0.17;
//     const mainScale = config.main_scale || 0.30;
//     const stateDuration = config.state_duration || 7;
//     const margin = config.margin || 5;
//     const removeBackground = config.remove_background || false;
//     const chromaColor = config.chroma_color || 'white';
//     const detectBodyParts = config.detect_body_parts || false;
//     const advancedCropping = config.advanced_cropping || false;
//     const marginBottom = config.margin_bottom || 80;
//     const cornerRadius = config.corner_radius || 0;
//     const effectiveCornerRadius = removeBackground ? 0 : cornerRadius;

//     let backgroundRemovalFilter = '';
//     let bodyDetectionFilter = '';
    
//     if (removeBackground) {
//       if (chromaColor.toLowerCase() === 'white') {
//         backgroundRemovalFilter = `colorkey=white:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       } else if (chromaColor.toLowerCase() === 'green') {
//         backgroundRemovalFilter = `colorkey=green:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       } else {
//         backgroundRemovalFilter = `colorkey=${chromaColor}:0.1:0.1,unsharp=5:5:0.8:3:3:0.4,`;
//       }
//     }

//     if (detectBodyParts) {
//       if (advancedCropping) {
//         bodyDetectionFilter = `cropdetect=24:16:0,smartblur=1.5:0.5:0,crop=iw*0.8:ih*0.8:(iw-iw*0.8)/2:(ih-ih*0.8)/2,`;
//       } else {
//         bodyDetectionFilter = `cropdetect=24:16:0,`;
//       }
//     }

//     const tempClips: string[] = [];
//     let currentTime = 0;
//     const fps = 25;

//     while (currentTime < totalDuration) {
//       const stateIndex = Math.floor(currentTime / stateDuration) % 3;
//       const clipDuration = Math.min(stateDuration, totalDuration - currentTime);
      
//       let scale: number, baseX: number, baseY: number;
//       switch (stateIndex) {
//         case 0: scale = smallScale; baseX = margin; baseY = canvasHeight - Math.round(canvasHeight * scale) - marginBottom; break;
//         case 1: scale = mainScale; baseX = Math.round((canvasWidth - canvasWidth * scale) / 2); baseY = Math.round((canvasHeight - canvasHeight * scale) / 2); break;
//         case 2: scale = 0.01; baseX = -10000; baseY = -10000; break;
//         default: scale = smallScale; baseX = margin; baseY = canvasHeight - Math.round(canvasHeight * scale) - marginBottom;
//       }

//       let scaledW = Math.round(canvasWidth * scale);
//       let scaledH = Math.round(canvasHeight * scale);
//       const clipPath = outputPath.replace('.mov', `_clip${tempClips.length}.mov`);
//       tempClips.push(clipPath);

//       let filterComplex = '';
//       if (effectiveCornerRadius >= 100 && stateIndex !== 2) {
//         const size = Math.min(scaledW, scaledH);
//         const radius = size / 2; const centerX = radius; const centerY = radius;
//         filterComplex = `[0:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
//           bodyDetectionFilter + backgroundRemovalFilter +
//           `format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${centerX},Y-${centerY}),${radius}),255,0)',format=rgba,pad=${canvasWidth}:${canvasHeight}:${baseX}:${baseY}:color=#00000000`;
//       } else {
//         filterComplex = `[0:v]scale=${scaledW}:${scaledH},` + bodyDetectionFilter + backgroundRemovalFilter + `format=rgba,pad=${canvasWidth}:${canvasHeight}:${baseX}:${baseY}:color=#00000000`;
//       }

//       await runFfmpeg(['-y', '-stream_loop', '-1', '-i', avatarPath, '-filter_complex', filterComplex, '-t', clipDuration.toFixed(3), '-r', String(fps), '-c:v', 'png', '-pix_fmt', 'rgba', '-an', clipPath]);
//       currentTime += clipDuration;
//     }

//     const concatList = path.join(path.dirname(outputPath), 'concat_list.txt');
//     fs.writeFileSync(concatList, tempClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
//     await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', outputPath]);
//     tempClips.forEach(clip => { if (fs.existsSync(clip)) fs.unlinkSync(clip); });
//     fs.unlinkSync(concatList);
//   }

//   async generateAvatarForeground(
//     avatarPath: string,
//     scenes: Scene[],
//     tempDir: string,
//     avatarMode: string,
//     avatarConfig: AvatarConfig,
//     runFfmpeg: (args: string[]) => Promise<void>,
//     canvasWidth: number = 1920,
//     canvasHeight: number = 1080,
//     maskPath?: string
//   ): Promise<string | null> {
//     console.log(`\n====== AVATAR FOREGROUND GENERATION ======`);
//     console.log(`Mode: ${avatarMode}`);
//     console.log(`Path: ${avatarPath}`);

//     if (!fs.existsSync(avatarPath)) {
//       throw new Error(`Avatar file not found: ${avatarPath}`);
//     }

//     const config = avatarConfig[avatarMode];
//     if (!config) {
//       throw new Error(`Invalid avatar mode: ${avatarMode}`);
//     }

//     const totalDuration = scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
//     if (!totalDuration || totalDuration <= 0) {
//       throw new Error('Total duration is zero.');
//     }

//     const avatarInfo = await this.getVideoInfo(avatarPath);
//     if (!avatarInfo.width || !avatarInfo.height) {
//       throw new Error('Failed to get avatar dimensions');
//     }

//     const outputPath = path.join(tempDir, `avatar_foreground_${Date.now()}.mov`);

//     try {
//       const isMixMode = avatarMode.includes('mix_mode') || config.states;
//       const isMaskMode = avatarMode.includes('mask-based') || config.use_mask;

//       if (isMaskMode) {
//         console.log(`🎭 MASK-BASED MODE`);
//         await this.generateMaskBasedAvatar(avatarPath, maskPath || null, outputPath, config, totalDuration, canvasWidth, canvasHeight, runFfmpeg);
//       } else if (isMixMode) {
//         console.log(`🔄 MIX MODE`);
//         await this.generateMixModeAvatar(avatarPath, outputPath, config, scenes, totalDuration, canvasWidth, canvasHeight, runFfmpeg);
//       } else {
//         console.log(`📍 FIXED POSITION`);
//         await this.generateFixedPositionAvatar(avatarPath, outputPath, config, totalDuration, canvasWidth, canvasHeight, runFfmpeg);
//       }

//       if (!fs.existsSync(outputPath)) {
//         throw new Error('Avatar foreground not created');
//       }

//       const stats = fs.statSync(outputPath);
//       console.log(`✅ Generated: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
//       return outputPath;

//     } catch (err: any) {
//       console.error(`❌ Failed: ${err.message}`);
//       throw err;
//     }
//   }
// }

