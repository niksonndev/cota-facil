import './style.css';
import {
  CATALOGO,
  CODIGOS,
  PADRAO,
  POR_CODIGO,
  moedaInfo,
} from './catalogo.js';
import { converter, tabelaDeTaxas } from './conversao.js';
import {
  formatarDigitando,
  formatarQuando,
  formatarValor,
  normalizarEntrada,
  parseNumero,
  posicaoCursor,
} from './formato.js';
import { criarSugestaoInstalacao } from './instalar.js';

const BASE_URL = 'https://api.coinbase.com/v2/exchange-rates';
const CACHE_KEY = 'cotafacil:taxas';
const FOCO_KEY = 'cotafacil:foco';
const TEMA_KEY = 'cotafacil:tema';
const MOEDAS_KEY = 'cotafacil:moedas';
const REFRESH_MS = 60_000; // um minuto entre atualizações

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
/* Utilidades de HTML                                                  */
/* ------------------------------------------------------------------ */

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
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
  // Quantidade exata na moeda em foco. O buffer é só a representação exibida:
  // trocar de moeda não pode arredondar o valor de verdade (ver trocarFoco).
  valor: 1,
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
    const validas = [...new Set(bruto.filter((c) => CODIGOS.has(c)))];
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
  return state.moedas.map((c) => POR_CODIGO.get(c)).filter(Boolean);
}

/** Garante que a moeda em foco ainda está na lista de moedas exibidas. */
function garantirFocoValido() {
  if (!state.moedas.includes(state.foco)) {
    trocarFoco(state.moedas[0] || 'USD');
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
    const taxa = tabelaDeTaxas(entrada?.data);
    if (taxa) return { taxa, atualizadoEm: entrada.atualizadoEm };
  }
  return null;
}

function valorDoBuffer(texto) {
  const n = parseNumero(texto);
  return Number.isFinite(n) ? n : 0;
}

/** Texto que representa `valor` no campo em foco, sem perder a vírgula. */
function bufferDoValor(valor, moeda) {
  return normalizarEntrada(formatarValor(valor, moeda));
}

function quantidadeAtual() {
  return state.valor;
}

/**
 * Troca a moeda em foco convertendo a quantidade exata. O buffer recebe só a
 * representação da moeda nova; a quantidade continua exata para as próximas
 * conversões (antes, trocar de foco arredondava e o valor andava).
 */
function trocarFoco(codigo) {
  const alvo = moedaInfo(codigo);
  if (!alvo) return;
  if (state.foco !== codigo) {
    const t = tabelaPrecos();
    const exato = converter(state.valor, state.foco, codigo, t?.taxa);
    if (exato != null) state.valor = exato;
  }
  state.foco = codigo;
  state.buffer = bufferDoValor(state.valor, alvo);
  localStorage.setItem(FOCO_KEY, codigo);
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function buscarTaxas(base, signal) {
  const resposta = await fetch(`${BASE_URL}?currency=${base}`, {
    cache: 'no-store',
    signal,
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
    // Taxa zero, negativa ou não finita também é ausência de cotação.
    if (!Number.isFinite(valor) || valor <= 0) continue;
    porCodigo[m.codigo] = valor;
  }

  // Sem as moedas que a tabela de preços exige não há o que converter.
  const faltando = ['USD', 'BRL', 'BTC'].filter((c) => porCodigo[c] == null);
  if (faltando.length > 0)
    throw new Error(`resposta sem ${faltando.join(', ')}`);

  return { data: porCodigo, atualizadoEm: new Date().toISOString() };
}

const TIMEOUT_API_MS = 10_000;
let requisicaoAtual = null;

function atualizar() {
  // Um clique no ↻, o intervalo e o evento online podem coincidir; todos
  // reaproveitam a mesma requisição em vez de disparar chamadas concorrentes.
  if (requisicaoAtual) return requisicaoAtual;

  if (!navigator.onLine) {
    state.erro = 'offline';
    atualizarStatus();
    return Promise.resolve();
  }

  state.carregando = true;
  state.erro = null;
  atualizarStatus();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_API_MS);

  requisicaoAtual = (async () => {
    let sucesso = false;
    try {
      // Base fixa em USD: a tabela de preços é sempre relativa a USD, então o
      // campo em edição do usuário não interfere na busca.
      const { data, atualizadoEm } = await buscarTaxas(
        'USD',
        controller.signal,
      );
      // A API pode omitir uma moeda temporariamente. Mantém a última cotação
      // conhecida em vez de apagar a linha e transformar a ausência em "sem
      // conexão"; moedas presentes na resposta continuam sendo atualizadas.
      const anteriores = state.caches.USD?.data || {};
      state.caches.USD = {
        data: { ...anteriores, ...data },
        atualizadoEm,
      };
      salvarCache(state.caches);
      sucesso = true;
    } catch (e) {
      state.erro = e.message || String(e);
    } finally {
      clearTimeout(timer);
      state.carregando = false;
      requisicaoAtual = null;
      if (sucesso) atualizarDerivados();
      atualizarStatus();
    }
  })();

  return requisicaoAtual;
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
    const v = converter(quantidadeAtual(), state.foco, moeda.codigo, t.taxa);
    valorTexto = v == null ? '' : formatarValor(v, moeda);
  }

  const classeBandeira =
    moeda.tipo === 'btc' ? 'bandeira bandeira-btc' : 'bandeira';

  return `
    <section class="linha ${ehFoco ? 'linha-foco' : ''}" data-linha="${moeda.codigo}">
      <button
        class="esq"
        type="button"
        data-focar="${moeda.codigo}"
        aria-label="Editar ${moeda.nome}: ${moeda.bandeira} ${moeda.codigo} ${moeda.simbolo}"
      >
        <span class="${classeBandeira}" aria-hidden="true">${moeda.bandeira}</span>
        <span class="cod">
          <strong>${moeda.codigo}</strong>
          <span class="sim" aria-hidden="true">${moeda.simbolo}</span>
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
          aria-label="Valor em ${moeda.nome} (${moeda.codigo})"
          aria-describedby="dica-valor"
        />
      </div>
    </section>
  `;
}

function tecla(valor, classe = '', rotulo = '') {
  const nome = rotulo ? `${valor} — ${rotulo}` : valor;
  return `<button class="tecla ${classe}" type="button" data-tecla="${valor}" aria-label="${nome}">${valor}</button>`;
}

function campoValor(codigo) {
  return app.querySelector(`.valor[data-moeda="${codigo}"]`);
}

function textoStatus() {
  const quando = tabelaPrecos()?.atualizadoEm;
  const salvo = quando ? `salvo ${formatarQuando(quando)}` : null;

  if (state.erro && !salvo) return 'sem conexão · sem dados salvos';
  if (state.erro) {
    const motivo =
      navigator.onLine === false ? 'sem conexão' : 'não foi possível atualizar';
    return `${motivo} · ${salvo}`;
  }
  if (state.carregando && !salvo) return 'buscando cotações…';
  if (salvo) return `atualizado ${formatarQuando(quando)}`;
  return 'sem cotações';
}

function atualizarStatus() {
  const status = app.querySelector('.status');
  if (status) status.textContent = textoStatus();

  const botao = app.querySelector('[data-acao="atualizar"]');
  if (botao) {
    botao.disabled = state.carregando;
    botao.textContent = state.carregando ? '…' : '↻';
    botao.setAttribute('aria-busy', String(state.carregando));
  }
  document.documentElement.dataset.offline = state.erro ? 'true' : 'false';
}

function atualizarInstalacao() {
  const host = app.querySelector('#instalacao');
  if (host) host.innerHTML = instalacao.html();
}

function render() {
  const status = textoStatus();
  const rolagem = app.querySelector('main')?.scrollTop || 0;

  app.innerHTML = `
    <header class="topo">
      <div class="topo-esq">
        <h1>Cota Fácil</h1>
        <p class="status" role="status" aria-live="polite">${status}</p>
      </div>
      <div class="acoes">
        <button
          class="btn-icone"
          type="button"
          data-acao="lista-moedas"
          aria-label="Escolher moedas"
          aria-controls="painel-moedas"
          aria-expanded="${state.listaAberta}"
        >＋</button>
        <button
          class="btn-icone"
          type="button"
          data-acao="tema"
          aria-label="${state.tema === 'claro' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}"
        >${state.tema === 'claro' ? '🌙' : '☀️'}</button>
        <button class="btn-icone" type="button" data-acao="atualizar" ${state.carregando ? 'disabled' : ''} aria-label="Atualizar cotações agora">
          ${state.carregando ? '…' : '↻'}
        </button>
      </div>
    </header>

    <p id="dica-valor" class="sr-only">
      Use o teclado numérico na tela ou digite para alterar o valor. Toque na
      sigla da moeda para torná-la a moeda base.
    </p>

    <main>${moedasAtivas().map(linhaMoeda).join('')}</main>

    <div id="instalacao" class="instalacao-host">${instalacao.html()}</div>

    <div class="teclado">
      ${tecla('7')}${tecla('8')}${tecla('9')}${tecla('⌫', 'fn', 'apagar último dígito')}
      ${tecla('4')}${tecla('5')}${tecla('6')}${tecla('AC', 'fn', 'limpar valor')}
      ${tecla('1')}${tecla('2')}${tecla('3')}${tecla('00', '', 'dois zeros')}
      ${tecla('0', 'largo')}${tecla(',', 'fn largo', 'vírgula decimal')}
    </div>

    <footer><p>Fonte: Coinbase · atualiza a cada minuto</p></footer>
  `;

  const main = app.querySelector('main');
  if (main) main.scrollTop = rolagem;
  document.documentElement.dataset.offline = state.erro ? 'true' : 'false';
}

/** Conteúdo do painel de seleção de moedas (o <dialog> fica no body). */
function painelMoedas() {
  return `
    <header class="painel-topo">
      <strong id="painel-titulo">Moedas</strong>
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
            aria-pressed="${ativa}"
          >
            <span class="painel-bandeira" aria-hidden="true">${m.bandeira}</span>
            <span class="painel-nome">
              <strong>${m.codigo}</strong>
              <small>${m.nome}</small>
            </span>
            <span class="painel-marca" aria-hidden="true">${ativa ? '✓' : ''}</span>
          </button>
        `;
      }).join('')}
    </div>
    <footer class="painel-pe">
      <p>Toque para adicionar ou remover. Deixe pelo menos uma moeda.</p>
    </footer>
  `;
}

/* ------------------------------------------------------------------ */
/* Painel de moedas                                                    */
/* ------------------------------------------------------------------ */

const painelEl = document.createElement('dialog');
painelEl.className = 'painel';
painelEl.id = 'painel-moedas';
painelEl.setAttribute('aria-labelledby', 'painel-titulo');
document.body.appendChild(painelEl);

function atualizarBotaoLista() {
  const botao = app.querySelector('[data-acao="lista-moedas"]');
  if (botao) {
    botao.setAttribute('aria-expanded', String(state.listaAberta));
  }
}

let painelOrigem = null;

function abrirPainel() {
  if (painelEl.open) return;
  painelOrigem = document.activeElement;
  state.listaAberta = true;
  atualizarBotaoLista();
  desenharPainel();
  painelEl.showModal();
}

function fecharPainel() {
  if (painelEl.open) painelEl.close();
}

function desenharPainel() {
  painelEl.innerHTML = painelMoedas();
}

painelEl.addEventListener('click', (event) => {
  const alvo = event.target.closest(
    '[data-acao="fechar-lista"], [data-toggle]',
  );
  if (alvo) {
    if (alvo.dataset.acao === 'fechar-lista') fecharPainel();
    else alternarMoeda(alvo.dataset.toggle);
    return;
  }

  // Clique no backdrop (fora da caixa do dialog) também fecha.
  if (event.target === painelEl) {
    const r = painelEl.getBoundingClientRect();
    const fora =
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom;
    if (fora) fecharPainel();
  }
});

painelEl.addEventListener('close', () => {
  state.listaAberta = false;
  atualizarBotaoLista();
  // O render da troca de moedas substitui o botão que abriu o painel; nesse
  // caso o foco não tem para onde voltar sozinho.
  if (!painelOrigem?.isConnected) {
    app.querySelector('[data-acao="lista-moedas"]')?.focus();
  }
  painelOrigem = null;
});

/** Adiciona ou remove uma moeda da lista (nunca deixa a lista vazia). */
function alternarMoeda(codigo) {
  const i = state.moedas.indexOf(codigo);
  if (i >= 0) {
    if (state.moedas.length === 1) return; // sempre pelo menos uma
    state.moedas.splice(i, 1);
    // Se a moeda removida era a base, converte o valor para a primeira da
    // lista (antes o valor era descartado e virava 1 da moeda nova).
    if (state.foco === codigo) {
      trocarFoco(state.moedas[0]);
    }
  } else {
    state.moedas.push(codigo);
  }
  salvarMoedas();

  // Atualiza só o item tocado: redesenhar a lista inteira devolvia a rolagem
  // ao topo e tirava o foco de quem estava escolhendo várias moedas.
  const botao = painelEl.querySelector(`[data-toggle="${codigo}"]`);
  if (botao) {
    const ativa = state.moedas.includes(codigo);
    botao.classList.toggle('painel-item-ativa', ativa);
    botao.setAttribute('aria-pressed', String(ativa));
    const marca = botao.querySelector('.painel-marca');
    if (marca) marca.textContent = ativa ? '✓' : '';
  }

  render();
}

/* ------------------------------------------------------------------ */
/* Instalação (PWA)                                                    */
/* ------------------------------------------------------------------ */

// A faixa vive dentro do #app (é o render que a monta), mas o estado dela —
// evento do navegador, dispensa guardada — fica no módulo.
const instalacao = criarSugestaoInstalacao({
  aoMudar: () => atualizarInstalacao(),
});

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function ligarEventos() {
  // Delegação: o #app pode ser remontado (troca de moedas) sem perder os
  // handlers e sem criar um listener novo por linha a cada render.
  app.addEventListener('click', (event) => {
    const alvo = event.target.closest(
      '[data-focar], [data-tecla], [data-acao]',
    );
    if (!alvo || !app.contains(alvo)) return;

    if (alvo.dataset.focar) {
      focarMoeda(alvo.dataset.focar);
      return;
    }
    if (alvo.dataset.tecla) {
      aplicarTecla(alvo.dataset.tecla);
      return;
    }

    switch (alvo.dataset.acao) {
      case 'atualizar':
        atualizar();
        break;
      case 'tema':
        alternarTema();
        break;
      case 'lista-moedas':
        abrirPainel();
        break;
      case 'instalar':
        instalacao.instalar();
        break;
      case 'dispensar-instalar':
        instalacao.dispensar();
        break;
      default:
        break;
    }
  });

  app.addEventListener('focusin', (event) => {
    const input = event.target.closest?.('.valor');
    if (!input || !app.contains(input)) return;
    if (state.foco !== input.dataset.moeda) focarMoeda(input.dataset.moeda);
  });

  app.addEventListener('input', (event) => {
    const input = event.target.closest?.('.valor');
    if (!input || !app.contains(input)) return;

    // Digitar direto no campo (teclado físico) também formata ao vivo.
    const caret = input.selectionStart;
    const bruto = normalizarEntrada(input.value);
    const formatado = formatarDigitando(bruto);
    state.foco = input.dataset.moeda;
    localStorage.setItem(FOCO_KEY, state.foco);
    state.buffer = bruto;
    state.valor = valorDoBuffer(bruto);
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
}

/** Aplica o tema no <html> e ajusta a cor da barra do navegador. */
function aplicarTema() {
  document.documentElement.dataset.tema = state.tema;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      state.tema === 'claro' ? '#f5f7fb' : '#0f1115',
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
  trocarFoco(codigo);
  atualizarValores();
  const el = campoValor(codigo);
  if (el) {
    el.focus();
    el.select();
  }
}

/** Reescreve o campo em foco e todas as linhas derivadas. */
function atualizarValores() {
  const foco = campoValor(state.foco);
  if (foco) foco.value = formatarDigitando(state.buffer);
  atualizarDerivados();
  atualizarRealce();
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
  state.valor = valorDoBuffer(b);
  const el = campoValor(state.foco);
  if (el) {
    el.value = formatarDigitando(b);
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }
  atualizarDerivados();
  atualizarRealce();
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
  const t = tabelaPrecos();
  for (const moeda of moedasAtivas()) {
    if (moeda.codigo === state.foco) continue;
    const el = app.querySelector(`.valor[data-moeda="${moeda.codigo}"]`);
    if (!el) continue;
    const v = converter(qtd, state.foco, moeda.codigo, t?.taxa);
    el.value = v == null ? '' : formatarValor(v, moeda);
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

// Em desenvolvimento o SW atrapalha: ele serve o build antigo e o Vite não
// consegue recarregar. Em produção, o caminho vem da base do build — um
// `./sw.js` em /cota-facil/qualquer/ resolveria para a pasta errada.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    .catch(() => {
      // sem SW (ex.: arquivo): o app segue funcionando online
    });
}

garantirFocoValido();
aplicarTema();
ligarEventos();
instalacao.iniciar();
render();
atualizar();
const atualizarSeVisivel = () => {
  if (!document.hidden) atualizar();
};
setInterval(atualizarSeVisivel, REFRESH_MS);
document.addEventListener('visibilitychange', atualizarSeVisivel);
window.addEventListener('online', () => atualizar());
window.addEventListener('offline', () => {
  state.erro = 'offline';
  atualizarStatus();
});
