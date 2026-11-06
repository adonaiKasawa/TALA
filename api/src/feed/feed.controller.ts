import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentPrincipal,
  OptionalAuth,
  type Principal,
} from '../auth/auth.metadata.js';
import { z } from 'zod';
import { FeedService } from './feed.service.js';
import { SocialService } from './social.service.js';
import { WatchService } from './watch.service.js';
import {
  commentBody,
  feedQuery,
  impressionBody,
  reactionKind,
  relationKind,
  watchBody,
} from './feed.schema.js';

@Controller()
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly social: SocialService,
    private readonly watch: WatchService,
  ) {}
  @OptionalAuth() @Get('feed') page(
    @Query() query: unknown,
    @CurrentPrincipal() actor?: Principal,
  ) {
    return this.feed.page(feedQuery.parse(query), actor);
  }
  @OptionalAuth() @Get('videos/:id/social') summary(
    @Param('id') id: string,
    @CurrentPrincipal() actor?: Principal,
  ) {
    return this.social.summary(z.uuid().parse(id), actor);
  }
  @Put('videos/:id/reactions/:kind') react(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.react(
      z.uuid().parse(id),
      reactionKind.parse(kind),
      true,
      actor,
    );
  }
  @Delete('videos/:id/reactions/:kind') unreact(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.react(
      z.uuid().parse(id),
      reactionKind.parse(kind),
      false,
      actor,
    );
  }
  @Put('creators/:username/relations/:kind') relate(
    @Param('username') name: string,
    @Param('kind') kind: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.relate(name, relationKind.parse(kind), true, actor);
  }
  @Delete('creators/:username/relations/:kind') unrelate(
    @Param('username') name: string,
    @Param('kind') kind: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.relate(name, relationKind.parse(kind), false, actor);
  }
  @Get('me/creator-controls') controls(@CurrentPrincipal() actor: Principal) {
    return this.social.controls(actor);
  }
  @OptionalAuth() @Get('creators/:username/:list') connections(
    @Param('username') name: string,
    @Param('list') kind: string,
    @CurrentPrincipal() actor?: Principal,
  ) {
    return this.social.connections(
      name,
      z.enum(['followers', 'following']).parse(kind),
      actor,
    );
  }
  @OptionalAuth() @Get('videos/:id/comments') comments(
    @Param('id') id: string,
    @Query('cursor') cursor: unknown,
    @CurrentPrincipal() actor?: Principal,
  ) {
    return this.social.comments(
      z.uuid().parse(id),
      z.string().max(800).optional().parse(cursor),
      actor,
    );
  }
  @Post('videos/:id/comments') comment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.comment(
      z.uuid().parse(id),
      commentBody.parse(body),
      actor,
    );
  }
  @Delete('videos/:id/comments/:commentId') removeComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.social.removeComment(
      z.uuid().parse(id),
      z.uuid().parse(commentId),
      actor,
    );
  }
  @Post('watch/impressions') impression(
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.watch.impression(impressionBody.parse(body), actor);
  }
  @Put('watch/:id') update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.watch.update(z.uuid().parse(id), watchBody.parse(body), actor);
  }
  @Get('me/history') history(@CurrentPrincipal() actor: Principal) {
    return this.watch.history(actor);
  }
  @Delete('me/history') clear(@CurrentPrincipal() actor: Principal) {
    return this.watch.clear(actor);
  }
}
