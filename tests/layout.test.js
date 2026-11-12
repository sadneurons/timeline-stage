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
  assert.equal(L.yAt(g, m, 'machine@2026'), g.targets.machine);
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

// ---------------------------------------------------------------- Task 6
test('litSet lights ancestors, strands and events', () => {
  const m = L.normalise(raw);
  const s = L.litSet(m, new Set(['b91', 'x1965']));
  for (const id of ['b91', 'failed', 'maisie', 'x1965']) assert.ok(s.has(id), id);
  assert.ok(!s.has('b68'));
  const t = L.litSet(m, new Set(['machine']));
  assert.ok(t.has('jefferson') && t.has('lister'));
});

// ---------------------------------------------------------------- review fixes
test('kinks alternate so adjacent siblings never drift together', () => {
  const r = JSON.parse(JSON.stringify(raw));
  r.lines[1]['forks-on'] = [1989, 1999, 2009, 2026].map(at => ({ at, label: 'k', branches: ['b68', 'b77', 'b84', 'b91'] }));
  const m = L.normalise(r), g = L.layout(m, OPTS);
  const gap = y => Math.abs(L.offsetAt(g, m, 'b84', y) - L.offsetAt(g, m, 'b77', y));
  assert.ok(gap(2030) >= gap(1980) - 2 * g.opts.kink - 1, `gap ${gap(1980)} -> ${gap(2030)}`);
});

test('assignLanes keeps groups apart and honours a preset lane', () => {
  const items = [{ x: 100, width: 120, group: 'a' }, { x: 110, width: 120, group: 'b' }, { x: 120, width: 120, group: 'a', lane: 2 }];
  const out = L.assignLanes(items, { gap: 8, maxLanes: 3 });
  assert.deepEqual(out.map(i => i.lane), [0, 0, 2]);
});

test('normalise keeps top-level options and event lanes', () => {
  const r = JSON.parse(JSON.stringify(raw));
  r.options = { easeYears: 5, kink: 10 };
  r.lines[0].events[0].lane = 2;
  const m = L.normalise(r);
  assert.deepEqual(m.options, { easeYears: 5, kink: 10 });
  assert.equal(m.index.baby.lane, 2);
  assert.equal(L.layout(m, m.options).opts.easeYears, 5);
});

test('jitter ranks events that sit within one label thickness of each other', () => {
  const items = [{ x: 100 }, { x: 108 }, { x: 115 }, { x: 160 }, { x: 400 }, { x: 410 }];
  const out = L.jitterRanks(items, { gap: 20 });
  assert.deepEqual(out.map(i => i.rank), [0, 1, 2, 0, 0, 1]);
});

test('lighting a line lights its whole tree', () => {
  const m = L.normalise(raw);
  const s = L.litSet(m, new Set(['maisie']));
  for (const id of ['maisie', 'passed', 'failed', 'b68', 'b91', 'sonnet']) assert.ok(s.has(id), id);
  assert.ok(!s.has('machine') && !s.has('jefferson'));
});

// ---------------------------------------------------------------- redesign (0.2)
test('labels name a branch at its fork; endings come only from end-label', () => {
  const m = L.normalise(raw);
  assert.equal(m.index.passed.label, 'grammar school');
  assert.equal(m.index.b68.label, '');
  assert.equal(m.index.b68.endLabel, 'diagnosed at 68');
  assert.equal(m.index.passed.endLabel, '');
});

test('a line and its strands sit as one group centred in the band', () => {
  const m = L.normalise(raw), g = L.layout(m, OPTS);
  const c = g.bands.machine.centre, gap = g.opts.strandGap;
  assert.equal(g.targets.machine, c - gap);
  assert.equal(g.targets.jefferson, c);
  assert.equal(g.targets.turing, c + gap);
  assert.equal(L.offsetAt(g, m, 'machine', 1990), c - gap);
  // a line without strands still runs along the band centre
  assert.equal(g.targets.maisie, g.bands.maisie.centre);
});

test('a fork can set its own ease', () => {
  const r = JSON.parse(JSON.stringify(raw));
  r.lines[1].forks[0].ease = 1;
  const m = L.normalise(r), g = L.layout(m, OPTS);
  assert.ok(Math.abs(L.offsetAt(g, m, 'passed', 1961) - g.targets.passed) < 1e-6);
  const m3 = L.normalise(raw), g3 = L.layout(m3, OPTS);
  assert.ok(Math.abs(L.offsetAt(g3, m3, 'passed', 1961) - g3.targets.passed) > 1);
  assert.equal(L.easeOf(g, m.index.maisie.forks[0]), 1);
  assert.equal(L.easeOf(g3, m3.index.maisie.forks[0]), 3);
  const bad = JSON.parse(JSON.stringify(raw)); bad.lines[1].forks[0].ease = 0;
  assert.ok(L.validate(bad).some(e => /ease/.test(e.message)));
});

test('a bare year in grow grows every line and clears earlier per-id growth', () => {
  const m = L.normalise(raw);
  const s = L.resolveStates([
    { attrs: { grow: 'maisie:1963 machine:1950' } },
    { attrs: { grow: '1970' } },
    { attrs: { grow: '1980 machine:1961' } },
    { attrs: {} },
  ], m);
  assert.equal(L.growFor(s[0], m, 'passed'), 1963);
  assert.equal(L.growFor(s[1], m, 'passed'), 1970);
  assert.equal(L.growFor(s[1], m, 'turing'), 1970);
  assert.equal(L.growFor(s[2], m, 'b91'), 1980);
  assert.equal(L.growFor(s[2], m, 'jefferson'), 1961);
  assert.equal(L.growFor(s[3], m, 'b91'), 1980);
});

test('now is read per slide, accepts dates, and is not carried forward', () => {
  const m = L.normalise(raw);
  const s = L.resolveStates([{ attrs: { now: '1949-06-09' } }, { attrs: {} }, { attrs: { now: 'soon' } }], m);
  assert.equal(s[0].now.toFixed(2), '1949.44');
  // dates two days apart stay distinct
  assert.ok(L.toDecimalYear('1949-06-11') > L.toDecimalYear('1949-06-09'));
  assert.equal(s[1].now, null);
  assert.equal(s[2].now, null); assert.ok(s[2].warnings.some(w => /now/.test(w)));
});

test('placeLabels keeps the highest priority of overlapping labels', () => {
  const box = (x0, y0, x1, y1) => [{ x0, y0, x1, y1 }];
  const items = [
    { boxes: box(0, 0, 100, 20), priority: 1 },
    { boxes: box(90, 5, 200, 25), priority: 2 },     // overlaps the first, wins
    { boxes: box(300, 0, 400, 20), priority: 0 },    // clear of both
    { boxes: box(95, 0, 150, 20), priority: 5, group: 'g' },
    { boxes: box(100, 0, 160, 20), priority: 4, group: 'g' },  // same group: never hidden by its own group
  ];
  L.placeLabels(items, { pad: 2 });
  assert.deepEqual(items.map(i => i.keep), [false, false, true, true, true]);
});

test('placeLabels hides labels that leave the bounds and respects fixed obstacles', () => {
  const items = [
    { boxes: [{ x0: -10, y0: 0, x1: 50, y1: 20 }], priority: 9 },
    { boxes: [{ x0: 10, y0: 100, x1: 60, y1: 120 }], priority: 1 },
    { boxes: [{ x0: 10, y0: 200, x1: 60, y1: 220 }], priority: 1 },
  ];
  L.placeLabels(items, { bounds: { x0: 0, y0: 0, x1: 1280, y1: 720 }, obstacles: [{ x0: 0, y0: 190, x1: 30, y1: 230 }] });
  assert.deepEqual(items.map(i => i.keep), [false, true, false]);
});

test('diagBoxes follows a label hanging down and left at 45 degrees', () => {
  const b = L.diagBoxes(500, 300, 120, 18);
  assert.ok(b.length >= 6);
  assert.ok(b.every(k => k.x1 <= 500 + 1 && k.y0 >= 300 - 12));
  const last = b[b.length - 1];
  assert.ok(last.x0 < 500 - 70 && last.y1 > 300 + 70);
  // side: above rises up and to the right from its start
  const u = L.diagBoxes(500, 300, 120, 18, 0, true), ul = u[u.length - 1];
  assert.ok(u.every(k => k.y1 <= 300 + 12) && ul.x1 > 500 + 70 && ul.y0 < 300 - 70);
});

test('tickStep picks a readable label step for the zoom', () => {
  assert.equal(L.tickStep(144), 1);
  assert.equal(L.tickStep(76), 2);
  assert.equal(L.tickStep(24), 5);
  assert.equal(L.tickStep(11.5), 10);
});

test('a strand can take the lane of one that has ended', () => {
  const r = JSON.parse(JSON.stringify(raw));
  r.lines[0].strands.push({ id: 'centre', label: 'The Centre', start: 2015, lane: 1 });
  const m = L.normalise(r), g = L.layout(m, OPTS);
  assert.equal(g.targets.centre, g.targets.jefferson);
  // the group is still two rows deep, so nothing else moves
  const g0 = L.layout(L.normalise(raw), OPTS);
  assert.equal(g.targets.machine, g0.targets.machine);
  assert.equal(g.targets.turing, g0.targets.turing);
});

test('an event can carry a date, a note and pictures to open', () => {
  const r = JSON.parse(JSON.stringify(raw));
  r.lines[0].events.push({ id: 'lp', year: 2023.29, label: 'first lumbar puncture', date: 'Apr 2023',
    text: 'First lumbar puncture in repurposed ECT recovery', img: 'a.png | b.png', planned: true });
  r.lines[0].events.push({ id: 'list', year: 2024, label: 'x', img: ['c.png'] });
  const m = L.normalise(r);
  assert.deepEqual(m.index.lp.img, ['a.png', 'b.png']);
  assert.equal(m.index.lp.date, 'Apr 2023'); assert.equal(m.index.lp.planned, true);
  assert.deepEqual(m.index.list.img, ['c.png']);
  assert.deepEqual(m.index.baby.img, []); assert.equal(m.index.baby.text, '');
});

test('stackDiagonal steps a 45-degree label clear of the ones it would overlap', () => {
  // two events at the same moment on rows 30px apart, one a little later on the top row, one far away
  const items = [
    { x: 500, y: 240, len: 200 }, { x: 501, y: 270, len: 150 }, { x: 520, y: 240, len: 120 }, { x: 900, y: 240, len: 200 },
  ];
  L.stackDiagonal(items, { gap: 22, shift: 18 });
  // the later label on the top row steps once; the one on the lower row then has to clear both
  assert.deepEqual(items.map(i => i.rank), [0, 2, 1, 0]);
  // a label that rises from its point does not collide with one that hangs from a point beside it
  const mixed = [{ x: 500, y: 240, len: 200 }, { x: 506, y: 240, len: 200, up: true }];
  L.stackDiagonal(mixed, { gap: 22, shift: 18 });
  assert.deepEqual(mixed.map(i => i.rank), [0, 0]);
});

test('lighting a strand lights it and its events, not the line it runs beside', () => {
  const m = L.normalise(raw);
  const s = L.litSet(m, new Set(['turing']));
  assert.ok(s.has('turing') && s.has('times'));
  assert.ok(!s.has('machine') && !s.has('baby') && !s.has('jefferson'));
});

test('hold keeps named events back for one slide and is not carried forward', () => {
  const m = L.normalise(raw);
  const s = L.resolveStates([{ attrs: { hold: 'baby, lister' } }, { attrs: {} }, { attrs: { hold: 'machine nobody' } }], m);
  assert.ok(s[0].hold.has('baby') && s[0].hold.has('lister') && s[0].warnings.length === 0);
  assert.equal(s[1].hold.size, 0);
  assert.equal(s[2].warnings.filter(w => /hold/.test(w)).length, 2);   // a line is not an event; nobody is unknown
});
