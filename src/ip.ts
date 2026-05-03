export type IpVersion = "v4" | "v6";

export interface IpInfo {
  address: string;
  version: IpVersion;
}

function isValidIp(address: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(address) || (ipv6.test(address) && address.includes(":"));
}

function ipVersion(address: string): IpVersion {
  return address.includes(":") ? "v6" : "v4";
}

export function detectIp(request: Request, url: URL): IpInfo | null {
  const ipParam = url.searchParams.get("ip");
  if (ipParam !== null) {
    const trimmed = ipParam.trim();
    if (isValidIp(trimmed)) {
      return { address: trimmed, version: ipVersion(trimmed) };
    }
    return null;
  }

  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp !== null) {
    const trimmed = cfConnectingIp.trim();
    if (isValidIp(trimmed)) {
      return { address: trimmed, version: ipVersion(trimmed) };
    }
  }

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor !== null) {
    const first = xForwardedFor.split(",")[0];
    if (first !== undefined) {
      const trimmed = first.trim();
      if (isValidIp(trimmed)) {
        return { address: trimmed, version: ipVersion(trimmed) };
      }
    }
  }

  return null;
}
