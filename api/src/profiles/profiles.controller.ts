import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import {
  CurrentPrincipal,
  OptionalAuth,
  type Principal,
} from '../auth/auth.metadata.js';
import {
  createProfile,
  updateProfile,
  profileUsername,
} from './profile.schema.js';
import { ProfilesService } from './profiles.service.js';

@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}
  @Get('me/profile') me(@CurrentPrincipal() actor: Principal) {
    return this.profiles.me(actor);
  }
  @Post('me/profile') create(
    @CurrentPrincipal() actor: Principal,
    @Body() body: unknown,
  ) {
    return this.profiles.create(actor, createProfile.parse(body));
  }
  @Patch('me/profile') update(
    @CurrentPrincipal() actor: Principal,
    @Body() body: unknown,
  ) {
    return this.profiles.update(actor, updateProfile.parse(body));
  }
  @Delete('me/profile') remove(@CurrentPrincipal() actor: Principal) {
    return this.profiles.remove(actor);
  }
  @OptionalAuth()
  @Get('profiles/:username')
  publicProfile(
    @Param('username') username: string,
    @CurrentPrincipal() actor?: Principal,
  ) {
    return this.profiles.byUsername(profileUsername.parse(username), actor);
  }
}
