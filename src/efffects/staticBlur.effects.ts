
import * as path from 'path';
import * as fs from 'fs';

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
  position?: 'top' | 'center' | 'bottom' | { x: number; y: number };
  alignment?: 'left' | 'center' | 'right';
  fontName?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
  maxWidth?: number; // Maximum characters per line
}

// Wrap text to multiple lines
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

  // Join with \N (ASS line break)
  return lines.join('\\N');
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
    position = 'bottom',
    alignment = 'center',
    fontName = 'Arial',
    fontSize = 42,
    fontColor = '#FFFFFF',
    bold = false,
    italic = false,
    outline = 2,
    shadow = 1,
    maxWidth = 40,
  } = options;

  const assColor = hexToAssColor(fontColor);

  // Wrap text for long content
  const wrappedText = wrapText(text, maxWidth);

  // ASS Alignment (numpad layout):
  // 7=top-left, 8=top-center, 9=top-right
  // 4=mid-left, 5=mid-center, 6=mid-right
  // 1=bot-left, 2=bot-center, 3=bot-right
  let alignCode = 2;
  let marginV = 20;
  let marginL = 20;
  let marginR = 20;

  if (typeof position === 'string') {
    const alignmentMap: Record<
      'top' | 'center' | 'bottom',
      Record<'left' | 'center' | 'right', number>
    > = {
      top: { left: 7, center: 8, right: 9 },
      center: { left: 4, center: 5, right: 6 },
      bottom: { left: 1, center: 2, right: 3 },
    };
    alignCode = alignmentMap[position][alignment] ?? 2;

    // Set vertical margin based on position
    switch (position) {
      case 'top':
        marginV = 80;
        break;
      case 'center':
        marginV = 360;
        break;
      case 'bottom':
        marginV = 660;
        break;
    }

    // Set horizontal margins based on alignment
    switch (alignment) {
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
  }

  const toTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(2);
    return `${h}:${m.toString().padStart(2, '0')}:${sec.padStart(5, '0')}`;
  };

  const start = toTime(startTime);
  const end = toTime(endTime);

  // ASS content - NO \pos() tag, only use margins and alignment
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
Dialogue: 0,${start},${end},Default,,0,0,0,,${wrappedText}
`.trim();

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

function getTextOptionsByEffect(effectType: string): Partial<AssOptions> {
  switch (effectType) {
    case 'topBottomBlur':
      return {
        position: 'top',
        alignment: 'center',
        fontSize: 50,
        fontColor: '#FF0000',
        bold: true,
        maxWidth: 35, // Larger font = fewer chars per line
      };
    case 'none':
      return {
        position: 'center',
        alignment: 'left',
        fontSize: 42,
        fontColor: '#00FF00',
        italic: true,
        maxWidth: 40,
      };
    case 'lightBlur':
      return {
        position: 'bottom',
        alignment: 'center',
        fontSize: 35,
        fontColor: '#0000FF',
        shadow: 2,
        maxWidth: 45, // Smaller font = more chars per line
      };
    default:
      return {
        position: 'bottom',
        alignment: 'right',
        fontSize: 42,
        fontColor: '#FFFFFF',
        maxWidth: 40,
      };
  }
}

export async function staticBlurAd(
  scenes: any[],
  dirs: any,
  runFFmpeg: any,
  fps: number,
) {
  const clipPaths: string[] = [];
  const width = 1280;
  const height = 720;

  const effectCycle = ['topBottomBlur', 'topBottomBlur', 'none', 'lightBlur'];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const {
      chunk_id,
      image_filename,
      duration = 5,
      overlayText = '',
      textOptions,
    } = scene;

    const inputPath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(inputPath))
      throw new Error(`Image not found: ${inputPath}`);

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    const topHeight = Math.floor(height * 0.22);
    const bottomHeight = Math.floor(height * 0.22);
    const effectType = effectCycle[i % effectCycle.length];

    let filterComplex = '';
    let mapLabel = '[vout]';

    if (effectType === 'topBottomBlur') {
      filterComplex = `
        [0:v]scale=${width}:${height},split=3[main][blurTop][blurBottom];
        [blurTop]crop=w=${width}:h=${topHeight}:x=0:y=0,boxblur=20:1[topBlurred];
        [blurBottom]crop=w=${width}:h=${bottomHeight}:x=0:y=${height - bottomHeight},boxblur=20:1[bottomBlurred];
        [topBlurred][main][bottomBlurred]vstack=inputs=3[stacked];
        [stacked]format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${duration - 0.6}:d=0.6[vout]
      `.replace(/\s+/g, ' ');
    } else if (effectType === 'lightBlur') {
      filterComplex = `
        [0:v]scale=${width}:${height},boxblur=8:1,
        fade=t=in:st=0:d=0.6,fade=t=out:st=${duration - 0.6}:d=0.6[vout]
      `.replace(/\s+/g, ' ');
    } else if (effectType === 'none') {
      filterComplex = `
        [0:v]scale=${width}:${height},
        fade=t=in:st=0:d=0.5,fade=t=out:st=${duration - 0.5}:d=0.5[vout]
      `.replace(/\s+/g, ' ');
    }

    // ASS TEXT OVERLAY with proper alignment
    if (overlayText) {
      const defaultTextOptions = getTextOptionsByEffect(effectType);
      const assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: 0,
        endTime: duration,
        ...defaultTextOptions,
        ...textOptions,
      });
      filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
      mapLabel = '[final]';
    }

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
      '-map',
      mapLabel,
      clipPath,
    ];

    await runFFmpeg(args);
  }

  return clipPaths;
}
