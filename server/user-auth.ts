function setSessionCookie(res: Response, name: string, value: string, maxAgeSeconds: number, req?: Request): void {
  const isSecure = req ? (req.secure || req.headers['x-forwarded-proto'] === 'https') : true;
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  const cookieValue = value || '';

  // Use a browser-safe, persistent cookie configuration. Partitioned cookies are
  // not required for same-site AniVault sessions and can interfere with normal
  // cookie persistence across browser restarts. Explicit Expires helps browsers
  // keep the session alive after a full shutdown/reopen cycle.
  const secureFlags = isSecure ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${name}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${secureFlags}; Max-Age=${maxAge}; Expires=${expires}`
  );
}
