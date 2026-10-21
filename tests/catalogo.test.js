import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOGO,
  CODIGOS,
  PADRAO,
  POR_CODIGO,
  moedaInfo,
} from '../src/catalogo.js';

test('códigos do catálogo são únicos', () => {
  assert.equal(CODIGOS.size, CATALOGO.length);
});

test('moedas padrão existem no catálogo', () => {
  for (const codigo of PADRAO) assert.ok(POR_CODIGO.has(codigo), codigo);
});

test('catálogo tem Bitcoin e Satoshi com tipos próprios', () => {
  assert.equal(moedaInfo('BTC')?.tipo, 'btc');
  assert.equal(moedaInfo('SATS')?.tipo, 'sats');
  assert.equal(moedaInfo('USD')?.casas, 2);
  assert.equal(moedaInfo('PYG')?.casas, 0);
});

test('moedaInfo não inventa uma moeda para código desconhecido', () => {
  assert.equal(moedaInfo('XYZ'), null);
});
