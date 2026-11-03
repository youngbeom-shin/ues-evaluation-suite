#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeRelative, verifyPackage, sourceFile } from './report_publication.mjs';
import { renderDirectory } from './render_report_directory.mjs';

export function buildReportSite(archive, output) {
  const root = fs.realpathSync(archive);
  const destination = path.resolve(output);
  if (destination === root || root.startsWith(destination + path.sep) || destination.startsWith(root + path.sep)) throw Error('Output and archive must be separate directories');
  const reports = [];
  // Validate all packages before writing any output; cache is never a history source.
  for (const product of fs.readdirSync(root, {withFileTypes:true})) {
    if (!product.isDirectory() || product.isSymbolicLink()) throw Error(`Unexpected archive entry: ${product.name}`);
    for (const run of fs.readdirSync(path.join(root, product.name), {withFileTypes:true})) {
      if (!run.isDirectory() || run.isSymbolicLink()) throw Error(`Unexpected run entry: ${run.name}`);
      const directory = path.join(root, product.name, run.name);
      const manifest = verifyPackage(directory);
      if (manifest.project_id !== product.name || manifest.run_id !== run.name) throw Error('Manifest/directory ID mismatch');
      const prefix = `reports/${product.name}/${run.name}`;
      reports.push({ ...manifest, url: `${prefix}/${manifest.entry}`, directory, prefix });
    }
  }
  if (!reports.length) throw Error('No reports to publish');
  reports.sort((a,b) => Date.parse(b.evaluated_at) - Date.parse(a.evaluated_at) || a.run_id.localeCompare(b.run_id));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.site-'));
  try {
    for (const report of reports) {
      for (const relative of ['publication.json', ...report.files.map(f => f.path)]) {
        safeRelative(relative);
        const target = path.join(staging, report.prefix, relative);
        fs.mkdirSync(path.dirname(target), {recursive:true});
        fs.copyFileSync(sourceFile(report.directory, relative), target);
      }
    }
    const index = reports.map(({directory,prefix,files,...item}) => item);
    fs.writeFileSync(path.join(staging,'reports.json'), JSON.stringify(index,null,2) + '\n');
    fs.writeFileSync(path.join(staging,'index.html'), renderDirectory(index));
    for (const projectId of new Set(index.map(r=>r.project_id))) {
      const projectDirectory=path.join(staging,'projects',projectId);
      fs.mkdirSync(projectDirectory,{recursive:true});
      fs.writeFileSync(path.join(projectDirectory,'index.html'), renderDirectory(index.filter(r=>r.project_id===projectId),{projectId}));
    }
    // Refuse replacement: callers build into a fresh directory, then deploy on success.
    if (fs.existsSync(destination)) throw Error(`Output already exists: ${destination}`);
    fs.renameSync(staging, destination);
    return index;
  } finally { fs.rmSync(staging, {recursive:true,force:true}); }
}
export function runBuildCli(args = process.argv.slice(2)) {
  try {
    const [archive, output] = args;
    if (!archive || !output) throw Error('Usage: build_report_site.mjs ARCHIVE_DIR OUTPUT_DIR');
    console.log(JSON.stringify(buildReportSite(archive,output),null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runBuildCli();
