import { Controller, Post, Body, Get, Param, Delete, HttpException, HttpStatus } from '@nestjs/common';
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
  asset_type?: 'image' | 'video';
  aspect_ratio?: string;
  words?: WordTiming[];
  audio_duration?: number;
  match_confidence?: number;
}

interface RenderPayload {
  effectType?: string;  // Optional 
  audio_url: string;     // Required
  logo_url?: string;     // Optional
  background_music_url?: string;  // Optional
  scenes: ScenePayload[];
}

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('render')
  async render(@Body() payload: RenderPayload) {
    try {
      if (!payload.scenes || payload.scenes.length === 0) {
        throw new HttpException('Scenes array is required', HttpStatus.BAD_REQUEST);
      }

      if (!payload.audio_url) {
        throw new HttpException('Audio URL is required', HttpStatus.BAD_REQUEST);
      }

      console.log(`\n Received render request:`);
      console.log(`   Effect: ${payload.effectType || 'zoom_effect'}`);
      console.log(`   Scenes: ${payload.scenes.length}`);
      console.log(`   Audio: ${payload.audio_url ? 'Yes' : 'No'}`);
      console.log(`   Logo: ${payload.logo_url ? 'Yes' : 'No'}`);
      console.log(`   Background Music: ${payload.background_music_url ? 'Yes' : 'No'}\n`);

      const result = await this.videoService.buildVideo(
        payload.scenes,
        payload.effectType,
        payload.audio_url,
        payload.logo_url,
        payload.background_music_url
      );

      return {
        success: true,
        message: 'Video rendered successfully',
        data: result,
      };
    } catch (error) {
      console.error('❌ Render error:', error);
      throw new HttpException(
        error.message || 'Failed to render video',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('status/:requestId')
  async getStatus(@Param('requestId') requestId: string) {
    try {
      const videoPath = await this.videoService.getOutputVideo(requestId);

      if (videoPath) {
        const isValid = await this.videoService.validateVideoFile(videoPath);
        return {
          success: true,
          requestId,
          status: 'completed',
          videoPath: isValid ? videoPath : null,
        };
      }

      return {
        success: false,
        requestId,
        status: 'not_found',
        message: 'Video not found or still processing',
      };
    } catch (error) {
      console.error('❌ Status check error:', error);
      throw new HttpException(
        'Failed to check status',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('cleanup/:requestId')
  async cleanup(@Param('requestId') requestId: string) {
    try {
      const result = await this.videoService.cleanupRequest(requestId);

      return {
        success: result,
        message: result
          ? `Request ${requestId} cleaned up successfully`
          : `Request ${requestId} not found`,
      };
    } catch (error) {
      console.error('❌ Cleanup error:', error);
      throw new HttpException(
        'Failed to cleanup request',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('active-requests')
  async getActiveRequests() {
    try {
      const requests = this.videoService.getActiveRequests();
      const count = this.videoService.getActiveRequestsCount();

      return {
        success: true,
        count,
        requests,
      };
    } catch (error) {
      console.error('❌ Error getting active requests:', error);
      throw new HttpException(
        'Failed to get active requests',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('cleanup-old')
  async cleanupOld(@Body() body?: { ageInHours?: number }) {
    try {
      const ageInHours = body?.ageInHours || 24;
      const deletedCount = await this.videoService.cleanupOldFiles(ageInHours);

      return {
        success: true,
        message: `Cleaned up ${deletedCount} old request(s)`,
        deletedCount,
      };
    } catch (error) {
      console.error('❌ Cleanup old files error:', error);
      throw new HttpException(
        'Failed to cleanup old files',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

// import { Controller, Post, Body } from '@nestjs/common';
// import { VideoService } from './video.service';

// interface WordTiming {
//   word: string;
//   start: number;
//   end: number;
// }

// interface ScenePayload {
//   chunk_id: string;
//   image_filename: string;
//   duration: number;
//   direction?: string;
//   overlayText?: string;
//   start_time?: number;
//   end_time?: number;
//   textStyle?: string;
//  asset_type?: 'image' | 'video'; 
//   aspect_ratio?: string;
//   words?: WordTiming[]; 
//   audio_duration?: number;
//   match_confidence?: number;
// }

// interface RenderPayload {
//   effectType: string;
//   audio_url:string;
//   logo_url:string,
//   background_music_url:string,
//   scenes: ScenePayload[];
// }

// @Controller('video')
// export class VideoController {
//   constructor(private readonly videoService: VideoService) {}

//   @Post('render')
//   async render(@Body() payload: RenderPayload) {
// return this.videoService.buildVideo(payload.scenes, payload.effectType,payload.audio_url,payload.logo_url, payload.background_music_url);
//   }
// }

