import { Controller } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { openApi } from './openapi.js';
import { ConfigService } from '../config/config.service.js';

@Controller('')
export class DocumentationController {
  constructor(private readonly config: ConfigService) {}
  @Get('openapi.json') specification() {
    return openApi(this.config.value.issuer);
  }
}
