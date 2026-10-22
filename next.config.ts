import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Don't advertise the framework in every response
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          isDev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Error reports go through this site, so the content policy and ad blockers
  // do not stop them (the proxy lets this path through, see proxy.ts)
  tunnelRoute: "/monitoring",
  // Readable stack traces need the upload token; without it the build just skips the upload
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
});
