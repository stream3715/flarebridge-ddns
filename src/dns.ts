const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

interface CfListResponse {
  success: boolean;
  result: CfDnsRecord[];
}

interface CfMutateResponse {
  success: boolean;
  errors: { message: string }[];
}

export interface DnsUpdateResult {
  success: boolean;
  message: string;
}

async function listRecords(
  cfApiToken: string,
  zoneId: string,
  type: "A" | "AAAA",
  name: string
): Promise<CfDnsRecord[]> {
  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Cloudflare API list failed: ${response.status}`);
  }
  const data = (await response.json()) as CfListResponse;
  if (!data.success) {
    throw new Error("Cloudflare API list returned success=false");
  }
  return data.result;
}

async function putRecord(
  cfApiToken: string,
  zoneId: string,
  recordId: string,
  type: "A" | "AAAA",
  name: string,
  ip: string
): Promise<void> {
  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records/${recordId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, name, content: ip, ttl: 1, proxied: false }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare API update failed: ${response.status}`);
  }
  const data = (await response.json()) as CfMutateResponse;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare API update error: ${msg}`);
  }
}

async function postRecord(
  cfApiToken: string,
  zoneId: string,
  type: "A" | "AAAA",
  name: string,
  ip: string
): Promise<void> {
  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, name, content: ip, ttl: 1, proxied: false }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare API create failed: ${response.status}`);
  }
  const data = (await response.json()) as CfMutateResponse;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare API create error: ${msg}`);
  }
}

export async function upsertDnsRecord(
  cfApiToken: string,
  zoneId: string,
  hostname: string,
  ip: string,
  type: "A" | "AAAA"
): Promise<DnsUpdateResult> {
  try {
    const records = await listRecords(cfApiToken, zoneId, type, hostname);
    const existing = records[0];
    if (existing !== undefined) {
      await putRecord(cfApiToken, zoneId, existing.id, type, hostname, ip);
      return { success: true, message: "DNS record updated" };
    } else {
      await postRecord(cfApiToken, zoneId, type, hostname, ip);
      return { success: true, message: "DNS record created" };
    }
  } catch (err) {
    console.error("upsertDnsRecord error:", err);
    return { success: false, message: "Failed to update DNS record" };
  }
}
