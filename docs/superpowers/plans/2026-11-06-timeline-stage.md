# timeline-stage implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Quarto reveal.js extension where a talk's timeline is a YAML file, a generic SVG engine draws it behind every slide, and slides are hand-written with heading attributes and fenced divs.

**Architecture:** A Lua filter embeds the validated timeline as JSON, marks `.stage` slides and turns `.pin`/`.cover` divs into overlays. A dependency-free layout module (pure functions, testable in node) turns the data into bands, branch offsets, sampled paths and label lanes. A reveal plugin builds one SVG behind the slides, resolves each slide's state from its attributes with carry-forward, and tweens between states.

**Tech Stack:** Quarto 1.8 (Pandoc Lua filters, `revealjs-plugins`), plain ES2017 JavaScript (no bundler; `layout.js` is UMD so `node --test` can load it), CSS with custom properties, Python 3 + pytest for render tests, one headless Chromium (snap) for visual checks.

**Spec:** `docs/superpowers/specs/2026-11-06-timeline-stage-design.md`

## Global Constraints

- Overlays are fenced divs: `::: {.pin year=1965 side=below width=wide align=right}` and `::: {.cover tone=dark}`. No shortcodes.
- Slide attributes on `.stage` headings: `view="y0-y1"`, `grow="id:year …"`, `lit="id id …"`, `dim="true|false"`, `colours="true|false"`, `ends="true|false"`. `view`, `grow`, `colours`, `ends` carry forward from the previous `.stage` slide; `lit` and `dim` do not. Defaults: `view` = data `span`; `grow` = nothing drawn; `colours` = `true`; `ends` = `true`.
- `grow` accepts any line or branch id; a branch inherits its line's growth unless set.
- Lighting an id lights its ancestors back to the line start; a line lights its strands and events; a crossing lights only its marker and label. Nothing lit means nothing dimmed.
- Validation errors name the path and id, e.g. `lines[2].forks[1].children[0]: end 2017 is before fork at 2026`, and fail the render. No line numbers.
- The extension sets nothing in reveal's global config. Stage sections get `data-transition="none"` and extension CSS makes them top-anchored and padding-free.
- Colour tokens `primary`, `accent`, `highlight`, `muted`, `ink` map to CSS variables `--stage-primary` etc., defaulted from the reveal theme in `stage.scss`; a CSS colour literal is used as is.
- Time-only zoom; layout fixed up front from the whole data set; growth is a clip in years.
- Years may be numbers or ISO dates (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`), converted to decimal years (day of year / 365.25).
- Never launch Firefox; at most one headless Chromium at a time, fresh `--user-data-dir` under `~/snap/chromium/common/`, closed via DevTools `Browser.close`.
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

## Review Focus

1. A `grow` year before a line's start, or after the data `span`: the line is drawn as nothing or fully, never NaN paths. Test in Task 4.
2. Two slides in a row with identical state: no animation glitch, no re-layout, pins still placed. Test in Task 6 (CDP step asserts the SVG path count and pin `left` unchanged).
3. A fork whose children all end before the next shared `forks-on` year: the kink must not apply to ended branches and must not throw. Test in Task 3.
4. An `lit` id that does not exist: warn in the console, ignore, dim nothing extra. Test in Task 6.
5. A timeline with one line and no forks: layout still centres it and the deck renders. Test in Task 3 and Task 7 (example includes a single-line case in tests).

---

## File structure

- `_extensions/timeline-stage/_extension.yml`: contributes `filters: [stage.lua]` and `revealjs-plugins: [plugin.yml]`.
- `_extensions/timeline-stage/plugin.yml`: `name: TimelineStage`, `script: [layout.js, stage.js]`, `stylesheet: [stage.css]`.
- `_extensions/timeline-stage/stage.lua`: read `timeline.yml`, convert to plain Lua, validate, embed JSON; Div handlers for `.pin` and `.cover`; `data-transition="none"` on `.stage` sections.
- `_extensions/timeline-stage/layout.js`: pure functions (UMD): `normalise`, `validate`, `layout`, `offsetAt`, `yAt`, `samplePath`, `assignLanes`, `resolveStates`.
- `_extensions/timeline-stage/stage.js`: reveal plugin: SVG construction, state application, tween, pins.
- `_extensions/timeline-stage/stage.css`: tokens, stage, section, pin and cover styles (hand-written CSS with variables; no SCSS pipeline needed for a plugin stylesheet, so the spec's `stage.scss` becomes `stage.css` whose tokens default from reveal's `--r-*` variables).
- `example/_quarto.yml`, `example/index.qmd`, `example/timeline.yml`: a deck exercising every feature.
- `tests/layout.test.js`: `node --test`.
- `tests/test_render.py`: renders `example/` and asserts on the HTML.
- `tools/shoot_deck.py`: copy of the GJBRC deck's screenshot tool. `tools/cdp_eval.py`: evaluate JS expressions in the rendered deck, single Chromium.
- `README.md`.

---

### Task 1: Extension scaffold, filter embedding, example renders

**Files:**
- Create: `_extensions/timeline-stage/_extension.yml`, `plugin.yml`, `stage.lua`, empty `layout.js`, empty `stage.js`, `stage.css` (empty), `example/_quarto.yml`, `example/index.qmd`, `example/timeline.yml`
- Test: `tests/test_render.py`

**Interfaces:**
- Produces in rendered HTML: `<script type="application/json" id="stage-data">{…}</script>` exactly once; every `.stage` section carries `data-transition="none"`; a `::: {.pin year=1965 side=below}` div renders as `<div class="pin side-below" data-year="1965">`; `::: {.cover tone=dark}` as `<div class="cover tone-dark">`.
- Lua: `read_timeline(path) -> table` (plain Lua: numbers as numbers, lists as arrays), `to_decimal_year(v) -> number` (`1949-06-09` → 1949.44; `1949` → 1949; `1949-06` → 1949.41).

- [ ] **Step 1: Write the failing render test**

```python
import re, subprocess, pathlib
EX = pathlib.Path(__file__).parent.parent / "example"

def render():
    subprocess.run(["quarto", "render", "index.qmd"], cwd=EX, check=True, capture_output=True)
    return (EX / "_site" / "index.html").read_text()

def test_data_embedded_once_and_converted():
    html = render()
    assert html.count('id="stage-data"') == 1
    data = html.split('id="stage-data">')[1].split("</script>")[0]
    assert '"start":1949.44' in data.replace(" ", "")      # 1949-06-09 converted
    assert '"span":[1945,2045]' in data.replace(" ", "")

def test_stage_sections_and_overlays():
    html = render()
    assert re.search(r'<section[^>]*class="[^"]*\bstage\b[^"]*"[^>]*data-transition="none"', html)
    assert re.search(r'<div class="pin side-below[^"]*" data-year="1965"', html)
    assert re.search(r'<div class="cover tone-dark[^"]*"', html)
```

- [ ] **Step 2: Run it to verify it fails** — `python3 -m pytest tests/test_render.py -q`. Expected: FAIL (example missing / no stage-data).

- [ ] **Step 3: Write `_extension.yml`, `plugin.yml`, the example deck and `stage.lua`.** `example/_quarto.yml`: `project: {type: default, output-dir: _site}`, `format: {revealjs: {filters: [timeline-stage], revealjs-plugins: [timeline-stage], width: 1280, height: 720}}`. `timeline.yml`: the machine/Maisie data from the spec (two lines, strands, fork tree, `forks-on`, events, three crossings, `span: [1945, 2045]`). `index.qmd`: a title slide, four `.stage` slides with the attributes from the spec, one with a `.pin year=1965 side=below`, one with a `.cover tone=dark`. `stage.lua`: read the YAML via `pandoc.read("---\n"..text.."\n---\n", "markdown").meta`, convert `Meta` to plain Lua (`MetaString` → number if numeric else string; dates by regex to decimal years), embed with `pandoc.json.encode` in a `RawBlock` appended to the document, set `data-transition` on headers with class `stage` (Quarto copies header attributes to the section), map Div classes `pin`/`cover` and their `side`/`tone`/`width`/`align`/`year` attributes to classes `side-*`, `tone-*`, `width-*`, `align-*` and `data-year`.

- [ ] **Step 4: Run tests** — Expected: 2 passed.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Scaffold the timeline-stage extension: filter embeds the timeline, marks stage slides and overlays"`.

### Task 2: Normalise and validate the data

**Files:**
- Modify: `_extensions/timeline-stage/layout.js`
- Test: `tests/layout.test.js`

**Interfaces:**
- `normalise(raw) -> model` where `model = { span: [y0, y1], lines: [...], index: { id: node } }`; each node: `{ id, kind: 'line'|'strand'|'branch'|'event'|'crossing'|'fork', line: lineId, parent: id|null, start, end|null, colour, label, children: [ids] (branches), forks: [{at, label, children: [ids], kink: bool}], events: [...] }`. `forks-on` entries become forks with `kink: true` and a single child that is the same id. Colour inheritance resolved. `start` of a branch = its fork's `at`.
- `validate(raw) -> []` returns an array of `{ path, message }`; empty means valid. Messages: `unknown id "<id>"`, `duplicate id "<id>"`, `fork at <y> is before branch start <y>`, `end <y> is before fork at <y>`, `crossing endpoint "<id>@<y>" is outside that id's years`.
- `toDecimalYear(v) -> number` (same rule as the Lua; both exist so the engine can accept raw dates too).

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test'); const assert = require('node:assert');
const L = require('../_extensions/timeline-stage/layout.js');
const yaml = require('fs').readFileSync(__dirname + '/../example/timeline.yml', 'utf8');
// a tiny YAML subset parser is not worth it: tests use JSON fixtures mirroring timeline.yml
const raw = require('./fixtures/example.json');

test('dates convert', () => {
  assert.equal(L.toDecimalYear('1949-06-09').toFixed(2), '1949.44');
  assert.equal(L.toDecimalYear(1960), 1960);
  assert.equal(L.toDecimalYear('1949-06').toFixed(2), '1949.41');
});
test('normalise builds the index and inherits colour', () => {
  const m = L.normalise(raw);
  assert.deepEqual(m.span, [1945, 2045]);
  assert.equal(m.index.b84.kind, 'branch'); assert.equal(m.index.b84.line, 'maisie');
  assert.equal(m.index.b84.parent, 'failed'); assert.equal(m.index.b84.start, 1965);
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
  assert.ok(errs.some(e => e.path === 'crossings[0]' && /unknown id "nobody"/.test(e.message)));
  assert.ok(errs.some(e => e.path === 'lines[1].forks[0].children[0].forks[0].children[0]' && /end 1950 is before fork at 1965/.test(e.message)));
  assert.deepEqual(L.validate(raw), []);
});
```

Fixture: `tests/fixtures/example.json`, the JSON form of `example/timeline.yml` (write it by hand to match).

- [ ] **Step 2: Run** `node --test tests/` — Expected: FAIL, functions undefined.
- [ ] **Step 3: Implement `toDecimalYear`, `normalise`, `validate` in `layout.js`** (UMD wrapper: `module.exports` when present, else `window.StageLayout`).
- [ ] **Step 4: Run** — Expected: 4 passed.
- [ ] **Step 5: Commit** — `git commit -m "layout: normalise the timeline data and validate ids, forks and ends"`.

### Task 3: Bands, branch offsets and y resolution

**Files:**
- Modify: `layout.js`; Test: `tests/layout.test.js`

**Interfaces:**
- `layout(model, opts) -> geom` with `opts = { height, top, bottom, easeYears: 3, kink: 6, strandGap: 28, spread: 0.8 }`. `geom = { bands: { lineId: { y0, y1, centre, weight } }, targets: { id: yTarget } }`. Weight of a line = `max(leafCount(root), 1 + strands.length)`; band heights proportional to weight within `[top, bottom]` with a gap of `0.06 * (bottom - top)` between lines; branch targets by in-order leaf placement across `spread * bandHeight` centred on the band, internal branches at the mean of their leaves; strands at `centre ± strandGap * k` alternating.
- `offsetAt(geom, model, id, year) -> y`: walk from the line root along the ancestry of `id`; at each ancestor fork year `f`, ease from the parent's target to the child's target over `easeYears` with smoothstep; kinks add `±opts.kink` (sign alternates by the branch's index among its fork siblings' order) eased the same way. Before the line start, return the root centre.
- `yAt(geom, model, ref, opts) -> y` where `ref = 'id@year'`; for strands, the strand's own y (with bow applied in Task 4); for events, the y of what they sit on.

- [ ] **Step 1: Write failing tests**

```js
test('bands are proportional and ordered', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  assert.ok(g.bands.machine.y1 < g.bands.maisie.y0);
  assert.equal(g.bands.maisie.weight, 4); assert.equal(g.bands.machine.weight, 3);
});
test('siblings spread symmetrically and never cross', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  const c = g.bands.maisie.centre;
  assert.ok(Math.abs((g.targets.passed - c) + (g.targets.failed - c)) < 1e-6);
  assert.ok(g.targets.b68 < g.targets.b77 && g.targets.b77 < g.targets.b84 && g.targets.b84 < g.targets.b91);
});
test('offsetAt eases through a fork and holds after it', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  const c = g.bands.maisie.centre;
  assert.equal(L.offsetAt(g, m, 'b91', 1955), c);
  const mid = L.offsetAt(g, m, 'b91', 1961.5);
  assert.ok(mid > c && mid < g.targets.failed);
  assert.ok(Math.abs(L.offsetAt(g, m, 'b91', 1964) - g.targets.failed) < 1e-6);
  assert.ok(Math.abs(L.offsetAt(g, m, 'b91', 1975) - g.targets.b91) < 1e-6);
});
test('kinks do not apply to ended branches and do not throw', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  assert.equal(L.offsetAt(g, m, 'b68', 2030), L.offsetAt(g, m, 'b68', 2017));  // ended 2017: frozen
});
test('yAt resolves a crossing endpoint on a branch after its fork', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  assert.equal(L.yAt(g, m, 'b77@2026'), L.offsetAt(g, m, 'b77', 2026));
  assert.equal(L.yAt(g, m, 'machine@2026'), g.bands.machine.centre);
});
test('a single line with no forks is centred', () => {
  const m = L.normalise({ lines: [{ id: 'one', start: 2000, end: 2010 }] });
  const g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  assert.equal(g.bands.one.centre, 325); assert.equal(L.offsetAt(g, m, 'one', 2005), 325);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `layout`, `offsetAt`, `yAt`.** **Step 4: Run** — all pass. **Step 5: Commit** `"layout: bands, branch targets, eased forks and kinks, y resolution"`.

### Task 4: Paths, strands, growth clip and label lanes

**Files:**
- Modify: `layout.js`; Test: `tests/layout.test.js`

**Interfaces:**
- `xScale(view, width, left) -> (year => x)`; `samplePath(geom, model, id, view, grow, x, opts) -> string` (SVG `d`, empty string if nothing to draw); samples every `max(0.1, span/400)` years from the node's start to `min(grow, end ?? span[1])` where `grow` is the resolved growth for that id (Task 5 resolves; here it is a number). Ended branches with `ends=false` grow to the line's growth (pass `end: null` by the caller). A `grow` below start returns `''`; above span end is clamped.
- `strandY(geom, model, strandId, year, opts) -> y`: the strand's lane y, bowed by up to `opts.bow` (default 12) towards the mean of the strands named in a `meets` entry within `±0.8` years of its year, scaled by `min(1, 14 / span)`.
- `assignLanes(items, opts) -> items with lane`: items `{ x, width, side }`, greedy by `x`, a lane is reused when the previous item in it ends before `x - gap`; `maxLanes` (default 3); items beyond the lanes get `lane: -1` (hidden). Width estimate helper `textWidth(label, fontSize) = label.length * 0.56 * fontSize`.

- [ ] **Step 1: Write failing tests**

```js
test('samplePath clips to growth and never yields NaN', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  const x = L.xScale([1946, 2045], 1140, 70);
  assert.equal(L.samplePath(g, m, 'maisie', [1946, 2045], 1940, x, {}), '');
  const d = L.samplePath(g, m, 'b91', [1946, 2045], 2100, x, {});
  assert.ok(d.startsWith('M') && !/NaN/.test(d));
  assert.ok(d.trim().endsWith(x(2040).toFixed(1) + ',' + L.offsetAt(g, m, 'b91', 2040).toFixed(1)));
});
test('strands bow together at a meeting', () => {
  const m = L.normalise(raw), g = L.layout(m, { height: 720, top: 90, bottom: 560 });
  const far = L.strandY(g, m, 'jefferson', 1950.5, { span: 8 }), near = L.strandY(g, m, 'jefferson', 1949.44, { span: 8 });
  const tur = L.strandY(g, m, 'turing', 1949.44, { span: 8 });
  assert.ok(Math.abs(near - tur) < Math.abs(far - L.strandY(g, m, 'turing', 1950.5, { span: 8 })));
});
test('assignLanes separates overlapping labels and hides the overflow', () => {
  const items = [{ x: 100, width: 120 }, { x: 150, width: 120 }, { x: 200, width: 120 }, { x: 250, width: 120 }, { x: 600, width: 50 }];
  const out = L.assignLanes(items, { gap: 8, maxLanes: 3 });
  assert.deepEqual(out.map(i => i.lane), [0, 1, 2, -1, 0]);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — pass. **Step 5: Commit** `"layout: sampled paths with growth clip, strand bows, label lanes"`.

### Task 5: Plugin: build the stage and resolve slide states

**Files:**
- Modify: `stage.js`, `stage.css`
- Create: `tools/cdp_eval.py` (from the GJBRC scratch script: args `html`, then JS expressions; prints JSON results; single Chromium, fresh profile, `Browser.close`), `tools/shoot_deck.py` (copy from the GJBRC repo)
- Test: `tests/layout.test.js` (state resolution is pure and lives in `layout.js`), plus a CDP check

**Interfaces:**
- `resolveStates(sections, model) -> states[]` in `layout.js`: input `[{ attrs: { view, grow, lit, dim, colours, ends } | null }]` (null = not a stage slide); output per slide `null` or `{ view: [y0, y1], grow: { id: year }, lit: Set, dim: bool, colours: bool, ends: bool }` with carry-forward as in Global Constraints; `grow` parses `"maisie:1972 machine:1966"`; unknown ids in `lit` or `grow` are kept but reported in `state.warnings`.
- `stage.js` registers `window.TimelineStage = { id: 'timeline-stage', init(reveal) }` (Quarto's `revealjs-plugins` expects a plugin object on `window` named as in `plugin.yml`). `init` reads `#stage-data`, runs `normalise`, `layout` with `{ height: reveal.getConfig().height, top: 0.12 * h, bottom: 0.78 * h }`, builds the SVG (axis with adaptive ticks: every 10 years when span > 60, 5 when > 25, else 1; one `path` per line, strand and branch; groups for events, forks, crossings, ends), inserts it as the first child of `.reveal .slides` with class `stage`, resolves states for all sections once, and on `ready`/`slidechanged` applies the current slide's state. This task applies states instantly (no tween) and ignores pins.
- Growth resolution for drawing: `growFor(state, id)` = `state.grow[id]` if present, else the line's value, else `-Infinity`.

- [ ] **Step 1: Write failing tests for `resolveStates`**

```js
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
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `resolveStates` in `layout.js`, then `stage.js` as specified, and the CSS for `.reveal .slides .stage` (absolute, full slide size, `z-index: 0`, `pointer-events: none`) and `.reveal .slides section.stage` (padding 0, top-anchored).** **Step 4: Run** `node --test tests/` — pass; `python3 -m pytest -q` — pass. Then `cd example && quarto render` and one CDP check: `python3 tools/cdp_eval.py example/_site/index.html "Reveal.slide(2); document.querySelectorAll('.stage path').length" "document.querySelector('.stage path[data-id=\"maisie\"]').getAttribute('d').length > 0"` — Expected: path count equals lines + strands + branches (9 for the example), second expression `true`.
- [ ] **Step 5: Commit** `"plugin: build the stage from the data and apply each slide's resolved state"`.

### Task 6: Animation, lighting, colours/ends toggles, pins and covers

**Files:**
- Modify: `stage.js`, `stage.css`

**Interfaces:**
- Tween: on `slidechanged` interpolate `view` and every `grow` value over 800 ms with smoothstep; discrete flags switch at once; lit/dim via CSS classes `is-lit`, `is-dim` on groups with a 400 ms opacity transition. `reveal.on('overviewshown')` and the speaker view apply states instantly.
- Lighting rule from Global Constraints implemented as `litSet(model, lit) -> Set` in `layout.js` (pure; test it).
- `colours=false`: all branch strokes use the line colour; `ends=false`: end markers hidden and ended branches drawn to their line's growth.
- Pins: for every `.pin[data-year]` in the current section, `left = clamp(x(year) - w/2 (+/- w/2 + 24 for align-left/right), 20, width - 20 - w)`; vertical from `side-*` classes in CSS (`above`: top 70px; `mid`: top 230px; `below`: bottom 36px). Covers are CSS only. Dim: `.stage.is-dim { opacity: .18 }`.
- Theme tokens in `stage.css`: `--stage-primary: var(--r-main-color)`, `--stage-ink: var(--r-main-color)`, `--stage-accent: var(--r-link-color)`, `--stage-highlight: var(--r-selection-background-color, #fbb109)`, `--stage-muted: color-mix(in srgb, var(--r-main-color) 45%, transparent)`; font from `--r-main-font`.

- [ ] **Step 1: Write the failing `litSet` test**

```js
test('litSet lights ancestors, strands and events', () => {
  const m = L.normalise(raw);
  const s = L.litSet(m, new Set(['b91', 'x1965']));
  for (const id of ['b91', 'failed', 'maisie', 'x1965']) assert.ok(s.has(id), id);
  assert.ok(!s.has('b68'));
  const t = L.litSet(m, new Set(['machine']));
  assert.ok(t.has('jefferson') && t.has('lister'));
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `litSet`, the tween, flags, pins and CSS.** **Step 4: Run node tests — pass. Render the example and run `tools/shoot_deck.py example/_site/index.html out/`; view every screenshot: lines grow between slides, lit branches bright and others dim, the 1965 pin sits over 1965, the cover dims the stage. Then a CDP check for Review Focus 2 and 4:** navigate to two consecutive identical-state slides and assert `document.querySelectorAll('.stage path').length` is unchanged and the pin `style.left` equals the previous slide's; set `lit="ghost"` in the example's last slide and assert `console` shows a warning while branch opacity stays 1 (check `getComputedStyle(path).opacity === '1'`).
- [ ] **Step 5: Commit** `"plugin: animated transitions, lighting, colour and end toggles, pins and covers"`.

### Task 7: Validation in the filter, example completeness, README

**Files:**
- Modify: `stage.lua`, `example/*`, `tests/test_render.py`; Create: `README.md`

**Interfaces:**
- `stage.lua` runs the same validation rules as `layout.validate` (duplicated in Lua: unknown id, duplicate id, fork before start, end before fork, crossing endpoint outside years) and calls `quarto.log.error(path .. ": " .. message)` then `os.exit(1)` on any error.
- The example deck covers: two lines, strands with a `meets`, a three-level fork tree, `forks-on`, events on line/strand/branch, ends, three crossings, every slide attribute including `colours="false"` then `"true"`, `ends`, `dim`, pins with each `side` and `align`, a cover, and an ordinary non-stage slide between stage slides.

- [ ] **Step 1: Write the failing tests**

```python
def test_invalid_timeline_fails_with_path(tmp_path):
    import shutil
    shutil.copytree(EX, tmp_path / "ex", ignore=shutil.ignore_patterns("_site", ".quarto"))
    y = (tmp_path / "ex" / "timeline.yml").read_text().replace("b: b77@2026", "b: nobody@2026")
    (tmp_path / "ex" / "timeline.yml").write_text(y)
    r = subprocess.run(["quarto", "render", "index.qmd"], cwd=tmp_path / "ex", capture_output=True, text=True)
    assert r.returncode != 0 and 'crossings[2]: unknown id "nobody"' in (r.stderr + r.stdout)

def test_example_exercises_every_feature():
    src = (EX / "index.qmd").read_text(); data = (EX / "timeline.yml").read_text()
    for s in ['colours="false"', 'ends="false"', 'dim="true"', 'side=above', 'side=mid', 'side=below', 'align=right', '.cover', 'forks-on', 'meets:', 'strands:']:
        assert s in src or s in data, s
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement the Lua validation, complete the example, write README** (install with `quarto add`, the data file, every slide attribute, the two div types, tokens, the browser rule, how to run tests and screenshots). **Step 4: Run** `python3 -m pytest -q` and `node --test tests/` — all pass; `shoot_deck.py` over the example once more and view. **Step 5: Commit** `"Validate the timeline in the filter; complete the example; README"`.

### Task 8: Migrate the GJBRC deck (acceptance test)

**Files (in `/home/tenebris/Desktop/Keynote/GJBRC_KEYNOTE_2026`, on a branch `timeline-stage`):**
- Create: `timeline.yml` (the full Maisie/machine data: events, strands, meets, the fork tree with the four women, `forks-on` for 1989/1999/2009/2026, crossings)
- Modify: `index.qmd` (every `.on-stage` slide becomes `.stage` with `view`/`grow`/`lit`/`dim`/`colours`/`ends`; `pin`/`cover` raw HTML becomes fenced divs), `_quarto.yml` (`filters: [timeline-stage]`, `revealjs-plugins: [timeline-stage]`, drop `stage.html` from `include-after-body`)
- Delete: `stage.html`
- Install: `quarto add /home/tenebris/Desktop/Keynote/timeline-stage` (local path install) or copy `_extensions/timeline-stage` in.

- [ ] **Step 1: Install the extension and write `timeline.yml`.** Years: machine start `1948-06-21`; Jefferson strand `1949-06-09` to `1961-01-29`; Turing `1948-10-01` to `1954-06-07`; `meets` at `1949-06-09` and `1952-01-10`; Maisie start `1949-06-09`; forks at 1960 (passed/failed), 1965 under each (b68/b77 under passed, b84/b91 under failed), `forks-on` at 1989 ("a husband's heart"), 1999 ("a knee"), 2009 ("a rota"), 2026 ("twelve minutes") on all four; ends 2017/2026/2033/2040 with the labels from `stage.html`; crossings `x1949`, `x1965` (`b84@1965`), `x2026` (`b77@2026`).
- [ ] **Step 2: Rewrite `index.qmd`.** The slide sequence and content stay; attributes map: old `data-stage` 1→`grow="maisie:1949.7"`, 2→`1960`, 3→`1963.5`, 4→`1972`, 5→`2014`, 6→`2026`, 7→`2040`; old `data-machine` 1→`machine:1949.3`, 2→`1949.7`, 3→`1951.5`, 4→`1952.6`, 5→`1956`, 6→`1962`, 7→`1966`, 8→`2040`; add `colours="false" ends="false"` on the first stage slide and `colours="true" ends="true"` on "Four women"; `data-lit` → `lit`; `data-dim` → `dim="true"`.
- [ ] **Step 3: Render and shoot** (`tools/shoot_deck.py`), view every slide, compare with the `stage.html` version (branch `main` before this task). Expected: same sequence of pictures or better; no label collisions at any declared view; four women indistinguishable until "Four women".
- [ ] **Step 4: Commit on the deck's branch** `"Migrate the deck to the timeline-stage extension"` and note in the extension README that the deck is the reference example.

### Task 9: Whole-branch verification

- [ ] Run `node --test tests/`, `python3 -m pytest -q`, render the example and the migrated deck, one screenshot pass over each; confirm `git status` clean in both repos. Then request a fresh reviewer on the extension branch with the spec, this plan and the Review Focus list.
