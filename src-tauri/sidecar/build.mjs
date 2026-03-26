import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/claude-agent-sidecar.js",
  sourcemap: true,
  banner: {
    js: [
      '// Fury Claude Agent Sidecar',
      '// Bundled with esbuild — do not edit directly',
      'import { createRequire } from "module";',
      'const require = createRequire(import.meta.url);',
    ].join("\n"),
  },
  // Mark native modules as external — they can't be bundled
  external: [
    "fsevents",
  ],
  logLevel: "info",
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
