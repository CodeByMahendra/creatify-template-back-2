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

  /**
   * Load avatar configuration from file
   */
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

  /**
   * Get configuration for specific avatar mode
   */
  async getModeConfig(mode: string): Promise<any> {
    const config = await this.loadConfig();
    
    if (!config[mode]) {
      console.warn(`⚠️ Avatar mode '${mode}' not found, using 'mix_mode_new'`);
      return config['mix_mode_new'] || this.defaultConfig['mix_mode_new'];
    }

    return config[mode];
  }

  /**
   * Validate avatar mode exists
   */
  async validateMode(mode: string): Promise<boolean> {
    const config = await this.loadConfig();
    return config.hasOwnProperty(mode);
  }

  /**
   * Get all available avatar modes
   */
  async getAvailableModes(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config);
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AvatarConfig {
    return {
      'mix_mode_new': {
        scale: 0.2,
        position: 'bottom-left',
        opacity: 250,
        margin: 10,
        description: 'Default mix mode avatar'
      },
      'fixed-bottom-left': {
        scale: 0.17,
        position: 'bottom-left',
        opacity: 250,
        margin: 10,
        description: 'Small avatar in bottom-left corner'
      },
      'fixed-bottom-right': {
        scale: 0.17,
        position: 'bottom-right',
        opacity: 250,
        margin: 10,
        description: 'Small avatar in bottom-right corner'
      },
      'fixed-top-left': {
        scale: 0.17,
        position: 'top-left',
        opacity: 250,
        margin: 10,
        description: 'Small avatar in top-left corner'
      },
      'fixed-top-right': {
        scale: 0.17,
        position: 'top-right',
        opacity: 250,
        margin: 10,
        description: 'Small avatar in top-right corner'
      },
      'center-large': {
        scale: 0.5,
        position: 'center',
        opacity: 250,
        margin: 0,
        corner_radius: 50,
        description: 'Large centered avatar with rounded corners'
      }
    };
  }

  /**
   * Merge loaded config with defaults
   */
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

  /**
   * Save configuration to file
   */
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
