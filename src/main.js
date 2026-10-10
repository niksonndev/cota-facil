import './style.css';

const BASE_URL = 'https://api.coinbase.com/v2/exchange-rates';
const CACHE_KEY = 'cotafacil:ultimas';
const RATE_KEY = 'cotafacil:base'; // moeda usada como base ("USD")
const REFRESH_MS = 30_000; // meio minuto entre atualizações

/** Moedas suportadas na interface. */
const MOEDAS = [
  { codigo: 'BTC', nome: 'Bitcoin', simbolo: '₿' },
  { codigo: 'USD', nome: 'Dólar americano', simbolo: '$' },
  { codigo: 'BRL', nome: 'Real brasileiro', simbolo: 'R$' },
  { codigo: 'PYG', nome: 'Guarani paraguaio', simbolo: '₲' },
];

const SATS_POR_BTC = 100_000_000;

const app = document.getElementById('app');

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

function formatarMoeda(valor, codigo) {
  const digitos = codigo === 'PYG' ? 0 : 2;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: codigo,
    minimumFractionDigits: digitos,
    maximumFractionDigits: digitos,
  }).format(valor);
}

/**
 * Valor de Bitcoin em texto, com casas decimais escaladas pela magnitude
 * para nunca virar "0,00000000". Um guarani vale ~2e-9 BTC, abaixo de 8 casas.
 */
function formatarBtcInteligente(valor) {
  const abs = Math.abs(valor);
  // quantas casas depois da vírgula até o primeiro dígito significativo
  let digitos;
  if (abs === 0) digitos = 2;
  else if (abs >= 1) digitos = 6;
  else {
    digitos = Math.ceil(-Math.log10(abs)) + 1; // ordem de grandeza + 1
    digitos = Math.min(Math.max(digitos, 8), 20);
  }
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: digitos,
    maximumFractionDigits: digitos,
  });
}

/** Moeda em texto, aceitando mais casas decimais quando o valor é muito pequeno. */
function formatarValor(valor, codigo, digitosForcados) {
  if (digitosForcados == null) return formatarMoeda(valor, codigo);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: codigo,
    minimumFractionDigits: digitosForcados,
    maximumFractionDigits: digitosForcados,
  }).format(valor);
}

function formatarSats(valor) {
  // Valor abaixo de 1 satoshi: mostra decimal, senão "0 satoshis" esconde o dado.
  if (valor > 0 && valor < 1) {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' satoshis';
  }
  return Math.round(valor).toLocaleString('pt-BR') + ' satoshis';
}

/** Saldo cacheado na última atualização bem-sucedida (offline). */
function lerCache() {
  try {
    const bruto = localStorage.getItem(CACHE_KEY);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados !== 'object') return null;
    return dados;
  } catch {
    return null;
  }
}

function salvarCache(dados) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dados));
  } catch {
    // modo privado/cheio: segue sem cache
  }
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const state = {
  base: localStorage.getItem(RATE_KEY) || 'USD',
  caches: lerCache() || {},
  carregando: true,
  erro: null,
  atualizadoEm: null,
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Busca as taxas de uma moeda base na Coinbase.
 * @returns {Promise<{data: Record<string, number>, atualizadoEm: string}>}
 */
async function buscarTaxas(base) {
  const resposta = await fetch(`${BASE_URL}?currency=${base}`, {
    cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const json = await resposta.json();
  const rates = json?.data?.rates;
  if (!rates) throw new Error('resposta sem taxas');

  const porCodigo = {};
  for (const moeda of MOEDAS) {
    const valor = rates[moeda.codigo];
    if (valor == null || Number.isNaN(Number(valor))) {
      throw new Error(`sem taxa de ${moeda.codigo}`);
    }
    porCodigo[moeda.codigo] = Number(valor);
  }
  return { data: porCodigo, atualizadoEm: new Date().toISOString() };
}

async function atualizar() {
  state.carregando = true;
  state.erro = null;
  render();

  try {
    const { data, atualizadoEm } = await buscarTaxas(state.base);
    state.caches[state.base] = { data, atualizadoEm };
    salvarCache(state.caches);
    state.atualizadoEm = atualizadoEm;
  } catch (e) {
    state.erro = e.message || String(e);
  } finally {
    state.carregando = false;
    render();
  }
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

/** Converte "quantas unidades de `de`" para "quantas unidades de `para`". */
function taxa(de, para) {
  const rates = state.caches[state.base]?.data;
  if (!rates) return null;
  const deBase = 1 / rates[de]; // 1 unidade de `de` = quantas bases
  const paraBase = rates[para]; // 1 base = quantas `para`
  return deBase * paraBase;
}

/** A taxa de BTC sempre é exibida em inteiro + Satoshi, sem exceção. */
function secaoBitcoin(rates) {
  const usd = taxa('BTC', 'USD');
  const brl = taxa('BTC', 'BRL');
  const pyg = taxa('BTC', 'PYG');
  // 1 BTC = usd USD  →  1 Satoshi = usd / 100.000.000 USD
  const satsUsd = usd == null ? null : usd / SATS_POR_BTC;
  const satsBrl = brl == null ? null : brl / SATS_POR_BTC;

  return `
    <section class="secao secao-btc">
      <header class="secao-titulo">
        <span class="badge">₿ Bitcoin</span>
        <button class="btn-limpar" data-acao="voltar-base" hidden>↺ voltar para USD</button>
      </header>

      <div class="linha-preco">
        <div>
          <p class="rotulo">1 BTC inteiro</p>
          <p class="preco-grande">${formatarMoeda(usd ?? 0, 'USD')}</p>
          <p class="equivalente">${formatarMoeda(brl ?? 0, 'BRL')} · ${formatarMoeda(pyg ?? 0, 'PYG')}</p>
        </div>
      </div>

      <div class="linha-preco">
        <div>
          <p class="rotulo">1 Satoshi</p>
          <p class="preco-grande preco-sats">${formatarValor(satsUsd ?? 0, 'USD', 8)}</p>
          <p class="equivalente">${formatarValor(satsBrl ?? 0, 'BRL', 10)}</p>
        </div>
      </div>
    </section>
  `;
}

function secaoMoeda(moeda, rates) {
  if (moeda.codigo === 'BTC') return secaoBitcoin(rates);

  const paraBtc = taxa(moeda.codigo, 'BTC');
  const sats = paraBtc == null ? null : paraBtc * SATS_POR_BTC;
  const ativa = state.base === moeda.codigo;

  return `
    <section class="secao ${ativa ? 'secao-ativa' : ''}">
      <header class="secao-titulo">
        <span class="badge">${moeda.simbolo} ${moeda.nome}</span>
        ${ativa ? '' : `<button class="btn-usar" data-usar="${moeda.codigo}">usar como base</button>`}
      </header>

      <div class="linha-preco">
        <div>
          <p class="rotulo">1 ${moeda.codigo} em Bitcoin</p>
          <p class="preco-grande">${formatarBtcInteligente(paraBtc ?? 0)} BTC</p>
          <p class="equivalente">${formatarSats(sats ?? 0)}</p>
        </div>
      </div>
    </section>
  `;
}

function render() {
  const cache = state.caches[state.base];
  const rates = cache?.data || null;
  const offline = cache && state.erro;

  const atualizado = cache?.atualizadoEm
    ? new Date(cache.atualizadoEm).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  const status = state.carregando
    ? 'atualizando…'
    : state.erro
      ? `sem conexão · usando valor salvo às ${atualizado}`
      : `atualizado às ${atualizado}`;

  app.innerHTML = `
    <header class="topo">
      <div>
        <h1>Cota Fácil</h1>
        <p class="status">${status}</p>
      </div>
      <button class="btn-atualizar" data-acao="atualizar" ${state.carregando ? 'disabled' : ''}>
        ${state.carregando ? '…' : '↻'}
      </button>
    </header>

    <main>
      ${rates
        ? MOEDAS.map((m) => secaoMoeda(m, rates)).join('')
        : `<p class="carregando">Carregando cotações…</p>`}
    </main>

    <footer>
      <p>Fonte: Coinbase · base ${state.base} · atualiza a cada 30s</p>
    </footer>
  `;

  // Liga os botões
  app.querySelectorAll('[data-usar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.base = btn.dataset.usar;
      localStorage.setItem(RATE_KEY, state.base);
      if (!state.caches[state.base]) atualizar();
      else render();
    });
  });
  app.querySelectorAll('[data-acao="atualizar"]').forEach((btn) => {
    btn.addEventListener('click', () => atualizar());
  });
  app.querySelectorAll('[data-acao="voltar-base"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.base = 'USD';
      localStorage.setItem(RATE_KEY, 'USD');
      if (!state.caches[state.base]) atualizar();
      else render();
    });
  });

  // O botão "voltar para USD" só existe quando a base não é USD.
  const voltar = app.querySelector('[data-acao="voltar-base"]');
  if (voltar) voltar.hidden = state.base === 'USD';

  document.documentElement.dataset.offline = state.erro ? 'true' : 'false';
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

if ('serviceWorker' in navigator) {
  const eraControlada = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').then(() => {
    // Só recarrega quem já estava controlada: a primeira visita não deve
    // recarregar sozinha logo após o install.
    if (eraControlada) window.location.reload();
  }).catch(() => {
    // SW não registrado (ex.: arquivo): app segue funcionando online.
  });
}

render();
atualizar();
setInterval(atualizar, REFRESH_MS);

// Volta a atualizar na hora quando o app volta a ter conexão.
window.addEventListener('online', () => atualizar());
