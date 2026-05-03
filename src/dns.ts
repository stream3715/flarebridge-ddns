export interface DnsUpdateResult {
  success: boolean;
  message: string;
}

export async function upsertDnsRecord(
  cfApiToken: string,
  zoneId: string,
  hostname: string,
  ip: string,
  type: "A" | "AAAA"
): Promise<DnsUpdateResult> {
  // placeholder
  return { success: false, message: "not implemented" };
}
