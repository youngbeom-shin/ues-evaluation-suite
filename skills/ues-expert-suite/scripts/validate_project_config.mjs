#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { specialists } from "./resolve_scope.mjs";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const relativeFile = (value) => isText(value) && !/^(?:[a-z]:|[\\/])/i.test(value)
  && !value.split(/[\\/]/).some((part) => part === ".." || part === "" || part === ".");

export function validateProjectConfig(config) {
  const errors = [];
  const need = (ok, message) => { if (!ok) errors.push(message); };
  const object = (value, label) => {
    need(isObject(value), `${label} must be an object`);
    return isObject(value) ? value : {};
  };
  const array = (value, label) => {
    need(Array.isArray(value), `${label} must be an array`);
    return Array.isArray(value) ? value : [];
  };
  const texts = (value, label) => {
    const items = array(value, label);
    need(items.every(isText) && new Set(items).size === items.length, `${label} must contain unique nonempty strings`);
    return items;
  };
  const nullableText = (value, label) => need(value === null || isText(value), `${label} must be nonempty text or null`);
  const oneOf = (value, choices, label) => need(choices.includes(value), `${label} must be one of ${choices.join(", ")}`);
  const records = (value, label) => array(value, label).map((item, index) => object(item, `${label}[${index}]`));
  const uniqueIds = (items, label) => {
    need(items.every((item) => isText(item.id)) && new Set(items.map((item) => item.id)).size === items.length,
      `${label} must have unique nonempty ids`);
  };

  const c = object(config, "config");
  const fields = ["schema_version", "id", "version", "product", "target", "sources", "tasks", "support_matrix", "rule_mappings", "authorization", "delivery", "open_questions"];
  for (const key of Object.keys(c)) need(fields.includes(key), `unsupported config field: ${key}`);
  need(c.schema_version === "ues-project-config/0.1", "schema_version must be ues-project-config/0.1");
  need(typeof c.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.id), "id must be a lowercase hyphenated identifier");
  need(Number.isInteger(c.version) && c.version > 0, "version must be a positive integer");

  const product = object(c.product, "product");
  for (const field of ["name", "summary"]) nullableText(product[field], `product.${field}`);
  for (const value of texts(product.platforms, "product.platforms")) oneOf(value, ["web", "mobile", "desktop", "other", "unknown"], "product.platforms item");
  for (const value of texts(product.product_type, "product.product_type")) oneOf(value, ["narrative", "exploration", "task_system", "unknown"], "product.product_type item");
  oneOf(product.development_stage, ["concept", "wireframe", "visual_design", "interactive_prototype", "development_demo", "pre_release", "production", "unknown"], "product.development_stage");
  texts(product.target_users, "product.target_users");
  const target = object(c.target, "target");
  nullableText(target.version, "target.version");
  nullableText(target.base_url, "target.base_url");
  if (isText(target.base_url)) {
    try {
      const url = new URL(target.base_url);
      need(["http:", "https:"].includes(url.protocol) && !url.username && !url.password, "target.base_url must be HTTP(S) without embedded credentials");
    } catch { errors.push("target.base_url must be a valid URL"); }
  }

  const sources = records(c.sources, "sources");
  uniqueIds(sources, "sources");
  for (const source of sources) {
    need(relativeFile(source.path), `sources.${source.id}.path must be a file path relative to the product source root`);
    oneOf(source.kind, ["product", "interaction", "components", "tokens", "development", "process", "design", "accessibility", "glossary", "other"], `sources.${source.id}.kind`);
    oneOf(source.authority, ["normative", "reference"], `sources.${source.id}.authority`);
    nullableText(source.version, `sources.${source.id}.version`);
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const tasks = records(c.tasks, "tasks");
  uniqueIds(tasks, "tasks");
  for (const task of tasks) {
    for (const field of ["role", "goal", "entry", "success_outcome", "basis"]) need(isText(task[field]), `tasks.${task.id}.${field} must be nonempty text`);
    for (const field of ["preconditions", "evidence_requirements"]) texts(task[field], `tasks.${task.id}.${field}`);
    for (const id of texts(task.basis_source_ids, `tasks.${task.id}.basis_source_ids`)) need(sourceIds.has(id), `tasks.${task.id} references unknown source: ${id}`);
  }

  const matrix = object(c.support_matrix, "support_matrix");
  oneOf(matrix.status, ["proposed", "declared"], "support_matrix.status");
  for (const field of ["browsers", "locales", "themes", "states", "content_samples"]) texts(matrix[field], `support_matrix.${field}`);
  for (const viewport of records(matrix.viewports, "support_matrix.viewports")) {
    for (const field of ["width", "height"]) need(Number.isInteger(viewport[field]) && viewport[field] > 0, `viewport.${field} must be a positive integer`);
  }
  const zooms = array(matrix.zoom_percent, "support_matrix.zoom_percent");
  need(zooms.every((value) => Number.isFinite(value) && value > 0) && new Set(zooms).size === zooms.length, "support_matrix.zoom_percent must contain unique positive numbers");
  const mappings = records(c.rule_mappings, "rule_mappings");
  need(new Set(mappings.map((item) => `${item.source_id}:${item.rule_id}`)).size === mappings.length, "rule_mappings must have unique source_id/rule_id pairs");
  for (const mapping of mappings) {
    need(isText(mapping.rule_id) && isText(mapping.focus), "rule_mappings require nonempty rule_id and focus");
    need(sourceIds.has(mapping.source_id), `rule_mappings.${mapping.rule_id} references unknown source: ${mapping.source_id}`);
    const names = texts(mapping.specialists, `rule_mappings.${mapping.rule_id}.specialists`);
    need(names.length > 0 && names.every((name) => specialists.includes(name)), `rule_mappings.${mapping.rule_id} requires known specialists`);
  }
  const authorization = object(c.authorization, "authorization");
  need(authorization.baseline === "read_only", "authorization.baseline must be read_only; configuration does not grant execution permission");
  texts(authorization.requires_explicit_authorization, "authorization.requires_explicit_authorization");
  const delivery = object(c.delivery, "delivery");
  const formats = texts(delivery.formats, "delivery.formats");
  need(formats.length > 0 && formats.every((format) => ["html", "markdown", "json"].includes(format)), "delivery.formats must select html, markdown or json");
  nullableText(delivery.destination, "delivery.destination");
  if (delivery.report_brand !== undefined) nullableText(delivery.report_brand, "delivery.report_brand");
  texts(c.open_questions, "open_questions");
  return errors;
}

export function inspectProjectConfig(config, projectRoot) {
  const errors = validateProjectConfig(config);
  if (errors.length) return { configuration_valid: false, errors, pending_inputs: [], source_checks: [] };
  const pending = [];
  for (const field of ["name", "summary"]) if (config.product[field] === null) pending.push(`product.${field}`);
  for (const field of ["platforms", "product_type", "target_users"]) if (!config.product[field].length || config.product[field].includes("unknown")) pending.push(`product.${field}`);
  if (config.product.development_stage === "unknown") pending.push("product.development_stage");
  for (const field of ["version", "base_url"]) if (config.target[field] === null) pending.push(`target.${field}`);
  if (!config.tasks.length) pending.push("tasks");
  else pending.push("run.task_contract_confirmation");
  if (config.support_matrix.status === "proposed") pending.push("run.support_matrix_selection");
  if (!config.support_matrix.browsers.length) pending.push("support_matrix.browsers");
  if (!config.sources.length) pending.push("sources");
  if (config.delivery.destination === null) pending.push("delivery.destination");
  const root = projectRoot ? fs.realpathSync(projectRoot) : null;
  const sourceChecks = config.sources.map((source) => {
    const result = { id: source.id, path: source.path, status: "unchecked", sha256: null };
    if (!root) return result;
    const target = path.resolve(root, ...source.path.split(/[\\/]/));
    if (!fs.existsSync(target)) return { ...result, status: "missing" };
    const resolved = fs.realpathSync(target);
    const relative = path.relative(root, resolved);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return { ...result, status: "outside_root" };
    if (!fs.statSync(resolved).isFile()) return { ...result, status: "not_a_file" };
    return { ...result, status: "available", sha256: crypto.createHash("sha256").update(fs.readFileSync(resolved)).digest("hex") };
  });
  for (const source of sourceChecks) if (source.status !== "available") pending.push(`sources.${source.id}:${source.status}`);
  return {
    configuration_valid: true, config_id: config.id, config_version: config.version,
    errors: [], pending_inputs: pending, source_checks: sourceChecks,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    if (!(args.length === 1 || (args.length === 3 && args[1] === "--project-root")) || args[0].startsWith("--")) {
      throw new Error("Usage: node validate_project_config.mjs <config.json> [--project-root <product-source-root>]");
    }
    const result = inspectProjectConfig(JSON.parse(fs.readFileSync(args[0], "utf8")), args[2]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.configuration_valid) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
