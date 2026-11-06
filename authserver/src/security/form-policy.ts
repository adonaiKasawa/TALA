// Call only with a redirect URI already validated by oidc-provider for the client.
export function formPolicy(
  current: unknown,
  redirect: unknown,
): string | undefined {
  if (typeof current !== 'string' || typeof redirect !== 'string')
    return undefined;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return undefined;
  }
  if (target.username || target.password) return undefined;
  const source = ['http:', 'https:'].includes(target.protocol)
    ? target.origin
    : target.protocol === 'tala:'
      ? 'tala:'
      : undefined;
  if (!source) return undefined;
  const directive = `form-action 'self' ${source}`;
  return /(^|;)\s*form-action\s+[^;]+/.test(current)
    ? current.replace(
        /(^|;)\s*form-action\s+[^;]+/,
        (_match, start: string) => `${start}${directive}`,
      )
    : `${current};${directive}`;
}
