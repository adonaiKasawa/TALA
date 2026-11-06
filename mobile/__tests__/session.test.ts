import { request, signIn, uploadVideoBlock } from '../src/services/session';
import BlobUtil from 'react-native-blob-util';
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { CacheDir: '/cache' },
      slice: jest.fn(async () => '/cache/chunk'),
      unlink: jest.fn(async () => {}),
    },
    wrap: jest.fn((path: string) => 'wrapped:' + path),
    config: jest.fn(() => ({
      fetch: jest.fn(() =>
        Object.assign(
          Promise.resolve({
            json: () => ({ uploadedBytes: 4 }),
            info: () => ({ status: 200 }),
          }),
          { cancel: jest.fn() },
        ),
      ),
    })),
  },
}));
import * as Keychain from 'react-native-keychain';
import { authorize, refresh } from 'react-native-app-auth';
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
}));
jest.mock('react-native-app-auth', () => ({
  authorize: jest.fn(),
  refresh: jest.fn(),
  resumePendingAuthorize: jest.fn(),
  revoke: jest.fn(),
  logout: jest.fn(),
}));
let saved: {
  refresh: string;
  idToken: string;
  tokens: Record<string, { value: string; expires: number }>;
};
beforeEach(() => {
  jest.clearAllMocks();
  saved = { refresh: 'refresh-0', idToken: 'id', tokens: {} };
  jest.mocked(Keychain.getGenericPassword).mockImplementation(
    async () =>
      ({
        service: 'tala.session',
        username: 'tala',
        password: JSON.stringify(saved),
        storage: 'test',
      } as never),
  );
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementation(async (_username, value) => {
      saved = JSON.parse(value);
      return { service: 'tala.session' } as never;
    });
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  })) as unknown as typeof fetch;
});

test('envoi vidéo natif borné : fichier découpé, token API et suppression du bloc temporaire', async () => {
  saved.tokens['urn:tala:api'] = {
    value: 'video-access',
    expires: Date.now() + 300000,
  };
  const result = await uploadVideoBlock(
    '12345678-1234-4234-8234-123456789012',
    '/cache/tala-upload-test.video',
    0,
    4,
  );
  expect(result).toEqual({ uploadedBytes: 4 });
  expect(BlobUtil.fs.slice).toHaveBeenCalledWith(
    '/cache/tala-upload-test.video',
    expect.stringContaining('/cache/tala-chunk-'),
    0,
    4,
  );
  const fetcher = jest.mocked(BlobUtil.config).mock.results[0].value.fetch;
  expect(fetcher).toHaveBeenCalledWith(
    'PUT',
    expect.stringContaining(
      '/api/v1/videos/12345678-1234-4234-8234-123456789012/content',
    ),
    expect.objectContaining({
      authorization: 'Bearer video-access',
      'upload-offset': '0',
    }),
    expect.stringContaining('wrapped:/cache/tala-chunk-'),
  );
  expect(BlobUtil.fs.unlink).toHaveBeenCalledWith(
    expect.stringContaining('/cache/tala-chunk-'),
  );
  await expect(
    uploadVideoBlock('bad-id', '/cache/tala-upload-test.video', 0, 4),
  ).rejects.toThrow('Bloc vidéo invalide');
});
test('autorisation native publique avec PKCE et nonce, sans secret embarqué', async () => {
  jest.mocked(authorize).mockResolvedValue({
    accessToken: 'api',
    accessTokenExpirationDate: new Date(Date.now() + 300000).toISOString(),
    refreshToken: 'refresh-next',
    idToken: 'id',
  } as never);
  await signIn();
  const config = jest.mocked(authorize).mock.calls[0][0];
  expect(config.usePKCE).toBe(true);
  expect(config.useNonce).toBe(true);
  expect(config.clientSecret).toBeUndefined();
  expect(config.additionalParameters?.prompt).toBe('consent');
  expect(saved.refresh).toBe('refresh-next');
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'tala',
    expect.any(String),
    expect.objectContaining({ accessible: 'device-only' }),
  );
});
test('renouvellements concurrents sérialisés et successeur conservé par ressource', async () => {
  let active = 0,
    maximum = 0,
    count = 0;
  jest.mocked(refresh).mockImplementation(async (_config, params) => {
    expect(params.refreshToken).toBe(`refresh-${count}`);
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    count++;
    active--;
    return {
      accessToken: `access-${count}`,
      accessTokenExpirationDate: new Date(Date.now() + 300000).toISOString(),
      refreshToken: `refresh-${count}`,
      idToken: 'id',
      tokenType: 'Bearer',
    };
  });
  await Promise.all([
    request('/account/me', 'identity'),
    request('/me/profile', 'api'),
  ]);
  expect(maximum).toBe(1);
  expect(saved.refresh).toBe('refresh-2');
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(saved.tokens['urn:tala:identity'].value).toBe('access-1');
  expect(saved.tokens['urn:tala:api'].value).toBe('access-2');
});
test('une erreur réseau après renouvellement ne restaure jamais l’ancien refresh', async () => {
  jest.mocked(refresh).mockResolvedValue({
    accessToken: 'api',
    accessTokenExpirationDate: new Date(Date.now() + 300000).toISOString(),
    refreshToken: 'refresh-next',
    idToken: 'id',
  } as never);
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('network'));
  await expect(request('/me/profile')).rejects.toThrow('Vérifiez votre réseau');
  expect(saved.refresh).toBe('refresh-next');
});
