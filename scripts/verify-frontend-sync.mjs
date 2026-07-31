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
    const publicDirectory = options.kind === "public" ? "public" : "front/public";
    const fullPath = relativePath.startsWith("$root/")
      ? resolve(repoRoot, relativePath.slice("$root/".length))
      : relativePath.startsWith("$public/")
        ? resolve(repoRoot, publicDirectory, relativePath.slice("$public/".length))
        : resolve(repoRoot, sourceDirectory, relativePath);
    const actualHash = hash(await readFile(fullPath));
    if (actualHash !== expectedHash) throw new Error(`共享文件漂移：${relativePath}`);
  }

  // 哈希一致不代表 build 通过——import 路径可能解析失败（公网端 App.tsx import ./components/
  // 与实际文件 src/shared/components/ 路径不匹配时，哈希一致但 build 报错）。
  // --build 参数时跑 npm run build 验证 import 路径解析成功。
  if (options.build) {
    const { spawn } = await import("node:child_process");
    const buildCwd = options.kind === "public" ? repoRoot : resolve(repoRoot, "front");
    const build = spawn("npm", ["run", "build"], { cwd: buildCwd, stdio: "pipe", shell: true });
    let buildOutput = "";
    build.stdout.on("data", (d) => { buildOutput += d; });
    build.stderr.on("data", (d) => { buildOutput += d; });
    const buildExit = await new Promise((r) => build.on("close", r));
    if (buildExit !== 0) {
      throw new Error(`build 失败（import 路径解析错误）：\n${buildOutput.slice(-500)}`);
    }
  }

  console.log(`前端同步门禁通过：${options.kind} / ${manifest.revision.slice(0, 12)}${options.build ? "（含 build 验证）" : ""}`);
} catch (error) {
  console.error(`前端同步门禁失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

function parseArgs(argv) {
  const kindIndex = argv.indexOf("--kind");
  const kind = kindIndex >= 0 ? argv[kindIndex + 1] : "";
  if (kind !== "public" && kind !== "company") {
    console.error("用法：node scripts/verify-frontend-sync.mjs --kind <public|company> [--build]");
    process.exit(1);
  }
  return { kind, build: argv.includes("--build") };
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}
