import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';

import { runFfmpeg } from 'src/utils/ffmpeg.utils';
import { overlayTemplates } from 'src/utils/overlayStyles';
import { card_motion_effectAd } from 'src/efffects/cardMotioneffects';
import { simple_video_effect } from 'src/efffects/basic.effects';
import { zoom_effectAd } from 'src/efffects/zoom_effect';
import { cycling_effects_video } from 'src/efffects/cycling.effect';

interface WorkerData {
  requestId: string;
  scenes: Scene[];
  effectType?: string;
  audio_url?: string;
  logo_url?: string;
  dirs: {
    requestDir: string;
    assetsDir: string;
    imagesDir: string;
    audioDir: string;
    videosDir: string;
    logoDir: string;
    clipsDir: string;
    assDir: string;
    resizedDir: string;
    tempDir: string;
    outputDir: string;
  };
  fps: number;
}

function escapePath(p: string) {
  return p.replace(/\\/g, '/');
}

async function buildVideoWorker(data: WorkerData) {
  const { requestId, scenes, effectType, audio_url, logo_url, dirs, fps } =
    data;

  console.log(`🎬 [${requestId}] Starting video build...`);
  console.log(`📁 [${requestId}] Directories:`, JSON.stringify(dirs, null, 2));

  // ✅ Verify all directories exist
  for (const [key, dirPath] of Object.entries(dirs)) {
    if (!dirPath) {
      throw new Error(`[${requestId}] Missing directory: ${key}`);
    }
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 [${requestId}] Created: ${key}`);
    }
  }

  const { updatedScenes: scenesWithAssets, logoPath } = await saveSceneAssets(
    scenes,
    dirs.assetsDir,
    audio_url,
    logo_url,
  );

  const updatedScenes = scenesWithAssets.map((scene) => ({
    ...scene,
    image_filename: scene.image_filename || null,
    audio_filename: scene.audio_filename || null,
  }));

  console.log(`📦 [${requestId}] Assets saved successfully`);

  let clipPaths: string[] = [];
  const chosenEffect = effectType || 'zoom_efffect';

  console.log(`🎨 [${requestId}] Applying effect: ${chosenEffect}`);

  switch (chosenEffect) {
    case 'zoom_efffect':
      clipPaths = await zoom_effectAd(
        updatedScenes,
        dirs,
        runFfmpeg,
        fps,
        overlayTemplates,
        'zoom_effect',
        logoPath,
      );
      break;

    case 'card_motion':
      clipPaths = await card_motion_effectAd(
        updatedScenes,
        dirs,
        runFfmpeg,
        fps,
        overlayTemplates,
        'card_motion',
        logoPath,
      );
      break;

    case 'basic':
      clipPaths = await simple_video_effect(
        updatedScenes,
        dirs,
        runFfmpeg,
        fps,
        overlayTemplates,
        'basic',
        logoPath,
      );
      break;

    case 'cycle':
      clipPaths = await cycling_effects_video(
        updatedScenes,
        dirs,
        runFfmpeg,
        fps,
        overlayTemplates,
        'stylish_slices_product',
        logoPath,
      );

    default:
      throw new Error(`Unknown effect type: ${chosenEffect}`);
  }

  console.log(`🎞️ [${requestId}] Generated ${clipPaths.length} clips`);

  const listFile = path.join(dirs.outputDir, `concat_list_${Date.now()}.txt`);
  const listContent = clipPaths
    .map((p) => `file '${escapePath(p)}'`)
    .join('\n');
  fs.writeFileSync(listFile, listContent);

  console.log(`📝 [${requestId}] Concat list created`);

  const finalVideoPath = path.join(
    dirs.outputDir,
    `final_${chosenEffect}_${Date.now()}.mp4`,
  );
  const audioPath = path.join(dirs.audioDir, 'full_audio.wav');

  console.log(`🎵 [${requestId}] Merging video and audio...`);

  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    escapePath(listFile),
    '-i',
    escapePath(audioPath),
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-filter:a',
    'volume=5',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-shortest',
    escapePath(finalVideoPath),
  ]);

  fs.unlinkSync(listFile);

  console.log(`✅ [${requestId}] Video build complete: ${finalVideoPath}`);

  return {
    requestId,
    chosenEffect,
    finalVideo: finalVideoPath,
    stats: {
      totalClips: clipPaths.length,
      videoSize: fs.statSync(finalVideoPath).size,
    },
  };
}
buildVideoWorker(workerData as WorkerData)
  .then((result) => parentPort?.postMessage(result))
  .catch((err) => {
    console.error(`❌ [${workerData.requestId}] Worker error:`, err);
    parentPort?.postMessage({ error: err.message });
  });
