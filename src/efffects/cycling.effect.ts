import * as path from 'path';
import * as fs from 'fs';
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

function splitWordsIntoChunks(
  words: Array<{ word: string; start: number; end: number }>,
  minWords: number = 5,
  maxWords: number = 6
): Array<Array<{ word: string; start: number; end: number }>> {
  const chunks: Array<Array<{ word: string; start: number; end: number }>> = [];
  
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords);
    chunks.push(chunk);
  }
  
  return chunks;
}

function buildWordTimelineWithChunks(
  words: Array<{ word: string; start: number; end: number }>,
  chunkSize: number = 6
) {
  const chunks = splitWordsIntoChunks(words, 5, chunkSize);
  const timeline: Array<{ 
    chunkIndex: number;
    wordIndexInChunk: number;
    globalWordIndex: number;
    displayStart: number; 
    displayEnd: number; 
    isGap: boolean;
    wordsInChunk: Array<{ word: string; start: number; end: number }>;
  }> = [];

  chunks.forEach((chunk, chunkIndex) => {
    for (let i = 0; i < chunk.length; i++) {
      const current = chunk[i];
      const globalIndex = chunkIndex * chunkSize + i;
      
      timeline.push({
        chunkIndex,
        wordIndexInChunk: i,
        globalWordIndex: globalIndex,
        displayStart: current.start,
        displayEnd: current.end,
        isGap: false,
        wordsInChunk: chunk,
      });

      if (i < chunk.length - 1) {
        const next = chunk[i + 1];
        if (next.start > current.end) {
          timeline.push({
            chunkIndex,
            wordIndexInChunk: i,
            globalWordIndex: globalIndex,
            displayStart: current.end,
            displayEnd: next.start,
            isGap: true,
            wordsInChunk: chunk,
          });
        }
      }
    }
  });

  return timeline;
}

export function generateAssWithKaraoke(
  assDir: string,
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
    `\n🎤 Karaoke with Chunks: ${clipId} | Duration: ${sceneDuration.toFixed(2)}s`
  );

  if (words && words.length > 0) {
    const timeline = buildWordTimelineWithChunks(words, 6);

    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      const displayStart = entry.displayStart;
      const displayEnd = entry.displayEnd;
      const activeWordIndexInChunk = entry.wordIndexInChunk;
      const chunk = entry.wordsInChunk;

      console.log(
        `   Entry ${i + 1}/${timeline.length}: Chunk[${entry.chunkIndex}] Word[${activeWordIndexInChunk}] "${chunk[activeWordIndexInChunk].word}" → ${toTime(
          displayStart
        )} to ${toTime(displayEnd)} ${entry.isGap ? '(GAP)' : '(ACTIVE)'}`
      );

      let textWithHighlight = '';

      for (let j = 0; j < chunk.length; j++) {
        if (j === activeWordIndexInChunk && !entry.isGap) {
          textWithHighlight += `{\\c${cleanHighlightColor}}${chunk[j].word}{\\c${cleanPrimaryColor}}`;
        } else {
          textWithHighlight += chunk[j].word;
        }
        
        if (j < chunk.length - 1) textWithHighlight += ' ';
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
Title: Clip_${clipId}_Karaoke_Chunks
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

  if (!fs.existsSync(assDir))
    fs.mkdirSync(assDir, { recursive: true });
  
  const assPath = path.join(assDir, `clip_${clipId}_karaoke.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  console.log(`   ✅ ASS file created: ${assPath}`);
  return assPath;
}

export function generateAssFromTemplate(
  assDir: string,
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

  if (!fs.existsSync(assDir))
    fs.mkdirSync(assDir, { recursive: true });
  
  const assPath = path.join(assDir, `clip_${clipId}.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
  console.log(`   ✅ ASS file created: ${assPath}`);
  return assPath;
}

async function resizeLogoWithAspectRatio(
  logoPath: string,
  maxWidth: number,
  maxHeight: number,
  resizedDir: string,
  clipId: string
): Promise<string> {
  try {
    if (!fs.existsSync(logoPath)) {
      console.warn(`   ⚠️  Logo not found: ${logoPath}`);
      return '';
    }

    const metadata = await sharp(logoPath).metadata();
    const logoWidth = metadata.width || maxWidth;
    const logoHeight = metadata.height || maxHeight;

    const scale = Math.min(maxWidth / logoWidth, maxHeight / logoHeight, 1);
    const newWidth = Math.round(logoWidth * scale);
    const newHeight = Math.round(logoHeight * scale);

    console.log(`   📏 Logo original: ${logoWidth}x${logoHeight}`);
    console.log(`   📏 Logo resized: ${newWidth}x${newHeight}`);

    if (!fs.existsSync(resizedDir)) {
      fs.mkdirSync(resizedDir, { recursive: true });
    }

    const resizedLogoPath = path.join(resizedDir, `logo_resized_${clipId}.png`);
    
    await sharp(logoPath)
      .resize(newWidth, newHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(resizedLogoPath);

    console.log(`   ✅ Logo saved to: ${resizedLogoPath}`);
    return resizedLogoPath;
  } catch (err) {
    console.error('   ❌ Error resizing logo:', err);
    return '';
  }
}

export async function cycling_effects_video(
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

  console.log('\n====== ANALYZING IMAGES ======');

  // Aspect ratio detection
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

  console.log(`\n Aspect ratio selected: ${smallestAspectRatio}`);
  console.log(`  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

// Line ~253 pe - Effect ke saath style match
const stylePattern = [
  'Default',              // 0: zoom_in → White + Orange karaoke
  'Highlight',            // 1: zoom_out → Yellow + Cyan box
  'LeftOverlay',            
  'CenterBox',         
  'LeftOverlayHighlight', 
  'Highlight',          
  'CenterBoxHighlight',   
  'CenterBox'           
];
  let styleIndex = 0;

  // Effect cycle pattern
  const effectCycle = [
    'zoom_in',      // 0
    'zoom_out',     // 1
    'wipe_left',    // 2
    'white_box',    // 3
    'zoom_out',     // 4
    'zoom_out',     // 5
    'wipe_right',   // 6
    'white_box'     // 7
  ];

  console.log('====== PROCESSING SCENES WITH CYCLING EFFECTS ======');
  console.log(` Effect cycle: ${effectCycle.join(' → ')}\n`);

  const totalExpectedDuration = scenes.length > 0 
    ? Math.max(...scenes.map(s => s.end_time || 0))
    : 0;
  
  const totalAudioDuration = scenes.reduce((sum, s) => sum + (s.audio_duration || 0), 0);
  
  console.log(`Expected total timeline: ${totalExpectedDuration.toFixed(2)}s`);
  console.log(` Total audio duration: ${totalAudioDuration.toFixed(2)}s`);
  console.log(` Gap duration: ${(totalExpectedDuration - totalAudioDuration).toFixed(2)}s\n`);

  const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const isLastClip = i === scenes.length - 1;
    
    // Get effect for this clip (cycle through pattern)
    const effectIndex = i % effectCycle.length;
    const currentEffect = effectCycle[effectIndex];
    
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
        console.log(`\n Scene ${i + 1}/${scenes.length} (${chunk_id}) - Effect: ${currentEffect.toUpperCase()}`);
        console.log(`    Gap detected: ${gapAfter.toFixed(2)}s after this scene`);
        console.log(`    Original duration: ${audio_duration.toFixed(2)}s`);
        
        clipDuration = audio_duration + gapAfter;
        console.log(`    Extended duration: ${clipDuration.toFixed(2)}s (includes gap)`);
      } else {
        clipDuration = audio_duration || (end_time - start_time) || 0;
        console.log(`\n Scene ${i + 1}/${scenes.length} (${chunk_id}) - Effect: ${currentEffect.toUpperCase()}`);
        console.log(`    Duration: ${clipDuration.toFixed(2)}s (no gap)`);
      }
    } else {
      clipDuration = audio_duration || (end_time - start_time) || 0;
      console.log(`\n Scene ${i + 1}/${scenes.length} (${chunk_id}) - LAST SCENE (Blur + Logo)`);
      console.log(`    Duration: ${clipDuration.toFixed(2)}s`);
      if (logoPath) {
        console.log(`      Will show blur background + logo + karaoke text`);
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

    const textStyle = stylePattern[styleIndex];
    styleIndex = (styleIndex + 1) % stylePattern.length;

    let inputPath: string;

    // Handle image/video input
    if (asset_type === 'video' && video_filename) {
      inputPath = path.isAbsolute(video_filename)
        ? video_filename
        : path.join(dirs.imagesDir, video_filename);
      console.log(`    📹 Video asset`);
    } else if (image_filename) {
      if (image_filename.startsWith('http')) {
        try {
          console.log(`     Downloading image...`);
          const response = await axios.get(image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
          fs.writeFileSync(tempPath, buffer);
          inputPath = tempPath;
          console.log(`     Downloaded (${buffer.length} bytes)`);
        } catch (err) {
          console.warn(`    ⚠️  Download failed, using black frame`);
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

      // Resize image to fit canvas
      if (fs.existsSync(inputPath)) {
        console.log(`     Resizing image to ${width}x${height}...`);
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
        console.log(`     Image resized: ${resizedPath}`);
      }
    } else {
      console.log(`     Creating black frame`);
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

    const args: string[] = [
      '-y',
      asset_type === 'image' ? '-loop' : '',
      asset_type === 'image' ? '1' : '',
      '-i',
      inputPath,
    ].filter(Boolean);

    let filterComplex = '';

    // Last clip: blur background + logo + karaoke
    if (isLastClip && logoPath && fs.existsSync(logoPath)) {
      console.log(`    Applying: BLUR + LOGO overlay`);
      
      const resizedLogoPath = await resizeLogoWithAspectRatio(
        logoPath,
        Math.floor(width * 0.4),
        Math.floor(height * 0.4),
        dirs.resizedDir,
        chunk_id
      );
      
      if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
        args.push('-loop', '1', '-i', resizedLogoPath);
        
        // Blur + logo overlay
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.4)}):h=min(ih\\,${Math.floor(height * 0.4)}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vbase]`;
        
        console.log(`    ✅ Blur + Logo configured`);
      } else {
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]`;
      }
    } 
    // Regular clips: apply cycling effects
    else {
      console.log(`    🎨 Applying effect: ${currentEffect.toUpperCase()}`);
      
      // Base: scale and pad image
      let baseFilter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
      
      // Apply effect based on cycle
   switch (currentEffect) {
// case 'zoom_in': {

//   const totalFrames = Math.ceil(clipDuration * fps);

//   baseFilter += `,scale=${width*2}:${height*2}:flags=lanczos,` +
//     `zoompan=z='min(1.25,1+0.25*on/${totalFrames})':d=${totalFrames}:` +
//     `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
//     `s=${width}x${height}:fps=${fps}`;
  
//   console.log(`        Zoom In (1.0 → 1.25) - Smooth & Clear`);
//   break;
// }

// case 'zoom_out': {

//   const totalFrames = Math.ceil(clipDuration * fps);
  

//   baseFilter += `,scale=${width*2}:${height*2}:flags=lanczos,` +
//     `zoompan=z='max(1.0,1.25-0.25*on/${totalFrames})':d=${totalFrames}:` +
//     `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
//     `s=${width}x${height}:fps=${fps}`;
  
//   console.log(`       📹 Zoom Out (1.25 → 1.0) - Smooth & Clear`);
//   break;
// }

case 'zoom_in': {

    const totalFrames = Math.ceil(clipDuration * fps);

    baseFilter += `,scale=${width*2}:${height*2}:flags=lanczos,` +
      `zoompan=z='1+0.25*on/${totalFrames}':d=1:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `s=${width}x${height}:fps=${fps}`;

    console.log(` Zoom In (1.0 → 1.25) - Smooth & Clear`);
    break;
  }

  case 'zoom_out': {

    const totalFrames = Math.ceil(clipDuration * fps);

    baseFilter += `,scale=${width*2}:${height*2}:flags=lanczos,` +
      `zoompan=z='1.25-0.25*on/${totalFrames}':d=1:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `s=${width}x${height}:fps=${fps}`;

    console.log(` Zoom Out (1.25 → 1.0) - Smooth & Clear`);
    break;
  }

case 'wipe_right': {
  const wipeDuration = 1.3;
  baseFilter += `[base];color=black:s=${width}x${height}:d=${clipDuration}[black];` +
    `[base][black]overlay=x='if(lt(t,${wipeDuration}),W*t/${wipeDuration},-W)':y=0`;
  console.log(` Wipe Right - Super fast (${wipeDuration}s)`);
  break;
}


  case 'white_box': {
    // FIXED: 40% width box positioned at LEFT side (x=0)
    const boxWidth = Math.floor(width * 0.4);
    baseFilter += `[base];color=white@0.3:s=${boxWidth}x${height}:d=${clipDuration}[box];[base][box]overlay=0:0`;
    console.log(`        White Box (40% width, LEFT positioned, 30% opacity)`);
    break;
  }
  default:
    // No effect, just base
    break;
}
      
      filterComplex = baseFilter + '[vbase]';
    }

    // Add karaoke text overlay for ALL clips
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

      console.log(`     Adding karaoke (${relativeWords.length} words)`);
      
      if (gapAfter > 0.01) {
        console.log(`      Silent period: ${audio_duration.toFixed(2)}s to ${clipDuration.toFixed(2)}s`);
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
      console.log(`     Adding static text`);
      
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

    console.log(`     Running FFmpeg with ${currentEffect} effect...`);
    await runFfmpeg(args);
    console.log(`     Video clip created: ${clipPath}`);
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

  console.log(`\n🎉 All scenes processed with cycling effects!`);
  console.log(` Total clips created: ${clipPaths.length}`);
  console.log(` Expected duration: ${totalExpectedDuration.toFixed(2)}s`);
  console.log(` Calculated duration: ${finalDuration.toFixed(2)}s`);
  console.log(` Effect pattern: ${effectCycle.join(' → ')}`);
  console.log(` Features: Karaoke text on all clips`);
  if (logoPath) {
    console.log(`  Last clip: Blur background + centered logo + karaoke`);
  }
  console.log(` Clips saved to: ${dirs.clipsDir}`);
  console.log(` ASS files saved to: ${dirs.assDir}`);
  console.log(`📁 Resized files saved to: ${dirs.resizedDir}\n`);
  
  return clipPaths;
}