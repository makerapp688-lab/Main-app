function setSessionCookie(res: Response, name: string, value: string, maxAgeSeconds: number, req?: Request): void {
  const isSecure = req ? (req.secure || req.headers['x-forwarded-proto'] === 'https') : true;
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  const cookieValue = value || '';

  // Persist across browser restarts by explicitly setting Expires. Avoid `Partitioned`
  // for this same-site app flow; it can interfere with normal browser persistence and
  // is not required for AniVault's session model.
  const secureFlags = isSecure ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${name}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${secureFlags}; Max-Age=${maxAge}; Expires=${expires}`
  );
}
