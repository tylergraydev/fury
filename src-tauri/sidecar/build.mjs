import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const sidecarOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/claude-agent-sidecar.cjs",
  sourcemap: true,
  banner: {
    js: [
      '// Fury Claude Agent Sidecar',
      '// Bundled with esbuild — do not edit directly',
    ].join("\n"),
  },
  // Mark native modules as external — they can't be bundled
  external: [
    "fsevents",
    "@anthropic-ai/claude-agent-sdk",
  ],
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const browserMcpOptions = {
  entryPoints: ["src/fury-browser-mcp.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/fury-browser-mcp.mjs",
  sourcemap: true,
  banner: {
    js: [
      '// Fury Browser MCP Server',
      '// Bundled with esbuild — do not edit directly',
    ].join("\n"),
  },
  external: [],
  logLevel: "info",
};

if (isWatch) {
  const ctx1 = await esbuild.context(sidecarOptions);
  const ctx2 = await esbuild.context(browserMcpOptions);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(sidecarOptions),
    esbuild.build(browserMcpOptions),
  ]);
}
