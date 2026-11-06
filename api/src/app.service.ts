import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return { service: 'tala-api', apiVersion: 'v1' };
  }
}
