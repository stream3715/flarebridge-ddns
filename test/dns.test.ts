import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upsertDnsRecord } from "../src/dns";

const TOKEN = "test-token";
const ZONE = "test-zone-id";
const HOSTNAME = "home.example.com";
const IPV4 = "203.0.113.42";
const IPV6 = "2001:db8::1";
const RECORD_ID = "abc123";

function mockListResponse(records: object[]) {
  return new Response(JSON.stringify({ success: true, result: records }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockMutateResponse(success = true, errors: object[] = []) {
  return new Response(JSON.stringify({ success, errors }), {
    status: success ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

describe("upsertDnsRecord - update existing record (PUT)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls PUT when an existing A record is found", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        mockListResponse([{ id: RECORD_ID, type: "A", name: HOSTNAME, content: "1.2.3.4" }])
      )
      .mockResolvedValueOnce(mockMutateResponse(true));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");

    expect(result.success).toBe(true);
    expect(result.message).toBe("DNS record updated");

    const putCall = mockFetch.mock.calls[1];
    expect(putCall).toBeDefined();
    expect(putCall![0]).toContain(RECORD_ID);
    expect(putCall![1]?.method).toBe("PUT");

    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.content).toBe(IPV4);
    expect(body.type).toBe("A");
  });

  it("calls PUT when an existing AAAA record is found", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        mockListResponse([{ id: RECORD_ID, type: "AAAA", name: HOSTNAME, content: "::1" }])
      )
      .mockResolvedValueOnce(mockMutateResponse(true));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV6, "AAAA");

    expect(result.success).toBe(true);

    const putCall = mockFetch.mock.calls[1];
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.type).toBe("AAAA");
    expect(body.content).toBe(IPV6);
  });
});

describe("upsertDnsRecord - create new record (POST)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST when no existing record is found", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce(mockMutateResponse(true));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");

    expect(result.success).toBe(true);
    expect(result.message).toBe("DNS record created");

    const postCall = mockFetch.mock.calls[1];
    expect(postCall![1]?.method).toBe("POST");

    const body = JSON.parse(postCall![1]?.body as string);
    expect(body.content).toBe(IPV4);
    expect(body.name).toBe(HOSTNAME);
    expect(body.ttl).toBe(1);
    expect(body.proxied).toBe(false);
  });

  it("calls POST for AAAA when no existing record is found", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce(mockMutateResponse(true));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV6, "AAAA");

    expect(result.success).toBe(true);

    const postCall = mockFetch.mock.calls[1];
    const body = JSON.parse(postCall![1]?.body as string);
    expect(body.type).toBe("AAAA");
    expect(body.content).toBe(IPV6);
  });
});

describe("upsertDnsRecord - duplicate record cleanup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes extra duplicate records after updating the first", async () => {
    const RECORD_ID_2 = "dup001";
    const RECORD_ID_3 = "dup002";
    const mockFetch = vi.mocked(fetch);
    // List returns three records for the same hostname.
    mockFetch
      .mockResolvedValueOnce(
        mockListResponse([
          { id: RECORD_ID, type: "A", name: HOSTNAME, content: "1.2.3.4" },
          { id: RECORD_ID_2, type: "A", name: HOSTNAME, content: "1.2.3.5" },
          { id: RECORD_ID_3, type: "A", name: HOSTNAME, content: "1.2.3.6" },
        ])
      )
      .mockResolvedValueOnce(mockMutateResponse(true))  // PUT first record
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))  // DELETE dup1
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // DELETE dup2

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Second call should be PUT on the first record.
    expect(mockFetch.mock.calls[1]![1]?.method).toBe("PUT");
    // Third and fourth calls should be DELETE on the duplicate record IDs.
    expect(mockFetch.mock.calls[2]![1]?.method).toBe("DELETE");
    expect((mockFetch.mock.calls[2]![0] as string)).toContain(RECORD_ID_2);
    expect(mockFetch.mock.calls[3]![1]?.method).toBe("DELETE");
    expect((mockFetch.mock.calls[3]![0] as string)).toContain(RECORD_ID_3);
  });
});

describe("upsertDnsRecord - error handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success=false when the Cloudflare list API returns non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("error", { status: 403 })
    );

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to update DNS record");
  });

  it("returns success=false when the PUT API returns non-ok status", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        mockListResponse([{ id: RECORD_ID, type: "A", name: HOSTNAME, content: "1.2.3.4" }])
      )
      .mockResolvedValueOnce(new Response("error", { status: 500 }));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");
    expect(result.success).toBe(false);
  });

  it("returns success=false when Cloudflare API returns success=false in body", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce(mockMutateResponse(false, [{ message: "Invalid record" }]));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");
    expect(result.success).toBe(false);
  });

  it("returns success=false when fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network failure"));

    const result = await upsertDnsRecord(TOKEN, ZONE, HOSTNAME, IPV4, "A");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to update DNS record");
  });
});
