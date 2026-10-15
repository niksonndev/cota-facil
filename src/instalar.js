/*
 * Sugestão de instalação do PWA.
 *
 * O convite só aparece quando dá para instalar: no Android/desktop é o evento
 * `beforeinstallprompt` que diz isso, e no iPhone/iPad esse evento não existe —
 * lá a faixa ensina o caminho manual (Compartilhar → Adicionar à Tela de
 * Início). Quem já roda instalado (janela própria, `display-mode: standalone`)
 * não vê nada.
 *
 * Dispensar não é para sempre: a faixa volta depois de alguns dias, senão quem
 * tocou em "✕" sem querer nunca mais seria convidado a instalar.
 */

const DISPENSA_KEY = 'cotafacil:instalar-dispensado';
const DIAS_ATE_VOLTAR = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** App aberto instalado (janela própria), e não numa aba do navegador. */
function estaInstalado() {
  if (typeof window === 'undefined') return false;
  if (window.navigator.standalone === true) return true; // iOS antigo
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/** iPhone/iPad: o Safari não dispara `beforeinstallprompt`. */
function ehIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // No iPad recente o Safari se identifica como Mac; o toque na tela denuncia.
  const ipadComoCaroMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || ipadComoCaroMac;
}

function lerDispensa() {
  try {
    const bruto = Number(localStorage.getItem(DISPENSA_KEY));
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
  } catch {
    return 0; // localStorage indisponível: segue sem lembrar a dispensa
  }
}

function salvarDispensa(quando) {
  try {
    localStorage.setItem(DISPENSA_KEY, String(quando));
  } catch {
    // modo privado/cheio: segue sem persistir
  }
}

/**
 * Cria a faixa de instalação. `aoMudar` é chamado quando o estado muda (chegou
 * o evento, instalou, dispensou) para a tela se redesenhar.
 */
export function criarSugestaoInstalacao({ aoMudar }) {
  let evento = null; // prompt guardado do beforeinstallprompt, usado no toque
  let dispensadoEm = lerDispensa();
  let instalado = estaInstalado();

  const dispensadoPoucoTempoAtras = () =>
    dispensadoEm > 0 && Date.now() - dispensadoEm < DIAS_ATE_VOLTAR * MS_POR_DIA;

  /** 'prompt' (há botão), 'ios' (dica manual) ou 'oculto' (nada a sugerir). */
  function modo() {
    if (instalado || dispensadoPoucoTempoAtras()) return 'oculto';
    if (evento) return 'prompt';
    if (ehIos()) return 'ios';
    return 'oculto';
  }

  const visivel = () => modo() !== 'oculto';

  /** Faixa em HTML; string vazia quando não há sugestão a mostrar. */
  function html() {
    const m = modo();
    if (m === 'oculto') return '';

    const dica =
      m === 'prompt'
        ? 'Abra direto da tela inicial, sem depender do navegador.'
        : 'Toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
    const botao =
      m === 'prompt'
        ? '<button class="instalar-btn" type="button" data-acao="instalar">Instalar</button>'
        : '';

    return `
      <aside class="instalar" aria-label="Instalar o Cota Fácil">
        <span class="instalar-icone" aria-hidden="true">📲</span>
        <span class="instalar-texto">
          <strong>Instalar o Cota Fácil</strong>
          <small>${dica}</small>
        </span>
        ${botao}
        <button class="instalar-x" type="button" data-acao="dispensar-instalar" aria-label="Agora não">✕</button>
      </aside>
    `;
  }

  /** Abre o prompt nativo de instalação (só existe no modo 'prompt'). */
  async function instalar() {
    if (!evento) {
      dispensar();
      return;
    }
    const prompt = evento;
    evento = null; // o prompt só pode ser usado uma vez
    try {
      prompt.prompt();
      const escolha = await prompt.userChoice;
      // Recusou na janela do navegador: não insiste na próxima abertura.
      if (escolha?.outcome !== 'accepted') {
        dispensadoEm = Date.now();
        salvarDispensa(dispensadoEm);
      }
    } catch {
      // prompt já consumido ou cancelado: segue com a faixa escondida
    }
    aoMudar();
  }

  /** Esconde a faixa por DIAS_ATE_VOLTAR dias. */
  function dispensar() {
    dispensadoEm = Date.now();
    salvarDispensa(dispensadoEm);
    aoMudar();
  }

  function iniciar() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Já dispensou (ou já tem instalado): deixa o próprio navegador oferecer.
      if (instalado || dispensadoPoucoTempoAtras()) return;
      e.preventDefault(); // segura a faixa nativa; a sugestão é a do app
      evento = e;
      aoMudar();
    });

    window.addEventListener('appinstalled', () => {
      instalado = true;
      evento = null;
      dispensadoEm = Date.now();
      salvarDispensa(dispensadoEm);
      aoMudar();
    });
  }

  return { html, iniciar, instalar, dispensar, visivel };
}
