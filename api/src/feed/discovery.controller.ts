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
import { z } from 'zod';
import {
  CurrentPrincipal,
  OptionalAuth,
  type Principal,
} from '../auth/auth.metadata.js';
import { DiscoveryService, discoveryQuery } from './discovery.service.js';
@Controller()
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}
  @Get('discover') page(@Query() q: unknown, @CurrentPrincipal() a: Principal) {
    return this.service.page(discoveryQuery.parse(q), a);
  }
  @OptionalAuth() @Get('search') search(
    @Query('q') q: unknown,
    @CurrentPrincipal() a?: Principal,
  ) {
    return this.service.search(z.string().trim().min(2).max(100).parse(q), a);
  }
  @Get('me/creator-suggestions') suggestions(@CurrentPrincipal() a: Principal) {
    return this.service.suggestions(a);
  }
  @Post('me/discovery/reset') reset(@CurrentPrincipal() a: Principal) {
    return this.service.reset(a);
  }
  @OptionalAuth() @Get('discover/trends') trends(
    @CurrentPrincipal() a?: Principal,
  ) {
    return this.service.trends(a);
  }
  @OptionalAuth() @Get('discover/challenges') challenges() {
    return this.service.challenges();
  }
  @Post('moderation/challenges') createChallenge(
    @Body() b: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    const d = z
      .object({
        slug: z.string().regex(/^[a-z0-9_-]{3,60}$/),
        title: z.string().trim().min(3).max(120),
        description: z.string().max(2000),
        startsAt: z.iso.datetime().transform((v) => new Date(v)),
        endsAt: z.iso.datetime().transform((v) => new Date(v)),
      })
      .strict()
      .parse(b);
    return this.service.createChallenge(d, a);
  }
  @Post('videos/:id/sound') sound(
    @Param('id') id: string,
    @Body() b: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    const d = z
      .object({
        label: z.string().trim().min(1).max(120),
        reuseAllowed: z.boolean().default(false),
      })
      .strict()
      .parse(b);
    return this.service.createSound(
      z.uuid().parse(id),
      d.label,
      d.reuseAllowed,
      a,
    );
  }
  @Put('videos/:id/discovery-links') attach(
    @Param('id') id: string,
    @Body() b: unknown,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.attach(
      z.uuid().parse(id),
      z
        .object({
          soundId: z.uuid().nullable().optional(),
          challengeId: z.uuid().nullable().optional(),
        })
        .strict()
        .parse(b),
      a,
    );
  }
  @Get('videos/:id/trial-results') results(
    @Param('id') id: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.trialResults(z.uuid().parse(id), a);
  }
  @Post('admin/recommendation-models/train') train(
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.train(a);
  }
  @Get('admin/recommendation-models') models(@CurrentPrincipal() a: Principal) {
    return this.service.models(a);
  }
  @Delete('admin/recommendation-models/active') stop(
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.stopModel(a);
  }
  @Put('admin/recommendation-models/:id/active') activate(
    @Param('id') id: string,
    @CurrentPrincipal() a: Principal,
  ) {
    return this.service.activateModel(z.uuid().parse(id), a);
  }
}
