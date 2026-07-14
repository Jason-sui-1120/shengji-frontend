#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedEntries = ["app/App.tsx", "components", "lib", "styles.css", "types.ts"];
const sourceName = "Jason-sui-1120/shengji-frontend";

function usage(message) {
  if (message) console.error(`错误：${message}\n`);
  console.error("用法：node scripts/sync-frontends.mjs --public <公网仓库> --company <公司仓库> [--check] [--build]");
  process.exit(1);
}

function parseArgs(argv) {
  const options = { check: false, build: false, publicRepo: "", companyRepo: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--build") options.build = true;
    else if (arg === "--public") options.publicRepo = argv[++index] || "";
    else if (arg === "--company") options.companyRepo = argv[++index] || "";
    else usage(`不认识的参数 ${arg}`);
  }
  if (!options.publicRepo || !options.companyRepo) usage("必须同时提供 --public 和 --company");
  return options;
}

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isNested(path, possibleParent) {
  const result = relative(possibleParent, path);
  return result === "" || (!result.startsWith(`..${sep}`) && result !== "..");
}

async function collectHashes(root, current = root, result = {}) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      await collectHashes(root, fullPath, result);
    } else if (entry.isFile()) {
      const content = await readFile(fullPath);
      result[relative(root, fullPath).split(sep).join("/")] = createHash("sha256").update(content).digest("hex");
    }
  }
  return result;
}

async function sharedFileHashes() {
  const hashes = {};
  for (const entry of sharedEntries) {
    const entryPath = resolve(sourceRoot, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      Object.assign(hashes, await collectHashes(sourceRoot, entryPath));
    } else {
      hashes[entry] = createHash("sha256").update(await readFile(entryPath)).digest("hex");
    }
  }
  return Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)));
}

function targetDefinition(kind, repoPath) {
  const repo = resolve(repoPath);
  return kind === "public"
    ? { kind, repo, destination: resolve(repo, "src"), buildCwd: repo }
    : { kind, repo, destination: resolve(repo, "front/src"), buildCwd: resolve(repo, "front") };
}

async function assertSafeTarget(target) {
  if (!await exists(target.repo)) usage(`${target.kind} 仓库不存在：${target.repo}`);
  if (isNested(sourceRoot, target.repo) || isNested(target.repo, sourceRoot)) {
    usage(`共享源码和 ${target.kind} 目标目录不能互相嵌套；请从独立 clone 运行本脚本`);
  }
  if (target.kind === "public" && await exists(resolve(target.destination, "shared/.git"))) {
    usage("公网仓库仍是 git submodule。请先移除 src/shared 子模块和 .gitmodules，再执行同步。");
  }
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function targetFileMap(target, sourceHashes) {
  const files = {};
  for (const [source, hash] of Object.entries(sourceHashes)) {
    if (source === "app/App.tsx") {
      const sourceContent = await readFile(resolve(sourceRoot, source), "utf8");
      const content = target.kind === "company"
        ? sourceContent.replaceAll('"./shared/', '"./').replaceAll("'./shared/", "'./")
        : sourceContent;
      files["App.tsx"] = { source, hash: hashContent(content), content };
    } else if (target.kind === "company") {
      files[source] = { source, hash };
    } else if (source === "styles.css") {
      files["styles.css"] = { source, hash };
    } else if (source === "types.ts") {
      files["types.ts"] = { source, hash };
      files["shared/types.ts"] = { source, hash };
    } else {
      files[`shared/${source}`] = { source, hash };
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

function metadata(revision, files, target) {
  return {
    schemaVersion: 1,
    source: sourceName,
    revision,
    layout: target.kind === "public" ? "src/shared components + src root assets" : "front/src",
    files: Object.fromEntries(Object.entries(files).map(([destination, item]) => [destination, item.hash])),
  };
}

async function syncTarget(target, revision, hashes) {
  await mkdir(target.destination, { recursive: true });
  const files = await targetFileMap(target, hashes);
  const managedDirectories = target.kind === "public" ? ["shared/components", "shared/lib"] : ["components", "lib"];
  for (const directory of managedDirectories) {
    await rm(resolve(target.destination, directory), { recursive: true, force: true });
  }
  if (target.kind === "public") await rm(resolve(target.destination, "shared/styles.css"), { force: true });
  for (const [destination, item] of Object.entries(files)) {
    const destinationPath = resolve(target.destination, destination);
    await mkdir(dirname(destinationPath), { recursive: true });
    if (item.content !== undefined) await writeFile(destinationPath, item.content);
    else await cp(resolve(sourceRoot, item.source), destinationPath);
  }
  await writeFile(resolve(target.repo, "frontend-sync.json"), `${JSON.stringify(metadata(revision, files, target), null, 2)}\n`);
  console.log(`已同步 ${target.kind}：${revision.slice(0, 12)}`);
}

async function checkTarget(target, revision, hashes) {
  const metadataPath = resolve(target.repo, "frontend-sync.json");
  if (!await exists(metadataPath)) return `${target.kind} 缺少 frontend-sync.json`;
  let saved;
  try {
    saved = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    return `${target.kind} 的 frontend-sync.json 无法解析`;
  }
  const files = await targetFileMap(target, hashes);
  if (saved.revision !== revision) return `${target.kind} 记录的共享版本不是 ${revision.slice(0, 12)}`;
  if (JSON.stringify(saved.files) !== JSON.stringify(metadata(revision, files, target).files)) return `${target.kind} 的校验清单已过期`;
  for (const [destination, item] of Object.entries(files)) {
    const path = resolve(target.destination, destination);
    if (!await exists(path)) return `${target.kind} 缺少 ${destination}`;
    const actual = createHash("sha256").update(await readFile(path)).digest("hex");
    if (actual !== item.hash) return `${target.kind} 的 ${destination} 与共享源不一致`;
  }
  return null;
}

async function buildTarget(target) {
  console.log(`构建 ${target.kind} 前端…`);
  await execFileAsync("npm", ["run", "build"], { cwd: target.buildCwd, stdio: "inherit" });
}

const options = parseArgs(process.argv.slice(2));
const targets = [
  targetDefinition("public", options.publicRepo),
  targetDefinition("company", options.companyRepo),
];

for (const target of targets) await assertSafeTarget(target);
if (await git(["status", "--porcelain"], sourceRoot)) usage("共享源码有未提交改动；请先提交，确保版本可追溯。");

const revision = await git(["rev-parse", "HEAD"], sourceRoot);
const hashes = await sharedFileHashes();

if (options.check) {
  const failures = (await Promise.all(targets.map((target) => checkTarget(target, revision, hashes)))).filter(Boolean);
  if (failures.length) {
    console.error(failures.map((failure) => `不同步：${failure}`).join("\n"));
    process.exit(2);
  }
  console.log(`两端共享前端一致：${revision.slice(0, 12)}`);
} else {
  for (const target of targets) await syncTarget(target, revision, hashes);
}

if (options.build) {
  for (const target of targets) await buildTarget(target);
}
