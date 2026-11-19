import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  experimental: {
    // Lead uploads are Apollo .xlsx workbooks that run to a few MB each.
    serverActions: { bodySizeLimit: "30mb" },
    // Reuse a page's data for 30 s when you go back to it (changes you make still refresh it straight away).
    staleTimes: { dynamic: 30 },
    // Shared hosting (Hostinger) limits how many processes a build may start: Turbopack's helper processes were
    // killed mid-build. Production builds use Webpack (package.json "build": --webpack) and stay in one process.
    webpackBuildWorker: false,
    cpus: 1,
  },
};

export default config;
