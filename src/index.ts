import { authenticate } from "./auth";
import { detectIp } from "./ip";
import { upsertDnsRecord } from "./dns";

interface Env {
  API_KEY: string;
  CF_API_TOKEN: string;
  CF_ZONE_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // placeholder
    return new Response(JSON.stringify({ success: false, message: "not implemented" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  },
} satisfies ExportedHandler<Env>;
