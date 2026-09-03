/**
 * Asserts the generated CSP actually matches the bundle it ships beside.
 *
 * WHY THIS EXISTS. The policy allows exactly one inline script, by SHA-256
 * hash. If Expo changes that bootstrap line and the hash is stale, the browser
 * blocks it and the deployed app is a blank white page — with a console error
 * nobody sees, no failing test, and a green deploy. That is the worst shape a
 * bug can take.
 *
 * So this recomputes the hashes from the HTML on disk and requires every one to
 * be present in the policy. Run in CI directly after the build.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: check-web-headers.mjs <export-dir>');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(out);
const headersPath = join(out, '_headers');
const headers = readFileSync(headersPath, 'utf8');

const policy = headers.match(/Content-Security-Policy: (.*)/)?.[1];
if (!policy) throw new Error('_headers contains no Content-Security-Policy');

const problems = [];

// ------------------------------------------- every inline script is allowed --

let inlineCount = 0;
for (const file of files.filter((name) => name.endsWith('.html'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = match[1];
    if (body.trim() === '') continue;
    inlineCount += 1;
    const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
    if (!policy.includes(hash)) {
      problems.push(`${file}: inline script hash ${hash} is not in the CSP`);
    }
  }
}

// --------------------------------------------- the policy stayed strict --

if (/script-src[^;]*'unsafe-inline'/.test(policy)) {
  problems.push("script-src allows 'unsafe-inline' — the session lives in localStorage on web");
}
if (/script-src[^;]*'unsafe-eval'/.test(policy)) {
  problems.push("script-src allows 'unsafe-eval'");
}
if (!/connect-src[^;]*https:\/\//.test(policy)) {
  problems.push('connect-src names no https origin, so the app cannot reach the API');
}
for (const directive of ['object-src', 'base-uri', 'frame-ancestors']) {
  if (!policy.includes(`${directive} 'none'`)) {
    problems.push(`${directive} is not locked to 'none'`);
  }
}

// ------------------------------------ every dynamic route has a rewrite --

const redirects = readFileSync(join(out, '_redirects'), 'utf8');
const dynamicPages = files
  .filter((name) => name.endsWith('.html') && name.includes('['))
  .map((name) => name.split(/[\\/]/).pop());

for (const page of dynamicPages) {
  if (!redirects.includes(page)) {
    problems.push(`${page} is a dynamic route with no rewrite; the URL would 404`);
  }
}

if (problems.length > 0) {
  console.error('Web host configuration is wrong:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`OK: ${inlineCount} inline scripts all hashed in the CSP`);
console.log(`OK: ${dynamicPages.length} dynamic routes all rewritten`);
console.log('OK: script-src is strict; object-src, base-uri, frame-ancestors locked');
