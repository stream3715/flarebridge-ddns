# FlareBridge DDNS

Cloudflare Workers application that updates Cloudflare DNS A/AAAA records from routers supporting only HTTP Basic auth or query-parameter auth.

## Project Structure

```
src/
  index.ts   # Worker entrypoint, request routing, Env interface
  auth.ts    # Authentication (Basic auth + ?key= query param)
  ip.ts      # IP detection and validation
  dns.ts     # Cloudflare DNS API client (upsert + duplicate cleanup)
test/
  auth.test.ts
  ip.test.ts
  dns.test.ts
docs/
  design.md  # Full architecture and design decisions
```

## Development Commands

```bash
npm test           # Run all tests (vitest + Miniflare)
npm run dev        # Local dev server via wrangler dev
npm run deploy     # Deploy to Cloudflare Workers
```

## Required Secrets

Set these before deploying — never put values in `wrangler.toml` or source code:

```bash
wrangler secret put API_KEY        # Auth key given to the router
wrangler secret put CF_API_TOKEN   # Cloudflare token with Zone:DNS:Edit
wrangler secret put CF_ZONE_ID     # Target zone ID
```

## API

```
GET /update?hostname=<fqdn>[&ip=<address>][&key=<api-key>]
```

Authentication: `Authorization: Basic base64(any:API_KEY)` header (preferred) or `?key=API_KEY` query parameter.

`?ip=` is optional; omit to auto-detect from `CF-Connecting-IP`.

### Response

```json
{ "success": true, "message": "DNS record updated", "ip": "203.0.113.1", "type": "A" }
```

## Key Implementation Notes

- **Timing-safe comparison**: `auth.ts` uses `crypto.subtle.timingSafeEqual` — do not revert to `===`.
- **IPv4-mapped IPv6**: `ip.ts` unwraps `::ffff:a.b.c.d` to a plain IPv4 address before creating the DNS record.
- **Duplicate record cleanup**: `dns.ts` deletes extra A/AAAA records for the same hostname after updating the first one.
- **Hostname validation**: `index.ts` enforces RFC-1123 format and 253-character limit before calling the DNS API.
- **`?key=` logging risk**: Query-param auth exposes the key in Cloudflare request logs — prefer Basic auth for production.

## Testing

Tests run in Miniflare (Workers runtime emulator) via `@cloudflare/vitest-pool-workers`. Fake bindings are injected in `vitest.config.mts`. The global `fetch` is stubbed in `dns.test.ts` to mock Cloudflare API responses.

47 tests across 3 files. Run `npm test` to verify.
