/**
 * Valida o build PWA depois do `pnpm build` (rode também no CI).
 *
 * Existe porque manifest/ícone/precache/base quebrado passa em lint e testes —
 * e o problema só aparece na hora de instalar no celular ou depois do deploy.
 *
 * Uso: node scripts/check-pwa.mjs   (espera o build em ./dist,
 * ou em PWA_DIST_DIR)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.PWA_DIST_DIR || 'dist';
const problems = [];

function readJson(file) {
  const path = join(DIST, file);
  if (!existsSync(path)) {
    problems.push(`faltando no build: ${file}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`${file}: JSON inválido (${error.message})`);
    return null;
  }
}

const readText = (file) =>
  existsSync(join(DIST, file)) ? readFileSync(join(DIST, file), 'utf8') : '';

// O precache carrega a base do build (ex.: /m-nance/ no GitHub Pages) — é o que
// permite converter link absoluto do HTML em caminho dentro de dist.
const precache = readJson('precache-manifest.json');
const base = precache?.base ?? '/';

/** Caminho dentro de dist para um link do HTML/manifest. */
const paraDist = (url) => {
  const texto = String(url);
  const semBase = texto.startsWith(base) ? texto.slice(base.length) : texto;
  return join(DIST, semBase.replace(/^\//, ''));
};

// 1. Arquivos obrigatórios
for (const file of [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'precache-manifest.json',
]) {
  if (!existsSync(join(DIST, file))) problems.push(`faltando no build: ${file}`);
}

// 2. Manifest: campos exigidos para o navegador oferecer a instalação
const manifest = readJson('manifest.webmanifest');
if (manifest) {
  for (const field of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (!manifest[field]) problems.push(`manifest sem "${field}"`);
  }
  if (manifest.display !== 'standalone') {
    problems.push(`manifest.display é "${manifest.display}" (esperado standalone)`);
  }

  // start_url/scope relativos: é o que faz o app funcionar tanto na raiz quanto
  // na subpasta de um host de projeto. O `id` fica de fora de propósito — o
  // Chrome resolve id relativo contra a origem (viraria a raiz do host e
  // colidiria com outro app da mesma conta).
  for (const field of ['start_url', 'scope']) {
    const valor = String(manifest[field] ?? '');
    if (valor.startsWith('/')) {
      problems.push(`manifest.${field} absoluto ("${valor}") em vez de relativo`);
    }
  }

  const icons = manifest.icons ?? [];
  for (const size of ['192x192', '512x512']) {
    if (!icons.some((icon) => (icon.sizes ?? '').includes(size))) {
      problems.push(`manifest sem ícone ${size} (obrigatório)`);
    }
  }
  if (!icons.some((icon) => (icon.purpose ?? '').includes('maskable'))) {
    problems.push('manifest sem ícone maskable (Android corta o ícone)');
  }
  for (const icon of icons) {
    if (!existsSync(paraDist(icon.src))) {
      problems.push(`ícone listado e ausente: ${icon.src}`);
    }
  }
}

// 3. Precache: cobre o app shell, só lista o que existe e é relativo à base
if (precache) {
  const assets = precache.assets ?? [];
  if (!precache.version) problems.push('precache sem version');
  if (!precache.base) problems.push('precache sem base');
  if (assets.length === 0) problems.push('precache sem assets');
  for (const asset of assets) {
    if (asset.startsWith('/')) {
      problems.push(
        `asset absoluto no precache ("${asset}") — não resolve em subpasta`,
      );
    }
    if (!existsSync(paraDist(asset))) {
      problems.push(`asset listado e ausente: ${asset}`);
    }
  }
  if (!assets.includes('index.html')) {
    problems.push('precache sem index.html (fallback offline quebra)');
  }
  if (assets.includes('sw.js')) {
    problems.push('sw.js não pode estar no precache (trava atualizações)');
  }

  // O sw.js precisa carregar a marca da versão: é o que faz o navegador
  // reinstalar o SW (e repopular o precache) quando os assets mudam.
  if (!readText('sw.js').includes(`precache-version: ${precache.version}`)) {
    problems.push(
      'sw.js sem a marca da versão do precache (atualização offline trava)',
    );
  }
}

// 4. index.html: links do PWA, base aplicada e deep link no Pages
const html = readText('index.html');
for (const marker of [
  'rel="manifest"',
  'apple-touch-icon',
  'theme-color',
  'apple-mobile-web-app-capable',
]) {
  if (!html.includes(marker)) problems.push(`index.html sem ${marker}`);
}
if (/%BASE[^_U]/.test(html)) {
  problems.push('index.html com token %BASE% não substituído (use %BASE_URL%)');
}

// A CSP do index.html usa `script-src 'self'`: script inline é bloqueado pelo
// navegador sem aviso no build. Era assim que o tema salvo deixava de valer
// antes da pintura e a tela piscava no tema errado.
const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
for (const attrs of scripts) {
  const src = attrs.match(/\bsrc="([^"]+)"/)?.[1];
  if (!src) {
    problems.push('index.html com script inline (bloqueado pela CSP)');
    continue;
  }
  if (!src.startsWith('http') && !existsSync(paraDist(src))) {
    problems.push(`index.html aponta script inexistente: ${src}`);
  }
}

const manifestHref = html.match(/rel="manifest"\s+href="([^"]+)"/)?.[1];
if (manifestHref) {
  if (!manifestHref.startsWith(base)) {
    problems.push(
      `index.html aponta o manifest para "${manifestHref}", fora da base "${base}"`,
    );
  }
  if (!existsSync(paraDist(manifestHref))) {
    problems.push(`index.html aponta para manifest inexistente: ${manifestHref}`);
  }
}

// 5. Host sem rewrite de SPA (GitHub Pages) precisa do 404.html = index.html
if (existsSync(join(DIST, '404.html'))) {
  if (html && readText('404.html') !== html) {
    problems.push('404.html difere do index.html (deep link no Pages quebra)');
  }
  if (precache?.assets?.includes('404.html')) {
    problems.push('404.html não precisa estar no precache');
  }
}

if (problems.length > 0) {
  console.error('Build PWA inválido:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(
  `Build PWA ok: base ${base}, ${precache.assets.length} assets pré-cacheados, ` +
    `${manifest.icons.length} ícones, versão ${precache.version}.`,
);
