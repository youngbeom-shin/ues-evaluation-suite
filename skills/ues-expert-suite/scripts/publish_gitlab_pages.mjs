#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageReport } from './package_report.mjs';
import { sha256, verifyPackage, safeRelative } from './report_publication.mjs';
import { resolvePublicationConfig, makeGitlabClient } from './gitlab_pages_client.mjs';
import { formatCsgclawPublication } from './csgclaw_resource_links.mjs';

const scriptRoot=path.dirname(fileURLToPath(import.meta.url));
const encode=encodeURIComponent;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateEvaluation(runDir, entry) {
  for (const [script,args] of [
    ['validate_suite_report.mjs',['assessment.json']],
    ['validate_html_report.mjs',[entry,'assessment.json','diagnosis.json']],
  ]) {
    const result=spawnSync(process.execPath,[path.join(scriptRoot,script),...args.map(f=>path.join(runDir,f))],{encoding:'utf8',timeout:60000});
    if (result.status!==0) throw Error(`Report validation failed (${script}): ${(result.stderr || result.stdout).slice(0,1500)}`);
  }
  const state=JSON.parse(fs.readFileSync(path.join(runDir,'run-state.json'),'utf8'));
  if (state.report?.status!=='current') throw Error('Only a current, validated report can be published');
}

export async function publishPackage({config, directory, statePath, client, wait=sleep, now=()=>Date.now(), onProgress=()=>{}}) {
  const manifest=verifyPackage(directory);
  for (const file of manifest.files.filter(f=>/\.(?:html?|json|txt|md|js|css|csv|ndjson)$/i.test(f.path))) {
    const content=fs.readFileSync(path.join(directory,file.path),'utf8');
    if (/glpat-[a-zA-Z0-9_-]{15,}|-----BEGIN [^-]*PRIVATE KEY-----|Authorization["']?\s*[:=]\s*["']?Bearer\s+[a-zA-Z0-9._-]{15,}/i.test(content)) throw Error(`Possible credential in publication file: ${file.path}; publish a reviewed redacted derivative`);
  }
  const manifestBytes=fs.readFileSync(path.join(directory,'publication.json'));
  const manifestHash=sha256(manifestBytes);
  const prefix=`${config.archive_path}/${manifest.project_id}/${manifest.run_id}`;
  const project=`projects/${encode(config.project)}`;
  const branch=encode(config.branch);
  const fileEndpoint=relative=>`${project}/repository/files/${encode(relative)}?ref=${branch}`;
  const base=config.pages_url.replace(/\/$/,'');
  const reportPath=`reports/${manifest.project_id}/${manifest.run_id}/${manifest.entry}`;
  const candidateUrl=`${base}/${reportPath.split('/').map(encode).join('/')}`;
  const state={schema_version:'ues-publication-state/0.1',status:'preparing',project:config.project,branch:config.branch,project_id:manifest.project_id,run_id:manifest.run_id,manifest_sha256:manifestHash,candidate_report_url:candidateUrl,report_url:null,index_url:base+'/',project_index_url:`${base}/projects/${manifest.project_id}/`,commit_sha:null,pipeline_url:null,verified_at:null};
  function save(status,extra={}) {
    Object.assign(state,extra,{status,updated_at:new Date(now()).toISOString()});
    if (statePath) {
      fs.mkdirSync(path.dirname(path.resolve(statePath)),{recursive:true});
      const temporary=statePath+'.tmp-'+process.pid;
      fs.writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});
      fs.renameSync(temporary,statePath);
    }
    onProgress({...state});
  }
  save('preparing');
  const started=now();
  const timedOut=()=>now()-started>=config.timeout_seconds*1000;
  try {
    try {
      const pages=await client.api(`${project}/pages`);
      if (pages.url.replace(/\/$/,'')!==base) throw Error('Configured pages_url does not match the GitLab project Pages URL');
      state.pages_url_basis='gitlab_pages_api';
    } catch (error) {
      if (error.status!==403) throw error;
      // Reading Pages settings requires Maintainer. A project-scoped Developer
      // can publish without that extra privilege: trust only the host-approved
      // URL, confirm project identity, then verify the actual deployed bytes.
      const identity=await client.api(project);
      if (identity.path_with_namespace!==config.project || identity.pages_access_level==='disabled') throw Error('Publication project identity or Pages access is invalid');
      state.pages_url_basis='host_configuration_and_content_verification';
    }
    const branchInfo=await client.api(`${project}/repository/branches/${branch}`);
    if (!branchInfo?.commit?.id) throw Error('Archive branch must be initialized with the Pages pipeline first');
    const existing=await client.api(fileEndpoint(prefix+'/publication.json'),{notFound:true});
    const sameManifest=record=>record && sha256(Buffer.from(record.content.replace(/\s/g,''),'base64'))===manifestHash;
    if (existing && !sameManifest(existing)) throw Error('This run_id already contains different content; create a new evaluation/revision run_id');
    if (existing) save('committed',{commit_sha:existing.last_commit_id,reused:true});
    else {
      const total=manifest.files.reduce((sum,f)=>sum+f.bytes,manifestBytes.length);
      if (total>config.max_publish_bytes) throw Error('Publication exceeds configured max_publish_bytes');
      const actions=['publication.json',...manifest.files.map(f=>f.path)].map(relative=>({action:'create',file_path:prefix+'/'+relative,encoding:'base64',content:fs.readFileSync(path.join(directory,relative)).toString('base64')}));
      let commit;
      try { commit=await client.api(`${project}/repository/commits`,{method:'POST',body:{branch:config.branch,commit_message:`docs: archive ${manifest.project_id}/${manifest.run_id} UX report`,actions}}); }
      catch (error) {
        // An interrupted response may still have committed. Inspect once; never blindly repeat writes.
        const record=await client.api(fileEndpoint(prefix+'/publication.json'),{notFound:true});
        if (!sameManifest(record)) throw error;
        commit={id:record.last_commit_id};
      }
      save('committed',{commit_sha:commit.id,reused:false});
    }
    while (!timedOut()) {
      // A newer archive commit may include this report; follow its complete-site deployment.
      const latest=await client.api(`${project}/repository/branches/${branch}`);
      const pipelines=await client.api(`${project}/pipelines?ref=${branch}&sha=${encode(latest.commit.id)}&per_page=5`);
      const pipeline=pipelines[0];
      if (!pipeline) { save('awaiting_pipeline'); await wait(config.poll_seconds*1000); continue; }
      save('deploying',{pipeline_url:pipeline.web_url,deployment_commit_sha:latest.commit.id});
      if (['failed','canceled','skipped','manual'].includes(pipeline.status)) throw Error(`Pages pipeline ${pipeline.status}; resolve it and rerun the same publication command`);
      if (pipeline.status!=='success') { await wait(config.poll_seconds*1000); continue; }
      try {
        const remoteManifest=await client.pageBytes(`${base}/reports/${manifest.project_id}/${manifest.run_id}/publication.json`);
        if (sha256(remoteManifest)!==manifestHash) throw Error('Pages is still serving a different archive snapshot');
        const report=await client.pageBytes(candidateUrl);
        const expected=manifest.files.find(f=>f.path===manifest.entry);
        if (sha256(report)!==expected.sha256) throw Error('Published HTML hash does not match');
        const index=JSON.parse((await client.pageBytes(base+'/reports.json')).toString());
        if (!index.some(r=>r.project_id===manifest.project_id&&r.run_id===manifest.run_id)) throw Error('Report is missing from the directory index');
        await client.pageBytes(state.project_index_url);
        // Verify local resources from the actual deployment, including screenshots and downloads.
        for (const file of manifest.files) {
          if (timedOut()) throw Error('Timed out verifying published resources');
          const resource=await client.pageBytes(`${base}/reports/${manifest.project_id}/${manifest.run_id}/${file.path.split('/').map(encode).join('/')}`);
          if (sha256(resource)!==file.sha256) throw Error(`Published resource hash differs: ${file.path}`);
        }
        save('published',{report_url:candidateUrl,verified_at:new Date(now()).toISOString(),reason:null});
        return state;
      } catch (error) {
        save('deployed_unverified',{reason:error.message});
        await wait(config.poll_seconds*1000);
      }
    }
    save('pending',{reason:'Timed out waiting for verified Pages publication; rerun the same command to resume'});
    return state;
  } catch (error) { save('failed',{reason:error.message}); throw error; }
}

export async function runPublishCli(args=process.argv.slice(2)) {
  let temporary,localStatePath,dryRun=false;
  try {
    const [runDirArg,...options]=args;
    if (!runDirArg) throw Error('Usage: publish_gitlab_pages.mjs RUN_DIR [--config FILE] [--input FILE] [--output json|csgclaw] [--dry-run]');
    let configFile,inputFile,outputFormat;
    for (let i=0;i<options.length;i++) {
      if (['--config','--input','--output'].includes(options[i]) && (!options[i+1] || options[i+1].startsWith('--'))) throw Error(`Missing value for ${options[i]}`);
      if (options[i]==='--config') configFile=options[++i];
      else if (options[i]==='--input') inputFile=options[++i];
      else if (options[i]==='--output') outputFormat=options[++i];
      else if (options[i]==='--dry-run') dryRun=true;
      else throw Error(`Unknown option: ${options[i]}`);
    }
    const selected=resolvePublicationConfig(configFile);
    if (!selected || !selected.config.enabled) { console.log(JSON.stringify({status:'skipped',reason:'Automatic publication is not configured/enabled'})); return; }
    outputFormat=outputFormat || selected.config.output_format || 'json';
    if (!['json','csgclaw'].includes(outputFormat)) throw Error('Output format must be json or csgclaw');
    const runDir=fs.realpathSync(runDirArg);
    localStatePath=path.join(runDir,'publication-state.json');
    const input=JSON.parse(fs.readFileSync(inputFile || path.join(runDir,'publication-input.json'),'utf8'));
    const entry=input.entry || 'report.html';safeRelative(entry);
    if (input.kind!=='evaluation') throw Error('Automatic evaluation publication requires kind=evaluation');
    validateEvaluation(runDir,entry);
    temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ues-publish-'));
    const {destination,manifest}=packageReport({input:runDir,entry,meta:input,out:temporary,include:input.include || []});
    if (dryRun) { console.log(JSON.stringify({status:'ready',project:selected.config.project,project_id:manifest.project_id,run_id:manifest.run_id,files:manifest.files.length,bytes:manifest.files.reduce((s,f)=>s+f.bytes,0)},null,2));return; }
    const client=makeGitlabClient(selected.config);
    const result=await publishPackage({config:selected.config,directory:destination,statePath:localStatePath,client,onProgress:s=>{
      if (s.status!==runPublishCli.lastStatus) { console.error(`Pages publication: ${s.status}`);runPublishCli.lastStatus=s.status; }
    }});
    console.log(result.status==='published' && outputFormat==='csgclaw' ? formatCsgclawPublication(result) : JSON.stringify(result,null,2));
    if (result.status!=='published') process.exitCode=2;
  } catch (error) {
    if (localStatePath && !dryRun) {
      let previous={};
      try { previous=JSON.parse(fs.readFileSync(localStatePath,'utf8')); } catch {}
      fs.writeFileSync(localStatePath,JSON.stringify({...previous,schema_version:'ues-publication-state/0.1',status:'failed',report_url:null,reason:error.message,updated_at:new Date().toISOString()},null,2)+'\n',{mode:0o600});
    }
    console.error(error.message);process.exitCode=1;
  }
  finally { if (temporary) fs.rmSync(temporary,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await runPublishCli();
