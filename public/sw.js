/* eslint-env serviceworker */
/**
 * Service worker padrão (sem workbox).
 *
 * - install: lê precache-manifest.json (gerado no build) e guarda o app shell
 *   num cache versionado pelo hash do conteúdo do build.
 * - activate: descarta caches de versões antigas e assume o controle.
 * - navegação: network-first com fallback para o index.html em cache; resposta
 *   de erro do host (404 de deep link sem rewrite) também cai no shell.
 * - assets: stale-while-revalidate.
 * - outra origem (API): passa direto para a rede, nada de dado de usuário no cache.
 *
 * Tudo é resolvido contra `self.registration.scope`: assim o mesmo arquivo
 * funciona na raiz e em subpasta (GitHub Pages de projeto fica em /<repo>/).
 * Os caminhos do precache são relativos a essa base (ex.: 'assets/x.js').
 */

const CACHE_PREFIX = 'cotafacil';
const MANIFEST_URL = 'precache-manifest.json';
const FALLBACK_URL = 'index.html';

/**
 * Nome do cache da versão em uso. Não pode viver só em memória: o navegador
 * encerra o SW ocioso e recria o escopo — se o nome se perdesse, o precache
 * ficaria invisível para o fetch handler e o app não abriria offline.
 */
let currentCacheName = null;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

async function activeCache() {
  if (!currentCacheName) {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith(`${CACHE_PREFIX}-`),
    );
    currentCacheName = names.sort().pop() || `${CACHE_PREFIX}-runtime`;
  }
  return caches.open(currentCacheName);
}

async function precache() {
  const response = await fetch(scopeUrl(MANIFEST_URL), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifesto indisponível (${response.status})`);

  const { version, assets } = await response.json();
  const cacheName = `${CACHE_PREFIX}-${version}`;
  const cache = await caches.open(cacheName);

  // addAll falha inteiro se um arquivo falhar; cada asset é opcional para o app
  // não ficar sem SW por causa de um 404.
  await Promise.all(
    assets.map(async (asset) => {
      try {
        // scopeUrl(asset) direto: o caminho já é relativo à base. Um slice(1)
        // aqui duplicaria a subpasta quando o app não está na raiz.
        await cache.add(new Request(scopeUrl(asset), { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] não foi possível pré-cachear', asset, error);
      }
    }),
  );

  currentCacheName = cacheName;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precache();
      } catch (error) {
        console.warn('[sw] precache falhou:', error);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith(`${CACHE_PREFIX}-`) && name !== currentCacheName,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const OFFLINE_PAGE =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="theme-color" content="#0f1115">' +
  '<body style="margin:0;background:#0f1115;color:#f4f6f9;font-family:system-ui;' +
  'display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">' +
  '<div><h1 style="font-size:1.25rem">Você está offline</h1>' +
  '<p style="color:#8b95a7">Sem conexão agora. As últimas cotações salvas continuam aqui.</p>' +
  '</div></body></html>';

async function networkFirstNavigation(request) {
  const cache = await activeCache();

  try {
    const response = await fetch(request);

    // Erro do host (ex.: 404 em rota interna sem rewrite de SPA): serve o shell.
    if (!response.ok) {
      const shell = await caches.match(scopeUrl(FALLBACK_URL), {
        ignoreVary: true,
      });
      if (shell) return shell;
    }

    cache.put(scopeUrl(FALLBACK_URL), response.clone());
    return response;
  } catch (error) {
    const cached =
      (await caches.match(scopeUrl(FALLBACK_URL), { ignoreVary: true })) ||
      (await caches.match(request, { ignoreVary: true }));
    if (cached) return cached;

    return new Response(OFFLINE_PAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await activeCache();

  // ignoreVary é obrigatório: o host responde "Vary: Origin" e o Chrome envia
  // Origin nos assets com crossorigin (script/stylesheet do build). Comparando
  // o Vary, o match com o Request real erra o alvo e o app fica sem JS/CSS
  // offline (tela branca, 504 no lugar do arquivo).
  const cached = await cache.match(request, { ignoreVary: true });

  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await network;
  return (
    response ||
    new Response('', { status: 504, statusText: 'Offline e sem cópia em cache' })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API/outra origem: sempre rede
  if (url.pathname.endsWith(MANIFEST_URL)) return; // manifesto: sempre rede
  if (url.pathname.endsWith('/sw.js')) return; // script do SW: sempre rede

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
