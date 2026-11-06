const test = require('node:test');
const assert = require('node:assert');
const L = require('../_extensions/timeline-stage/plugin/layout.js');
const raw = require('./fixtures/example.json');

// ---------------------------------------------------------------- Task 2
test('dates convert', () => {
  assert.equal(L.toDecimalYear('1949-06-09').toFixed(2), '1949.44');
  assert.equal(L.toDecimalYear(1960), 1960);
  assert.equal(L.toDecimalYear('1949-06').toFixed(2), '1949.41');
});

test('normalise builds the index and inherits colour', () => {
  const m = L.normalise(raw);
  assert.deepEqual(m.span, [1945, 2045]);
  assert.equal(m.index.b84.kind, 'branch');
  assert.equal(m.index.b84.line, 'maisie');
  assert.equal(m.index.b84.parent, 'failed');
  assert.equal(m.index.b84.start, 1965);
  assert.equal(m.index.failed.colour, m.index.maisie.colour);
  assert.equal(m.index.b91.colour, 'highlight');
});

test('forks-on becomes a kink fork on each listed branch', () => {
  const m = L.normalise(raw);
  const f = m.index.b68.forks.find(f => f.at === 1999);
  assert.ok(f && f.kink && f.children[0] === 'b68');
});

test('validate reports path and id', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.crossings[0].a = 'nobody@1949';
  bad.lines[1].forks[0].children[0].forks[0].children[0].end = 1950;
  const errs = L.validate(bad);
  assert.ok(errs.some(e => e.path === 'crossings[0]' && /unknown id "nobody"/.test(e.message)), JSON.stringify(errs));
  assert.ok(errs.some(e => e.path === 'lines[1].forks[0].children[0].forks[0].children[0]' && /end 1950 is before fork at 1965/.test(e.message)), JSON.stringify(errs));
  assert.deepEqual(L.validate(raw), []);
});
