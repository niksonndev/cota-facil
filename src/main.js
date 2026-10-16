import './style.css';
import { criarSugestaoInstalacao } from './instalar.js';

const BASE_URL = 'https://api.coinbase.com/v2/exchange-rates';
const CACHE_KEY = 'cotafacil:taxas';
const FOCO_KEY = 'cotafacil:foco';
const TEMA_KEY = 'cotafacil:tema';
const MOEDAS_KEY = 'cotafacil:moedas';
const REFRESH_MS = 60_000; // um minuto entre atualizações

const SATS_POR_BTC = 100_000_000;

/**
 * Catálogo de moedas. `casas` é o número de casas decimais na exibição e
 * `decimais` controla se o teclado aceita fração (moedas muito inflacionadas,
 * como ARS e PYG, mostram inteiro).
 *
 * A tabela fica uma linha por moeda, mesmo passando das 80 colunas: com 15
 * moedas, o bloco de 8 linhas por item que o prettier faria enterra a leitura
 * de quem só quer comparar os campos de uma moeda com os da de cima.
 */
// prettier-ignore
const CATALOGO = [
  { codigo: 'BTC', nome: 'Bitcoin', rotulo: 'BTC', simbolo: '₿', bandeira: '₿', tipo: 'btc', casas: 2, btc: true },
  { codigo: 'SATS', nome: 'Bitcoin (Satoshi)', rotulo: 'SATS', simbolo: 'sat', bandeira: '⚡', tipo: 'sats', casas: 0, btc: false },
  { codigo: 'USD', nome: 'Dólar americano', rotulo: 'USD', simbolo: '$', bandeira: '🇺🇸', tipo: 'fiat', casas: 2 },
  { codigo: 'EUR', nome: 'Euro', rotulo: 'EUR', simbolo: '€', bandeira: '🇪🇺', tipo: 'fiat', casas: 2 },
  { codigo: 'BRL', nome: 'Real brasileiro', rotulo: 'BRL', simbolo: 'R$', bandeira: '🇧🇷', tipo: 'fiat', casas: 2 },
  { codigo: 'GBP', nome: 'Libra esterlina', rotulo: 'GBP', simbolo: '£', bandeira: '🇬🇧', tipo: 'fiat', casas: 2 },
  { codigo: 'ARS', nome: 'Peso argentino', rotulo: 'ARS', simbolo: '$', bandeira: '🇦🇷', tipo: 'fiat', casas: 0 },
  { codigo: 'MXN', nome: 'Peso mexicano', rotulo: 'MXN', simbolo: '$', bandeira: '🇲🇽', tipo: 'fiat', casas: 2 },
  { codigo: 'PYG', nome: 'Guarani paraguaio', rotulo: 'PYG', simbolo: '₲', bandeira: '🇵🇾', tipo: 'fiat', casas: 0 },
  { codigo: 'UYU', nome: 'Peso uruguaio', rotulo: 'UYU', simbolo: '$', bandeira: '🇺🇾', tipo: 'fiat', casas: 2 },
  { codigo: 'CLP', nome: 'Peso chileno', rotulo: 'CLP', simbolo: '$', bandeira: '🇨🇱', tipo: 'fiat', casas: 0 },
  { codigo: 'CAD', nome: 'Dólar canadense', rotulo: 'CAD', simbolo: '$', bandeira: '🇨🇦', tipo: 'fiat', casas: 2 },
  { codigo: 'JPY', nome: 'Iene japonês', rotulo: 'JPY', simbolo: '¥', bandeira: '🇯🇵', tipo: 'fiat', casas: 0 },
  { codigo: 'CHF', nome: 'Franco suíço', rotulo: 'CHF', simbolo: 'Fr', bandeira: '🇨🇭', tipo: 'fiat', casas: 2 },
  { codigo: 'CNY', nome: 'Yuan chinês', rotulo: 'CNY', simbolo: '¥', bandeira: '🇨🇳', tipo: 'fiat', casas: 2 },
];

/** Moedas escolhidas pelo usuário (ordem exibida). */
const PADRAO = ['BTC', 'SATS', 'USD', 'BRL', 'PYG'];

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

/**
 * Satoshi: inteiro, com separador de milhar. Abaixo de 1 satoshi (1 guarani
 * vale 0,215 sat) a unidade inteira diria zero e a linha contradiria a do
 * Bitcoin, que mostra 0,0000000021: aí mostra a fração.
 */
function formatarSats(valor) {
  const abs = Math.abs(valor);
  if (abs > 0 && abs < 1) {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  return Math.round(valor).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  });
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
  return CATALOGO.find((m) => m.codigo === codigo) || CATALOGO[0];
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

/**
 * Limpa o que veio da tela ou do teclado físico para o buffer interno:
 * só dígitos e no máximo uma vírgula. Ponto que claramente é decimal
 * (seguido de até dois dígitos no fim) vira vírgula; ponto de milhar é
 * largado — o agrupamento é recalculado na exibição.
 */
function normalizarEntrada(texto) {
  let b = String(texto).replace(/[^\d.,]/g, '');
  b = b.replace(/\.(?=\d{1,2}(?:\D|$))/g, ','); // ponto decimal (desktop)
  b = b.replace(/\./g, '');
  const primeira = b.indexOf(',');
  if (primeira >= 0) {
    // vírgulas extras (digitação rápida) somem; a primeira manda
    b = b.slice(0, primeira + 1) + b.slice(primeira + 1).replace(/,/g, '');
  }
  return b;
}

/**
 * Formatação ao vivo do buffer para o campo em edição: pontos de milhar
 * quando a parte inteira passa de 3 dígitos e a vírgula "aberta" enquanto a
 * fração ainda não foi digitada — "1234567,5" aparece como "1.234.567,5".
 */
function formatarDigitando(texto) {
  if (!texto) return '';
  const [inteira, decimal] = texto.split(',');
  let inteiro = inteira.replace(/\./g, '');
  if (inteiro.length > 3) {
    inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  return decimal != null ? `${inteiro},${decimal}` : inteiro;
}

/**
 * Posição do cursor no texto reformatado a partir da posição no texto antigo:
 * conta quantos dígitos/vírgulas havia à esquerda e procura essa mesma
 * quantidade no novo, para digitar com teclado físico sem o cursor fugir.
 */
function posicaoCursor(antigo, novo, antes) {
  if (antes == null) return null;
  const alvo = (antigo.slice(0, antes).match(/[\d,]/g) || []).length;
  if (alvo === 0) return 0;
  let conta = 0;
  for (let i = 0; i < novo.length; i++) {
    if (/[\d,]/.test(novo[i])) {
      conta++;
      if (conta === alvo) return i + 1;
    }
  }
  return novo.length;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  // 'escuro' (padrão) ou 'claro'
  tema: localStorage.getItem(TEMA_KEY) || 'escuro',
  // Códigos das moedas exibidas, na ordem escolhida.
  moedas: lerMoedas(),
  // Lista de seleção aberta?
  listaAberta: false,
};

/** Lê a seleção de moedas, validando contra o catálogo. */
function lerMoedas() {
  try {
    const bruto = JSON.parse(localStorage.getItem(MOEDAS_KEY) || 'null');
    if (!Array.isArray(bruto)) return [...PADRAO];
    const validas = bruto.filter((c) => CATALOGO.some((m) => m.codigo === c));
    return validas.length > 0 ? validas : [...PADRAO];
  } catch {
    return [...PADRAO];
  }
}

function salvarMoedas() {
  try {
    localStorage.setItem(MOEDAS_KEY, JSON.stringify(state.moedas));
  } catch {
    // modo privado/cheio: segue sem persistir
  }
}

/** Objetos do catálogo correspondentes à seleção atual. */
function moedasAtivas() {
  return state.moedas
    .map((c) => CATALOGO.find((m) => m.codigo === c))
    .filter(Boolean);
}

/** Garante que a moeda em foco ainda está na lista de moedas exibidas. */
function garantirFocoValido() {
  if (!state.moedas.includes(state.foco)) {
    state.foco = state.moedas[0] || 'USD';
    state.buffer = '1';
    localStorage.setItem(FOCO_KEY, state.foco);
  }
}

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
 * Taxa de cada moeda do catálogo numa base comum (USD): taxa[X] = quantos X
 * valem 1 USD. Derivado só do cache, então trocar o campo em foco nunca depende
 * da API. `SATS` é calculado a partir de `BTC`.
 */
function tabelaPrecos() {
  const entradas = Object.values(state.caches);
  for (const entrada of entradas) {
    const r = entrada?.data;
    if (!r) continue;
    const taxa = {};
    for (const m of CATALOGO) {
      if (m.codigo === 'SATS') continue;
      if (r[m.codigo] != null) taxa[m.codigo] = r[m.codigo];
    }
    if (taxa.BTC != null) taxa.SATS = taxa.BTC * SATS_POR_BTC;
    const obrigatorias = ['USD', 'BRL', 'BTC'].every((c) => taxa[c] != null);
    if (obrigatorias) return { taxa, atualizadoEm: entrada.atualizadoEm };
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
  for (const m of CATALOGO) {
    if (m.codigo === 'SATS') continue; // derivado de BTC
    const valor = Number(rs[m.codigo]);
    // Moeda que sai do ar fica sem valor na tela, mas não derruba a
    // atualização das outras (antes, uma ausência virava "sem conexão").
    if (rs[m.codigo] == null || Number.isNaN(valor)) continue;
    porCodigo[m.codigo] = valor;
  }

  // Sem as moedas que a tabela de preços exige não há o que converter.
  const faltando = ['USD', 'BRL', 'BTC'].filter((c) => porCodigo[c] == null);
  if (faltando.length > 0)
    throw new Error(`resposta sem ${faltando.join(', ')}`);

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
          value="${escapeAttr(ehFoco ? formatarDigitando(state.buffer) : valorTexto)}"
          aria-label="${moeda.nome}"
        />
      </div>
    </section>
  `;
}

function tecla(valor, classe = '') {
  return `<button class="tecla ${classe}" type="button" data-tecla="${valor}">${valor}</button>`;
}

/**
 * A tela é remontada inteira (innerHTML) a cada tecla e a cada atualização de
 * minuto, e isso cria um <main> e campos novos: sem devolver a rolagem e o
 * cursor, a lista voltava ao topo e o campo em edição perdia o foco.
 */
function lerTela() {
  const ativo = document.activeElement;
  const campo =
    ativo && app.contains(ativo) && ativo.classList.contains('valor')
      ? ativo.dataset.moeda
      : null;
  const main = app.querySelector('main');
  return {
    rolagem: main ? main.scrollTop : 0,
    // O window pode rolar sozinho no celular durante a remontagem; sem guardar
    // a posição, a página descia e o teclado ficava fora da tela.
    janela: { x: window.scrollX, y: window.scrollY },
    campo,
    inicio: campo ? ativo.selectionStart : null,
    fim: campo ? ativo.selectionEnd : null,
  };
}

function devolverTela(antes) {
  if (window.scrollX !== antes.janela.x || window.scrollY !== antes.janela.y) {
    window.scrollTo(antes.janela.x, antes.janela.y);
  }
  if (antes.campo) {
    const el = app.querySelector(`.valor[data-moeda="${antes.campo}"]`);
    if (el) {
      el.focus();
      if (antes.inicio != null) {
        try {
          el.setSelectionRange(antes.inicio, antes.fim);
        } catch {
          // campo sem suporte a seleção: segue sem cursor
        }
      }
    }
  }
  // Por último: o focus() acima pode ter rolado a lista para mostrar o campo.
  const main = app.querySelector('main');
  if (main) main.scrollTop = antes.rolagem;
}

function render() {
  const tela = lerTela();
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
      <div class="acoes">
        <button
          class="btn-icone"
          type="button"
          data-acao="lista-moedas"
          aria-label="Escolher moedas"
        >＋</button>
        <button
          class="btn-icone"
          type="button"
          data-acao="tema"
          aria-label="${state.tema === 'claro' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}"
        >${state.tema === 'claro' ? '🌙' : '☀️'}</button>
        <button class="btn-icone" type="button" data-acao="atualizar" ${state.carregando ? 'disabled' : ''} aria-label="Atualizar">
          ${state.carregando ? '…' : '↻'}
        </button>
      </div>
    </header>

    <main>${moedasAtivas().map(linhaMoeda).join('')}</main>

    ${instalacao.html()}

    <div class="teclado">
      ${tecla('7')}${tecla('8')}${tecla('9')}${tecla('⌫', 'fn')}
      ${tecla('4')}${tecla('5')}${tecla('6')}${tecla('AC', 'fn')}
      ${tecla('1')}${tecla('2')}${tecla('3')}${tecla('00')}
      ${tecla('0', 'largo')}${tecla(',', 'fn largo')}
    </div>

    <footer><p>Fonte: Coinbase · atualiza a cada minuto</p></footer>
  `;

  ligarEventos();
  devolverTela(tela);
  document.documentElement.dataset.offline = state.erro ? 'true' : 'false';
}

/** Painel de seleção de moedas, sobreposto à tela. */
function painelMoedas() {
  return `
    <div class="painel-fundo" data-acao="fechar-lista"></div>
    <section class="painel" role="dialog" aria-label="Escolher moedas">
      <header class="painel-topo">
        <strong>Moedas</strong>
        <button class="btn-icone" type="button" data-acao="fechar-lista" aria-label="Fechar">✕</button>
      </header>
      <div class="painel-lista">
        ${CATALOGO.map((m) => {
          const ativa = state.moedas.includes(m.codigo);
          return `
            <button
              class="painel-item ${ativa ? 'painel-item-ativa' : ''}"
              type="button"
              data-toggle="${m.codigo}"
            >
              <span class="painel-bandeira">${m.bandeira}</span>
              <span class="painel-nome">
                <strong>${m.rotulo}</strong>
                <small>${m.nome}</small>
              </span>
              <span class="painel-marca">${ativa ? '✓' : ''}</span>
            </button>
          `;
        }).join('')}
      </div>
      <footer class="painel-pe">
        <p>Toque para adicionar ou remover. Deixe pelo menos uma moeda.</p>
      </footer>
    </section>
  `;
}

/* ------------------------------------------------------------------ */
/* Painel de moedas                                                    */
/* ------------------------------------------------------------------ */

const painelEl = document.createElement('div');
painelEl.className = 'painel-host';
painelEl.hidden = true;
document.body.appendChild(painelEl);

function abrirPainel() {
  state.listaAberta = true;
  desenharPainel();
  painelEl.hidden = false;
}

function fecharPainel() {
  state.listaAberta = false;
  painelEl.hidden = true;
}

function desenharPainel() {
  painelEl.innerHTML = painelMoedas();
  painelEl.querySelectorAll('[data-acao="fechar-lista"]').forEach((el) => {
    el.addEventListener('click', () => fecharPainel());
  });
  painelEl.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => alternarMoeda(btn.dataset.toggle));
  });
}

/** Adiciona ou remove uma moeda da lista (nunca deixa a lista vazia). */
function alternarMoeda(codigo) {
  const i = state.moedas.indexOf(codigo);
  if (i >= 0) {
    if (state.moedas.length === 1) return; // sempre pelo menos uma
    state.moedas.splice(i, 1);
    // Se a moeda removida era a base, volta para a primeira da lista.
    if (state.foco === codigo) {
      state.foco = state.moedas[0];
      state.buffer = '1';
      localStorage.setItem(FOCO_KEY, state.foco);
    }
  } else {
    state.moedas.push(codigo);
  }
  salvarMoedas();
  desenharPainel();
  render();
}

/* ------------------------------------------------------------------ */
/* Instalação (PWA)                                                    */
/* ------------------------------------------------------------------ */

// A faixa vive dentro do #app (é o render que a monta), mas o estado dela —
// evento do navegador, dispensa guardada — fica no módulo.
const instalacao = criarSugestaoInstalacao({ aoMudar: () => render() });

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
      // Digitar direto no campo (teclado físico) também formata ao vivo.
      const caret = input.selectionStart;
      const bruto = normalizarEntrada(input.value);
      const formatado = formatarDigitando(bruto);
      state.foco = moeda;
      localStorage.setItem(FOCO_KEY, moeda);
      state.buffer = bruto;
      if (formatado !== input.value) {
        const antigo = input.value;
        input.value = formatado;
        const pos = posicaoCursor(antigo, formatado, caret);
        if (pos != null) {
          try {
            input.setSelectionRange(pos, pos);
          } catch {
            // campo sem suporte a seleção: segue sem cursor
          }
        }
      }
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

  app.querySelectorAll('[data-acao="tema"]').forEach((btn) => {
    btn.addEventListener('click', () => alternarTema());
  });

  // Painel de moedas (vive fora do #app pra não recriar a tela a cada toque)
  app.querySelectorAll('[data-acao="lista-moedas"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirPainel());
  });

  // Faixa de instalação do PWA (montada no render quando há o que sugerir).
  app.querySelectorAll('[data-acao="instalar"]').forEach((btn) => {
    btn.addEventListener('click', () => instalacao.instalar());
  });

  app.querySelectorAll('[data-acao="dispensar-instalar"]').forEach((btn) => {
    btn.addEventListener('click', () => instalacao.dispensar());
  });
}

/** Aplica o tema no <html> e ajusta a cor da barra do navegador. */
function aplicarTema() {
  document.documentElement.dataset.tema = state.tema;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      state.tema === 'claro' ? '#f4f6fa' : '#16181d',
    );
  }
}

/** Alterna entre claro e escuro, guardando a escolha. */
function alternarTema() {
  state.tema = state.tema === 'claro' ? 'escuro' : 'claro';
  localStorage.setItem(TEMA_KEY, state.tema);
  // As cores vivem em variáveis CSS no <html>, então trocar o atributo basta.
  // Remontar a página inteira aqui (render()) fazia o navegador reorganizar o
  // layout — no celular o teclado numérico acabava empurrado para baixo.
  aplicarTema();
  // Reflete o novo estado no botão da barra; o próximo render já nasce certo.
  document.querySelectorAll('[data-acao="tema"]').forEach((btn) => {
    btn.textContent = state.tema === 'claro' ? '🌙' : '☀️';
    btn.setAttribute(
      'aria-label',
      state.tema === 'claro'
        ? 'Mudar para tema escuro'
        : 'Mudar para tema claro',
    );
  });
}

/** Troca a moeda em edição, convertendo o valor atual. */
function focarMoeda(codigo) {
  if (state.foco === codigo) return;
  const v = converter(quantidadeAtual(), state.foco, codigo);
  state.foco = codigo;
  localStorage.setItem(FOCO_KEY, codigo);
  if (v != null && !Number.isNaN(v)) {
    // O valor formatado (pt-BR, com pontos de milhar) volta pro buffer cru:
    // normalizarEntrada guarda só dígitos e vírgula; a exibição re-agrupa.
    state.buffer = normalizarEntrada(formatarValor(v, moedaInfo(codigo)));
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
  let b = normalizarEntrada(state.buffer);

  if (t === 'AC') {
    b = '0';
  } else if (t === '⌫') {
    b = b.slice(0, -1);
    if (b === '' || b === '-') b = '0';
  } else if (t === ',') {
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
  for (const moeda of moedasAtivas()) {
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

garantirFocoValido();
aplicarTema();
instalacao.iniciar();
render();
atualizar();
setInterval(atualizar, REFRESH_MS);
window.addEventListener('online', () => atualizar());
