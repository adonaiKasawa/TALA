import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  OptionalAuth,
  type Principal,
} from '../auth/auth.metadata.js';
import { CommunityService } from './community.service.js';
const id = (v: string) => z.uuid().parse(v);
@Controller()
export class CommunityController {
  constructor(private readonly service: CommunityService) {}
  @Get('me/follow-requests') requests(@CurrentPrincipal() a: Principal) {
    return this.service.requests(a);
  }
  @Put('me/follow-requests/:id') decide(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.decide(
      id(v),
      z.object({ accept: z.boolean() }).strict().parse(body).accept,
      a,
    );
  }
  @Delete('me/followers/:id') follower(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.removeFollower(id(v), a);
  }
  @Put('videos/:id/pin') pin(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.pinVideo(
      id(v),
      z
        .object({ rank: z.number().int().min(1).max(3).nullable() })
        .strict()
        .parse(body).rank,
      a,
    );
  }
  @OptionalAuth() @Get('profiles/:username/pinned') pinned(
    @Param('username') name: string,
    @CurrentPrincipal() a?: Principal,
  ) {
    return this.service.profileVideos(name, 'pinned', a);
  }
  @OptionalAuth() @Get('profiles/:username/reposts') reposts(
    @Param('username') name: string,
    @CurrentPrincipal() a?: Principal,
  ) {
    return this.service.profileVideos(name, 'reposts', a);
  }
  @Put('videos/:id/repost') repost(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.repost(id(v), true, a);
  }
  @Delete('videos/:id/repost') unrepost(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.repost(id(v), false, a);
  }
  @Get('me/collections') collections(@CurrentPrincipal() a: Principal) {
    return this.service.collections(a);
  }
  @Post('me/collections') create(
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.createCollection(
      z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(body).name,
      a,
    );
  }
  @Get('me/collections/:id') collection(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.collection(id(v), a);
  }
  @Delete('me/collections/:id') remove(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.deleteCollection(id(v), a);
  }
  @Patch('me/collections/:id') rename(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.renameCollection(
      id(v),
      z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(body).name,
      a,
    );
  }
  @Get('videos/:id/reply-context') context(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.replyContext(id(v), a);
  }
  @Delete('moderation/profiles/:id/verification') revoke(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.revokeVerification(
      id(v),
      z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .strict()
        .parse(body).reason,
      a,
    );
  }
  @Put('me/collections/:id/videos/:video') add(
    @Param('id') v: string,
    @Param('video') video: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.collectionItem(id(v), id(video), true, a);
  }
  @Delete('me/collections/:id/videos/:video') subtract(
    @Param('id') v: string,
    @Param('video') video: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.collectionItem(id(v), id(video), false, a);
  }
  @Put('comments/:id/like') like(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.commentLike(id(v), true, a);
  }
  @Delete('comments/:id/like') unlike(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.commentLike(id(v), false, a);
  }
  @Put('comments/:id/pin') pinComment(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.pinComment(id(v), true, a);
  }
  @Delete('comments/:id/pin') unpinComment(
    @Param('id') v: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.pinComment(id(v), false, a);
  }
  @Put('comments/:id/video-reply') reply(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.replyVideo(
      id(v),
      z.object({ videoId: z.uuid() }).strict().parse(body).videoId,
      a,
    );
  }
  @Get('me/verification') myVerification(@CurrentPrincipal() a: Principal) {
    return this.service.myVerification(a);
  }
  @Post('me/verification') verification(
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    const data = z
      .object({
        reason: z.string().trim().min(20).max(2000),
        proofUrls: z
          .array(
            z
              .url()
              .max(2048)
              .refine((v) => new URL(v).protocol === 'https:'),
          )
          .max(3)
          .default([]),
      })
      .strict()
      .parse(body);
    return this.service.verification(data.reason, data.proofUrls, a);
  }
  @Get('moderation/verifications') queue(@CurrentPrincipal() a: Principal) {
    return this.service.verificationQueue(a);
  }
  @Put('moderation/verifications/:id') review(
    @Param('id') v: string,
    @Body() body: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    const data = z
      .object({
        approved: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(body);
    return this.service.reviewVerification(
      id(v),
      data.approved,
      data.reason,
      a,
    );
  }
}
