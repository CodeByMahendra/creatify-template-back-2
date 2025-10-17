import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';
import { createBlackFrame, generateAssWithKaraoke,escapeFfmpegPath, generateAssFromTemplate, getDimensionsFromAspectRatio, loadAndResizeImage, resizeLogoWithAspectRatio } from 'src/utils/common.utils';

function determineAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  
  const ratios = [
    { name: '16:9', value: 16/9 },
    { name: '9:16', value: 9/16 },
    { name: '1:1', value: 1 }
  ];
  
  let closestRatio = '16:9';
  let minDistance = Infinity;
  
  for (const r of ratios) {
    const distance = Math.abs(ratio - r.value);
    if (distance < minDistance) {
      minDistance = distance;
      closestRatio = r.name;
    }
  }
  
  return closestRatio;
}


async function createRoundedCard(
  inputPath: string,
  width: number,
  height: number,
  cornerRadius: number,
  outputPath: string
): Promise<void> {
  const cardWidth = Math.floor(width * 0.75);
  const cardHeight = Math.floor(height * 0.75);

  // Create SVG for rounded rectangle mask
  const roundedRectSVG = `
    <svg width="${cardWidth}" height="${cardHeight}">
      <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" 
            rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
    </svg>
  `;

  // Resize with CONTAIN to maintain aspect ratio, then apply mask
  await sharp(inputPath)
    .resize(cardWidth, cardHeight, {
      fit: 'contain',  // MAINTAINS ASPECT RATIO
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      position: 'center',
    })
    .composite([{
      input: Buffer.from(roundedRectSVG),
      blend: 'dest-in'
    }])
    .png()
    .toFile(outputPath);
}

function generateCardMotionFilter(
  duration: number, 
  width: number, 
  height: number,
  cardWidth: number,
  cardHeight: number
): string {
  const slideInDuration = Math.min(0.5, duration * 0.15);
  const disappearTime = duration - 0.05;
  
  const startX = -cardWidth;
  const centerX = (width - cardWidth) / 2;
  const centerY = (height - cardHeight) / 2;
  
  const xExpr = `if(lt(t,${slideInDuration}),${startX}+((${centerX})-(${startX}))*t/${slideInDuration},${centerX})`;
  
  return `x='${xExpr}':y=${centerY}:enable='between(t,0,${disappearTime})'`;
}

function generateVideoCardFilter(
  width: number,
  height: number,
  cardWidth: number,
  cardHeight: number,
  cornerRadius: number,
  duration: number
): string {
  const xExpr = generateCardMotionFilter(duration, width, height, cardWidth, cardHeight);
  
  // Simplified approach: Use scale+pad for aspect ratio, then create simple rounded rectangle overlay
  let filter = '';
  
  // Step 1: Create blur background
  filter += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];`;
  
  // Step 2: Resize video maintaining aspect ratio with black padding
  filter += `[0:v]scale=${cardWidth}:${cardHeight}:force_original_aspect_ratio=decrease,pad=${cardWidth}:${cardHeight}:(ow-iw)/2:(oh-ih)/2:black,format=yuva420p[padded];`;
  
  // Step 3: Create simple white rectangle mask
  filter += `color=white:s=${cardWidth}x${cardHeight}:d=${duration},format=yuva420p[mask];`;
  
  // Step 4: Use alphamerge to combine video with mask
  filter += `[padded][mask]alphamerge,format=rgba[card];`;
  
  // Step 5: Overlay card on blur background with motion
  filter += `[blurred][card]overlay=${xExpr}[vbase]`;
  
  return filter;
}

export async function card_motion_effectAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
  templates: any,
  templateName: string = 'card_motion',
  logoPath?: string
): Promise<string[]> {
  const clipPaths: string[] = [];

  let smallestArea = Infinity;
  let smallestAspectRatio = '16:9';

  console.log('\n= ANALYZING IMAGES ======');

  for (const scene of scenes) {
    if (scene.image_filename) {
      const imgPath = path.isAbsolute(scene.image_filename)
        ? scene.image_filename
        : path.join(dirs.imagesDir, scene.image_filename);

      if (scene.image_filename.startsWith('http')) {
        try {
          console.log(` Analyzing: ${scene.chunk_id}`);
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
          console.warn(`    Failed to fetch: ${scene.chunk_id}`);
        }
      } else if (fs.existsSync(imgPath)) {
        try {
          console.log(` Analyzing: ${scene.chunk_id}`);
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
          console.warn(`    Failed to analyze: ${scene.chunk_id}`);
        }
      }
    }
  }

  console.log(`\n✅ Aspect ratio selected: ${smallestAspectRatio}`);
  console.log(`🏷️  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

  const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
  let styleIndex = 0;

  console.log('====== PROCESSING SCENES WITH CARD MOTION EFFECT ======\n');

  const totalExpectedDuration = scenes.length > 0 
    ? Math.max(...scenes.map(s => s.end_time || 0))
    : 0;
  
  const totalAudioDuration = scenes.reduce((sum, s) => sum + (s.audio_duration || 0), 0);
  
  console.log(`Expected total timeline: ${totalExpectedDuration.toFixed(2)}s`);
  console.log(` Total audio duration: ${totalAudioDuration.toFixed(2)}s`);
  console.log(` Gap duration: ${(totalExpectedDuration - totalAudioDuration).toFixed(2)}s\n`);

  const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);
  const cardWidth = Math.floor(width * 0.75);
  const cardHeight = Math.floor(height * 0.75);
  const cornerRadius = 50;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const isLastClip = i === scenes.length - 1;
    
    const {
      chunk_id,
      image_filename,
      video_filename,
      overlayText,
      asset_type = 'image',
      words = [],
      start_time,
      end_time,
      audio_duration,
    } = scene;

    let clipDuration: number;
    let gapAfter = 0;
    
    if (i < scenes.length - 1) {
      const nextScene = scenes[i + 1];
      const currentEnd = end_time;
      const nextStart = nextScene.start_time;
      
      gapAfter = nextStart - currentEnd;
      
      if (gapAfter > 0.01) {
        console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
        console.log(`    Gap detected: ${gapAfter.toFixed(2)}s after this scene`);
        console.log(`    Original duration: ${audio_duration.toFixed(2)}s`);
        
        clipDuration = audio_duration + gapAfter;
        console.log(`    Extended duration: ${clipDuration.toFixed(2)}s (includes gap)`);
      } else {
        clipDuration = audio_duration || (end_time - start_time) || 0;
        console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
        console.log(`    Duration: ${clipDuration.toFixed(2)}s (no gap)`);
      }
    } else {
      clipDuration = audio_duration || (end_time - start_time) || 0;
      console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id}) - LAST SCENE`);
      console.log(`    Duration: ${clipDuration.toFixed(2)}s`);
      if (logoPath) {
        console.log(`    🏷️  Will show blur background + logo + karaoke text (no card)`);
      }
    }

    if (clipDuration <= 0) {
      console.warn(` Scene ${chunk_id} has invalid duration (${clipDuration}s), skipping...`);
      continue;
    }

    console.log(`    Timeline: ${start_time.toFixed(2)}s → ${end_time.toFixed(2)}s`);
    console.log(`    Text: "${overlayText}"`);
    console.log(`    Words: ${words.length}`);
    console.log(`    Resolution: ${width}x${height}`);
    console.log(`    Card size: ${cardWidth}x${cardHeight}`);
    console.log(`    Corner radius: ${cornerRadius}px`);
    console.log(`    ✅ ASPECT RATIO MAINTAINED`);

    const textStyle = stylePattern[styleIndex];
    styleIndex = (styleIndex + 1) % stylePattern.length;
    console.log(`    Style: ${textStyle}`);

    let inputPath: string;
    let isVideo = false;

    if (asset_type === 'video' && video_filename) {
      inputPath = path.isAbsolute(video_filename)
        ? video_filename
        : path.join(dirs.imagesDir, video_filename);
      isVideo = true;
      console.log(`    🎥 Video asset`);
    } else if (image_filename) {
      if (image_filename.startsWith('http')) {
        try {
          console.log(`    Downloading image...`);
          const response = await axios.get(image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
          fs.writeFileSync(tempPath, buffer);
          inputPath = tempPath;
          console.log(`    Downloaded (${buffer.length} bytes)`);
        } catch (err) {
          console.warn(`    Download failed`);
          const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
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
        console.log(`    🔧 Preparing image for card effect...`);
        const resizedBuffer = await loadAndResizeImage(inputPath, width, height);
        const resizedPath = path.join(dirs.resizedDir, `resized_${chunk_id}.jpg`);
        
        if (!fs.existsSync(dirs.resizedDir)) {
          fs.mkdirSync(dirs.resizedDir, { recursive: true });
        }
        
        await sharp(resizedBuffer, {
          raw: { width, height, channels: 3 },
        })
          .jpeg()
          .toFile(resizedPath);
        inputPath = resizedPath;
        console.log(`    ✅ Image prepared: ${resizedPath}`);
      }
    } else {
      console.log(`    ⚫ Creating black frame`);
      const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
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

    const clipPath = path.join(dirs.clipsDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    const args: string[] = ['-y'];

    let filterComplex = '';

    // For last clip with logo: show blur background + logo + karaoke text (no card)
    if (isLastClip && logoPath && fs.existsSync(logoPath)) {
      console.log(`    🎨 Last clip: Creating blur background + logo + karaoke text`);
      
      if (isVideo) {
        args.push('-i', inputPath);
      } else {
        args.push('-loop', '1', '-i', inputPath);
      }
      
      const resizedLogoPath = await resizeLogoWithAspectRatio(
        logoPath,
        Math.floor(width * 0.4),
        Math.floor(height * 0.4),
        dirs.resizedDir,
        chunk_id
      );
      
      if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
        args.push('-loop', '1', '-i', resizedLogoPath);
        
        // Blur background + logo (base layer for text overlay)
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.4)}):h=min(ih\\,${Math.floor(height * 0.4)}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vbase]`;
        
        console.log(`    ✅ Logo overlay added to blur background`);
      }
    } 
    // For other clips: show card with motion
    else {
      if (isVideo) {
        // Video processing with aspect ratio maintained
        console.log(`    🎥 Processing video with rounded card (ASPECT RATIO MAINTAINED)...`);
        args.push('-i', inputPath);
        
        // Use simplified filter that maintains aspect ratio
        filterComplex = generateVideoCardFilter(width, height, cardWidth, cardHeight, cornerRadius, clipDuration);
        
      } else {
        // Image processing with rounded corners (aspect ratio already maintained)
        args.push('-loop', '1', '-i', inputPath);
        
        const cardPath = path.join(dirs.resizedDir, `card_${chunk_id}.png`);
        console.log(`    🎴 Creating rounded card with ${cornerRadius}px corners (ASPECT RATIO MAINTAINED)...`);
        await createRoundedCard(inputPath, width, height, cornerRadius, cardPath);
        console.log(`    ✅ Rounded card created`);

        args.push('-loop', '1', '-i', cardPath);

        const xExpr = generateCardMotionFilter(clipDuration, width, height, cardWidth, cardHeight);
        
        // Blur background + card with instant disappear effect
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]format=rgba[card];[blurred][card]overlay=${xExpr}[vbase]`;
      }
    }

    // Add text overlay with karaoke for ALL clips (including last clip with logo)
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

      console.log(`    🎵 Karaoke timings (5-6 words chunks):`);
      relativeWords.forEach((w: any, idx: number) => {
        console.log(`       ${idx + 1}. "${w.word}" → ${w.start.toFixed(2)}s to ${w.end.toFixed(2)}s`);
      });
      
      if (gapAfter > 0.01) {
        console.log(`    ⏸️  Silent period: ${audio_duration.toFixed(2)}s to ${clipDuration.toFixed(2)}s`);
      }

      const assFile = generateAssWithKaraoke(
        dirs.assDir,
        chunk_id,
        overlayText,
        audio_duration,
        relativeWords,
        templates,
        templateName,
        smallestAspectRatio,
        textStyle
      );
      
      filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      
    } else if (overlayText) {
      const assFile = generateAssFromTemplate(
        dirs.assDir,
        chunk_id,
        overlayText,
        audio_duration || clipDuration,
        templates,
        templateName,
        smallestAspectRatio,
        textStyle
      );
      
      filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      
    } else {
      filterComplex = filterComplex.replace('[vbase]', '[vfinal]');
    }

    args.push(
      '-filter_complex',
      filterComplex,
      '-map',
      '[vfinal]',
      '-r',
      String(fps),
      '-t',
      String(clipDuration.toFixed(3)),
      '-pix_fmt',
      'yuv420p',
      clipPath
    );

    console.log(`    🎬 Running FFmpeg with ${isVideo ? 'video' : 'image'} card motion effect...`);
    await runFfmpeg(args);
    console.log(`    ✅ Video clip created: ${clipPath}`);
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

  console.log(`\n🎉 All scenes processed with card motion effect!`);
  console.log(`📊 Total clips created: ${clipPaths.length}`);
  console.log(`📊 Expected duration: ${totalExpectedDuration.toFixed(2)}s`);
  console.log(`📊 Calculated duration: ${finalDuration.toFixed(2)}s`);
  console.log(`🎴 Effect: Blur background + 75% card with ${cornerRadius}px rounded corners`);
  console.log(`✅ ASPECT RATIO: FULLY MAINTAINED for both images and videos`);
  console.log(`🎬 Animation: Slide in from left → Instant disappear from center`);
  console.log(`🎥 Video Support: Videos maintain aspect ratio with black padding`);
  if (logoPath) {
    console.log(`🏷️  Last clip: Blur background + logo + karaoke text (no card)`);
  } else {
    console.log(`🏷️  No logo: All clips show card with animation`);
  }
  console.log(`📁 Clips saved to: ${dirs.clipsDir}`);
  console.log(`📁 ASS files saved to: ${dirs.assDir}`);
  console.log(`📁 Resized files saved to: ${dirs.resizedDir}\n`);
  
  return clipPaths;
}



















// import * as path from 'path';
// import * as fs from 'fs';
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
//   };
//   return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
// }

// function determineAspectRatio(width: number, height: number): string {
//   const ratio = width / height;
  
//   const ratios = [
//     { name: '16:9', value: 16/9 },
//     { name: '9:16', value: 9/16 },
//     { name: '1:1', value: 1 }
//   ];
  
//   let closestRatio = '16:9';
//   let minDistance = Infinity;
  
//   for (const r of ratios) {
//     const distance = Math.abs(ratio - r.value);
//     if (distance < minDistance) {
//       minDistance = distance;
//       closestRatio = r.name;
//     }
//   }
  
//   return closestRatio;
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
//     `\n🎤 Karaoke with Chunks: ${clipId} | Duration: ${sceneDuration.toFixed(2)}s`
//   );

//   if (words && words.length > 0) {
//     const timeline = buildWordTimelineWithChunks(words, 6);

//     for (let i = 0; i < timeline.length; i++) {
//       const entry = timeline[i];
//       const displayStart = entry.displayStart;
//       const displayEnd = entry.displayEnd;
//       const activeWordIndexInChunk = entry.wordIndexInChunk;
//       const chunk = entry.wordsInChunk;

//       console.log(
//         `   Entry ${i + 1}/${timeline.length}: Chunk[${entry.chunkIndex}] Word[${activeWordIndexInChunk}] "${chunk[activeWordIndexInChunk].word}" → ${toTime(
//           displayStart
//         )} to ${toTime(displayEnd)} ${entry.isGap ? '(GAP)' : '(ACTIVE)'}`
//       );

//       let textWithHighlight = '';

//       for (let j = 0; j < chunk.length; j++) {
//         if (j === activeWordIndexInChunk && !entry.isGap) {
//           textWithHighlight += `{\\c${cleanHighlightColor}}${chunk[j].word}{\\c${cleanPrimaryColor}}`;
//         } else {
//           textWithHighlight += chunk[j].word;
//         }
        
//         if (j < chunk.length - 1) textWithHighlight += ' ';
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

//   if (!fs.existsSync(assDir))
//     fs.mkdirSync(assDir, { recursive: true });
  
//   const assPath = path.join(assDir, `clip_${clipId}_karaoke.ass`);
//   fs.writeFileSync(assPath, content, 'utf-8');
//   console.log(`   ✅ ASS file created: ${assPath}`);
//   return assPath;
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

//   if (!fs.existsSync(assDir))
//     fs.mkdirSync(assDir, { recursive: true });
  
//   const assPath = path.join(assDir, `clip_${clipId}.ass`);
//   fs.writeFileSync(assPath, content, 'utf-8');
//   console.log(`   ✅ ASS file created: ${assPath}`);
//   return assPath;
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

//     console.log(`   📏 Logo original: ${logoWidth}x${logoHeight}`);
//     console.log(`   📏 Logo resized: ${newWidth}x${newHeight}`);

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

//     console.log(`   ✅ Logo saved to: ${resizedLogoPath}`);
//     return resizedLogoPath;
//   } catch (err) {
//     console.error('   ❌ Error resizing logo:', err);
//     return '';
//   }
// }

// // Create rounded card image with ASPECT RATIO MAINTAINED
// async function createRoundedCard(
//   inputPath: string,
//   width: number,
//   height: number,
//   cornerRadius: number,
//   outputPath: string
// ): Promise<void> {
//   const cardWidth = Math.floor(width * 0.75);
//   const cardHeight = Math.floor(height * 0.75);

//   // Create SVG for rounded rectangle mask
//   const roundedRectSVG = `
//     <svg width="${cardWidth}" height="${cardHeight}">
//       <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" 
//             rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
//     </svg>
//   `;

//   // Resize with CONTAIN to maintain aspect ratio, then apply mask
//   await sharp(inputPath)
//     .resize(cardWidth, cardHeight, {
//       fit: 'contain',  // MAINTAINS ASPECT RATIO
//       background: { r: 0, g: 0, b: 0, alpha: 1 },
//       position: 'center',
//     })
//     .composite([{
//       input: Buffer.from(roundedRectSVG),
//       blend: 'dest-in'
//     }])
//     .png()
//     .toFile(outputPath);
// }

// function generateCardMotionFilter(
//   duration: number, 
//   width: number, 
//   height: number,
//   cardWidth: number,
//   cardHeight: number
// ): string {
//   const slideInDuration = Math.min(0.5, duration * 0.15);
//   const disappearTime = duration - 0.05;
  
//   const startX = -cardWidth;
//   const centerX = (width - cardWidth) / 2;
//   const centerY = (height - cardHeight) / 2;
  
//   const xExpr = `if(lt(t,${slideInDuration}),${startX}+((${centerX})-(${startX}))*t/${slideInDuration},${centerX})`;
  
//   return `x='${xExpr}':y=${centerY}:enable='between(t,0,${disappearTime})'`;
// }

// // IMPROVED: Simplified video card filter with aspect ratio maintenance
// function generateVideoCardFilter(
//   width: number,
//   height: number,
//   cardWidth: number,
//   cardHeight: number,
//   cornerRadius: number,
//   duration: number
// ): string {
//   const xExpr = generateCardMotionFilter(duration, width, height, cardWidth, cardHeight);
  
//   // Simplified approach: Use scale+pad for aspect ratio, then create simple rounded rectangle overlay
//   let filter = '';
  
//   // Step 1: Create blur background
//   filter += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];`;
  
//   // Step 2: Resize video maintaining aspect ratio with black padding
//   filter += `[0:v]scale=${cardWidth}:${cardHeight}:force_original_aspect_ratio=decrease,pad=${cardWidth}:${cardHeight}:(ow-iw)/2:(oh-ih)/2:black,format=yuva420p[padded];`;
  
//   // Step 3: Create simple white rectangle mask
//   filter += `color=white:s=${cardWidth}x${cardHeight}:d=${duration},format=yuva420p[mask];`;
  
//   // Step 4: Use alphamerge to combine video with mask
//   filter += `[padded][mask]alphamerge,format=rgba[card];`;
  
//   // Step 5: Overlay card on blur background with motion
//   filter += `[blurred][card]overlay=${xExpr}[vbase]`;
  
//   return filter;
// }

// export async function card_motion_effectAd(
//   scenes: any[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'card_motion',
//   logoPath?: string
// ): Promise<string[]> {
//   const clipPaths: string[] = [];

//   let smallestArea = Infinity;
//   let smallestAspectRatio = '16:9';

//   console.log('\n= ANALYZING IMAGES ======');

//   for (const scene of scenes) {
//     if (scene.image_filename) {
//       const imgPath = path.isAbsolute(scene.image_filename)
//         ? scene.image_filename
//         : path.join(dirs.imagesDir, scene.image_filename);

//       if (scene.image_filename.startsWith('http')) {
//         try {
//           console.log(` Analyzing: ${scene.chunk_id}`);
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
//           console.warn(`    Failed to fetch: ${scene.chunk_id}`);
//         }
//       } else if (fs.existsSync(imgPath)) {
//         try {
//           console.log(` Analyzing: ${scene.chunk_id}`);
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
//           console.warn(`    Failed to analyze: ${scene.chunk_id}`);
//         }
//       }
//     }
//   }

//   console.log(`\n✅ Aspect ratio selected: ${smallestAspectRatio}`);
//   console.log(`🏷️  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

//   const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
//   let styleIndex = 0;

//   console.log('====== PROCESSING SCENES WITH CARD MOTION EFFECT ======\n');

//   const totalExpectedDuration = scenes.length > 0 
//     ? Math.max(...scenes.map(s => s.end_time || 0))
//     : 0;
  
//   const totalAudioDuration = scenes.reduce((sum, s) => sum + (s.audio_duration || 0), 0);
  
//   console.log(`Expected total timeline: ${totalExpectedDuration.toFixed(2)}s`);
//   console.log(` Total audio duration: ${totalAudioDuration.toFixed(2)}s`);
//   console.log(` Gap duration: ${(totalExpectedDuration - totalAudioDuration).toFixed(2)}s\n`);

//   const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);
//   const cardWidth = Math.floor(width * 0.75);
//   const cardHeight = Math.floor(height * 0.75);
//   const cornerRadius = 50;

//   for (let i = 0; i < scenes.length; i++) {
//     const scene = scenes[i];
//     const isLastClip = i === scenes.length - 1;
    
//     const {
//       chunk_id,
//       image_filename,
//       video_filename,
//       overlayText,
//       asset_type = 'image',
//       words = [],
//       start_time,
//       end_time,
//       audio_duration,
//     } = scene;

//     let clipDuration: number;
//     let gapAfter = 0;
    
//     if (i < scenes.length - 1) {
//       const nextScene = scenes[i + 1];
//       const currentEnd = end_time;
//       const nextStart = nextScene.start_time;
      
//       gapAfter = nextStart - currentEnd;
      
//       if (gapAfter > 0.01) {
//         console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
//         console.log(`    Gap detected: ${gapAfter.toFixed(2)}s after this scene`);
//         console.log(`    Original duration: ${audio_duration.toFixed(2)}s`);
        
//         clipDuration = audio_duration + gapAfter;
//         console.log(`    Extended duration: ${clipDuration.toFixed(2)}s (includes gap)`);
//       } else {
//         clipDuration = audio_duration || (end_time - start_time) || 0;
//         console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id})`);
//         console.log(`    Duration: ${clipDuration.toFixed(2)}s (no gap)`);
//       }
//     } else {
//       clipDuration = audio_duration || (end_time - start_time) || 0;
//       console.log(`\n🎬 Scene ${i + 1}/${scenes.length} (${chunk_id}) - LAST SCENE`);
//       console.log(`    Duration: ${clipDuration.toFixed(2)}s`);
//       if (logoPath) {
//         console.log(`    🏷️  Will show blur background + logo + karaoke text (no card)`);
//       }
//     }

//     if (clipDuration <= 0) {
//       console.warn(` Scene ${chunk_id} has invalid duration (${clipDuration}s), skipping...`);
//       continue;
//     }

//     console.log(`    Timeline: ${start_time.toFixed(2)}s → ${end_time.toFixed(2)}s`);
//     console.log(`    Text: "${overlayText}"`);
//     console.log(`    Words: ${words.length}`);
//     console.log(`    Resolution: ${width}x${height}`);
//     console.log(`    Card size: ${cardWidth}x${cardHeight}`);
//     console.log(`    Corner radius: ${cornerRadius}px`);
//     console.log(`    ✅ ASPECT RATIO MAINTAINED`);

//     const textStyle = stylePattern[styleIndex];
//     styleIndex = (styleIndex + 1) % stylePattern.length;
//     console.log(`    Style: ${textStyle}`);

//     let inputPath: string;
//     let isVideo = false;

//     if (asset_type === 'video' && video_filename) {
//       inputPath = path.isAbsolute(video_filename)
//         ? video_filename
//         : path.join(dirs.imagesDir, video_filename);
//       isVideo = true;
//       console.log(`    🎥 Video asset`);
//     } else if (image_filename) {
//       if (image_filename.startsWith('http')) {
//         try {
//           console.log(`    Downloading image...`);
//           const response = await axios.get(image_filename, {
//             responseType: 'arraybuffer',
//           });
//           const buffer = Buffer.from(response.data);
//           const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
//           fs.writeFileSync(tempPath, buffer);
//           inputPath = tempPath;
//           console.log(`    Downloaded (${buffer.length} bytes)`);
//         } catch (err) {
//           console.warn(`    Download failed`);
//           const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
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
//         console.log(`    🔧 Preparing image for card effect...`);
//         const resizedBuffer = await loadAndResizeImage(inputPath, width, height);
//         const resizedPath = path.join(dirs.resizedDir, `resized_${chunk_id}.jpg`);
        
//         if (!fs.existsSync(dirs.resizedDir)) {
//           fs.mkdirSync(dirs.resizedDir, { recursive: true });
//         }
        
//         await sharp(resizedBuffer, {
//           raw: { width, height, channels: 3 },
//         })
//           .jpeg()
//           .toFile(resizedPath);
//         inputPath = resizedPath;
//         console.log(`    ✅ Image prepared: ${resizedPath}`);
//       }
//     } else {
//       console.log(`    ⚫ Creating black frame`);
//       const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
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

//     const clipPath = path.join(dirs.clipsDir, `clip_${chunk_id}.mp4`);
//     clipPaths.push(clipPath);

//     const args: string[] = ['-y'];

//     let filterComplex = '';

//     // For last clip with logo: show blur background + logo + karaoke text (no card)
//     if (isLastClip && logoPath && fs.existsSync(logoPath)) {
//       console.log(`    🎨 Last clip: Creating blur background + logo + karaoke text`);
      
//       if (isVideo) {
//         args.push('-i', inputPath);
//       } else {
//         args.push('-loop', '1', '-i', inputPath);
//       }
      
//       const resizedLogoPath = await resizeLogoWithAspectRatio(
//         logoPath,
//         Math.floor(width * 0.4),
//         Math.floor(height * 0.4),
//         dirs.resizedDir,
//         chunk_id
//       );
      
//       if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
//         args.push('-loop', '1', '-i', resizedLogoPath);
        
//         // Blur background + logo (base layer for text overlay)
//         filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.4)}):h=min(ih\\,${Math.floor(height * 0.4)}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vbase]`;
        
//         console.log(`    ✅ Logo overlay added to blur background`);
//       }
//     } 
//     // For other clips: show card with motion
//     else {
//       if (isVideo) {
//         // Video processing with aspect ratio maintained
//         console.log(`    🎥 Processing video with rounded card (ASPECT RATIO MAINTAINED)...`);
//         args.push('-i', inputPath);
        
//         // Use simplified filter that maintains aspect ratio
//         filterComplex = generateVideoCardFilter(width, height, cardWidth, cardHeight, cornerRadius, clipDuration);
        
//       } else {
//         // Image processing with rounded corners (aspect ratio already maintained)
//         args.push('-loop', '1', '-i', inputPath);
        
//         const cardPath = path.join(dirs.resizedDir, `card_${chunk_id}.png`);
//         console.log(`    🎴 Creating rounded card with ${cornerRadius}px corners (ASPECT RATIO MAINTAINED)...`);
//         await createRoundedCard(inputPath, width, height, cornerRadius, cardPath);
//         console.log(`    ✅ Rounded card created`);

//         args.push('-loop', '1', '-i', cardPath);

//         const xExpr = generateCardMotionFilter(clipDuration, width, height, cardWidth, cardHeight);
        
//         // Blur background + card with instant disappear effect
//         filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]format=rgba[card];[blurred][card]overlay=${xExpr}[vbase]`;
//       }
//     }

//     // Add text overlay with karaoke for ALL clips (including last clip with logo)
//     if (overlayText && words.length > 0) {
//       const sceneStart = typeof start_time === 'number' ? start_time : 0;
      
//       const relativeWords = words.map((w: any) => {
//         const startAbs = typeof w.start === 'number' ? w.start : 0;
//         const endAbs = typeof w.end === 'number' ? w.end : startAbs;
        
//         const relStart = Math.max(0, startAbs - sceneStart);
//         const relEnd = Math.max(0, endAbs - sceneStart);
        
//         return {
//           word: w.word,
//           start: Math.min(relStart, audio_duration),
//           end: Math.min(relEnd, audio_duration),
//         };
//       });

//       console.log(`    🎵 Karaoke timings (5-6 words chunks):`);
//       relativeWords.forEach((w: any, idx: number) => {
//         console.log(`       ${idx + 1}. "${w.word}" → ${w.start.toFixed(2)}s to ${w.end.toFixed(2)}s`);
//       });
      
//       if (gapAfter > 0.01) {
//         console.log(`    ⏸️  Silent period: ${audio_duration.toFixed(2)}s to ${clipDuration.toFixed(2)}s`);
//       }

//       const assFile = generateAssWithKaraoke(
//         dirs.assDir,
//         chunk_id,
//         overlayText,
//         audio_duration,
//         relativeWords,
//         templates,
//         templateName,
//         smallestAspectRatio,
//         textStyle
//       );
      
//       filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      
//     } else if (overlayText) {
//       const assFile = generateAssFromTemplate(
//         dirs.assDir,
//         chunk_id,
//         overlayText,
//         audio_duration || clipDuration,
//         templates,
//         templateName,
//         smallestAspectRatio,
//         textStyle
//       );
      
//       filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      
//     } else {
//       filterComplex = filterComplex.replace('[vbase]', '[vfinal]');
//     }

//     args.push(
//       '-filter_complex',
//       filterComplex,
//       '-map',
//       '[vfinal]',
//       '-r',
//       String(fps),
//       '-t',
//       String(clipDuration.toFixed(3)),
//       '-pix_fmt',
//       'yuv420p',
//       clipPath
//     );

//     console.log(`    🎬 Running FFmpeg with ${isVideo ? 'video' : 'image'} card motion effect...`);
//     await runFfmpeg(args);
//     console.log(`    ✅ Video clip created: ${clipPath}`);
//   }

//   const finalDuration = scenes.reduce((sum, s, idx) => {
//     let dur = s.audio_duration || 0;
    
//     if (idx < scenes.length - 1) {
//       const nextScene = scenes[idx + 1];
//       const gap = nextScene.start_time - s.end_time;
//       if (gap > 0.01) dur += gap;
//     }
    
//     return sum + dur;
//   }, 0);

//   console.log(`\n🎉 All scenes processed with card motion effect!`);
//   console.log(`📊 Total clips created: ${clipPaths.length}`);
//   console.log(`📊 Expected duration: ${totalExpectedDuration.toFixed(2)}s`);
//   console.log(`📊 Calculated duration: ${finalDuration.toFixed(2)}s`);
//   console.log(`🎴 Effect: Blur background + 75% card with ${cornerRadius}px rounded corners`);
//   console.log(`✅ ASPECT RATIO: FULLY MAINTAINED for both images and videos`);
//   console.log(`🎬 Animation: Slide in from left → Instant disappear from center`);
//   console.log(`🎥 Video Support: Videos maintain aspect ratio with black padding`);
//   if (logoPath) {
//     console.log(`🏷️  Last clip: Blur background + logo + karaoke text (no card)`);
//   } else {
//     console.log(`🏷️  No logo: All clips show card with animation`);
//   }
//   console.log(`📁 Clips saved to: ${dirs.clipsDir}`);
//   console.log(`📁 ASS files saved to: ${dirs.assDir}`);
//   console.log(`📁 Resized files saved to: ${dirs.resizedDir}\n`);
  
//   return clipPaths;
// }

