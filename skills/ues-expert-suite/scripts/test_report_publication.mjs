#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageReport } from './package_report.mjs';
import { buildReportSite } from './build_report_site.mjs';
import { safeRelative, verifyPackage } from './report_publication.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ues-publication-test-'));
const input = path.join(temporary,'input');
const archive = path.join(temporary,'archive');
const meta = {project_id:'csgclaw',run_id:'test-01',product:'CSGClaw <test>',title:'真实样本测试',evaluated_at:'2026-11-03T09:00:00+08:00',version:'test',scope:'页面',summary:'<script>alert(1)</script>',kind:'evaluation'};
function write(relative, text) { const f=path.join(input,relative); fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text); }
try {
  write('report.html','<!doctype html><html><head><link href="assets/style.css" rel="stylesheet"></head><body><a href="details.html">详情</a><img src="assets/evidence.svg"><a href="https://example.com">来源</a><script src="assets/report.js"></script></body></html>');
  write('assets/style.css','@import "other.css"; body{background:url("evidence.svg")}');
  write('assets/other.css','body{color:#123}');
  write('assets/evidence.svg','<svg xmlns="http://www.w3.org/2000/svg"/>');
  write('assets/report.js','console.log("test")');
  write('details.html','<a href="report.html#top">返回</a>');
  write('private-note.txt','must not be published');
  write('assessment.json','{}');
  const first = packageReport({input,entry:'report.html',meta,out:archive,include:['assessment.json']});
  assert.equal(first.manifest.files.length,7);
  assert.ok(!first.manifest.files.some(f=>f.path==='private-note.txt'));
  assert.throws(()=>packageReport({input,entry:'report.html',meta,out:archive}),/already exists/);
  const second=packageReport({input,entry:'report.html',meta:{...meta,run_id:'test-02',evaluated_at:'2026-11-03T10:00:00+08:00'},out:archive});
  const output=path.join(temporary,'public');
  const reports=buildReportSite(archive,output);
  assert.deepEqual(reports.map(r=>r.run_id),['test-02','test-01']);
  for (const run of ['test-01','test-02']) assert.ok(fs.existsSync(path.join(output,'reports/csgclaw',run,'assets/evidence.svg')));
  const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('href="reports/csgclaw/test-01/report.html"'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  const projectPage=fs.readFileSync(path.join(output,'projects/csgclaw/index.html'),'utf8');
  assert.ok(projectPage.includes('href="../../reports/csgclaw/test-01/report.html"'));
  assert.ok(projectPage.includes('href="../../reports/csgclaw/test-02/report.html"'));
  assert.ok(html.includes('href="projects/csgclaw/"'));
  assert.ok(!fs.existsSync(path.join(output,'reports/csgclaw/test-01/private-note.txt')));
  assert.throws(()=>buildReportSite(archive,output),/already exists/);
  // A failed rebuild cannot touch an already deployed site's files.
  fs.writeFileSync(path.join(second.destination,'report.html'),'tampered');
  assert.throws(()=>buildReportSite(archive,path.join(temporary,'failed')),/mismatch/);
  assert.equal(fs.readFileSync(path.join(output,'index.html'),'utf8'),html);
  assert.ok(!fs.existsSync(path.join(temporary,'failed')));
  for (const invalid of ['../escape','/absolute','C:/windows','a/../../escape','a\\b','.env','a/.secret','a//b']) assert.throws(()=>safeRelative(invalid));
  const tryInput=(text,pattern)=>{write('bad.html',text);assert.throws(()=>packageReport({input,entry:'bad.html',meta:{...meta,run_id:'bad'},out:archive}),pattern);assert.ok(!fs.existsSync(path.join(archive,'csgclaw/bad')));};
  tryInput('<img src="missing.png">',/ENOENT/);
  tryInput('<a href="../private.txt">escape</a>',/Unsafe/);
  tryInput('<img src="file:///Users/name/a.png">',/nonportable/);
  tryInput('<img src="/assets/a.png">',/nonportable/);
  tryInput('<a href="%2e%2e/escape">escape</a>',/Unsafe/);
  tryInput('<base href="https://example.com"><img src="a.png">',/base URL/);
  tryInput('<img srcset="a.png 1x, b.png 2x">',/srcset/);
  write('outside.txt','outside');
  fs.symlinkSync(path.join(input,'outside.txt'),path.join(input,'linked.txt'));
  tryInput('<a href="linked.txt">symlink</a>',/Symbolic/);
  // Detect broken links even when an attacker updates the referenced HTML hash.
  const manifest=JSON.parse(fs.readFileSync(path.join(first.destination,'publication.json'),'utf8'));
  manifest.files=manifest.files.filter(f=>f.path!=='assets/evidence.svg');
  fs.writeFileSync(path.join(first.destination,'publication.json'),JSON.stringify(manifest));
  assert.throws(()=>verifyPackage(first.destination),/Broken publication link/);
  assert.throws(()=>packageReport({input,entry:'report.html',meta:{...meta,run_id:'../bad'},out:archive}),/Invalid run_id/);
  console.log('Report publication checks passed (dependency closure, hashes, historical URLs, escaping, traversal, symlinks, duplicate runs and failure preservation).');
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
