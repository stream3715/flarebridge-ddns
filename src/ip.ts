export type IpVersion = "v4" | "v6";

export interface IpInfo {
  address: string;
  version: IpVersion;
}

export function detectIp(request: Request, url: URL): IpInfo | null {
  // placeholder
  return null;
}
