import { formPolicy } from './form-policy';
describe('Retours de formulaires OIDC', () => {
  const policy = "default-src 'self';form-action 'self';frame-ancestors 'none'";
  it('autorise uniquement l’origine validée sans retirer les autres protections', () => {
    expect(formPolicy(policy, 'https://web.tala.test/auth/callback')).toBe(
      "default-src 'self';form-action 'self' https://web.tala.test;frame-ancestors 'none'",
    );
  });
  it('permet le retour natif enregistré et refuse les schémas exécutables', () => {
    expect(formPolicy(policy, 'tala://oauth/callback')).toContain(
      "form-action 'self' tala:",
    );
    expect(formPolicy(policy, 'javascript:alert(1)')).toBeUndefined();
    expect(formPolicy(undefined, 'https://web.tala.test')).toBeUndefined();
  });
});
