import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';
import {
  styliceSliceAd,
  mixedSlideMoveAd,
  staticBlurAd,
  topOverlayBlurAd,
  cyclicTemplate,
} from 'src/efffects';

@Injectable()
export class VideoService {
  assetsDir = path.join(process.cwd(), 'assets');
  imagesDir = path.join(this.assetsDir, 'images');
  videosDir = path.join(this.assetsDir, 'videos');
  outputDir = path.join(this.assetsDir, 'output');
  fps = 25;

  async buildVideo(scenes: any[], effectType?: string) {
    if (!fs.existsSync(this.outputDir))
      fs.mkdirSync(this.outputDir, { recursive: true });

    const dirs = {
      imagesDir: this.imagesDir,
      videosDir: this.videosDir,
      outputDir: this.outputDir,
    };

    const effects = [
      'zoomPan',
      'slideIn',
      'fadeZoom',
      'imageMove',
      'mixedSlideMove',
    ];
    const chosenEffect =
      effectType || effects[Math.floor(Math.random() * effects.length)];

    let clipPaths: string[] = [];

    switch (chosenEffect) {
      case 'zoomPan':
        clipPaths = await styliceSliceAd(scenes, dirs, runFfmpeg, this.fps);
        break;

      case 'mixedSlideMove':
        clipPaths = await mixedSlideMoveAd(scenes, dirs, this.fps);
        break;

      case 'staticBlur':
        clipPaths = await staticBlurAd(scenes, dirs, runFfmpeg, this.fps);
        break;

      case 'topOverlayBlur':
        clipPaths = await topOverlayBlurAd(scenes, dirs, runFfmpeg, this.fps);
        break;

      case 'bottomLeft':
        clipPaths = await cyclicTemplate(scenes,dirs,this.fps)

      default:
        throw new Error(`Unknown effect type: ${chosenEffect}`);
    }

    //  Merge all clips into one video
    const listFile = path.join(this.outputDir, 'concat_list.txt');
    fs.writeFileSync(
      listFile,
      clipPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    );

    const finalPath = path.join(this.outputDir, `final_${chosenEffect}.mp4`);
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c',
      'copy',
      finalPath,
    ]);
    fs.unlinkSync(listFile);

    return { chosenEffect, finalVideo: finalPath };
  }
}
