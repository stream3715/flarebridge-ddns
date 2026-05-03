import { describe, it, expect } from "vitest";
import { authenticate } from "../src/auth";

const API_KEY = "supersecretkey";

function makeRequest(headers: Record<string, string> = {}, search = ""): Request {
  return new Request(`https://example.com/update${search}`, { headers });
}

describe("authenticate - Basic auth", () => {
  it("succeeds with correct password in Basic auth header", () => {
    const encoded = btoa(`router:${API_KEY}`);
    const req = makeRequest({ Authorization: `Basic ${encoded}` });
    expect(authenticate(req, API_KEY)).toBe(true);
  });

  it("succeeds regardless of username value", () => {
    const encoded = btoa(`ignored-username:${API_KEY}`);
    const req = makeRequest({ Authorization: `Basic ${encoded}` });
    expect(authenticate(req, API_KEY)).toBe(true);
  });

  it("fails with wrong password in Basic auth header", () => {
    const encoded = btoa(`user:wrongkey`);
    const req = makeRequest({ Authorization: `Basic ${encoded}` });
    expect(authenticate(req, API_KEY)).toBe(false);
  });

  it("fails with malformed Basic auth header (no colon in decoded value)", () => {
    const encoded = btoa("nocolon");
    const req = makeRequest({ Authorization: `Basic ${encoded}` });
    expect(authenticate(req, API_KEY)).toBe(false);
  });

  it("fails with non-Basic scheme", () => {
    const req = makeRequest({ Authorization: `Bearer ${API_KEY}` });
    expect(authenticate(req, API_KEY)).toBe(false);
  });

  it("fails with invalid base64 in Basic auth header", () => {
    const req = makeRequest({ Authorization: "Basic !!!notbase64!!!" });
    expect(authenticate(req, API_KEY)).toBe(false);
  });
});

describe("authenticate - query parameter", () => {
  it("succeeds with correct key query param", () => {
    const req = makeRequest({}, `?key=${API_KEY}`);
    expect(authenticate(req, API_KEY)).toBe(true);
  });

  it("fails with wrong key query param", () => {
    const req = makeRequest({}, `?key=wrongkey`);
    expect(authenticate(req, API_KEY)).toBe(false);
  });
});

describe("authenticate - no credentials", () => {
  it("fails when neither Authorization header nor key param is present", () => {
    const req = makeRequest();
    expect(authenticate(req, API_KEY)).toBe(false);
  });

  it("Authorization header takes precedence over key param (valid header, wrong param)", () => {
    const encoded = btoa(`user:${API_KEY}`);
    const req = makeRequest({ Authorization: `Basic ${encoded}` }, `?key=wrongkey`);
    expect(authenticate(req, API_KEY)).toBe(true);
  });

  it("Authorization header takes precedence over key param (wrong header, correct param)", () => {
    const encoded = btoa(`user:wrongkey`);
    const req = makeRequest({ Authorization: `Basic ${encoded}` }, `?key=${API_KEY}`);
    expect(authenticate(req, API_KEY)).toBe(false);
  });
});
