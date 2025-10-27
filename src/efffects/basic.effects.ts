import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';


import {
  createBlackFrame,
  generateAssWithKaraoke,
  escapeFfmpegPath,
  generateAssFromTemplate,
  getDimensionsFromAspectRatio,
  loadAndResizeImage,
  resizeLogoWithAspectRatio,
} from 'src/utils/common.utils';

export async function simple_video_effect(
  scenes: any[],
  dirs: any,
  runFfmpeg: any,
  fps: number,
  templates: any,
  templateName: string = 'basic',
  logoPath?: string,
): Promise<string[]> {
  const clipPaths: string[] = [];

  let smallestArea = Infinity;
  let smallestAspectRatio = '16:9';


  for (const scene of scenes) {
    if (scene.image_filename) {
      const imgPath = path.isAbsolute(scene.image_filename)
        ? scene.image_filename
        : path.join(dirs.imagesDir, scene.image_filename);

      if (scene.image_filename.startsWith('http')) {
        try {
          console.log(` Analyzing: ${scene.scene_id}`);
          const response = await axios.get(scene.image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const metadata = await sharp(buffer).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            if (area < smallestArea) {
              smallestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 9 / 16) < 0.01)
                smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01)
                smallestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01)
                smallestAspectRatio = '4:3';
            }
          }
        } catch (err) {
          console.warn(`    Failed to fetch: ${scene.scene_id}`);
        }
      } else if (fs.existsSync(imgPath)) {
        try {
    
          const metadata = await sharp(imgPath).metadata();

          if (metadata.width && metadata.height) {
            const area = metadata.width * metadata.height;
            if (area < smallestArea) {
              smallestArea = area;
              const ratio = metadata.width / metadata.height;
              if (Math.abs(ratio - 16 / 9) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 9 / 16) < 0.01)
                smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 1) < 0.01) smallestAspectRatio = '1:1';
              else if (Math.abs(ratio - 4 / 5) < 0.01)
                smallestAspectRatio = '4:5';
              else if (Math.abs(ratio - 4 / 3) < 0.01)
                smallestAspectRatio = '4:3';
            }
          }
        } catch (err) {
          console.warn(`    Failed to analyze: ${scene.scene_id}`);
        }
      }
    }
  }

  const stylePattern = [
    'Default',
    'Default',
    'Highlight',
    'Highlight',
    'Highlight',
  ];
  let styleIndex = 0;
  const totalExpectedDuration =
    scenes.length > 0 ? Math.max(...scenes.map((s) => s.end_time || 0)) : 0;

  const totalAudioDuration = scenes.reduce(
    (sum, s) => sum + (s.audio_duration || 0),
    0,
  );


  const { width, height } = getDimensionsFromAspectRatio(smallestAspectRatio);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const isLastClip = i === scenes.length - 1;

    const {
      scene_id,
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
        clipDuration = audio_duration + gapAfter;
      } else {
        clipDuration = audio_duration || end_time - start_time || 0;
        
      }
    } else {
      clipDuration = audio_duration || end_time - start_time || 0;
      if (logoPath) {
        console.log(` Will show blur background + logo`);
      }
    }

    if (clipDuration <= 0) {
      console.warn(
        ` Scene ${scene_id} has invalid duration (${clipDuration}s), skipping...`,
      );
      continue;
    }


    const textStyle = stylePattern[styleIndex];
    styleIndex = (styleIndex + 1) % stylePattern.length;

    let inputPath: string;

    // Handle image/video input (same logic as before)
    if (asset_type === 'video' && video_filename) {
      inputPath = path.isAbsolute(video_filename)
        ? video_filename
        : path.join(dirs.imagesDir, video_filename);
 
    } else if (image_filename) {
      if (image_filename.startsWith('http')) {
        try {

          const response = await axios.get(image_filename, {
            responseType: 'arraybuffer',
          });
          const buffer = Buffer.from(response.data);
          const tempPath = path.join(
            dirs.tempDir,
            `downloaded_${scene_id}.jpg`,
          );
          fs.writeFileSync(tempPath, buffer);
          inputPath = tempPath;

        } catch (err) {
          console.warn(`    ⚠️  Download failed, using black frame`);
          const blackPath = path.join(dirs.tempDir, `black_${scene_id}.png`);
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
        const resizedBuffer = await loadAndResizeImage(
          inputPath,
          width,
          height,
        );
        const resizedPath = path.join(
          dirs.resizedDir,
          `resized_${scene_id}.jpg`,
        );

        if (!fs.existsSync(dirs.resizedDir)) {
          fs.mkdirSync(dirs.resizedDir, { recursive: true });
        }

        await sharp(resizedBuffer, {
          raw: { width, height, channels: 3 },
        })
          .jpeg()
          .toFile(resizedPath);
        inputPath = resizedPath;
      }
    } else {
      const blackPath = path.join(dirs.tempDir, `black_${scene_id}.png`);
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

    const clipPath = path.join(dirs.clipsDir, `clip_${scene_id}.mp4`);
    clipPaths.push(clipPath);

    const args: string[] = [
      '-y',
      asset_type === 'image' ? '-loop' : '',
      asset_type === 'image' ? '1' : '',
      '-i',
      inputPath,
    ].filter(Boolean);

    let filterComplex = '';

    // Last clip with logo: blur background + logo overlay + karaoke text
    if (isLastClip && logoPath && fs.existsSync(logoPath)) {
      console.log(`     Last clip: Applying blur + logo + karaoke overlay`);

      const resizedLogoPath = await resizeLogoWithAspectRatio(
        logoPath,
        Math.floor(width * 0.4),
        Math.floor(height * 0.4),
        dirs.resizedDir,
        scene_id,
      );

      if (resizedLogoPath && fs.existsSync(resizedLogoPath)) {
        args.push('-loop', '1', '-i', resizedLogoPath);

        // Blur background + logo
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=20:1[blurred];[1:v]scale=w=min(iw\\,${Math.floor(width * 0.4)}):h=min(ih\\,${Math.floor(height * 0.4)}):force_original_aspect_ratio=decrease[logo];[blurred][logo]overlay=(W-w)/2:(H-h)/2[vbase]`;


        // Add karaoke text on top of blur+logo
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

  

          const assFile = generateAssWithKaraoke(
            dirs.assDir,
            scene_id,
            overlayText,
            audio_duration,
            relativeWords,
            templates,
            templateName,
            smallestAspectRatio,
            textStyle,
          );

          filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        } else if (overlayText) {
          console.log(`     Adding static text to last clip`);

          const assFile = generateAssFromTemplate(
            dirs.assDir,
            scene_id,
            overlayText,
            audio_duration || clipDuration,
            templates,
            templateName,
            smallestAspectRatio,
            textStyle,
          );

          filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        } else {
          filterComplex = filterComplex.replace('[vbase]', '[vfinal]');
        }
      } else {
     
        filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]`;

        if (overlayText) {
          const assFile =
            overlayText && words.length > 0
              ? generateAssWithKaraoke(
                  dirs.assDir,
                  scene_id,
                  overlayText,
                  audio_duration,
                  words,
                  templates,
                  templateName,
                  smallestAspectRatio,
                  textStyle,
                )
              : generateAssFromTemplate(
                  dirs.assDir,
                  scene_id,
                  overlayText,
                  audio_duration || clipDuration,
                  templates,
                  templateName,
                  smallestAspectRatio,
                  textStyle,
                );

          filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
        } else {
          filterComplex = filterComplex.replace('[vbase]', '[vfinal]');
        }
      }
    }
   
    else {
      
      filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]`;

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

    

        if (gapAfter > 0.01) {
          console.log(
            `      Silent period: ${audio_duration.toFixed(2)}s to ${clipDuration.toFixed(2)}s`,
          );
        }

        const assFile = generateAssWithKaraoke(
          dirs.assDir,
          scene_id,
          overlayText,
          audio_duration,
          relativeWords,
          templates,
          templateName,
          smallestAspectRatio,
          textStyle,
        );

        filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      } else if (overlayText) {
    

        const assFile = generateAssFromTemplate(
          dirs.assDir,
          scene_id,
          overlayText,
          audio_duration || clipDuration,
          templates,
          templateName,
          smallestAspectRatio,
          textStyle,
        );

        filterComplex += `;[vbase]ass=filename='${escapeFfmpegPath(assFile)}'[vfinal]`;
      } else {
        // No text, just rename output
        filterComplex = filterComplex.replace('[vbase]', '[vfinal]');
      }
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
      clipPath,
    );

    await runFfmpeg(args);
  
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

  
  if (logoPath) {
    console.log(`  Last clip: Blur background + centered logo`);
  }

  return clipPaths;
}


