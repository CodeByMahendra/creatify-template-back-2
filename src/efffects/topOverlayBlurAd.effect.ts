import * as path from 'path';
import * as fs from 'fs';

import { imageSize } from 'image-size';

function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Get image dimensions and calculate fit size
function getImageFitSize(
  imagePath: string,
  boxWidth: number,
  boxHeight: number,
) {
  const buffer = fs.readFileSync(imagePath);
  const dimensions = imageSize(buffer);

  const imgWidth = dimensions.width!;
  const imgHeight = dimensions.height!;

  const widthRatio = boxWidth / imgWidth;
  const heightRatio = boxHeight / imgHeight;
  const scale = Math.min(widthRatio, heightRatio); // fit inside box

  return {
    width: Math.round(imgWidth * scale),
    height: Math.round(imgHeight * scale),
  };
}

// Get background size (thoda bada rakhenge for better look)
function getBackgroundSize(
  imagePath: string,
  canvasWidth: number,
  canvasHeight: number,
  clearBoxWidth: number,
  clearBoxHeight: number,
) {
  const buffer = fs.readFileSync(imagePath);
  const dimensions = imageSize(buffer);

  const imgWidth = dimensions.width!;
  const imgHeight = dimensions.height!;

  // Background ko clear box se thoda bada rakhenge for better look
  // Par canvas se bahar nahi jayega
  const bgWidth = Math.min(clearBoxWidth * 1.2, canvasWidth); // 20% extra ya canvas width
  const bgHeight = Math.min(clearBoxHeight * 1.5, canvasHeight); // 50% extra ya canvas height

  const widthRatio = bgWidth / imgWidth;
  const heightRatio = bgHeight / imgHeight;
  const scale = Math.min(widthRatio, heightRatio);

  return {
    width: Math.round(imgWidth * scale),
    height: Math.round(imgHeight * scale),
    maxWidth: bgWidth,
    maxHeight: bgHeight,
  };
}

// ASS subtitle generator
interface AssOptions {
  text: string;
  startTime: number;
  endTime: number;
  position?: 'top' | 'center' | 'bottom' | { x: number; y: number };
  fontName?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
}

function generateAssFile(
  outputDir: string,
  clipId: string,
  options: AssOptions,
): string {
  const {
    text,
    startTime,
    endTime,
    position = 'center',
    fontName = 'Arial',
    fontSize = 48,
    fontColor = '&H00FFFFFF',
    bold = false,
    italic = false,
    outline = 2,
    shadow = 1,
  } = options;

  let posX = '640',
    posY = '360';
  switch (position) {
    case 'top':
      posX = '640';
      posY = '50';
      break;
    case 'center':
      posX = '640';
      posY = '360';
      break;
    case 'bottom':
      posX = '640';
      posY = '660';
      break;
    default:
      if (typeof position === 'object') {
        posX = position.x.toString();
        posY = position.y.toString();
      }
      break;
  }

  const toTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(2);
    return `${h}:${m.toString().padStart(2, '0')}:${sec.padStart(5, '0')}`;
  };

  const start = toTime(startTime);
  const end = toTime(endTime);

  const content = `[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${fontColor},&H00000000,&H00000000,&H00000000,${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,${outline},${shadow},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,0,0,0,,{\\pos(${posX},${posY})}${text}`;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

export async function topOverlayBlurAd(
  scenes: any[],
  dirs: any,
  runFFmpeg: any,
  fps: number,
) {
  const clipPaths: string[] = [];

  // Canvas dimensions
  const canvasWidth = 1280;
  const canvasHeight = 720;

  // Clear image box (top section)
  const clearBoxWidth = Math.round(canvasWidth * 0.6); // 60% width = 768px
  const clearBoxHeight = Math.round(canvasHeight * 0.35); // 35% height = 252px
  const topMargin = Math.round(canvasHeight * 0.05); // 5% top margin = 36px

  for (const scene of scenes) {
    const { chunk_id, image_filename, duration = 5, overlayText = '' } = scene;
    const inputPath = path.join(dirs.imagesDir, image_filename);
    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);

    // Get original image dimensions
    const buffer = fs.readFileSync(inputPath);
    const dimensions = imageSize(buffer);
    const originalWidth = dimensions.width!;
    const originalHeight = dimensions.height!;

    // Calculate background size (blur wali image ke liye)
    const bgFittedSize = getImageFitSize(inputPath, canvasWidth, canvasHeight);

    // Calculate clear image size (top wali clear image ke liye)
    const clearFittedSize = getImageFitSize(
      inputPath,
      clearBoxWidth,
      clearBoxHeight,
    );

    // Center position for clear image
    const clearBoxX = Math.round((canvasWidth - clearBoxWidth) / 2); // 256px
    const clearBoxY = topMargin; // 36px from top

    // Position to center the fitted image inside the clear box
    const imageX =
      clearBoxX + Math.round((clearBoxWidth - clearFittedSize.width) / 2);
    const imageY =
      clearBoxY + Math.round((clearBoxHeight - clearFittedSize.height) / 2);

    // FFmpeg filter complex
    // Background: Canvas ko completely fill karne ke liye scale+crop
    let filterComplex =
      `[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase[bgscaled];` +
      `[bgscaled]crop=${canvasWidth}:${canvasHeight}[bgcropped];` +
      `[bgcropped]boxblur=20:1[blurred];` +
      // Clear image: Clear box size me fit
      `[0:v]scale=${clearFittedSize.width}:${clearFittedSize.height}[clearimg];` +
      `[blurred][clearimg]overlay=${imageX}:${imageY}[vout]`;

    // Add text overlay if present
    if (overlayText) {
      const assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: 0,
        endTime: duration,
        position: { x: canvasWidth / 2, y: clearBoxY + clearBoxHeight + 50 }, // Below clear image
        fontSize: 60,
        bold: true,
        outline: 3,
        shadow: 2,
      });

      filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
    }

    const mapLabel = overlayText ? '[final]' : '[vout]';

    const args = [
      '-y',
      '-loop',
      '1',
      '-i',
      inputPath,
      '-filter_complex',
      filterComplex,
      '-r',
      String(fps),
      '-t',
      String(duration),
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-map',
      mapLabel,
      clipPath,
    ];

    await runFFmpeg(args);
    clipPaths.push(clipPath);
  }

  return clipPaths;
}
