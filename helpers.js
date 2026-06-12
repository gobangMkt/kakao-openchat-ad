const PRODUCTS = {
  A: { label: '게시1회', amount: 55000, key: 'basic' },
  B: { label: '게시+공지고정', amount: 110000, key: 'pin' },
};

function productLabel(code) {
  return (PRODUCTS[code] || PRODUCTS.A).label;
}

function payLinkFor(label, links) {
  return label === '게시+공지고정' ? links.pin : links.basic;
}

function normalizePhone(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

if (typeof module !== 'undefined') {
  module.exports = { PRODUCTS, productLabel, payLinkFor, normalizePhone };
}
