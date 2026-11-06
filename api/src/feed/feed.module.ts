import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { SocialService } from './social.service.js';
import { WatchService } from './watch.service.js';
import { CommunityService } from './community.service.js';
import { CommunityController } from './community.controller.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { SpaceController } from './space.controller.js';
@Module({
  imports: [DatabaseModule, VideosModule],
  controllers: [
    CommunityController,
    DiscoveryController,
    FeedController,
    SpaceController,
  ],
  providers: [
    FeedService,
    SocialService,
    WatchService,
    CommunityService,
    DiscoveryService,
  ],
})
export class FeedModule {}
