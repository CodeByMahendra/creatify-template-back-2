// Main Avatar Module Entry Point
import * as path from 'path';
import * as fs from 'fs';

export { AvatarForegroundService } from './foreground/avatar-foreground.service';
export { AvatarBackgroundService } from './background/avatar-background.service';
export { AvatarCompositorService } from './compositor/avatar-compositor.service';
export { AvatarConfigService } from './config/avatar-config.service';

// Types
export * from './types';

// Main Avatar Service that orchestrates everything
import { AvatarForegroundService } from './foreground/avatar-foreground.service';
import { AvatarBackgroundService } from './background/avatar-background.service';
import { AvatarCompositorService } from './compositor/avatar-compositor.service';
import { AvatarConfigService } from './config/avatar-config.service';
import { 
  Scene, 
  AvatarGenerationOptions, 
  BackgroundGenerationOptions, 
  CompositorOptions 
} from './types';
import { runFfmpeg } from '../utils/ffmpeg.utils';

export class AvatarService {
  private foregroundService: AvatarForegroundService;
  private backgroundService: AvatarBackgroundService;
  private compositorService: AvatarCompositorService;
  private configService: AvatarConfigService;

  constructor() {
    this.foregroundService = new AvatarForegroundService();
    this.backgroundService = new AvatarBackgroundService();
    this.compositorService = new AvatarCompositorService();
    this.configService = new AvatarConfigService();
  }

  /**
   * Complete avatar video generation pipeline
   */
  async generateAvatarVideo(options: {
    scenes: Scene[];
    effectType: string;
    avatarMode: string;
    avatarPath: string;
    audioPath: string;
    backgroundMusicPath?: string;
    tempDir: string;
    outputPath: string;
    requestId: string;
    dirs: any;
    fps: number;
    templates: any;
    templateName?: string;
    logoPath?: string;
  }): Promise<string> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎬 AVATAR VIDEO GENERATION PIPELINE`);
    console.log(`=`.repeat(80));
    console.log(`Request ID: ${options.requestId}`);
    console.log(`Effect: ${options.effectType}`);
    console.log(`Avatar Mode: ${options.avatarMode}`);
    console.log(`Scenes: ${options.scenes.length}`);
    console.log(`Avatar: ${options.avatarPath ? 'YES' : 'NO'}`);
    console.log(`Audio: ${options.audioPath ? 'YES' : 'NO'}`);
    console.log(`Background Music: ${options.backgroundMusicPath ? 'YES' : 'NO'}`);

    try {
      // Step 1: Load avatar configuration
      console.log(`\n📋 STEP 1: Loading avatar configuration...`);
      const avatarConfig = await this.configService.loadConfig();
      const modeConfig = await this.configService.getModeConfig(options.avatarMode);

      // Step 2: Generate background video
      console.log(`\n📹 STEP 2: Generating background video...`);
      const backgroundOptions: BackgroundGenerationOptions = {
        scenes: options.scenes,
        effectType: options.effectType,
        dirs: options.dirs,
        fps: options.fps,
        templates: options.templates,
        templateName: options.templateName,
        logoPath: options.logoPath
      };

      const clipPaths = await this.backgroundService.generateBackgroundVideo(backgroundOptions);
      
      // Concatenate background clips
      const backgroundVideoPath = path.join(options.tempDir, `background_${Date.now()}.mp4`);
      await this.backgroundService.concatenateBackgroundClips(
        clipPaths, 
        backgroundVideoPath, 
        runFfmpeg
      );

      // Validate background video
      const isValidBackground = await this.backgroundService.validateBackgroundVideo(backgroundVideoPath);
      if (!isValidBackground) {
        throw new Error('Background video generation failed');
      }

      // Step 3: Generate avatar foreground (if avatar provided)
      let avatarForegroundPath: string | null = null;
      
      if (options.avatarPath) {
        console.log(`\n👤 STEP 3: Generating avatar foreground...`);
        
        const foregroundOptions: AvatarGenerationOptions = {
          avatarPath: options.avatarPath,
          scenes: options.scenes,
          tempDir: options.tempDir,
          avatarMode: options.avatarMode,
          avatarConfig,
          canvasWidth: 1920, // Default, will be updated with actual dimensions
          canvasHeight: 1080
        };

        // Get actual background dimensions
        const dimensions = await this.backgroundService.getVideoDimensions(backgroundVideoPath);
        foregroundOptions.canvasWidth = dimensions.width;
        foregroundOptions.canvasHeight = dimensions.height;

        avatarForegroundPath = await this.foregroundService.generateAvatarForeground(
          foregroundOptions.avatarPath,
          foregroundOptions.scenes,
          foregroundOptions.tempDir,
          foregroundOptions.avatarMode,
          foregroundOptions.avatarConfig,
          runFfmpeg,
          foregroundOptions.canvasWidth,
          foregroundOptions.canvasHeight
        );
      }

      // Step 4: Composite final video
      console.log(`\n🎨 STEP 4: Compositing final video...`);
      
      if (avatarForegroundPath) {
        // Composite with avatar
        const compositorOptions: CompositorOptions = {
          backgroundVideoPath,
          avatarForegroundPath,
          audioPath: options.audioPath,
          backgroundMusicPath: options.backgroundMusicPath || null,
          outputPath: options.outputPath,
          requestId: options.requestId
        };

        await this.compositorService.compositeWithAvatar(compositorOptions);

        // Cleanup temporary files
        await this.compositorService.cleanupTempFiles([
          backgroundVideoPath,
          avatarForegroundPath
        ]);

      } else {
        // Composite without avatar
        await this.compositorService.compositeWithoutAvatar(
          backgroundVideoPath,
          options.audioPath,
          options.backgroundMusicPath || null,
          options.outputPath,
          options.requestId
        );

        // Cleanup temporary files
        await this.compositorService.cleanupTempFiles([backgroundVideoPath]);
      }

      console.log(`\n✅ AVATAR VIDEO GENERATION COMPLETED`);
      console.log(`📦 Output: ${options.outputPath}`);
      console.log(`=`.repeat(80));

      return options.outputPath;

    } catch (error: any) {
      console.error(`\n❌ AVATAR VIDEO GENERATION FAILED`);
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      console.log(`=`.repeat(80));
      throw error;
    }
  }

  /**
   * Get available avatar modes
   */
  async getAvailableModes(): Promise<string[]> {
    return await this.configService.getAvailableModes();
  }

  /**
   * Validate avatar mode
   */
  async validateMode(mode: string): Promise<boolean> {
    return await this.configService.validateMode(mode);
  }
}

// Export the main service as default
export default AvatarService;
