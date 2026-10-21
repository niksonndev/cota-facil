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

async function versaoDoManifesto() {
  const response = await fetch(scopeUrl(MANIFEST_URL), { cache: 'no-store' });
  if (!response.ok)
    throw new Error(`Manifesto indisponível (${response.status})`);
  const { version } = await response.json();
  return `${CACHE_PREFIX}-${version}`;
}

async function activeCache() {
  if (!currentCacheName) {
    try {
      currentCacheName = await versaoDoManifesto();
    } catch {
      // Sem manifesto (offline antes do primeiro precache): procura o cache
      // mais novo que existir, sem inventar um nome que apagaria os outros.
    }
  }

  if (currentCacheName && (await caches.has(currentCacheName))) {
    return caches.open(currentCacheName);
  }

  const names = (await caches.keys())
    .filter((name) => name.startsWith(`${CACHE_PREFIX}-`))
    .sort();
  currentCacheName = names.pop() || `${CACHE_PREFIX}-runtime`;
  return caches.open(currentCacheName);
}

async function precache() {
  const response = await fetch(scopeUrl(MANIFEST_URL), { cache: 'no-store' });
  if (!response.ok)
    throw new Error(`Manifesto indisponível (${response.status})`);

  const { version, assets } = await response.json();
  const cacheName = `${CACHE_PREFIX}-${version}`;
  const cache = await caches.open(cacheName);
  let indexOk = false;

  // addAll falha inteiro se um arquivo falhar; assets isolados não derrubam o
  // app inteiro, mas sem o index.html não existe fallback offline confiável.
  await Promise.all(
    assets.map(async (asset) => {
      try {
        // scopeUrl(asset) direto: o caminho já é relativo à base. Um slice(1)
        // aqui duplicaria a subpasta quando o app não está na raiz.
        await cache.add(new Request(scopeUrl(asset), { cache: 'reload' }));
        if (asset === FALLBACK_URL) indexOk = true;
      } catch (error) {
        console.warn('[sw] não foi possível pré-cachear', asset, error);
      }
    }),
  );

  if (!indexOk) {
    await caches.delete(cacheName);
    throw new Error('precache sem index.html');
  }

  currentCacheName = cacheName;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Se o precache falhar, NÃO assume o controle: o SW antigo continua
      // servindo o app em vez de deixar o usuário com um cache incompleto.
      await precache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      let manter = currentCacheName;
      if (!manter) {
        try {
          manter = await versaoDoManifesto();
          currentCacheName = manter;
        } catch {
          // Não sabe qual é a versão atual: na dúvida, não apaga nada.
        }
      }

      if (manter && (await caches.has(manter))) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter(
              (name) => name.startsWith(`${CACHE_PREFIX}-`) && name !== manter,
            )
            .map((name) => caches.delete(name)),
        );
      }

      await self.clients.claim();
    })(),
  );
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

    // Erro do host (ex.: 404 em deep link sem rewrite de SPA): serve o shell.
    // Outros erros (5xx) voltam como vieram, para não esconder o problema.
    if (response.status === 404) {
      const shell = await cache.match(scopeUrl(FALLBACK_URL), {
        ignoreVary: true,
      });
      if (shell) return shell;
    }

    const tipo = response.headers.get('content-type') || '';
    if (response.ok && tipo.includes('text/html')) {
      try {
        await cache.put(scopeUrl(FALLBACK_URL), response.clone());
      } catch (error) {
        console.warn('[sw] não foi possível atualizar o shell', error);
      }
    }
    return response;
  } catch (error) {
    const cached =
      (await cache.match(scopeUrl(FALLBACK_URL), { ignoreVary: true })) ||
      (await cache.match(request, { ignoreVary: true }));
    if (cached) return cached;

    return new Response(OFFLINE_PAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await activeCache();

  // ignoreVary é obrigatório: o host responde "Vary: Origin" e o Chrome envia
  // Origin nos assets com crossorigin (script/stylesheet do build). Comparando
  // o Vary, o match com o Request real erra o alvo e o app fica sem JS/CSS
  // offline (tela branca, 504 no lugar do arquivo).
  const cached = await cache.match(request, { ignoreVary: true });

  const network = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        // Espera a gravação: sem isso o navegador pode encerrar o SW antes de
        // o cache.put terminar e a próxima abertura fica sem o asset.
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn('[sw] não foi possível revalidar', request.url, error);
        }
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Mesmo servindo do cache, mantém o evento vivo até a revalidação acabar.
    event.waitUntil(network);
    return cached;
  }

  const response = await network;
  return (
    response ||
    new Response('', {
      status: 504,
      statusText: 'Offline e sem cópia em cache',
    })
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

  event.respondWith(staleWhileRevalidate(request, event));
});
