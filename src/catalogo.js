/**
 * Catálogo de moedas. `casas` é o número de casas decimais na exibição das
 * moedas fiat; BTC e SATS têm formatação própria.
 *
 * A tabela fica uma linha por moeda, mesmo passando das 80 colunas: com 15
 * moedas, o bloco de 8 linhas por item que o prettier faria enterra a leitura
 * de quem só quer comparar os campos de uma moeda com os da de cima.
 */
// prettier-ignore
export const CATALOGO = [
  { codigo: 'BTC', nome: 'Bitcoin', simbolo: '₿', bandeira: '₿', tipo: 'btc' },
  { codigo: 'SATS', nome: 'Bitcoin (Satoshi)', simbolo: 'sat', bandeira: '⚡', tipo: 'sats' },
  { codigo: 'USD', nome: 'Dólar americano', simbolo: '$', bandeira: '🇺🇸', tipo: 'fiat', casas: 2 },
  { codigo: 'EUR', nome: 'Euro', simbolo: '€', bandeira: '🇪🇺', tipo: 'fiat', casas: 2 },
  { codigo: 'BRL', nome: 'Real brasileiro', simbolo: 'R$', bandeira: '🇧🇷', tipo: 'fiat', casas: 2 },
  { codigo: 'GBP', nome: 'Libra esterlina', simbolo: '£', bandeira: '🇬🇧', tipo: 'fiat', casas: 2 },
  { codigo: 'ARS', nome: 'Peso argentino', simbolo: '$', bandeira: '🇦🇷', tipo: 'fiat', casas: 0 },
  { codigo: 'MXN', nome: 'Peso mexicano', simbolo: '$', bandeira: '🇲🇽', tipo: 'fiat', casas: 2 },
  { codigo: 'PYG', nome: 'Guarani paraguaio', simbolo: '₲', bandeira: '🇵🇾', tipo: 'fiat', casas: 0 },
  { codigo: 'UYU', nome: 'Peso uruguaio', simbolo: '$', bandeira: '🇺🇾', tipo: 'fiat', casas: 2 },
  { codigo: 'CLP', nome: 'Peso chileno', simbolo: '$', bandeira: '🇨🇱', tipo: 'fiat', casas: 0 },
  { codigo: 'CAD', nome: 'Dólar canadense', simbolo: '$', bandeira: '🇨🇦', tipo: 'fiat', casas: 2 },
  { codigo: 'JPY', nome: 'Iene japonês', simbolo: '¥', bandeira: '🇯🇵', tipo: 'fiat', casas: 0 },
  { codigo: 'CHF', nome: 'Franco suíço', simbolo: 'Fr', bandeira: '🇨🇭', tipo: 'fiat', casas: 2 },
  { codigo: 'CNY', nome: 'Yuan chinês', simbolo: '¥', bandeira: '🇨🇳', tipo: 'fiat', casas: 2 },
];

/** Moedas escolhidas na primeira abertura (ordem exibida). */
export const PADRAO = ['BTC', 'SATS', 'USD', 'BRL', 'PYG'];

/** Quantos satoshis tem 1 BTC. */
export const SATS_POR_BTC = 100_000_000;

export const POR_CODIGO = new Map(CATALOGO.map((m) => [m.codigo, m]));
export const CODIGOS = new Set(POR_CODIGO.keys());

/** Objeto do catálogo para um código, ou `null` se não existir. */
export function moedaInfo(codigo) {
  return POR_CODIGO.get(codigo) ?? null;
}
