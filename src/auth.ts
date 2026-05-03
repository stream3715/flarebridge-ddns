function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  // Pad the shorter buffer so the comparison always runs over the same length,
  // preventing early-exit leaks on length mismatch.
  const len = Math.max(bufA.length, bufB.length);
  const paddedA = new Uint8Array(len);
  const paddedB = new Uint8Array(len);
  paddedA.set(bufA);
  paddedB.set(bufB);
  // crypto.subtle.timingSafeEqual performs a constant-time byte comparison.
  const equal = crypto.subtle.timingSafeEqual(paddedA, paddedB);
  // Also require original lengths to match (length mismatch means not equal).
  return equal && bufA.length === bufB.length;
}

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
    return timingSafeEqual(password, apiKey);
  }

  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");
  if (keyParam !== null) {
    return timingSafeEqual(keyParam, apiKey);
  }

  return false;
}
