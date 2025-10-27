export interface Scene {
  scene_id: string | number;
  image_filename?: string | null;
  video_filename?: string | null;
  audio_filename?: string | null;
  background_music_filename?: string | null;
  duration?: number;
  start_time?: number;
  end_time?: number;
  overlayText?: string;
  words?: WordTiming[];
  asset_type?: 'image' | 'video';
  [key: string]: any;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface AvatarConfig {
  [mode: string]: {
    scale?: number;
    main_scale?: number;
    small_scale?: number;
    position?: string;
    opacity?: number;
    margin?: number;
    x_offset?: number;
    y_offset?: number;
    corner_radius?: number;
    states?: string[];
    state_duration?: number;
    pip_scale?: number;
    pip_opacity?: number;
    margin_bottom?: number;
    slide_duration?: number;
    pause_duration?: number;
    num_cycles?: number;
    corners?: string[];
    min_interval?: number;
    max_interval?: number;
    disappear_prob?: number;
    EPSILON?: number;
    description?: string;
  };
}

export interface AvatarPosition {
  x: string;
  y: string;
}

export interface AvatarDimensions {
  width: number;
  height: number;
  duration: number;
}

export interface AvatarGenerationOptions {
  avatarPath: string;
  scenes: Scene[];
  tempDir: string;
  avatarMode: string;
  avatarConfig: AvatarConfig;
  canvasWidth: number;
  canvasHeight: number;
}

export interface BackgroundGenerationOptions {
  scenes: Scene[];
  effectType: string;
  dirs: any;
  fps: number;
  templates: any;
  templateName?: string;
  logoPath?: string;
}

export interface CompositorOptions {
  backgroundVideoPath: string;
  avatarForegroundPath: string;
  audioPath: string;
  backgroundMusicPath?: string | null;
  outputPath: string;
  requestId: string;
}
