/* timeline-stage: reveal.js plugin. One SVG behind every slide, driven by slide attributes. */
(function () {
  'use strict';
  var L = window.StageLayout;
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function colourOf(token) {
    if (!token) return 'var(--stage-primary)';
    if (/^(primary|accent|highlight|muted|ink)$/.test(token)) return 'var(--stage-' + token + ')';
    return token;
  }

  function Stage(reveal) {
    var dataEl = document.getElementById('stage-data');
    if (!dataEl) { console.warn('timeline-stage: no #stage-data'); return; }
    var raw = JSON.parse(dataEl.textContent);
    L.validate(raw).forEach(function (e) { console.warn('timeline-stage: ' + e.path + ': ' + e.message); });
    var model = L.normalise(raw);
    var cfg = reveal.getConfig(), W = cfg.width || 1280, H = cfg.height || 720;
    var LEFT = 0.055 * W, RIGHT = 0.055 * W, AXIS_Y = 0.84 * H;
    var geom = L.layout(model, { height: H, top: 0.12 * H, bottom: 0.78 * H });

    // ---------------------------------------------------------------- DOM
    var root = document.createElement('div'); root.className = 'stage';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stage-svg' }); root.appendChild(svg);
    var g = {}; ['axis', 'names', 'lines', 'forks', 'events', 'crossings', 'ends'].forEach(function (k) { g[k] = el('g', { class: 'st-' + k }); svg.appendChild(g[k]); });

    var axisLine = el('line', { class: 'st-axisline', y1: AXIS_Y, y2: AXIS_Y, x1: LEFT, x2: W - RIGHT }); g.axis.appendChild(axisLine);
    var ticks = [];
    for (var yr = Math.ceil(model.span[0]); yr <= Math.floor(model.span[1]); yr++) {
      var t = el('line', { class: 'st-tick', y1: AXIS_Y - 6, y2: AXIS_Y + 6 }), l = el('text', { class: 'st-year', y: AXIS_Y + 26, 'text-anchor': 'middle' }, yr);
      g.axis.appendChild(t); g.axis.appendChild(l); ticks.push({ yr: yr, t: t, l: l });
    }
    var paths = {}, names = {};
    model.lines.forEach(function (lid) {
      var line = model.index[lid];
      names[lid] = el('text', { class: 'st-linename', x: LEFT, y: geom.bands[lid].y0 - 6 }, line.label); g.names.appendChild(names[lid]);
      [lid].concat(line.strands).concat(L.leaves(model, lid, []).length ? allBranches(model, lid) : []).forEach(function (id) {
        var node = model.index[id];
        var p = el('path', { class: 'st-path st-' + node.kind, 'data-id': id, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        p.style.stroke = colourOf(node.colour);
        paths[id] = p; g.lines.appendChild(p);
      });
    });
    function allBranches(model, lid) {
      var out = [];
      (function walk(id) { L.realChildren(model.index[id]).forEach(function (c) { out.push(c); walk(c); }); })(lid);
      return out;
    }
    var events = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'event') return;
      var ge = el('g', { class: 'st-event', 'data-id': id });
      ge.appendChild(el('circle', { r: n.end ? 6 : 5 })); ge.appendChild(el('text', { class: 'st-eventlabel' }, n.label));
      events.push({ node: n, g: ge }); g.events.appendChild(ge);
    });
    var forks = [], seenKinks = {};
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'line' && n.kind !== 'branch') return;
      n.forks.forEach(function (f, i) {
        if (!f.label) return;
        // a shared kink (forks-on) is labelled once, on the first branch that carries it
        if (f.kink) {
          var key = f.at + '|' + f.label;
          if (seenKinks[key]) { seenKinks[key].owners.push(n); return; }
          seenKinks[key] = { owners: [n] };
        }
        var gf = el('g', { class: 'st-fork' + (f.emphasis ? ' st-emphasis' : '') + (f.kink ? ' st-kink' : ''), 'data-id': id + '#' + i });
        gf.appendChild(el('line', {})); gf.appendChild(el('text', { class: 'st-forklabel', 'text-anchor': 'middle' }, f.label));
        var entry = { owner: n, fork: f, g: gf, owners: f.kink ? seenKinks[f.at + '|' + f.label].owners : [n] };
        forks.push(entry); g.forks.appendChild(gf);
      });
    });
    var crossings = [];
    model.crossings.forEach(function (cid) {
      var c = model.index[cid], gc = el('g', { class: 'st-crossing', 'data-id': cid });
      gc.appendChild(el('line', { class: 'st-crossline' })); gc.appendChild(el('circle', { r: 9, class: 'st-crossmark' })); gc.appendChild(el('text', { class: 'st-crosslabel' }, c.label));
      crossings.push({ node: c, g: gc }); g.crossings.appendChild(gc);
    });
    var ends = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if ((n.kind !== 'branch' && n.kind !== 'line') || n.end == null) return;
      var ge = el('g', { class: 'st-end', 'data-id': id });
      var c = el('circle', { r: 8 }); c.style.fill = colourOf(n.colour);
      ge.appendChild(c); ge.appendChild(el('text', { class: 'st-endlabel' }, n.endLabel || n.label));
      ends.push({ node: n, g: ge }); g.ends.appendChild(ge);
    });

    // ---------------------------------------------------------------- state
    var sections = Array.prototype.slice.call(document.querySelectorAll('.reveal .slides section'));
    var states = L.resolveStates(sections.map(function (s) {
      if (!s.classList.contains('stage')) return { attrs: null };
      var d = s.dataset;
      return { attrs: { view: d.view, grow: d.grow, lit: d.lit, dim: d.dim, colours: d.colours, ends: d.ends } };
    }), model);
    states.forEach(function (st, i) { if (st) st.warnings.forEach(function (w) { console.warn('timeline-stage: slide ' + (i + 1) + ': ' + w); }); });

    var cur = null;
    function draw(view, grow, flags) {
      var x = L.xScale(view, W - LEFT - RIGHT, LEFT), span = view[1] - view[0];
      var every = span > 60 ? 10 : span > 25 ? 5 : 1;
      ticks.forEach(function (k) {
        var on = k.yr % every === 0 && k.yr >= view[0] && k.yr <= view[1];
        k.t.style.opacity = on ? 1 : 0; k.l.style.opacity = on ? 1 : 0;
        k.t.setAttribute('x1', x(k.yr)); k.t.setAttribute('x2', x(k.yr)); k.l.setAttribute('x', x(k.yr));
      });
      var gf = function (id) { return grow[id] != null ? grow[id] : (model.index[id].line !== id && grow[model.index[id].line] != null ? grow[model.index[id].line] : -Infinity); };
      model.lines.forEach(function (lid) { names[lid].style.opacity = gf(lid) > model.index[lid].start ? 1 : 0; });
      Object.keys(paths).forEach(function (id) {
        var node = model.index[id];
        paths[id].setAttribute('d', L.samplePath(geom, model, id, view, gf(id), x, { end: flags.ends ? undefined : null }));
        paths[id].style.stroke = colourOf(flags.colours || node.kind !== 'branch' ? node.colour : model.index[node.line].colour);
      });
      events.forEach(function (e) {
        var n = e.node, on = gf(n.parent) >= n.year - 0.05;
        e.g.style.opacity = on ? 1 : 0;
        var px = x(n.year), py = L.yFor(geom, model, n.parent, n.year, { span: span });
        e.g.firstChild.setAttribute('cx', px); e.g.firstChild.setAttribute('cy', py);
        var t = e.g.lastChild; t.setAttribute('x', px + (px > W - 300 ? -10 : 8)); t.setAttribute('text-anchor', px > W - 300 ? 'end' : 'start');
        t.setAttribute('y', n.side === 'below' ? py + 22 : py - 12);
      });
      forks.forEach(function (f) {
        var on = f.owners.some(function (o) { return gf(o.id) >= f.fork.at; });
        f.g.style.opacity = on ? 1 : 0;
        var fx = x(f.fork.at), ys = [];
        f.owners.forEach(function (o) {
          ys.push(L.offsetAt(geom, model, o.id, f.fork.at));
          if (!f.fork.kink) f.fork.children.forEach(function (c) { ys.push(L.offsetAt(geom, model, c, f.fork.at + geom.opts.easeYears)); });
        });
        var yTop = Math.min.apply(null, ys) - 8;
        var ln = f.g.firstChild, tx = f.g.lastChild;
        ln.setAttribute('x1', fx); ln.setAttribute('x2', fx); ln.setAttribute('y1', yTop - 24); ln.setAttribute('y2', yTop + 4);
        tx.setAttribute('x', fx); tx.setAttribute('y', yTop - 30);
        tx.setAttribute('text-anchor', fx > W - 160 ? 'end' : fx < LEFT + 100 ? 'start' : 'middle');
      });
      crossings.forEach(function (c) {
        var n = c.node, on = gf(n.a.id) >= n.a.year - 0.1 && gf(n.b.id) >= n.b.year - 0.1;
        c.g.style.opacity = on ? 1 : 0;
        var ax = x(n.a.year), bx = x(n.b.year), ay = L.yFor(geom, model, n.a.id, n.a.year, { span: span }), by = L.yFor(geom, model, n.b.id, n.b.year, { span: span });
        var ln = c.g.childNodes[0], mk = c.g.childNodes[1], tx = c.g.childNodes[2];
        ln.setAttribute('x1', ax); ln.setAttribute('y1', ay); ln.setAttribute('x2', bx); ln.setAttribute('y2', by);
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        mk.setAttribute('cx', mx); mk.setAttribute('cy', my);
        tx.setAttribute('x', mx + (mx > W - 340 ? -16 : 16)); tx.setAttribute('y', my + 5); tx.setAttribute('text-anchor', mx > W - 340 ? 'end' : 'start');
      });
      ends.forEach(function (e) {
        var n = e.node, on = flags.ends && gf(n.id) >= n.end - 0.5;
        e.g.style.opacity = on ? 1 : 0;
        var ex = x(n.end), ey = L.offsetAt(geom, model, n.id, n.end), tight = ex > W - 230;
        e.g.firstChild.setAttribute('cx', ex); e.g.firstChild.setAttribute('cy', ey);
        var t = e.g.lastChild; t.setAttribute('x', ex + (tight ? -14 : 14)); t.setAttribute('text-anchor', tight ? 'end' : 'start'); t.setAttribute('y', tight ? ey - 14 : ey + 5);
      });
    }
    function apply(state) {
      cur = state;
      draw(state.view, state.grow, { colours: state.colours, ends: state.ends });
      root.classList.toggle('is-dim', !!state.dim);
    }
    function update() {
      var idx = sections.indexOf(reveal.getCurrentSlide());
      var st = idx >= 0 ? states[idx] : null;
      root.style.opacity = st ? 1 : 0;
      if (st) apply(st);
    }
    var slides = document.querySelector('.reveal .slides');
    slides.insertBefore(root, slides.firstChild);
    reveal.on('slidechanged', update);
    reveal.on('ready', update);
    if (reveal.isReady()) update();
    window.TimelineStageDebug = { model: model, geom: geom, states: states, current: function () { return cur; } };
  }

  window.TimelineStage = {
    id: 'timeline-stage',
    init: function (reveal) {
      // the data block is included after the body, so it may not exist yet when reveal initialises plugins
      if (document.getElementById('stage-data')) Stage(reveal);
      else if (document.readyState === 'complete') Stage(reveal);
      else window.addEventListener('load', function () { Stage(reveal); });
    }
  };
})();
