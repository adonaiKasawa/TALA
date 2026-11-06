import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class Vault {
  private key: Buffer;
  constructor(hex: string) {
    this.key = Buffer.from(hex, 'hex');
  }
  seal(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  }
  open<T>(value: string): T {
    const data = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  }
}
