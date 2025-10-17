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
  background_music_url?: string;
  dirs: {
    requestDir: string;
    assetsDir: string;
    imagesDir: string;
    audioDir: string;
    videosDir: string;
    logoDir: string;
    musicDir: string;
    clipsDir: string;
    assDir: string;
    resizedDir: string;
    tempDir: string;
    outputDir: string;
  };
  fps: number;
}

function escapePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function validateDirectories(dirs: WorkerData['dirs'], requestId: string): void {
  console.log(`\n [${requestId}] Validating directories...`);
  
  const requiredDirs = [
    'requestDir',
    'assetsDir',
    'imagesDir',
    'audioDir',
    'videosDir',
    'logoDir',
    'musicDir',
    'clipsDir',
    'assDir',
    'resizedDir',
    'tempDir',
    'outputDir',
  ];

  for (const dirKey of requiredDirs) {
    const dirPath = dirs[dirKey as keyof typeof dirs];
    
    if (!dirPath) {
      throw new Error(`Missing directory: ${dirKey}`);
    }

    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`   ✅ Created: ${dirKey}`);
      } catch (err: any) {
        throw new Error(`Failed to create ${dirKey}: ${err.message}`);
      }
    } else {
      console.log(`   ✓ Verified: ${dirKey}`);
    }
  }
  
  console.log(`✅ [${requestId}] All directories validated\n`);
}

async function validateAudioFile(audioPath: string, requestId: string, fileType: string = 'audio'): Promise<boolean> {
  try {
    if (!fs.existsSync(audioPath)) {
      console.warn(`  [${requestId}] ${fileType} file not found: ${audioPath}`);
      return false;
    }

    const stats = fs.statSync(audioPath);
    if (stats.size === 0) {
      console.warn(`  [${requestId}] ${fileType} file is empty: ${audioPath}`);
      return false;
    }

    console.log(`✅ [${requestId}] ${fileType} file validated: ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } catch (err: any) {
    console.error(`❌ [${requestId}] ${fileType} validation error: ${err.message}`);
    return false;
  }
}

async function buildVideoWorker(data: WorkerData) {
  const { requestId, scenes, effectType, audio_url, background_music_url, logo_url, dirs, fps } = data;

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 [${requestId}] Starting video build process...`);
    console.log(`${'='.repeat(60)}\n`);

    // Validate directories
    validateDirectories(dirs, requestId);

    // Validate scenes
    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes provided');
    }
    console.log(` [${requestId}] Processing ${scenes.length} scenes`);

    // Save scene assets
    console.log(`\n [${requestId}] Downloading and saving assets...`);
    let scenesWithAssets: Scene[];
    let logoPath: string | undefined;
    let backgroundMusicPath: string | undefined;

    try {
      const result = await saveSceneAssets(
        scenes,
        dirs.assetsDir,
        audio_url,
        logo_url,
        background_music_url,
      );
      scenesWithAssets = result.updatedScenes;
      logoPath = result.logoPath;
      backgroundMusicPath = result.backgroundMusicPath;
    } catch (err: any) {
      throw new Error(`Asset download failed: ${err.message}`);
    }

    const updatedScenes = scenesWithAssets.map((scene) => ({
      ...scene,
      image_filename: scene.image_filename || null,
      video_filename: scene.video_filename || null,
      audio_filename: scene.audio_filename || null,
      background_music_filename: scene.background_music_filename || null,
      asset_type: scene.asset_type || 'image',
    }));

    console.log(`✅ [${requestId}] Assets saved successfully`);

    // Apply video effect
    let clipPaths: string[] = [];
    const chosenEffect = effectType || 'zoom_efffect';

    console.log(`\n🎨 [${requestId}] Applying effect: ${chosenEffect}`);

    try {
      switch (chosenEffect) {
        case 'zoom_effect':
          clipPaths = await zoom_effectAd(
            updatedScenes,
            dirs,
            runFfmpeg,
            fps,
            overlayTemplates,
            'zoom_effect',
            logoPath,
          )
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
            'cycle',
            logoPath,
          );
          break;


        default:
          throw new Error(`Unknown effect type: ${chosenEffect}`);
      }
    } catch (err: any) {
      throw new Error(`Effect processing failed: ${err.message}`);
    }

    if (clipPaths.length === 0) {
      throw new Error('No clips were generated');
    }

    console.log(`\n✅ [${requestId}] Generated ${clipPaths.length} clips`);

    // Validate all clips exist
    console.log(`\n🔍 [${requestId}] Validating generated clips...`);
    for (let i = 0; i < clipPaths.length; i++) {
      if (!fs.existsSync(clipPaths[i])) {
        console.error(`    Clip ${i + 1} missing: ${clipPaths[i]}`);
        throw new Error(`Generated clip not found: ${clipPaths[i]}`);
      }
      const stats = fs.statSync(clipPaths[i]);
      console.log(`   ✓ Clip ${i + 1}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }

    // Create concat list
    const listFile = path.join(dirs.outputDir, `concat_list_${Date.now()}.txt`);
    const listContent = clipPaths
      .map((p) => `file '${escapePath(p)}'`)
      .join('\n');
    
    try {
      fs.writeFileSync(listFile, listContent);
      console.log(`\n📝 [${requestId}] Concat list created: ${listFile}`);
    } catch (err: any) {
      throw new Error(`Failed to create concat list: ${err.message}`);
    }

    // Validate audio files - use dynamic paths
    // const audioPath = path.join(dirs.audioDir, 'full_audio.wav');
    const audioPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav';
    console.log("audioPath=====",audioPath)

    // const musicPath = backgroundMusicPath || path.join(dirs.musicDir, 'back-music.mp3');
    const musicPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\back_audio.wav'

    console.log(`\n🎵 [${requestId}] Validating audio files...`);
    console.log(`   Main audio: ${audioPath}`);
    
    const hasMainAudio = await validateAudioFile(audioPath, requestId, 'Main audio');

    if (!hasMainAudio) {
      throw new Error('Main audio file not found or invalid');
    }

    // Only check background music if path exists
    let hasBackgroundMusic = false;
    if (backgroundMusicPath || fs.existsSync(musicPath)) {
      console.log(`   Background music: ${musicPath}`);
      hasBackgroundMusic = await validateAudioFile(musicPath, requestId, 'Background music');
    } else {
      console.log(`   Background music: ✗ Not provided (optional)`);
    }

    // Merge video and audio
    const finalVideoPath = path.join(
      dirs.outputDir,
      `final_${chosenEffect}_${Date.now()}.mp4`,
    );

    console.log(`\n🎬 [${requestId}] Merging video and audio...`);
    console.log(`   Output: ${finalVideoPath}`);

    try {
      if (hasBackgroundMusic) {
        console.log(`   🎼 Mixing narration + background music...`);
        
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
          '-i',
          escapePath(musicPath),
          '-filter_complex',
          '[1:a]volume=1.0[a1]; [2:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest:dropout_transition=3[aout]',
          '-map',
          '0:v:0',
          '-map',
          '[aout]',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-shortest',
          escapePath(finalVideoPath),
        ]);
        
        console.log(`   ✅ Mixed audio successfully`);
      } else {
        console.log(`   🎵 Using narration only (no background music)`);
        
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
          'volume=1.0',
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-shortest',
          escapePath(finalVideoPath),
        ]);
        
        console.log(`   ✅ Merged audio successfully`);
      }
    } catch (err: any) {
      throw new Error(`FFmpeg merge failed: ${err.message}`);
    }

    // Validate final video
    if (!fs.existsSync(finalVideoPath)) {
      throw new Error('Final video was not created');
    }

    const videoStats = fs.statSync(finalVideoPath);
    if (videoStats.size === 0) {
      throw new Error('Final video file is empty');
    }

    // Cleanup
    try {
      fs.unlinkSync(listFile);
      console.log(`\n🧹 [${requestId}] Cleaned up temporary files`);
    } catch (err: any) {
      console.warn(`⚠️  [${requestId}] Cleanup warning: ${err.message}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [${requestId}] Video build complete!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📹 Final video: ${finalVideoPath}`);
    console.log(`📊 File size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Total clips: ${clipPaths.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      requestId,
      chosenEffect,
      finalVideo: finalVideoPath,
      stats: {
        totalClips: clipPaths.length,
        videoSize: videoStats.size,
        videoSizeMB: (videoStats.size / 1024 / 1024).toFixed(2),
      },
    };
  } catch (err: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [${requestId}] FATAL ERROR`);
    console.error(`${'='.repeat(60)}`);
    console.error(`Error: ${err.message}`);
    console.error(`Stack: ${err.stack}`);
    console.error(`${'='.repeat(60)}\n`);
    
    throw err;
  }
}

// Execute worker
buildVideoWorker(workerData as WorkerData)
  .then((result) => {
    console.log(`✅ Worker completed successfully`);
    parentPort?.postMessage(result);
  })
  .catch((err) => {
    console.error(`❌ Worker failed:`, err.message);
    parentPort?.postMessage({ 
      error: err.message,
      stack: err.stack,
      requestId: workerData.requestId 
    });
  })