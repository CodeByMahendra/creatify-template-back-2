

import { Controller, Post, Body } from '@nestjs/common';
import { VideoService } from './video.service';

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface ScenePayload {
  chunk_id: string;
  image_filename: string;
  duration: number;
  direction?: string;
  overlayText?: string;
  start_time?: number;
  end_time?: number;
  textStyle?: string;
  asset_type?: string;
  aspect_ratio?: string;
  words?: WordTiming[]; 
  audio_duration?: number;
  match_confidence?: number;
}

interface RenderPayload {
  effectType: string;
  audio_url:string;
  logo_url:string,
  scenes: ScenePayload[];
}

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('render')
  async render(@Body() payload: RenderPayload) {
return this.videoService.buildVideo(payload.scenes, payload.effectType,payload.audio_url,payload.logo_url);
  }
}

