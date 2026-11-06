import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { VideoConfig } from './video-config.service.js';
@Injectable()
export class MediaQueue implements OnModuleDestroy {
  private queue?: Queue;
  constructor(private readonly config: VideoConfig) {}
  async enqueue(id: string, generation: number) {
    if (
      !this.config.enabled ||
      this.config.value.MEDIA_QUEUE_DRIVER !== 'redis'
    )
      return;
    if (!this.queue)
      this.queue = new Queue(this.config.value.MEDIA_QUEUE, {
        connection: {
          ...this.config.connection(),
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        },
      }).on('error', () => {});
    // PostgreSQL keeps the pending state if Redis is down; the dispatcher retries it.
    const jobId = `${id}-${generation}`;
    const existing = await this.queue.getJob(jobId);
    if (existing && ['failed', 'completed'].includes(await existing.getState()))
      await existing.remove();
    await this.queue.add(
      'video',
      { id },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: { age: 86400, count: 1000 },
      },
    );
  }
  async onModuleDestroy() {
    await this.queue?.close();
  }
}
