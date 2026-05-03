import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          API_KEY: "test-api-key",
          CF_API_TOKEN: "test-cf-token",
          CF_ZONE_ID: "test-zone-id",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
