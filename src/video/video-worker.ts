import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';
import { zoom_effectAd } from 'src/efffects';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';
import { overlayTemplates } from 'src/utils/overlayStyles';



interface WorkerData {
  scenes: Scene[];
  effectType?: string;
  audio_url?: string;
  dirs: {
    assetsDir: string;
    imagesDir: string;
    videosDir: string;
    outputDir: string;
  };
  fps: number;
}

async function buildVideoWorker(data: WorkerData) {
  const { scenes, effectType, audio_url, dirs, fps } = data;

  const { updatedScenes: scenesWithAssets } = await saveSceneAssets(
    scenes,
    dirs.assetsDir,
    audio_url
  );

  const updatedScenes = scenesWithAssets.map(scene => ({
    ...scene,
    image_filename: scene.image_filename || null,
    audio_filename: scene.audio_filename || null,
  }));

  let clipPaths: string[] = [];
  const chosenEffect = effectType || 'zoom_efffect';

  switch (chosenEffect) {
    case 'zoom_efffect':
      clipPaths = await zoom_effectAd(
        updatedScenes,
        dirs,
        runFfmpeg,
        fps,
        overlayTemplates,
        'zoom_effect'
      );
      break;

 
    default:
      throw new Error(`Unknown effect type: ${chosenEffect}`);
  }

  const listFile = path.join(dirs.outputDir, `concat_list_${Date.now()}.txt`);
  fs.writeFileSync(
    listFile,
    clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
  );

  const finalPath = path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`);
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath]);
  fs.unlinkSync(listFile);

  return {
    chosenEffect,
    finalVideo: finalPath,
  };
}

// Run worker
buildVideoWorker(workerData as WorkerData)
  .then(result => parentPort?.postMessage(result))
  .catch(err => parentPort?.postMessage({ error: err.message }));

