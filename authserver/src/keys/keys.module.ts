import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { KeysService } from './keys.service.js';

@Module({
  imports: [ConfigModule],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
