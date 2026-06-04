import { join } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root (multiple lockfiles exist on this machine).
  outputFileTracingRoot: join(import.meta.dirname, "../../"),
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
