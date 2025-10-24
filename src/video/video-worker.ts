

// import { parentPort, workerData } from 'worker_threads';
// import * as path from 'path';
// import * as fs from 'fs';
// import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// import { randomUUID } from 'crypto';
// import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';
// import { runFfmpeg } from 'src/utils/ffmpeg.utils';
// import { overlayTemplates } from 'src/utils/overlayStyles';
// import { card_motion_effectAd } from 'src/efffects/cardMotioneffects';
// import { simple_video_effect } from 'src/efffects/basic.effects';
// import { zoom_effectAd } from 'src/efffects/zoom_effect';
// import { cycling_effects_video } from 'src/efffects/cycling.effect';
// import * as dotenv from 'dotenv';

// const envPath = path.resolve(process.cwd(), '.env');
// console.log(`\n Loading .env from: ${envPath}`);
// dotenv.config({ path: envPath });
// console.log(` .env loaded successfully\n`);

// interface WorkerData {
//   requestId: string;
//   scenes: Scene[];
//   effectType?: string;
//   audio_url?: string;
//   logo_url?: string;
//   avatar_url?: string;
//   background_music_url?: string;
//   dirs: {
//     requestDir: string;
//     assetsDir: string;
//     imagesDir: string;
//     audioDir: string;
//     videosDir: string;
//     logoDir: string;
//     musicDir: string;
//     clipsDir: string;
//     assDir: string;
//     resizedDir: string;
//     tempDir: string;
//     outputDir: string;
//   };
//   fps: number;
// }

// function escapePath(p: string): string {
//   return p.replace(/\\/g, '/');
// }

// function validateDirectories(dirs: WorkerData['dirs'], requestId: string): void {
//   console.log(`\n [${requestId}] Validating directories...`);
  
//   const requiredDirs = [
//     'requestDir', 'assetsDir', 'imagesDir', 'audioDir', 'videosDir',
//     'logoDir', 'musicDir', 'clipsDir', 'assDir', 'resizedDir', 'tempDir', 'outputDir',
//   ];

//   for (const dirKey of requiredDirs) {
//     const dirPath = dirs[dirKey as keyof typeof dirs];
    
//     if (!dirPath) {
//       throw new Error(`Missing directory: ${dirKey}`);
//     }

//     if (!fs.existsSync(dirPath)) {
//       try {
//         fs.mkdirSync(dirPath, { recursive: true });
//         console.log(`    Created: ${dirKey}`);
//       } catch (err: any) {
//         throw new Error(`Failed to create ${dirKey}: ${err.message}`);
//       }
//     }
//   }
  
//   console.log(`✅ [${requestId}] All directories validated\n`);
// }

// async function overlayAvatarOnVideo(
//   videoPath: string,
//   avatarPath: string,
//   outputPath: string,
//   requestId: string,
//   runFfmpeg: (args: string[]) => Promise<void>
// ): Promise<void> {
//   try {
//     console.log(`\n [${requestId}] Overlaying avatar on video...`);
//     console.log(`   Video: ${path.basename(videoPath)}`);
//     console.log(`   Avatar: ${path.basename(avatarPath)}`);

//     // Avatar overlay settings (bottom-right corner with circular mask)
//     const avatarSize = 200;
//     const padding = 20;

//     await runFfmpeg([
//       '-y',
//       '-i', escapePath(videoPath),
//       '-i', escapePath(avatarPath),
//       '-filter_complex',
//       // Scale avatar and create circular mask
//       `[1:v]scale=${avatarSize}:${avatarSize},` +
//       `format=yuva420p,` +
//       `geq=lum='p(X,Y)':a='if(lt(sqrt(pow(X-(W/2),2)+pow(Y-(H/2),2)),W/2),255,0)'[avatar];` +
//       // Position avatar at bottom-right
//       `[0:v][avatar]overlay=main_w-overlay_w-${padding}:main_h-overlay_h-${padding}:shortest=1[outv]`,
//       '-map', '[outv]',
//       '-map', '0:a?',
//       '-c:v', 'libx264',
//       '-preset', 'medium',
//       '-crf', '23',
//       '-c:a', 'copy',
//       escapePath(outputPath)
//     ]);

//     console.log(`✅ [${requestId}] Avatar overlay completed`);
//   } catch (err: any) {
//     throw new Error(`Avatar overlay failed: ${err.message}`);
//   }
// }

// async function validateAudioFile(audioPath: string, requestId: string, fileType: string = 'audio'): Promise<boolean> {
//   try {
//     if (!fs.existsSync(audioPath)) {
//       console.warn(`  [${requestId}] ${fileType} file not found: ${audioPath}`);
//       return false;
//     }

//     const stats = fs.statSync(audioPath);
//     if (stats.size === 0) {
//       console.warn(`  [${requestId}] ${fileType} file is empty: ${audioPath}`);
//       return false;
//     }

//     console.log(` [${requestId}] ${fileType} validated: ${(stats.size / 1024).toFixed(2)} KB`);
//     return true;
//   } catch (err: any) {
//     console.error(`❌ [${requestId}] ${fileType} validation error: ${err.message}`);
//     return false;
//   }
// }

// async function ensureBucketExists(s3Client: S3Client, bucketName: string): Promise<void> {
//   try {
//     console.log(` Checking bucket: ${bucketName}...`);
    
//     await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
//     console.log(` Bucket '${bucketName}' exists and accessible`);
//   } catch (error: any) {
//     console.log(` Bucket check error: ${error.$metadata?.httpStatusCode || error.name} - ${error.message}`);
    
//     if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404 || error.message.includes('does not exist')) {
//       console.log(`❌ Bucket '${bucketName}' does not exist!`);
//       throw new Error(`Bucket '${bucketName}' does not exist. Please create it manually.`);
//     } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
//       console.warn(`  No HeadBucket permission for '${bucketName}' (403 Forbidden)`);
//       console.log(`   This is normal if IAM policy doesn't include s3:ListBucket`);
//       console.log(`   Proceeding with upload attempt...\n`);
//     } else {
//       console.warn(`  Bucket check warning: ${error.message}`);
//       console.log(`   Attempting to continue...`);
//     }
//   }
// }

// async function uploadVideoToS3(
//   s3Client: S3Client,
//   bucketName: string,
//   filePath: string,
//   folderPath: string,
//   apiServerUrl: string,
//   contentType: string = 'video/mp4'
// ): Promise<string> {
//   try {
//     console.log(`\n  Uploading to S3...`);

//     const s3Key = `${folderPath.replace(/\/$/, '')}/${randomUUID()}.mp4`;
//     console.log(`   S3 Key: ${s3Key}`);

//     const fileBuffer = fs.readFileSync(filePath);
//     const fileStats = fs.statSync(filePath);
//     console.log(`   File Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

//     const uploadCommand = new PutObjectCommand({
//       Bucket: bucketName,
//       Key: s3Key,
//       Body: fileBuffer,
//       ContentType: contentType,
//     });

//     await s3Client.send(uploadCommand);
//     console.log(` File uploaded to S3 successfully`);

//     const videoUrl = `${apiServerUrl}/video?key=${encodeURIComponent(s3Key)}`;
//     console.log(` Final video_url URL: ${videoUrl}`);

//     return videoUrl;
//   } catch (err: any) {
//     if (err.name === 'NoCredentials' || err.message.includes('credentials')) {
//       throw new Error('S3 credentials not found.');
//     }
//     throw new Error(`S3 upload failed: ${err.message}`);
//   }
// }

// async function buildVideoWorker(data: WorkerData) {
//   const { requestId, scenes, effectType, audio_url, background_music_url, logo_url, avatar_url, dirs, fps } = data;

//   // Initialize S3 client
//   const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
//   const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
//   const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
//   const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
//   const AI_API_SERVER = process.env.AI_API_SERVER || '';
//   const S3_FOLDER_PATH = process.env.OBJECT_KEY || '';

//   if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
//     throw new Error('AWS credentials not found in environment variables. Check .env file.');
//   }

//   if (AWS_ACCESS_KEY_ID.length < 16 || AWS_ACCESS_KEY_ID.length > 128) {
//     throw new Error(`Invalid AWS_ACCESS_KEY_ID format. Length: ${AWS_ACCESS_KEY_ID.length}`);
//   }

//   const s3Client = new S3Client({
//     region: AWS_REGION,
//     credentials: {
//       accessKeyId: AWS_ACCESS_KEY_ID,
//       secretAccessKey: AWS_SECRET_ACCESS_KEY,
//     },
//   });

//   console.log(" AWS Credentials loaded:");
//   console.log("   Access Key ID:", AWS_ACCESS_KEY_ID);
//   console.log("   Access Key Length:", AWS_ACCESS_KEY_ID.length);
//   console.log("   Secret Key (last 4):", `***${AWS_SECRET_ACCESS_KEY.substring(AWS_SECRET_ACCESS_KEY.length - 4)}`);

//   try {

//  await ensureBucketExists(s3Client, BUCKET_NAME);
//     validateDirectories(dirs, requestId);

//     if (!scenes || scenes.length === 0) {
//       throw new Error('No scenes provided');
//     }
//     console.log(` [${requestId}] Processing ${scenes.length} scenes`);

//     console.log(`\n [${requestId}] Downloading assets...`);
//     let scenesWithAssets: Scene[];
//     let logoPath: string | undefined;
//     let avatarPath: string | undefined;
//     let backgroundMusicPath: string | undefined;

//     try {
//       const result = await saveSceneAssets(
//         scenes,
//         dirs.assetsDir,
//         audio_url,
//         logo_url,
//         avatar_url,
//         background_music_url,
//       );
//       scenesWithAssets = result.updatedScenes;
//       logoPath = result.logoPath;
//       avatarPath = result.avatarPath;
//       backgroundMusicPath = result.backgroundMusicPath;

//       if (avatarPath) {
//         console.log(`✅ Avatar video ready: ${path.basename(avatarPath)}`);
//       } else if (avatar_url) {
//         console.warn(`⚠️ Avatar URL provided but download failed`);
//       }
//     } catch (err: any) {
//       throw new Error(`Asset download failed: ${err.message}`);
//     }

//     const updatedScenes = scenesWithAssets.map((scene) => ({
//       ...scene,
//       image_filename: scene.image_filename || null,
//       video_filename: scene.video_filename || null,
//       audio_filename: scene.audio_filename || null,
//       background_music_filename: scene.background_music_filename || null,
//       asset_type: scene.asset_type || 'image',
//     }));

//     console.log(` [${requestId}] Assets saved`);

//     let clipPaths: string[] = [];
//     const chosenEffect = effectType || 'zoom_effect';

//     console.log(`\n [${requestId}] Applying effect: ${chosenEffect}`);

//     try {
//       switch (chosenEffect) {
//         case 'zoom_effect':
//           clipPaths = await zoom_effectAd(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'zoom_effect', logoPath);
//           break;
//         case 'card_motion':
//           clipPaths = await card_motion_effectAd(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'card_motion', logoPath);
//           break;
//         case 'basic':
//           clipPaths = await simple_video_effect(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'basic', logoPath);
//           break;
//         case 'cycle':
//           clipPaths = await cycling_effects_video(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'cycle', logoPath);
//           break;
//         default:
//           throw new Error(`Unknown effect: ${chosenEffect}`);
//       }
//     } catch (err: any) {
//       throw new Error(`Effect failed: ${err.message}`);
//     }

//     if (clipPaths.length === 0) {
//       throw new Error('No clips generated');
//     }
//     console.log(` [${requestId}] Generated ${clipPaths.length} clips`);

//     const listFile = path.join(dirs.outputDir, `concat_${Date.now()}.txt`);
//     const listContent = clipPaths.map((p) => `file '${escapePath(p)}'`).join('\n');
//     fs.writeFileSync(listFile, listContent);

//     // const audioPath = path.join(dirs.audioDir, 'full_audio.wav');
//     // const musicPath = path.join(dirs.musicDir, 'back_audio.wav');

//       const audioPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav';
//    const musicPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\back_audio.wav';

//     console.log(`\n [${requestId}] Validating audio...`);
//     const hasMainAudio = await validateAudioFile(audioPath, requestId, 'Main audio');

//     if (!hasMainAudio) {
//       throw new Error('Main audio not found');
//     }

//     let hasBackgroundMusic = false;
//     if (backgroundMusicPath || fs.existsSync(musicPath)) {
//       hasBackgroundMusic = await validateAudioFile(musicPath, requestId, 'Background music');
//     }

//     const tempVideoPath = path.join(dirs.tempDir, `temp_merged_${Date.now()}.mp4`);

//     console.log(`\n [${requestId}] Merging video and audio...`);

//     try {
//       if (hasBackgroundMusic) {
//         await runFfmpeg([
//           '-y', '-f', 'concat', '-safe', '0', '-i', escapePath(listFile),
//           '-i', escapePath(audioPath), '-i', escapePath(musicPath),
//           '-filter_complex', '[1:a]volume=1.0[a1]; [2:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest:dropout_transition=3[aout]',
//           '-map', '0:v:0', '-map', '[aout]',
//           '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
//           escapePath(tempVideoPath),
//         ]);
//       } else {
//         await runFfmpeg([
//           '-y', '-f', 'concat', '-safe', '0', '-i', escapePath(listFile),
//           '-i', escapePath(audioPath),
//           '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
//           '-ac', '2', '-ar', '48000', '-filter:a', 'volume=1.0',
//           '-map', '0:v:0', '-map', '1:a:0', '-shortest',
//           escapePath(tempVideoPath),
//         ]);
//       }
//     } catch (err: any) {
//       throw new Error(`FFmpeg merge failed: ${err.message}`);
//     }

//     if (!fs.existsSync(tempVideoPath)) {
//       throw new Error('Temporary video not created');
//     }

//     // Apply avatar overlay if available
//     const finalVideoPath = path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`);
    
//     if (avatarPath && fs.existsSync(avatarPath)) {
//       console.log(`\n [${requestId}] Adding avatar overlay...`);
//       await overlayAvatarOnVideo(tempVideoPath, avatarPath, finalVideoPath, requestId, runFfmpeg);
      
//       try {
//         fs.unlinkSync(tempVideoPath);
//         console.log(`   Temp video deleted`);
//       } catch (err) {
//         console.warn(`   Could not delete temp video: ${err}`);
//       }
//     } else {
//       console.log(`\n [${requestId}] No avatar overlay, using merged video as final`);
//       fs.renameSync(tempVideoPath, finalVideoPath);
//     }

//     if (!fs.existsSync(finalVideoPath)) {
//       throw new Error('Final video not created');
//     }

//     const videoStats = fs.statSync(finalVideoPath);
//     if (videoStats.size === 0) {
//       throw new Error('Final video is empty');
//     }

//     console.log(`✅ [${requestId}] Video created: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
//     console.log(`   Local path: ${finalVideoPath}`);
//     console.log(`   Avatar: ${avatarPath ? '✅ Added' : '❌ Not added'}`);

//     console.log(`\n [${requestId}] Starting S3 upload...`);
//     const videoUrl = await uploadVideoToS3(
//       s3Client,
//       BUCKET_NAME,
//       finalVideoPath,
//       S3_FOLDER_PATH,
//       AI_API_SERVER
//     );

//     // Cleanup temporary files
//     try {
//       fs.unlinkSync(listFile);
//       clipPaths.forEach(clipPath => {
//         if (fs.existsSync(clipPath)) {
//           fs.unlinkSync(clipPath);
//         }
//       });
//       console.log(`\n🧹 [${requestId}] Cleaned up temporary files (final video kept)`);
//     } catch (err: any) {
//       console.warn(`  Cleanup warning: ${err.message}`);
//     }

//     return {
//       requestId,
//       chosenEffect,
//       localPath: finalVideoPath,
//       videoUrl,
//       stats: {
//         totalClips: clipPaths.length,
//         videoSize: videoStats.size,
//         videoSizeMB: (videoStats.size / 1024 / 1024).toFixed(2),
//         hasAvatar: !!avatarPath,
//         hasLogo: !!logoPath,
//         hasBackgroundMusic: hasBackgroundMusic,
//       },
//     };
//   } catch (err: any) {
//     console.error(`\n${'='.repeat(60)}`);
//     console.error(`❌ [${requestId}] ERROR`);
//     console.error(`${'='.repeat(60)}`);
//     console.error(`${err.message}`);
//     console.error(`${'='.repeat(60)}\n`);
//     throw err;
//   }
// }

// buildVideoWorker(workerData as WorkerData)
//   .then((result) => {
//     console.log(`✅ Worker completed successfully`);
//     console.log(`   Request ID: ${result.requestId}`);
//     console.log(`   Effect: ${result.chosenEffect}`);
//     console.log(`   Video Size: ${result.stats.videoSizeMB} MB`);
//     console.log(`   Avatar: ${result.stats.hasAvatar ? '✅' : '❌'}`);
//     console.log(`   Logo: ${result.stats.hasLogo ? '✅' : '❌'}`);
//     console.log(`   Background Music: ${result.stats.hasBackgroundMusic ? '✅' : '❌'}`);
//     parentPort?.postMessage(result);
//   })
//   .catch((err) => {
//     console.error(`❌ Worker failed:`, err.message);
//     parentPort?.postMessage({ 
//       error: err.message,
//       stack: err.stack,
//       requestId: workerData.requestId 
//     });
//   })
















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

    console.log(`\n [${requestId}] Applying effect: ${chosenEffect}`);

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

    console.log(`\n🔍 [${requestId}] Validating generated clips...`);
    for (let i = 0; i < clipPaths.length; i++) {
      if (!fs.existsSync(clipPaths[i])) {
        console.error(`    Clip ${i + 1} missing: ${clipPaths[i]}`);
        throw new Error(`Generated clip not found: ${clipPaths[i]}`);
      }
      const stats = fs.statSync(clipPaths[i]);
      console.log(`   ✓ Clip ${i + 1}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }


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

    console.log(`\n [${requestId}] Merging video and audio...`);
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
      console.warn(`  [${requestId}] Cleanup warning: ${err.message}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(` [${requestId}] Video build complete!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Final video: ${finalVideoPath}`);
    console.log(` File size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(` Total clips: ${clipPaths.length}`);
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