
import * as path from 'path';
import * as fs from 'fs';
import { zoomPanEffect } from 'src/utils/video.effects';
import sharp from 'sharp';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createBlackFrame, escapeFfmpegPath, generateAssFromTemplate, generateAssWithKaraoke, getDimensionsFromAspectRatio, resizeLogoWithAspectRatio } from 'src/utils/common.utils';

const execPromise = promisify(exec);


async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
    );
    const [width, height] = stdout.trim().split('x').map(Number);
    if (width && height) {
      return { width, height };
    }
  } catch (err: any) {
    console.error(`   ❌ Error getting video dimensions: ${err.message}`);
  }
  return null;
}


function getZoomEffect(index: number): 'zoom_in' | 'zoom_out' | 'pan' {
  // Pattern: Pan (3x) → Zoom In → Pan (2x) → Zoom Out → Repeat
  const patternPosition = index % 7;
  
  if (patternPosition === 0 || patternPosition === 1 || patternPosition === 2) {
    return 'pan';  // First 3: Pan
  } else if (patternPosition === 3) {
    return 'zoom_in';  // 4th: Zoom In
  } else if (patternPosition === 4 || patternPosition === 5) {
    return 'pan';  // 5th & 6th: Pan
  } else {
    return 'zoom_out';  // 7th: Zoom Out
  }
}

function createZoomInEffect(duration: number, width: number = 1920, height: number = 1080): string {
  const frames = Math.floor(duration * 25);
  return `zoompan=z='min(1.15,1+0.15*on/${frames})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=25`;
}

function createZoomOutEffect(duration: number, width: number = 1920, height: number = 1080): string {
  const frames = Math.floor(duration * 25);
  return `zoompan=z='max(1,1.15-0.15*on/${frames})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=25`;
}


function createUnifiedAspectRatioFilter(
  isVideo: boolean,
  zoomEffect: string,
  duration: number,
  width: number,
  height: number,
  direction: string,
  isLastWithLogo: boolean
): string {
  // Base filter - exact dimensions ke liye
  const baseFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  
  if (isVideo) {
    // VIDEO: No movement - sirf scale+crop
    console.log(`      🎥 VIDEO: Static (no movement) ${width}x${height}`);
    return `[0:v]${baseFilter}[vzoomed]`;
  }
  
  if (isLastWithLogo) {
    // LAST CLIP WITH LOGO: No movement
    console.log(`      🏷️  LAST CLIP WITH LOGO: Static (no movement) ${width}x${height}`);
    return `[0:v]${baseFilter}[vzoomed]`;
  }
  
  // IMAGE: Movement effects apply hogi
  if (zoomEffect === 'zoom_in') {
    console.log(`      🔍 IMAGE: Zoom In effect ${width}x${height}`);
    return `[0:v]${baseFilter},${createZoomInEffect(duration, width, height)}[vzoomed]`;
  } else if (zoomEffect === 'zoom_out') {
    console.log(`      🔎 IMAGE: Zoom Out effect ${width}x${height}`);
    return `[0:v]${baseFilter},${createZoomOutEffect(duration, width, height)}[vzoomed]`;
  } else if (zoomEffect === 'pan') {
    console.log(`      ↔️  IMAGE: Pan ${direction} effect ${width}x${height}`);
    return `[0:v]${baseFilter},${zoomPanEffect(duration, direction)}[vzoomed]`;
  } else {
    console.log(`      ⏸️  IMAGE: Static ${width}x${height}`);
    return `[0:v]${baseFilter}[vzoomed]`;
  }
}

export async function zoom_effectAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
  templates: any,
  templateName: string = 'zoom_effect',
  logoPath?: string,
  forceAspectRatio?: string
): Promise<string[]> {
  const clipPaths: string[] = [];

  try {
 
    let targetAspectRatio = forceAspectRatio || '16:9';
    
    console.log('\n====== ASPECT RATIO DETECTION ======');
    
    if (!forceAspectRatio) {
      console.log('🔍 Auto-detecting aspect ratio from media...');
      
      const ratioCount: Record<string, number> = {};
      
      for (const scene of scenes) {
        const mediaFile = scene.video_filename || scene.image_filename;
        const assetType = scene.asset_type || 'image';
        
        if (!mediaFile) continue;

        try {
          let detectedRatio = '16:9';
          
          if (assetType === 'video' && scene.video_filename) {
            const videoPath = path.isAbsolute(scene.video_filename)
              ? scene.video_filename
              : path.join(dirs.imagesDir, scene.video_filename);
            
            if (fs.existsSync(videoPath)) {
              const dimensions = await getVideoDimensions(videoPath);
              if (dimensions) {
                const ratio = dimensions.width / dimensions.height;
                if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
                else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
                else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
                else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
                else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
              }
            }
          } else if (mediaFile.startsWith('http')) {
            const response = await axios.get(mediaFile, {
              responseType: 'arraybuffer',
              timeout: 5000
            });
            const buffer = Buffer.from(response.data);
            const metadata = await sharp(buffer).metadata();

            if (metadata.width && metadata.height) {
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
            }
          } else if (fs.existsSync(mediaFile)) {
            const metadata = await sharp(mediaFile).metadata();

            if (metadata.width && metadata.height) {
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
            }
          }
          
          ratioCount[detectedRatio] = (ratioCount[detectedRatio] || 0) + 1;
        } catch (err: any) {
          console.warn(`Failed to analyze: ${scene.chunk_id}`);
        }
      }
      
      if (Object.keys(ratioCount).length > 0) {
        targetAspectRatio = Object.entries(ratioCount)
          .sort((a, b) => b[1] - a[1])[0][0];
        console.log(` Detected ratios:`, ratioCount);
      }
    } else {
      console.log(` Using forced aspect ratio: ${forceAspectRatio}`);
    }

    const { width, height } = getDimensionsFromAspectRatio(targetAspectRatio);
    
    console.log(`\n LOCKED ASPECT RATIO: ${targetAspectRatio}`);
    console.log(`LOCKED DIMENSIONS: ${width}x${height}`);
    console.log(` ALL clips will be ${width}x${height} - GUARANTEED!`);
    console.log(`  Logo: ${logoPath ? 'Yes' : 'No'}`);
    console.log(` Image movement: ENABLED`);
    console.log(` Video movement: DISABLED\n`);

    const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
    let styleIndex = 0;


    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const isLastClip = i === scenes.length - 1;
      const hasLogoOnLastClip = isLastClip && logoPath && fs.existsSync(logoPath);
      
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

      console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
      console.log(`   Type: ${asset_type.toUpperCase()}`);

      let clipDuration: number;
      let gapAfter = 0;
      
      if (i < scenes.length - 1) {
        const nextScene = scenes[i + 1];
        gapAfter = nextScene.start_time - end_time;
        
        if (gapAfter > 0.01) {
          clipDuration = audio_duration + gapAfter;
          console.log(`   Gap: +${gapAfter.toFixed(2)}s`);
          console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
        } else {
          clipDuration = audio_duration || (end_time - start_time) || 0;
          console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
        }
      } else {
        clipDuration = audio_duration || (end_time - start_time) || 0;
        console.log(`   Duration: ${clipDuration.toFixed(2)}s (LAST)`);
      }

      if (clipDuration <= 0) {
        console.warn(`   ⚠️  Invalid duration, skipping`);
        continue;
      }

      console.log(`   Text: "${overlayText || 'None'}"`);
      
      const isVideoAsset = asset_type === 'video';
      
      // ⭐ Movement logic:
      // - Video: no movement
      // - Last clip with logo: no movement
      // - Images: movement (zoom/pan)
      let zoomEffect: string;
      if (isVideoAsset) {
        zoomEffect = 'none';
      } else if (hasLogoOnLastClip) {
        zoomEffect = 'none';
      } else {
        const effect = getZoomEffect(i);
        zoomEffect = effect;
      }
      
      const panDirection = direction || (i % 2 === 0 ? 'left' : 'right');
      
      let effectEmoji = '⏸️';
      if (isVideoAsset) {
        effectEmoji = '🎥';
      } else if (hasLogoOnLastClip) {
        effectEmoji = '🏷️';
      } else if (zoomEffect === 'zoom_in') {
        effectEmoji = '🔍';
      } else if (zoomEffect === 'zoom_out') {
        effectEmoji = '🔎';
      } else if (zoomEffect === 'pan') {
        effectEmoji = '↔️';
      }
      
      console.log(`   ${effectEmoji} Effect: ${zoomEffect.toUpperCase()}${zoomEffect === 'pan' ? ` (${panDirection})` : ''}`);
      console.log(`   📏 Output: ${width}x${height} (LOCKED)`);

      const textStyle = stylePattern[styleIndex];
      styleIndex = (styleIndex + 1) % stylePattern.length;
      
      let inputPath: string = '';

      // ========== IMAGE HANDLING ==========
      if (!isVideoAsset && image_filename) {
        if (image_filename.startsWith('http')) {
          try {
            console.log(`   📥 Downloading...`);
            const response = await axios.get(image_filename, {
              responseType: 'arraybuffer',
              timeout: 10000
            });
            const buffer = Buffer.from(response.data);
            const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
            fs.writeFileSync(tempPath, buffer);
            inputPath = tempPath;
            console.log(`   ✅ Downloaded`);
          } catch (err: any) {
            console.warn(`   ⚠️  Download failed: ${err.message}`);
            inputPath = '';
          }
        } else {
          inputPath = path.isAbsolute(image_filename)
            ? image_filename
            : path.join(dirs.imagesDir, image_filename);
        }
      }
      // ========== VIDEO HANDLING ==========
      else if (isVideoAsset && video_filename) {
        inputPath = path.isAbsolute(video_filename)
          ? video_filename
          : path.join(dirs.imagesDir, video_filename);
        
        if (!fs.existsSync(inputPath)) {
          console.error(`   ❌ Video not found: ${inputPath}`);
          continue;
        }
        console.log(`   📹 Video ready`);
      }
      // ========== BLACK FRAME FALLBACK ==========
      else {
        console.log(`   ⚫ Creating black frame`);
        const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.jpg`);
        if (!fs.existsSync(blackPath)) {
          await sharp(createBlackFrame(width, height), {
            raw: { width, height, channels: 3 },
          })
            .jpeg()
            .toFile(blackPath);
        }
        inputPath = blackPath;
      }

      if (!inputPath || !fs.existsSync(inputPath)) {
        console.error(`   ❌ Input not found`);
        continue;
      }

      const clipPath = path.join(dirs.clipsDir, `clip_${chunk_id}.mp4`);
      clipPaths.push(clipPath);

      // ========== BUILD FFMPEG FILTER ==========
      let filterComplex = createUnifiedAspectRatioFilter(
        isVideoAsset,
        zoomEffect,
        clipDuration,
        width,
        height,
        panDirection,
        hasLogoOnLastClip || false
      );

      const args: string[] = [
        '-y',
        !isVideoAsset ? '-loop' : '',
        !isVideoAsset ? '1' : '',
        '-i',
        inputPath,
      ].filter(Boolean);

      // ========== LOGO HANDLING FOR LAST CLIP ==========
      if (hasLogoOnLastClip) {
        const logoMaxWidth = Math.floor(width * 0.15);
        const logoMaxHeight = Math.floor(height * 0.15);
        
        const resizedLogoPath = await resizeLogoWithAspectRatio(
          logoPath!,
          logoMaxWidth,
          logoMaxHeight,
          dirs.resizedDir,
          chunk_id
        );
        
        if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
          args.push('-i', resizedLogoPath);
          
          // Logo overlay with correct dimensions
          if (isVideoAsset) {
            // VIDEO + LOGO: No blur
            filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[vzoomed];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[vzoomed][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
          } else {
            // IMAGE + LOGO: With blur
            filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[vzoomed];[vzoomed]boxblur=5:1[blurred];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
          }
          
          console.log(`   🏷️  Logo overlay applied (${width}x${height})`);
        }
      }

      // ========== TEXT OVERLAY HANDLING ==========
      if (overlayText && words.length > 0) {
        const sceneStart = typeof start_time === 'number' ? start_time : 0;
        
        const relativeWords = words.map((w: any) => {
          const startAbs = typeof w.start === 'number' ? w.start : 0;
          const endAbs = typeof w.end === 'number' ? w.end : startAbs;
          
          const relStart = Math.max(0, startAbs - sceneStart);
          const relEnd = Math.max(0, endAbs - sceneStart);
          
          return {
            word: w.word,
            start: Math.min(relStart, audio_duration),
            end: Math.min(relEnd, audio_duration),
          };
        });

        console.log(`   🎵 Karaoke (${relativeWords.length} words)`);
        
        const assFile = generateAssWithKaraoke(
          dirs.assDir,
          chunk_id,
          overlayText,
          audio_duration,
          relativeWords,
          templates,
          templateName,
          targetAspectRatio,
          textStyle
        );
        
        const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
        filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
      } else if (overlayText) {
        const assFile = generateAssFromTemplate(
          dirs.assDir,
          chunk_id,
          overlayText,
          audio_duration || clipDuration,
          templates,
          templateName,
          targetAspectRatio,
          textStyle
        );
        
        const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
        filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
      } else {
        const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
        filterComplex = filterComplex.replace(`[${baseLayer}]`, '[vfinal]');
      }

      // ========== FFMPEG ENCODING ==========
      args.push(
        '-filter_complex',
        filterComplex,
        '-map',
        '[vfinal]',
        '-s',
        `${width}x${height}`,
        '-aspect',
        targetAspectRatio,
        '-r',
        String(fps),
        '-t',
        String(clipDuration.toFixed(3)),
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '23',
        clipPath
      );

      console.log(`   🎬 Encoding to ${width}x${height}...`);
      
      try {
        await runFfmpeg(args);
        console.log(`   ✅ Encoded: ${path.basename(clipPath)}`);
        
        // Verify output dimensions
        const outputDims = await getVideoDimensions(clipPath);
        if (outputDims) {
          if (outputDims.width === width && outputDims.height === height) {
            console.log(`   ✅ VERIFIED: ${outputDims.width}x${outputDims.height} ✓✓✓`);
          } else {
            console.error(`   ❌ MISMATCH: Expected ${width}x${height}, got ${outputDims.width}x${outputDims.height}`);
          }
        }
      } catch (err: any) {
        console.error(`   ❌ FFmpeg error: ${err.message}`);
        continue;
      }
    }

    const finalDuration = scenes.reduce((sum, s, idx) => {
      let dur = s.audio_duration || 0;
      
      if (idx < scenes.length - 1) {
        const nextScene = scenes[idx + 1];
        const gap = nextScene.start_time - s.end_time;
        if (gap > 0.01) dur += gap;
      }
      
      return sum + dur;
    }, 0);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ ALL CLIPS PROCESSED WITH UNIFIED DIMENSIONS!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Total clips: ${clipPaths.length}`);
    console.log(`🔒 LOCKED dimensions: ${width}x${height}`);
    console.log(`🔒 LOCKED aspect ratio: ${targetAspectRatio}`);
    console.log(`⏱️  Total duration: ${finalDuration.toFixed(2)}s`);
    console.log(`✅ 100% consistent aspect ratio - GUARANTEED!`);
    console.log(`🎬 Image movement: ENABLED (zoom/pan)`);
    console.log(`🎥 Video clips: STATIC (no movement)`);
    console.log(`🏷️  Last clip with logo: STATIC (no movement)`);
    console.log(`📁 Output: ${dirs.clipsDir}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return clipPaths;
  } catch (err: any) {
    console.error(`\n❌ Critical error: ${err.message}`);
    console.error(err.stack);
    throw err;
  }
}











// import * as path from 'path';
// import * as fs from 'fs';
// import { zoomPanEffect } from 'src/utils/video.effects';
// import sharp from 'sharp';
// import axios from 'axios';
// import { exec } from 'child_process';
// import { promisify } from 'util';

// const execPromise = promisify(exec);

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

// async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number } | null> {
//   try {
//     const { stdout } = await execPromise(
//       `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
//     );
//     const [width, height] = stdout.trim().split('x').map(Number);
//     if (width && height) {
//       return { width, height };
//     }
//   } catch (err: any) {
//     console.error(`   ❌ Error getting video dimensions: ${err.message}`);
//   }
//   return null;
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

// function splitWordsIntoChunks(
//   words: Array<{ word: string; start: number; end: number }>,
//   minWords: number = 5,
//   maxWords: number = 6
// ): Array<Array<{ word: string; start: number; end: number }>> {
//   const chunks: Array<Array<{ word: string; start: number; end: number }>> = [];
  
//   for (let i = 0; i < words.length; i += maxWords) {
//     const chunk = words.slice(i, i + maxWords);
//     chunks.push(chunk);
//   }
  
//   return chunks;
// }

// function buildWordTimelineWithChunks(
//   words: Array<{ word: string; start: number; end: number }>,
//   chunkSize: number = 6
// ) {
//   const chunks = splitWordsIntoChunks(words, 5, chunkSize);
//   const timeline: Array<{ 
//     chunkIndex: number;
//     wordIndexInChunk: number;
//     globalWordIndex: number;
//     displayStart: number; 
//     displayEnd: number; 
//     isGap: boolean;
//     wordsInChunk: Array<{ word: string; start: number; end: number }>;
//   }> = [];

//   chunks.forEach((chunk, chunkIndex) => {
//     for (let i = 0; i < chunk.length; i++) {
//       const current = chunk[i];
//       const globalIndex = chunkIndex * chunkSize + i;
      
//       timeline.push({
//         chunkIndex,
//         wordIndexInChunk: i,
//         globalWordIndex: globalIndex,
//         displayStart: current.start,
//         displayEnd: current.end,
//         isGap: false,
//         wordsInChunk: chunk,
//       });

//       if (i < chunk.length - 1) {
//         const next = chunk[i + 1];
//         if (next.start > current.end) {
//           timeline.push({
//             chunkIndex,
//             wordIndexInChunk: i,
//             globalWordIndex: globalIndex,
//             displayStart: current.end,
//             displayEnd: next.start,
//             isGap: true,
//             wordsInChunk: chunk,
//           });
//         }
//       }
//     }
//   });

//   return timeline;
// }

// function getZoomEffect(index: number): 'zoom_in' | 'zoom_out' | 'pan' {
//   // Pattern: Pan (3x) → Zoom In → Pan (2x) → Zoom Out → Repeat
//   const patternPosition = index % 7;
  
//   if (patternPosition === 0 || patternPosition === 1 || patternPosition === 2) {
//     return 'pan';  // First 3: Pan
//   } else if (patternPosition === 3) {
//     return 'zoom_in';  // 4th: Zoom In
//   } else if (patternPosition === 4 || patternPosition === 5) {
//     return 'pan';  // 5th & 6th: Pan
//   } else {
//     return 'zoom_out';  // 7th: Zoom Out
//   }
// }

// function createZoomInEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   const frames = Math.floor(duration * 25);
//   return `zoompan=z='min(1.15,1+0.15*on/${frames})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=25`;
// }

// function createZoomOutEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   const frames = Math.floor(duration * 25);
//   return `zoompan=z='max(1,1.15-0.15*on/${frames})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=25`;
// }

// export function generateAssWithKaraoke(
//   assDir: string,
//   clipId: string,
//   overlayText: string,
//   sceneDuration: number,
//   words: Array<{ word: string; start: number; end: number }>,
//   templates: any,
//   templateName: string,
//   aspectRatio: string,
//   styleName: string = 'Default'
// ): string {
//   try {
//     const template = templates[templateName];
//     if (!template) throw new Error(`Template not found: ${templateName}`);
    
//     const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
//     if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
    
//     const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

//     let primaryColor = style.primary_colour || '&H00FFFFFF';
//     let highlightColor = style.secondary_colour || '&H000000FF';

//     primaryColor = primaryColor.replace(/&+/g, '&');
//     highlightColor = highlightColor.replace(/&+/g, '&');

//     const cleanHighlightColor = primaryColor.startsWith('&')
//       ? highlightColor
//       : `&${highlightColor}`;
//     const cleanPrimaryColor = primaryColor.startsWith('&')
//       ? primaryColor
//       : `&${primaryColor}`;

//     let dialogueEvents = '';

//     if (words && words.length > 0) {
//       const timeline = buildWordTimelineWithChunks(words, 6);

//       for (let i = 0; i < timeline.length; i++) {
//         const entry = timeline[i];
//         const displayStart = entry.displayStart;
//         const displayEnd = entry.displayEnd;
//         const activeWordIndexInChunk = entry.wordIndexInChunk;
//         const chunk = entry.wordsInChunk;

//         let textWithHighlight = '';

//         for (let j = 0; j < chunk.length; j++) {
//           if (j === activeWordIndexInChunk && !entry.isGap) {
//             textWithHighlight += `{\\c${cleanHighlightColor}}${chunk[j].word}{\\c${cleanPrimaryColor}}`;
//           } else {
//             textWithHighlight += chunk[j].word;
//           }
          
//           if (j < chunk.length - 1) textWithHighlight += ' ';
//         }

//         const dialogueLine = `Dialogue: 0,${toTime(displayStart)},${toTime(
//           displayEnd
//         )},${styleName},,0,0,0,,${textWithHighlight}`;

//         dialogueEvents += dialogueLine + '\n';
//       }
//     } else {
//       const dialogueLine = `Dialogue: 0,${toTime(0)},${toTime(
//         sceneDuration
//       )},${styleName},,0,0,0,,${overlayText}`;
//       dialogueEvents = dialogueLine + '\n';
//     }

//     const content = `[Script Info]
// Title: Clip_${clipId}_Karaoke_Chunks
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

//     if (!fs.existsSync(assDir)) {
//       fs.mkdirSync(assDir, { recursive: true });
//     }
    
//     const assPath = path.join(assDir, `clip_${clipId}_karaoke.ass`);
//     fs.writeFileSync(assPath, content, 'utf-8');
//     return assPath;
//   } catch (err: any) {
//     console.error(`   ❌ Error creating ASS file: ${err.message}`);
//     throw err;
//   }
// }

// export function generateAssFromTemplate(
//   assDir: string,
//   clipId: string,
//   overlayText: string,
//   sceneDuration: number,
//   templates: any,
//   templateName: string,
//   aspectRatio: string,
//   styleName: string = 'Highlight'
// ): string {
//   try {
//     const template = templates[templateName];
//     if (!template) throw new Error(`Template not found: ${templateName}`);
    
//     const ratioObj = template.aspect_ratios[aspectRatio] || template.aspect_ratios['16:9'];
//     if (!ratioObj) throw new Error(`Aspect ratio not found: ${aspectRatio}`);
    
//     const style = ratioObj.styles[styleName] || ratioObj.styles['Default'];

//     const wrappedText = wrapText(overlayText, 50);

//     const content = `[Script Info]
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

//     if (!fs.existsSync(assDir)) {
//       fs.mkdirSync(assDir, { recursive: true });
//     }
    
//     const assPath = path.join(assDir, `clip_${clipId}.ass`);
//     fs.writeFileSync(assPath, content, 'utf-8');
//     return assPath;
//   } catch (err: any) {
//     console.error(`   ❌ Error creating ASS file: ${err.message}`);
//     throw err;
//   }
// }

// async function resizeLogoWithAspectRatio(
//   logoPath: string,
//   maxWidth: number,
//   maxHeight: number,
//   resizedDir: string,
//   clipId: string
// ): Promise<string> {
//   try {
//     if (!fs.existsSync(logoPath)) {
//       console.warn(`   ⚠️  Logo not found: ${logoPath}`);
//       return '';
//     }

//     const metadata = await sharp(logoPath).metadata();
//     const logoWidth = metadata.width || maxWidth;
//     const logoHeight = metadata.height || maxHeight;

//     const scale = Math.min(maxWidth / logoWidth, maxHeight / logoHeight, 1);
//     const newWidth = Math.round(logoWidth * scale);
//     const newHeight = Math.round(logoHeight * scale);

//     if (!fs.existsSync(resizedDir)) {
//       fs.mkdirSync(resizedDir, { recursive: true });
//     }

//     const resizedLogoPath = path.join(resizedDir, `logo_resized_${clipId}.png`);
    
//     await sharp(logoPath)
//       .resize(newWidth, newHeight, {
//         fit: 'contain',
//         background: { r: 0, g: 0, b: 0, alpha: 0 },
//       })
//       .png()
//       .toFile(resizedLogoPath);

//     return resizedLogoPath;
//   } catch (err: any) {
//     console.error(`   ❌ Error resizing logo: ${err.message}`);
//     return '';
//   }
// }

// // ========== UNIFIED ASPECT RATIO FILTER WITH IMAGE MOVEMENT ==========
// function createUnifiedAspectRatioFilter(
//   isVideo: boolean,
//   zoomEffect: string,
//   duration: number,
//   width: number,
//   height: number,
//   direction: string,
//   isLastWithLogo: boolean
// ): string {
//   // Base filter - exact dimensions ke liye
//   const baseFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  
//   if (isVideo) {
//     // VIDEO: No movement - sirf scale+crop
//     console.log(`      🎥 VIDEO: Static (no movement) ${width}x${height}`);
//     return `[0:v]${baseFilter}[vzoomed]`;
//   }
  
//   if (isLastWithLogo) {
//     // LAST CLIP WITH LOGO: No movement
//     console.log(`      🏷️  LAST CLIP WITH LOGO: Static (no movement) ${width}x${height}`);
//     return `[0:v]${baseFilter}[vzoomed]`;
//   }
  
//   // IMAGE: Movement effects apply hogi
//   if (zoomEffect === 'zoom_in') {
//     console.log(`      🔍 IMAGE: Zoom In effect ${width}x${height}`);
//     return `[0:v]${baseFilter},${createZoomInEffect(duration, width, height)}[vzoomed]`;
//   } else if (zoomEffect === 'zoom_out') {
//     console.log(`      🔎 IMAGE: Zoom Out effect ${width}x${height}`);
//     return `[0:v]${baseFilter},${createZoomOutEffect(duration, width, height)}[vzoomed]`;
//   } else if (zoomEffect === 'pan') {
//     console.log(`      ↔️  IMAGE: Pan ${direction} effect ${width}x${height}`);
//     return `[0:v]${baseFilter},${zoomPanEffect(duration, direction)}[vzoomed]`;
//   } else {
//     console.log(`      ⏸️  IMAGE: Static ${width}x${height}`);
//     return `[0:v]${baseFilter}[vzoomed]`;
//   }
// }

// export async function zoom_effectAd(
//   scenes: any[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'zoom_effect',
//   logoPath?: string,
//   forceAspectRatio?: string
// ): Promise<string[]> {
//   const clipPaths: string[] = [];

//   try {
//     // ========== ASPECT RATIO DETECTION ==========
//     let targetAspectRatio = forceAspectRatio || '16:9';
    
//     console.log('\n====== ASPECT RATIO DETECTION ======');
    
//     if (!forceAspectRatio) {
//       console.log('🔍 Auto-detecting aspect ratio from media...');
      
//       const ratioCount: Record<string, number> = {};
      
//       for (const scene of scenes) {
//         const mediaFile = scene.video_filename || scene.image_filename;
//         const assetType = scene.asset_type || 'image';
        
//         if (!mediaFile) continue;

//         try {
//           let detectedRatio = '16:9';
          
//           if (assetType === 'video' && scene.video_filename) {
//             const videoPath = path.isAbsolute(scene.video_filename)
//               ? scene.video_filename
//               : path.join(dirs.imagesDir, scene.video_filename);
            
//             if (fs.existsSync(videoPath)) {
//               const dimensions = await getVideoDimensions(videoPath);
//               if (dimensions) {
//                 const ratio = dimensions.width / dimensions.height;
//                 if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
//                 else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
//                 else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
//                 else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
//                 else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
//               }
//             }
//           } else if (mediaFile.startsWith('http')) {
//             const response = await axios.get(mediaFile, {
//               responseType: 'arraybuffer',
//               timeout: 5000
//             });
//             const buffer = Buffer.from(response.data);
//             const metadata = await sharp(buffer).metadata();

//             if (metadata.width && metadata.height) {
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
//             }
//           } else if (fs.existsSync(mediaFile)) {
//             const metadata = await sharp(mediaFile).metadata();

//             if (metadata.width && metadata.height) {
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.1) detectedRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.1) detectedRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.1) detectedRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.1) detectedRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.1) detectedRatio = '4:3';
//             }
//           }
          
//           ratioCount[detectedRatio] = (ratioCount[detectedRatio] || 0) + 1;
//         } catch (err: any) {
//           console.warn(`    ⚠️  Failed to analyze: ${scene.chunk_id}`);
//         }
//       }
      
//       if (Object.keys(ratioCount).length > 0) {
//         targetAspectRatio = Object.entries(ratioCount)
//           .sort((a, b) => b[1] - a[1])[0][0];
//         console.log(`📊 Detected ratios:`, ratioCount);
//       }
//     } else {
//       console.log(`🎯 Using forced aspect ratio: ${forceAspectRatio}`);
//     }

//     const { width, height } = getDimensionsFromAspectRatio(targetAspectRatio);
    
//     console.log(`\n✅ LOCKED ASPECT RATIO: ${targetAspectRatio}`);
//     console.log(`✅ LOCKED DIMENSIONS: ${width}x${height}`);
//     console.log(`🔒 ALL clips will be ${width}x${height} - GUARANTEED!`);
//     console.log(`🏷️  Logo: ${logoPath ? 'Yes' : 'No'}`);
//     console.log(`🎬 Image movement: ENABLED`);
//     console.log(`🎥 Video movement: DISABLED\n`);

//     const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
//     let styleIndex = 0;

//     console.log('====== PROCESSING SCENES ======\n');

//     for (let i = 0; i < scenes.length; i++) {
//       const scene = scenes[i];
//       const isLastClip = i === scenes.length - 1;
//       const hasLogoOnLastClip = isLastClip && logoPath && fs.existsSync(logoPath);
      
//       const {
//         chunk_id,
//         image_filename,
//         video_filename,
//         direction,
//         overlayText,
//         asset_type = 'image',
//         words = [],
//         start_time,
//         end_time,
//         audio_duration,
//       } = scene;

//       console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
//       console.log(`   Type: ${asset_type.toUpperCase()}`);

//       let clipDuration: number;
//       let gapAfter = 0;
      
//       if (i < scenes.length - 1) {
//         const nextScene = scenes[i + 1];
//         gapAfter = nextScene.start_time - end_time;
        
//         if (gapAfter > 0.01) {
//           clipDuration = audio_duration + gapAfter;
//           console.log(`   Gap: +${gapAfter.toFixed(2)}s`);
//           console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
//         } else {
//           clipDuration = audio_duration || (end_time - start_time) || 0;
//           console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
//         }
//       } else {
//         clipDuration = audio_duration || (end_time - start_time) || 0;
//         console.log(`   Duration: ${clipDuration.toFixed(2)}s (LAST)`);
//       }

//       if (clipDuration <= 0) {
//         console.warn(`   ⚠️  Invalid duration, skipping`);
//         continue;
//       }

//       console.log(`   Text: "${overlayText || 'None'}"`);
      
//       const isVideoAsset = asset_type === 'video';
      
//       // ⭐ Movement logic:
//       // - Video: no movement
//       // - Last clip with logo: no movement
//       // - Images: movement (zoom/pan)
//       let zoomEffect: string;
//       if (isVideoAsset) {
//         zoomEffect = 'none';
//       } else if (hasLogoOnLastClip) {
//         zoomEffect = 'none';
//       } else {
//         const effect = getZoomEffect(i);
//         zoomEffect = effect;
//       }
      
//       const panDirection = direction || (i % 2 === 0 ? 'left' : 'right');
      
//       let effectEmoji = '⏸️';
//       if (isVideoAsset) {
//         effectEmoji = '🎥';
//       } else if (hasLogoOnLastClip) {
//         effectEmoji = '🏷️';
//       } else if (zoomEffect === 'zoom_in') {
//         effectEmoji = '🔍';
//       } else if (zoomEffect === 'zoom_out') {
//         effectEmoji = '🔎';
//       } else if (zoomEffect === 'pan') {
//         effectEmoji = '↔️';
//       }
      
//       console.log(`   ${effectEmoji} Effect: ${zoomEffect.toUpperCase()}${zoomEffect === 'pan' ? ` (${panDirection})` : ''}`);
//       console.log(`   📏 Output: ${width}x${height} (LOCKED)`);

//       const textStyle = stylePattern[styleIndex];
//       styleIndex = (styleIndex + 1) % stylePattern.length;
      
//       let inputPath: string = '';

//       // ========== IMAGE HANDLING ==========
//       if (!isVideoAsset && image_filename) {
//         if (image_filename.startsWith('http')) {
//           try {
//             console.log(`   📥 Downloading...`);
//             const response = await axios.get(image_filename, {
//               responseType: 'arraybuffer',
//               timeout: 10000
//             });
//             const buffer = Buffer.from(response.data);
//             const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
//             fs.writeFileSync(tempPath, buffer);
//             inputPath = tempPath;
//             console.log(`   ✅ Downloaded`);
//           } catch (err: any) {
//             console.warn(`   ⚠️  Download failed: ${err.message}`);
//             inputPath = '';
//           }
//         } else {
//           inputPath = path.isAbsolute(image_filename)
//             ? image_filename
//             : path.join(dirs.imagesDir, image_filename);
//         }
//       }
//       // ========== VIDEO HANDLING ==========
//       else if (isVideoAsset && video_filename) {
//         inputPath = path.isAbsolute(video_filename)
//           ? video_filename
//           : path.join(dirs.imagesDir, video_filename);
        
//         if (!fs.existsSync(inputPath)) {
//           console.error(`   ❌ Video not found: ${inputPath}`);
//           continue;
//         }
//         console.log(`   📹 Video ready`);
//       }
//       // ========== BLACK FRAME FALLBACK ==========
//       else {
//         console.log(`   ⚫ Creating black frame`);
//         const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.jpg`);
//         if (!fs.existsSync(blackPath)) {
//           await sharp(createBlackFrame(width, height), {
//             raw: { width, height, channels: 3 },
//           })
//             .jpeg()
//             .toFile(blackPath);
//         }
//         inputPath = blackPath;
//       }

//       if (!inputPath || !fs.existsSync(inputPath)) {
//         console.error(`   ❌ Input not found`);
//         continue;
//       }

//       const clipPath = path.join(dirs.clipsDir, `clip_${chunk_id}.mp4`);
//       clipPaths.push(clipPath);

//       // ========== BUILD FFMPEG FILTER ==========
//       let filterComplex = createUnifiedAspectRatioFilter(
//         isVideoAsset,
//         zoomEffect,
//         clipDuration,
//         width,
//         height,
//         panDirection,
//         hasLogoOnLastClip || false
//       );

//       const args: string[] = [
//         '-y',
//         !isVideoAsset ? '-loop' : '',
//         !isVideoAsset ? '1' : '',
//         '-i',
//         inputPath,
//       ].filter(Boolean);

//       // ========== LOGO HANDLING FOR LAST CLIP ==========
//       if (hasLogoOnLastClip) {
//         const logoMaxWidth = Math.floor(width * 0.15);
//         const logoMaxHeight = Math.floor(height * 0.15);
        
//         const resizedLogoPath = await resizeLogoWithAspectRatio(
//           logoPath!,
//           logoMaxWidth,
//           logoMaxHeight,
//           dirs.resizedDir,
//           chunk_id
//         );
        
//         if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
//           args.push('-i', resizedLogoPath);
          
//           // Logo overlay with correct dimensions
//           if (isVideoAsset) {
//             // VIDEO + LOGO: No blur
//             filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[vzoomed];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[vzoomed][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           } else {
//             // IMAGE + LOGO: With blur
//             filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[vzoomed];[vzoomed]boxblur=5:1[blurred];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           }
          
//           console.log(`   🏷️  Logo overlay applied (${width}x${height})`);
//         }
//       }

//       // ========== TEXT OVERLAY HANDLING ==========
//       if (overlayText && words.length > 0) {
//         const sceneStart = typeof start_time === 'number' ? start_time : 0;
        
//         const relativeWords = words.map((w: any) => {
//           const startAbs = typeof w.start === 'number' ? w.start : 0;
//           const endAbs = typeof w.end === 'number' ? w.end : startAbs;
          
//           const relStart = Math.max(0, startAbs - sceneStart);
//           const relEnd = Math.max(0, endAbs - sceneStart);
          
//           return {
//             word: w.word,
//             start: Math.min(relStart, audio_duration),
//             end: Math.min(relEnd, audio_duration),
//           };
//         });

//         console.log(`   🎵 Karaoke (${relativeWords.length} words)`);
        
//         const assFile = generateAssWithKaraoke(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration,
//           relativeWords,
//           templates,
//           templateName,
//           targetAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else if (overlayText) {
//         const assFile = generateAssFromTemplate(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration || clipDuration,
//           templates,
//           templateName,
//           targetAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else {
//         const baseLayer = hasLogoOnLastClip ? 'vwithlogo' : 'vzoomed';
//         filterComplex = filterComplex.replace(`[${baseLayer}]`, '[vfinal]');
//       }

//       // ========== FFMPEG ENCODING ==========
//       args.push(
//         '-filter_complex',
//         filterComplex,
//         '-map',
//         '[vfinal]',
//         '-s',
//         `${width}x${height}`,
//         '-aspect',
//         targetAspectRatio,
//         '-r',
//         String(fps),
//         '-t',
//         String(clipDuration.toFixed(3)),
//         '-pix_fmt',
//         'yuv420p',
//         '-c:v',
//         'libx264',
//         '-preset',
//         'medium',
//         '-crf',
//         '23',
//         clipPath
//       );

//       console.log(`   🎬 Encoding to ${width}x${height}...`);
      
//       try {
//         await runFfmpeg(args);
//         console.log(`   ✅ Encoded: ${path.basename(clipPath)}`);
        
//         // Verify output dimensions
//         const outputDims = await getVideoDimensions(clipPath);
//         if (outputDims) {
//           if (outputDims.width === width && outputDims.height === height) {
//             console.log(`   ✅ VERIFIED: ${outputDims.width}x${outputDims.height} ✓✓✓`);
//           } else {
//             console.error(`   ❌ MISMATCH: Expected ${width}x${height}, got ${outputDims.width}x${outputDims.height}`);
//           }
//         }
//       } catch (err: any) {
//         console.error(`   ❌ FFmpeg error: ${err.message}`);
//         continue;
//       }
//     }

//     const finalDuration = scenes.reduce((sum, s, idx) => {
//       let dur = s.audio_duration || 0;
      
//       if (idx < scenes.length - 1) {
//         const nextScene = scenes[idx + 1];
//         const gap = nextScene.start_time - s.end_time;
//         if (gap > 0.01) dur += gap;
//       }
      
//       return sum + dur;
//     }, 0);

//     console.log(`\n${'='.repeat(60)}`);
//     console.log(`✅ ALL CLIPS PROCESSED WITH UNIFIED DIMENSIONS!`);
//     console.log(`${'='.repeat(60)}`);
//     console.log(`📊 Total clips: ${clipPaths.length}`);
//     console.log(`🔒 LOCKED dimensions: ${width}x${height}`);
//     console.log(`🔒 LOCKED aspect ratio: ${targetAspectRatio}`);
//     console.log(`⏱️  Total duration: ${finalDuration.toFixed(2)}s`);
//     console.log(`✅ 100% consistent aspect ratio - GUARANTEED!`);
//     console.log(`🎬 Image movement: ENABLED (zoom/pan)`);
//     console.log(`🎥 Video clips: STATIC (no movement)`);
//     console.log(`🏷️  Last clip with logo: STATIC (no movement)`);
//     console.log(`📁 Output: ${dirs.clipsDir}`);
//     console.log(`${'='.repeat(60)}\n`);
    
//     return clipPaths;
//   } catch (err: any) {
//     console.error(`\n❌ Critical error: ${err.message}`);
//     console.error(err.stack);
//     throw err;
//   }
// }

