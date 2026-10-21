import { POR_CODIGO, SATS_POR_BTC } from './catalogo.js';

const OBRIGATORIAS = ['USD', 'BRL', 'BTC'];

/**
 * Monta a tabela `taxa[X] = quantos X valem 1 USD`.
 *
 * `SATS` não vem da API: é derivado de `BTC`. A tabela só existe quando as
 * moedas obrigatórias estão presentes, senão não há como converter com
 * segurança.
 */
export function tabelaDeTaxas(dados) {
  if (!dados || typeof dados !== 'object') return null;

  const taxa = {};
  for (const codigo of POR_CODIGO.keys()) {
    if (codigo === 'SATS') continue;
    if (dados[codigo] == null) continue;
    const valor = Number(dados[codigo]);
    // Zero, negativo, Infinity e NaN não são cotação: aceitá-los produzia
    // divisão por zero (∞) ou valores negativos com cara de atualizados.
    if (!Number.isFinite(valor) || valor <= 0) continue;
    taxa[codigo] = valor;
  }

  if (taxa.BTC != null) taxa.SATS = taxa.BTC * SATS_POR_BTC;
  if (!OBRIGATORIAS.every((codigo) => taxa[codigo] != null)) return null;
  return taxa;
}

/** Converte `qtd` da moeda `de` para a moeda `para` usando a tabela. */
export function converter(qtd, de, para, taxa) {
  if (!Number.isFinite(qtd)) return null;
  if (de === para) return qtd;
  if (!taxa) return null;
  if (!(taxa[de] > 0) || !(taxa[para] > 0)) return null;

  const valor = (qtd / taxa[de]) * taxa[para];
  return Number.isFinite(valor) ? valor : null;
}
