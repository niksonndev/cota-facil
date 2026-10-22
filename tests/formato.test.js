import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatarBtc,
  formatarDigitando,
  formatarFiat,
  formatarQuando,
  formatarSats,
  formatarValor,
  normalizarCampoFormatado,
  normalizarEntrada,
  parseNumero,
  posicaoCursor,
} from '../src/formato.js';

test('parseNumero entende o formato brasileiro e o atalho decimal', () => {
  assert.equal(parseNumero('1.234,56'), 1234.56);
  assert.equal(parseNumero('1234,56'), 1234.56);
  assert.equal(parseNumero('1234.56'), 1234.56); // ponto digitado como atalho
  assert.equal(parseNumero('0.0001'), 0.0001); // idem, para valores pequenos
  assert.equal(parseNumero('1.234'), 1234);
  assert.ok(Number.isNaN(parseNumero('')));
});

test('normalizarEntrada deixa só dígitos e uma vírgula', () => {
  assert.equal(normalizarEntrada('R$ 1.234,56'), '1234,56');
  assert.equal(normalizarEntrada('1234.56'), '1234,56');
  assert.equal(normalizarEntrada('1,2,3'), '1,23');
  assert.equal(normalizarEntrada('1.234'), '1234');
});

test('normalizarEntrada remove zeros à esquerda', () => {
  assert.equal(normalizarEntrada('005'), '5');
  assert.equal(normalizarEntrada('00'), '0');
  assert.equal(normalizarEntrada('00,5'), '0,5');
});

test('normalizarEntrada aplica o formato brasileiro', () => {
  assert.equal(normalizarEntrada('1.'), '1,');
  assert.equal(normalizarEntrada('1.5'), '1,5'); // atalho de teclado
  assert.equal(normalizarEntrada('0.0001'), '0,0001');
  assert.equal(normalizarEntrada('00.007'), '0,007');
  assert.equal(normalizarEntrada('1.234'), '1234');
  assert.equal(normalizarEntrada('1.234,56'), '1234,56');
  assert.equal(normalizarEntrada('1,234.56'), '1,23456');
});

test('normalizarCampoFormatado trata todo ponto como milhar', () => {
  // Regressão: o campo já exibe "1.000"; ao digitar o quarto zero, o valor
  // bruto chega como "1.0000" e não pode virar "1,0000". Ao apagar um zero,
  // chega como "1.00" e não pode virar "1,00".
  assert.equal(normalizarCampoFormatado('1.0000'), '10000');
  assert.equal(normalizarCampoFormatado('10.0000'), '100000');
  assert.equal(normalizarCampoFormatado('1.000.0000'), '10000000');
  assert.equal(normalizarCampoFormatado('1.00'), '100');
  assert.equal(normalizarCampoFormatado('1.000,50'), '1000,50');
  assert.equal(normalizarCampoFormatado('0,0001'), '0,0001');
  assert.equal(formatarDigitando(normalizarCampoFormatado('1.0000')), '10.000');
  assert.equal(parseNumero(normalizarCampoFormatado('1.0000')), 10000);
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

test('formatarQuando mostra hora, data e ano só quando precisa', () => {
  const agora = new Date(2026, 9, 21, 16, 30);
  assert.equal(
    formatarQuando(new Date(2026, 9, 21, 16, 15).toISOString(), agora),
    'às 16:15',
  );
  assert.equal(
    formatarQuando(new Date(2026, 9, 20, 9, 5).toISOString(), agora),
    '20/10 às 09:05',
  );
  assert.equal(
    formatarQuando(new Date(2025, 9, 20, 9, 5).toISOString(), agora),
    '20/10/2025 às 09:05',
  );
  assert.equal(formatarQuando('não é data', agora), '—');
});
