import assert from 'node:assert/strict';
import { publicationResourceLinks, formatCsgclawPublication } from './csgclaw_resource_links.mjs';

const base='https://team.pages.example.com/ux';
const state={schema_version:'ues-publication-state/0.1',status:'published',verified_at:'2026-11-03T09:00:00Z',project_id:'csgclaw',run_id:'run-01',index_url:base+'/',report_url:base+'/reports/csgclaw/run-01/report.html',project_index_url:base+'/projects/csgclaw/'};
const links=publicationResourceLinks(state);
assert.equal(links.length,3);
assert.equal(new Set(links.map(l=>l.uri)).size,3);
assert.deepEqual(links.map(l=>l.type),['resource_link','resource_link','resource_link']);
assert.equal(links[0].title,'本轮 UX 评估报告');
const lines=formatCsgclawPublication(state).split('\n');
assert.equal(lines.length,4);
for (const line of lines.slice(1)) {
  assert.ok(line.startsWith('::csgclaw-output::resource_link '));
  const resource=JSON.parse(line.slice('::csgclaw-output::resource_link '.length));
  assert.ok(resource.name&&resource.uri&&resource.type==='resource_link');
  assert.deepEqual(resource.annotations.audience,['user']);
}
for (const patch of [{status:'failed'},{status:'pending'},{status:'deployed_unverified'},{verified_at:null},{report_url:'file:///tmp/report.html'},{report_url:'https://attacker.example.com/report.html'},{report_url:base+'/reports/another/run-01/report.html'},{project_index_url:base+'/projects/another/'},{report_url:base+'/reports/csgclaw/run-01/report.html?token=secret'},{run_id:'../escape'}]) assert.throws(()=>publicationResourceLinks({...state,...patch}));
console.log('CSGClaw output tests passed (three verified links, canonical single-line records, pending/failure exclusion and archive URL boundaries).');
