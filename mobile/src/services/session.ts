import {
  authorize,
  refresh,
  revoke,
  logout,
  resumePendingAuthorize,
  type AuthConfiguration,
  type AuthorizeResult,
} from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import BlobUtil from 'react-native-blob-util';
import { config } from '../config';
type Session = {
  refresh: string;
  idToken: string;
  tokens: Record<string, { value: string; expires: number }>;
};
const service = 'tala.session';
let pending: Promise<unknown> = Promise.resolve();
export function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work, work);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export class ClientError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}
function authConfig(): AuthConfiguration {
  const c = config();
  return {
    issuer: c.issuer,
    clientId: c.clientId,
    redirectUrl: c.redirectUrl,
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'tala.api',
      'tala.identity',
    ],
    usePKCE: true,
    useNonce: true,
    dangerouslyAllowInsecureHttpRequests: __DEV__,
    connectionTimeoutSeconds: 15,
  };
}
async function stored(): Promise<Session | null> {
  const value = await Keychain.getGenericPassword({ service });
  if (!value) return null;
  try {
    const data = JSON.parse(value.password) as Session;
    return data.refresh && data.tokens && data.idToken ? data : null;
  } catch {
    return null;
  }
}
async function save(session: Session) {
  await Keychain.setGenericPassword('tala', JSON.stringify(session), {
    service,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
async function accept(result: AuthorizeResult) {
  if (!result.refreshToken || !result.idToken || !result.accessToken)
    throw new ClientError('La connexion n’a pas abouti. Réessayez.');
  await save({
    refresh: result.refreshToken,
    idToken: result.idToken,
    tokens: {
      [config().apiAudience]: {
        value: result.accessToken,
        expires: Date.parse(result.accessTokenExpirationDate),
      },
    },
  });
}
export function signIn(register = false) {
  return serial(async () => {
    try {
      await accept(
        await authorize({
          ...authConfig(),
          additionalParameters: {
            prompt: 'consent',
            max_age: '0',
            ...(register ? { tala_action: 'register' } : {}),
          },
        }),
      );
    } catch {
      throw new ClientError(
        'La connexion n’a pas abouti ou a été annulée. Vous pouvez réessayer.',
      );
    }
  });
}
export function restore() {
  return serial(async () => {
    if (await stored()) return true;
    const result = await resumePendingAuthorize({
      dangerouslyAllowInsecureHttpRequests: __DEV__,
    });
    if (result) {
      await accept(result);
      return true;
    }
    return false;
  });
}
export function clearSession() {
  return serial(async () => {
    await Keychain.resetGenericPassword({ service });
  });
}
async function token(session: Session, resource: string) {
  const existing = session.tokens[resource];
  if (existing && existing.expires > Date.now() + 30000) return existing.value;
  try {
    const result = await refresh(
      { ...authConfig(), additionalParameters: { resource } },
      { refreshToken: session.refresh },
    );
    if (!result.refreshToken || !result.accessToken)
      throw new Error('Missing refresh');
    session.refresh = result.refreshToken;
    if (result.idToken) session.idToken = result.idToken;
    session.tokens[resource] = {
      value: result.accessToken,
      expires: Date.parse(result.accessTokenExpirationDate),
    };
    // Persist the successor before any subsequent API request can fail.
    await save(session);
    return result.accessToken;
  } catch {
    throw new ClientError(
      'Votre session a expiré. Reconnectez-vous pour continuer.',
      401,
    );
  }
}
export function request(
  path: string,
  target: 'api' | 'identity' = 'api',
  method = 'GET',
  body?: unknown,
): Promise<unknown> {
  return serial(async () => {
    const session = await stored();
    if (!session) throw new ClientError('Connectez-vous pour continuer.', 401);
    const c = config(),
      resource = target === 'api' ? c.apiAudience : c.identityAudience;
    const bearer = await token(session, resource);
    let response: Response;
    try {
      response = await fetch(
        `${target === 'api' ? c.api + '/api/v1' : c.issuer}${path}`,
        {
          method,
          headers: {
            authorization: `Bearer ${bearer}`,
            accept: 'application/json',
            ...(body !== undefined
              ? { 'content-type': 'application/json' }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new ClientError(
        'Connexion impossible. Vérifiez votre réseau puis réessayez.',
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new ClientError(
        data.message || 'Cette action n’a pas abouti.',
        response.status,
      );
    return data;
  });
}
export function signOut() {
  return serial(async () => {
    const session = await stored();
    await Keychain.resetGenericPassword({ service });
    if (!session) return;
    try {
      await revoke(authConfig(), {
        tokenToRevoke: session.refresh,
        sendClientId: true,
      });
    } catch {}
    try {
      await logout(
        {
          issuer: config().issuer,
          clientId: config().clientId,
          dangerouslyAllowInsecureHttpRequests: __DEV__,
        },
        { idToken: session.idToken, postLogoutRedirectUrl: config().logoutUrl },
      );
    } catch {
      throw new ClientError(
        'Vous êtes déconnecté de cette application. La fermeture de la connexion dans le navigateur n’a pas abouti.',
      );
    }
  });
}

export function uploadVideoBlock(
  id: string,
  path: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return serial(async () => {
    if (
      !/^[a-f0-9-]{36}$/i.test(id) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      length <= 0 ||
      length > 4 * 1024 * 1024
    )
      throw new ClientError('Bloc vidéo invalide.');
    const session = await stored();
    if (!session) throw new ClientError('Connectez-vous pour continuer.', 401);
    const c = config(),
      bearer = await token(session, c.apiAudience);
    const temp = `${BlobUtil.fs.dirs.CacheDir}/tala-chunk-${Date.now()}.bin`;
    let cancel: (() => void) | undefined;
    try {
      if (signal?.aborted) throw new ClientError('Envoi suspendu.');
      await BlobUtil.fs.slice(path, temp, offset, offset + length);
      const task = BlobUtil.config({ timeout: 60000 }).fetch(
        'PUT',
        `${c.api}/api/v1/videos/${id}/content`,
        {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/octet-stream',
          'upload-offset': String(offset),
        },
        BlobUtil.wrap(temp),
      );
      cancel = () => {
        task.cancel(() => {}).catch(() => {});
      };
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      const response = await task,
        data = response.json();
      if (response.info().status < 200 || response.info().status >= 300)
        throw new ClientError(
          data.message || 'Envoi interrompu.',
          response.info().status,
        );
      return data;
    } finally {
      if (cancel) signal?.removeEventListener('abort', cancel);
      await BlobUtil.fs.unlink(temp).catch(() => {});
    }
  });
}
export function uploadVideoOverlay(
  id: string,
  uri: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return serial(async () => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new ClientError('Vidéo invalide.');
    const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    const info = await BlobUtil.fs.stat(path);
    if (Number(info.size) < 33 || Number(info.size) > 4 * 1024 * 1024)
      throw new ClientError(
        'Le montage est trop volumineux. Réduisez les dessins ou les textes.',
      );
    const session = await stored();
    if (!session) throw new ClientError('Connectez-vous pour continuer.', 401);
    const c = config(),
      bearer = await token(session, c.apiAudience);
    if (signal?.aborted) throw new ClientError('Envoi suspendu.');
    const task = BlobUtil.config({ timeout: 60000 }).fetch(
      'PUT',
      `${c.api}/api/v1/videos/${id}/overlay`,
      { authorization: `Bearer ${bearer}`, 'content-type': 'image/png' },
      BlobUtil.wrap(path),
    );
    const cancel = () => {
      task.cancel(() => {}).catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      const response = await task,
        data = response.json();
      if (response.info().status < 200 || response.info().status >= 300)
        throw new ClientError(
          data.message || 'Envoi du montage interrompu.',
          response.info().status,
        );
      return data;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  });
}
