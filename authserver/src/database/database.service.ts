import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.AUTH_DATABASE_URL,
        max: 10,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
