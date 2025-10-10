import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export async function imageMoveInAd(scenes: any[], dirs: any, runFfmpeg: any, fps: number) {
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const { chunk_id, image_filename, duration } = scene;

    const inputPath = path.join(dirs.imagesDir, image_filename);
    if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);

    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
    clipPaths.push(clipPath);

    // const filter = `
    //   [0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720[bg];
    //   [0:v]scale=400:300:force_original_aspect_ratio=increase,crop=400:300[small];
    //   [bg]boxblur=20:5[bgblur];
    //   [bgblur][small]overlay=x='W-w-50':y='50'[v]
    // `;
   const filter=`[0:v]scale=600:-1:force_original_aspect_ratio=decrease,
                 pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,
                 zoompan=z='1+0.005*on':x='640-640/zoom':y='360-360/zoom':d=250:s=1280x720:fps=25[v]`
    const args = [
      '-y',
      '-loop', '1',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[v]',
      '-r', String(fps),
      '-t', String(duration),
      '-pix_fmt', 'yuv420p',
      clipPath,
    ];

    await runFfmpeg(args);
  }

  return clipPaths;
}
