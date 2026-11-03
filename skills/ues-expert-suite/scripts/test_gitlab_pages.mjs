#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageReport } from './package_report.mjs';
import { publishPackage } from './publish_gitlab_pages.mjs';
import { makeGitlabClient, resolvePublicationConfig, validatePublicationConfig } from './gitlab_pages_client.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ues-gitlab-test-'));
try {
  const input=path.join(temp,'input');fs.mkdirSync(input);
  fs.writeFileSync(path.join(input,'report.html'),'<html><img src="screenshot.svg"></html>');
  fs.writeFileSync(path.join(input,'screenshot.svg'),'<svg/>');
  const meta={project_id:'csgclaw',run_id:'run-01',product:'CSGClaw',title:'Report',evaluated_at:'2026-11-03T01:00:00Z',version:'test',scope:'test scope',summary:'test summary',kind:'evaluation'};
  const {destination}=packageReport({input,entry:'report.html',meta,out:path.join(temp,'archive')});
  const config={schema_version:'ues-gitlab-pages/0.1',enabled:true,mode:'auto',gitlab_url:'https://gitlab.example.com',project:'team/ux',branch:'reports',archive_path:'report-archive',pages_url:'https://team.pages.example.com/ux',timeout_seconds:30,poll_seconds:1,max_publish_bytes:1048576};
  assert.deepEqual(validatePublicationConfig(config),[]);
  for (const override of [{pages_url:'http://insecure.test'},{gitlab_url:'https://user:password@gitlab.example.com'},{branch:'main'},{archive_path:'../escape'},{poll_seconds:0}]) assert.ok(validatePublicationConfig({...config,...override}).length);
  assert.equal(resolvePublicationConfig(undefined,{CODEX_HOME:path.join(temp,'none')}),null);
  assert.throws(()=>resolvePublicationConfig(path.join(temp,'missing')),/does not exist/);
  const bytes=fs.readFileSync(path.join(destination,'publication.json'));
  let commits=0,existing=null,failPipeline=false,brokenResource=false,simulateLostResponse=false;
  const client={
    async api(endpoint,options={}) {
      if (endpoint.endsWith('/pages')) return {url:config.pages_url};
      if (endpoint.includes('/repository/branches/')) return {commit:{id:'newest-complete-archive'}};
      if (endpoint.includes('/repository/files/')) return existing;
      if (options.method==='POST') {
        commits++;
        assert.equal(options.body.branch,'reports');
        assert.ok(options.body.actions.every(a=>a.action==='create'&&a.file_path.startsWith('report-archive/csgclaw/run-01/')));
        assert.ok(!('force' in options.body));
        existing={content:bytes.toString('base64'),last_commit_id:'own-commit'};
        if (simulateLostResponse) throw Error('connection lost after server commit');
        return {id:'own-commit'};
      }
      if (endpoint.includes('/pipelines?')) return [{status:failPipeline?'failed':'success',web_url:'https://gitlab.example.com/team/ux/-/pipelines/12'}];
      throw Error('Unexpected API endpoint '+endpoint);
    },
    async pageBytes(url) {
      if (url.endsWith('/reports.json')) return Buffer.from(JSON.stringify([{...meta,url:'reports/csgclaw/run-01/report.html'}]));
      if (url.endsWith('/projects/csgclaw/')) return Buffer.from('<html>project directory</html>');
      const relative=url.split('/reports/csgclaw/run-01/')[1];
      if (brokenResource&&relative==='screenshot.svg') return Buffer.from('corrupt screenshot');
      return fs.readFileSync(path.join(destination,relative));
    },
  };
  const statePath=path.join(temp,'publication-state.json');
  const publish=(opts={})=>publishPackage({config,directory:destination,statePath,client,...opts});
  const first=await publish();
  assert.equal(first.status,'published');assert.equal(commits,1);
  assert.equal(first.deployment_commit_sha,'newest-complete-archive');
  assert.equal(first.report_url,config.pages_url+'/reports/csgclaw/run-01/report.html');
  const second=await publish();assert.equal(second.reused,true);assert.equal(commits,1);
  existing={content:Buffer.from('different manifest').toString('base64')};
  await assert.rejects(publish(),/already contains different content/);assert.equal(commits,1);
  existing=null;simulateLostResponse=true;
  assert.equal((await publish()).status,'published');assert.equal(commits,2);simulateLostResponse=false;
  failPipeline=true;await assert.rejects(publish(),/pipeline failed/);
  assert.equal(JSON.parse(fs.readFileSync(statePath)).report_url,null);failPipeline=false;
  brokenResource=true;let ticks=0;
  const pending=await publish({now:()=>ticks,wait:async ms=>{ticks+=ms;}});
  assert.equal(pending.status,'pending');assert.equal(pending.report_url,null);brokenResource=false;
  assert.equal((await publish()).status,'published');assert.equal(commits,2);
  // Bearer authentication goes only to the configured API and Pages origins, never redirect targets.
  const calls=[];
  const authClient=makeGitlabClient(config,{env:{GITLAB_TOKEN:'test-secret-never-log'},fetchFn:async(url,options)=>{calls.push({url:String(url),options});return new Response('{}',{status:200});}});
  await authClient.api('projects/team%2Fux');await authClient.pageBytes(config.pages_url+'/reports.json');
  assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer test-secret-never-log'));
  assert.equal(calls[0].options.redirect,'error');assert.equal(calls[1].options.redirect,'manual');
  await assert.rejects(authClient.pageBytes('https://attacker.example.com/ux/reports.json'),/outside configured/);
  assert.equal(calls.length,2);
  console.log('GitLab Pages tests passed (idempotency, immutable runs, superseding deployments, lost responses, failure recovery, resource verification and credential origin boundaries).');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
