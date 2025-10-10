import * as path from 'path';
import * as fs from 'fs';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';

// ---------------- Helper ----------------
function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// ASS generator with word-level timing
interface AssOptions {
  text: string;
  startTime: number;
  endTime: number;
  words?: { word: string; start: number; end: number }[];
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
    text, startTime, endTime, words, position = 'center', fontName = 'Arial',
    fontSize = 48, fontColor = '&H00FFFFFF', bold = false, italic = false,
    outline = 2, shadow = 1
  } = options;

  let posX = '0', posY = '0';
  switch(position){
    case 'top': posX='640'; posY='50'; break;
    case 'center': posX='640'; posY='360'; break;
    case 'bottom': posX='640'; posY='660'; break;
    default: if(typeof position==='object'){ posX=position.x.toString(); posY=position.y.toString(); } break;
  }

  const toTime = (s:number) => {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = (s%60).toFixed(2);
    return `${h}:${m.toString().padStart(2,'0')}:${sec.padStart(5,'0')}`;
  }

  const start = toTime(startTime);
  const end = toTime(endTime);

  // Word-level overlay
  let dialogueText = text;
  if(words && words.length>0){
    // Simple: show entire text for clip duration
    dialogueText = text;
  }

  const content = `
[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${fontColor},&H00000000,&H00000000,&H00000000,${bold?-1:0},${italic?-1:0},0,0,100,100,0,0,1,${outline},${shadow},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${start},${end},Default,,0,0,0,,{\\pos(${posX},${posY})}${dialogueText}
  `.trim();

  if(!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

// ---------------- Soft Blur Ad with extra fields ----------------
export async function softBlurAdWithWords(scenes: any[], dirs: any, runFFmpeg: any, fps: number) {
  const clipPaths: string[] = [];
  const width = 1280;
  const height = 720;

  for (const scene of scenes) {
    const { chunk_id, image_filename, duration = 5, overlayText = '', start_time = 0, end_time, words } = scene;
    const inputPath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    // Soft blur filter
    let filterComplex = `
      
      [0:v]scale=${width}:${height},boxblur=luma_radius=2.8:luma_power=1,fade=t=in:st=0:d=0.8,fade=t=out:st=${duration - 0.8}:d=0.8[vout]

    `.replace(/\s+/g, '');

    let mapLabel = '[vout]';

    // ASS overlay
    if(overlayText){
      const assFile = generateAssFile(dirs.outputDir, chunk_id, {
        text: overlayText,
        startTime: start_time,
        endTime: end_time ?? duration,
        words,
        position: 'center',
        fontSize: 60
      });
      filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
      mapLabel = '[final]';
    }

    const args = [
      '-y',
      '-loop', '1', '-i', inputPath,
      '-filter_complex', filterComplex,
      '-r', String(fps),
      '-t', String(duration),
      '-pix_fmt', 'yuv420p',
      '-map', mapLabel,
      clipPath,
    ];

    await runFFmpeg(args);
  }

  return clipPaths;
}



// import * as path from 'path';
// import * as fs from 'fs';
// import { runFfmpeg } from 'src/utils/ffmpeg.utils';

// // ---------------- Helper ----------------
// function escapeFfmpegPath(filePath: string): string {
//   return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
// }

// // ASS generator (reuse from previous)
// interface AssOptions {
//   text: string;
//   startTime: number;
//   endTime: number;
//   position?: 'top' | 'center' | 'bottom' | { x: number; y: number };
//   fontName?: string;
//   fontSize?: number;
//   fontColor?: string;
//   bold?: boolean;
//   italic?: boolean;
//   outline?: number;
//   shadow?: number;
// }

// function generateAssFile(outputDir: string, clipId: string, options: AssOptions): string {
//   const {
//     text, startTime, endTime, position = 'center', fontName = 'Arial',
//     fontSize = 48, fontColor = '&H00FFFFFF', bold = false, italic = false,
//     outline = 2, shadow = 1
//   } = options;

//   let posX = '0', posY = '0';
//   switch(position){
//     case 'top': posX='640'; posY='50'; break;
//     case 'center': posX='640'; posY='360'; break;
//     case 'bottom': posX='640'; posY='660'; break;
//     default: if(typeof position==='object'){ posX=position.x.toString(); posY=position.y.toString(); } break;
//   }

//   const toTime = (s:number) => {
//     const h = Math.floor(s/3600);
//     const m = Math.floor((s%3600)/60);
//     const sec = (s%60).toFixed(2);
//     return `${h}:${m.toString().padStart(2,'0')}:${sec.padStart(5,'0')}`;
//   }

//   const start = toTime(startTime);
//   const end = toTime(endTime);

//   const content = `
// [Script Info]
// Title: Clip_${clipId}
// ScriptType: v4.00+
// PlayResX: 1280
// PlayResY: 720

// [V4+ Styles]
// Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
// Style: Default,${fontName},${fontSize},${fontColor},&H00000000,&H00000000,&H00000000,${bold?-1:0},${italic?-1:0},0,0,100,100,0,0,1,${outline},${shadow},2,10,10,10,1

// [Events]
// Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
// Dialogue: 0,${start},${end},Default,,0,0,0,,{\\pos(${posX},${posY})}${text}
//   `.trim();

//   if(!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});
//   const assPath = path.join(outputDir, `clip_${clipId}.ass`);
//   fs.writeFileSync(assPath, content, 'utf-8');
//   return assPath;
// }

// // ---------------- New Soft Blur Effect ----------------
// export async function softBlurAd(scenes: any[], dirs: any, runFFmpeg: any, fps: number) {
//   const clipPaths: string[] = [];
//   const width = 1280;
//   const height = 720;

//   for (const scene of scenes) {
//     const { chunk_id, image_filename, duration = 5, overlayText = '' } = scene;
//     const inputPath = path.join(dirs.imagesDir, image_filename);
//     if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);

//     const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
//     clipPaths.push(clipPath);

//     // Filter: soft blur on entire image with fade in/out
//     let filterComplex = `
//       [0:v]scale=${width}:${height},boxblur=luma_radius=8:luma_power=1,fade=t=in:st=0:d=0.8,fade=t=out:st=${duration - 0.8}:d=0.8[vout]
//     `.replace(/\s+/g, '');

//     let mapLabel = '[vout]';

//     // Add ASS overlay if text exists
//     if(overlayText){
//       const assFile = generateAssFile(dirs.outputDir, chunk_id, {
//         text: overlayText,
//         startTime: 0,
//         endTime: duration,
//         position: 'center',
//         fontSize: 60
//       });
//       filterComplex += `;[vout]ass='${escapeFfmpegPath(assFile)}'[final]`;
//       mapLabel = '[final]';
//     }

//     const args = [
//       '-y',
//       '-loop', '1', '-i', inputPath,
//       '-filter_complex', filterComplex,
//       '-r', String(fps),
//       '-t', String(duration),
//       '-pix_fmt', 'yuv420p',
//       '-map', mapLabel,
//       clipPath,
//     ];

//     await runFFmpeg(args);
//   }

//   return clipPaths;
// }
