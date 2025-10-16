import * as path from 'path';
import * as fs from 'fs';
import { zoomPanEffect } from 'src/utils/video.effects';
import sharp from 'sharp';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

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

// ========== INTELLIGENT MEDIA NORMALIZER ==========
// Ye function kisi bhi size/format ke media ko intelligently handle karta hai

interface MediaDimensions {
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  cropWidth: number;
  cropHeight: number;
  cropX: number;
  cropY: number;
  isPadded: boolean;
  isCropped: boolean;
}

function calculateOptimalResizing(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): MediaDimensions {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;
  let isPadded = false;
  let isCropped = false;

  // Agar source aur target aspect ratio different hai
  if (Math.abs(sourceAspect - targetAspect) > 0.01) {
    if (sourceAspect > targetAspect) {
      // Source zyada wide hai - horizontal crop karo
      cropWidth = Math.floor(sourceHeight * targetAspect);
      cropX = Math.floor((sourceWidth - cropWidth) / 2);
      isCropped = true;
      console.log(`   📐 Cropping horizontally: ${cropWidth}x${cropHeight} (removing ${sourceWidth - cropWidth}px from sides)`);
    } else {
      // Source zyada tall hai - vertical crop karo
      cropHeight = Math.floor(sourceWidth / targetAspect);
      cropY = Math.floor((sourceHeight - cropHeight) / 2);
      isCropped = true;
      console.log(`   📐 Cropping vertically: ${cropWidth}x${cropHeight} (removing ${sourceHeight - cropHeight}px from top/bottom)`);
    }
  }

  return {
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    targetWidth,
    targetHeight,
    cropWidth,
    cropHeight,
    cropX,
    cropY,
    isPadded,
    isCropped,
  };
}

async function normalizeImageForOutput(
  imagePath: string,
  targetWidth: number,
  targetHeight: number,
  outputPath: string
): Promise<boolean> {
  try {
    const metadata = await sharp(imagePath).metadata();
    const srcWidth = metadata.width || targetWidth;
    const srcHeight = metadata.height || targetHeight;

    const dims = calculateOptimalResizing(srcWidth, srcHeight, targetWidth, targetHeight);

    let pipeline = sharp(imagePath);

    // Agar crop karna hai
    if (dims.isCropped) {
      pipeline = pipeline.extract({
        left: dims.cropX,
        top: dims.cropY,
        width: dims.cropWidth,
        height: dims.cropHeight,
      });
      console.log(`   ✂️  Extracted region: left=${dims.cropX}, top=${dims.cropY}, w=${dims.cropWidth}, h=${dims.cropHeight}`);
    }

    // Resize to exact output dimensions
    pipeline = pipeline.resize(targetWidth, targetHeight, {
      fit: 'fill',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0 },
    });

    await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
    return true;
  } catch (err: any) {
    console.error(`   ❌ Error normalizing image: ${err.message}`);
    return false;
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

function getZoomEffect(index: number): 'zoom_in' | 'zoom_out' | 'none' {
  const patternPosition = index % 8;
  if (patternPosition === 3) return 'none';      
  if (patternPosition === 7) return 'none';     
  return 'none';
}

function createZoomInEffect(duration: number, width: number = 1920, height: number = 1080): string {
  return `scale=${width}:${height},zoompan=z='min(1.2,1+0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
}

function createZoomOutEffect(duration: number, width: number = 1920, height: number = 1080): string {
  return `scale=${width}:${height},zoompan=z='max(1,1.2-0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
}

function createStaticEffect(width: number = 1920, height: number = 1080): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
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
  try {
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

    if (words && words.length > 0) {
      const timeline = buildWordTimelineWithChunks(words, 6);

      for (let i = 0; i < timeline.length; i++) {
        const entry = timeline[i];
        const displayStart = entry.displayStart;
        const displayEnd = entry.displayEnd;
        const activeWordIndexInChunk = entry.wordIndexInChunk;
        const chunk = entry.wordsInChunk;

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

    if (!fs.existsSync(assDir)) {
      fs.mkdirSync(assDir, { recursive: true });
    }
    
    const assPath = path.join(assDir, `clip_${clipId}_karaoke.ass`);
    fs.writeFileSync(assPath, content, 'utf-8');
    return assPath;
  } catch (err: any) {
    console.error(`   ❌ Error creating ASS file: ${err.message}`);
    throw err;
  }
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
  try {
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

    if (!fs.existsSync(assDir)) {
      fs.mkdirSync(assDir, { recursive: true });
    }
    
    const assPath = path.join(assDir, `clip_${clipId}.ass`);
    fs.writeFileSync(assPath, content, 'utf-8');
    return assPath;
  } catch (err: any) {
    console.error(`   ❌ Error creating ASS file: ${err.message}`);
    throw err;
  }
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

    return resizedLogoPath;
  } catch (err: any) {
    console.error(`   ❌ Error resizing logo: ${err.message}`);
    return '';
  }
}

export async function zoom_effectAd(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
  templates: any,
  templateName: string = 'zoom_effect',
  logoPath?: string
): Promise<string[]> {
  const clipPaths: string[] = [];

  try {
    let largestArea = 0;
    let largestAspectRatio = '16:9';

    console.log('\n====== ANALYZING MEDIA ======');

    for (const scene of scenes) {
      const mediaFile = scene.video_filename || scene.image_filename;
      const assetType = scene.asset_type || 'image';
      
      if (!mediaFile) continue;

      try {
        if (assetType === 'video' && scene.video_filename) {
          const videoPath = path.isAbsolute(scene.video_filename)
            ? scene.video_filename
            : path.join(dirs.imagesDir, scene.video_filename);
          
          if (fs.existsSync(videoPath)) {
            const dimensions = await getVideoDimensions(videoPath);
            if (dimensions) {
              const area = dimensions.width * dimensions.height;
              if (area > largestArea) {
                largestArea = area;
                const ratio = dimensions.width / dimensions.height;
                if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
                else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
                else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
                else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
                else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
              }
            }
          }
        } else if (mediaFile.startsWith('http')) {
          const response = await axios.get(mediaFile, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const metadata = await sharp(buffer).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            if (area > largestArea) {
              largestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
            }
          }
        } else if (fs.existsSync(mediaFile)) {
          const metadata = await sharp(mediaFile).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            if (area > largestArea) {
              largestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
              else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
              else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
            }
          }
        }
      } catch (err: any) {
        console.warn(`    Failed to analyze: ${scene.chunk_id} - ${err.message}`);
      }
    }

    console.log(`\n📐 Aspect ratio selected: ${largestAspectRatio}`);
    console.log(`🏷️  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

    const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
    let styleIndex = 0;

    console.log('====== PROCESSING SCENES ======\n');

    const { width, height } = getDimensionsFromAspectRatio(largestAspectRatio);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const isLastClip = i === scenes.length - 1;
      
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
      console.log(`   Asset type: ${asset_type.toUpperCase()}`);

      let clipDuration: number;
      let gapAfter = 0;
      
      if (i < scenes.length - 1) {
        const nextScene = scenes[i + 1];
        gapAfter = nextScene.start_time - end_time;
        
        if (gapAfter > 0.01) {
          clipDuration = audio_duration + gapAfter;
          console.log(`   Gap detected: ${gapAfter.toFixed(2)}s`);
          console.log(`   Extended duration: ${clipDuration.toFixed(2)}s`);
        } else {
          clipDuration = audio_duration || (end_time - start_time) || 0;
          console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
        }
      } else {
        clipDuration = audio_duration || (end_time - start_time) || 0;
        console.log(`   Duration: ${clipDuration.toFixed(2)}s (LAST SCENE)`);
      }

      if (clipDuration <= 0) {
        console.warn(`   ⚠️  Invalid duration, skipping...`);
        continue;
      }

      console.log(`   Text: "${overlayText || 'None'}"`);
      console.log(`   Words: ${words.length}`);
      
      const isVideoAsset = asset_type === 'video';
      const zoomEffect = isLastClip ? 'none' : (isVideoAsset ? 'none' : getZoomEffect(i));
      
      let effectEmoji = '🎬';
      if (isVideoAsset) effectEmoji = '🎥';
      else if (zoomEffect === 'zoom_in') effectEmoji = '🔍';
      else if (zoomEffect === 'zoom_out') effectEmoji = '🔎';
      else if (isLastClip) effectEmoji = '⏸️';
      
      console.log(`   ${effectEmoji} Effect: ${isVideoAsset ? 'VIDEO' : zoomEffect.toUpperCase()}`);

      const textStyle = stylePattern[styleIndex];
      styleIndex = (styleIndex + 1) % stylePattern.length;
      console.log(`   Style: ${textStyle}`);
      
      let inputPath: string;

      // ========== IMAGE HANDLING ==========
      if (!isVideoAsset && image_filename) {
        if (image_filename.startsWith('http')) {
          try {
            console.log(`   📥 Downloading image...`);
            const response = await axios.get(image_filename, {
              responseType: 'arraybuffer',
            });
            const buffer = Buffer.from(response.data);
            const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
            fs.writeFileSync(tempPath, buffer);
            inputPath = tempPath;
            console.log(`   ✅ Downloaded (${buffer.length} bytes)`);
          } catch (err: any) {
            console.warn(`   ⚠️  Download failed: ${err.message}`);
            inputPath = '';
          }
        } else {
          inputPath = path.isAbsolute(image_filename)
            ? image_filename
            : path.join(dirs.imagesDir, image_filename);
        }

        if (inputPath && fs.existsSync(inputPath)) {
          console.log(`   🔧 Normalizing image to ${width}x${height}...`);
          const normalizedPath = path.join(dirs.resizedDir, `normalized_${chunk_id}.jpg`);
          
          if (!fs.existsSync(dirs.resizedDir)) {
            fs.mkdirSync(dirs.resizedDir, { recursive: true });
          }
          
          const success = await normalizeImageForOutput(inputPath, width, height, normalizedPath);
          if (success) {
            inputPath = normalizedPath;
            console.log(`   ✅ Normalized to ${width}x${height} (intelligent crop+scale)`);
          } else {
            console.error(`   ❌ Normalization failed`);
            continue;
          }
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
        console.log(`   📹 Using video: ${path.basename(inputPath)}`);
      }
      // ========== BLACK FRAME FALLBACK ==========
      else {
        console.log(`   ⚫ Creating black frame`);
        const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.jpg`);
        if (!fs.existsSync(blackPath)) {
          // Black frame as JPEG
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

      // ========== BUILD FFMPEG FILTER COMPLEX ==========
      let filterComplex: string;
      
      if (isVideoAsset) {
        // VIDEO: Smart crop to match aspect ratio + scale to exact dimensions
        console.log(`   🎥 Applying intelligent video scaling to ${width}x${height}`);
        // Force exact output dimensions - crop center, scale, then fill remaining
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed]`;
      } else if (isLastClip) {
        // IMAGE (LAST CLIP): Ensure exact dimensions match video
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[vzoomed]`;
      } else {
        // IMAGE (NOT LAST): Ensure exact dimensions, then apply effects
        const baseScale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
        
        if (zoomEffect === 'zoom_in') {
          filterComplex = `[0:v]${baseScale},${createZoomInEffect(clipDuration, width, height).replace(/^scale=.*?,/, '')}[vzoomed]`;
        } else if (zoomEffect === 'zoom_out') {
          filterComplex = `[0:v]${baseScale},${createZoomOutEffect(clipDuration, width, height).replace(/^scale=.*?,/, '')}[vzoomed]`;
        } else {
          filterComplex = `[0:v]${zoomPanEffect(
            clipDuration,
            direction || (i % 2 === 0 ? 'left' : 'bottom')
          )}[vzoomed]`;
        }
      }

      const args: string[] = [
        '-y',
        !isVideoAsset ? '-loop' : '',
        !isVideoAsset ? '1' : '',
        '-i',
        inputPath,
      ].filter(Boolean);

      // ========== LOGO HANDLING FOR LAST CLIP ==========
      if (isLastClip && logoPath && fs.existsSync(logoPath)) {
        const logoMaxWidth = Math.floor(width * 0.15);
        const logoMaxHeight = Math.floor(height * 0.15);
        
        const resizedLogoPath = await resizeLogoWithAspectRatio(
          logoPath,
          logoMaxWidth,
          logoMaxHeight,
          dirs.resizedDir,
          chunk_id
        );
        
        if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
          args.push('-i', resizedLogoPath);
          
          if (isVideoAsset) {
            // VIDEO + LOGO - Force exact dimensions
            filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[vzoomed][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
          } else {
            // IMAGE + LOGO (with blur)
            filterComplex = `[0:v]copy[vzoomed];[vzoomed]boxblur=5:1[blurred];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
          }
          
          console.log(`   🏷️  Logo overlay applied`);
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

        console.log(`   🎵 Karaoke timings (${relativeWords.length} words)`);
        
        const assFile = generateAssWithKaraoke(
          dirs.assDir,
          chunk_id,
          overlayText,
          audio_duration,
          relativeWords,
          templates,
          templateName,
          largestAspectRatio,
          textStyle
        );
        
        const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
        filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
      } else if (overlayText) {
        const assFile = generateAssFromTemplate(
          dirs.assDir,
          chunk_id,
          overlayText,
          audio_duration || clipDuration,
          templates,
          templateName,
          largestAspectRatio,
          textStyle
        );
        
        const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
        filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
      } else {
        const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
        filterComplex = filterComplex.replace(`[${baseLayer}]`, '[vfinal]');
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
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        clipPath
      );

      console.log(`   🎬 Encoding with FFmpeg...`);
      console.log(`   📏 Output: ${width}x${height} @ ${fps}fps, ${clipDuration.toFixed(2)}s`);
      
      try {
        await runFfmpeg(args);
        console.log(`   ✅ Clip encoded: ${path.basename(clipPath)}`);
      } catch (err: any) {
        console.error(`   ❌ FFmpeg failed: ${err.message}`);
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

    console.log(`\n✅ PROCESSING COMPLETE!`);
    console.log(`📊 Total clips: ${clipPaths.length}`);
    console.log(`📏 Standard dimensions: ${width}x${height}`);
    console.log(`📐 Aspect ratio: ${largestAspectRatio}`);
    console.log(`⏱️  Total duration: ${finalDuration.toFixed(2)}s`);
    console.log(`📁 Output: ${dirs.clipsDir}\n`);
    
    return clipPaths;
  } catch (err: any) {
    console.error(`\n❌ Critical error: ${err.message}`);
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

// // ========== INTELLIGENT MEDIA NORMALIZER ==========
// // Ye function kisi bhi size/format ke media ko intelligently handle karta hai

// interface MediaDimensions {
//   originalWidth: number;
//   originalHeight: number;
//   targetWidth: number;
//   targetHeight: number;
//   cropWidth: number;
//   cropHeight: number;
//   cropX: number;
//   cropY: number;
//   isPadded: boolean;
//   isCropped: boolean;
// }

// function calculateOptimalResizing(
//   sourceWidth: number,
//   sourceHeight: number,
//   targetWidth: number,
//   targetHeight: number
// ): MediaDimensions {
//   const sourceAspect = sourceWidth / sourceHeight;
//   const targetAspect = targetWidth / targetHeight;

//   let cropWidth = sourceWidth;
//   let cropHeight = sourceHeight;
//   let cropX = 0;
//   let cropY = 0;
//   let isPadded = false;
//   let isCropped = false;

//   // Agar source aur target aspect ratio different hai
//   if (Math.abs(sourceAspect - targetAspect) > 0.01) {
//     if (sourceAspect > targetAspect) {
//       // Source zyada wide hai - horizontal crop karo
//       cropWidth = Math.floor(sourceHeight * targetAspect);
//       cropX = Math.floor((sourceWidth - cropWidth) / 2);
//       isCropped = true;
//       console.log(`   📐 Cropping horizontally: ${cropWidth}x${cropHeight} (removing ${sourceWidth - cropWidth}px from sides)`);
//     } else {
//       // Source zyada tall hai - vertical crop karo
//       cropHeight = Math.floor(sourceWidth / targetAspect);
//       cropY = Math.floor((sourceHeight - cropHeight) / 2);
//       isCropped = true;
//       console.log(`   📐 Cropping vertically: ${cropWidth}x${cropHeight} (removing ${sourceHeight - cropHeight}px from top/bottom)`);
//     }
//   }

//   return {
//     originalWidth: sourceWidth,
//     originalHeight: sourceHeight,
//     targetWidth,
//     targetHeight,
//     cropWidth,
//     cropHeight,
//     cropX,
//     cropY,
//     isPadded,
//     isCropped,
//   };
// }

// async function normalizeImageForOutput(
//   imagePath: string,
//   targetWidth: number,
//   targetHeight: number,
//   outputPath: string
// ): Promise<boolean> {
//   try {
//     const metadata = await sharp(imagePath).metadata();
//     const srcWidth = metadata.width || targetWidth;
//     const srcHeight = metadata.height || targetHeight;

//     const dims = calculateOptimalResizing(srcWidth, srcHeight, targetWidth, targetHeight);

//     let pipeline = sharp(imagePath);

//     // Agar crop karna hai
//     if (dims.isCropped) {
//       pipeline = pipeline.extract({
//         left: dims.cropX,
//         top: dims.cropY,
//         width: dims.cropWidth,
//         height: dims.cropHeight,
//       });
//       console.log(`   ✂️  Extracted region: left=${dims.cropX}, top=${dims.cropY}, w=${dims.cropWidth}, h=${dims.cropHeight}`);
//     }

//     // Resize to exact output dimensions
//     pipeline = pipeline.resize(targetWidth, targetHeight, {
//       fit: 'fill',
//       withoutEnlargement: false,
//       background: { r: 0, g: 0, b: 0 },
//     });

//     await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
//     return true;
//   } catch (err: any) {
//     console.error(`   ❌ Error normalizing image: ${err.message}`);
//     return false;
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

// function getZoomEffect(index: number): 'zoom_in' | 'zoom_out' | 'none' {
//   const patternPosition = index % 8;
//   if (patternPosition === 3) return 'none';      
//   if (patternPosition === 7) return 'none';     
//   return 'none';
// }

// function createZoomInEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height},zoompan=z='min(1.2,1+0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
// }

// function createZoomOutEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height},zoompan=z='max(1,1.2-0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
// }

// function createStaticEffect(width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
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

// export async function zoom_effectAd(
//   scenes: any[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'zoom_effect',
//   logoPath?: string
// ): Promise<string[]> {
//   const clipPaths: string[] = [];

//   try {
//     let largestArea = 0;
//     let largestAspectRatio = '16:9';

//     console.log('\n====== ANALYZING MEDIA ======');

//     for (const scene of scenes) {
//       const mediaFile = scene.video_filename || scene.image_filename;
//       const assetType = scene.asset_type || 'image';
      
//       if (!mediaFile) continue;

//       try {
//         if (assetType === 'video' && scene.video_filename) {
//           const videoPath = path.isAbsolute(scene.video_filename)
//             ? scene.video_filename
//             : path.join(dirs.imagesDir, scene.video_filename);
          
//           if (fs.existsSync(videoPath)) {
//             const dimensions = await getVideoDimensions(videoPath);
//             if (dimensions) {
//               const area = dimensions.width * dimensions.height;
//               if (area > largestArea) {
//                 largestArea = area;
//                 const ratio = dimensions.width / dimensions.height;
//                 if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
//                 else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
//                 else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
//                 else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
//                 else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
//               }
//             }
//           }
//         } else if (mediaFile.startsWith('http')) {
//           const response = await axios.get(mediaFile, {
//             responseType: 'arraybuffer',
//           });
//           const buffer = Buffer.from(response.data);
//           const metadata = await sharp(buffer).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
//             if (area > largestArea) {
//               largestArea = area;
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
//             }
//           }
//         } else if (fs.existsSync(mediaFile)) {
//           const metadata = await sharp(mediaFile).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
//             if (area > largestArea) {
//               largestArea = area;
//               const ratio = metadata.width / metadata.height;
//               if (Math.abs(ratio - 16 / 9) < 0.01) largestAspectRatio = '16:9';
//               else if (Math.abs(ratio - 9 / 16) < 0.01) largestAspectRatio = '9:16';
//               else if (Math.abs(ratio - 1) < 0.01) largestAspectRatio = '1:1';
//               else if (Math.abs(ratio - 4 / 5) < 0.01) largestAspectRatio = '4:5';
//               else if (Math.abs(ratio - 4 / 3) < 0.01) largestAspectRatio = '4:3';
//             }
//           }
//         }
//       } catch (err: any) {
//         console.warn(`    Failed to analyze: ${scene.chunk_id} - ${err.message}`);
//       }
//     }

//     console.log(`\n📐 Aspect ratio selected: ${largestAspectRatio}`);
//     console.log(`🏷️  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

//     const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
//     let styleIndex = 0;

//     console.log('====== PROCESSING SCENES ======\n');

//     const { width, height } = getDimensionsFromAspectRatio(largestAspectRatio);

//     for (let i = 0; i < scenes.length; i++) {
//       const scene = scenes[i];
//       const isLastClip = i === scenes.length - 1;
      
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
//       console.log(`   Asset type: ${asset_type.toUpperCase()}`);

//       let clipDuration: number;
//       let gapAfter = 0;
      
//       if (i < scenes.length - 1) {
//         const nextScene = scenes[i + 1];
//         gapAfter = nextScene.start_time - end_time;
        
//         if (gapAfter > 0.01) {
//           clipDuration = audio_duration + gapAfter;
//           console.log(`   Gap detected: ${gapAfter.toFixed(2)}s`);
//           console.log(`   Extended duration: ${clipDuration.toFixed(2)}s`);
//         } else {
//           clipDuration = audio_duration || (end_time - start_time) || 0;
//           console.log(`   Duration: ${clipDuration.toFixed(2)}s`);
//         }
//       } else {
//         clipDuration = audio_duration || (end_time - start_time) || 0;
//         console.log(`   Duration: ${clipDuration.toFixed(2)}s (LAST SCENE)`);
//       }

//       if (clipDuration <= 0) {
//         console.warn(`   ⚠️  Invalid duration, skipping...`);
//         continue;
//       }

//       console.log(`   Text: "${overlayText || 'None'}"`);
//       console.log(`   Words: ${words.length}`);
      
//       const isVideoAsset = asset_type === 'video';
//       const zoomEffect = isLastClip ? 'none' : (isVideoAsset ? 'none' : getZoomEffect(i));
      
//       let effectEmoji = '🎬';
//       if (isVideoAsset) effectEmoji = '🎥';
//       else if (zoomEffect === 'zoom_in') effectEmoji = '🔍';
//       else if (zoomEffect === 'zoom_out') effectEmoji = '🔎';
//       else if (isLastClip) effectEmoji = '⏸️';
      
//       console.log(`   ${effectEmoji} Effect: ${isVideoAsset ? 'VIDEO' : zoomEffect.toUpperCase()}`);

//       const textStyle = stylePattern[styleIndex];
//       styleIndex = (styleIndex + 1) % stylePattern.length;
//       console.log(`   Style: ${textStyle}`);
      
//       let inputPath: string;

//       // ========== IMAGE HANDLING ==========
//       if (!isVideoAsset && image_filename) {
//         if (image_filename.startsWith('http')) {
//           try {
//             console.log(`   📥 Downloading image...`);
//             const response = await axios.get(image_filename, {
//               responseType: 'arraybuffer',
//             });
//             const buffer = Buffer.from(response.data);
//             const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
//             fs.writeFileSync(tempPath, buffer);
//             inputPath = tempPath;
//             console.log(`   ✅ Downloaded (${buffer.length} bytes)`);
//           } catch (err: any) {
//             console.warn(`   ⚠️  Download failed: ${err.message}`);
//             inputPath = '';
//           }
//         } else {
//           inputPath = path.isAbsolute(image_filename)
//             ? image_filename
//             : path.join(dirs.imagesDir, image_filename);
//         }

//         if (inputPath && fs.existsSync(inputPath)) {
//           console.log(`   🔧 Normalizing image to ${width}x${height}...`);
//           const normalizedPath = path.join(dirs.resizedDir, `normalized_${chunk_id}.jpg`);
          
//           if (!fs.existsSync(dirs.resizedDir)) {
//             fs.mkdirSync(dirs.resizedDir, { recursive: true });
//           }
          
//           const success = await normalizeImageForOutput(inputPath, width, height, normalizedPath);
//           if (success) {
//             inputPath = normalizedPath;
//             console.log(`   ✅ Normalized to ${width}x${height} (intelligent crop+scale)`);
//           } else {
//             console.error(`   ❌ Normalization failed`);
//             continue;
//           }
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
//         console.log(`   📹 Using video: ${path.basename(inputPath)}`);
//       }
//       // ========== BLACK FRAME FALLBACK ==========
//       else {
//         console.log(`   ⚫ Creating black frame`);
//         const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.jpg`);
//         if (!fs.existsSync(blackPath)) {
//           // Black frame as JPEG
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

//       // ========== BUILD FFMPEG FILTER COMPLEX ==========
//       let filterComplex: string;
      
//       if (isVideoAsset) {
//         // VIDEO: Smart crop to match aspect ratio + scale to exact dimensions
//         console.log(`   🎥 Applying intelligent video scaling to ${width}x${height}`);
//         // Force exact output dimensions - crop center, scale, then fill remaining
//         filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed]`;
//       } else if (isLastClip) {
//         // IMAGE (LAST CLIP): Ensure exact dimensions match video
//         filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[vzoomed]`;
//       } else {
//         // IMAGE (NOT LAST): Ensure exact dimensions, then apply effects
//         const baseScale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
        
//         if (zoomEffect === 'zoom_in') {
//           filterComplex = `[0:v]${baseScale},${createZoomInEffect(clipDuration, width, height).replace(/^scale=.*?,/, '')}[vzoomed]`;
//         } else if (zoomEffect === 'zoom_out') {
//           filterComplex = `[0:v]${baseScale},${createZoomOutEffect(clipDuration, width, height).replace(/^scale=.*?,/, '')}[vzoomed]`;
//         } else {
//           filterComplex = `[0:v]${zoomPanEffect(
//             clipDuration,
//             direction || (i % 2 === 0 ? 'left' : 'bottom')
//           )}[vzoomed]`;
//         }
//       }

//       const args: string[] = [
//         '-y',
//         !isVideoAsset ? '-loop' : '',
//         !isVideoAsset ? '1' : '',
//         '-i',
//         inputPath,
//       ].filter(Boolean);

//       // ========== LOGO HANDLING FOR LAST CLIP ==========
//       if (isLastClip && logoPath && fs.existsSync(logoPath)) {
//         const logoMaxWidth = Math.floor(width * 0.15);
//         const logoMaxHeight = Math.floor(height * 0.15);
        
//         const resizedLogoPath = await resizeLogoWithAspectRatio(
//           logoPath,
//           logoMaxWidth,
//           logoMaxHeight,
//           dirs.resizedDir,
//           chunk_id
//         );
        
//         if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
//           args.push('-i', resizedLogoPath);
          
//           if (isVideoAsset) {
//             // VIDEO + LOGO - Force exact dimensions
//             filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[vzoomed][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           } else {
//             // IMAGE + LOGO (with blur)
//             filterComplex = `[0:v]copy[vzoomed];[vzoomed]boxblur=5:1[blurred];[1:v]scale=w=min(iw\\,${logoMaxWidth}):h=min(ih\\,${logoMaxHeight}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           }
          
//           console.log(`   🏷️  Logo overlay applied`);
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

//         console.log(`   🎵 Karaoke timings (${relativeWords.length} words)`);
        
//         const assFile = generateAssWithKaraoke(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration,
//           relativeWords,
//           templates,
//           templateName,
//           largestAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else if (overlayText) {
//         const assFile = generateAssFromTemplate(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration || clipDuration,
//           templates,
//           templateName,
//           largestAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else {
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex = filterComplex.replace(`[${baseLayer}]`, '[vfinal]');
//       }

//       args.push(
//         '-filter_complex',
//         filterComplex,
//         '-map',
//         '[vfinal]',
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
//         clipPath
//       );

//       console.log(`   🎬 Encoding with FFmpeg...`);
//       console.log(`   📏 Output: ${width}x${height} @ ${fps}fps, ${clipDuration.toFixed(2)}s`);
      
//       try {
//         await runFfmpeg(args);
//         console.log(`   ✅ Clip encoded: ${path.basename(clipPath)}`);
//       } catch (err: any) {
//         console.error(`   ❌ FFmpeg failed: ${err.message}`);
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

//     console.log(`\n✅ PROCESSING COMPLETE!`);
//     console.log(`📊 Total clips: ${clipPaths.length}`);
//     console.log(`📏 Standard dimensions: ${width}x${height}`);
//     console.log(`📐 Aspect ratio: ${largestAspectRatio}`);
//     console.log(`⏱️  Total duration: ${finalDuration.toFixed(2)}s`);
//     console.log(`📁 Output: ${dirs.clipsDir}\n`);
    
//     return clipPaths;
//   } catch (err: any) {
//     console.error(`\n❌ Critical error: ${err.message}`);
//     throw err;
//   }
// }





















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
//     if (!fs.existsSync(imagePath)) {
//       console.warn(`   ⚠️  Image not found: ${imagePath}`);
//       return createBlackFrame(width, height);
//     }

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
//   } catch (err: any) {
//     console.error(`   ❌ Error resizing image: ${err.message}`);
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

// function getZoomEffect(index: number): 'zoom_in' | 'zoom_out' | 'none' {
//   const patternPosition = index % 8;
//   if (patternPosition === 3) return 'none';      
//   if (patternPosition === 7) return 'none';     
//   return 'none';
// }

// function createZoomInEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height},zoompan=z='min(1.2,1+0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
// }

// function createZoomOutEffect(duration: number, width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height},zoompan=z='max(1,1.2-0.2*(on/${duration}*25))':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
// }

// function createStaticEffect(width: number = 1920, height: number = 1080): string {
//   return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
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

// export async function zoom_effectAd(
//   scenes: any[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'zoom_effect',
//   logoPath?: string
// ): Promise<string[]> {
//   const clipPaths: string[] = [];

//   try {
//     let smallestArea = Infinity;
//     let smallestAspectRatio = '16:9';

//     console.log('\n====== ANALYZING MEDIA ======');

//     // Analyze all media files
//     for (const scene of scenes) {
//       const mediaFile = scene.video_filename || scene.image_filename;
      
//       if (!mediaFile) continue;

//       try {
//         if (mediaFile.startsWith('http')) {
//           const response = await axios.get(mediaFile, {
//             responseType: 'arraybuffer',
//           });
//           const buffer = Buffer.from(response.data);
//           const metadata = await sharp(buffer).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
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
//         } else if (fs.existsSync(mediaFile)) {
//           const metadata = await sharp(mediaFile).metadata();

//           if (metadata.width && metadata.height) {
//             const area = metadata.width * metadata.height;
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
//         }
//       } catch (err: any) {
//         console.warn(`    Failed to analyze: ${scene.chunk_id} - ${err.message}`);
//       }
//     }

//     console.log(`\n📐 Aspect ratio selected: ${smallestAspectRatio}`);
//     console.log(`🏷️  Logo provided: ${logoPath ? 'Yes' : 'No'}\n`);

//     const stylePattern = ['Default', 'Default', 'Highlight', 'Highlight', 'Highlight'];
//     let styleIndex = 0;

//     console.log('====== PROCESSING SCENES ======\n');

//     const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);

//     for (let i = 0; i < scenes.length; i++) {
//       const scene = scenes[i];
//       const isLastClip = i === scenes.length - 1;
      
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
//       console.log(`   Asset type: ${asset_type.toUpperCase()}`);

//       let clipDuration: number;
//       let gapAfter = 0;
      
//       if (i < scenes.length - 1) {
//         const nextScene = scenes[i + 1];
//         gapAfter = nextScene.start_time - end_time;
        
//         if (gapAfter > 0.01) {
//           clipDuration = audio_duration + gapAfter;
//           console.log(`   Gap detected: ${gapAfter.toFixed(2)}s`);
//           console.log(`   Extended duration: ${clipDuration.toFixed(2)}s (includes gap)`);
//         } else {
//           clipDuration = audio_duration || (end_time - start_time) || 0;
//           console.log(`   Duration: ${clipDuration.toFixed(2)}s (no gap)`);
//         }
//       } else {
//         clipDuration = audio_duration || (end_time - start_time) || 0;
//         console.log(`   Duration: ${clipDuration.toFixed(2)}s (LAST SCENE)`);
//       }

//       if (clipDuration <= 0) {
//         console.warn(`   ⚠️  Invalid duration (${clipDuration}s), skipping...`);
//         continue;
//       }

//       console.log(`   Text: "${overlayText || 'None'}"`);
//       console.log(`   Words: ${words.length}`);
      
//       // Determine zoom effect
//       const isVideoAsset = asset_type === 'video';
//       const zoomEffect = isLastClip ? 'none' : (isVideoAsset ? 'none' : getZoomEffect(i));
      
//       let effectEmoji = '🎬';
//       if (isVideoAsset) effectEmoji = '🎥';
//       else if (zoomEffect === 'zoom_in') effectEmoji = '🔍';
//       else if (zoomEffect === 'zoom_out') effectEmoji = '🔎';
//       else if (isLastClip) effectEmoji = '⏸️';
      
//       console.log(`   ${effectEmoji} Effect: ${isVideoAsset ? 'VIDEO (no zoom)' : (zoomEffect === 'none' ? (isLastClip ? 'STATIC' : 'MOVEMENT') : zoomEffect.toUpperCase())}`);

//       const textStyle = stylePattern[styleIndex];
//       styleIndex = (styleIndex + 1) % stylePattern.length;
//       console.log(`   Style: ${textStyle}`);
      
//       let inputPath: string;

//       // Handle video assets
//       if (asset_type === 'video' && video_filename) {
//         inputPath = path.isAbsolute(video_filename)
//           ? video_filename
//           : path.join(dirs.imagesDir, video_filename);
        
//         if (!fs.existsSync(inputPath)) {
//           console.error(`   ❌ Video not found: ${inputPath}`);
//           continue;
//         }
//         console.log(`   📹 Using video: ${path.basename(inputPath)}`);
//       } 
//       // Handle image assets
//       else if (image_filename) {
//         if (image_filename.startsWith('http')) {
//           try {
//             console.log(`   📥 Downloading image...`);
//             const response = await axios.get(image_filename, {
//               responseType: 'arraybuffer',
//             });
//             const buffer = Buffer.from(response.data);
//             const tempPath = path.join(dirs.tempDir, `downloaded_${chunk_id}.jpg`);
//             fs.writeFileSync(tempPath, buffer);
//             inputPath = tempPath;
//             console.log(`   ✅ Downloaded (${buffer.length} bytes)`);
//           } catch (err: any) {
//             console.warn(`   ⚠️  Download failed: ${err.message}`);
//             const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
//             if (!fs.existsSync(blackPath)) {
//               await sharp(createBlackFrame(width, height), {
//                 raw: { width, height, channels: 3 },
//               })
//                 .png()
//                 .toFile(blackPath);
//             }
//             inputPath = blackPath;
//           }
//         } else {
//           inputPath = path.isAbsolute(image_filename)
//             ? image_filename
//             : path.join(dirs.imagesDir, image_filename);
//         }

//         if (fs.existsSync(inputPath)) {
//           console.log(`   🔧 Resizing image...`);
//           const resizedBuffer = await loadAndResizeImage(inputPath, width, height);
//           const resizedPath = path.join(dirs.resizedDir, `resized_${chunk_id}.jpg`);
          
//           if (!fs.existsSync(dirs.resizedDir)) {
//             fs.mkdirSync(dirs.resizedDir, { recursive: true });
//           }
          
//           await sharp(resizedBuffer, {
//             raw: { width, height, channels: 3 },
//           })
//             .jpeg()
//             .toFile(resizedPath);
//           inputPath = resizedPath;
//           console.log(`   ✅ Resized successfully`);
//         }
//       } else {
//         console.log(`   ⚫ Creating black frame`);
//         const blackPath = path.join(dirs.tempDir, `black_${chunk_id}.png`);
//         if (!fs.existsSync(blackPath)) {
//           await sharp(createBlackFrame(width, height), {
//             raw: { width, height, channels: 3 },
//           })
//             .png()
//             .toFile(blackPath);
//         }
//         inputPath = blackPath;
//       }

//       if (!fs.existsSync(inputPath)) {
//         console.error(`   ❌ Input not found: ${inputPath}`);
//         continue;
//       }

//       const clipPath = path.join(dirs.clipsDir, `clip_${chunk_id}.mp4`);
//       clipPaths.push(clipPath);

//       // Build filter complex
//       let filterComplex: string;
      
//       // For video assets: NO zoom/pan effects, just scale
//       if (asset_type === 'video') {
//         console.log(`   🎥 Applying video scaling (no effects)`);
//         filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed]`;
//       }
//       // For images: apply effects
//       else if (isLastClip) {
//         filterComplex = `[0:v]${createStaticEffect(width, height)}[vzoomed]`;
//       } else {
//         if (zoomEffect === 'zoom_in') {
//           filterComplex = `[0:v]${createZoomInEffect(clipDuration, width, height)}[vzoomed]`;
//         } else if (zoomEffect === 'zoom_out') {
//           filterComplex = `[0:v]${createZoomOutEffect(clipDuration, width, height)}[vzoomed]`;
//         } else {
//           filterComplex = `[0:v]${zoomPanEffect(
//             clipDuration,
//             direction || (i % 2 === 0 ? 'left' : 'bottom')
//           )}[vzoomed]`;
//         }
//       }

//       const args: string[] = [
//         '-y',
//         asset_type === 'image' ? '-loop' : '',
//         asset_type === 'image' ? '1' : '',
//         '-i',
//         inputPath,
//       ].filter(Boolean);

//       // Logo handling for last clip
//       if (isLastClip && logoPath && fs.existsSync(logoPath)) {
//         const resizedLogoPath = await resizeLogoWithAspectRatio(
//           logoPath,
//           Math.floor(width * 0.25),
//           Math.floor(height * 0.25),
//           dirs.resizedDir,
//           chunk_id
//         );
        
//         if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
//           args.push('-i', resizedLogoPath);
          
//           if (asset_type === 'video') {
//             // For video: just add logo overlay (no blur)
//             filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vzoomed];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.25)}):h=min(ih\\,${Math.floor(height * 0.25)}):force_original_aspect_ratio=decrease[logo];[vzoomed][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           } else {
//             // For image: apply blur + logo
//             filterComplex = `[0:v]${createStaticEffect(width, height)}[vzoomed];[vzoomed]boxblur=5:1[blurred];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.25)}):h=min(ih\\,${Math.floor(height * 0.25)}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vwithlogo]`;
//           }
          
//           console.log(`   🏷️  Logo overlay applied (25% size)`);
//         }
//       }

//       // Text overlay handling
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

//         console.log(`   🎵 Karaoke timings (${relativeWords.length} words)`);
        
//         const assFile = generateAssWithKaraoke(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration,
//           relativeWords,
//           templates,
//           templateName,
//           smallestAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else if (overlayText) {
//         const assFile = generateAssFromTemplate(
//           dirs.assDir,
//           chunk_id,
//           overlayText,
//           audio_duration || clipDuration,
//           templates,
//           templateName,
//           smallestAspectRatio,
//           textStyle
//         );
        
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex += `;[${baseLayer}]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        
//       } else {
//         const baseLayer = isLastClip && logoPath && fs.existsSync(logoPath) ? 'vwithlogo' : 'vzoomed';
//         filterComplex = filterComplex.replace(`[${baseLayer}]`, '[vfinal]');
//       }

//       args.push(
//         '-filter_complex',
//         filterComplex,
//         '-map',
//         '[vfinal]',
//         '-r',
//         String(fps),
//         '-t',
//         String(clipDuration.toFixed(3)),
//         '-pix_fmt',
//         'yuv420p',
//         clipPath
//       );

//       console.log(`   🎬 Running FFmpeg with duration: ${clipDuration.toFixed(3)}s...`);
      
//       try {
//         await runFfmpeg(args);
//         console.log(`   ✅ Clip created: ${clipPath}`);
//       } catch (err: any) {
//         console.error(`   ❌ FFmpeg failed: ${err.message}`);
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

//     console.log(`\n✅ All scenes processed!`);
//     console.log(`📊 Total clips: ${clipPaths.length}`);
//     console.log(`⏱️  Total duration: ${finalDuration.toFixed(2)}s`);
//     console.log(`📁 Clips: ${dirs.clipsDir}`);
//     console.log(`📁 ASS files: ${dirs.assDir}\n`);
    
//     return clipPaths;
//   } catch (err: any) {
//     console.error(`\n❌ Critical error in zoom_effectAd: ${err.message}`);
//     throw err;
//   }
// }





