import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { VideoConfig } from './video-config.service.js';
import { PrivateStorage } from './private-storage.service.js';
import { MediaQueue } from './media-queue.service.js';
import { VideosService } from './videos.service.js';
import { MuxService } from './mux.service.js';
import { VideosController } from './videos.controller.js';
import { CaptionsService } from './captions.service.js';
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    VideoConfig,
    PrivateStorage,
    MediaQueue,
    VideosService,
    MuxService,
    CaptionsService,
  ],
  controllers: [VideosController],
  exports: [VideoConfig, PrivateStorage, MediaQueue, VideosService, MuxService],
})
export class VideosModule {}
