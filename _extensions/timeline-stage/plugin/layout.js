/* timeline-stage layout: pure functions. UMD so node tests and the browser share it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- dates
  var DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function toDecimalYear(v) {
    if (typeof v === 'number') return v;
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return round2(+m[1] + (DAYS[+m[2] - 1] + +m[3]) / 365.25);
    if ((m = s.match(/^(\d{4})-(\d{2})$/))) return round2(+m[1] + DAYS[+m[2] - 1] / 365.25);
    var n = Number(s);
    return isNaN(n) ? NaN : n;
  }
  function round2(x) { return Math.round(x * 100) / 100; }
  function parseRef(ref) {
    var at = String(ref).lastIndexOf('@');
    return { id: String(ref).slice(0, at), year: toDecimalYear(String(ref).slice(at + 1)) };
  }

  // ---------------------------------------------------------------- normalise
  // model = { span, lines: [lineId...], crossings: [...], index: { id: node } }
  function normalise(raw) {
    var index = {}, lines = [], crossings = [];
    var minY = Infinity, maxY = -Infinity;
    function see(y) { if (isFinite(y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }

    (raw.lines || []).forEach(function (L) {
      var line = {
        id: L.id, kind: 'line', line: L.id, parent: null, label: L.label || L.id,
        start: toDecimalYear(L.start), end: L.end == null ? null : toDecimalYear(L.end),
        colour: L.colour || 'primary', band: L.band || null,
        strands: [], children: [], forks: [], events: [], meets: []
      };
      see(line.start); see(line.end);
      index[line.id] = line; lines.push(line.id);
      (L.strands || []).forEach(function (S) {
        var s = { id: S.id, kind: 'strand', line: L.id, parent: L.id, label: S.label || S.id,
          start: toDecimalYear(S.start), end: S.end == null ? null : toDecimalYear(S.end),
          colour: S.colour || line.colour, events: [] };
        see(s.start); see(s.end);
        index[s.id] = s; line.strands.push(s.id);
      });
      (L.meets || []).forEach(function (M) { line.meets.push({ a: M[0], b: M[1], year: toDecimalYear(M[2]) }); });
      // fork tree
      function addForks(node, forks) {
        (forks || []).forEach(function (F) {
          var fork = { at: toDecimalYear(F.at), label: F.label || '', children: [], kink: false, emphasis: !!F.emphasis };
          (F.children || []).forEach(function (C) {
            var child = { id: C.id, kind: 'branch', line: L.id, parent: node.id, label: C.label || C.id,
              start: fork.at, end: C.end == null ? null : toDecimalYear(C.end), endLabel: C['end-label'] || C.label || '',
              colour: C.colour || node.colour, children: [], forks: [], events: [] };
            see(child.end);
            index[child.id] = child; node.children.push(child.id); fork.children.push(child.id);
            addForks(child, C.forks);
          });
          node.forks.push(fork);
        });
      }
      addForks(line, L.forks);
      (L['forks-on'] || []).forEach(function (K) {
        (K.branches || []).forEach(function (bid) {
          var b = index[bid];
          if (!b) return;
          b.forks.push({ at: toDecimalYear(K.at), label: K.label || '', children: [bid], kink: true, emphasis: !!K.emphasis });
          b.forks.sort(function (p, q) { return p.at - q.at; });
        });
      });
      (L.events || []).forEach(function (E) {
        var ev = { id: E.id, kind: 'event', line: L.id, parent: E.on || L.id, label: E.label || '',
          year: toDecimalYear(E.year), side: E.side || 'above', end: !!E.end };
        see(ev.year);
        index[ev.id] = ev; (index[ev.parent] || line).events.push(ev.id);
      });
    });
    (raw.crossings || []).forEach(function (X) {
      var a = parseRef(X.a), b = parseRef(X.b);
      var x = { id: X.id, kind: 'crossing', a: a, b: b, label: X.label || '' };
      index[x.id] = x; crossings.push(x.id);
    });
    var span = raw.span ? raw.span.map(toDecimalYear) : [Math.floor(minY) - 2, Math.ceil(maxY) + 2];
    return { span: span, lines: lines, crossings: crossings, index: index };
  }

  // ---------------------------------------------------------------- validate
  function validate(raw) {
    var errs = [], ids = {};
    function err(path, message) { errs.push({ path: path, message: message }); }
    function claim(id, path) {
      if (id == null) { err(path, 'missing id'); return; }
      if (ids[id]) err(path, 'duplicate id "' + id + '"'); else ids[id] = path;
    }
    var years = {};  // id -> [start, end|null]
    (raw.lines || []).forEach(function (L, i) {
      var p = 'lines[' + i + ']';
      claim(L.id, p);
      var ls = toDecimalYear(L.start), le = L.end == null ? null : toDecimalYear(L.end);
      years[L.id] = [ls, le];
      (L.strands || []).forEach(function (S, j) {
        claim(S.id, p + '.strands[' + j + ']');
        years[S.id] = [toDecimalYear(S.start), S.end == null ? null : toDecimalYear(S.end)];
      });
      function walk(node, nodeStart, nodeEnd, path) {
        (node.forks || []).forEach(function (F, k) {
          var fp = path + '.forks[' + k + ']', at = toDecimalYear(F.at);
          if (at < nodeStart) err(fp, 'fork at ' + at + ' is before branch start ' + nodeStart);
          if (nodeEnd != null && at > nodeEnd) err(fp, 'fork at ' + at + ' is after branch end ' + nodeEnd);
          (F.children || []).forEach(function (C, c) {
            var cp = fp + '.children[' + c + ']';
            claim(C.id, cp);
            var ce = C.end == null ? null : toDecimalYear(C.end);
            if (ce != null && ce < at) err(cp, 'end ' + ce + ' is before fork at ' + at);
            years[C.id] = [at, ce];
            walk(C, at, ce, cp);
          });
        });
      }
      walk(L, ls, le, p);
      (L['forks-on'] || []).forEach(function (K, k) {
        (K.branches || []).forEach(function (bid) {
          if (!years[bid]) err(p + '.forks-on[' + k + ']', 'unknown id "' + bid + '"');
        });
      });
      (L.events || []).forEach(function (E, k) {
        var ep = p + '.events[' + k + ']';
        claim(E.id, ep);
        if (E.on && !years[E.on]) err(ep, 'unknown id "' + E.on + '"');
      });
      (L.meets || []).forEach(function (M, k) {
        [M[0], M[1]].forEach(function (sid) { if (!years[sid]) err(p + '.meets[' + k + ']', 'unknown id "' + sid + '"'); });
      });
    });
    (raw.crossings || []).forEach(function (X, i) {
      var p = 'crossings[' + i + ']';
      claim(X.id, p);
      ['a', 'b'].forEach(function (k) {
        var r = parseRef(X[k]);
        if (!years[r.id]) { err(p, 'unknown id "' + r.id + '"'); return; }
        var y = years[r.id];
        if (r.year < y[0] || (y[1] != null && r.year > y[1])) err(p, 'crossing endpoint "' + X[k] + '" is outside that id\'s years');
      });
    });
    return errs;
  }

  return { toDecimalYear: toDecimalYear, parseRef: parseRef, normalise: normalise, validate: validate };
});
