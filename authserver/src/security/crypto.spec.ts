import { Vault, digest, equal, token } from './crypto';

describe('Protection des secrets', () => {
  const vault = new Vault('ab'.repeat(32));
  it('chiffre sans stocker la valeur en clair et restitue le contenu', () => {
    const encrypted = vault.seal({ subject: 'private-test' });
    expect(encrypted).not.toContain('private-test');
    expect(vault.open(encrypted)).toEqual({ subject: 'private-test' });
  });
  it('refuse un contenu modifié', () => {
    const encrypted = Buffer.from(vault.seal({ secret: 'test' }), 'base64url');
    encrypted[30] ^= 1;
    expect(() => vault.open(encrypted.toString('base64url'))).toThrow();
  });
  it('génère des actions imprévisibles et compare sans erreur de longueur', () => {
    const first = token(),
      second = token();
    expect(first).not.toBe(second);
    expect(digest(first)).not.toContain(first);
    expect(equal(first, first)).toBe(true);
    expect(equal(first, '')).toBe(false);
  });
});
