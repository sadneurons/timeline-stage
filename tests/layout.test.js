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

// ---------------------------------------------------------------- Task 3
const OPTS = { height: 720, top: 90, bottom: 560 };

test('bands are proportional and ordered', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  assert.ok(g.bands.machine.y1 < g.bands.maisie.y0);
  assert.equal(g.bands.maisie.weight, 4);
  assert.equal(g.bands.machine.weight, 3);
});

test('siblings spread symmetrically and never cross', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const c = g.bands.maisie.centre;
  assert.ok(Math.abs((g.targets.passed - c) + (g.targets.failed - c)) < 1e-6);
  assert.ok(g.targets.b68 < g.targets.b77 && g.targets.b77 < g.targets.b84 && g.targets.b84 < g.targets.b91);
});

test('offsetAt eases through a fork and holds after it', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const c = g.bands.maisie.centre;
  assert.equal(L.offsetAt(g, m, 'b91', 1955), c);
  const mid = L.offsetAt(g, m, 'b91', 1961.5);
  assert.ok(mid > c && mid < g.targets.failed);
  assert.ok(Math.abs(L.offsetAt(g, m, 'b91', 1964) - g.targets.failed) < 1e-6);
  assert.ok(Math.abs(L.offsetAt(g, m, 'b91', 1975) - g.targets.b91) < 1e-6);
});

test('kinks do not apply to ended branches and do not throw', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  assert.equal(L.offsetAt(g, m, 'b68', 2030), L.offsetAt(g, m, 'b68', 2017));
});

test('yAt resolves a crossing endpoint on a branch after its fork', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  assert.equal(L.yAt(g, m, 'b77@2026'), L.offsetAt(g, m, 'b77', 2026));
  assert.equal(L.yAt(g, m, 'machine@2026'), g.bands.machine.centre);
});

test('a single line with no forks is centred', () => {
  const m = L.normalise({ lines: [{ id: 'one', start: 2000, end: 2010 }] });
  const g = L.layout(m, OPTS);
  assert.equal(g.bands.one.centre, 325);
  assert.equal(L.offsetAt(g, m, 'one', 2005), 325);
});

// ---------------------------------------------------------------- Task 4
test('samplePath clips to growth and never yields NaN', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const x = L.xScale([1946, 2045], 1140, 70);
  assert.equal(L.samplePath(g, m, 'maisie', [1946, 2045], 1940, x, {}), '');
  const d = L.samplePath(g, m, 'b91', [1946, 2045], 2100, x, {});
  assert.ok(d.startsWith('M') && !/NaN/.test(d));
  assert.ok(d.trim().endsWith(x(2040).toFixed(1) + ',' + L.offsetAt(g, m, 'b91', 2040).toFixed(1)), d.slice(-40));
});

test('strands bow together at a meeting', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const farJ = L.strandY(g, m, 'jefferson', 1950.5, { span: 8 }), nearJ = L.strandY(g, m, 'jefferson', 1949.44, { span: 8 });
  const farT = L.strandY(g, m, 'turing', 1950.5, { span: 8 }), nearT = L.strandY(g, m, 'turing', 1949.44, { span: 8 });
  assert.ok(Math.abs(nearJ - nearT) < Math.abs(farJ - farT));
});

test('assignLanes separates overlapping labels and hides the overflow', () => {
  const items = [{ x: 100, width: 120 }, { x: 130, width: 120 }, { x: 160, width: 120 }, { x: 190, width: 120 }, { x: 600, width: 50 }];
  const out = L.assignLanes(items, { gap: 8, maxLanes: 3 });
  assert.deepEqual(out.map(i => i.lane), [0, 1, 2, -1, 0]);
});

// ---------------------------------------------------------------- Task 5
test('resolveStates carries view, grow, colours and ends forward but not lit or dim', () => {
  const m = L.normalise(raw);
  const s = L.resolveStates([
    { attrs: null },
    { attrs: { view: '1946-1954', grow: 'maisie:1949.7 machine:1949.7', lit: 'x1949', colours: 'false' } },
    { attrs: { grow: 'maisie:1972', dim: 'true' } },
  ], m);
  assert.equal(s[0], null);
  assert.deepEqual(s[1].view, [1946, 1954]); assert.equal(s[1].colours, false); assert.ok(s[1].lit.has('x1949'));
  assert.deepEqual(s[2].view, [1946, 1954]); assert.equal(s[2].grow.machine, 1949.7); assert.equal(s[2].grow.maisie, 1972);
  assert.equal(s[2].lit.size, 0); assert.equal(s[2].dim, true); assert.equal(s[2].colours, false); assert.equal(s[2].ends, true);
});

test('resolveStates defaults and warnings', () => {
  const m = L.normalise(raw);
  const s = L.resolveStates([{ attrs: { lit: 'ghost' } }], m);
  assert.deepEqual(s[0].view, [1945, 2045]); assert.deepEqual(s[0].grow, {}); assert.ok(s[0].warnings[0].includes('ghost'));
});

test('a branch with children stops where it forks', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const x = L.xScale([1946, 2045], 1140, 70);
  const d = L.samplePath(g, m, 'maisie', [1946, 2045], 2000, x, {});
  assert.ok(d.trim().endsWith(x(1960).toFixed(1) + ',' + L.offsetAt(g, m, 'maisie', 1960).toFixed(1)), d.slice(-40));
  const p = L.samplePath(g, m, 'passed', [1946, 2045], 2000, x, {});
  assert.ok(p.trim().endsWith(x(1965).toFixed(1) + ',' + L.offsetAt(g, m, 'passed', 1965).toFixed(1)), p.slice(-40));
});
