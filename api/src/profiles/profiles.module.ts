import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ProfilesService } from './profiles.service.js';
import { ProfilesController } from './profiles.controller.js';
@Module({
  imports: [DatabaseModule],
  providers: [ProfilesService],
  controllers: [ProfilesController],
})
export class ProfilesModule {}
