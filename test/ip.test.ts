import { describe, it, expect } from "vitest";
import { detectIp } from "../src/ip";

function makeRequestAndUrl(
  headers: Record<string, string> = {},
  search = ""
): [Request, URL] {
  const urlStr = `https://example.com/update${search}`;
  const req = new Request(urlStr, { headers });
  const url = new URL(urlStr);
  return [req, url];
}

describe("detectIp - query parameter override", () => {
  it("returns IPv4 from ?ip= param", () => {
    const [req, url] = makeRequestAndUrl({}, "?ip=203.0.113.42");
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "203.0.113.42", version: "v4" });
  });

  it("returns IPv6 from ?ip= param", () => {
    const [req, url] = makeRequestAndUrl({}, "?ip=2001:db8::1");
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "2001:db8::1", version: "v6" });
  });

  it("returns null when ?ip= param contains an invalid address", () => {
    const [req, url] = makeRequestAndUrl({}, "?ip=not-an-ip");
    const result = detectIp(req, url);
    expect(result).toBeNull();
  });

  it("?ip= param takes precedence over CF-Connecting-IP", () => {
    const [req, url] = makeRequestAndUrl(
      { "CF-Connecting-IP": "1.2.3.4" },
      "?ip=203.0.113.42"
    );
    const result = detectIp(req, url);
    expect(result?.address).toBe("203.0.113.42");
  });
});

describe("detectIp - CF-Connecting-IP header", () => {
  it("detects IPv4 from CF-Connecting-IP", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "198.51.100.1" });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "198.51.100.1", version: "v4" });
  });

  it("detects IPv6 from CF-Connecting-IP", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "2001:db8::cafe" });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "2001:db8::cafe", version: "v6" });
  });

  it("takes precedence over X-Forwarded-For", () => {
    const [req, url] = makeRequestAndUrl({
      "CF-Connecting-IP": "198.51.100.1",
      "X-Forwarded-For": "10.0.0.1, 10.0.0.2",
    });
    const result = detectIp(req, url);
    expect(result?.address).toBe("198.51.100.1");
  });
});

describe("detectIp - X-Forwarded-For header", () => {
  it("uses the first address in X-Forwarded-For", () => {
    const [req, url] = makeRequestAndUrl({
      "X-Forwarded-For": "203.0.113.5, 10.0.0.1, 10.0.0.2",
    });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "203.0.113.5", version: "v4" });
  });

  it("handles X-Forwarded-For with a single address", () => {
    const [req, url] = makeRequestAndUrl({ "X-Forwarded-For": "192.0.2.1" });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "192.0.2.1", version: "v4" });
  });
});

describe("detectIp - no usable source", () => {
  it("returns null when no headers and no query param", () => {
    const [req, url] = makeRequestAndUrl();
    const result = detectIp(req, url);
    expect(result).toBeNull();
  });
});

describe("IP version detection", () => {
  it("classifies dotted-quad as v4", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "10.20.30.40" });
    expect(detectIp(req, url)?.version).toBe("v4");
  });

  it("classifies colon-containing address as v6", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "::1" });
    expect(detectIp(req, url)?.version).toBe("v6");
  });
});
