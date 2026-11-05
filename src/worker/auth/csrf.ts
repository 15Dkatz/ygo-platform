// CSRF protection for the JSON API: state-changing requests must come from our own origin.
// SameSite=Lax cookies already block most cross-site POSTs; this closes the rest
// (e.g. same-site subdomains, old browsers) without needing tokens.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Returns true when the request is allowed. */
export function sameOriginOk(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.get("Origin");
  if (!origin || origin === "null") {
    // Every current browser sends Origin on non-GET fetches; a missing one means a
    // non-browser client, which must send Origin explicitly.
    return false;
  }
  try {
    // host = hostname + port
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
