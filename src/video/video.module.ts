import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

import { ConfigModule } from '@nestjs/config';



@Module({
    imports:[ConfigModule],
controllers: [VideoController],
providers: [VideoService],
})
export class VideoModule{}