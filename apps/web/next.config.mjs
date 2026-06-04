import { join } from "node:path";

// Friendly-host support: allow server actions from the launcher's host alias
// (e.g. research-assistant:3000) in addition to localhost.
const raHost = process.env.RA_HOST || "research-assistant";
const raPort = process.env.RA_PORT || "80";
const raInternal = process.env.RA_INTERNAL_PORT || raPort;
const allowedOrigins = [
  ...new Set([
    raHost, // bare host (port 80 omitted by browsers behind the proxy)
    `${raHost}:${raPort}`,
    `${raHost}:${raInternal}`,
    `localhost:${raInternal}`,
    `127.0.0.1:${raInternal}`,
    "localhost:3000",
  ]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root (multiple lockfiles exist on this machine).
  outputFileTracingRoot: join(import.meta.dirname, "../../"),
  experimental: { serverActions: { allowedOrigins } },
  // @lob/core is consumed as TS source; transpile it through Next.
  transpilePackages: ["@lob/core"],
  // Heavy server-only parsers — don't bundle them, load at runtime.
  serverExternalPackages: ["mammoth", "unpdf"],
  webpack: (config) => {
    // Resolve NodeNext ".js" import specifiers to their ".ts" sources.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
