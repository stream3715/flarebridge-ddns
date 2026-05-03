import { defineConfig } from "vitest/config";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            API_KEY: "test-api-key",
            CF_API_TOKEN: "test-cf-token",
            CF_ZONE_ID: "test-zone-id",
          },
        },
      },
    },
  },
});
