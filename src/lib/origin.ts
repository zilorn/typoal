// A reverse proxy may terminate HTTPS while the Node service receives HTTP.
// Validate the exact host (including port); the API enforces HTTPS for secure cookies.
export function matchesOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.origin === origin &&
      parsed.host === new URL(request.url).host
    );
  } catch {
    return false;
  }
}
