# timeline-stage

A Quarto reveal.js extension for talks told on one growing timeline. The timeline is
a YAML file; a generic engine draws it once behind every slide and animates between
the states your slides declare; the slides are ordinary Quarto Markdown with a few
heading attributes and fenced divs.

## Install

```bash
quarto add <path-or-github-url-of-this-repo>
```

Then in `_quarto.yml` (or the document front matter):

```yaml
format:
  revealjs:
    filters: [timeline-stage]
    revealjs-plugins: [timeline-stage]
```

Put `timeline.yml` next to the document (or set `stage: {timeline: path/to.yml}` in
the front matter). See `example/` for a complete deck.

## The timeline file

```yaml
span: [1945, 2045]            # widest view; default: data extent plus two years
lines:
  - id: machine
    label: the machine
    start: 1948-06-21          # numbers or ISO dates (YYYY, YYYY-MM, YYYY-MM-DD)
    colour: accent             # primary | accent | highlight | muted | ink | any CSS colour
    strands:                   # sub-lines drawn beside the line
      - { id: jefferson, start: 1949-06-09, end: 1961-01-29 }
      - { id: turing,    start: 1948-10-01, end: 1954-06-07 }
    meets: [[jefferson, turing, 1949-06-09]]   # strands bow together here
    events:
      - { id: baby, year: 1948-06-21, label: the Baby runs, side: above }
      - { id: lister, year: 1949-06-09, label: The Mind of Mechanical Man, on: jefferson }
  - id: maisie
    start: 1949-06-09
    forks:                     # a general tree: any branch may fork again
      - at: 1960
        label: the eleven-plus
        children:
          - id: passed
            forks: [{ at: 1965, label: stays on, children: [{ id: b68, end: 2017, label: diagnosed at 68 }] }]
          - id: failed
    forks-on:                  # a shared fork: kinks every listed branch, labelled once
      - { at: 1999, label: a knee, branches: [b68, failed] }
crossings:                     # ties between a moment on one line and a moment on another
  - { id: x1949, a: machine@1949-06-09, b: maisie@1949-06-09, label: the same week }
```

Every line, strand, branch, event and crossing has a unique id. Children inherit
their parent's colour unless they set one. `end` on a line or branch stops it with a
marker and its label. A crossing endpoint is `id@year`.

The filter validates the file and stops the render with a message naming the path and
id, for example `crossings[2]: unknown id "nobody"`.

## Slides

```markdown
## 1965 {.stage view="1946-1975" grow="maisie:1972 machine:1966" lit="x1965 b84" dim="false"}
```

| attribute | meaning | carried forward |
|---|---|---|
| `view="y0-y1"` | years shown; time zooms, the layout does not | yes |
| `grow="id:year …"` | how far each line (or branch) is drawn | yes |
| `lit="id id …"` | light these ids and everything on the path to them; dim the rest | no |
| `dim="true"` | fade the whole stage behind a large panel | no |
| `colours="false"` | draw every branch in its line's colour (until a later slide sets `true`) | yes |
| `ends="false"` | hide end markers and let ended branches keep growing (until `true`) | yes |

A slide without `.stage` hides the stage. Stage slides get `data-transition="none"`
and are top-anchored and padding-free whatever the theme sets.

Overlays are fenced divs with ordinary Markdown inside:

```markdown
::: {.pin year=1965 side=below width=wide align=right}
![](images/ferranti.jpg)

Where she did not pass, she goes to the assembly line at Ferranti.
:::

::: {.cover tone=dark}
## Except here.
:::
```

`pin` sits at its year (`side`: `above`, `mid`, `below`; `align`: `left`, `right`;
`width`: `wide`, `narrow`). `cover` is a large centred panel. Add your own `class`
to either for custom styling. Do not name a div `callout`: Quarto rewrites those.

## Theme

Colours and fonts come from the reveal theme through CSS variables you can override:
`--stage-primary`, `--stage-accent`, `--stage-highlight`, `--stage-muted`,
`--stage-ink`, `--stage-font`, `--stage-dim` (opacity of dimmed things).

## Development

```bash
node --test tests/layout.test.js          # layout engine, pure functions
python3 -m pytest -q                      # renders example/ and checks the HTML
python3 tools/shoot_deck.py example/_site/index.html out/   # one headless Chromium, a screenshot per slide
```

Never run Firefox or two browsers at once from this repository: it has hung the
author's machine. The screenshot and evaluation tools start a single Chromium with a
fresh profile and close it themselves.

The GJBRC keynote (`../GJBRC_KEYNOTE_2026`) is the reference deck built on this
extension.
