import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { safeRelative } from './report_publication.mjs';

export function validatePublicationConfig(c) {
  const errors = [];
  if (!c || c.schema_version !== 'ues-gitlab-pages/0.1') errors.push('Unsupported publication config schema');
  if (typeof c?.enabled !== 'boolean') errors.push('enabled must be boolean');
  if (c?.mode !== 'auto') errors.push('mode must be auto');
  for (const key of ['gitlab_url','pages_url']) {
    try {
      const u = new URL(c[key]);
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw Error();
      if (key === 'gitlab_url' && u.pathname !== '/') throw Error();
    } catch { errors.push(`${key} must be an HTTPS URL without credentials, query or fragment`); }
  }
  if (typeof c?.project !== 'string' || !/^[\w.-]+(?:\/[\w.-]+)+$/.test(c.project)) errors.push('project must be a namespace/project path');
  if (typeof c?.branch !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9_/-]*$/.test(c.branch) || ['main','master'].includes(c.branch) || c.branch.includes('//')) errors.push('Use a dedicated archive branch');
  try { safeRelative(c?.archive_path); } catch { errors.push('archive_path must be a safe relative path'); }
  for (const [key,min,max] of [['timeout_seconds',30,1800],['poll_seconds',1,30],['max_publish_bytes',1024,100*1024*1024]]) {
    if (!Number.isInteger(c?.[key]) || c[key] < min || c[key] > max) errors.push(`${key} must be an integer from ${min} to ${max}`);
  }
  return errors;
}

export function resolvePublicationConfig(explicit, env = process.env) {
  const filename = explicit || env.UES_PUBLICATION_CONFIG || path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'ues-expert-suite', 'publication.json');
  if (!fs.existsSync(filename)) {
    if (explicit || env.UES_PUBLICATION_CONFIG) throw Error(`Publication configuration does not exist: ${filename}`);
    return null;
  }
  const config = JSON.parse(fs.readFileSync(filename,'utf8'));
  const errors = validatePublicationConfig(config);
  if (errors.length) throw Error(errors.join('; '));
  return {config, filename:path.resolve(filename)};
}

export function makeGitlabClient(config, {env = process.env, fetchFn = fetch} = {}) {
  // Only capture the token in memory. Never put it in an argument, URL, state or report.
  let token = env.GITLAB_TOKEN || env.GITLAB_ACCESS_TOKEN;
  if (!token) {
    const result = spawnSync('glab',['config','get','token','--host',new URL(config.gitlab_url).hostname], {encoding:'utf8',timeout:15000,env});
    if (result.status !== 0 || !result.stdout?.trim()) throw Error('GitLab authentication unavailable: set GITLAB_TOKEN or sign in with glab');
    token = result.stdout.trim();
  }
  const apiBase = config.gitlab_url.replace(/\/$/,'') + '/api/v4/';
  async function api(endpoint, {method='GET',body,notFound=false}={}) {
    if (/^(?:[a-z]+:|\/)/i.test(endpoint)) throw Error('API endpoint must be relative');
    const response = await fetchFn(apiBase + endpoint, {method,redirect:'error',headers:{Authorization:`Bearer ${token}`,...(body ? {'Content-Type':'application/json'}:{})},body:body ? JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if (response.status === 404 && notFound) return null;
    const text = await response.text();
    if (!response.ok) {
      const error = Error(`GitLab API ${method} failed (${response.status})`);
      error.status=response.status;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }
  async function pageBytes(url) {
    const allowed = new URL(config.pages_url);
    const u = new URL(url);
    const prefix = allowed.pathname.replace(/\/$/,'') + '/';
    if (u.origin !== allowed.origin || !u.pathname.startsWith(prefix)) throw Error('Refusing to send Pages authentication outside configured site');
    const response = await fetchFn(u.href,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(30000)});
    if (response.status !== 200) throw Error(`Pages not yet accessible (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  return {api,pageBytes};
}
