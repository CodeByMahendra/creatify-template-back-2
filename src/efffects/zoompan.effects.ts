import * as path from 'path';
import * as fs from 'fs';
import { zoomPanEffect, dualZoom25to50Effect } from 'src/utils/video.effects';

function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Convert #RRGGBB → &HBBGGRR
function hexToAssColor(hex: string): string {
  if (!hex.startsWith('#')) return hex;
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`; // Alpha + BGR
}

interface AssOptions {
  text: string;
  startTime: number;
  endTime: number;
  position?: 'top' | 'center' | 'bottom' | { x: number; y: number };
  alignment?: 'left' | 'center' | 'right';
  fontName?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
  offsetX?: number;
  offsetY?: number;
  maxWidth?: number;
}

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

// Dynamic ASS file generator with proper alignment
function generateAssFile(
  outputDir: string,
  clipId: string,
  options: AssOptions,
): string {
  const {
    text,
    startTime,
    endTime,
    position = 'top',
    alignment = 'center',
    fontName = 'Arial',
    fontSize = 50,
    fontColor = '#09e740ff',
    bold = false,
    italic = false,
    outline = 2,
    shadow = 1,
    offsetX = 0,
    offsetY = 0,
    maxWidth = 40,
  } = options;

  const assColor = hexToAssColor(fontColor);

  // Wrap text if it's too long
  const wrappedText = wrapText(text, maxWidth);

  let assAlignment = 5; // default: center-center
  let marginV = 20; // vertical margin

  // Determine alignment based on position and alignment
  if (position === 'top') {
    marginV = 80;
    if (alignment === 'left') assAlignment = 7;
    else if (alignment === 'center') assAlignment = 8;
    else if (alignment === 'right') assAlignment = 9;
  } else if (position === 'center') {
    marginV = 360;
    if (alignment === 'left') assAlignment = 4;
    else if (alignment === 'center') assAlignment = 5;
    else if (alignment === 'right') assAlignment = 6;
  } else if (position === 'bottom') {
    marginV = 660;
    if (alignment === 'left') assAlignment = 1;
    else if (alignment === 'center') assAlignment = 2;
    else if (alignment === 'right') assAlignment = 3;
  }

  // Apply vertical offset
  marginV += offsetY;

  // Horizontal margins
  let marginL = 20;
  let marginR = 20;

  if (alignment === 'left') {
    marginL = 100 + offsetX;
  } else if (alignment === 'right') {
    marginR = 100 - offsetX;
  } else {
    // For center alignment, use equal margins
    marginL = 20 + offsetX;
    marginR = 20 - offsetX;
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
Style: Default,${fontName},${fontSize},${assColor},&H00000000,&H00000000,&H00000000,${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,${outline},${shadow},${assAlignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,0,0,0,,${wrappedText}
`.trim();

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

export async function styliceSliceAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
): Promise<string[]> {
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const {
      chunk_id,
      image_filename,
      direction,
      overlayText,
      start_time = 0,
      end_time,
      duration: clipDuration = scene.duration,
      textOptions = {},
    } = scene;

    const inputPath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(inputPath))
      throw new Error(`Image not found: ${inputPath}`);

    const isDualScene = (i + 1) % 3 === 0 && i + 1 < scenes.length;

    // SINGLE CLIP --------
    if (!isDualScene) {
      const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
      clipPaths.push(clipPath);

      let filterComplex = `[0:v]${zoomPanEffect(clipDuration, direction || (i % 2 === 0 ? 'left' : 'bottom'))}[vout]`;

      if (overlayText) {
        const assFile = generateAssFile(dirs.outputDir, chunk_id, {
          text: overlayText,
          startTime: start_time,
          endTime: end_time ?? clipDuration,
          position: 'top',
          alignment: 'center',
          fontSize: 55,
          fontColor: '#FFFF00',
          offsetX: 0,
          offsetY: 0,
          maxWidth: 50, // Adjust based on fontSize
          ...textOptions,
        });
        filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[vfinal]`;
      }

      const mapLabel = overlayText ? '[vfinal]' : '[vout]';
      const args = [
        '-y',
        '-loop',
        '1',
        '-i',
        inputPath,
        '-filter_complex',
        filterComplex,
        '-map',
        mapLabel,
        '-r',
        String(fps),
        '-t',
        String(clipDuration),
        '-pix_fmt',
        'yuv420p',
        clipPath,
      ];

      await runFfmpeg(args);
    }

    // -------- DUAL CLIP --------
    if (isDualScene) {
      const nextScene = scenes[i + 1];
      const inputPath2 = path.join(dirs.imagesDir, nextScene.image_filename);
      const dualClipPath = path.join(
        dirs.outputDir,
        `dual_${scene.chunk_id}_${nextScene.chunk_id}.mp4`,
      );
      clipPaths.push(dualClipPath);

      let filterDual = dualZoom25to50Effect(clipDuration);

      if (scene.overlayText) {
        const assFile = generateAssFile(
          dirs.outputDir,
          `${scene.chunk_id}_${nextScene.chunk_id}`,
          {
            text: scene.overlayText,
            startTime: scene.start_time,
            endTime: scene.end_time ?? clipDuration,
            position: 'center',
            alignment: 'center',
            fontSize: 50,
            fontColor: '#00FF00',
            offsetX: -200,
            offsetY: 0,
            maxWidth: 30, // Adjust based on fontSize
            ...textOptions,
          },
        );
        filterDual += `;[v]ass='${escapeFfmpegPath(assFile)}'[vfinal]`;
      }

      const mapLabel = scene.overlayText ? '[vfinal]' : '[v]';
      const argsDual = [
        '-y',
        '-loop',
        '1',
        '-i',
        inputPath,
        '-loop',
        '1',
        '-i',
        inputPath2,
        '-filter_complex',
        filterDual,
        '-map',
        mapLabel,
        '-r',
        String(fps),
        '-t',
        String(clipDuration),
        '-pix_fmt',
        'yuv420p',
        dualClipPath,
      ];

      await runFfmpeg(argsDual);
    }
  }

  return clipPaths;
}
