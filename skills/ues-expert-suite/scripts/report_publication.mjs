import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f]/.test(value) || path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || /^[a-z]:/i.test(value)) throw Error(`Unsafe relative path: ${value}`);
  return value;
}
export function sourceFile(root, relative) {
  safeRelative(relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error(`Symbolic links are not published: ${relative}`);
  }
  if (!fs.statSync(current).isFile()) throw Error(`Not a file: ${relative}`);
  return current;
}
function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, m => {
    const named = {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
    return named[m.toLowerCase()] ?? String.fromCodePoint(parseInt(m.slice(m[2]?.toLowerCase() === 'x' ? 3 : 2, -1), m[2]?.toLowerCase() === 'x' ? 16 : 10));
  });
}
export function references(relative, bytes) {
  if (!/\.(?:html?|css|svg)$/i.test(relative)) return [];
  let text = bytes.toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
  if (/<base\b/i.test(text)) throw Error(`${relative}: base URL must be removed before publication`);
  // Inline script bodies can contain sample markup that is not a resource dependency.
  text = text.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>');
  if (/\bsrcset\s*=/i.test(text)) throw Error(`${relative}: srcset requires an explicit publication adaptation`);
  const refs = [];
  for (const m of text.matchAll(/\b(?:src|href|poster|data-src|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) refs.push(decodeEntities(m[1] ?? m[2] ?? m[3]));
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) refs.push(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(/@import\s+["']([^"']+)["']/gi)) refs.push(m[1]);
  return refs.filter(Boolean);
}
export function localReference(from, reference) {
  if (/^(?:https?:|mailto:|tel:|data:|#|\/\/)/i.test(reference)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith('/') || reference.includes('\\')) throw Error(`${from}: nonportable URL ${reference}`);
  const raw = reference.split(/[?#]/)[0];
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (decoded.includes('\\') || decoded.startsWith('/')) throw Error(`${from}: unsafe URL ${reference}`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
  return safeRelative(target);
}
export function metadata(value) {
  for (const key of ['project_id','run_id']) if (typeof value[key] !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(value[key])) throw Error(`Invalid ${key}`);
  for (const key of ['product','title','evaluated_at','version','scope','summary']) if (typeof value[key] !== 'string' || !value[key].trim()) throw Error(`Missing ${key}`);
  if (Number.isNaN(Date.parse(value.evaluated_at))) throw Error('Invalid evaluated_at');
  if (!['evaluation','example'].includes(value.kind)) throw Error('kind must be evaluation or example');
  // Copy only the public metadata contract, never arbitrary input fields.
  return Object.fromEntries(['project_id','run_id','product','title','evaluated_at','version','scope','summary','kind'].map(k => [k,value[k]]));
}
export function verifyPackage(root) {
  const manifest = JSON.parse(fs.readFileSync(sourceFile(root, 'publication.json'), 'utf8'));
  if (manifest.schema_version !== 'ues-publication/0.1') throw Error('Unsupported publication schema');
  metadata(manifest);
  safeRelative(manifest.entry);
  if (!/\.html?$/i.test(manifest.entry)) throw Error('Entry must be HTML');
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw Error('Empty publication');
  const files = new Set();
  for (const item of manifest.files) {
    safeRelative(item.path);
    if (files.has(item.path) || item.path === 'publication.json') throw Error(`Duplicate or reserved file: ${item.path}`);
    files.add(item.path);
    const bytes = fs.readFileSync(sourceFile(root, item.path));
    if (sha256(bytes) !== item.sha256 || bytes.length !== item.bytes) throw Error(`Hash/size mismatch: ${item.path}`);
  }
  if (!files.has(manifest.entry)) throw Error('Entry missing from publication');
  for (const relative of files) for (const ref of references(relative, fs.readFileSync(sourceFile(root, relative)))) {
    const target = localReference(relative, ref);
    if (target && !files.has(target)) throw Error(`Broken publication link: ${relative} -> ${ref}`);
  }
  return manifest;
}
