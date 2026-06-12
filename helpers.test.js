const { test } = require('node:test');
const assert = require('node:assert');
const { productLabel, payLinkFor, normalizePhone, PRODUCTS } = require('./helpers');

test('productLabel: 코드→라벨', () => {
  assert.strictEqual(productLabel('A'), '게시1회');
  assert.strictEqual(productLabel('B'), '게시+공지고정');
  assert.strictEqual(productLabel('X'), '게시1회'); // 기본값 A
});

test('payLinkFor: 라벨→토스링크', () => {
  const links = { basic: 'https://t/basic', pin: 'https://t/pin' };
  assert.strictEqual(payLinkFor('게시+공지고정', links), 'https://t/pin');
  assert.strictEqual(payLinkFor('게시1회', links), 'https://t/basic');
});

test('normalizePhone: 숫자만', () => {
  assert.strictEqual(normalizePhone('010-1234-5678'), '01012345678');
});

test('PRODUCTS: 금액 정의', () => {
  assert.strictEqual(PRODUCTS.A.amount, 55000);
  assert.strictEqual(PRODUCTS.B.amount, 110000);
});
