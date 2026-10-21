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

function normalizarBase(valor) {
  let base = String(valor || '/').trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

// O padrão é a subpasta do GitHub Pages; `BASE_PATH=/` permite publicar na
// raiz do domínio sem editar o código.
const BASE = normalizarBase(process.env.BASE_PATH || '/cota-facil/');

const PATTERN = /\.(?:js|css|html|svg|png|ico|webmanifest|woff2?)$/;
// sw.js e o manifesto fora do precache (travaria a atualização); 404.html é
// cópia do index.html, não precisa entrar duas vezes.
const IGNORE = new Set(['sw.js', 'precache-manifest.json', '404.html']);

const listFiles = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });

/**
 * `%BASE_URL%` do Vite duplicava a subpasta no servidor de desenvolvimento
 * (`/cota-facil/cota-facil/tema.js`). O token próprio é resolvido igual no dev
 * e no build e continua sendo um caminho absoluto — necessário porque o shell
 * também é servido em deep links como /cota-facil/qualquer/.
 */
function appBaseToken() {
  return {
    name: 'app:base-token',
    transformIndexHtml(html) {
      return html.replaceAll('%APP_BASE%', BASE);
    },
  };
}

/** O HMR do Vite usa websocket; só o servidor de desenvolvimento o libera. */
function devCsp() {
  return {
    name: 'app:csp-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        'connect-src https://api.coinbase.com;',
        'connect-src https://api.coinbase.com ws: wss:;',
      );
    },
  };
}

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
  plugins: [appBaseToken(), devCsp(), pwaPrecacheManifest()],
});
