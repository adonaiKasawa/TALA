import "server-only";
import { Pool, type PoolClient } from "pg";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { config } from "./config";
export const random = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
const globalStore = globalThis as unknown as { talaPool?: Pool };
export function pool() {
  return (globalStore.talaPool ||= new Pool({
    connectionString: config().database,
    max: 8,
    connectionTimeoutMillis: 5000,
  }));
}
export function seal(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(config().key, "hex"),
      iv,
    );
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
export function open<T>(value: string): T {
  const bytes = Buffer.from(value, "base64url"),
    cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(config().key, "hex"),
      bytes.subarray(0, 12),
    );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}
export async function put(
  id: string,
  kind: string,
  data: unknown,
  seconds: number,
) {
  await pool().query(
    "INSERT INTO tala_web.sessions(id,kind,payload,expires_at) VALUES($1,$2,$3,NOW()+($4*INTERVAL '1 second'))",
    [digest(id), kind, seal(data), seconds],
  );
  await pool().query("DELETE FROM tala_web.sessions WHERE expires_at < NOW()");
}
export async function take<T>(id: string, kind: string) {
  const result = await pool().query<{ payload: string }>(
    "DELETE FROM tala_web.sessions WHERE id=$1 AND kind=$2 AND expires_at>NOW() RETURNING payload",
    [digest(id), kind],
  );
  return result.rows[0] ? open<T>(result.rows[0].payload) : null;
}
export async function remove(id: string) {
  await pool().query("DELETE FROM tala_web.sessions WHERE id=$1", [digest(id)]);
}
export type Session = {
  csrf: string;
  refresh: string;
  idToken: string;
  subject: string;
  tokens: Record<string, { value: string; expires: number }>;
};
export async function locked<T>(
  id: string,
  work: (session: Session, connection: PoolClient) => Promise<T>,
): Promise<T> {
  const connection = await pool().connect();
  let committed = false;
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL lock_timeout = '5s'");
    const result = await connection.query<{ payload: string }>(
      "SELECT payload FROM tala_web.sessions WHERE id=$1 AND kind='session' AND expires_at>NOW() FOR UPDATE",
      [digest(id)],
    );
    if (!result.rows[0]) throw new Error("SESSION_REQUIRED");
    const session = open<Session>(result.rows[0].payload);
    let value: T | undefined;
    let failure: unknown;
    try {
      value = await work(session, connection);
    } catch (error) {
      failure = error;
    }
    await connection.query(
      "UPDATE tala_web.sessions SET payload=$1 WHERE id=$2",
      [seal(session), digest(id)],
    );
    await connection.query("COMMIT");
    committed = true;
    // A refresh is an external side effect: keep its successor even if a later API call failed.
    if (failure) throw failure;
    return value as T;
  } catch (error) {
    if (!committed) await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}
