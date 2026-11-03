#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { metadata, safeRelative, sourceFile, references, localReference, sha256, verifyPackage } from './report_publication.mjs';

export function packageReport({ input, entry, meta, out, include = [] }) {
  const details = metadata(meta);
  const root = fs.realpathSync(input);
  safeRelative(entry);
  if (!/\.html?$/i.test(entry)) throw Error('Entry must be HTML');
  const destination = path.resolve(out, details.project_id, details.run_id);
  if (fs.existsSync(destination)) throw Error(`Run already exists; use a new run_id: ${destination}`);
  if (path.resolve(out) === root || path.resolve(out).startsWith(root + path.sep)) throw Error('Output must be outside the source report directory');
  const queue = [entry, ...include];
  const selected = new Map();
  while (queue.length) {
    const relative = safeRelative(queue.shift());
    if (relative === 'publication.json') throw Error('publication.json is reserved');
    if (selected.has(relative)) continue;
    const bytes = fs.readFileSync(sourceFile(root, relative));
    selected.set(relative, bytes);
    for (const ref of references(relative, bytes)) {
      const target = localReference(relative, ref);
      if (target) queue.push(target);
    }
  }
  const manifest = { schema_version: 'ues-publication/0.1', ...details, entry,
    files: [...selected].sort(([a],[b]) => a.localeCompare(b)).map(([name, bytes]) => ({path: name, sha256: sha256(bytes), bytes: bytes.length})) };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.publication-'));
  try {
    for (const [relative, bytes] of selected) {
      const target = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(path.join(temporary, 'publication.json'), JSON.stringify(manifest, null, 2) + '\n');
    verifyPackage(temporary);
    fs.renameSync(temporary, destination);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  return {destination, manifest};
}
export function runPackageCli(args = process.argv.slice(2)) {
  try {
    if (args.length < 4) throw Error('Usage: package_report.mjs INPUT_DIR ENTRY_HTML METADATA_JSON ARCHIVE_DIR [ADDITIONAL_FILE ...]');
    const [input, entry, metaFile, out, ...include] = args;
    const result = packageReport({ input, entry, meta: JSON.parse(fs.readFileSync(metaFile,'utf8')), out, include });
    console.log(JSON.stringify({destination:result.destination, files:result.manifest.files},null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runPackageCli();
