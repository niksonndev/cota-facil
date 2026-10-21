/** Formatação numérica e limpeza do texto digitado. Tudo puro, sem DOM. */

/** Bitcoin: casas decimais escaladas pela magnitude. */
export function formatarBtc(valor) {
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
export function formatarSats(valor) {
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

/**
 * Texto curto para "quando isto foi atualizado". No mesmo dia mostra só a
 * hora; em outro dia inclui a data, e o ano só quando for diferente.
 */
export function formatarQuando(iso, agora = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';

  const hora = data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const mesmoDia =
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate();
  if (mesmoDia) return `às ${hora}`;

  const dia = data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
  const mesmoAno = data.getFullYear() === agora.getFullYear();
  return `${dia}${mesmoAno ? '' : `/${data.getFullYear()}`} às ${hora}`;
}

/** Fiat: N casas, sem símbolo (o símbolo fica na etiqueta da linha). */
export function formatarFiat(valor, casas) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatarValor(valor, moeda) {
  if (moeda.tipo === 'btc') return formatarBtc(valor);
  if (moeda.tipo === 'sats') return formatarSats(valor);
  return formatarFiat(valor, moeda.casas);
}

/**
 * Converte um texto digitado (pt-BR, vírgula decimal) em número.
 * Aceita "1.234,56", "1234.56" e "1234,56".
 */
export function parseNumero(texto) {
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
export function normalizarEntrada(texto) {
  let b = String(texto).replace(/[^\d.,]/g, '');
  b = b.replace(/\.(?=\d{1,2}(?:\D|$))/g, ','); // ponto decimal (desktop)
  b = b.replace(/\./g, '');
  const primeira = b.indexOf(',');
  if (primeira >= 0) {
    // vírgulas extras (digitação rápida) somem; a primeira manda
    b = b.slice(0, primeira + 1) + b.slice(primeira + 1).replace(/,/g, '');
  }
  // "005" e "000,7" são o mesmo que "5" e "0,7": zero à esquerda só
  // enganava a leitura do valor.
  b = b.replace(/^0+(?=\d)/, '');
  // Um valor absurdamente longo não tem uso e pode virar Infinity ao ser
  // interpretado; 24 caracteres cabem em qualquer montante realista.
  return b.slice(0, 24);
}

/**
 * Formatação ao vivo do buffer para o campo em edição: pontos de milhar
 * quando a parte inteira passa de 3 dígitos e a vírgula "aberta" enquanto a
 * fração ainda não foi digitada — "1234567,5" aparece como "1.234.567,5".
 */
export function formatarDigitando(texto) {
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
export function posicaoCursor(antigo, novo, antes) {
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
