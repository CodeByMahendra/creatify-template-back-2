import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';

function escapeFfmpegPath(filePath: string): string {
  let escaped = filePath.replace(/\\/g, '/');
  escaped = escaped.replace(/:/g, '\\:');
  escaped = escaped.replace(/'/g, "'\\''");
  return escaped;
}

// Convert #RRGGBB 
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
  position?: 'top' | 'center' | 'bottom' | { x: number; y: number };
  alignment?: 'left' | 'center' | 'right';
  fontName?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
}

function calculateOptimalDimensions(imgWidth: number, imgHeight: number) {
  const TARGET_WIDTH = 1080;
  const TARGET_HEIGHT = 1920;
  const MAIN_RATIO = 0.6;
  const BLUR_RATIO = (1 - MAIN_RATIO) / 2;

  const imgAspect = imgWidth / imgHeight;
  let mainHeight = Math.round(TARGET_HEIGHT * MAIN_RATIO);
  let mainWidth = Math.round(mainHeight * imgAspect);

  if (mainWidth > TARGET_WIDTH) {
    mainWidth = TARGET_WIDTH;
    mainHeight = Math.round(mainWidth / imgAspect);
  }

  const topBlurHeight = Math.round(TARGET_HEIGHT * BLUR_RATIO);
  const bottomBlurHeight = Math.round(TARGET_HEIGHT * BLUR_RATIO);

  mainWidth = mainWidth % 2 === 0 ? mainWidth : mainWidth + 1;
  mainHeight = mainHeight % 2 === 0 ? mainHeight : mainHeight + 1;

  return { targetWidth: TARGET_WIDTH, targetHeight: TARGET_HEIGHT, topBlurHeight, bottomBlurHeight, mainHeight, mainWidth };
}

// Dynamic ASS generator
function generateAssFile(outputDir: string, clipId: string, options: AssOptions): string {
  const {
    text,
    startTime,
    endTime,
    position = 'bottom',
    alignment = 'center',
    fontName = 'Arial',
    fontSize = 20,
    fontColor = '#FFFFFF',
    bold = false,
    italic = false,
    outline = 1,
    shadow = 0
  } = options;

  const assColor = hexToAssColor(fontColor);

  // ASS alignment codes
  const alignCode = {
    left: 1,
    center: 2,
    right: 3
  }[alignment] ?? 2;

  // Vertical margin
  let marginV = position === 'top' ? 50 : position === 'bottom' ? 50 : 0;

  const toTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(2);
    return `${h}:${m.toString().padStart(2,'0')}:${sec.padStart(5,'0')}`;
  }

  const start = toTime(startTime);
  const end = toTime(endTime);

  let dialogueText = text;
  if (typeof position === 'object') {
    dialogueText = `{\\pos(${position.x},${position.y})}${text}`;
  }

  const content = `[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${assColor},&H000000FF,&H00000000,&H80000000,
${bold?-1:0},${italic?-1:0},0,0,100,100,0,0,1,${outline},${shadow},${alignCode},30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,0,0,0,,${dialogueText}
`;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  console.log(`[ASS] Created subtitle file: ${assPath}`);
  return assPath;
}

// Main cyclic template
export async function cyclicTemplate(
  scenes: any[],
  dirs: any,
  fps: number
): Promise<string[]> {

  if (!fs.existsSync(dirs.outputDir)) fs.mkdirSync(dirs.outputDir, { recursive: true });

  const clipPaths: string[] = [];
  const bgVideo = path.join(dirs.videosDir, 'avatar.mp4');
  if (!fs.existsSync(bgVideo)) throw new Error(`Background video not found: ${bgVideo}`);

  const effectCycle = ['bottomLeft', 'bottomLeft', 'topBottomBlur', 'topBottomBlur', 'topBottomBlur', 'bottomLeft', 'none'];
  const bgScaleWidth = 1920;
  const bgScaleHeight = 1080;

  for (let i=0; i<scenes.length; i++) {
    const scene = scenes[i];
    const { chunk_id, image_filename, duration = 4, fadeDur = 0.5, overlayText = '', textOptions = {} } = scene;

    const imagePath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

    const imgMeta = await sharp(imagePath).metadata();
    const width = imgMeta.width || 1280;
    const height = imgMeta.height || 720;

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    const effectType = effectCycle[i % effectCycle.length];
    let filterComplex = '';
    let mapLabel = '[vout]';

    const evenBgWidth = bgScaleWidth % 2 === 0 ? bgScaleWidth : bgScaleWidth + 1;
    const evenBgHeight = bgScaleHeight % 2 === 0 ? bgScaleHeight : bgScaleHeight + 1;
    const overlayScaleFactor = 0.25;
       const topHeight = Math.floor(height * 0.22);
    const bottomHeight = Math.floor(height * 0.22);

    if (effectType === 'bottomLeft') {
      const imgW = Math.floor(evenBgWidth * overlayScaleFactor);
      const imgH = -1;
      const xPos = `W*0.05`;
      const yPos = `H*0.9-h`;

      filterComplex = `[0:v]scale=${evenBgWidth}:${evenBgHeight}:force_original_aspect_ratio=increase,crop=${evenBgWidth}:${evenBgHeight}[bg];` +
                      `[1:v]scale=${imgW}:${imgH},pad=ceil(iw/2)*2:ceil(ih/2)*2,format=rgba,` +
                      `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${duration - fadeDur}:d=${fadeDur}[img];` +
                      `[bg][img]overlay=x=${xPos}:y=${yPos}:enable='between(t,0,${duration})'[vout]`;
    }
    else if (effectType === 'topBottomBlur') {
      const dims = calculateOptimalDimensions(width, height);

      filterComplex = `[0:v]scale=${dims.targetWidth}:${dims.targetHeight}:force_original_aspect_ratio=decrease,` +
                      `pad=${dims.targetWidth}:${dims.targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,split=3[main][blurTop][blurBottom];` +
                      `[blurTop]crop=${dims.targetWidth}:${dims.topBlurHeight}:0:0,boxblur=25:2[topBlurred];` +
                      `[main]crop=${dims.mainWidth}:${dims.mainHeight}:0:${dims.topBlurHeight}[mainCropped];` +
                      `[blurBottom]crop=${dims.targetWidth}:${dims.bottomBlurHeight}:0:${dims.topBlurHeight + dims.mainHeight},boxblur=25:2[bottomBlurred];` +
                      `[topBlurred][mainCropped][bottomBlurred]vstack=inputs=3[stacked];` +
                      `[stacked]format=yuv420p,fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${duration - fadeDur}:d=${fadeDur}[vout]`;
    }
    // else     if (effectType === 'topBottomBlur') {
    //   filterComplex = `
    //     [0:v]scale=${width}:${height},split=3[main][blurTop][blurBottom];
    //     [blurTop]crop=w=${width}:h=${topHeight}:x=0:y=0,boxblur=20:1[topBlurred];
    //     [blurBottom]crop=w=${width}:h=${bottomHeight}:x=0:y=${height - bottomHeight},boxblur=20:1[bottomBlurred];
    //     [topBlurred][main][bottomBlurred]vstack=inputs=3[stacked];
    //     [stacked]format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${duration - 0.6}:d=0.6[vout]
    //   `.replace(/\s+/g, ' ');
    // }

    else if (effectType === 'none') {
      filterComplex = `[0:v]scale=${evenBgWidth}:${evenBgHeight}:force_original_aspect_ratio=decrease,` +
                      `pad=${evenBgWidth}:${evenBgHeight}:(ow-iw)/2:(oh-ih)/2,` +
                      `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${duration - fadeDur}:d=${fadeDur}[vout]`;
    }

    // Apply dynamic ASS overlay
    if (overlayText && overlayText.trim()) {
      const assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: 0,
        endTime: duration,
        ...textOptions
      });

      let normalizedPath = assFile.replace(/\\/g, '/');
      if (normalizedPath.match(/^[a-zA-Z]:\//)) normalizedPath = normalizedPath.replace(/:/, '\\:');
      normalizedPath = normalizedPath.replace(/'/g, "'\\''");

      filterComplex += `;[vout]subtitles='${normalizedPath}'[final]`;
      mapLabel = '[final]';
      console.log(`[ASS] Applied subtitles filter: ${normalizedPath}`);
    }

    const args: string[] = ['-y'];
    if (effectType === 'bottomLeft') args.push('-i', bgVideo, '-loop', '1', '-i', imagePath);
    else args.push('-loop', '1', '-i', imagePath);

    args.push('-filter_complex', filterComplex);
    args.push('-map', mapLabel);
    args.push('-t', String(duration));
    args.push('-r', String(fps));
    args.push('-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23');
    args.push(clipPath);

    console.log(`[FFmpeg] Processing clip ${i+1}/${scenes.length} - Effect: ${effectType}`);
    await runFfmpeg(args);
    console.log(`[Success] Clip created: ${clipPath}`);
  }

  console.log(`[Complete] All ${clipPaths.length} clips created successfully`);
  return clipPaths;
}
