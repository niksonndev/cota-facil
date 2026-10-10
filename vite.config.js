import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

const BASE = '/';

const PATTERN = /\.(?:js|css|html|svg|png|ico|webmanifest|woff2?)$/;
// sw.js e o manifesto fora do precache (travaria a atualização); 404.html é
// cópia do index.html, não precisa entrar duas vezes.
const IGNORE = new Set(['sw.js', 'precache-manifest.json', '404.html']);

const listFiles = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });

function pwaPrecacheManifest() {
  return {
    name: 'app:precache-manifest',
    apply: 'build',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html');

      const toPath = (f) => relative('dist', f).split(sep).join('/');
      const files = listFiles('dist')
        .filter((f) => !IGNORE.has(toPath(f)) && PATTERN.test(toPath(f)))
        .sort();

      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(toPath(f));
        hash.update(readFileSync(f));
      }
      const version = hash.digest('hex').slice(0, 12);

      writeFileSync(
        'dist/precache-manifest.json',
        `${JSON.stringify({ base: BASE, version, assets: files.map(toPath) }, null, 2)}\n`,
      );

      const swPath = 'dist/sw.js';
      const sw = readFileSync(swPath, 'utf8');
      if (!sw.includes('precache-version:')) {
        appendFileSync(swPath, `\n/* precache-version: ${version} */\n`);
      }
    },
  };
}

export default defineConfig({
  base: BASE,
  build: { target: 'es2020' },
  plugins: [pwaPrecacheManifest()],
});
