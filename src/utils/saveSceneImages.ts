
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
  globalAudioUrl?: string,
  logoUrl?: string
): Promise<{
  folderPath: string;
  updatedScenes: Scene[];
  logoPath?: string;
}> {
  const folderPath = path.isAbsolute(assetsFolder)
    ? assetsFolder
    : path.join(process.cwd(), assetsFolder);

  const imagesDir = path.join(folderPath, 'images');
  const audioDir = path.join(folderPath, 'audio');
  const logoDir = path.join(folderPath, 'logo');

  // Ensure directories exist
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

  console.log(`📁 Using assets folder: ${folderPath}`);

  // ---- Download global audio ----
  let globalAudioPath: string | undefined;
  if (globalAudioUrl) {
    try {
      console.log('🎵 Downloading audio...');
      const urlWithoutQuery = globalAudioUrl.split('?')[0];
      const ext = path.extname(urlWithoutQuery) || '.wav';
      globalAudioPath = path.join(audioDir, `full_audio${ext}`);
      
      const response = await axios.get(globalAudioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      fs.writeFileSync(globalAudioPath, Buffer.from(response.data));
      console.log(`✅ Audio saved: ${globalAudioPath}`);
    } catch (err) {
      console.error('❌ Failed to download audio:', err);
      globalAudioPath = undefined;
    }
  }

  // ---- Download logo ----
  let logoPath: string | undefined;
  if (logoUrl) {
    try {
      console.log('🖼️ Downloading logo...');
      const urlWithoutQuery = logoUrl.split('?')[0];
      const ext = path.extname(urlWithoutQuery) || '.png';
      logoPath = path.join(logoDir, `logo${ext}`);
      
      const response = await axios.get(logoUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });
      
      fs.writeFileSync(logoPath, Buffer.from(response.data));
      console.log(`✅ Logo saved: ${logoPath}`);
    } catch (err) {
      console.error('❌ Failed to download logo:', err);
      logoPath = undefined;
    }
  }

  // ---- Download images per scene ----
  console.log(`📷 Downloading ${scenes.length} images...`);
  const updatedScenes: Scene[] = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let localImagePath = scene.image_filename;
    
    if (scene.image_filename.startsWith('http')) {
      try {
        const ext = path.extname(scene.image_filename.split('?')[0]) || '.jpg';
        const safeName = sanitizeFileName(scene.chunk_id);
        localImagePath = path.join(imagesDir, `${safeName}${ext}`);
        
        const imgData = await axios.get(scene.image_filename, {
          responseType: 'arraybuffer',
          timeout: 15000
        });
        
        fs.writeFileSync(localImagePath, Buffer.from(imgData.data));
        console.log(`✅ Image ${i + 1}/${scenes.length} saved: ${safeName}${ext}`);
      } catch (err) {
        console.error(`❌ Failed to download image for ${scene.chunk_id}:`, err);
        // Keep original URL if download fails
      }
    }

    updatedScenes.push({
      ...scene,
      image_filename: localImagePath,
      audio_filename: globalAudioPath,
    });
  }

  console.log(`✅ All assets downloaded and saved`);

  return { folderPath, updatedScenes, logoPath };
}











































// import * as fs from 'fs';
// import * as path from 'path';
// import axios from 'axios';

// export interface Scene {
//   chunk_id: string;
//   image_filename: string;
//   audio_filename?: string;
// }

// function sanitizeFileName(name: string): string {
//   return name.replace(/[<>:"/\\|?*\s]/g, '_');
// }

// export async function saveSceneAssets(
//   scenes: Scene[],
//   assetsFolder: string = 'assets',
//   globalAudioUrl?: string,
//   logoUrl?: string
// ): Promise<{
//   folderPath: string;
//   updatedScenes: Scene[];
//   logoPath?: string;
// }> {
//   const folderPath = path.isAbsolute(assetsFolder)
//     ? assetsFolder
//     : path.join(process.cwd(), assetsFolder);

//   const imagesDir = path.join(folderPath, 'images');
//   const audioDir = path.join(folderPath, 'audio');
//   const logoDir = path.join(folderPath, 'logo');

//   if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
//   if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
//   if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

//   // ---- Download global audio ----
//   let globalAudioPath: string | undefined;
//   if (globalAudioUrl) {
//     try {
//       const urlWithoutQuery = globalAudioUrl.split('?')[0];
//       const ext = path.extname(urlWithoutQuery) || '.wav';
//       globalAudioPath = path.join(audioDir, `full_audio${ext}`);
//       const response = await axios.get(globalAudioUrl, { responseType: 'arraybuffer', timeout: 30000 });
//       fs.writeFileSync(globalAudioPath, Buffer.from(response.data));
//     } catch (err) {
//       console.error('❌ Failed to download audio:', err);
//       globalAudioPath = undefined;
//     }
//   }

//   // ---- Download logo ----
//   let logoPath: string | undefined;
//   if (logoUrl) {
//     try {
//       const urlWithoutQuery = logoUrl.split('?')[0];
//       const ext = path.extname(urlWithoutQuery) || '.png';
//       logoPath = path.join(logoDir, `logo${ext}`);
//       const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 15000 });
//       fs.writeFileSync(logoPath, Buffer.from(response.data));
//     } catch (err) {
//       console.error('❌ Failed to download logo:', err);
//       logoPath = undefined;
//     }
//   }

//   // ---- Download images per scene ----
//   const updatedScenes: Scene[] = [];
//   for (const scene of scenes) {
//     let localImagePath = scene.image_filename;
//     if (scene.image_filename.startsWith('http')) {
//       const ext = path.extname(scene.image_filename.split('?')[0]) || '.jpg';
//       const safeName = sanitizeFileName(scene.chunk_id);
//       localImagePath = path.join(imagesDir, `${safeName}${ext}`);
//       try {
//         const imgData = await axios.get(scene.image_filename, { responseType: 'arraybuffer' });
//         fs.writeFileSync(localImagePath, Buffer.from(imgData.data));
//       } catch (err) {
//         console.error(`❌ Failed to download image for ${scene.chunk_id}:`, err);
//       }
//     }

//     updatedScenes.push({
//       ...scene,
//       image_filename: localImagePath,
//       audio_filename: globalAudioPath,
//     });
//   }

//   return { folderPath, updatedScenes, logoPath };
// }
