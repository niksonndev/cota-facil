import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatarBtc,
  formatarDigitando,
  formatarFiat,
  formatarSats,
  formatarValor,
  normalizarEntrada,
  parseNumero,
  posicaoCursor,
} from '../src/formato.js';

test('parseNumero entende os formatos aceitos', () => {
  assert.equal(parseNumero('1.234,56'), 1234.56);
  assert.equal(parseNumero('1234.56'), 1234.56);
  assert.equal(parseNumero('1234,56'), 1234.56);
  assert.ok(Number.isNaN(parseNumero('')));
});

test('normalizarEntrada deixa só dígitos e uma vírgula', () => {
  assert.equal(normalizarEntrada('R$ 1.234,56'), '1234,56');
  assert.equal(normalizarEntrada('1234.56'), '1234,56');
  assert.equal(normalizarEntrada('1,2,3'), '1,23');
  assert.equal(normalizarEntrada('1.234'), '1234');
});

test('formatarDigitando agrupa milhares e preserva a vírgula aberta', () => {
  assert.equal(formatarDigitando('1234567,5'), '1.234.567,5');
  assert.equal(formatarDigitando('1234'), '1.234');
  assert.equal(formatarDigitando('0,'), '0,');
  assert.equal(formatarDigitando(''), '');
});

test('posicaoCursor acompanha a reformatação', () => {
  assert.equal(posicaoCursor('1.9234', '19.234', 3), 2);
  assert.equal(posicaoCursor('1234', '1.234', 4), 5);
  assert.equal(posicaoCursor('', '1', null), null);
});

test('formatarBtc usa precisão de satoshi', () => {
  assert.equal(formatarBtc(1), '1,000000');
  assert.equal(formatarBtc(0.00000235), '0,00000235');
  assert.equal(formatarBtc(0), '0,00');
});

test('formatarSats mostra fração abaixo de 1 e arredonda acima', () => {
  assert.equal(formatarSats(0.215), '0,215');
  assert.equal(formatarSats(235.5), '236');
  assert.equal(formatarSats(0), '0');
});

test('formatarFiat respeita as casas da moeda', () => {
  assert.equal(formatarFiat(1234.5, 2), '1.234,50');
  assert.equal(formatarFiat(1234.5, 0), '1.235');
});

test('formatarValor escolhe pelo tipo da moeda', () => {
  assert.equal(formatarValor(0.5, { tipo: 'btc' }), '0,50000000');
  assert.equal(formatarValor(2.5, { tipo: 'sats' }), '3');
  assert.equal(formatarValor(2.5, { tipo: 'fiat', casas: 2 }), '2,50');
});
