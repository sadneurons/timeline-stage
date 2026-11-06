# timeline-stage: a Quarto reveal.js extension for talks told on one growing timeline

Date: 2026-11-06. Status: draft for builder check.

## Intent

Some talks are one picture that develops: a timeline with several lines on it that
grow, fork, meet and end, while the speaker pins evidence to moments on it. The
GJBRC keynote is one such talk (a woman's life and a machine's life on the same
axis, forking into four possible women). Today that is implemented as a one-off
script with the story baked in. This extension makes the pattern reusable: the
timeline is data, the engine is generic, and the slides are written by hand in
ordinary Quarto Markdown with a few attributes and shortcodes. A different talk
is a different data file.

## Goals

1. **Any timeline.** Lines, strands within a line, a general branch tree (any
   branch may fork again, into any number of children, at any year), events on
   lines or branches, endings, and crossings that tie a moment on one line to a
   moment on another. All declared in YAML, each thing with an id.
2. **Hand-written slides.** A slide states what the audience sees in years and
   ids, never in numbers private to a script: which span of years is in view,
   how far each line has grown, what is lit. Overlays are shortcodes wrapping
   normal Markdown (images, quotes, lists), pinned to a year or shown as a panel.
3. **Continuity.** One drawing lives behind the whole deck. Moving between
   slides animates: lines grow or recede, the view pans and zooms in time, lit
   things brighten and the rest dim. Backwards navigation reverses exactly.
4. **Automatic layout.** Lanes, branch spreading, fork easing, label placement
   and collision avoidance come from the data, with optional overrides. The
   author never types a pixel.
5. **Theme-agnostic.** Colours, fonts and sizes come from the reveal theme's
   CSS variables, with a small set of extension variables for overrides.
6. **Installable.** `quarto add <repo>` and `revealjs-plugins`/`filters` entries
   in `_quarto.yml`. Works in Firefox and Chrome, served or from a single file.

## Non-goals

- Horizontal scrolling or infinite timelines; the whole span fits the stage at
  the widest view, and views zoom into it.
- Editing the timeline in the browser.
- Dates finer than a fraction of a year (months are fine as decimals or ISO
  dates converted to decimals; hours are not a use case).
- Replacing reveal's own fragments for ordinary slide content. Fragments can
  still be used inside overlays; the stage state is per slide.
- Gantt-style bars with durations as first-class things. A "line" has a start
  and an optional end; that covers lives, projects and machines.

## Anti-goals

- A talk author needing to read JavaScript to add a fork.
- Layout that changes when a line grows: positions are decided from the whole
  data set up front, so growth never shoves things around.
- Labels that collide or run off the stage at any declared view.
- A deck that only works on the author's machine (fonts, files, browser).

## Vocabulary

- **Line**: a long-lived thing with a start year, an optional end, a colour and
  a label. Examples: Maisie, the machine, a company, a policy.
- **Strand**: a named sub-line within a line, drawn close to it and able to bow
  towards other strands at shared events (Jefferson and Turing inside "the
  machine"). Strands have their own start and end.
- **Branch**: a node in a line's fork tree. The root branch is the line itself.
  A fork at a year replaces one branch with N children; each child has an id, a
  label, an optional end year and optional end label, and may fork again.
- **Fork**: the event where a branch splits. It has a year, a short label (what
  turned the wheel) and optional emphasis.
- **Event**: a dot with a label at a year on a line, strand or branch.
- **Crossing**: a tie between a year on one line/branch and a year on another,
  with a label. Drawn as a dashed link with a marker.
- **View**: a span of years shown on the stage.
- **State**: what a slide shows: view, growth per line, lit set, dim flag.

## The data file

`timeline.yml` next to the deck (path configurable). Years are numbers or ISO
dates; ISO dates are converted to decimal years.

```yaml
span: [1945, 2045]          # the widest view; default: min start - 2 to max end + 2
lines:
  - id: machine
    label: the machine
    start: 1948-06-21
    colour: accent            # a theme token or a CSS colour
    strands:
      - { id: jefferson, label: Jefferson, start: 1949-06-09, end: 1961-01-29 }
      - { id: turing,    label: Turing,    start: 1948-10-01, end: 1954-06-07 }
    events:
      - { id: baby,    year: 1948-06-21, label: the Baby runs, side: above }
      - { id: lister,  year: 1949-06-09, label: The Mind of Mechanical Man, on: jefferson }
      - { id: times,   year: 1949-06-11, label: Calculus to Sonnet, on: turing, side: below }
      - { id: pocket,  year: 2026,       label: the machine in your pocket }
    meets: [[jefferson, turing, 1949-06-09], [jefferson, turing, 1952-01-10]]  # strands bow together
  - id: maisie
    label: Maisie
    start: 1949-06-09
    forks:
      - at: 1960
        label: the eleven-plus
        children:
          - id: passed
            forks:
              - at: 1965
                label: stays on at school
                children:
                  - { id: b68, label: diagnosed at 68, end: 2017, colour: muted }
                  - { id: b77, label: the Brain Health Clinic, 77, end: 2026, colour: accent }
          - id: failed
            forks:
              - at: 1965
                label: a wage, a bus stop
                children:
                  - { id: b84, label: diagnosed at 84, end: 2033, colour: muted }
                  - { id: b91, label: the sonnet, 91, end: 2040, colour: highlight }
    forks-on:                 # forks that apply to several branches at once (optional sugar)
      - { at: 1999, label: a knee, branches: [b68, b77, b84, b91] }
    events:
      - { id: sonnet, year: 1964, label: Sonnet 73, on: failed }
crossings:
  - { id: x1949, a: machine@1949-06-09, b: maisie@1949-06-09, label: the same week }
  - { id: x1965, a: machine@1965, b: b84@1965, label: she solders the machine }
  - { id: x2026, a: machine@2026, b: b77@2026, label: the machine meets her in the clinic }
```

Rules:

- Ids are unique across the whole file. A branch id refers to that branch's
  path from its fork onwards; the line id refers to the root.
- A fork's children inherit the parent's colour unless they set one.
- `forks-on` is sugar for "every listed branch forks here into one child that
  keeps the id"; it draws a kink and a label without creating new ids. This is
  how a shared fork like "1999: a knee" appears on all four women.
- `end` on a branch or line ends the drawing with a marker and the end label.
- A crossing endpoint is `id@year`; the engine resolves the y position of that
  id at that year, so a crossing can land on a branch after it has forked.

The filter validates the file and fails the render with a line-numbered message
on an unknown id, a fork before its branch starts, or an end before a fork.

## The slide syntax

Attributes on the slide heading, all optional, each meaning the same thing for
any timeline:

```markdown
## 1965 {.stage view="1946-1975" grow="maisie:1972 machine:1966" lit="x1965 b84 b91" dim="false"}
```

- `view="y0-y1"`: years in view. Default: the previous stage slide's view, then
  the data's `span`.
- `grow="id:year …"`: how far each line (by line id) has been drawn. Everything
  on that line dated after the year is not yet drawn. Default: carried from
  the previous stage slide; a line never mentioned is not drawn.
- `lit="ids"`: ids to show at full strength; everything else on the stage dims
  to the theme's dim opacity. Empty means nothing is dimmed.
- `dim="true"`: fade the whole stage behind a panel.
- `.stage` marks the slide as using the stage. A slide without it hides the
  stage (ordinary slides, title, end).

Overlays wrap ordinary Markdown (see "Answers from the builder check" for the final fenced-div form; the shortcode form below is superseded):

```markdown
{{< pin year=1965 side=below width=wide align=right >}}
![](images/ferranti.jpg)

Where she did not pass, she goes to the assembly line at Ferranti.
{{< /pin >}}

{{< cover tone=dark >}}
## Except here.
{{< /cover >}}
```

`pin` is positioned horizontally at the year under the current view (clamped to
the stage) and vertically by `side` (`above`, `below`, `mid`); `align` offsets
it left or right of the year; `width` is a size token. `cover` is a centred
panel that dims the stage. Both accept a `class` for the author's own CSS.

Speaker notes, fragments and everything else in Quarto work as normal.

## The engine

A reveal.js plugin (`stage.js`, no dependencies) registered by the extension.

**Layout, computed once from the data:**

- The stage is the slide's coordinate space (reveal's configured width and
  height), with margins for the axis and labels.
- Each line gets a horizontal band. Band heights are proportional to the
  number of simultaneous paths the line can have at its widest point, which
  the engine computes by walking the fork tree: the leaf count of each subtree
  determines the spread. Strands count as paths too.
- Within a band, branches are assigned target offsets by an in-order walk of
  the tree so that siblings spread symmetrically about their parent's offset
  and never cross. Forks ease over a configurable number of years.
- Lines are stacked in file order, top to bottom, with a gap.
- Labels: events and forks are placed above or below their line with lane
  assignment to avoid overlap at the current view; the lane count is bounded
  and extra labels at very wide views are hidden (events keep their dots).
  End labels sit to the right of the end marker, or above it near the right
  edge. Crossing labels sit beside the marker on the side with more room.
- Overrides: any line may set `band` (a weight) and any event `lane`, for the
  rare case the automatic choice is wrong.

**Drawing:** SVG, one `<path>` per branch and strand sampled per year, one
group per event/fork/crossing. Time zoom changes only x; y is fixed by the
layout. Growth is a clip in years, so a branch is drawn up to the `grow` year
for its line. A state transition tweens view and growth numerically over
about 0.8 s with ease-in-out, and toggles lit/dim with CSS transitions.

**State per slide:** read from the heading attributes at startup for every
slide, resolved with the carry-forward defaults, and stored on the section.
`slidechanged` applies the target slide's state. Overview mode and the speaker
view show the current state without animation.

**Theme:** colours resolve in this order: a CSS colour literal; a token among
`primary`, `accent`, `highlight`, `muted`, `ink` mapped to CSS variables
`--stage-<token>` which the extension's SCSS defaults from the reveal theme's
variables (`$body-color`, `$link-color`, …). Fonts and sizes likewise.

## The filter

A Lua filter in the extension:

- Reads `timeline.yml` (path from the `stage` metadata key, default
  `timeline.yml`), validates it, converts dates, and embeds it as JSON in a
  `<script type="application/json" id="stage-data">` once per document.
- Turns `.stage` heading attributes into `data-stage-*` attributes on the
  section (Quarto already passes heading attributes to the section).
- Implements the `pin` and `cover` shortcodes as `Div`s with the right classes
  and data attributes, so their Markdown content is rendered by Pandoc.
- Registers the plugin and stylesheet via `revealjs-plugins`.

## Repository layout

```
timeline-stage/
  _extensions/timeline-stage/
    _extension.yml            # contributes: filters, revealjs-plugins
    stage.lua                 # filter + shortcodes
    stage.js                  # engine (reveal plugin)
    stage.css / stage.scss    # styles, theme tokens
  example/                    # a small deck: two lines, a fork tree, a crossing
    _quarto.yml  index.qmd  timeline.yml
  tests/                      # see Testing
  README.md
```

## Testing

- **Layout unit tests** (node, no browser): the layout module is pure
  functions; tests cover band heights for trees of depth 1 to 3, symmetric
  spreading, no crossings among siblings, fork easing, crossing resolution to
  the right branch after a fork, and label lane assignment.
- **Filter tests**: render the example deck with `quarto render` and assert on
  the HTML: data embedded once, each stage section has the expected
  `data-stage-*`, shortcodes produce the right divs.
- **Visual check**: one headless Chrome run (single instance, as the GJBRC
  repo's `tools/shoot_deck.py` does) over the example deck, screenshots per
  slide, inspected by eye. Never Firefox, never two browsers at once.
- **Validation tests**: malformed timeline files fail with the right message.

## Migration of the GJBRC deck

Not part of this extension's build, but the acceptance test for it: the
GJBRC deck's `stage.html` is deleted, its data moves to `timeline.yml` as above,
and its slides are rewritten with `.stage` attributes and `pin`/`cover`
shortcodes. The deck must look the same or better.

## Answers from the builder check

**Overlay syntax.** Quarto shortcodes are inline and cannot wrap a block, so the
paired `{{< pin >}} … {{< /pin >}}` form in this document does not exist. Overlays
are fenced divs, which is the idiomatic Quarto way to wrap Markdown and is just
as hand-writable:

```markdown
::: {.pin year=1965 side=below width=wide align=right}
![](images/ferranti.jpg)

Where she did not pass, she goes to the assembly line at Ferranti.
:::

::: {.cover tone=dark}
## Except here.
:::
```

The filter handles these as Div elements. Every mention of shortcodes above
should be read as fenced divs.

**Deferred reveal of colours and endings.** The GJBRC deck keeps the four women
indistinguishable (one colour, no end markers, branches drawn past their own
ends) until the "Four women" slide. That is a story beat the data model must
allow for any timeline, so two more slide attributes exist, both carried
forward and both defaulting to `true`: `colours="false"` draws every branch of
every line in its line's base colour, and `ends="false"` suppresses end markers
and end labels and lets a branch keep growing with its line past its end year.
A slide turns them on when the story does.

**What lighting means.** Lighting an id lights the whole path to it: a branch
lights its ancestors back to the line's start; a line lights its strands and
events; a crossing lights its marker and label only (its endpoints are lit by
naming them). Everything not on a lit path dims. With nothing lit, nothing dims.

**Validation messages.** Line numbers are dropped; the YAML loader available to
a Lua filter does not keep positions and a positional parser is not worth its
cost. Messages name the path and the id: `lines[2].forks[1].children[0]: end
2017 is before fork at 2026`.

**Reveal configuration.** The extension imposes nothing globally. Stage slides
get `data-transition="none"` from the filter so the stage never slides while
overlays do; the stage reads reveal's configured width and height; stage
sections are styled top-anchored and padding-free by the extension's CSS
regardless of the theme's `center` setting, and pins are positioned inside
that section. Hosts keep their own transitions and layout on every other slide.

**Growth per id.** `grow="id:year"` accepts any line or branch id. Growth is
stored per id and a branch inherits its line's value unless set, so a fork
child can be drawn further than its sibling when a talk needs it.

## Decided by the author

- General fork tree with `forks-on` sugar for shared forks.
- Years and ids in slide attributes; no numbered stages.
- Carry-forward defaults between stage slides.
- Fenced divs for overlays; raw HTML never required.
- SVG engine without dependencies; time-only zoom; layout fixed up front.
- Theme tokens mapped to reveal SCSS variables.

## Left to the builder

- Exact band proportions, easing length and label lane limits (expose as
  options with sensible defaults).
- How strands bow at `meets` (amplitude, width).
- Whether to render the axis ticks adaptively (every 1, 5 or 10 years) by span,
  as the current script does.
- The shape of the Lua validation messages.
- The example deck's content, as long as it exercises every feature.
