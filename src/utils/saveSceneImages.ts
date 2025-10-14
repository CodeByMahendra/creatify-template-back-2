// import * as fs from 'fs';
// import * as path from 'path';
// import axios from 'axios';

// interface Scene {
//   chunk_id: string;
//   image_filename: string; 
// }


// function sanitizeFileName(name: string): string {
//   return name.replace(/[<>:"/\\|?*\s]/g, '_'); // Windows-safe
// }


// export async function saveSceneImages(
//   scenes: Scene[],
//   folderName: string = 'assets/images',
// ): Promise<{ folderPath: string; updatedScenes: Scene[] }> {
//   // Use folderName directly if absolute
//   const folderPath = path.isAbsolute(folderName) ? folderName : path.join(process.cwd(), folderName);

//   if (!fs.existsSync(folderPath)) {
//     fs.mkdirSync(folderPath, { recursive: true });
//   }

//   const updatedScenes: Scene[] = [];

//   for (const scene of scenes) {
//     if (!scene.image_filename) continue;

//     const ext = path.extname(scene.image_filename).split('?')[0] || '.jpg';
//     const safeChunkId = sanitizeFileName(scene.chunk_id);
//     const localFileName = `${safeChunkId}${ext}`;
//     const localPath = path.join(folderPath, localFileName);

//     try {
//       if (scene.image_filename.startsWith('http')) {
//         const response = await axios.get(scene.image_filename, { responseType: 'arraybuffer' });

//         if (!response.data || response.data.length === 0) {
//           console.warn(`⚠️ Empty data for ${scene.image_filename}, skipping`);
//           continue;
//         }

//         fs.writeFileSync(localPath, Buffer.from(response.data));
//       } else {
//         if (fs.existsSync(scene.image_filename)) {
//           fs.copyFileSync(scene.image_filename, localPath);
//         } else {
//           console.warn(`⚠️ Local file ${scene.image_filename} not found`);
//           continue;
//         }
//       }

//       // Update scene with full path
//       updatedScenes.push({
//         ...scene,
//         image_filename: localPath,
//       });
//     } catch (err: any) {
//       console.error(`❌ Failed to save ${scene.image_filename}: ${err.message}`);
//     }
//   }

//   return { folderPath, updatedScenes };
// }



import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export interface Scene {
  chunk_id: string;
  image_filename: string;
  audio_filename?: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\s]/g, '_');
}

export async function saveSceneAssets(
  scenes: Scene[],
  assetsFolder: string = 'assets',
  globalAudioUrl?: string
): Promise<{ folderPath: string; updatedScenes: Scene[] }> {
  const folderPath = path.isAbsolute(assetsFolder)
    ? assetsFolder
    : path.join(process.cwd(), assetsFolder);

  const imagesDir = path.join(folderPath, 'images');
  const audioDir = path.join(folderPath, 'audio');

  console.log('📁 Base folder path:', folderPath);
  console.log('📁 Images dir:', imagesDir);
  console.log('📁 Audio dir:', audioDir);

  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  // ---- Download global audio once ----
  let globalAudioPath: string | undefined;

  if (globalAudioUrl) {
    try {
      console.log('\n🎵 Starting audio download...');
      console.log('🔗 Audio URL:', globalAudioUrl);

      // Extract extension from URL (before query params)
      const urlWithoutQuery = globalAudioUrl.split('?')[0];
      const ext = path.extname(urlWithoutQuery) || '.wav';

      console.log('📝 Extension detected:', ext);

      globalAudioPath = path.join(audioDir, `full_audio${ext}`);
      console.log('💾 Will save to:', globalAudioPath);

      // Download with timeout
      const response = await axios.get(globalAudioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      console.log('✅ Download successful');
      console.log('📊 Downloaded bytes:', response.data?.length);
      console.log('📋 Content-Type:', response.headers['content-type']);

      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response received from audio URL');
      }

      // Write file
      fs.writeFileSync(globalAudioPath, Buffer.from(response.data));

      // Verify file was written
      if (fs.existsSync(globalAudioPath)) {
        const stats = fs.statSync(globalAudioPath);
        console.log('✅✅ Audio file SAVED successfully');
        console.log('📁 File path:', globalAudioPath);
        console.log('📦 File size:', stats.size, 'bytes');
      } else {
        throw new Error('File was not created after writeFileSync');
      }
    } catch (err: any) {
      console.error('\n❌ Failed audio download:');
      console.error('Error message:', err.message);
      console.error('Error code:', err.code);
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response headers:', err.response.headers);
      }
      globalAudioPath = undefined;
    }
  } else {
    console.log('⚠️ No audio URL provided');
  }

  const updatedScenes: Scene[] = [];

  for (const scene of scenes) {
    // ---- Save image ----
    let localImagePath = scene.image_filename;

    if (scene.image_filename.startsWith('http')) {
      const ext = path.extname(scene.image_filename.split('?')[0]) || '.jpg';
      const safeName = sanitizeFileName(scene.chunk_id);
      localImagePath = path.join(imagesDir, `${safeName}${ext}`);

      try {
        const imgData = await axios.get(scene.image_filename, {
          responseType: 'arraybuffer',
        });
        fs.writeFileSync(localImagePath, Buffer.from(imgData.data));
        console.log(`✅ Image saved for ${scene.chunk_id}`);
      } catch (err: any) {
        console.error(
          `❌ Failed to download image for ${scene.chunk_id}:`,
          err.message
        );
      }
    }

    updatedScenes.push({
      ...scene,
      image_filename: localImagePath,
      audio_filename: globalAudioPath, // same audio for all scenes
    });
  }

  console.log('\n📊 Final Summary:');
  console.log('Total scenes:', updatedScenes.length);
  console.log('Audio file saved:', globalAudioPath ? 'YES ✅' : 'NO ❌');

  return { folderPath, updatedScenes };
}