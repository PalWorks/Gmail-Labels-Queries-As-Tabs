#!/usr/bin/env node
// Uploads the product video to YouTube through the YouTube Data API, with the
// title, description and tags from store-assets/video/README.md, then sets the
// thumbnail. No dependencies: OAuth is a loopback sign-in with PKCE, the upload
// is YouTube's resumable protocol.
//
//   node scripts/store-assets/youtube-upload.mjs                        dry run: print what would be uploaded, send nothing
//   node scripts/store-assets/youtube-upload.mjs --check                sign in, print the channel
//   node scripts/store-assets/youtube-upload.mjs --confirm              upload as private
//   node scripts/store-assets/youtube-upload.mjs --confirm --privacy unlisted
//
// A plain run is a dry run, like scripts/cws-upload.mjs: a video once
// published to a channel cannot be taken back quietly, so uploading needs
// --confirm.
//
// The OAuth client is a Desktop app client from the Google Cloud project, saved
// as ~/.config/gmail-labels-as-tabs/youtube-client.json (or --client <path>).
// The refresh token is kept beside it in youtube-token.json, mode 600.
//
// Uploads from a project that has not passed YouTube's API audit are restricted
// to private, whatever --privacy says.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEO_DIR = join(ROOT, 'store-assets', 'video');
const CONFIG_DIR = join(homedir(), '.config', 'gmail-labels-as-tabs');
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const CLIENT_FILE = option('client', join(CONFIG_DIR, 'youtube-client.json'));
const TOKEN_FILE = join(CONFIG_DIR, 'youtube-token.json');
const VIDEO_FILE = option('video', join(VIDEO_DIR, 'gmail-labels-as-tabs-demo-1080p.mp4'));
const THUMB_FILE = option('thumbnail', join(VIDEO_DIR, 'thumbnail-1280x720.png'));
const PRIVACY = option('privacy', 'private');

if (!['private', 'unlisted', 'public'].includes(PRIVACY)) {
  throw new Error(`--privacy must be private, unlisted or public, not ${PRIVACY}`);
}

function loadClient() {
  if (!existsSync(CLIENT_FILE)) {
    throw new Error(`No OAuth client at ${CLIENT_FILE}. Download the Desktop app client JSON from the Cloud console and save it there.`);
  }
  const json = JSON.parse(readFileSync(CLIENT_FILE, 'utf8'));
  const c = json.installed;
  if (!c) throw new Error('The client file is not a Desktop app client (no "installed" key).');
  return { id: c.client_id, secret: c.client_secret };
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token request failed: ${body.error} ${body.error_description ?? ''}`);
  return body;
}

// Opens Google's consent page and waits for it to redirect back to a port on
// this machine with the code.
async function signIn(client) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirect = `http://127.0.0.1:${server.address().port}`;

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  console.log(`\nOpen this address, sign in as the channel owner and pick the channel:\n\n${auth}\n`);
  spawn('xdg-open', [auth.toString()], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirect);
      if (url.pathname !== '/') { res.writeHead(404).end(); return; }
      const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(ok ? 'Signed in. You can close this tab.' : `Sign-in failed: ${url.searchParams.get('error') ?? 'bad state'}`);
      server.close();
      ok ? resolve(url.searchParams.get('code')) : reject(new Error(url.searchParams.get('error') ?? 'state mismatch'));
    });
  });

  const token = await tokenRequest({
    client_id: client.id,
    client_secret: client.secret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirect,
  });
  if (!token.refresh_token) throw new Error('Google returned no refresh token.');
  writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token.refresh_token }), { mode: 0o600 });
  return token.access_token;
}

async function accessToken(client) {
  if (existsSync(TOKEN_FILE)) {
    const { refresh_token } = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    try {
      const token = await tokenRequest({
        client_id: client.id,
        client_secret: client.secret,
        refresh_token,
        grant_type: 'refresh_token',
      });
      return token.access_token;
    } catch (err) {
      // A project in Testing mode expires refresh tokens after 7 days.
      console.log(`Saved sign-in no longer works (${err.message}); signing in again.`);
    }
  }
  return signIn(client);
}

async function api(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.split('?')[0]} failed: ${res.status} ${await res.text()}`);
  return res;
}

// The title, description and tags, from the README's "YouTube metadata" section.
function metadata() {
  const readme = readFileSync(join(VIDEO_DIR, 'README.md'), 'utf8');
  const block = (label) => {
    const m = readme.match(new RegExp(`\\*\\*${label}\\*\\*[^\\n]*\\n+\`\`\`\\n([\\s\\S]*?)\\n\`\`\``));
    if (!m) throw new Error(`README has no ${label} block`);
    return m[1].trim();
  };
  const tags = readme.match(/\*\*Tags:\*\* `([^`]+)`/)?.[1].split(',').map((t) => t.trim()) ?? [];
  return { title: block('Title'), description: block('Description:'), tags };
}

async function channel(token) {
  const res = await api(token, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
  const item = (await res.json()).items?.[0];
  if (!item) throw new Error('This sign-in has no YouTube channel.');
  return { id: item.id, title: item.snippet.title, handle: item.snippet.customUrl };
}

async function upload(token, meta) {
  const size = statSync(VIDEO_FILE).size;
  const body = {
    snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: '28', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
    status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false, embeddable: true },
  };
  const start = await api(token, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': 'video/mp4',
      'x-upload-content-length': String(size),
    },
    body: JSON.stringify(body),
  });
  const session = start.headers.get('location');
  const res = await api(token, session, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(size) },
    body: readFileSync(VIDEO_FILE),
  });
  return res.json();
}

async function setThumbnail(token, videoId) {
  try {
    await api(token, `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: readFileSync(THUMB_FILE),
    });
    console.log('Thumbnail set.');
  } catch (err) {
    // Custom thumbnails need a channel with phone verification.
    console.log(`Thumbnail not set: ${err.message}`);
  }
}

if (!flag('check') && !flag('confirm')) {
  // No sign-in and no network: everything here is read from disk.
  const meta = metadata();
  if (!existsSync(VIDEO_FILE)) throw new Error(`No video at ${VIDEO_FILE}.`);
  console.log('Dry run: nothing sent. This would upload:');
  console.log(`  Video:       ${VIDEO_FILE} (${(statSync(VIDEO_FILE).size / 1048576).toFixed(1)} MB)`);
  console.log(`  Thumbnail:   ${existsSync(THUMB_FILE) ? THUMB_FILE : `${THUMB_FILE} (missing; the upload would go ahead without it)`}`);
  console.log(`  Privacy:     ${PRIVACY}`);
  console.log(`  Title:       ${meta.title}`);
  console.log(`  Tags:        ${meta.tags.join(', ') || 'none'}`);
  console.log(`  Description:\n${meta.description.replace(/^/gm, '    ')}`);
  console.log('Add --confirm to upload it.');
  process.exit(0);
}

const client = loadClient();
const token = await accessToken(client);
const ch = await channel(token);
console.log(`Signed in to the channel "${ch.title}" (${ch.handle ?? ch.id}).`);

if (!flag('check')) {
  const meta = metadata();
  console.log(`Uploading ${VIDEO_FILE} as ${PRIVACY}: "${meta.title}"`);
  const video = await upload(token, meta);
  console.log(`Uploaded: https://youtu.be/${video.id} (status ${video.status.privacyStatus}, ${video.status.uploadStatus})`);
  await setThumbnail(token, video.id);
}
