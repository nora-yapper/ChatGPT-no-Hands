import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Do not generate AGENTS.md / CLAUDE.md boilerplate on dev start.
  agentRules: false,
  turbopack: { root: path.resolve(__dirname) },
  devIndicators: false,
};

export default nextConfig;
