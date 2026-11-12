# timeline-stage

A Quarto reveal.js extension for talks told on one growing timeline. The timeline is
a YAML file; a generic engine draws it once behind every slide and animates between
the states your slides declare; the slides are ordinary Quarto Markdown with a few
heading attributes and fenced divs.

A stage slide has three fixed places, so nothing is positioned by hand: the words
sit top left (`.caption`), the evidence sits in a column on the right (`.plate`), and
the drawing sits below. Labels live on their own lines, older labels give way to
newer ones, and anything not lit becomes a ghost without words.

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
options:                      # all optional
  top: 200                    # top of the first band, bottom of the last, and the axis:
  bottom: 596                 #   pixels, or a share of the slide when 1 or less
  axis: 628
  easeYears: 2                # years a fork takes to open
  strandGap: 30               # pixels between a line and its strands
  spread: 0.92                # share of a band its branches fill
lines:
  - id: machine
    label: the machine
    start: 1948-06-21          # numbers or ISO dates (YYYY, YYYY-MM, YYYY-MM-DD)
    colour: accent             # primary | accent | highlight | muted | ink | any CSS colour
    band: 5                    # optional weight of this line's band against the others
    strands:                   # sub-lines drawn in rows under the line
      - { id: jefferson, label: Jefferson, start: 1949-06-09, end: 1961-01-29 }
      - { id: turing,    label: Turing,    start: 1948-10-01, end: 1954-06-07 }
      - { id: centre, start: 2015, lane: 1 }   # lane: reuse the row of a strand that has ended
    meets: [[jefferson, turing, 1949-06-09]]   # strands bow together here
    events:
      - { id: lister, year: 1949-06-09, label: The Mind of Mechanical Man, on: jefferson }
      - id: baby                 # an event with a note or pictures opens a card when clicked
        year: 1948-06-21
        label: the Baby runs     # the short name on the line
        date: "21 June 1948"     # shown as the card's lead-in
        text: "The Baby runs the first program held in electronic memory"
        img: images/baby.jpg     # several: "a.jpg|b.jpg" or a list; marked with a ring
      - { id: next, year: 2030, label: the next machine, planned: true }   # open marker
  - id: maisie
    start: 1949-06-09
    forks:                     # a general tree: any branch may fork again
      - at: 1960
        label: the eleven-plus         # sits on the incoming line, before the fork
        ease: 1.5                      # optional: this fork's own opening time, in years
        children:
          - id: passed
            label: grammar school      # names the branch where it levels off
            forks: [{ at: 1965, children: [{ id: b68, end: 2017, end-label: diagnosed at 68 }] }]
          - id: failed
            label: secondary modern
    forks-on:                  # a moment that marks branches without splitting them, labelled once
      - { at: 1999, label: a knee, branches: [b68, failed] }
crossings:                     # ties between a moment on one line and a moment on another
  - { id: x1949, a: machine@1949-06-09, b: maisie@1949-06-09, label: the same week }
```

Every line, strand, branch, event and crossing has a unique id. Children inherit
their parent's colour unless they set one. `end` on a line or branch stops it with a
ring; `end-label` is the text beside it. A crossing endpoint is `id@year`.

Event labels hang below and to the left of their point at 45 degrees, ending at it;
`side: above` makes one rise to the upper right instead, for points with no room
beneath. Labels that would overlap step aside with a leader. `options: {eventLabels:
horizontal}` restores level labels in lanes.

Pictures named only in `timeline.yml` are not seen by Quarto: list their folder under
`project: resources:`.

The filter validates the file and stops the render with a message naming the path and
id, for example `crossings[2]: unknown id "nobody"`.

## Slides

```markdown
## 1960 {.stage view="1955-1970" grow="1964.8" now="1960" lit="maisie"}
```

| attribute | meaning | carried forward |
|---|---|---|
| `view="y0-y1"` | years shown; time zooms, the layout does not | yes |
| `grow="year"` | how far every line is drawn | yes |
| `grow="id:year …"` | the same for one line, strand or branch; after a bare year it overrides it | yes |
| `now="year or date"` | the moment the slide is about: a cursor on the axis, and older labels recede | no |
| `lit="id id …"` | light these ids and everything on the path to them; the rest become ghosts | no |
| `hold="id id …"` | keep these events back on this slide, although their line has grown past them | no |
| `dim="true"` | fade the whole stage behind a cover | no |
| `colours="false"` | draw every branch in its line's colour (until a later slide sets `true`) | yes |
| `ends="false"` | hide end markers and let ended branches keep growing (until `true`) | yes |

A slide without `.stage` hides the stage. The heading of a stage slide is not shown:
it names the slide for the outline, the menu and the URL.

Overlays are fenced divs with ordinary Markdown inside:

```markdown
::: {.caption}
**1960, the eleven-plus.** In the small family she passes.
:::

::: {.plate width=narrow}
![](images/school.jpg)

A small label under the picture.
:::
```

- `caption`: the moment in words, top left. A bold lead-in is set as the date. A
  `[…]{.source}` span inside it is a small source line.
- `plate`: the evidence, in a column on the right, shown whole. `width` is `narrow`,
  `wide` or a number of pixels. Several pictures in one paragraph make a row of equal
  height; a blockquote is set as a large quotation; other text is a small label.
- `cover`: something large over a dimmed stage (`dim="true"`), for example a row of
  pictures or an iframe. `tone=panel` or `tone=dark` gives it a solid ground.
- `pin`: a free note tied to a year (`year`, `side` above | mid | below, `align`
  left | right, `width`), for anything the three fixed places do not cover.

Choose `view` so that the lines end before the plate begins; the future is empty.
Do not name a div `callout`: Quarto rewrites those.

## Theme

Colours and fonts come from the reveal theme through CSS variables a theme overrides
on `.reveal`: `--stage-bg` (the ground, used for label halos), `--stage-ink`,
`--stage-primary`, `--stage-muted`, `--stage-accent`, `--stage-highlight` (forks,
dates, now), `--stage-panel`, `--stage-font` (the diagram, dates, quotations),
`--stage-text-font` (captions and labels), `--stage-dim` (opacity of ghosts).

## Development

```bash
node --test tests/layout.test.js          # layout engine, pure functions
python3 -m pytest -q                      # renders example/ and checks the HTML
python3 tools/shoot_deck.py example/_site/index.html out/              # a screenshot per slide
python3 tools/shoot_deck.py deck.html out/ --ids some-slide --eval "js" # one slide, before and after some JavaScript
```

Never run Firefox or two browsers at once from this repository: it has hung the
author's machine. The screenshot tool starts a single Chromium with a fresh profile,
closes it and removes the profile itself.

The GJBRC keynote (`../GJBRC_KEYNOTE_2026`) is the reference deck built on this
extension.
