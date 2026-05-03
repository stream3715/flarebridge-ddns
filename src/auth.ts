export function authenticate(request: Request, apiKey: string): boolean {
  const authHeader = request.headers.get("Authorization");

  if (authHeader !== null) {
    const match = authHeader.match(/^Basic\s+(.+)$/i);
    if (match === null || match[1] === undefined) {
      return false;
    }
    let decoded: string;
    try {
      decoded = atob(match[1]);
    } catch {
      return false;
    }
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return false;
    }
    const password = decoded.slice(colonIndex + 1);
    return password === apiKey;
  }

  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");
  if (keyParam !== null) {
    return keyParam === apiKey;
  }

  return false;
}
