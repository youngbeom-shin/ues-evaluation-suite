#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(dir, entry.name);
  return entry.isDirectory() ? [target, ...walk(target)] : [target];
});
const kit = path.join(root, "assets/report-kit");
assert.deepEqual(walk(root).filter((file) => path.basename(file) === "report-kit" && fs.statSync(file).isDirectory()), [kit],
  "the installed package must have one canonical report kit");

function checkReference(from, reference) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\{\{)/i.test(reference)) return;
  const target = path.resolve(path.dirname(from), decodeURIComponent(reference.split("#")[0]));
  assert.ok(fs.existsSync(target), `missing resource: ${path.relative(root, from)} -> ${reference}`);
}

// All stylesheet/script dependencies and CSS images must survive a whole-Skill copy.
for (const file of walk(kit).filter((file) => /\.(?:html|css)$/.test(file))) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/(?:href|src)="([^"]+)"/g)) checkReference(file, match[1]);
  for (const match of content.matchAll(/url\(["']?([^"')]+)["']?\)/g)) checkReference(file, match[1]);
}
const instructions = [
  "SKILL.md", "references/visual-report-system.md", "references/dashboard-report.md", "references/upstream-sources.md",
  "modules/page-performance-score/MODULE.md", "modules/page-performance-score/references/visual-report-system.md",
  "modules/page-performance-score/references/dashboard-report.md", "modules/page-performance-score/references/visual-report.md",
];
for (const relative of instructions) {
  const file = path.join(root, relative);
  for (const match of fs.readFileSync(file, "utf8").matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) checkReference(file, match[1]);
}

// Original branded images remain byte-for-byte traceable; the report uses a different asset.
const archived = {
  "persona-example.png": "fcf9c83b8a3719ae726abe58efefd894f7da2c07c272877968b66ebff305fc0d",
  "persona-framework.png": "bf708db46d2524557cd25fed3c5e518638b422108d1206baf586560bc40f864a",
  "report-banner.png": "f37e64575a4366534d8ad1e9be4bf2d27eed9bce0c750a168ab83944670f8940",
};
for (const [name, hash] of Object.entries(archived)) {
  const bytes = fs.readFileSync(path.join(root, "assets/upstream", name));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash, `historical material changed: ${name}`);
}
assert.ok(fs.existsSync(path.join(kit, "ues-banner-art.svg")));
assert.ok(!fs.existsSync(path.join(kit, "ues-banner-art.png")), "historical score image must not remain in the active report kit");
console.log("UES report resource checks passed (canonical kit, portable dependencies, documentation links and historical asset integrity).");
