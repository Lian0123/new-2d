import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { inflateRawSync } from 'node:zlib';
import { Script } from 'node:vm';
import { createDefaultProject } from '../src/core/model.js';
import { buildBrowserRuntime, exportProject, ExportValidationError } from './export.js';
import { createApp } from './index.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWXkAAAAASUVORK5CYII=', 'base64');
const OTHER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
let fixtureRoot: string;
let runtime: Buffer;
let server: Server;
let baseUrl: string;

// Read the ZIP central directory without depending on a second ZIP library.
function unzip(buffer: Buffer): Map<string, Buffer> {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'ZIP has an end of central directory');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + compressedSize);
    assert.ok(method === 0 || method === 8, 'ZIP uses a browser-compatible compression method');
    files.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

before(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'mio-export-test-'));
  const defaultProject = createDefaultProject();
  for (const source of [...Object.values(defaultProject.assets), ...defaultProject.layers.flatMap(layer => [layer.src, layer.waveSrc])]) {
    if (!source) continue;
    const asset = path.join(fixtureRoot, 'public', source.slice(1));
    await mkdir(path.dirname(asset), { recursive: true });
    await writeFile(asset, PNG);
  }
  runtime = await buildBrowserRuntime(process.cwd());
  server = createApp({ rootDirectory: fixtureRoot, runtime }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

test('health endpoint is available and export rejects malformed project payloads', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const allowedOrigin = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const remoteOrigin = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://example.com' } });
  assert.equal(remoteOrigin.headers.get('access-control-allow-origin'), null);
  for (const body of [{}, { project: { version: 1 } }, { project: [] }]) {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const malformed = await fetch(`${baseUrl}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
});

test('rejects traversal, remote URLs, oversized images, and non-PNG assets', async () => {
  for (const source of ['/assets/../secret.png', '/assets/%2e%2e/secret.png', 'https://example.com/image.png', '/etc/passwd', 'file:///etc/passwd']) {
    const project = createDefaultProject();
    project.assets.neutral = source;
    await assert.rejects(exportProject(project, { rootDirectory: fixtureRoot, runtime }), ExportValidationError);
  }
  const invalid = createDefaultProject();
  invalid.assets.neutral = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
  await assert.rejects(exportProject(invalid, { rootDirectory: fixtureRoot, runtime }), /valid header/);
  const oversized = createDefaultProject();
  oversized.assets.neutral = `data:image/png;base64,${Buffer.alloc(12 * 1024 * 1024 + 1).toString('base64')}`;
  await assert.rejects(exportProject(oversized, { rootDirectory: fixtureRoot, runtime }), /limit|oversized/);
  const mismatched = createDefaultProject();
  const differentDimensions = Buffer.from(PNG);
  differentDimensions.writeUInt32BE(2, 16);
  mismatched.assets.blink = `data:image/png;base64,${differentDimensions.toString('base64')}`;
  await assert.rejects(exportProject(mismatched, { rootDirectory: fixtureRoot, runtime }), /same dimensions/);
});

test('rejects symlinks that leave public assets', async () => {
  const outside = path.join(fixtureRoot, 'outside.png');
  await writeFile(outside, PNG);
  await symlink(outside, path.join(fixtureRoot, 'public/assets/escaped.png'));
  const project = createDefaultProject();
  project.assets.neutral = '/assets/escaped.png';
  await assert.rejects(exportProject(project, { rootDirectory: fixtureRoot, runtime }), /outside public\/assets/);
});

test('successful API export contains portable project, original PNG bytes, imported layer, and actual runtime', async () => {
  const project = createDefaultProject();
  project.name = '<script>alert(1)</script> 花奈';
  project.parameters.mouthOpen = 0.7;
  project.layers.push({
    id: '../accessory', name: 'Imported accessory', kind: 'custom', visible: true, locked: false,
    opacity: 0.8, x: 30, y: -10, rotation: 5, scale: 1,
    src: `data:image/png;base64,${OTHER_PNG.toString('base64')}`,
  });
  const response = await fetch(`${baseUrl}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition') ?? '', /^attachment; filename="[A-Za-z0-9_-]+\.zip"$/);
  const files = unzip(Buffer.from(await response.arrayBuffer()));
  for (const required of ['index.html', 'runtime.js', 'character.mio.json', 'README.md']) assert.ok(files.has(required), `${required} included`);
  const exported = JSON.parse(files.get('character.mio.json')!.toString());
  for (const source of Object.values(exported.assets)) {
    assert.match(source as string, /^assets\/[\w-]+\.png$/);
    assert.deepEqual(files.get(source as string), PNG);
  }
  assert.equal(exported.parameters.mouthOpen, 0.7);
  for (const layer of exported.layers.slice(0, -1)) for (const source of [layer.src, layer.waveSrc]) if (source) {
    assert.match(source, /^assets\/[\w-]+\.png$/);
    assert.deepEqual(files.get(source), PNG);
  }
  assert.deepEqual(files.get(exported.layers.at(-1).src), OTHER_PNG);
  assert.equal(files.get('runtime.js')!.toString(), runtime.toString());
  assert.ok(runtime.length > 1000, 'real browser runtime is bundled');
  const html = files.get('index.html')!.toString();
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<h1><script>'));
  assert.ok(html.includes('new window.Mio2D.CharacterPlayer'));
  assert.ok(!html.includes('https://'), 'player does not load external CDN files');
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Script(inlineScript), 'standalone controls are valid JavaScript');
  assert.equal(project.assets.neutral, '/assets/characters/hana/neutral.png', 'input project remains unchanged');
  for (const filename of files.keys()) assert.ok(!filename.includes('..') && !filename.startsWith('/'));
});
