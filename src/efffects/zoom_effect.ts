// // ye code h duration ke according 
// import * as path from 'path';
// import * as fs from 'fs';
// import { zoomPanEffect } from 'src/utils/video.effects';
// import sharp from 'sharp';
// import axios from 'axios';

// export function escapeFfmpegPath(filePath: string): string {
//   let escaped = filePath.replace(/\\/g, '/');
//   escaped = escaped.replace(/:/g, '\\:');
//   return escaped;
// }

// function wrapText(text: string, maxWidth: number = 40): string {
//   const words = text.split(' ');
//   const lines: string[] = [];
//   let currentLine = '';

//   for (const word of words) {
//     const testLine = currentLine ? `${currentLine} ${word}` : word;
//     if (testLine.length <= maxWidth) {
//       currentLine = testLine;
//     } else {
//       if (currentLine) lines.push(currentLine);
//       currentLine = word;
//     }
//   }
//   if (currentLine) lines.push(currentLine);
//   return lines.join('\\N');
// }

// function getDimensionsFromAspectRatio(aspectRatio: string) {
//   const ratioMap: Record<string, { width: number; height: number }> = {
//     '16:9': { width: 1920, height: 1080 },
//     '9:16': { width: 1080, height: 1920 },
//     '1:1': { width: 1080, height: 1080 },
//     '4:5': { width: 1080, height: 1350 },
//     '4:3': { width: 1440, height: 1080 },
//   };
//   return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
// }

// function createBlackFrame(width: number, height: number): Buffer {
//   return Buffer.alloc(width * height * 3);
// }

// async function loadAndResizeImage(
//   imagePath: string,
//   width: number,
//   height: number
// ): Promise<Buffer> {
//   try {
//     if (!fs.existsSync(imagePath)) return createBlackFrame(width, height);

//     const metadata = await sharp(imagePath).metadata();
//     const imgWidth = metadata.width || width;
//     const imgHeight = metadata.height || height;
//     const scale = Math.min(width / imgWidth, height / imgHeight);
//     const newWidth = Math.round(imgWidth * scale);
//     const newHeight = Math.round(imgHeight * scale);

//     const resizedImage = await sharp(imagePath)
//       .resize(newWidth, newHeight, {
//         fit: 'contain',
//         background: { r: 0, g: 0, b: 0 },
//       })
//       .raw()
//       .toBuffer();

//     const background = Buffer.alloc(width * height * 3);
//     const yOffset = Math.floor((height - newHeight) / 2);
//     const xOffset = Math.floor((width - newWidth) / 2);

//     for (let y = 0; y < newHeight; y++) {
//       for (let x = 0; x < newWidth; x++) {
//         const srcIdx = (y * newWidth + x) * 3;
//         const destIdx = ((y + yOffset) * width + (x + xOffset)) * 3;
//         background[destIdx] = resizedImage[srcIdx];
//         background[destIdx + 1] = resizedImage[srcIdx + 1];
//         background[destIdx + 2] = resizedImage[srcIdx + 2];
//       }
//     }

//     return background;
//   } catch (err) {
//     console.error('Error resizing image', err);
//     return createBlackFrame(width, height);
//   }
// }

// const toTime = (s: number): string => {
//   const h = Math.floor(s / 3600);
//   const m = Math.floor((s % 3600) / 60);
//   const sec = s % 60;
//   const wholeSeconds = Math.floor(sec);
//   const centiseconds = Math.round((sec - wholeSeconds) * 100);
//   const paddedCs = centiseconds.toString().padStart(2, '0');

//   return `${h}:${m.toString().padStart(2, '0')}:${wholeSeconds
//     .toString()
//     .padStart(2, '0')}.${paddedCs}`;
// };

// function escapeAssText(text: string): string {
//   return text;
// }


// function buildWordTimeline(words: Array<{ word: string; start: number; end: number }>) {
//   const timeline: Array<{ 
//     wordIndex: number;
//     displayStart: number; 
//     displayEnd: number; 
//     isGap: boolean;
//   }> = [];

//   for (let i = 0; i < words.length; i++) {
//     const current = words[i];
    
//     // Add active word period
//     timeline.push({
//       wordIndex: i,
//       displayStart: current.start,
//       displayEnd: current.end,
//       isGap: false,
//     });

//     // Add gap period (show previous word without highlight)
//     if (i < words.length - 1) {
//       const next = words[i + 1];
//       if (next.start > current.end) {
//         timeline.push({
//           wordIndex: i,
//           displayStart: current.end,
//           displayEnd: next.start,
//           isGap: true,
//         });
//       }
//     }
//   }

//   return timeline;
// }

// export function generateAssWithKaraoke(
//   outputDir: string,
//   clipId: string,
//   overlayText: string,
//   sceneDuration: number,
//   words: Array<{ word: string; start: number; end: number }>,
//   templates: any,
//   templateName: string,
//   aspectRatio: string,
//   styleName: string = 'Default'
// ): string {
//   const template = templates[templateName];
//   if (!template) throw new Error(`Template not found: ${templateName}`);
  
//   const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
//   if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
  
//   const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

//   let primaryColor = style.primary_colour || '&H00FFFFFF';
//   let highlightColor = style.secondary_colour || '&H000000FF';

//   primaryColor = primaryColor.replace(/&+/g, '&');
//   highlightColor = highlightColor.replace(/&+/g, '&');

//   const cleanHighlightColor = primaryColor.startsWith('&')
//     ? highlightColor
//     : `&${highlightColor}`;
//   const cleanPrimaryColor = primaryColor.startsWith('&')
//     ? primaryColor
//     : `&${primaryColor}`;

//   let dialogueEvents = '';

//   console.log(
//     `\n🎤 Karaoke: ${clipId} | Duration: ${sceneDuration.toFixed(2)}s`
//   );

//   if (words && words.length > 0) {
//     const timeline = buildWordTimeline(words);

//     for (let i = 0; i < timeline.length; i++) {
//       const entry = timeline[i];
//       const displayStart = entry.displayStart;
//       const displayEnd = entry.displayEnd;
//       const activeWordIndex = entry.wordIndex;

//       console.log(
//         `   Entry ${i + 1}/${timeline.length}: Word[${activeWordIndex}] "${words[activeWordIndex].word}" → ${toTime(
//           displayStart
//         )} to ${toTime(displayEnd)} ${entry.isGap ? '(GAP)' : '(ACTIVE)'}`
//       );

//       let textWithHighlight = '';

//       // ✅ Build complete text with ONLY current word highlighted
//       for (let j = 0; j < words.length; j++) {
//         if (j === activeWordIndex && !entry.isGap) {
//           // Current active word - highlight it
//           textWithHighlight += `{\\c${cleanHighlightColor}}${words[j].word}{\\c${cleanPrimaryColor}}`;
//         } else {
//           // All other words - normal color
//           textWithHighlight += words[j].word;
//         }
        
//         if (j < words.length - 1) textWithHighlight += ' ';
//       }

//       const dialogueLine = `Dialogue: 0,${toTime(displayStart)},${toTime(
//         displayEnd
//       )},${styleName},,0,0,0,,${textWithHighlight}`;

//       dialogueEvents += dialogueLine + '\n';
//     }
//   } else {
//     console.log(`   No words, showing full text: ${overlayText}`);
//     const dialogueLine = `Dialogue: 0,${toTime(0)},${toTime(
//       sceneDuration
//     )},${styleName},,0,0,0,,${overlayText}`;
//     dialogueEvents = dialogueLine + '\n';
//   }

//   const content = `[Script Info]
// Title: Clip_${clipId}_Karaoke
// ScriptType: v4.00+
// PlayResX: 1280
// PlayResY: 720
// Collisions: Normal

// [V4+ Styles]
// Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
// Style: ${styleName},${style.fontname || 'Arial'},${style.fontsize},${primaryColor},${highlightColor},${style.outline_colour},${style.back_colour},${style.bold},${style.italic},${style.underline},${style.strikeout},${style.scale_x},${style.scale_y},${style.spacing},${style.angle},${style.border_style},${style.outline},${style.shadow},${style.alignment},${style.margin_l},${style.margin_r},${style.margin_v},${style.encoding}

// [Events]
// Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
// ${dialogueEvents}`;

//   if (!fs.existsSync(outputDir))
//     fs.mkdirSync(outputDir, { recursive: true });
  
//   const assPath = path.join(outputDir, `clip_${clipId}_karaoke.ass`);
//   fs.writeFileSync(assPath, content, 'utf-8');
//   console.log(`   ✅ ASS file created: ${assPath}`);
//   return assPath;
// }

// export function generateAssFromTemplate(
//   outputDir: string,
//   clipId: string,
//   overlayText: string,
//   sceneDuration: number,
//   templates: any,
//   templateName: string,
//   aspectRatio: string,
//   styleName: string = 'Highlight'
// ): string {
//   const template = templates[templateName];
//   if (!template) throw new Error(`Template not found: ${templateName}`);
  
//   const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
//   if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
  
//   const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

//   const wrappedText = wrapText(overlayText, 50);

//   const content = `[Script Info]
// Title: Clip_${clipId}
// ScriptType: v4.00+
// PlayResX: 1280
// PlayResY: 720
// Collisions: Normal

// [V4+ Styles]
// Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
// Style: ${styleName},${style.fontname || 'Arial'},${style.fontsize},${style.primary_colour},${style.secondary_colour},${style.outline_colour},${style.back_colour},${style.bold},${style.italic},${style.underline},${style.strikeout},${style.scale_x},${style.scale_y},${style.spacing},${style.angle},${style.border_style},${style.outline},${style.shadow},${style.alignment},${style.margin_l},${style.margin_r},${style.margin_v},${style.encoding}

// [Events]
// Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
// Dialogue: 0,${toTime(0)},${toTime(sceneDuration)},${styleName},,0,0,0,,${wrappedText}`;

//   if (!fs.existsSync(outputDir))
//     fs.mkdirSync(outputDir, { recursive: true });
  
//   const assPath = path.join(outputDir, `clip_${clipId}.ass`);
//   fs.writeFileSync(assPath, content, 'utf-8');
//   return assPath;
// }

// export async function zoom_effectAd(
//   scenes: any[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'zoom_effect'
// ): Promise<string[]> {
//   const clipPaths: string[] = [];

//   let smallestArea = Infinity;
//   let smallestAspectRatio = '16:9';

//   console.log('\n====== ANALYZING IMAGES ======');

//   for (const scene of scenes) {
//     if (scene.image_filename) {
//       const imgPath = path.isAbsolute(scene.image_filename)
//         ? scene.image_filename
//         : path.join(dirs.imagesDir, scene.image_filename);

//       if (scene.image_filename.startsWith('http')) {
//         try {
//           console.log(`📥 Analyzing: ${scene.chunk_id}`);
//           const response = await axios.get(scene.image_filename, {
//             responseType: 'arraybuffer',
//           });
//           const buffer = Buffer.from(response.data);
//           const metadata = await sharp(buffer).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
//             console.log(`   Size: ${metadata.width}x${metadata.height} (${area} px²)`);

//             if (area < smallestArea) {
//               smallestArea = area;
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.01) smallestAspectRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.01) smallestAspectRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.01) smallestAspectRatio = '4:3';
//             }
//           }
//         } catch (err) {
//           console.warn(`   ⚠️ Failed to fetch: ${scene.chunk_id}`);
//         }
//       } else if (fs.existsSync(imgPath)) {
//         try {
//           console.log(`📁 Analyzing: ${scene.chunk_id}`);
//           const metadata = await sharp(imgPath).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
//             console.log(`   Size: ${metadata.width}x${metadata.height} (${area} px²)`);

//             if (area < smallestArea) {
//               smallestArea = area;
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.01) smallestAspectRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.01) smallestAspectRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.01) smallestAspectRatio = '4:3';
//             }
//           }
//         } catch (err) {
//           console.warn(`   ⚠️ Failed to analyze: ${scene.chunk_id}`);
//         }
//       }
//     }
//   }

//   console.log(`\n✅ Aspect ratio selected: ${smallestAspectRatio}\n`);

//   const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
//   let styleIndex = 0;

//   console.log('====== PROCESSING SCENES ======\n');

//   const totalDuration = scenes.reduce((sum, s) => {
//     const d = (typeof s.duration === 'number' && s.duration > 0)
//       ? s.duration
//       : (typeof s.audio_duration === 'number' && s.audio_duration > 0)
//         ? s.audio_duration
//         : (typeof s.end_time === 'number' && typeof s.start_time === 'number')
//           ? Math.max(0, s.end_time - s.start_time)
//           : 0;
//     return sum + d;
//   }, 0);
//   console.log(`ℹ️ Expected total duration (sum of scenes): ${totalDuration.toFixed(2)}s`);

//   for (let i = 0; i < scenes.length; i++) {
//     const scene = scenes[i];
//     const {
//       chunk_id,
//       image_filename,
//       video_filename,
//       direction,
//       overlayText,
//       asset_type = 'image',
//       words = [],
//     } = scene;

//     const clipDuration =
//       (typeof scene.duration === 'number' && scene.duration > 0)
//         ? scene.duration
//         : (typeof scene.audio_duration === 'number' && scene.audio_duration > 0)
//           ? scene.audio_duration
//           : (typeof scene.end_time === 'number' && typeof scene.start_time === 'number')
//             ? Math.max(0, scene.end_time - scene.start_time)
//             : 0;

//     if (clipDuration === 0) {
//       console.warn(`⚠️ Scene ${chunk_id} has no duration, skipping...`);
//       continue;
//     }

//     console.log(`\n📍 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
//     console.log(`   ⏱️ Duration: ${clipDuration.toFixed(2)}s`);
//     console.log(`   📝 Text: "${overlayText}"`);
//     console.log(`   🎵 Words: ${words.length}`);

//     const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);
//     console.log(`   📐 Resolution: ${width}x${height}`);

//     const textStyle = stylePattern[styleIndex];
//     styleIndex = (styleIndex + 1) % stylePattern.length;
//     console.log(`   🎨 Style: ${textStyle}`);

//     let inputPath: string;

//     if (asset_type === 'video' && video_filename) {
//       inputPath = path.isAbsolute(video_filename)
//         ? video_filename
//         : path.join(dirs.imagesDir, video_filename);
//       console.log(`   🎬 Video asset`);
//     } else if (image_filename) {
//       if (image_filename.startsWith('http')) {
//         try {
//           console.log(`   📥 Downloading image...`);
//           const response = await axios.get(image_filename, {
//             responseType: 'arraybuffer',
//           });
//           const buffer = Buffer.from(response.data);
//           const tempPath = path.join(dirs.outputDir, `downloaded_${chunk_id}.jpg`);
//           fs.writeFileSync(tempPath, buffer);
//           inputPath = tempPath;
//           console.log(`   ✅ Downloaded (${buffer.length} bytes)`);
//         } catch (err) {
//           console.warn(`   ⚠️ Download failed`);
//           const blackPath = path.join(dirs.outputDir, `black_${chunk_id}.png`);
//           if (!fs.existsSync(blackPath)) {
//             await sharp(createBlackFrame(width, height), {
//               raw: { width, height, channels: 3 },
//             })
//               .png()
//               .toFile(blackPath);
//           }
//           inputPath = blackPath;
//         }
//       } else {
//         inputPath = path.isAbsolute(image_filename)
//           ? image_filename
//           : path.join(dirs.imagesDir, image_filename);
//       }

//       if (fs.existsSync(inputPath)) {
//         console.log(`   🔧 Resizing image...`);
//         const resizedBuffer = await loadAndResizeImage(inputPath, width, height);
//         const resizedPath = path.join(dirs.outputDir, `resized_${chunk_id}.jpg`);
//         await sharp(resizedBuffer, {
//           raw: { width, height, channels: 3 },
//         })
//           .jpeg()
//           .toFile(resizedPath);
//         inputPath = resizedPath;
//         console.log(`   ✅ Resized`);
//       }
//     } else {
//       console.log(`   ⚫ Creating black frame`);
//       const blackPath = path.join(dirs.outputDir, `black_${chunk_id}.png`);
//       if (!fs.existsSync(blackPath)) {
//         await sharp(createBlackFrame(width, height), {
//           raw: { width, height, channels: 3 },
//         })
//           .png()
//           .toFile(blackPath);
//       }
//       inputPath = blackPath;
//     }

//     if (!fs.existsSync(inputPath)) {
//       throw new Error(`Input not found: ${inputPath}`);
//     }

//     const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
//     clipPaths.push(clipPath);

//     let filterComplex = `[0:v]${zoomPanEffect(
//       clipDuration,
//       direction || (i % 2 === 0 ? 'left' : 'bottom')
//     )}`;

//     if (overlayText && words.length > 0) {
//       // ✅ Convert absolute word timings to relative-to-scene timings
//       const relativeWords = words.map((w: any) => {
//         const startAbs = typeof w.start === 'number' ? w.start : 0;
//         const endAbs = typeof w.end === 'number' ? w.end : startAbs;
//         const sceneStart = (typeof scene.start_time === 'number') ? scene.start_time : 0;
//         return {
//           word: w.word,
//           start: Math.max(0, startAbs - sceneStart),
//           end: Math.max(0, endAbs - sceneStart),
//         };
//       });

//       const assFile = generateAssWithKaraoke(
//         dirs.outputDir,
//         chunk_id,
//         overlayText,
//         clipDuration,
//         relativeWords,
//         templates,
//         templateName,
//         smallestAspectRatio,
//         textStyle
//       );
//       filterComplex += `,ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
//     } else if (overlayText) {
//       const assFile = generateAssFromTemplate(
//         dirs.outputDir,
//         chunk_id,
//         overlayText,
//         clipDuration,
//         templates,
//         templateName,
//         smallestAspectRatio,
//         textStyle
//       );
//       filterComplex += `,ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
//     } else {
//       filterComplex += `[vfinal]`;
//     }

//     const args = [
//       '-y',
//       asset_type === 'image' ? '-loop' : '',
//       asset_type === 'image' ? '1' : '',
//       '-i',
//       inputPath,
//       '-filter_complex',
//       filterComplex,
//       '-map',
//       '[vfinal]',
//       '-r',
//       String(fps),
//       '-t',
//       String(clipDuration),
//       '-pix_fmt',
//       'yuv420p',
//       clipPath,
//     ].filter(Boolean);

//     console.log(`   🎬 Running FFmpeg...`);
//     await runFfmpeg(args);
//     console.log(`   ✅ Video created: ${clipPath}`);
//   }

//   console.log(`\n🎉 All scenes processed! Created ${clipPaths.length} clips.`);
//   console.log(`📁 Output: ${dirs.outputDir}\n`);
//   return clipPaths;
// }







// ✅ FIXED CODE - Duration audio ke according set hoga

import * as path from 'path';
import * as fs from 'fs';
import { zoomPanEffect } from 'src/utils/video.effects';
import sharp from 'sharp';
import axios from 'axios';

export function escapeFfmpegPath(filePath: string): string {
  let escaped = filePath.replace(/\\/g, '/');
  escaped = escaped.replace(/:/g, '\\:');
  return escaped;
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

function getDimensionsFromAspectRatio(aspectRatio: string) {
  const ratioMap: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '4:3': { width: 1440, height: 1080 },
  };
  return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
}

function createBlackFrame(width: number, height: number): Buffer {
  return Buffer.alloc(width * height * 3);
}

async function loadAndResizeImage(
  imagePath: string,
  width: number,
  height: number
): Promise<Buffer> {
  try {
    if (!fs.existsSync(imagePath)) return createBlackFrame(width, height);

    const metadata = await sharp(imagePath).metadata();
    const imgWidth = metadata.width || width;
    const imgHeight = metadata.height || height;
    const scale = Math.min(width / imgWidth, height / imgHeight);
    const newWidth = Math.round(imgWidth * scale);
    const newHeight = Math.round(imgHeight * scale);

    const resizedImage = await sharp(imagePath)
      .resize(newWidth, newHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0 },
      })
      .raw()
      .toBuffer();

    const background = Buffer.alloc(width * height * 3);
    const yOffset = Math.floor((height - newHeight) / 2);
    const xOffset = Math.floor((width - newWidth) / 2);

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcIdx = (y * newWidth + x) * 3;
        const destIdx = ((y + yOffset) * width + (x + xOffset)) * 3;
        background[destIdx] = resizedImage[srcIdx];
        background[destIdx + 1] = resizedImage[srcIdx + 1];
        background[destIdx + 2] = resizedImage[srcIdx + 2];
      }
    }

    return background;
  } catch (err) {
    console.error('Error resizing image', err);
    return createBlackFrame(width, height);
  }
}

const toTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const wholeSeconds = Math.floor(sec);
  const centiseconds = Math.round((sec - wholeSeconds) * 100);
  const paddedCs = centiseconds.toString().padStart(2, '0');

  return `${h}:${m.toString().padStart(2, '0')}:${wholeSeconds
    .toString()
    .padStart(2, '0')}.${paddedCs}`;
};

function escapeAssText(text: string): string {
  return text;
}

function buildWordTimeline(words: Array<{ word: string; start: number; end: number }>) {
  const timeline: Array<{ 
    wordIndex: number;
    displayStart: number; 
    displayEnd: number; 
    isGap: boolean;
  }> = [];

  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    
    timeline.push({
      wordIndex: i,
      displayStart: current.start,
      displayEnd: current.end,
      isGap: false,
    });

    if (i < words.length - 1) {
      const next = words[i + 1];
      if (next.start > current.end) {
        timeline.push({
          wordIndex: i,
          displayStart: current.end,
          displayEnd: next.start,
          isGap: true,
        });
      }
    }
  }

  return timeline;
}

export function generateAssWithKaraoke(
  outputDir: string,
  clipId: string,
  overlayText: string,
  sceneDuration: number,
  words: Array<{ word: string; start: number; end: number }>,
  templates: any,
  templateName: string,
  aspectRatio: string,
  styleName: string = 'Default'
): string {
  const template = templates[templateName];
  if (!template) throw new Error(`Template not found: ${templateName}`);
  
  const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
  if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
  
  const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

  let primaryColor = style.primary_colour || '&H00FFFFFF';
  let highlightColor = style.secondary_colour || '&H000000FF';

  primaryColor = primaryColor.replace(/&+/g, '&');
  highlightColor = highlightColor.replace(/&+/g, '&');

  const cleanHighlightColor = primaryColor.startsWith('&')
    ? highlightColor
    : `&${highlightColor}`;
  const cleanPrimaryColor = primaryColor.startsWith('&')
    ? primaryColor
    : `&${primaryColor}`;

  let dialogueEvents = '';

  console.log(
    `\n🎤 Karaoke: ${clipId} | Duration: ${sceneDuration.toFixed(2)}s`
  );

  if (words && words.length > 0) {
    const timeline = buildWordTimeline(words);

    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      const displayStart = entry.displayStart;
      const displayEnd = entry.displayEnd;
      const activeWordIndex = entry.wordIndex;

      console.log(
        `   Entry ${i + 1}/${timeline.length}: Word[${activeWordIndex}] "${words[activeWordIndex].word}" → ${toTime(
          displayStart
        )} to ${toTime(displayEnd)} ${entry.isGap ? '(GAP)' : '(ACTIVE)'}`
      );

      let textWithHighlight = '';

      for (let j = 0; j < words.length; j++) {
        if (j === activeWordIndex && !entry.isGap) {
          textWithHighlight += `{\\c${cleanHighlightColor}}${words[j].word}{\\c${cleanPrimaryColor}}`;
        } else {
          textWithHighlight += words[j].word;
        }
        
        if (j < words.length - 1) textWithHighlight += ' ';
      }

      const dialogueLine = `Dialogue: 0,${toTime(displayStart)},${toTime(
        displayEnd
      )},${styleName},,0,0,0,,${textWithHighlight}`;

      dialogueEvents += dialogueLine + '\n';
    }
  } else {
    console.log(`   No words, showing full text: ${overlayText}`);
    const dialogueLine = `Dialogue: 0,${toTime(0)},${toTime(
      sceneDuration
    )},${styleName},,0,0,0,,${overlayText}`;
    dialogueEvents = dialogueLine + '\n';
  }

  const content = `[Script Info]
Title: Clip_${clipId}_Karaoke
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleName},${style.fontname || 'Arial'},${style.fontsize},${primaryColor},${highlightColor},${style.outline_colour},${style.back_colour},${style.bold},${style.italic},${style.underline},${style.strikeout},${style.scale_x},${style.scale_y},${style.spacing},${style.angle},${style.border_style},${style.outline},${style.shadow},${style.alignment},${style.margin_l},${style.margin_r},${style.margin_v},${style.encoding}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueEvents}`;

  if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir, { recursive: true });
  
  const assPath = path.join(outputDir, `clip_${clipId}_karaoke.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  console.log(`   ✅ ASS file created: ${assPath}`);
  return assPath;
}

export function generateAssFromTemplate(
  outputDir: string,
  clipId: string,
  overlayText: string,
  sceneDuration: number,
  templates: any,
  templateName: string,
  aspectRatio: string,
  styleName: string = 'Highlight'
): string {
  const template = templates[templateName];
  if (!template) throw new Error(`Template not found: ${templateName}`);
  
  const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
  if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
  
  const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

  const wrappedText = wrapText(overlayText, 50);

  const content = `[Script Info]
Title: Clip_${clipId}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleName},${style.fontname || 'Arial'},${style.fontsize},${style.primary_colour},${style.secondary_colour},${style.outline_colour},${style.back_colour},${style.bold},${style.italic},${style.underline},${style.strikeout},${style.scale_x},${style.scale_y},${style.spacing},${style.angle},${style.border_style},${style.outline},${style.shadow},${style.alignment},${style.margin_l},${style.margin_r},${style.margin_v},${style.encoding}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${toTime(0)},${toTime(sceneDuration)},${styleName},,0,0,0,,${wrappedText}`;

  if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir, { recursive: true });
  
  const assPath = path.join(outputDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  return assPath;
}

// ✅ MAIN FIX: Scene duration calculation ko proper kiya
export async function zoom_effectAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
  templates: any,
  templateName: string = 'zoom_effect'
): Promise<string[]> {
  const clipPaths: string[] = [];

  let smallestArea = Infinity;
  let smallestAspectRatio = '16:9';

  console.log('\n====== ANALYZING IMAGES ======');

  for (const scene of scenes) {
    if (scene.image_filename) {
      const imgPath = path.isAbsolute(scene.image_filename)
        ? scene.image_filename
        : path.join(dirs.imagesDir, scene.image_filename);

      if (scene.image_filename.startsWith('http')) {
        try {
          console.log(`📥 Analyzing: ${scene.chunk_id}`);
          const response = await axios.get(scene.image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const metadata = await sharp(buffer).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            console.log(`   Size: ${metadata.width}x${metadata.height} (${area} px²)`);

            if (area < smallestArea) {
              smallestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.01) smallestAspectRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01) smallestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01) smallestAspectRatio = '4:3';
            }
          }
        } catch (err) {
          console.warn(`   ⚠️ Failed to fetch: ${scene.chunk_id}`);
        }
      } else if (fs.existsSync(imgPath)) {
        try {
          console.log(`📁 Analyzing: ${scene.chunk_id}`);
          const metadata = await sharp(imgPath).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            console.log(`   Size: ${metadata.width}x${metadata.height} (${area} px²)`);

            if (area < smallestArea) {
              smallestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.01) smallestAspectRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01) smallestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01) smallestAspectRatio = '4:3';
            }
          }
        } catch (err) {
          console.warn(`   ⚠️ Failed to analyze: ${scene.chunk_id}`);
        }
      }
    }
  }

  console.log(`\n✅ Aspect ratio selected: ${smallestAspectRatio}\n`);

  const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
  let styleIndex = 0;

  console.log('====== PROCESSING SCENES ======\n');

  // ✅ Calculate total expected duration
  const totalDuration = scenes.reduce((sum, s) => {
    const d = s.audio_duration || (s.end_time - s.start_time) || 0;
    return sum + d;
  }, 0);
  console.log(`ℹ️ Expected total video duration: ${totalDuration.toFixed(2)}s\n`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const {
      chunk_id,
      image_filename,
      video_filename,
      direction,
      overlayText,
      asset_type = 'image',
      words = [],
      start_time,
      end_time,
      audio_duration,
    } = scene;

    // ✅ FIX: Scene duration audio ke according calculate karo
    const clipDuration = audio_duration || (end_time - start_time) || 0;

    if (clipDuration <= 0) {
      console.warn(`⚠️ Scene ${chunk_id} has invalid duration (${clipDuration}s), skipping...`);
      continue;
    }

    console.log(`\n📍 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
    console.log(`   ⏱️ Duration: ${clipDuration.toFixed(2)}s (start: ${start_time}s, end: ${end_time}s)`);
    console.log(`   📝 Text: "${overlayText}"`);
    console.log(`   🎵 Words: ${words.length}`);

    const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);
    console.log(`   📐 Resolution: ${width}x${height}`);

    const textStyle = stylePattern[styleIndex];
    styleIndex = (styleIndex + 1) % stylePattern.length;
    console.log(`   🎨 Style: ${textStyle}`);

    let inputPath: string;

    if (asset_type === 'video' && video_filename) {
      inputPath = path.isAbsolute(video_filename)
        ? video_filename
        : path.join(dirs.imagesDir, video_filename);
      console.log(`   🎬 Video asset`);
    } else if (image_filename) {
      if (image_filename.startsWith('http')) {
        try {
          console.log(`   📥 Downloading image...`);
          const response = await axios.get(image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const tempPath = path.join(dirs.outputDir, `downloaded_${chunk_id}.jpg`);
          fs.writeFileSync(tempPath, buffer);
          inputPath = tempPath;
          console.log(`   ✅ Downloaded (${buffer.length} bytes)`);
        } catch (err) {
          console.warn(`   ⚠️ Download failed`);
          const blackPath = path.join(dirs.outputDir, `black_${chunk_id}.png`);
          if (!fs.existsSync(blackPath)) {
            await sharp(createBlackFrame(width, height), {
              raw: { width, height, channels: 3 },
            })
              .png()
              .toFile(blackPath);
          }
          inputPath = blackPath;
        }
      } else {
        inputPath = path.isAbsolute(image_filename)
          ? image_filename
          : path.join(dirs.imagesDir, image_filename);
      }

      if (fs.existsSync(inputPath)) {
        console.log(`   🔧 Resizing image...`);
        const resizedBuffer = await loadAndResizeImage(inputPath, width, height);
        const resizedPath = path.join(dirs.outputDir, `resized_${chunk_id}.jpg`);
        await sharp(resizedBuffer, {
          raw: { width, height, channels: 3 },
        })
          .jpeg()
          .toFile(resizedPath);
        inputPath = resizedPath;
        console.log(`   ✅ Resized`);
      }
    } else {
      console.log(`   ⚫ Creating black frame`);
      const blackPath = path.join(dirs.outputDir, `black_${chunk_id}.png`);
      if (!fs.existsSync(blackPath)) {
        await sharp(createBlackFrame(width, height), {
          raw: { width, height, channels: 3 },
        })
          .png()
          .toFile(blackPath);
      }
      inputPath = blackPath;
    }

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input not found: ${inputPath}`);
    }

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    let filterComplex = `[0:v]${zoomPanEffect(
      clipDuration,
      direction || (i % 2 === 0 ? 'left' : 'bottom')
    )}`;

    if (overlayText && words.length > 0) {
      // ✅ Convert absolute word timings to relative (scene ke start se)
      const relativeWords = words.map((w: any) => {
        const startAbs = typeof w.start === 'number' ? w.start : 0;
        const endAbs = typeof w.end === 'number' ? w.end : startAbs;
        const sceneStart = typeof start_time === 'number' ? start_time : 0;
        
        return {
          word: w.word,
          start: Math.max(0, startAbs - sceneStart),
          end: Math.max(0, endAbs - sceneStart),
        };
      });

      console.log(`   🎵 Relative word timings:`);
      relativeWords.forEach((w: any, idx: number) => {
        console.log(`      ${idx + 1}. "${w.word}" → ${w.start.toFixed(2)}s to ${w.end.toFixed(2)}s`);
      });

      const assFile = generateAssWithKaraoke(
        dirs.outputDir,
        chunk_id,
        overlayText,
        clipDuration,
        relativeWords,
        templates,
        templateName,
        smallestAspectRatio,
        textStyle
      );
      filterComplex += `,ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
    } else if (overlayText) {
      const assFile = generateAssFromTemplate(
        dirs.outputDir,
        chunk_id,
        overlayText,
        clipDuration,
        templates,
        templateName,
        smallestAspectRatio,
        textStyle
      );
      filterComplex += `,ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
    } else {
      filterComplex += `[vfinal]`;
    }

    const args = [
      '-y',
      asset_type === 'image' ? '-loop' : '',
      asset_type === 'image' ? '1' : '',
      '-i',
      inputPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vfinal]',
      '-r',
      String(fps),
      '-t',
      String(clipDuration), // ✅ Exact duration audio ke according
      '-pix_fmt',
      'yuv420p',
      clipPath,
    ].filter(Boolean);

    console.log(`   🎬 Running FFmpeg with duration: ${clipDuration.toFixed(2)}s...`);
    await runFfmpeg(args);
    console.log(`   ✅ Video created: ${clipPath}`);
  }

  console.log(`\n🎉 All scenes processed! Created ${clipPaths.length} clips.`);
  console.log(`📁 Output: ${dirs.outputDir}\n`);
  return clipPaths;
}



