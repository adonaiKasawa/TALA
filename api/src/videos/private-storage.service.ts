import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  mkdir,
  realpath,
  lstat,
  open,
  stat,
  unlink,
  rmdir,
  statfs,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { VideoConfig } from './video-config.service.js';
const files = [
  'source.bin',
  'prepared.mp4',
  'candidate.mp4',
  'overlay.png',
  'poster.jpg',
  'poster.tmp.jpg',
] as const;
export type MediaFile = (typeof files)[number];
@Injectable()
export class PrivateStorage implements OnModuleInit {
  private root!: string;
  constructor(private readonly config: VideoConfig) {}
  async onModuleInit() {
    if (!this.config.enabled) return;
    await mkdir(this.config.value.MEDIA_ROOT, { recursive: true, mode: 0o700 });
    this.root = await realpath(this.config.value.MEDIA_ROOT);
  }
  async path(id: string, file: MediaFile) {
    if (!/^[a-f0-9-]{36}$/i.test(id) || !files.includes(file))
      throw new Error('MEDIA_PATH');
    const folder = join(this.root, id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const resolved = await realpath(folder),
      inside = relative(this.root, resolved);
    if (inside !== id || isAbsolute(inside)) throw new Error('MEDIA_PATH');
    const target = join(resolved, file);
    try {
      if ((await lstat(target)).isSymbolicLink())
        throw new Error('MEDIA_SYMLINK');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return target;
  }
  async reserve(bytes: number) {
    const space = await statfs(this.root);
    if (space.bavail * space.bsize < bytes * 3 + 268435456)
      throw new Error('MEDIA_DISK_FULL');
  }
  async writeChunk(id: string, offset: number, bytes: Buffer) {
    const path = await this.path(id, 'source.bin');
    const file = await open(path, offset === 0 ? 'w' : 'r+');
    try {
      const info = await file.stat();
      if (info.size < offset) throw new Error('MEDIA_OFFSET');
      await file.truncate(offset);
      let written = 0;
      while (written < bytes.length)
        written += (
          await file.write(
            bytes,
            written,
            bytes.length - written,
            offset + written,
          )
        ).bytesWritten;
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async size(id: string, file: MediaFile) {
    return (await stat(await this.path(id, file))).size;
  }
  async saveOverlay(id: string, bytes: Buffer) {
    const file = await open(await this.path(id, 'overlay.png'), 'w');
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async stream(id: string, file: MediaFile, start?: number, end?: number) {
    return createReadStream(await this.path(id, file), { start, end });
  }
  async removeFiles(id: string, sourceOnly = false) {
    // Callers must first load the owned Video row; the private root is service-owned.
    for (const file of sourceOnly
      ? (['source.bin', 'candidate.mp4', 'overlay.png'] as MediaFile[])
      : files) {
      const path = await this.path(id, file);
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (!sourceOnly) {
      try {
        await rmdir(dirname(await this.path(id, 'source.bin')));
      } catch (error) {
        if (
          !['ENOENT', 'ENOTEMPTY'].includes(
            (error as NodeJS.ErrnoException).code || '',
          )
        )
          throw error;
      }
    }
  }
}
