// import { parentPort, workerData } from 'worker_threads';
// import * as path from 'path';
// import * as fs from 'fs';
// import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// import { randomUUID } from 'crypto';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';
// import { runFfmpeg } from 'src/utils/ffmpeg.utils';
// import { overlayTemplates } from 'src/utils/overlayStyles';
// import { card_motion_effectAd } from 'src/efffects/cardMotioneffects';
// import { simple_video_effect } from 'src/efffects/basic.effects';
// import { zoom_effectAd } from 'src/efffects/zoom_effect';
// import { cycling_effects_video } from 'src/efffects/cycling.effect';
// import { compositeWithAudioMixing } from 'src/utils/video_compositor';
// import * as dotenv from 'dotenv';
// import { AvatarService } from '../avatar';
// import { AvatarMaskService } from '../avatar';

// const execPromise = promisify(exec);

// const envPath = path.resolve(process.cwd(), '.env');
// console.log(`\n Loading .env from: ${envPath}`);
// dotenv.config({ path: envPath });
// console.log(`.env loaded successfully\n`);

// interface WorkerData {
//   requestId: string;
//   scenes: Scene[];
//   effectType?: string;
//   avatarMode?: string;  
//   audio_url?: string;
//   logo_url?: string;
//   avatar_url?: string;
//   avatarMaskUrl?: string;
//   background_music_url?: string;
//   dirs: {
//     requestDir: string;
//     assetsDir: string;
//     imagesDir: string;
//     audioDir: string;
//     videosDir: string;
//     logoDir: string;
//     avatarDir: string;
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
//     'logoDir', 'avatarDir', 'musicDir', 'clipsDir', 'assDir', 'resizedDir', 'tempDir', 'outputDir',
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
//     } else {
//       console.log(`   Exists: ${dirKey}`);
//     }
//   }
  
//   console.log(` [${requestId}] All directories validated\n`);
// }

// async function validateAudioFile(audioPath: string, requestId: string, fileType: string = 'audio'): Promise<boolean> {
//   try {
//     if (!fs.existsSync(audioPath)) {
//       console.warn(` [${requestId}] ${fileType} file not found: ${audioPath}`);
//       return false;
//     }

//     const stats = fs.statSync(audioPath);
//     if (stats.size === 0) {
//       console.warn(` [${requestId}] ${fileType} file is empty: ${audioPath}`);
//       return false;
//     }

//     console.log(`[${requestId}] ${fileType} validated: ${(stats.size / 1024).toFixed(2)} KB`);
//     return true;
//   } catch (err: any) {
//     console.error(` [${requestId}] ${fileType} validation error: ${err.message}`);
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
    
//     if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
//       throw new Error(`Bucket '${bucketName}' does not exist. Please create it manually.`);
//     } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
//       console.warn(` No HeadBucket permission - continuing...`);
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
//     console.log(`\n Uploading to S3...`);

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
//     console.log(` Final video URL: ${videoUrl}`);

//     return videoUrl;
//   } catch (err: any) {
//     throw new Error(`S3 upload failed: ${err.message}`);
//   }
// }

// async function buildVideoWorker(data: WorkerData) {
//   const { requestId, scenes, effectType, audio_url, background_music_url, logo_url, avatar_url, dirs, fps } = data;

//   console.log(`\n${'='.repeat(80)}`);
//   console.log(` VIDEO WORKER STARTED`);
//   console.log(`=`.repeat(80));
//   console.log(`Request ID: ${requestId}`);
//   console.log(`Scenes: ${scenes.length}`);
//   console.log(`Effect: ${effectType || 'zoom_effect'}`);
//   console.log(`Avatar Mode: ${data.avatarMode || 'mix_mode_new'}`);
//   console.log(`Audio: ${audio_url ? '✅' : '❌'}`);
//   console.log(`Logo: ${logo_url ? '✅' : '❌'}`);
//   console.log(`Avatar: ${avatar_url ? '✅' : '❌'}`);
//   console.log(`Background Music: ${background_music_url ? '✅' : '❌'}`);
//   console.log(`=`.repeat(80));

//   // Initialize S3
//   const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
//   const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
//   const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
//   const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
//   const AI_API_SERVER = process.env.AI_API_SERVER || '';
//   const S3_FOLDER_PATH = process.env.OBJECT_KEY || '';

//   if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
//     throw new Error('AWS credentials not found');
//   }

//   const s3Client = new S3Client({
//     region: AWS_REGION,
//     credentials: {
//       accessKeyId: AWS_ACCESS_KEY_ID,
//       secretAccessKey: AWS_SECRET_ACCESS_KEY,
//     },
//   });

//   try {
//     await ensureBucketExists(s3Client, BUCKET_NAME);
//     validateDirectories(dirs, requestId);

//     if (!scenes || scenes.length === 0) {
//       throw new Error('No scenes provided');
//     }

//     // Download assets
//     console.log(`\n [${requestId}] Downloading assets...`);
    
//     let scenesWithAssets: Scene[];
//     let logoPath: string | undefined;
//     let avatarPath: string | undefined;
//     let backgroundMusicPath: string | undefined;
//     let avatarMaskPath: string | undefined;

//     try {
//       const result = await saveSceneAssets(
//         scenes,
//         dirs.assetsDir,
//         audio_url,
//         logo_url,
//         avatar_url,
//         background_music_url,
//         data.avatarMaskUrl,
//       );
      
//       scenesWithAssets = result.updatedScenes;
//       logoPath = result.logoPath;
//       avatarPath = result.avatarPath;
//       backgroundMusicPath = result.backgroundMusicPath;
//       avatarMaskPath = result.avatarMaskPath;

//       console.log(`\n✅ Assets downloaded:`);
//       console.log(`   Scenes: ${scenesWithAssets.length}`);
//       console.log(`   Logo: ${logoPath || 'NONE'}`);
//       console.log(`   Avatar: ${avatarPath || 'NONE'}`);
//       console.log(`   Avatar Mask (downloaded): ${avatarMaskPath || 'NONE'}`);

//       // Auto-generate mask from avatar if not provided
//       if (avatarPath && !avatarMaskPath) {
//         try {
//           const maskService = new AvatarMaskService();
//           const masksDir = path.join(dirs.assetsDir, 'masks');
//           const generated = await maskService.getAvatarAndMask(avatarPath, masksDir);
//           avatarMaskPath = generated.maskPath;
//           console.log(`   ✅ Avatar Mask (generated): ${avatarMaskPath}`);
//         } catch (err: any) {
//           console.warn(`   ⚠️  Auto mask generation failed: ${err.message}`);
//         }
//       }
//       console.log(`   Music: ${backgroundMusicPath || 'NONE'}`);
//     } catch (err: any) {
//       throw new Error(`Asset download failed: ${err.message}`);
//     }

//     const updatedScenes = scenesWithAssets.map((scene) => ({
//       ...scene,
//       scene_id: String(scene.scene_id),  // ✅ Convert to string
//       image_filename: scene.image_filename || null,
//       video_filename: scene.video_filename || null,
//       audio_filename: scene.audio_filename || null,
//       background_music_filename: scene.background_music_filename || null,
//       asset_type: scene.asset_type || 'image',
//     }));

//     // ========== STEP 1: GENERATE BACKGROUND VIDEO ==========
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`📹 STEP 1: GENERATING BACKGROUND VIDEO`);
//     console.log(`=`.repeat(80));

//     let clipPaths: string[] = [];
//     const chosenEffect = effectType || 'zoom_effect';

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
//       throw new Error(`Background effect failed: ${err.message}`);
//     }

//     if (clipPaths.length === 0) {
//       throw new Error('No background clips generated');
//     }
//     console.log(`✅ Generated ${clipPaths.length} background clips`);

//     // Concatenate background clips
//     const listFile = path.join(dirs.outputDir, `concat_${Date.now()}.txt`);
//     const listContent = clipPaths.map((p) => `file '${escapePath(p)}'`).join('\n');
//     fs.writeFileSync(listFile, listContent);

//     const backgroundVideoPath = path.join(dirs.tempDir, `background_${Date.now()}.mp4`);

//     console.log('\n🎬 Merging background clips...');
//     await runFfmpeg([
//       '-y', '-f', 'concat', '-safe', '0', '-i', escapePath(listFile),
//       '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
//       '-pix_fmt', 'yuv420p', '-an',
//       escapePath(backgroundVideoPath)
//     ]);

//     if (!fs.existsSync(backgroundVideoPath)) {
//       throw new Error('Background video not created');
//     }
//     console.log(`✅ Background: ${path.basename(backgroundVideoPath)}`);


//     // ========== STEP 2: AVATAR PROCESSING ==========
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`👤 STEP 2: AVATAR PROCESSING`);
//     console.log(`=`.repeat(80));
    
//     let finalVideoPath: string | null = null;
    
//     if (avatarPath && fs.existsSync(avatarPath)) {
//       console.log(`   ✅ Avatar file found: ${path.basename(avatarPath)}`);
      
//       const avatarStats = fs.statSync(avatarPath);
//       console.log(`   Avatar file size: ${(avatarStats.size / 1024 / 1024).toFixed(2)} MB`);
      
//       if (avatarStats.size === 0) {
//         console.error(`   ❌ Avatar file is empty!`);
//         console.log(`   ℹ️ Reason avatar not included: Avatar file is empty`);
//       } else {
//         try {
//           const avatarMode = data.avatarMode || 'mask-based-bottom-left';
//           console.log(`   Avatar mode: ${avatarMode}`);
          
//           const avatarService = new AvatarService();
          
//           // Generate complete avatar video using new service
//           finalVideoPath = await avatarService.generateAvatarVideo({
//             scenes: updatedScenes,
//             effectType: chosenEffect,
//             avatarMode,
//             avatarPath,
//             // audioPath: path.join(dirs.audioDir, 'full_audio.wav'),
//             audioPath: 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav',
//             backgroundMusicPath: fs.existsSync(path.join(dirs.musicDir, 'back_audio.wav')) 
//               ? path.join(dirs.musicDir, 'back_audio.wav') 
//               : undefined,
//             tempDir: dirs.tempDir,
//             outputPath: path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`),
//             requestId,
//             dirs,
//             fps,
//             templates: overlayTemplates,
//             templateName: chosenEffect,
//             logoPath,
//             avatarMaskPath,
//           });
          
//           console.log(`✅ Avatar video generated successfully`);
          
//         } catch (err: any) {
//           console.error(`   ❌ Avatar generation failed: ${err.message}`);
//           console.log(`   ℹ️ Reason avatar not included: Avatar generation failed: ${err.message}`);
//           finalVideoPath = null;
//         }
//       }
//     } else {
//       if (avatar_url) {
//         console.error(`   ❌ Avatar file not found after download!`);
//         console.log(`   ℹ️ Reason avatar not included: Avatar download failed`);
//       } else {
//         console.log(`   ℹ️ No avatar_url provided, skipping avatar`);
//         console.log(`   ℹ️ Reason avatar not included: No avatar_url provided`);
//       }
//     }
    
//     // If avatar generation failed, fallback to background + audio only
//     if (!finalVideoPath) {
//       console.log(`\n${'='.repeat(80)}`);
//       console.log(`🎨 STEP 3: FALLBACK - BACKGROUND + AUDIO ONLY`);
//       console.log(`=`.repeat(80));
      
//       // const audioPath = path.join(dirs.audioDir, 'full_audio.wav');

//       // const musicPath = path.join(dirs.musicDir, 'back_audio.wav');
//       const audioPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav';
//       const musicPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\back-music.wav';
      
//       const hasMainAudio = await validateAudioFile(audioPath, requestId);
//       if (!hasMainAudio) {
//         throw new Error('Main audio not found');
//       }

//       const hasBackgroundMusic = fs.existsSync(musicPath) 
//         ? await validateAudioFile(musicPath, requestId, 'Background music')
//         : false;

//       finalVideoPath = path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`);

//       const musicArgs = hasBackgroundMusic 
//         ? [
//             '-i', escapePath(audioPath),
//             '-i', escapePath(musicPath),
//             '-filter_complex', '[0:a]volume=1.0[a1]; [1:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest[aout]',
//             '-map', '0:v:0', '-map', '[aout]'
//           ]
//         : [
//             '-i', escapePath(audioPath),
//             '-map', '0:v:0', '-map', '1:a:0'
//           ];

//       await runFfmpeg([
//         '-y',
//         '-i', escapePath(backgroundVideoPath),
//         ...musicArgs,
//         '-c:v', 'copy',
//         '-c:a', 'aac',
//         '-b:a', '192k',
//         '-shortest',
//         escapePath(finalVideoPath)
//       ]);

//       try {
//         fs.unlinkSync(backgroundVideoPath);
//       } catch (err) {
//         console.warn('⚠️ Cleanup warning');
//       }
//     }

//     // Verify
//     if (!fs.existsSync(finalVideoPath)) {
//       throw new Error('Final video not created');
//     }

//     const videoStats = fs.statSync(finalVideoPath);
//     if (videoStats.size === 0) {
//       throw new Error('Final video is empty');
//     }

//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`✅ FINAL VIDEO CREATED`);
//     console.log(`=`.repeat(80));
//     console.log(`📦 Size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
//     console.log(`📍 Path: ${finalVideoPath}`);
//     console.log(`👤 Avatar: ${avatarPath ? '✅' : '❌'}`);
//     console.log(`🎵 Music: ${backgroundMusicPath ? '✅' : '❌'}`);
//     console.log(`=`.repeat(80));

//     // Upload
//     console.log(`\n☁️ Uploading to S3...`);
//     const videoUrl = await uploadVideoToS3(
//       s3Client,
//       BUCKET_NAME,
//       finalVideoPath,
//       S3_FOLDER_PATH,
//       AI_API_SERVER
//     );

//     // Cleanup clips
//     try {
//       fs.unlinkSync(listFile);
//       clipPaths.forEach(clip => {
//         if (fs.existsSync(clip)) fs.unlinkSync(clip);
//       });
//       console.log(`\n🧹 Cleaned ${clipPaths.length} clips`);
//     } catch (err: any) {
//       console.warn(`⚠️ Cleanup: ${err.message}`);
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
//         hasBackgroundMusic: !!backgroundMusicPath,
//       },
//     };
//   } catch (err: any) {
//     console.error(`\n${'='.repeat(80)}`);
//     console.error(`❌ [${requestId}] WORKER ERROR`);
//     console.error(`${'='.repeat(80)}`);
//     console.error(`${err.message}`);
//     console.error(`${'='.repeat(80)}\n`);
//     throw err;
//   }
// }

// buildVideoWorker(workerData as WorkerData)
//   .then((result) => {
//     console.log(`\n✅ WORKER SUCCESS`);
//     console.log(`Video: ${result.videoUrl}`);
//     parentPort?.postMessage(result);
//   })
//   .catch((err) => {
//     console.error(`\n❌ WORKER FAILED: ${err.message}`);
//     parentPort?.postMessage({ 
//       error: err.message,
//       stack: err.stack,
//       requestId: workerData.requestId 
//     });
//   });




















  import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { saveSceneAssets, Scene } from 'src/utils/saveSceneImages';
import { runFfmpeg } from 'src/utils/ffmpeg.utils';
import { overlayTemplates } from 'src/utils/overlayStyles';
import { card_motion_effectAd } from 'src/efffects/cardMotioneffects';
import { simple_video_effect } from 'src/efffects/basic.effects';
import { zoom_effectAd } from 'src/efffects/zoom_effect';
import { cycling_effects_video } from 'src/efffects/cycling.effect';
import { compositeWithAudioMixing } from 'src/utils/video_compositor';
import * as dotenv from 'dotenv';
import { AvatarService } from '../avatar';
import { AvatarMaskService } from '../avatar';

const execPromise = promisify(exec);

const envPath = path.resolve(process.cwd(), '.env');
console.log(`\n Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });
console.log(`.env loaded successfully\n`);

interface WorkerData {
  requestId: string;
  scenes: Scene[];
  effectType?: string;
  avatarMode?: string;  
  audio_url?: string;
  logo_url?: string;
  avatar_url?: string;
  avatarMaskUrl?: string;
  background_music_url?: string;
  dirs: {
    requestDir: string;
    assetsDir: string;
    imagesDir: string;
    audioDir: string;
    videosDir: string;
    logoDir: string;
    avatarDir: string;
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
    'requestDir', 'assetsDir', 'imagesDir', 'audioDir', 'videosDir',
    'logoDir', 'avatarDir', 'musicDir', 'clipsDir', 'assDir', 'resizedDir', 'tempDir', 'outputDir',
  ];

  for (const dirKey of requiredDirs) {
    const dirPath = dirs[dirKey as keyof typeof dirs];
    
    if (!dirPath) {
      throw new Error(`Missing directory: ${dirKey}`);
    }

    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`    Created: ${dirKey}`);
      } catch (err: any) {
        throw new Error(`Failed to create ${dirKey}: ${err.message}`);
      }
    } else {
      console.log(`   Exists: ${dirKey}`);
    }
  }
  
  console.log(` [${requestId}] All directories validated\n`);
}

async function validateAudioFile(audioPath: string, requestId: string, fileType: string = 'audio'): Promise<boolean> {
  try {
    if (!fs.existsSync(audioPath)) {
      console.warn(` [${requestId}] ${fileType} file not found: ${audioPath}`);
      return false;
    }

    const stats = fs.statSync(audioPath);
    if (stats.size === 0) {
      console.warn(` [${requestId}] ${fileType} file is empty: ${audioPath}`);
      return false;
    }

    console.log(`[${requestId}] ${fileType} validated: ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } catch (err: any) {
    console.error(` [${requestId}] ${fileType} validation error: ${err.message}`);
    return false;
  }
}

async function ensureBucketExists(s3Client: S3Client, bucketName: string): Promise<void> {
  try {
    console.log(` Checking bucket: ${bucketName}...`);
    
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(` Bucket '${bucketName}' exists and accessible`);
  } catch (error: any) {
    console.log(` Bucket check error: ${error.$metadata?.httpStatusCode || error.name} - ${error.message}`);
    
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      throw new Error(`Bucket '${bucketName}' does not exist. Please create it manually.`);
    } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
      console.warn(` No HeadBucket permission - continuing...`);
    }
  }
}

async function uploadVideoToS3(
  s3Client: S3Client,
  bucketName: string,
  filePath: string,
  folderPath: string,
  apiServerUrl: string,
  contentType: string = 'video/mp4'
): Promise<string> {
  try {
    console.log(`\n Uploading to S3...`);

    const s3Key = `${folderPath.replace(/\/$/, '')}/${randomUUID()}.mp4`;
    console.log(`   S3 Key: ${s3Key}`);

    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    console.log(`   File Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(uploadCommand);
    console.log(` File uploaded to S3 successfully`);

    const videoUrl = `${apiServerUrl}/video?key=${encodeURIComponent(s3Key)}`;
    console.log(` Final video URL: ${videoUrl}`);

    return videoUrl;
  } catch (err: any) {
    throw new Error(`S3 upload failed: ${err.message}`);
  }
}

async function buildVideoWorker(data: WorkerData) {
  const { requestId, scenes, effectType, audio_url, background_music_url, logo_url, avatar_url, dirs, fps } = data;

  console.log(`\n${'='.repeat(80)}`);
  console.log(` VIDEO WORKER STARTED`);
  console.log(`=`.repeat(80));
  console.log(`Request ID: ${requestId}`);
  console.log(`Scenes: ${scenes.length}`);
  console.log(`Effect: ${effectType || 'zoom_effect'}`);
  console.log(`Avatar Mode: ${data.avatarMode || 'mix_mode_new'}`);
  console.log(`Audio: ${audio_url ? '✅' : '❌'}`);
  console.log(`Logo: ${logo_url ? '✅' : '❌'}`);
  console.log(`Avatar: ${avatar_url ? '✅' : '❌'}`);
  console.log(`Background Music: ${background_music_url ? '✅' : '❌'}`);
  console.log(`=`.repeat(80));

  // Initialize S3
  const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
  const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
  const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
  const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
  const AI_API_SERVER = process.env.AI_API_SERVER || '';
  const S3_FOLDER_PATH = process.env.OBJECT_KEY || '';

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not found');
  }

  const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    await ensureBucketExists(s3Client, BUCKET_NAME);
    validateDirectories(dirs, requestId);

    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes provided');
    }

    // ========== DOWNLOAD ASSETS ==========
    console.log(`\n [${requestId}] Downloading assets...`);
    
    let scenesWithAssets: Scene[];
    let logoPath: string | undefined;
    let avatarPath: string | undefined;
    let backgroundMusicPath: string | undefined;
    let avatarMaskPath: string | undefined;

    try {
      // 🎯 IMPORTANT: Pass avatarMode to saveSceneAssets
      const result = await saveSceneAssets(
        scenes,
        dirs.assetsDir,
        audio_url,
        logo_url,
        avatar_url,
        background_music_url,
        data.avatarMaskUrl,
        data.avatarMode  // 🆕 NEW: This enables background removal for mask-based modes
      );
      
      scenesWithAssets = result.updatedScenes;
      logoPath = result.logoPath;
      avatarPath = result.avatarPath;  // 🎭 This will be pre-processed if avatarMode is mask-based
      backgroundMusicPath = result.backgroundMusicPath;
      avatarMaskPath = result.avatarMaskPath;

      console.log(`\n✅ Assets downloaded:`);
      console.log(`   Scenes: ${scenesWithAssets.length}`);
      console.log(`   Logo: ${logoPath || 'NONE'}`);
      console.log(`   Avatar: ${avatarPath || 'NONE'}`);
      
      // Check if avatar is pre-processed
      if (avatarPath) {
        const isProcessed = avatarPath.includes('avatar_processed');
        console.log(`   Avatar Type: ${isProcessed ? '🎭 PRE-PROCESSED (Background Removed)' : '📹 ORIGINAL'}`);
      }
      
      console.log(`   Avatar Mask (downloaded): ${avatarMaskPath || 'NONE'}`);

      // Auto-generate mask from avatar if not provided (fallback)
      if (avatarPath && !avatarMaskPath && !data.avatarMode?.includes('mask-based')) {
        try {
          console.log(`   🎭 Attempting to auto-generate mask...`);
          const maskService = new AvatarMaskService();
          const masksDir = path.join(dirs.assetsDir, 'masks');
          const generated = await maskService.getAvatarAndMask(avatarPath, masksDir);
          avatarMaskPath = generated.maskPath;
          console.log(`   ✅ Avatar Mask (generated): ${avatarMaskPath}`);
        } catch (err: any) {
          console.warn(`   ⚠️  Auto mask generation failed: ${err.message}`);
        }
      }
      
      console.log(`   Music: ${backgroundMusicPath || 'NONE'}`);
    } catch (err: any) {
      throw new Error(`Asset download failed: ${err.message}`);
    }

    const updatedScenes = scenesWithAssets.map((scene) => ({
      ...scene,
      scene_id: String(scene.scene_id),
      image_filename: scene.image_filename || null,
      video_filename: scene.video_filename || null,
      audio_filename: scene.audio_filename || null,
      background_music_filename: scene.background_music_filename || null,
      asset_type: scene.asset_type || 'image',
    }));

    // ========== STEP 1: GENERATE BACKGROUND VIDEO ==========
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📹 STEP 1: GENERATING BACKGROUND VIDEO`);
    console.log(`=`.repeat(80));

    let clipPaths: string[] = [];
    const chosenEffect = effectType || 'zoom_effect';

    try {
      switch (chosenEffect) {
        case 'zoom_effect':
          clipPaths = await zoom_effectAd(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'zoom_effect', logoPath);
          break;
        case 'card_motion':
          clipPaths = await card_motion_effectAd(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'card_motion', logoPath);
          break;
        case 'basic':
          clipPaths = await simple_video_effect(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'basic', logoPath);
          break;
        case 'cycle':
          clipPaths = await cycling_effects_video(updatedScenes, dirs, runFfmpeg, fps, overlayTemplates, 'cycle', logoPath);
          break;
        default:
          throw new Error(`Unknown effect: ${chosenEffect}`);
      }
    } catch (err: any) {
      throw new Error(`Background effect failed: ${err.message}`);
    }

    if (clipPaths.length === 0) {
      throw new Error('No background clips generated');
    }
    console.log(`✅ Generated ${clipPaths.length} background clips`);

    // Concatenate background clips
    const listFile = path.join(dirs.outputDir, `concat_${Date.now()}.txt`);
    const listContent = clipPaths.map((p) => `file '${escapePath(p)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const backgroundVideoPath = path.join(dirs.tempDir, `background_${Date.now()}.mp4`);

    console.log('\n🎬 Merging background clips...');
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', escapePath(listFile),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-an',
      escapePath(backgroundVideoPath)
    ]);

    if (!fs.existsSync(backgroundVideoPath)) {
      throw new Error('Background video not created');
    }
    console.log(`✅ Background: ${path.basename(backgroundVideoPath)}`);


    // ========== STEP 2: AVATAR PROCESSING ==========
    console.log(`\n${'='.repeat(80)}`);
    console.log(`👤 STEP 2: AVATAR PROCESSING`);
    console.log(`=`.repeat(80));
    
    let finalVideoPath: string | null = null;
    
    if (avatarPath && fs.existsSync(avatarPath)) {
      console.log(`   ✅ Avatar file found: ${path.basename(avatarPath)}`);
      
      const avatarStats = fs.statSync(avatarPath);
      console.log(`   Avatar file size: ${(avatarStats.size / 1024 / 1024).toFixed(2)} MB`);
      
      if (avatarStats.size === 0) {
        console.error(`   ❌ Avatar file is empty!`);
        console.log(`   ℹ️ Reason avatar not included: Avatar file is empty`);
      } else {
        try {
          const avatarMode = data.avatarMode || 'mask-based-bottom-left';
          console.log(`   Avatar mode: ${avatarMode}`);
          
          // Check if avatar is pre-processed
          const isPreProcessed = avatarPath.includes('avatar_processed');
          if (isPreProcessed) {
            console.log(`   ✨ Using pre-processed avatar (background already removed)`);
          }
          
          const avatarService = new AvatarService();
          
          // Generate complete avatar video using new service
          finalVideoPath = await avatarService.generateAvatarVideo({
            scenes: updatedScenes,
            effectType: chosenEffect,
            avatarMode,
            avatarPath,  // 🎭 This is now pre-processed if mode is mask-based
            audioPath: path.join(dirs.audioDir, 'full_audio.wav'),
            backgroundMusicPath: fs.existsSync(path.join(dirs.musicDir, 'back_audio.wav')) 
              ? path.join(dirs.musicDir, 'back_audio.wav') 
              : undefined,
            tempDir: dirs.tempDir,
            outputPath: path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`),
            requestId,
            dirs,
            fps,
            templates: overlayTemplates,
            templateName: chosenEffect,
            logoPath,
            avatarMaskPath,  // Optional external mask (if provided)
          });
          
          console.log(`✅ Avatar video generated successfully`);
          
        } catch (err: any) {
          console.error(`   ❌ Avatar generation failed: ${err.message}`);
          console.log(`   ℹ️ Reason avatar not included: Avatar generation failed: ${err.message}`);
          finalVideoPath = null;
        }
      }
    } else {
      if (avatar_url) {
        console.error(`   ❌ Avatar file not found after download!`);
        console.log(`   ℹ️ Reason avatar not included: Avatar download failed`);
      } else {
        console.log(`   ℹ️ No avatar_url provided, skipping avatar`);
        console.log(`   ℹ️ Reason avatar not included: No avatar_url provided`);
      }
    }
    
    // If avatar generation failed, fallback to background + audio only
    if (!finalVideoPath) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎨 STEP 3: FALLBACK - BACKGROUND + AUDIO ONLY`);
      console.log(`=`.repeat(80));
      
      // const audioPath = path.join(dirs.audioDir, 'full_audio.wav');
      // const musicPath = path.join(dirs.musicDir, 'back_audio.wav');
      const audioPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\full_audio.wav';
      const musicPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\back-music.wav';
      const hasMainAudio = await validateAudioFile(audioPath, requestId);
      if (!hasMainAudio) {
        throw new Error('Main audio not found');
      }

      const hasBackgroundMusic = fs.existsSync(musicPath) 
        ? await validateAudioFile(musicPath, requestId, 'Background music')
        : false;

      finalVideoPath = path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`);

// ✅ CORRECT CODE:
const musicArgs = hasBackgroundMusic 
  ? [
      '-i', escapePath(audioPath),        // This becomes input [1]
      '-i', escapePath(musicPath),        // This becomes input [2]
      '-filter_complex', '[1:a]volume=1.0[a1]; [2:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest[aout]',
      //                  ^^^^^ MAIN AUDIO   ^^^^^ BACKGROUND MUSIC
      '-map', '0:v:0', '-map', '[aout]'
    ]
  : [
      '-i', escapePath(audioPath),
      '-map', '0:v:0', '-map', '1:a:0'
    ];

await runFfmpeg([
  '-y',
  '-i', escapePath(backgroundVideoPath),  // Input [0] - video only
  ...musicArgs,  // Adds audio inputs [1] and [2]
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-shortest',
  escapePath(finalVideoPath)
]);


      // const musicArgs = hasBackgroundMusic 
      //   ? [
      //       '-i', escapePath(audioPath),
      //       '-i', escapePath(musicPath),
      //       '-filter_complex', '[0:a]volume=1.0[a1]; [1:a]volume=0.1[a2]; [a1][a2]amix=inputs=2:duration=longest[aout]',
      //       '-map', '0:v:0', '-map', '[aout]'
      //     ]
      //   : [
      //       '-i', escapePath(audioPath),
      //       '-map', '0:v:0', '-map', '1:a:0'
      //     ];

      // await runFfmpeg([
      //   '-y',
      //   '-i', escapePath(backgroundVideoPath),
      //   ...musicArgs,
      //   '-c:v', 'copy',
      //   '-c:a', 'aac',
      //   '-b:a', '192k',
      //   '-shortest',
      //   escapePath(finalVideoPath)
      // ]);

      try {
        fs.unlinkSync(backgroundVideoPath);
      } catch (err) {
        console.warn('⚠️ Cleanup warning');
      }
    }

    // Verify
    if (!fs.existsSync(finalVideoPath)) {
      throw new Error('Final video not created');
    }

    const videoStats = fs.statSync(finalVideoPath);
    if (videoStats.size === 0) {
      throw new Error('Final video is empty');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ FINAL VIDEO CREATED`);
    console.log(`=`.repeat(80));
    console.log(`📦 Size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📍 Path: ${finalVideoPath}`);
    console.log(`👤 Avatar: ${avatarPath ? '✅' : '❌'}`);
    console.log(`🎵 Music: ${backgroundMusicPath ? '✅' : '❌'}`);
    console.log(`=`.repeat(80));

    // Upload
    console.log(`\n☁️ Uploading to S3...`);
    const videoUrl = await uploadVideoToS3(
      s3Client,
      BUCKET_NAME,
      finalVideoPath,
      S3_FOLDER_PATH,
      AI_API_SERVER
    );

    // Cleanup clips
    try {
      fs.unlinkSync(listFile);
      clipPaths.forEach(clip => {
        if (fs.existsSync(clip)) fs.unlinkSync(clip);
      });
      console.log(`\n🧹 Cleaned ${clipPaths.length} clips`);
    } catch (err: any) {
      console.warn(`⚠️ Cleanup: ${err.message}`);
    }

    return {
      requestId,
      chosenEffect,
      localPath: finalVideoPath,
      videoUrl,
      stats: {
        totalClips: clipPaths.length,
        videoSize: videoStats.size,
        videoSizeMB: (videoStats.size / 1024 / 1024).toFixed(2),
        hasAvatar: !!avatarPath,
        hasLogo: !!logoPath,
        hasBackgroundMusic: !!backgroundMusicPath,
      },
    };
  } catch (err: any) {
    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ [${requestId}] WORKER ERROR`);
    console.error(`${'='.repeat(80)}`);
    console.error(`${err.message}`);
    console.error(`${'='.repeat(80)}\n`);
    throw err;
  }
}

buildVideoWorker(workerData as WorkerData)
  .then((result) => {
    console.log(`\n✅ WORKER SUCCESS`);
    console.log(`Video: ${result.videoUrl}`);
    parentPort?.postMessage(result);
  })
  .catch((err) => {
    console.error(`\n❌ WORKER FAILED: ${err.message}`);
    parentPort?.postMessage({ 
      error: err.message,
      stack: err.stack,
      requestId: workerData.requestId 
    });
  });





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
// console.log(`.env loaded successfully\n`);

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
//     avatarDir: string;
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
//     'logoDir', 'avatarDir', 'musicDir', 'clipsDir', 'assDir', 'resizedDir', 'tempDir', 'outputDir',
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
//     } else {
//       console.log(`   Exists: ${dirKey}`);
//     }
//   }
  
//   console.log(` [${requestId}] All directories validated\n`);
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
//     console.log(`   Output: ${path.basename(outputPath)}`);

//     // Verify input files exist
//     if (!fs.existsSync(videoPath)) {
//       throw new Error(`Video file not found: ${videoPath}`);
//     }
//     if (!fs.existsSync(avatarPath)) {
//       throw new Error(`Avatar file not found: ${avatarPath}`);
//     }

//     // Check file sizes
//     const videoStats = fs.statSync(videoPath);
//     const avatarStats = fs.statSync(avatarPath);
//     console.log(`   Video size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
//     console.log(`   Avatar size: ${(avatarStats.size / 1024 / 1024).toFixed(2)} MB`);

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

//     // Verify output was created
//     if (!fs.existsSync(outputPath)) {
//       throw new Error('Avatar overlay output file was not created');
//     }

//     const outputStats = fs.statSync(outputPath);
//     console.log(` [${requestId}] Avatar overlay completed`);
//     console.log(`   Output size: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
//   } catch (err: any) {
//     console.error(` [${requestId}] Avatar overlay failed:`, err.message);
//     throw new Error(`Avatar overlay failed: ${err.message}`);
//   }
// }

// async function validateAudioFile(audioPath: string, requestId: string, fileType: string = 'audio'): Promise<boolean> {
//   try {
//     if (!fs.existsSync(audioPath)) {
//       console.warn(` [${requestId}] ${fileType} file not found: ${audioPath}`);
//       return false;
//     }

//     const stats = fs.statSync(audioPath);
//     if (stats.size === 0) {
//       console.warn(` [${requestId}] ${fileType} file is empty: ${audioPath}`);
//       return false;
//     }

//     console.log(`[${requestId}] ${fileType} validated: ${(stats.size / 1024).toFixed(2)} KB`);
//     return true;
//   } catch (err: any) {
//     console.error(` [${requestId}] ${fileType} validation error: ${err.message}`);
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
//       console.log(` Bucket '${bucketName}' does not exist!`);
//       throw new Error(`Bucket '${bucketName}' does not exist. Please create it manually.`);
//     } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
//       console.warn(` No HeadBucket permission for '${bucketName}' (403 Forbidden)`);
//       console.log(`   This is normal if IAM policy doesn't include s3:ListBucket`);
//       console.log(`   Proceeding with upload attempt...\n`);
//     } else {
//       console.warn(` Bucket check warning: ${error.message}`);
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
//     console.log(`\n Uploading to S3...`);

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

//   console.log(`\n${'='.repeat(80)}`);
//   console.log(` VIDEO WORKER STARTED`);
//   console.log(`=`.repeat(80));
//   console.log(`Request ID: ${requestId}`);
//   console.log(`Scenes: ${scenes.length}`);
//   console.log(`Effect: ${effectType || 'zoom_effect'}`);
//   console.log(`Audio URL: ${audio_url ? '✅ Provided' : '❌ Not provided'}`);
//   console.log(`Logo URL: ${logo_url ? '✅ Provided' : '❌ Not provided'}`);
//   console.log(`Avatar URL: ${avatar_url ? '✅ Provided' : '❌ NOT PROVIDED'}`);
//   console.log(`Background Music URL: ${background_music_url ? '✅ Provided' : '❌ Not provided'}`);
//   console.log(`=`.repeat(80));

//   if (avatar_url) {
//     console.log(`\n AVATAR URL DETAILS:`);
//     console.log(`   Full URL: ${avatar_url}`);
//     console.log(`   Length: ${avatar_url.length} characters`);
//     console.log(`   Starts with: ${avatar_url.substring(0, 50)}...`);
//   } else {
//     console.log(`\n❌ AVATAR URL IS UNDEFINED/NULL/EMPTY`);
//   }

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

//   console.log("\n AWS Credentials loaded:");
//   console.log("   Access Key ID:", AWS_ACCESS_KEY_ID);
//   console.log("   Access Key Length:", AWS_ACCESS_KEY_ID.length);
//   console.log("   Secret Key (last 4):", `***${AWS_SECRET_ACCESS_KEY.substring(AWS_SECRET_ACCESS_KEY.length - 4)}`);

//   try {
//     await ensureBucketExists(s3Client, BUCKET_NAME);
//     validateDirectories(dirs, requestId);

//     if (!scenes || scenes.length === 0) {
//       throw new Error('No scenes provided');
//     }
//     console.log(`\n [${requestId}] Processing ${scenes.length} scenes`);

//     console.log(`\n [${requestId}] Starting asset downloads...`);
//     console.log(`   Avatar URL being passed: ${avatar_url || 'NONE'}`);
    
//     let scenesWithAssets: Scene[];
//     let logoPath: string | undefined;
//     let avatarPath: string | undefined;
//     let backgroundMusicPath: string | undefined;

//     try {
//       console.log(`\n Calling saveSceneAssets with:`);
//       console.log(`   scenes count: ${scenes.length}`);
//       console.log(`   assetsDir: ${dirs.assetsDir}`);
//       console.log(`   audio_url: ${audio_url ? 'YES' : 'NO'}`);
//       console.log(`   logo_url: ${logo_url ? 'YES' : 'NO'}`);
//       console.log(`   avatar_url: ${avatar_url ? 'YES' : 'NO'}`);
//       console.log(`   background_music_url: ${background_music_url ? 'YES' : 'NO'}`);

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

//       console.log(`\n Asset download results:`);
//       console.log(`   Scenes processed: ${scenesWithAssets.length}`);
//       console.log(`   Logo path: ${logoPath || 'NONE'}`);
//       console.log(`   Avatar path: ${avatarPath || 'NONE'}`);
//       console.log(`   Background music path: ${backgroundMusicPath || 'NONE'}`);

//       if (avatarPath) {
//         console.log(`\n Avatar video downloaded successfully!`);
//         console.log(`   Path: ${avatarPath}`);
//         console.log(`   Exists: ${fs.existsSync(avatarPath)}`);
//         if (fs.existsSync(avatarPath)) {
//           const stats = fs.statSync(avatarPath);
//           console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
//         }
//       } else if (avatar_url) {
//         console.warn(`\nAvatar URL was provided but download FAILED`);
//         console.warn(`   Check saveSceneAssets logs above for details`);
//       } else {
//         console.log(`\n❌ No avatar URL provided, skipping avatar overlay`);
//       }
//     } catch (err: any) {
//       console.error(`\n❌ Asset download failed:`, err.message);
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

//     console.log(`\n [${requestId}] Assets processed successfully`);

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

//     const audioPath = path.join(dirs.audioDir, 'full_audio.wav');
//     // const musicPath = path.join(dirs.musicDir, 'back_audio.wav');
//     const musicPath = 'C:\\Users\\LalitBagora\\Desktop\\template\\backend\\assets\\audio\\back_audio.wav';


//     console.log(`\n [${requestId}] Validating audio files...`);
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

//     const finalVideoPath = path.join(dirs.outputDir, `final_${chosenEffect}_${Date.now()}.mp4`);
    
//     // CRITICAL AVATAR OVERLAY SECTION
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(` AVATAR OVERLAY DECISION`);
//     console.log(`=`.repeat(80));
//     console.log(`Avatar path: ${avatarPath || 'NONE'}`);
//     console.log(`Avatar path exists: ${avatarPath ? fs.existsSync(avatarPath) : 'N/A'}`);
    
//     if (avatarPath && fs.existsSync(avatarPath)) {
//       const avatarStats = fs.statSync(avatarPath);
//       console.log(`Avatar file size: ${(avatarStats.size / 1024 / 1024).toFixed(2)} MB`);
      
//       if (avatarStats.size === 0) {
//         console.error(`❌ Avatar file is empty, skipping overlay`);
//         console.log(`   Moving temp video to final...`);
//         fs.renameSync(tempVideoPath, finalVideoPath);
//       } else {
//         console.log(` Avatar file valid, applying overlay...`);
//         await overlayAvatarOnVideo(tempVideoPath, avatarPath, finalVideoPath, requestId, runFfmpeg);
        
//         try {
//           fs.unlinkSync(tempVideoPath);
//           console.log(`    Temp video deleted`);
//         } catch (err) {
//           console.warn(`    Could not delete temp video: ${err}`);
//         }
//       }
//     } else {
//       console.log(` Avatar not available or file doesn't exist`);
//       if (avatar_url) {
//         console.log(`    Avatar URL was provided but file not found!`);
//       }
//       console.log(`   Using merged video as final (no avatar overlay)`);
//       fs.renameSync(tempVideoPath, finalVideoPath);
//     }
//     console.log(`=`.repeat(80) + '\n');

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
//       console.warn(`⚠️ Cleanup warning: ${err.message}`);
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
//     console.error(`\n${'='.repeat(80)}`);
//     console.error(`❌ [${requestId}] WORKER ERROR`);
//     console.error(`${'='.repeat(80)}`);
//     console.error(`${err.message}`);
//     console.error(`Stack: ${err.stack}`);
//     console.error(`${'='.repeat(80)}\n`);
//     throw err;
//   }
// }



// buildVideoWorker(workerData as WorkerData)
//   .then((result) => {
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`✅ WORKER COMPLETED SUCCESSFULLY`);
//     console.log(`=`.repeat(80));
//     console.log(`Request ID: ${result.requestId}`);
//     console.log(`Effect: ${result.chosenEffect}`);
//     console.log(`Video Size: ${result.stats.videoSizeMB} MB`);
//     console.log(`Avatar: ${result.stats.hasAvatar ? '✅ Applied' : '❌ Not applied'}`);
//     console.log(`Logo: ${result.stats.hasLogo ? '✅ Applied' : '❌ Not applied'}`);
//     console.log(`Background Music: ${result.stats.hasBackgroundMusic ? '✅ Applied' : '❌ Not applied'}`);
//     console.log(`Local Path: ${result.localPath}`);
//     console.log(`S3 URL: ${result.videoUrl}`);
//     console.log(`=`.repeat(80) + '\n');
//     parentPort?.postMessage(result);
//   })
//   .catch((err) => {
//     console.error(`\n❌ WORKER FAILED:`, err.message);
//     parentPort?.postMessage({ 
//       error: err.message,
//       stack: err.stack,
//       requestId: workerData.requestId 
//     });
//   });





