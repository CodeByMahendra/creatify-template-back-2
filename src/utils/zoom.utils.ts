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

export function wrapText(text: string, maxWidth: number = 40): string {
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

export function getDimensionsFromAspectRatio(aspectRatio: string) {
  const ratioMap: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '4:3': { width: 1440, height: 1080 },
  };
  return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
}

export function createBlackFrame(width: number, height: number): Buffer {
  return Buffer.alloc(width * height * 3);
}

 export async function loadAndResizeImage(
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

// ✅ Build word timeline with gap filling
export function buildWordTimeline(words: Array<{ word: string; start: number; end: number }>, clipDuration: number) {
  const timeline: Array<{ word: string; displayStart: number; displayEnd: number; isGap: boolean }> = [];

  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    timeline.push({
      word: current.word,
      displayStart: current.start,
      displayEnd: current.end,
      isGap: false,
    });

    // Fill gap to next word
    if (i < words.length - 1) {
      const next = words[i + 1];
      if (next.start > current.end) {
        timeline.push({
          word: current.word,
          displayStart: current.end,
          displayEnd: next.start,
          isGap: true,
        });
      }
    } else {
      // last word extends to end of scene
      if (current.end < clipDuration) {
        timeline.push({
          word: current.word,
          displayStart: current.end,
          displayEnd: clipDuration,
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

  let dialogueEvents = '';

  if (words && words.length > 0) {
    const timeline = buildWordTimeline(words, sceneDuration);

    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      const displayStart = entry.displayStart;
      const displayEnd = entry.displayEnd;

      let textWithHighlight = '';

      for (let j = 0; j < words.length; j++) {
        const isCurrentWord = words[j].word === entry.word;
        
        if (isCurrentWord && !entry.isGap) {
          // Active word - highlight
          textWithHighlight += `{\\c${highlightColor}}${words[j].word}{\\c${primaryColor}}`;
        } else if (isCurrentWord && entry.isGap) {
          // Gap - keep showing word normal
          textWithHighlight += words[j].word;
        } else {
          // Other words
          textWithHighlight += words[j].word;
        }
        if (j < words.length - 1) textWithHighlight += ' ';
      }

      dialogueEvents += `Dialogue: 0,${toTime(displayStart)},${toTime(displayEnd)},${styleName},,0,0,0,,${textWithHighlight}\n`;
    }
  } else {
    dialogueEvents += `Dialogue: 0,${toTime(0)},${toTime(sceneDuration)},${styleName},,0,0,0,,${overlayText}\n`;
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

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  const assPath = path.join(outputDir, `clip_${clipId}_karaoke.ass`);
  fs.writeFileSync(assPath, content, 'utf-8');
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
