import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export interface Scene {
 scene_id: number;
  image_filename?: string;
  video_filename?: string;
  audio_filename?: string;
  background_music_filename?: string;
  background_music_url?: string;
  asset_type?: 'image' | 'video';
  overlayText?: string;
  words?: Array<{ word: string; start: number; end: number }>;
  start_time?: number;
  end_time?: number;
  audio_duration?: number;
  direction?: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\s]/g, '_');
}

function getFileExtension(url: string): string {
  const urlWithoutQuery = url.split('?')[0];
  const ext = path.extname(urlWithoutQuery);
  return ext || '.jpg';
}

function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv'];
  const ext = path.extname(filename.toLowerCase());
  return videoExtensions.includes(ext);
}

async function downloadFile(
  url: string,
  outputPath: string,
  fileType: string = 'file'
): Promise<boolean> {
  try {
    console.log(` Downloading ${fileType}: ${path.basename(outputPath)}`);
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 500 * 1024 * 1024,
    });

    fs.writeFileSync(outputPath, Buffer.from(response.data));
    const fileSizeKB = (response.data.byteLength / 1024).toFixed(2);
    console.log(`✅ ${fileType} saved: ${path.basename(outputPath)} (${fileSizeKB} KB)`);
    return true;
  } catch (err: any) {
    console.error(`❌ Failed to download ${fileType}:`, err.message);
    return false;
  }
}

export async function saveSceneAssets(
  scenes: Scene[],
  assetsFolder: string = 'assets',
  globalAudioUrl?: string,
  logoUrl?: string,
  avatarUrl?: string,
  backgroundMusicUrl?: string
): Promise<{
  folderPath: string;
  updatedScenes: Scene[];
  logoPath?: string;
  avatarPath?: string;
  backgroundMusicPath?: string;
}> {
  try {
    const folderPath = path.isAbsolute(assetsFolder)
      ? assetsFolder
      : path.join(process.cwd(), assetsFolder);

    const imagesDir = path.join(folderPath, 'images');
    const videosDir = path.join(folderPath, 'videos');
    const audioDir = path.join(folderPath, 'audio');
    const logoDir = path.join(folderPath, 'logo');
    const musicDir = path.join(folderPath, 'music');
    const avatarDir = path.join(folderPath, 'avatar');

    // Create all necessary directories
    const dirs = [imagesDir, videosDir, audioDir, logoDir, musicDir, avatarDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(` Created directory: ${dir}`);
      }
    }

    console.log(`\n Using assets folder: ${folderPath}\n`);

    // Download global audio 
    let globalAudioPath: string | undefined;
    if (globalAudioUrl) {
      try {
        console.log(' Downloading global audio...');
        const ext = getFileExtension(globalAudioUrl);
        globalAudioPath = path.join(audioDir, `full_audio${ext}`);

        const success = await downloadFile(globalAudioUrl, globalAudioPath, 'audio');
        if (!success) {
          globalAudioPath = undefined;
        }
      } catch (err: any) {
        console.error('❌ Global audio download failed:', err.message);
        globalAudioPath = undefined;
      }
    }

    // Download background music
    let backgroundMusicPath: string | undefined;
    if (backgroundMusicUrl) {
      try {
        console.log('\n Downloading background music...');
        const ext = getFileExtension(backgroundMusicUrl);
        backgroundMusicPath = path.join(musicDir, `back_audio${ext}`);

        const success = await downloadFile(backgroundMusicUrl, backgroundMusicPath, 'background music');
        if (!success) {
          backgroundMusicPath = undefined;
        }
      } catch (err: any) {
        console.error('❌ Background music download failed:', err.message);
        backgroundMusicPath = undefined;
      }
    }

    // Download logo
    let logoPath: string | undefined;
    if (logoUrl) {
      try {
        console.log('\n Downloading logo...');
        const ext = getFileExtension(logoUrl);
        logoPath = path.join(logoDir, `logo${ext}`);

        const success = await downloadFile(logoUrl, logoPath, 'logo');
        if (!success) {
          logoPath = undefined;
        }
      } catch (err: any) {
        console.error('❌ Logo download failed:', err.message);
        logoPath = undefined;
      }
    }

    //  Download avatar video
    let avatarPath: string | undefined;
    if (avatarUrl) {
      try {
        console.log('\n Downloading avatar video...');
        const ext = getFileExtension(avatarUrl) || '.mp4';
        avatarPath = path.join(avatarDir, `avatar_video${ext}`);

        const success = await downloadFile(avatarUrl, avatarPath, 'avatar video');
        if (!success) {
          avatarPath = undefined;
        } else {
          // Verify it's a valid video file
          const stats = fs.statSync(avatarPath);
          if (stats.size === 0) {
            console.error('❌ Avatar video file is empty');
            avatarPath = undefined;
          } else {
            console.log(`✅ Avatar video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
        }
      } catch (err: any) {
        console.error('❌ Avatar video download failed:', err.message);
        avatarPath = undefined;
      }
    }

    console.log(`\n Processing ${scenes.length} scenes...\n`);
    const updatedScenes: Scene[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = { ...scenes[i] };
      const sceneNum = i + 1;

      console.log(` Scene ${sceneNum}/${scenes.length}: ${scene.scene_id}`);

      try {
        // Detect asset type
        let assetUrl: string | undefined;
        let isVideo = false;

        if (scene.video_filename) {
          assetUrl = scene.video_filename;
          isVideo = true;
          scene.asset_type = 'video';
        } else if (scene.image_filename) {
          assetUrl = scene.image_filename;
          isVideo = isVideoFile(scene.image_filename);
          scene.asset_type = isVideo ? 'video' : 'image';
        }

        if (!assetUrl) {
          console.warn(`     No media found for scene ${scene.scene_id}`);
          updatedScenes.push({
            ...scene,
            audio_filename: globalAudioPath,
            background_music_filename: backgroundMusicPath,
          });
          continue;
        }

        // Handle URL-based media
        if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
          const ext = getFileExtension(assetUrl);
          const safeName = sanitizeFileName(scene.scene_id.toString());
          const targetDir = isVideo ? videosDir : imagesDir;
          const localPath = path.join(targetDir, `${safeName}${ext}`);

          console.log(`    Type: ${isVideo ? 'VIDEO' : 'IMAGE'}`);

          const success = await downloadFile(
            assetUrl,
            localPath,
            isVideo ? 'video' : 'image'
          );

          if (success) {
            if (isVideo) {
              scene.video_filename = localPath;
              scene.image_filename = undefined;
            } else {
              scene.image_filename = localPath;
              scene.video_filename = undefined;
            }
          } else {
            console.warn(`     Keeping original URL as fallback`);
          }
        } else {
          // Local file path
          console.log(`    Local file: ${path.basename(assetUrl)}`);

          if (!fs.existsSync(assetUrl)) {
            console.error(`   ❌ Local file not found: ${assetUrl}`);
          } else {
            if (isVideo) {
              scene.video_filename = assetUrl;
              scene.image_filename = undefined;
            } else {
              scene.image_filename = assetUrl;
              scene.video_filename = undefined;
            }
          }
        }

        updatedScenes.push({
          ...scene,
          audio_filename: globalAudioPath,
          background_music_filename: backgroundMusicPath,
        });

        console.log(`   ✅ Scene ${sceneNum} processed\n`);
      } catch (err: any) {
        console.error(`   ❌ Error processing scene ${scene.scene_id}:`, err.message);
        updatedScenes.push({
          ...scene,
          audio_filename: globalAudioPath,
          background_music_filename: backgroundMusicPath,
        });
      }
    }

    console.log(`\n✅ All assets processed successfully`);
    console.log(` Total scenes: ${updatedScenes.length}`);
    console.log(`Videos: ${updatedScenes.filter(s => s.asset_type === 'video').length}`);
    console.log(`Images: ${updatedScenes.filter(s => s.asset_type === 'image').length}`);
    console.log(`Audio: ${globalAudioPath ? 'Yes' : 'No'}`);
    console.log(`Background Music: ${backgroundMusicPath ? 'Yes' : 'No'}`);
    console.log(`Logo: ${logoPath ? 'Yes' : 'No'}`);
    console.log(`Avatar Video: ${avatarPath ? 'Yes' : 'No'}\n`);

    return { 
      folderPath, 
      updatedScenes, 
      logoPath, 
      avatarPath,
      backgroundMusicPath 
    };
  } catch (err: any) {
    console.error('❌ Critical error in saveSceneAssets:', err.message);
    throw new Error(`Failed to save scene assets: ${err.message}`);
  }
}











// import * as fs from 'fs';
// import * as path from 'path';
// import axios from 'axios';

// export interface Scene {
//   chunk_id: string;
//   image_filename?: string;
//   video_filename?: string;
//   audio_filename?: string;
//   background_music_filename?: string;  // Optional
//   background_music_url?: string;        // Optional
//   asset_type?: 'image' | 'video';
//   overlayText?: string;
//   words?: Array<{ word: string; start: number; end: number }>;
//   start_time?: number;
//   end_time?: number;
//   audio_duration?: number;
//   direction?: string;
// }

// function sanitizeFileName(name: string): string {
//   return name.replace(/[<>:"/\\|?*\s]/g, '_');
// }

// function getFileExtension(url: string): string {
//   const urlWithoutQuery = url.split('?')[0];
//   const ext = path.extname(urlWithoutQuery);
//   return ext || '.jpg';
// }

// function isVideoFile(filename: string): boolean {
//   const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv'];
//   const ext = path.extname(filename.toLowerCase());
//   return videoExtensions.includes(ext);
// }

// async function downloadFile(
//   url: string,
//   outputPath: string,
//   fileType: string = 'file'
// ): Promise<boolean> {
//   try {
//     console.log(` Downloading ${fileType}: ${path.basename(outputPath)}`);
    
//     const response = await axios.get(url, {
//       responseType: 'arraybuffer',
//       timeout: 60000,
//       maxContentLength: 500 * 1024 * 1024,
//     });

//     fs.writeFileSync(outputPath, Buffer.from(response.data));
//     const fileSizeKB = (response.data.byteLength / 1024).toFixed(2);
//     console.log(`✅ ${fileType} saved: ${path.basename(outputPath)} (${fileSizeKB} KB)`);
//     return true;
//   } catch (err: any) {
//     console.error(`❌ Failed to download ${fileType}:`, err.message);
//     return false;
//   }
// }

// export async function saveSceneAssets(
//   scenes: Scene[],
//   assetsFolder: string = 'assets',
//   globalAudioUrl?: string,
//   logoUrl?: string,
//   avatarUrl?:string,
//   backgroundMusicUrl?: string
// ): Promise<{
//   folderPath: string;
//   updatedScenes: Scene[];
//   logoPath?: string;
//   backgroundMusicPath?: string;
// }> {
//   try {
//     const folderPath = path.isAbsolute(assetsFolder)
//       ? assetsFolder
//       : path.join(process.cwd(), assetsFolder);

//     const imagesDir = path.join(folderPath, 'images');
//     const videosDir = path.join(folderPath, 'videos');
//     const audioDir = path.join(folderPath, 'audio');
//     const logoDir = path.join(folderPath, 'logo');
//     const musicDir = path.join(folderPath, 'music');
//     const avatarDir = path.join(folderPath,'avatar')

//     // Create all necessary directories
//     const dirs = [imagesDir, videosDir, audioDir, logoDir, musicDir,avatarDir];
//     for (const dir of dirs) {
//       if (!fs.existsSync(dir)) {
//         fs.mkdirSync(dir, { recursive: true });
//         console.log(` Created directory: ${dir}`);
//       }
//     }

//     console.log(`\n Using assets folder: ${folderPath}\n`);

//     //Download global audio 
//     let globalAudioPath: string | undefined;
//     if (globalAudioUrl) {
//       try {
//         console.log(' Downloading global audio...');
//         const ext = getFileExtension(globalAudioUrl);
//         globalAudioPath = path.join(audioDir, `full_audio${ext}`);

//         const success = await downloadFile(globalAudioUrl, globalAudioPath, 'audio');
//         if (!success) {
//           globalAudioPath = undefined;
//         }
//       } catch (err: any) {
//         console.error('❌ Global audio download failed:', err.message);
//         globalAudioPath = undefined;
//       }
//     }

//     // ---- Download background music ----
//     let backgroundMusicPath: string | undefined;
//     if (backgroundMusicUrl) {
//       try {
//         console.log('\n Downloading background music...');
//         const ext = getFileExtension(backgroundMusicUrl);
//         backgroundMusicPath = path.join(musicDir, `back-music${ext}`);

//         const success = await downloadFile(backgroundMusicUrl, backgroundMusicPath, 'background music');
//         if (!success) {
//           backgroundMusicPath = undefined;
//         }
//       } catch (err: any) {
//         console.error('❌ Background music download failed:', err.message);
//         backgroundMusicPath = undefined;
//       }
//     }

//     // ---- Download logo ----
//     let logoPath: string | undefined;
//     if (logoUrl) {
//       try {
//         console.log('\n Downloading logo...');
//         const ext = getFileExtension(logoUrl);
//         logoPath = path.join(logoDir, `logo${ext}`);

//         const success = await downloadFile(logoUrl, logoPath, 'logo');
//         if (!success) {
//           logoPath = undefined;
//         }
//       } catch (err: any) {
//         console.error('❌ Logo download failed:', err.message);
//         logoPath = undefined;
//       }
//     }


//     console.log(`\n Processing ${scenes.length} scenes...\n`);
//     const updatedScenes: Scene[] = [];

//     for (let i = 0; i < scenes.length; i++) {
//       const scene = { ...scenes[i] };
//       const sceneNum = i + 1;

//       console.log(` Scene ${sceneNum}/${scenes.length}: ${scene.chunk_id}`);

//       try {
//         // Detect asset type
//         let assetUrl: string | undefined;
//         let isVideo = false;

//         if (scene.video_filename) {
//           assetUrl = scene.video_filename;
//           isVideo = true;
//           scene.asset_type = 'video';
//         } else if (scene.image_filename) {
//           assetUrl = scene.image_filename;
//           isVideo = isVideoFile(scene.image_filename);
//           scene.asset_type = isVideo ? 'video' : 'image';
//         }

//         if (!assetUrl) {
//           console.warn(`     No media found for scene ${scene.chunk_id}`);
//           updatedScenes.push({
//             ...scene,
//             audio_filename: globalAudioPath,
//             background_music_filename: backgroundMusicPath,
//           });
//           continue;
//         }

//         // Handle URL-based media
//         if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
//           const ext = getFileExtension(assetUrl);
//           const safeName = sanitizeFileName(scene.chunk_id);
//           const targetDir = isVideo ? videosDir : imagesDir;
//           const localPath = path.join(targetDir, `${safeName}${ext}`);

//           console.log(`    Type: ${isVideo ? 'VIDEO' : 'IMAGE'}`);

//           const success = await downloadFile(
//             assetUrl,
//             localPath,
//             isVideo ? 'video' : 'image'
//           );

//           if (success) {
//             if (isVideo) {
//               scene.video_filename = localPath;
//               scene.image_filename = undefined;
//             } else {
//               scene.image_filename = localPath;
//               scene.video_filename = undefined;
//             }
//           } else {
//             console.warn(`     Keeping original URL as fallback`);
//           }
//         } else {
//           // Local file path
//           console.log(`    Local file: ${path.basename(assetUrl)}`);

//           if (!fs.existsSync(assetUrl)) {
//             console.error(`   ❌ Local file not found: ${assetUrl}`);
//           } else {
//             if (isVideo) {
//               scene.video_filename = assetUrl;
//               scene.image_filename = undefined;
//             } else {
//               scene.image_filename = assetUrl;
//               scene.video_filename = undefined;
//             }
//           }
//         }

//         updatedScenes.push({
//           ...scene,
//           audio_filename: globalAudioPath,
//           background_music_filename: backgroundMusicPath,
//         });

//         console.log(`   ✅ Scene ${sceneNum} processed\n`);
//       } catch (err: any) {
//         console.error(`   ❌ Error processing scene ${scene.chunk_id}:`, err.message);
//         updatedScenes.push({
//           ...scene,
//           audio_filename: globalAudioPath,
//           background_music_filename: backgroundMusicPath,
//         });
//       }
//     }

//     console.log(`\n✅ All assets processed successfully`);
//     console.log(` Total scenes: ${updatedScenes.length}`);
//     console.log(`Videos: ${updatedScenes.filter(s => s.asset_type === 'video').length}`);
//     console.log(`Images: ${updatedScenes.filter(s => s.asset_type === 'image').length}`);
//     console.log(`Audio: ${globalAudioPath ? 'Yes' : 'No'}`);
//     console.log(`Background Music: ${backgroundMusicPath ? 'Yes' : 'No'}`);
//     console.log(`Logo: ${logoPath ? 'Yes' : 'No'}\n`);

//     return { folderPath, updatedScenes, logoPath, backgroundMusicPath };
//   } catch (err: any) {
//     console.error('❌ Critical error in saveSceneAssets:', err.message);
//     throw new Error(`Failed to save scene assets: ${err.message}`);
//   }
// }









