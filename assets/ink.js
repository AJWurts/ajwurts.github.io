/* Ink: renders timed pen strokes ({x, y, t, p}) as filled, variable-width
   outlines and replays them at their recorded speed. Shared by the homepage
   hero and the /sign/ capture tool. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var uid = 0;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* Pressure is only trusted when it actually varies (mice report a flat 0.5,
     some devices 0 or 1). Otherwise width comes from pen speed: slow = wet. */
  function widths(pts, base, openEnd) {
    var n = pts.length, out = new Array(n), i;
    var ps = pts.map(function (p) { return p.p; });
    var real = ps.every(function (v) { return typeof v === "number"; }) &&
      Math.max.apply(null, ps) - Math.min.apply(null, ps) > 0.08;
    var raw = new Array(n);
    for (i = 0; i < n; i++) {
      if (real) raw[i] = ps[i];
      else {
        var a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
        var dt = Math.max(1, b.t - a.t);
        var v = Math.hypot(b.x - a.x, b.y - a.y) / dt; // units per ms
        raw[i] = 1 - Math.min(1, v / 2.2);
      }
    }
    for (i = 0; i < n; i++) {
      var s = 0, c = 0;
      for (var k = -3; k <= 3; k++) {
        var j = i + k;
        if (j >= 0 && j < n) { s += raw[j]; c++; }
      }
      var taper = Math.min(1, (i + 1) / 5, openEnd ? 1 : (n - i) / 6 + 0.25);
      out[i] = base * (0.42 + 0.75 * (s / c)) * (0.45 + 0.55 * taper);
    }
    return out;
  }

  var f1 = function (v) { return Math.round(v * 10) / 10; };

  /* Closed outline: left edge forward, round cap, right edge back, round cap.
     Edges are smoothed with midpoint quadratics so sparse input still curves. */
  function outline(pts, w) {
    var n = pts.length;
    if (n === 0) return "";
    if (n === 1) {
      var r = Math.max(0.6, w[0] / 2), p = pts[0];
      return "M" + f1(p.x - r) + " " + f1(p.y) + "a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0Z";
    }
    var L = [], R = [];
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, h = w[i] / 2;
      L.push([pts[i].x + nx * h, pts[i].y + ny * h]);
      R.push([pts[i].x - nx * h, pts[i].y - ny * h]);
    }
    function side(arr, d) {
      for (var i = 1; i < arr.length - 1; i++) {
        var mx = (arr[i][0] + arr[i + 1][0]) / 2, my = (arr[i][1] + arr[i + 1][1]) / 2;
        d.push("Q" + f1(arr[i][0]) + " " + f1(arr[i][1]) + " " + f1(mx) + " " + f1(my));
      }
      var e = arr[arr.length - 1];
      d.push("L" + f1(e[0]) + " " + f1(e[1]));
    }
    var d = ["M" + f1(L[0][0]) + " " + f1(L[0][1])];
    side(L, d);
    var re = R[n - 1], rEnd = Math.max(0.3, w[n - 1] / 2);
    d.push("A" + f1(rEnd) + " " + f1(rEnd) + " 0 0 1 " + f1(re[0]) + " " + f1(re[1]));
    side(R.slice().reverse(), d);
    var rs = Math.max(0.3, w[0] / 2);
    d.push("A" + f1(rs) + " " + f1(rs) + " 0 0 1 " + f1(L[0][0]) + " " + f1(L[0][1]) + "Z");
    return d.join("");
  }

  /* Points of one stroke up to time t, with an interpolated head point. */
  function upTo(stroke, t) {
    if (t >= stroke[stroke.length - 1].t) return stroke;
    var out = [];
    for (var i = 0; i < stroke.length; i++) {
      var p = stroke[i];
      if (p.t <= t) { out.push(p); continue; }
      if (i > 0) {
        var q = stroke[i - 1], k = (t - q.t) / Math.max(1, p.t - q.t);
        out.push({ x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, t: t, p: q.p });
      }
      break;
    }
    return out;
  }

  /* Indices where the pen reverses direction (a turnaround on a retraced
     line). The outline pinches flat there, so a round joint is drawn on top. */
  function cusps(pts) {
    var out = [], k = 3;
    for (var i = k; i < pts.length - k; i++) {
      var a = pts[i - k], b = pts[i], c = pts[i + k];
      var ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      var l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (l > 0 && (ux * vx + uy * vy) / l < -0.5) {
        if (!out.length || i - out[out.length - 1] > k * 2) out.push(i);
      }
    }
    return out;
  }
  function dot(p, r) {
    return "M" + f1(p.x - r) + " " + f1(p.y) + "a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0Z";
  }

  function signatureBase(sig) {
    // pen width scales with the drawing so a captured signature of any size reads the same
    return Math.max(2.2, Math.min(sig.width, sig.height * 3) / 115);
  }

  /* Build an <svg> player for a signature. opts.rough adds a faint paper-grain
     displacement so edges are not vector-perfect. */
  function Player(svg, sig, opts) {
    opts = opts || {};
    this.svg = svg;
    this.sig = sig;
    this.speed = opts.speed || 1;
    this.base = opts.width || sig.penWidth || signatureBase(sig);
    svg.setAttribute("viewBox", "0 0 " + sig.width + " " + sig.height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = el("g", { fill: "currentColor" });
    if (opts.rough !== false) {
      var id = "ink-rough-" + (++uid);
      var defs = el("defs", {});
      var f = el("filter", { id: id, x: "-5%", y: "-20%", width: "110%", height: "140%" });
      f.appendChild(el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.06", numOctaves: "2", seed: "3", result: "n" }));
      f.appendChild(el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: String(signatureBase(sig) * 0.3), xChannelSelector: "R", yChannelSelector: "G" }));
      defs.appendChild(f);
      svg.appendChild(defs);
      g.setAttribute("filter", "url(#" + id + ")");
    }
    svg.appendChild(g);
    this.paths = sig.strokes.map(function () { var p = el("path", {}); g.appendChild(p); return p; });
    this.joints = sig.strokes.map(function () { var p = el("path", {}); g.appendChild(p); return p; });
    this.cusps = sig.strokes.map(cusps);
    // openEnd: the last stroke ends at full width because something carries it on
    this.widths = sig.strokes.map(function (s, i) { return widths(s, this.base, opts.openEnd && i === sig.strokes.length - 1); }, this);
    this.raf = 0;
  }

  Player.prototype.duration = function () {
    var s = this.sig.strokes;
    if (!s.length) return 0;
    var last = s[s.length - 1];
    return last[last.length - 1].t / this.speed;
  };

  Player.prototype.drawAt = function (ms) {
    var t = ms * this.speed;
    for (var i = 0; i < this.sig.strokes.length; i++) {
      var s = this.sig.strokes[i];
      if (!s.length) continue;
      var d = "";
      if (t >= s[0].t) {
        var pts = upTo(s, t);
        d = outline(pts, this.widths[i].slice(0, pts.length));
      }
      this.paths[i].setAttribute("d", d);
      var jd = "", n = d ? upTo(s, t).length : 0, w = this.widths[i];
      for (var c = 0; c < this.cusps[i].length && this.cusps[i][c] < n; c++) {
        var ci = this.cusps[i][c];
        jd += dot(s[ci], w[ci] / 2);
      }
      this.joints[i].setAttribute("d", jd);
    }
  };

  Player.prototype.drawAll = function () { this.stop(); this.drawAt(Infinity); };

  Player.prototype.play = function (onDone) {
    var self = this, start = null, dur = this.duration();
    this.stop();
    this.drawAt(-1);
    function frame(now) {
      if (start === null) start = now;
      var e = now - start;
      self.drawAt(e);
      if (e < dur) self.raf = requestAnimationFrame(frame);
      else { self.raf = 0; if (onDone) onDone(); }
    }
    this.raf = requestAnimationFrame(frame);
  };

  Player.prototype.stop = function () {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  /* Last pen position, in signature units. */
  Player.prototype.endPoint = function () {
    var s = this.sig.strokes, last = s[s.length - 1];
    return last ? last[last.length - 1] : { x: this.sig.width, y: this.sig.height / 2 };
  };

  window.Ink = { Player: Player, outline: outline, widths: widths };
})();
