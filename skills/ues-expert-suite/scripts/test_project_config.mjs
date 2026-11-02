#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectProjectConfig, validateProjectConfig } from "./validate_project_config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(scriptDir, "../assets/project-config");
const load = (name) => JSON.parse(fs.readFileSync(path.join(configDir, name), "utf8"));
const template = load("template.json");
const pilot = load("csgclaw.json");
assert.deepEqual(validateProjectConfig(template), []);
assert.deepEqual(validateProjectConfig(pilot), []);
assert.equal(template.product.name, null);
assert.deepEqual(template.sources, []);
assert.deepEqual(template.rule_mappings, []);
assert.ok(inspectProjectConfig(template).pending_inputs.includes("tasks"));
const pilotInspection = inspectProjectConfig(pilot);
assert.equal(pilotInspection.configuration_valid, true);
assert.ok(pilotInspection.pending_inputs.includes("run.task_contract_confirmation"));
assert.ok(pilotInspection.pending_inputs.includes("target.base_url"));
assert.ok(pilotInspection.source_checks.every((source) => source.status === "unchecked"));

const invalid = (change, message) => {
  const config = structuredClone(pilot);
  change(config);
  assert.ok(validateProjectConfig(config).some((error) => error.includes(message)), message);
};
invalid((c) => { c.schema_version = "unknown"; }, "schema_version");
invalid((c) => { c.version = 0; }, "version");
invalid((c) => { c.product = null; }, "product");
invalid((c) => { c.product.platforms = ["console"]; }, "platforms");
invalid((c) => { c.product.development_stage = "looks_finished"; }, "development_stage");
invalid((c) => { c.target.base_url = "file:///private/file"; }, "HTTP(S)");
invalid((c) => { c.target.base_url = "https://user:secret@example.com"; }, "credentials");
invalid((c) => { c.target.base_url = "not a URL"; }, "valid URL");
invalid((c) => { c.sources.push(c.sources[0]); }, "unique nonempty ids");
for (const file of ["../outside.md", "/tmp/file", "C:\\project\\file", "..\\outside.md"]) {
  invalid((c) => { c.sources[0].path = file; }, "relative to the product source root");
}
invalid((c) => { c.tasks[0].basis_source_ids = ["absent"]; }, "unknown source");
invalid((c) => { c.tasks[0].success_outcome = ""; }, "success_outcome");
invalid((c) => { c.tasks.push(c.tasks[0]); }, "unique nonempty ids");
invalid((c) => { c.support_matrix.viewports[0].width = -1; }, "viewport.width");
invalid((c) => { c.support_matrix.zoom_percent = [0]; }, "zoom_percent");
invalid((c) => { c.rule_mappings[0].source_id = "absent"; }, "unknown source");
invalid((c) => { c.rule_mappings[0].specialists = ["other-suite"]; }, "known specialists");
invalid((c) => { c.rule_mappings.push(c.rule_mappings[0]); }, "unique source_id/rule_id");
invalid((c) => { c.authorization.baseline = "write_allowed"; }, "does not grant execution permission");
invalid((c) => { c.delivery.formats = []; }, "delivery.formats");
invalid((c) => { c.delivery.report_brand = 123; }, "delivery.report_brand");
const legacyConfig = structuredClone(template);
delete legacyConfig.delivery.report_brand;
assert.deepEqual(validateProjectConfig(legacyConfig), [], "report branding is optional for existing configs");
invalid((c) => { c.weights = { performance: 1 }; }, "unsupported config field");
for (const config of [null, [], {}, { tasks: [null], sources: [null], rule_mappings: [null] }]) {
  assert.equal(inspectProjectConfig(config).configuration_valid, false);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ues-project-config-"));
try {
  const root = path.join(temp, "product");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "standard.md"), "source version one\n");
  const config = structuredClone(template);
  config.sources = [{ id: "standard", path: "standard.md", kind: "interaction", authority: "normative", version: null }];
  let result = inspectProjectConfig(config, root);
  assert.equal(result.source_checks[0].status, "available");
  const originalHash = result.source_checks[0].sha256;
  assert.match(originalHash, /^[a-f0-9]{64}$/);
  fs.writeFileSync(path.join(root, "standard.md"), "source version two\n");
  assert.notEqual(inspectProjectConfig(config, root).source_checks[0].sha256, originalHash);
  fs.unlinkSync(path.join(root, "standard.md"));
  result = inspectProjectConfig(config, root);
  assert.equal(result.configuration_valid, true, "missing runtime inputs do not make a portable config structurally invalid");
  assert.equal(result.source_checks[0].status, "missing");
  assert.ok(result.pending_inputs.includes("sources.standard:missing"));
  fs.mkdirSync(path.join(root, "standard.md"));
  assert.equal(inspectProjectConfig(config, root).source_checks[0].status, "not_a_file");
  fs.rmdirSync(path.join(root, "standard.md"));
  if (process.platform !== "win32") {
    const outside = path.join(temp, "outside.md");
    fs.writeFileSync(outside, "outside source root\n");
    fs.symlinkSync(outside, path.join(root, "standard.md"));
    assert.equal(inspectProjectConfig(config, root).source_checks[0].status, "outside_root");
  }
  const cli = (args) => spawnSync(process.execPath, [path.join(scriptDir, "validate_project_config.mjs"), ...args], { encoding: "utf8" });
  const success = cli([path.join(configDir, "csgclaw.json"), "--project-root", root]);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).source_checks[0].status, "missing");
  const invalidFile = path.join(temp, "invalid.json");
  fs.writeFileSync(invalidFile, "{}");
  const failure = cli([invalidFile]);
  assert.equal(failure.status, 1);
  assert.equal(JSON.parse(failure.stdout).configuration_valid, false);
  assert.equal(cli([]).status, 1);
  assert.equal(cli([path.join(configDir, "template.json"), "--unexpected"]).status, 1);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log("UES project configuration tests passed (portable inputs, references, pending context, source hashes, CLI and invalid cases).");
