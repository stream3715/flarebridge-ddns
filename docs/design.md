# FlareBridge DDNS - Design Document

## Architecture Overview

FlareBridge DDNS is a Cloudflare Workers application that receives HTTP requests from routers (or any HTTP client) and updates Cloudflare DNS A/AAAA records to reflect the caller's current IP address. It acts as a DDNS update endpoint compatible with routers that support either HTTP Basic authentication or query-parameter-based authentication.

```
Router / Client
      │
      │ GET /update?hostname=home.example.com[&ip=x.x.x.x][&key=<api-key>]
      │ (or with Authorization: Basic header)
      ▼
Cloudflare Workers (FlareBridge DDNS)
      │
      ├── 1. Authenticate request (Basic auth or ?key=)
      ├── 2. Detect IP address (param > CF-Connecting-IP > X-Forwarded-For)
      ├── 3. Determine record type (A for IPv4, AAAA for IPv6)
      └── 4. Upsert DNS record via Cloudflare API
              │
              ▼
       Cloudflare DNS API
```

## Endpoint Design

### Single endpoint

```
GET /update
```

All parameters are passed as query parameters. Authentication can be provided via HTTP Basic or the `key` query parameter.

#### Query Parameters

| Parameter  | Required | Description                                             |
|------------|----------|---------------------------------------------------------|
| `hostname` | Yes      | Fully-qualified domain name to update (e.g. `home.example.com`) |
| `ip`       | No       | IP address to set. Omit to auto-detect from request     |
| `key`      | No*      | API key for authentication (alternative to Basic auth)  |

\* Either `key` or a valid `Authorization: Basic` header must be present.

#### Example requests

```
# Query-parameter authentication, auto-detect IP
GET /update?hostname=home.example.com&key=mysecretkey

# Query-parameter authentication, explicit IPv4
GET /update?hostname=home.example.com&ip=203.0.113.42&key=mysecretkey

# Query-parameter authentication, explicit IPv6
GET /update?hostname=home.example.com&ip=2001:db8::1&key=mysecretkey

# Basic authentication (username is ignored; password is the API key)
GET /update?hostname=home.example.com
Authorization: Basic base64("anyuser:mysecretkey")
```

## Authentication

### HTTP Basic Authentication

- Header: `Authorization: Basic <base64(username:password)>`
- The **username** field is ignored (can be any value, e.g. the router model name).
- The **password** field must equal the `API_KEY` secret configured in the Worker.
- This enables compatibility with routers that only support standard HTTP Basic auth.

### Query Parameter Authentication

- Parameter: `?key=<api-key>`
- The value must equal the `API_KEY` secret configured in the Worker.
- Useful for routers that support custom DDNS URLs with token placeholders.

### Priority

If both an `Authorization` header and a `key` parameter are present, the `Authorization` header takes precedence. If neither is present, the request is rejected with `401 Unauthorized`.

## Environment Variables / Secrets

| Name           | Type    | Description                                              |
|----------------|---------|----------------------------------------------------------|
| `API_KEY`      | Secret  | Shared secret used to authenticate incoming requests     |
| `CF_API_TOKEN` | Secret  | Cloudflare API token with `Zone:DNS:Edit` permission     |
| `CF_ZONE_ID`   | Secret or Var | Cloudflare Zone ID for the target DNS zone         |

All three values must be set before the Worker will function. `CF_ZONE_ID` may be stored as a plain `[vars]` entry in `wrangler.toml` if the zone ID is not considered sensitive, or as a secret for stricter environments.

**Never store `API_KEY` or `CF_API_TOKEN` in `wrangler.toml` or source code.**

## IP Address Detection

The IP address to write into the DNS record is resolved in the following order:

1. **Query parameter `?ip=<address>`** — Explicit address provided by the client. Accepted as-is after validation.
2. **`CF-Connecting-IP` header** — Set by Cloudflare's edge for every inbound request. Reliable and cannot be spoofed by the client when the Worker is behind the Cloudflare proxy.
3. **`X-Forwarded-For` header** — The leftmost (first) address in the comma-separated list is used. This is a fallback for non-Cloudflare environments.

If none of these sources yields a valid IP address, the request is rejected with `400 Bad Request`.

### IP Version Detection

After the address is resolved, it is classified:
- Contains `:` → IPv6 → DNS record type `AAAA`
- Otherwise → IPv4 → DNS record type `A`

## DNS Record Update Flow

```
1. Resolve target IP and record type (A or AAAA)
2. Query Cloudflare API: GET /zones/{zone_id}/dns_records
      ?type=<A|AAAA>&name=<hostname>
3a. Record exists → PUT /zones/{zone_id}/dns_records/{record_id}
         body: { type, name, content: ip, ttl: 1, proxied: false }
3b. Record does not exist → POST /zones/{zone_id}/dns_records
         body: { type, name, content: ip, ttl: 1, proxied: false }
4. Return JSON response to client
```

`ttl: 1` means "auto" in Cloudflare's API. `proxied: false` ensures the record contains the real IP; set to `true` if Cloudflare proxying is desired (requires additional configuration outside this tool).

## Response Format

All responses are JSON with appropriate HTTP status codes.

### Success (`200 OK`)

```json
{
  "success": true,
  "message": "DNS record updated",
  "ip": "203.0.113.42",
  "type": "A"
}
```

### Error responses

| HTTP Status | `success` | Typical `message`                        |
|-------------|-----------|------------------------------------------|
| 400         | false     | "Missing hostname parameter"             |
| 400         | false     | "Invalid or missing IP address"          |
| 401         | false     | "Unauthorized"                           |
| 500         | false     | "Failed to update DNS record"            |

## Error Handling

- Authentication failures always return `401` with a generic message (no detail about which credential was wrong).
- Missing or malformed required parameters return `400`.
- Cloudflare API errors (non-2xx responses) are surfaced as `500` with a generic message; the raw error is logged via `console.error` for Workers trace inspection.
- Unexpected exceptions are caught at the top level and returned as `500`.

## Security Considerations

1. **Secret management**: `API_KEY` and `CF_API_TOKEN` are stored as Workers secrets (encrypted at rest, not visible in `wrangler.toml` or the dashboard).
2. **Minimal Cloudflare token scope**: The `CF_API_TOKEN` should be scoped to a single zone with only `Zone:DNS:Edit` permission.
3. **No user enumeration**: Authentication returns the same `401` response regardless of which credential failed.
4. **IP spoofing via query param**: The `?ip=` parameter allows a caller to set an arbitrary address. This is intentional (routers sometimes need to specify an address), but is gated behind authentication.
5. **HTTPS only**: Cloudflare Workers are always served over HTTPS, ensuring credentials are not transmitted in plaintext.
6. **No logging of secrets**: The Worker must never log `API_KEY`, `CF_API_TOKEN`, or the raw `Authorization` header value.
