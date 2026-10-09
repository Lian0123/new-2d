import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildBrowserRuntime } from '../server/export.js';

const destination = path.join(process.cwd(), 'public', 'runtime.js');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, await buildBrowserRuntime());
console.log(`Built browser runtime: ${destination}`);
