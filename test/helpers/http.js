// Integration clients follow the same CSRF handshake as the web/app frontend.
export async function secureFetch(url, options = {}) {
  if (!options.method || ['GET', 'HEAD'].includes(options.method)) return fetch(url, options);
  const headers = new Headers(options.headers);
  const response = await fetch(new URL('/api/csrf', url));
  const { token } = await response.json();
  headers.set('X-CSRF-Token', token);
  headers.set(
    'Cookie',
    [headers.get('Cookie'), response.headers.get('set-cookie')?.split(';')[0]]
      .filter(Boolean)
      .join('; ')
  );
  return fetch(url, { ...options, headers });
}
