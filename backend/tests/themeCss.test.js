const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeThemeCss, MAX_CUSTOM_CSS_LENGTH } = require('../utils/themeCss');

test('custom theme CSS is storefront-scoped and layout declarations are removed', () => {
  const result = sanitizeThemeCss('.product-card { color: #fff; display:none; margin:0; font-size:100px; border-radius:20px; }');
  assert.match(result, /^\.customer-storefront \.product-card/);
  assert.match(result, /color: #fff/);
  assert.match(result, /border-radius:20px/);
  assert.doesNotMatch(result, /display|margin|font-size/);
});

test('root selectors and active content are rejected', () => {
  const result = sanitizeThemeCss('body { background:black } .x { color:red; background:url(javascript:alert(1)) }');
  assert.doesNotMatch(result, /body/);
  assert.doesNotMatch(result, /javascript/);
});

test('custom CSS size is bounded', () => {
  const result = sanitizeThemeCss(`.x{color:red;} ${' '.repeat(MAX_CUSTOM_CSS_LENGTH * 2)}`);
  assert.ok(result.length <= MAX_CUSTOM_CSS_LENGTH);
});

test('sanitizing saved CSS repeatedly does not duplicate storefront scope', () => {
  const once = sanitizeThemeCss('.title { color: white; }');
  assert.equal(sanitizeThemeCss(once), once);
});
