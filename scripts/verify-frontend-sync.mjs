#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const sourceDirectory = options.kind === "public" ? "src" : "front/src";
const manifestPath = resolve(repoRoot, "frontend-sync.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !manifest.revision || !manifest.source || !manifest.files || typeof manifest.files !== "object") {
    throw new Error("frontend-sync.json 格式不完整");
  }
  if (!manifest.guardHash) throw new Error("frontend-sync.json 缺少 guardHash，请重新执行双端同步");

  const ownHash = hash(await readFile(fileURLToPath(import.meta.url)));
  if (ownHash !== manifest.guardHash) throw new Error("同步校验脚本与清单不一致，请重新执行双端同步");

  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    const fullPath = resolve(repoRoot, sourceDirectory, relativePath);
    const actualHash = hash(await readFile(fullPath));
    if (actualHash !== expectedHash) throw new Error(`共享文件漂移：${sourceDirectory}/${relativePath}`);
  }
  console.log(`前端同步门禁通过：${options.kind} / ${manifest.revision.slice(0, 12)}`);
} catch (error) {
  console.error(`前端同步门禁失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

function parseArgs(argv) {
  const kindIndex = argv.indexOf("--kind");
  const kind = kindIndex >= 0 ? argv[kindIndex + 1] : "";
  if (kind !== "public" && kind !== "company") {
    console.error("用法：node scripts/verify-frontend-sync.mjs --kind <public|company>");
    process.exit(1);
  }
  return { kind };
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}
