import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep tracing scoped to the landing project when the monorepo parent also
  // contains a lockfile; this prevents Next from selecting /Users/devin/code
  // as the workspace root during build and deployment.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
