import { Injectable } from '@nestjs/common';
import { loadConfig } from './config.js';

@Injectable()
export class ConfigService {
  readonly value = loadConfig();
}
