import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  experimental: {
    // Lead uploads are Apollo .xlsx workbooks that run to a few MB each.
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default config;
