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

describe("IPv4 validation - octet range", () => {
  it("accepts valid boundary values", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "0.0.0.0" });
    expect(detectIp(req, url)).toEqual({ address: "0.0.0.0", version: "v4" });
  });

  it("accepts 255.255.255.255", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "255.255.255.255" });
    expect(detectIp(req, url)).toEqual({ address: "255.255.255.255", version: "v4" });
  });

  it("rejects out-of-range octet (256)", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "256.1.1.1" });
    expect(detectIp(req, url)).toBeNull();
  });

  it("rejects out-of-range octet (999.999.999.999)", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "999.999.999.999" });
    expect(detectIp(req, url)).toBeNull();
  });
});

describe("IPv4-mapped IPv6 unwrapping", () => {
  it("unwraps ::ffff:a.b.c.d from CF-Connecting-IP to IPv4", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "::ffff:203.0.113.42" });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "203.0.113.42", version: "v4" });
  });

  it("unwraps ::ffff:a.b.c.d from ?ip= param to IPv4", () => {
    const [req, url] = makeRequestAndUrl({}, "?ip=::ffff:192.168.1.1");
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "192.168.1.1", version: "v4" });
  });

  it("does not unwrap plain IPv6 addresses", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "2001:db8::1" });
    const result = detectIp(req, url);
    expect(result).toEqual({ address: "2001:db8::1", version: "v6" });
  });
});

describe("IPv6 validation", () => {
  it("rejects a string of only colons", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "::::::::" });
    expect(detectIp(req, url)).toBeNull();
  });

  it("rejects a string that is only digits with a colon appended", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "12345:" });
    expect(detectIp(req, url)).toBeNull();
  });

  it("accepts a full-form IPv6 address", () => {
    const [req, url] = makeRequestAndUrl({
      "CF-Connecting-IP": "2001:0db8:0000:0000:0000:0000:0000:0001",
    });
    expect(detectIp(req, url)?.version).toBe("v6");
  });

  it("accepts the loopback address ::1", () => {
    const [req, url] = makeRequestAndUrl({ "CF-Connecting-IP": "::1" });
    expect(detectIp(req, url)?.version).toBe("v6");
  });
});
