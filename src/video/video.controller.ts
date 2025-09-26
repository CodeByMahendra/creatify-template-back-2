import { Controller, Post, Body } from '@nestjs/common';
import { VideoService } from './video.service';


@Controller('video')
export class VideoController {
constructor(private readonly videoService: VideoService) {}


@Post('render')
async render(@Body() payload: { scenes: { chunk_id: string; image_filename: string; duration: number; direction?: string; overlayText?: string; }[] }) {
return this.videoService.buildVideo(payload.scenes);
}
}


// import { Controller, Post, Body } from '@nestjs/common';
// import { VideoService } from './video.service';


// @Controller('video')
// export class VideoController {
// constructor(private readonly videoService: VideoService) {}


// @Post('render')
// async render(@Body() payload: { scenes: { chunk_id: string; image_filename: string; duration: number; }[] }) {
// // payload validation omitted for brevity — you can add DTOs and pipes
// const out = await this.videoService.buildVideo(payload.scenes);
// return out;
// }
// }