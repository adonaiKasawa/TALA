import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { VideosModule } from './videos.module.js';
import { MediaProcess } from './media-process.service.js';
import { MediaWorker } from './media-worker.service.js';
@Module({
  imports: [DatabaseModule, VideosModule],
  providers: [MediaProcess, MediaWorker],
})
export class MediaWorkerModule {}
export async function createMediaWorker() {
  const app = await NestFactory.createApplicationContext(MediaWorkerModule, {
    logger: ['error', 'warn'],
  });
  const runner = app.get(MediaWorker),
    close = app.close.bind(app) as () => Promise<void>;
  runner.start();
  app.close = async () => {
    await runner.stop();
    await close();
  };
  return app;
}
