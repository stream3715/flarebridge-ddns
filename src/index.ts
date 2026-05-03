import { authenticate } from "./auth";
import { detectIp } from "./ip";
import { upsertDnsRecord } from "./dns";

interface Env {
  API_KEY: string;
  CF_API_TOKEN: string;
  CF_ZONE_ID: string;
}

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!authenticate(request, env.API_KEY)) {
        return jsonResponse({ success: false, message: "Unauthorized" }, 401);
      }

      const url = new URL(request.url);

      if (url.pathname !== "/update") {
        return jsonResponse({ success: false, message: "Not found" }, 404);
      }

      const hostname = url.searchParams.get("hostname");
      if (hostname === null || hostname.trim() === "") {
        return jsonResponse({ success: false, message: "Missing hostname parameter" }, 400);
      }
      const trimmedHostname = hostname.trim();
      // A valid hostname label is 1-63 characters of [a-zA-Z0-9-], and the
      // full FQDN must not exceed 253 characters.
      const HOSTNAME_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
      if (trimmedHostname.length > 253 || !HOSTNAME_RE.test(trimmedHostname)) {
        return jsonResponse({ success: false, message: "Invalid hostname parameter" }, 400);
      }

      const ipInfo = detectIp(request, url);
      if (ipInfo === null) {
        return jsonResponse({ success: false, message: "Invalid or missing IP address" }, 400);
      }

      const recordType = ipInfo.version === "v6" ? "AAAA" : "A";
      const result = await upsertDnsRecord(
        env.CF_API_TOKEN,
        env.CF_ZONE_ID,
        trimmedHostname,
        ipInfo.address,
        recordType
      );

      if (!result.success) {
        return jsonResponse({ success: false, message: result.message }, 500);
      }

      return jsonResponse(
        { success: true, message: result.message, ip: ipInfo.address, type: recordType },
        200
      );
    } catch (err) {
      console.error("Unhandled error:", err);
      return jsonResponse({ success: false, message: "Internal server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
