export const development = {
  issuer: 'http://localhost:4000',
  api: 'http://localhost:4001',
  clientId: 'tala-mobile',
  redirectUrl: 'tala://oauth/callback',
  logoutUrl: 'tala://oauth/logout',
  apiAudience: 'urn:tala:api',
  identityAudience: 'urn:tala:identity',
};
// Fill with the HTTPS web origin before distributing public links.
export const publicWebOrigin = __DEV__ ? 'http://localhost:3000' : '';
// Fill these two origins when the production domains have been selected.
const production = { ...development, issuer: '', api: '' };
export function config() {
  const value = __DEV__ ? development : production;
  if (
    !value.issuer ||
    !value.api ||
    (!__DEV__ &&
      (!value.issuer.startsWith('https://') ||
        !value.api.startsWith('https://')))
  )
    throw new Error(
      'Le service mobile n’est pas encore configuré pour cet environnement.',
    );
  return value;
}
