#!/usr/bin/env node
//
// FALLBACK for hosts that cannot run `next build` safely.
//
//   node scripts/assemble-standalone-from-build.mjs <project-dir> <output-dir>
//
// Produces the same layout `next build` writes to .next/standalone (server.js,
// .next/, a traced node_modules, public/), but from an EXISTING production
// build in <project-dir>/.next instead of compiling anything. It runs Next's
// own copyTracedFiles() over the nft trace files that every `next build`
// already leaves in .next, so the app code is byte-for-byte the build that
// is already running.
//
// Nothing under <project-dir> is written: the build output is copied to a
// scratch directory first and node_modules is only read through a symlink.
//
// This calls a Next internal (next/dist/build/utils). It is pinned to the
// installed Next version by design: if that version changes, prefer a real
// `next build` with output: "standalone" (scripts/deploy.sh) and treat this
// script as unsupported until it has been re-verified with scripts/smoke-test.sh.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg || !outArg) {
  console.error("usage: assemble-standalone-from-build.mjs <project-dir> <output-dir>");
  process.exit(2);
}
const src = path.resolve(srcArg);
const out = path.resolve(outArg);

const die = (msg) => {
  console.error(`assemble: ${msg}`);
  process.exit(1);
};

if (fs.existsSync(out)) die(`${out} already exists; refusing to overwrite`);
const builtNext = path.join(src, ".next");
if (!fs.existsSync(path.join(builtNext, "BUILD_ID"))) die(`${builtNext} is not a production build (no BUILD_ID)`);
if (!fs.existsSync(path.join(src, "node_modules", "next"))) die(`no node_modules/next in ${src}`);

const requireFromProject = createRequire(path.join(src, "package.json"));
const { copyTracedFiles } = requireFromProject("next/dist/build/utils");
if (typeof copyTracedFiles !== "function") die("this Next version does not export copyTracedFiles; use a real next build");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const requiredServerFiles = readJson(path.join(builtNext, "required-server-files.json"));
const middlewareManifest = readJson(path.join(builtNext, "server", "middleware-manifest.json"));
const appPaths = Object.keys(readJson(path.join(builtNext, "server", "app-paths-manifest.json")));
const hasNodeMiddleware = fs.existsSync(path.join(builtNext, "server", "middleware.js.nft.json"));
const hasInstrumentationHook = fs.existsSync(path.join(builtNext, "server", "instrumentation.js.nft.json"));

// Scratch project: a copy of .next (no cache), package.json, and a read-only
// symlink to the real node_modules so trace paths resolve identically.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "compass-assemble-"));
const dir = path.join(scratch, "app");
fs.mkdirSync(dir);
try {
  const skip = new Set(["cache", "standalone", "diagnostics", "trace", "dev"]);
  fs.cpSync(builtNext, path.join(dir, ".next"), {
    recursive: true,
    verbatimSymlinks: true,
    filter: (from) => !(path.dirname(from) === builtNext && skip.has(path.basename(from))),
  });
  fs.copyFileSync(path.join(src, "package.json"), path.join(dir, "package.json"));
  fs.symlinkSync(path.join(src, "node_modules"), path.join(dir, "node_modules"));

  const distDir = path.join(dir, ".next");
  const serverConfig = { ...requiredServerFiles.config, output: "standalone" };

  await copyTracedFiles(
    dir, distDir,
    [],            // pages-router pages: none besides static 404/500
    appPaths,      // every app route
    dir,           // tracing root = project dir, so the output is not nested
    serverConfig, middlewareManifest,
    hasNodeMiddleware, hasInstrumentationHook,
    new Set(),
  );

  // A build made WITHOUT output: "standalone" never traced the entry points
  // that standalone's server.js loads (next, start-server, require-hook, and
  // the jest-worker children), so copyTracedFiles above cannot have found
  // them. Trace just those with Next's own bundled tracer. Anything extra
  // this pulls in is unused JavaScript, never a behaviour change.
  const standalone = path.join(distDir, "standalone");
  const { nodeFileTrace } = requireFromProject("next/dist/compiled/@vercel/nft");
  const standaloneOnlyEntries = [
    "next/dist/server/lib/start-server",
    "next/dist/server/next",
    "next/dist/server/require-hook",
    "next/dist/compiled/jest-worker/processChild",
    "next/dist/compiled/jest-worker/threadChild",
  ].map((e) => requireFromProject.resolve(e));
  const ignored = [
    /\.d\.ts$/, /\.map$/, /next\/dist\/pages\//,
    /next\/dist\/compiled\/next-server\/.*\.dev\.js$/, /next\/dist\/compiled\/webpack\//,
    /node_modules\/react(-dom)?\/.*\.development\.js$/,
  ];
  const traced = await nodeFileTrace(standaloneOnlyEntries, {
    base: src, processCwd: src, mixedModules: true, ignore: (p) => ignored.some((re) => re.test(p)),
  });
  let extraFiles = 0;
  for (const rel of new Set([...traced.fileList, ...(traced.esmFileList ?? [])])) {
    const from = path.join(src, rel);
    const to = path.join(standalone, rel);
    if (fs.existsSync(to) || !fs.existsSync(from) || fs.statSync(from).isDirectory()) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    extraFiles++;
  }
  console.log(`standalone-only server entries: added ${extraFiles} files`);

  // The rest of Next's writeStandaloneDirectory().
  const extra = [...requiredServerFiles.files, path.join(requiredServerFiles.config.distDir, "required-server-files.json")];
  for (const file of extra) {
    const from = path.join(dir, file);
    if (!fs.existsSync(from)) continue;
    const to = path.join(standalone, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  if (hasNodeMiddleware) {
    fs.mkdirSync(path.join(standalone, ".next", "server"), { recursive: true });
    fs.copyFileSync(path.join(distDir, "server", "middleware.js"), path.join(standalone, ".next", "server", "middleware.js"));
  }
  for (const sub of ["pages", "app"]) {
    const from = path.join(distDir, "server", sub);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(standalone, ".next", "server", sub), { recursive: true, verbatimSymlinks: true, force: true });
  }

  // What `next build` leaves for the operator to place next to server.js.
  fs.cpSync(path.join(builtNext, "static"), path.join(standalone, ".next", "static"), { recursive: true });
  if (fs.existsSync(path.join(src, "public"))) fs.cpSync(path.join(src, "public"), path.join(standalone, "public"), { recursive: true });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.cpSync(standalone, out, { recursive: true, verbatimSymlinks: true });
  console.log(`assembled ${out}`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
