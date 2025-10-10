import * as path from 'path';
import * as fs from 'fs';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';
import { imageScaleAndFade, slideInHoldOutOverlay } from 'src/utils/video.effects';

function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function hexToAssColor(hex: string): string {
  if (!hex.startsWith('#')) return hex;
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`; 
}

interface AssOptions {
  text: string;
  startTime: number;
  endTime: number;
  position?: 'top' | 'center' | 'bottom';
  alignment?: 'left' | 'center' | 'right';
  fontName?: string;
  fontSize?: number;
  fontColor?: string; 
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
  maxWidth?: number;
}

// Text wrapping function
function wrapText(text: string, maxWidth: number = 40): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.join('\\N');
}

// Dynamic ASS generator with PROPER alignment
function generateAssFile(outputDir: string, clipId: string, options: AssOptions): string {
  const {
    text,
    startTime,
    endTime,
    position = 'bottom',
    alignment = 'center',
    fontName = 'Poppins',
    fontSize = 26,
    fontColor = '#FFFFFF', 
    bold = true,
    italic = false,
    outline = 2,
    shadow = 1,
    maxWidth = 40
  } = options;

  const assColor = hexToAssColor(fontColor);
  const wrappedText = wrapText(text, maxWidth);

  // ASS Alignment (numpad layout):
  // 7=top-left, 8=top-center, 9=top-right
  // 4=mid-left, 5=mid-center, 6=mid-right
  // 1=bot-left, 2=bot-center, 3=bot-right
  const alignmentMap: Record<'top' | 'center' | 'bottom', Record<'left' | 'center' | 'right', number>> = {
    top:    { left: 7, center: 8, right: 9 },
    center: { left: 4, center: 5, right: 6 },
    bottom: { left: 1, center: 2, right: 3 },
  };
  
  const alignCode = alignmentMap[position][alignment];

  // Set margins based on position
  let marginV = 20;
  switch(position) {
    case 'top': marginV = 80; break;
    case 'center': marginV = 360; break;
    case 'bottom': marginV = 660; break;
  }

  // Set horizontal margins based on alignment
  let marginL = 20;
  let marginR = 20;
  switch(alignment) {
    case 'left': 
      marginL = 100; 
      marginR = 20;
      break;
    case 'center': 
      marginL = 20; 
      marginR = 20;
      break;
    case 'right': 
      marginL = 20; 
      marginR = 100;
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

  const content = `
[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${assColor},&H00000000,&H00000000,&H00000000,${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,${outline},${shadow},${alignCode},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,${marginL},${marginR},${marginV},,${wrappedText}
  `.trim();

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

// Default text options for Slide-In effect
function getSlideInTextOptions(): Partial<AssOptions> {
  return {
    position: 'bottom',
    alignment: 'center',
    fontSize: 40,
    fontColor: '#FFFF00',  // Yellow
    fontName: 'Arial',
    bold: true,
    italic: false,
    outline: 3,
    shadow: 2,
    maxWidth: 35
  };
}

// Default text options for Move-In effect
function getMoveInTextOptions(): Partial<AssOptions> {
  return {
    position: 'center',
    alignment: 'center',
    fontSize: 50,
    fontColor: '#00FF00',  // Green
    fontName: 'Poppins',
    bold: true,
    italic: true,
    outline: 2,
    shadow: 1,
    maxWidth: 30
  };
}

// Main function
export async function mixedSlideMoveAd(scenes: any[], dirs: any, fps: number): Promise<string[]> {
  const width = 1280;
  const height = 720;
  const bgVideo = path.join(dirs.videosDir, 'avatar.mp4');

  if (!fs.existsSync(bgVideo)) throw new Error(`Background video not found: ${bgVideo}`);
  if (!fs.existsSync(dirs.outputDir)) fs.mkdirSync(dirs.outputDir, { recursive: true });

  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const {
      chunk_id,
      image_filename,
      duration = 4,
      overlayText = '',
      start_time = 0,
      end_time,
      duration: clipDuration = duration,
      slideInTextOptions = {},  // Custom options for slide-in
      moveInTextOptions = {},   // Custom options for move-in
    } = scene;

    const imagePath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    // Cycle logic (3 slide-in + 2 move-in)
    const cycleIndex = i % 5;
    const isSlideIn = cycleIndex < 3;

    // Generate ASS file with effect-specific options
    let assFile: string | null = null;
    if (overlayText) {
      const defaultOptions = isSlideIn 
        ? getSlideInTextOptions() 
        : getMoveInTextOptions();
      
      const customOptions = isSlideIn 
        ? slideInTextOptions 
        : moveInTextOptions;

      assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: start_time,
        endTime: end_time ?? clipDuration,
        ...defaultOptions,
        ...customOptions  // User options override defaults
      });
    }

    let filterComplex = '';
    let mapLabel = '';

    if (isSlideIn) {
      // ===== SLIDE-IN ANIMATION =====
      const slideIn = 0.5, hold = 2.3, slideOut = 0.5;
      const total = Math.max(clipDuration, slideIn + hold + slideOut);
      const imgFilter = imageScaleAndFade(total, 0.5);
      const overlayExpr = slideInHoldOutOverlay(slideIn, hold, slideOut);

      filterComplex = `
        [0:v]scale=${width}:${height},setsar=1[bg];
        [1:v]${imgFilter}[img];
        [bg][img]${overlayExpr}[vout]
      `.replace(/\s+/g, ' ');

      if (assFile) {
        filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
        mapLabel = '[final]';
      } else {
        mapLabel = '[vout]';
      }

      const args = [
        '-y',
        '-i', bgVideo,
        '-loop', '1', '-i', imagePath,
        '-filter_complex', filterComplex,
        '-map', mapLabel,
        '-t', String(total),
        '-r', String(fps),
        '-pix_fmt', 'yuv420p',
        clipPath,
      ];

      await runFfmpeg(args);
    } else {
      // ===== MOVE-IN EFFECT =====
      filterComplex = `
        [0:v]scale=${width}:${height}[bg];
        [0:v]scale=w='if(gt(a,16/9),${width},-1)':h='if(gt(a,16/9),-1,${height})':force_original_aspect_ratio=decrease[fg];
        [bg]boxblur=8:8[bgblur];
        [bgblur][fg]overlay=(W-w)/2:(H-h)/2[vout];
        [vout]scale=${Math.floor(width * 1.1)}:${Math.floor(height * 1.1)}[zoom]
      `.replace(/\s+/g, ' ');

      if (assFile) {
        filterComplex += `;[zoom]ass='${escapeFfmpegPath(assFile)}'[final]`;
        mapLabel = '[final]';
      } else {
        mapLabel = '[zoom]';
      }

      const args = [
        '-y',
        '-loop', '1', '-i', imagePath,
        '-filter_complex', filterComplex,
        '-map', mapLabel,
        '-r', String(fps),
        '-t', String(clipDuration),
        '-pix_fmt', 'yuv420p',
        clipPath,
      ];

      await runFfmpeg(args);
    }
  }

  return clipPaths;
}