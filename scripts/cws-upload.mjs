#!/usr/bin/env node
// Puts the packaged extension into the Chrome Web Store through the Chrome Web
// Store API v2, as a draft, and optionally submits that draft for review.
//
//   npm run package                          builds extension.zip from dist/
//   node scripts/cws-upload.mjs              dry run: checks everything, sends nothing
//   node scripts/cws-upload.mjs --confirm    uploads the zip as a draft
//   node scripts/cws-upload.mjs --submit     submits the uploaded draft for review
//
// Upload and submit are separate on purpose. The listing text, the privacy tab,
// the data usage answers and the video link are dashboard-only: the API cannot
// set them. They have to be right before a version goes to review, so the
// order is upload, fix the dashboard, then submit.
//
// Credentials are read from ~/.secrets (the palaniappan.tn2@gmail.com developer
// account, OAuth client from the Cloud project chrome-web-store-508117) and
// never printed.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ITEM_ID = 'jemjnjlplglfoiipcjhoacneigdgfmde';
const SECRETS = join(homedir(), '.secrets');
const SECRET_FILES = {
  client: 'Chrome Web Store OAuth palaniappan.tn2.json',
  refreshToken: 'Chrome Web Store Refresh Token (palaniappan.tn2@gmail.com)',
  publisherId: 'Chrome Web Store Publisher ID (palaniappan.tn2@gmail.com)',
};
const API = 'https://chromewebstore.googleapis.com';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const submit = args.includes('--submit');
const zipArg = args.indexOf('--zip') >= 0 ? args[args.indexOf('--zip') + 1] : null;
const ZIP = resolve(ROOT, zipArg ?? 'extension.zip');

function fail(message) {
  console.error(`Stopped: ${message}`);
  process.exit(1);
}

function secret(name) {
  const path = join(SECRETS, name);
  if (!existsSync(path)) fail(`missing ${path}`);
  return readFileSync(path, 'utf8').trim();
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

async function accessToken() {
  const client = JSON.parse(secret(SECRET_FILES.client)).installed;
  if (!client?.client_id) fail('the OAuth client file is not a Desktop app client');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: secret(SECRET_FILES.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!body.access_token) fail(`token refresh failed: ${body.error} ${body.error_description ?? ''}`);
  return body.access_token;
}

async function call(token, method, url, init = {}) {
  const res = await fetch(url, { method, ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${url.replace(API, '')} returned ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const itemPath = () => `publishers/${secret(SECRET_FILES.publisherId)}/items/${ITEM_ID}`;

function describe(status) {
  const published = status.publishedItemRevisionStatus;
  const submitted = status.submittedItemRevisionStatus;
  const version = (rev) => rev?.distributionChannels?.map((c) => `${c.crxVersion} at ${c.deployPercentage}%`).join(', ');
  console.log(`Live:      ${published ? `${published.state}, ${version(published)}` : 'nothing published'}`);
  console.log(`In review: ${submitted ? `${submitted.state}, ${version(submitted)}` : 'nothing'}`);
  if (status.lastAsyncUploadState) console.log(`Last upload: ${status.lastAsyncUploadState}`);
  if (status.takenDown || status.warned) console.log(`Warnings: takenDown=${!!status.takenDown} warned=${!!status.warned}`);
}

const token = await accessToken();
const status = await call(token, 'GET', `${API}/v2/${itemPath()}:fetchStatus`);
describe(status);
const liveVersion = status.publishedItemRevisionStatus?.distributionChannels?.[0]?.crxVersion ?? '0';

if (submit) {
  if (status.submittedItemRevisionStatus) fail('a version is already in review; withdraw it in the dashboard first');
  const res = await call(token, 'POST', `${API}/v2/${itemPath()}:publish`, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
  console.log(`Submitted for review: state ${res.state}`);
  for (const w of res.warningInfo?.warnings ?? []) console.log(`Warning: ${w.reason} ${w.description ?? ''}`);
  process.exit(0);
}

if (!existsSync(ZIP)) fail(`no zip at ${ZIP}; run npm run package`);
const manifest = JSON.parse(execFileSync('unzip', ['-p', ZIP, 'manifest.json'], { encoding: 'utf8' }));
console.log(`Zip:       ${ZIP.replace(ROOT + '/', '')}, version ${manifest.version}, ${(statSync(ZIP).size / 1024).toFixed(0)} KB`);
if (compareVersions(manifest.version, liveVersion) <= 0) {
  fail(`the zip's version ${manifest.version} is not higher than the live ${liveVersion}`);
}
if (status.submittedItemRevisionStatus) fail('a version is in review; uploading now would replace what the reviewer sees');

if (!confirm) {
  console.log('Dry run: nothing sent. Add --confirm to upload this zip as a draft.');
  process.exit(0);
}

const up = await call(token, 'POST', `${API}/upload/v2/${itemPath()}:upload?uploadType=media`, {
  headers: { 'content-type': 'application/zip' },
  body: readFileSync(ZIP),
});
let state = up.uploadState;
for (let i = 0; state === 'UPLOAD_IN_PROGRESS' && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  state = (await call(token, 'GET', `${API}/v2/${itemPath()}:fetchStatus`)).lastAsyncUploadState;
}
console.log(`Uploaded as a draft: version ${up.crxVersion ?? manifest.version}, state ${state}`);
if (state !== 'SUCCEEDED') fail(`upload did not succeed (${state}); check the dashboard`);
console.log('Next: update the dashboard fields, then run with --submit.');
