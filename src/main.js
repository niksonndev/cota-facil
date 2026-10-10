import './style.css';

const BASE_URL = 'https://api.coinbase.com/v2/exchange-rates';
const CACHE_KEY = 'cotafacil:taxas';
const FOCO_KEY = 'cotafacil:foco';
const REFRESH_MS = 60_000; // um minuto entre atualizações

const SATS_POR_BTC = 100_000_000;

/**
 * Moedas exibidas. `tipo` decide a formatação:
 *  - 'btc': casas decimais escaladas (nunca vira 0,00000000)
 *  - 'sats': inteiro com separador de milhar
 *  - 'fiat': N casas decimais fixas
 */
const MOEDAS = [
  { codigo: 'BTC', nome: 'Bitcoin', rotulo: 'BTC', simbolo: '₿', bandeira: '₿', tipo: 'btc', casas: null, btc: true },
  { codigo: 'SATS', nome: 'Bitcoin (Satoshi)', rotulo: 'SATS', simbolo: 'sat', bandeira: '⚡', tipo: 'sats', casas: 0, btc: false },
  { codigo: 'USD', nome: 'Dólar americano', rotulo: 'USD', simbolo: '$', bandeira: '🇺🇸', tipo: 'fiat', casas: 2, btc: false },
  { codigo: 'BRL', nome: 'Real brasileiro', rotulo: 'BRL', simbolo: 'R$', bandeira: '🇧🇷', tipo: 'fiat', casas: 2, btc: false },
  { codigo: 'PYG', nome: 'Guarani paraguaio', rotulo: 'PYG', simbolo: '₲', bandeira: '🇵🇾', tipo: 'fiat', casas: 0, btc: false },
];

const app = document.getElementById('app');

/**
 * Dispositivo de toque (celular/tablet): o campo não deve abrir o teclado do
 * sistema — o app já tem o próprio teclado numérico. No computador o campo
 * continua digitável normalmente.
 */
const DISPOSITIVO_TOQUE =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

/** Bitcoin: casas decimais escaladas pela magnitude. */
function formatarBtc(valor) {
  const abs = Math.abs(valor);
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

/** Satoshi: inteiro, com separador de milhar. */
function formatarSats(valor) {
  return Math.round(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** Fiat: N casas, sem símbolo (o símbolo fica na etiqueta da linha). */
function formatarFiat(valor, casas) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarValor(valor, moeda) {
  if (moeda.tipo === 'btc') return formatarBtc(valor);
  if (moeda.tipo === 'sats') return formatarSats(valor);
  return formatarFiat(valor, moeda.casas);
}

function moedaInfo(codigo) {
  return MOEDAS.find((m) => m.codigo === codigo) || MOEDAS[0];
}

/**
 * Converte um texto digitado (pt-BR, vírgula decimal) em número.
 * Aceita "1.234,56", "1234.56" e "1234,56".
 */
function parseNumero(texto) {
  if (!texto) return NaN;
  const limpo = String(texto)
    .replace(/[^\d.,]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // ponto como separador de milhar
    .replace(',', '.');
  return Number.parseFloat(limpo);
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const state = {
  caches: lerCache() || {},
  carregando: true,
  erro: null,
  // Moeda do campo em edição; as demais são derivadas dela.
  foco: localStorage.getItem(FOCO_KEY) || 'BRL',
  // Texto bruto que o usuário está digitando no campo em foco.
  buffer: '1',
};

function lerCache() {
  try {
    const bruto = localStorage.getItem(CACHE_KEY);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return dados && typeof dados === 'object' ? dados : null;
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

/**
 * Taxa de cada moeda numa base comum (USD): taxa[X] = quantos X valem 1 USD.
 * Derivado só do cache, então trocar o campo em foco nunca depende da API.
 */
function tabelaPrecos() {
  const entradas = Object.values(state.caches);
  for (const entrada of entradas) {
    const r = entrada?.data;
    if (!r) continue;
    const taxa = {};
    if (r.USD != null) taxa.USD = r.USD;
    if (r.BRL != null) taxa.BRL = r.BRL;
    if (r.PYG != null) taxa.PYG = r.PYG;
    if (r.BTC != null) {
      taxa.BTC = r.BTC;
      taxa.SATS = r.BTC * SATS_POR_BTC;
    }
    if (MOEDAS.every((m) => taxa[m.codigo] != null)) {
      return { taxa, atualizadoEm: entrada.atualizadoEm };
    }
  }
  return null;
}

/** Converte `qtd` da moeda `de` para a moeda `para`. */
function converter(qtd, de, para) {
  const t = tabelaPrecos();
  if (!t) return null;
  if (t.taxa[de] == null || t.taxa[para] == null) return null;
  if (de === para) return qtd;
  return (qtd / t.taxa[de]) * t.taxa[para];
}

function quantidadeAtual() {
  const n = parseNumero(state.buffer);
  return Number.isNaN(n) ? 0 : n;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function buscarTaxas(base) {
  const resposta = await fetch(`${BASE_URL}?currency=${base}`, {
    cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const json = await resposta.json();
  const rs = json?.data?.rates;
  if (!rs) throw new Error('resposta sem taxas');

  const porCodigo = {};
  for (const chave of ['USD', 'BRL', 'PYG', 'BTC']) {
    const valor = rs[chave];
    if (valor == null || Number.isNaN(Number(valor))) {
      throw new Error(`sem taxa de ${chave}`);
    }
    porCodigo[chave] = Number(valor);
  }
  return { data: porCodigo, atualizadoEm: new Date().toISOString() };
}

async function atualizar() {
  state.carregando = true;
  state.erro = null;
  render();

  try {
    // Base fixa em USD: a tabela de preços é sempre relativa a USD, então o
    // campo em edição do usuário não interfere na busca.
    const { data, atualizadoEm } = await buscarTaxas('USD');
    state.caches.USD = { data, atualizadoEm };
    salvarCache(state.caches);
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

function linhaMoeda(moeda) {
  const t = tabelaPrecos();
  const ehFoco = moeda.codigo === state.foco;

  let valorTexto = '';
  if (ehFoco) {
    valorTexto = state.buffer;
  } else if (t) {
    const v = converter(quantidadeAtual(), state.foco, moeda.codigo);
    valorTexto = v == null ? '' : formatarValor(v, moeda);
  }

  const classeBandeira = moeda.btc ? 'bandeira bandeira-btc' : 'bandeira';

  return `
    <section class="linha ${ehFoco ? 'linha-foco' : ''}" data-linha="${moeda.codigo}">
      <button class="esq" type="button" data-focar="${moeda.codigo}" aria-label="Editar ${moeda.nome}">
        <span class="${classeBandeira}">${moeda.bandeira}</span>
        <span class="cod">
          <strong>${moeda.rotulo}</strong>
          <span class="sim">${moeda.simbolo}</span>
        </span>
      </button>

      <div class="dir">
        <span class="nome">${moeda.nome}</span>
        <input
          class="valor"
          type="text"
          inputmode="${DISPOSITIVO_TOQUE ? 'none' : 'decimal'}"
          ${DISPOSITIVO_TOQUE ? 'readonly' : ''}
          autocomplete="off"
          spellcheck="false"
          data-moeda="${moeda.codigo}"
          value="${escapeAttr(valorTexto)}"
          aria-label="${moeda.nome}"
        />
      </div>
    </section>
  `;
}

function tecla(valor, classe = '') {
  return `<button class="tecla ${classe}" type="button" data-tecla="${valor}">${valor}</button>`;
}

function render() {
  const t = tabelaPrecos();
  const atualizado = t?.atualizadoEm
    ? new Date(t.atualizadoEm).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const status = state.carregando
    ? 'atualizando…'
    : state.erro
      ? `sem conexão · salvo às ${atualizado}`
      : `atualizado às ${atualizado}`;

  app.innerHTML = `
    <header class="topo">
      <div class="topo-esq">
        <h1>Cota Fácil</h1>
        <p class="status">${status}</p>
      </div>
      <button class="btn-atualizar" type="button" data-acao="atualizar" ${state.carregando ? 'disabled' : ''} aria-label="Atualizar">
        ${state.carregando ? '…' : '↻'}
      </button>
    </header>

    <main>${MOEDAS.map(linhaMoeda).join('')}</main>

    <div class="teclado">
      ${tecla('7')}${tecla('8')}${tecla('9')}${tecla('⌫', 'fn')}
      ${tecla('4')}${tecla('5')}${tecla('6')}${tecla('AC', 'fn')}
      ${tecla('1')}${tecla('2')}${tecla('3')}${tecla(',', 'fn')}
      ${tecla('00')}${tecla('0')}${tecla('.', 'fn largo')}
    </div>

    <footer><p>Fonte: Coinbase · atualiza a cada minuto</p></footer>
  `;

  ligarEventos();
  document.documentElement.dataset.offline = state.erro ? 'true' : 'false';
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function ligarEventos() {
  // Clicar na etiqueta (esquerda) foca aquela moeda.
  app.querySelectorAll('[data-focar]').forEach((btn) => {
    btn.addEventListener('click', () => focarMoeda(btn.dataset.focar));
  });

  // Digitar com o teclado do sistema.
  app.querySelectorAll('.valor').forEach((input) => {
    const moeda = input.dataset.moeda;
    input.addEventListener('focus', () => {
      if (state.foco !== moeda) focarMoeda(moeda);
    });
    input.addEventListener('input', () => {
      state.foco = moeda;
      localStorage.setItem(FOCO_KEY, moeda);
      state.buffer = input.value;
      atualizarRealce();
      atualizarDerivados();
    });
  });

  // Teclado numérico da tela (sempre aberto).
  app.querySelectorAll('[data-tecla]').forEach((btn) => {
    btn.addEventListener('click', () => aplicarTecla(btn.dataset.tecla));
  });

  app.querySelectorAll('[data-acao="atualizar"]').forEach((btn) => {
    btn.addEventListener('click', () => atualizar());
  });
}

/** Troca a moeda em edição, convertendo o valor atual. */
function focarMoeda(codigo) {
  if (state.foco === codigo) return;
  const v = converter(quantidadeAtual(), state.foco, codigo);
  state.foco = codigo;
  localStorage.setItem(FOCO_KEY, codigo);
  if (v != null && !Number.isNaN(v)) {
    state.buffer = formatarValor(v, moedaInfo(codigo)).replace(/\u00a0/g, ' ');
  }
  render();
  const el = app.querySelector(`.valor[data-moeda="${codigo}"]`);
  if (el) {
    el.focus();
    el.select();
  }
}

/** Aplica uma tecla do teclado da tela no campo em foco. */
function aplicarTecla(t) {
  let b = state.buffer;

  if (t === 'AC') {
    b = '0';
  } else if (t === '⌫') {
    b = b.slice(0, -1);
    if (b === '' || b === '-') b = '0';
  } else if (t === ',' || t === '.') {
    if (!b.includes(',')) b = (b === '' ? '0' : b) + ',';
  } else {
    // dígitos e "00"
    if (b === '0') b = '';
    b += t;
  }

  state.buffer = b;
  render();
  const el = app.querySelector(`.valor[data-moeda="${state.foco}"]`);
  if (el) {
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }
}

/** Move o destaque laranja para a linha da moeda em edição. */
function atualizarRealce() {
  app.querySelectorAll('.linha').forEach((sec) => {
    sec.classList.toggle('linha-foco', sec.dataset.linha === state.foco);
  });
}

/** Recalcula e reescreve só os campos que NÃO estão em foco. */
function atualizarDerivados() {
  const qtd = quantidadeAtual();
  for (const moeda of MOEDAS) {
    if (moeda.codigo === state.foco) continue;
    const el = app.querySelector(`.valor[data-moeda="${moeda.codigo}"]`);
    if (!el) continue;
    const v = converter(qtd, state.foco, moeda.codigo);
    el.value = v == null ? '' : formatarValor(v, moeda);
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

if ('serviceWorker' in navigator) {
  // Recarrega só quando um SW NOVO assume o controle (atualização de versão).
  // Antes a página recarregava sozinha a cada abertura, apagando o estado
  // digitado. Aqui o reload depende de `jaControlada`, então não há laço.
  const jaControlada = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaControlada || recarregando) return;
    recarregando = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // sem SW (ex.: arquivo): o app segue funcionando online
  });
}

render();
atualizar();
setInterval(atualizar, REFRESH_MS);
window.addEventListener('online', () => atualizar());
