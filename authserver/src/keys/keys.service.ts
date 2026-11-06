import { Injectable } from '@nestjs/common';
import { Vault } from '../security/crypto.js';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class KeysService extends Vault {
  constructor(config: ConfigService) {
    super(config.value.AUTH_ENCRYPTION_KEY);
  }
}
