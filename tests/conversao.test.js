import assert from 'node:assert/strict';
import { test } from 'node:test';
import { converter, tabelaDeTaxas } from '../src/conversao.js';

const DADOS = {
  USD: 1,
  BRL: 5,
  BTC: 0.00001,
  EUR: 0.9,
  PYG: 7000,
};

test('tabelaDeTaxas deriva SATS do BTC', () => {
  const taxa = tabelaDeTaxas(DADOS);
  assert.ok(taxa);
  assert.ok(Math.abs(taxa.SATS - 1000) < 1e-9);
  assert.equal(taxa.BRL, 5);
});

test('tabelaDeTaxas exige as moedas obrigatórias', () => {
  assert.equal(tabelaDeTaxas({ USD: 1, BRL: 5 }), null);
  assert.equal(tabelaDeTaxas(null), null);
  assert.equal(tabelaDeTaxas('x'), null);
});

test('tabelaDeTaxas ignora cotações zero, negativas ou não finitas', () => {
  const taxa = tabelaDeTaxas({
    ...DADOS,
    BRL: 0,
    EUR: -1,
    PYG: Number.POSITIVE_INFINITY,
  });
  assert.equal(taxa, null);
  assert.ok(tabelaDeTaxas({ ...DADOS, EUR: -1 })?.EUR == null);
  assert.ok(tabelaDeTaxas({ ...DADOS, EUR: 0 })?.EUR == null);
});

test('converter recusa tabela com taxa zero', () => {
  assert.equal(converter(1, 'USD', 'BRL', { USD: 1, BRL: 0 }), null);
  assert.equal(converter(1, 'BRL', 'USD', { USD: 1, BRL: 0 }), null);
});

test('converter usa a base USD e preserva o valor exato', () => {
  const taxa = tabelaDeTaxas(DADOS);
  assert.equal(converter(10, 'BRL', 'USD', taxa), 2);
  assert.equal(converter(2, 'USD', 'BRL', taxa), 10);
  assert.equal(
    converter(converter(1, 'BRL', 'PYG', taxa), 'PYG', 'BRL', taxa),
    1,
  );
});

test('converter não aceita valores não finitos', () => {
  const taxa = tabelaDeTaxas(DADOS);
  assert.equal(converter(Number.POSITIVE_INFINITY, 'USD', 'BRL', taxa), null);
  assert.equal(converter(1, 'USD', 'BRL', null), null);
  assert.equal(converter(1, 'USD', 'EUR', {}), null);
});

test('converter devolve a própria quantidade quando a moeda é a mesma', () => {
  assert.equal(converter(7, 'USD', 'USD', null), 7);
});
