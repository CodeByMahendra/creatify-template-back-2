import * as path from 'path';
import * as fs from 'fs';
import { AvatarConfig } from '../types';

export class AvatarConfigService {
  private configPath: string;
  private defaultConfig: AvatarConfig;

  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'avatar_config.json');
    this.defaultConfig = this.getDefaultConfig();
  }


  async loadConfig(): Promise<AvatarConfig> {
    try {
      if (fs.existsSync(this.configPath)) {
        console.log(`✅ Loading avatar config from: ${this.configPath}`);
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(configData);
        
        // Merge with defaults to ensure all required fields exist
        return this.mergeWithDefaults(config);
      } else {
        console.warn(`⚠️ Avatar config not found at ${this.configPath}, using defaults`);
        return this.defaultConfig;
      }
    } catch (error: any) {
      console.error(`❌ Failed to load avatar config: ${error.message}`);
      console.warn('Using default configuration');
      return this.defaultConfig;
    }
  }

  async getModeConfig(mode: string): Promise<any> {
    const config = await this.loadConfig();
    
    if (!config[mode]) {
      console.warn(`⚠️ Avatar mode '${mode}' not found, using 'mix_mode_new'`);
      return config['mix_mode_new'] || this.defaultConfig['mix_mode_new'];
    }

    return config[mode];
  }

  
  async validateMode(mode: string): Promise<boolean> {
    const config = await this.loadConfig();
    return config.hasOwnProperty(mode);
  }

 
  async getAvailableModes(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config);
  }

 
  

private getDefaultConfig(): AvatarConfig {
  return {
    // 🎭 MASK-BASED MODES (Creatify Style) - RECOMMENDED
    // These modes use automatic mask generation for cleanest results
    'mask-based-bottom-left': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Creatify style - automatic mask generation, only person visible'
    },
    'mask-based-bottom-right': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Creatify style - automatic mask generation, only person visible'
    },
    'mask-based-top-left': {
      scale: 0.17,
      position: 'top-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Creatify style - automatic mask generation, only person visible'
    },
    'mask-based-top-right': {
      scale: 0.17,
      position: 'top-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Creatify style - automatic mask generation, only person visible'
    },
    
    // 🎭 MASK-BASED CIRCULAR MODES
    'mask-based-bottom-left-circle': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Circular avatar with mask-based extraction'
    },
    'mask-based-bottom-right-circle': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      use_mask: true,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      description: '🎭 Circular avatar with mask-based extraction'
    },

    // 🎭 MASK-BASED GREEN SCREEN SUPPORT
    'mask-based-green-bottom-left': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'green',
      detect_body_parts: true,
      description: '🎭 Green screen removal with mask generation'
    },
    'mask-based-green-bottom-right': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      use_mask: true,
      remove_background: true,
      chroma_color: 'green',
      detect_body_parts: true,
      description: '🎭 Green screen removal with mask generation'
    },
    
    // 🔄 Mix Mode (Dynamic)
    'mix_mode_new': {
      scale: 0.2,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      description: 'Default mix mode avatar - transitions between states'
    },
    
    // 📍 Corner Positions - Rectangle
    'fixed-bottom-left': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      description: 'Small rectangle avatar in bottom-left corner'
    },
    'fixed-bottom-right': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      description: 'Small rectangle avatar in bottom-right corner'
    },
    'fixed-top-left': {
      scale: 0.17,
      position: 'top-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      description: 'Small rectangle avatar in top-left corner'
    },
    'fixed-top-right': {
      scale: 0.17,
      position: 'top-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      description: 'Small rectangle avatar in top-right corner'
    },
    
    // ⭕ Corner Positions - Circle
    'fixed-bottom-left-circle': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      description: 'Small circular avatar in bottom-left corner'
    },
    'fixed-bottom-right-circle': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      description: 'Small circular avatar in bottom-right corner'
    },
    'fixed-top-left-circle': {
      scale: 0.17,
      position: 'top-left',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      description: 'Small circular avatar in top-left corner'
    },
    'fixed-top-right-circle': {
      scale: 0.17,
      position: 'top-right',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      description: 'Small circular avatar in top-right corner'
    },
    
    // 📺 Full Screen
    'fullscreen-takeover': {
      scale: 1.0,
      position: 'center',
      opacity: 250,
      margin: 0,
      corner_radius: 0,
      description: 'Full screen avatar - maximum impact hero shot'
    },

    // 📊 Banner Styles
    'bottom-banner': {
      scale: 0.25,
      position: 'bottom-center',
      opacity: 250,
      margin: 15,
      corner_radius: 25,
      description: 'Bottom banner - great for product showcases above'
    },
    'top-banner': {
      scale: 0.25,
      position: 'top-center',
      opacity: 250,
      margin: 15,
      corner_radius: 25,
      description: 'Top banner - spokesperson at top with content below'
    },
    
    // 🎯 Side Panels - Medium
    'mid-left-medium': {
      scale: 0.3,
      position: 'left',
      opacity: 245,
      margin: 15,
      corner_radius: 35,
      description: 'Medium size mid-left - balanced composition'
    },
    'mid-right-medium': {
      scale: 0.3,
      position: 'right',
      opacity: 245,
      margin: 15,
      corner_radius: 35,
      description: 'Medium size mid-right - balanced composition'
    },

    // 🌟 TRANSPARENT BACKGROUND MODES - Chroma Key Only (No Mask)
    'fixed-bottom-left-transparent': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      description: 'Simple chroma key removal - transparent background'
    },
    'fixed-bottom-right-transparent': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      description: 'Simple chroma key removal - transparent background'
    },
    'fixed-top-left-transparent': {
      scale: 0.17,
      position: 'top-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      description: 'Simple chroma key removal - transparent background'
    },
    'fixed-top-right-transparent': {
      scale: 0.17,
      position: 'top-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      description: 'Simple chroma key removal - transparent background'
    },

    // 🎯 ADVANCED CREATIFY MODES - Body Part Detection + Background Removal
    'creatify-bottom-left': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      advanced_cropping: true,
      description: 'Creatify style - body part detection without mask generation'
    },
    'creatify-bottom-right': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 0,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      advanced_cropping: true,
      description: 'Creatify style - body part detection without mask generation'
    },
    'creatify-bottom-left-circle': {
      scale: 0.17,
      position: 'bottom-left',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      advanced_cropping: true,
      description: 'Creatify style - circular with body part detection'
    },
    'creatify-bottom-right-circle': {
      scale: 0.17,
      position: 'bottom-right',
      opacity: 250,
      margin: 10,
      corner_radius: 100,
      remove_background: true,
      chroma_color: 'white',
      detect_body_parts: true,
      advanced_cropping: true,
      description: 'Creatify style - circular with body part detection'
    }
  };
}
  private mergeWithDefaults(loadedConfig: AvatarConfig): AvatarConfig {
    const merged = { ...this.defaultConfig };
    
    for (const [mode, config] of Object.entries(loadedConfig)) {
      merged[mode] = {
        ...this.defaultConfig['mix_mode_new'], // Use default as base
        ...config // Override with loaded config
      };
    }

    return merged;
  }


  async saveConfig(config: AvatarConfig): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Avatar config saved to: ${this.configPath}`);
    } catch (error: any) {
      console.error(`❌ Failed to save avatar config: ${error.message}`);
      throw error;
    }
  }
}
