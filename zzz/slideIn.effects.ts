import { drawTextFilter, imageScaleAndFade, slideInHoldOutOverlay } from 'src/utils/video.effects';
import * as path from 'path';
import * as fs from 'fs';

export async function slideInAd(scenes: any[], dirs: any, runFfmpeg: any, fps: number) {
  const bgVideo = path.join(dirs.videosDir, 'avatar.mp4');
  if (!fs.existsSync(bgVideo)) throw new Error(`Background video not found: ${bgVideo}`);

  const clipPaths: string[] = [];

  for (const scene of scenes) {
    const { chunk_id, image_filename, duration = 4, overlayText = '' } = scene;

    const slideIn = 0.5, hold = 2.3, slideOut = 0.5;
    const total = Math.max(duration, slideIn + hold + slideOut);

    const imagePath = path.join(dirs.imagesDir, image_filename);
    const clipPath = path.join(dirs.outputDir, `clip_${chunk_id}.mp4`);
   clipPaths.push(clipPath)

    const imgFilter = imageScaleAndFade(total, 0.5);
    const overlayExpr = slideInHoldOutOverlay(slideIn, hold, slideOut);
    const safeText = overlayText.replace(/'/g, "\\'");
    const fcParts = [
      `[1:v]${imgFilter}[img]`,
      `[0:v][img]${overlayExpr}[vout]`,
      safeText ? `[vout]${drawTextFilter(safeText, total)}[final]` : `[vout]null[final]`,
    ];

    const filterComplex = fcParts.join(';');
    const mapLabel = safeText ? '[final]' : '[vout]';

    const args = [
      '-y',
      '-i', bgVideo,
      '-loop', '1',
      '-i', imagePath,
      '-filter_complex', filterComplex,
      '-map', mapLabel,
      '-t', String(total),
      '-r', String(fps),
      '-pix_fmt', 'yuv420p',
      clipPath,
    ];

    await runFfmpeg(args);
  }

  return clipPaths;
}
