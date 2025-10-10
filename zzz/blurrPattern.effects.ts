import * as path from 'path';
import * as fs from 'fs';

// Helper to fix Windows paths
function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

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

function generateAssFile(outputDir: string, clipId: string, options: AssOptions): string {
  const {
    text, startTime, endTime, position = 'bottom', fontName = 'Arial',
    fontSize = 48, fontColor = '&H00FFFFFF', bold = false, italic = false,
    outline = 2, shadow = 1
  } = options;

  let posX = '0', posY = '0';
  switch (position) {
    case 'top': posX = '640'; posY = '50'; break;
    case 'center': posX = '640'; posY = '360'; break;
    case 'bottom': posX = '640'; posY = '660'; break;
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

  const content = `
[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${fontColor},&H00000000,&H00000000,&H00000000,${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,${outline},${shadow},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,0,0,0,,{\\pos(${posX},${posY})}${text}
  `.trim();

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

// --- ✅ Corrected Blur Function ---
export function blurPatternEffect(index: number, duration: number): string {
  const type = (index + 1) % 4;

  if (type === 1 || type === 2) {
    // Top and bottom 15% blur — image not cropped
    return `
      split=2[orig][blur];
      [blur]boxblur=15:3[blurred];
      [blurred]crop=iw:ih*0.15:0:0[top15];
      [blurred]crop=iw:ih*0.15:0:ih*0.85[bottom15];
      [orig][top15]overlay=0:0[tmp1];
      [tmp1][bottom15]overlay=0:H*0.85,format=yuv420p[vout]
    `.replace(/\s+/g, ' ');
  } else if (type === 3) {
    return 'format=yuv420p[vout]';
  } else {
    return 'boxblur=15:3,format=yuv420p[vout]';
  }
}

// --- Main Generator ---
export async function blurPatternAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number
): Promise<string[]> {
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const { chunk_id, image_filename, overlayText, duration, start_time = 0, end_time } = scene;

    const inputPath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    // ✅ Only one [0:v] now
    const filter = blurPatternEffect(i, duration);
    let filterComplex = `[0:v]${filter}`;

    if (overlayText) {
      const assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: start_time,
        endTime: end_time ?? duration,
      });
      filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
    }

    const mapLabel = overlayText ? '[final]' : '[vout]';
    const args = [
      '-y',
      '-loop', '1',
      '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', mapLabel,
      '-r', String(fps),
      '-t', String(duration),
      '-pix_fmt', 'yuv420p',
      clipPath,
    ];

    await runFfmpeg(args);
  }

  return clipPaths;
}
