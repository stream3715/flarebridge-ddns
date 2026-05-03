export type IpVersion = "v4" | "v6";

export interface IpInfo {
  address: string;
  version: IpVersion;
}

// Matches a dotted-quad IPv4 address with each octet in 0-255.
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/;

// Matches the IPv4-mapped IPv6 prefix form ::ffff:a.b.c.d (case-insensitive).
const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

function isValidIPv4(address: string): boolean {
  return IPV4_RE.test(address);
}

/**
 * Validate an IPv6 address by exploiting the URL parser, which implements
 * the WHATWG URL standard's strict IPv6 parsing rules.  We construct a URL
 * with the candidate address as a bracketed host; if the parser throws, the
 * address is invalid.  We do NOT require a round-trip equality check because
 * the parser may canonicalise (e.g. compress consecutive zero groups).
 */
function isValidIPv6(address: string): boolean {
  if (!address.includes(":")) {
    return false;
  }
  try {
    new URL(`http://[${address}]/`);
    return true;
  } catch {
    return false;
  }
}

function isValidIp(address: string): boolean {
  return isValidIPv4(address) || isValidIPv6(address);
}

function ipVersion(address: string): IpVersion {
  return address.includes(":") ? "v6" : "v4";
}

/**
 * If `address` is an IPv4-mapped IPv6 address (::ffff:a.b.c.d), return the
 * embedded IPv4 address so that we create an A record rather than an AAAA
 * record for what is effectively an IPv4 client.
 * Returns the original address unchanged if it is not IPv4-mapped.
 */
function unwrapIPv4Mapped(address: string): string {
  const match = IPV4_MAPPED_RE.exec(address);
  if (match !== null && match[1] !== undefined && isValidIPv4(match[1])) {
    return match[1];
  }
  return address;
}

export function detectIp(request: Request, url: URL): IpInfo | null {
  const ipParam = url.searchParams.get("ip");
  if (ipParam !== null) {
    const trimmed = ipParam.trim();
    if (isValidIp(trimmed)) {
      const resolved = unwrapIPv4Mapped(trimmed);
      return { address: resolved, version: ipVersion(resolved) };
    }
    return null;
  }

  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp !== null) {
    const trimmed = cfConnectingIp.trim();
    if (isValidIp(trimmed)) {
      const resolved = unwrapIPv4Mapped(trimmed);
      return { address: resolved, version: ipVersion(resolved) };
    }
  }

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor !== null) {
    const first = xForwardedFor.split(",")[0];
    if (first !== undefined) {
      const trimmed = first.trim();
      if (isValidIp(trimmed)) {
        const resolved = unwrapIPv4Mapped(trimmed);
        return { address: resolved, version: ipVersion(resolved) };
      }
    }
  }

  return null;
}
