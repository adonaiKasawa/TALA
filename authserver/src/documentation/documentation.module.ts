import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DocumentationController } from './documentation.controller.js';
@Module({
  imports: [ConfigModule],
  providers: [],
  controllers: [DocumentationController],
  exports: [],
})
export class DocumentationModule {}
