import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execPromise = promisify(exec);

export class AvatarMaskService {
  
  async getAvatarAndMask(
    avatarUrl: string,
    assetsFolder: string
  ): Promise<{ avatarPath: string; maskPath: string }> {
    console.log(`   📥 Processing avatar: ${avatarUrl}`);
    
    if (!fs.existsSync(assetsFolder)) {
      fs.mkdirSync(assetsFolder, { recursive: true });
    }

    let avatarPath: string;
    
    if (avatarUrl.startsWith('http')) {
      avatarPath = path.join(assetsFolder, 'avatar_original.png');
      await this.downloadImage(avatarUrl, avatarPath);
    } else {
      avatarPath = avatarUrl;
    }

    console.log(`   🎭 Generating mask from avatar...`);
    
    // STEP 1: Generate raw mask (white = person, black = background)
    const rawMaskPath = path.join(assetsFolder, 'raw_mask.png');
    await this.generateRawMask(avatarPath, rawMaskPath);

    // STEP 2: Clean and enhance mask
    const cleanedMaskPath = path.join(assetsFolder, 'cleaned_mask.png');
    await this.cleanMask(rawMaskPath, cleanedMaskPath);

    console.log(`   ✅ Avatar: ${avatarPath}`);
    console.log(`   ✅ Mask: ${cleanedMaskPath}`);

    return {
      avatarPath,
      maskPath: cleanedMaskPath
    };
  }

  /**
   * 🎭 STEP 1: Generate RAW mask using chroma key
   * White background removal + threshold to binary
   */
  private async generateRawMask(
    imagePath: string,
    maskPath: string
  ): Promise<void> {
    console.log(`      Creating raw mask...`);

    // Remove white background and create binary mask
    const filterComplex = [
      // Remove white background
      'colorkey=0xFFFFFF:0.3:0.2',
      // Convert to grayscale
      'format=gray',
      // Threshold: white where person is, black elsewhere
      'geq=lum=\'if(gt(lum(X,Y),10),255,0)\''
    ].join(',');

    const cmd = `ffmpeg -y -i "${imagePath}" -vf "${filterComplex}" -frames:v 1 "${maskPath}"`;
    
    await execPromise(cmd);
    console.log(`      ✅ Raw mask created`);
  }


  private async cleanMask(
    rawMaskPath: string,
    cleanedMaskPath: string
  ): Promise<void> {
    console.log(`      Cleaning mask (erosion + blur)...`);

    const filterComplex = [
      'format=gray',
      // Erosion: Remove noise (1 iteration, 3x3 kernel)
      'erosion=threshold0=128:coordinates=11:coordinates=31:coordinates=51',
      // Gaussian blur (7x7 kernel, sigma=2)
      'gblur=sigma=2',
      // Normalize to full white/black
      'normalize=independence=0:strength=1.0',
      'format=gray'
    ].join(',');

    const cmd = `ffmpeg -y -i "${rawMaskPath}" -vf "${filterComplex}" -frames:v 1 "${cleanedMaskPath}"`;
    
    await execPromise(cmd);
    console.log(`      ✅ Cleaned mask created`);
  }

  private async downloadImage(url: string, outputPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(outputPath, response.data);
  }

  
  async cleanup(assetsFolder: string): Promise<void> {
    const tempFiles = ['raw_mask.png'];

    for (const file of tempFiles) {
      const filePath = path.join(assetsFolder, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          
        }
      }
    }
  }
}