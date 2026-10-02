/* Homepage: signature playback, the scroll-drawn ink line, doodles, labs. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;
  var sigSvg = document.getElementById("signature");
  var trail = document.getElementById("trail");
  var cue = document.getElementById("cue");
  var labsEl = document.getElementById("labs");
  var doodles = Array.prototype.slice.call(document.querySelectorAll(".doodle"));

  // ---------- signature ----------
  sigSvg.style.setProperty("--sig-ar", (window.SIGNATURE.width / window.SIGNATURE.height).toFixed(3));
  var player = new Ink.Player(sigSvg, window.SIGNATURE, { openEnd: true });
  var signed = false;
  function onSigned() {
    signed = true;
    body.classList.add("signed");
    introStart = performance.now();
    requestTick();
  }
  if (reduce) { player.drawAll(); onSigned(); }
  else setTimeout(function () { player.play(onSigned); }, 450);

  // doodle strokes draw one after another, a pen-like rhythm
  // colored doodles (data-draw = seconds for the whole outline) compress
  // their many strokes into that budget, then wash the color in underneath
  doodles.forEach(function (svg) {
    var vbW = svg.viewBox.baseVal && svg.viewBox.baseVal.width || 160;
    var budget = parseFloat(svg.getAttribute("data-draw")) || 0;
    var paths = Array.prototype.filter.call(svg.querySelectorAll("path"), function (p) { return !p.closest(".wash"); });
    var steps = [], t = 0;
    paths.forEach(function (p) {
      var len = p.getTotalLength();
      p.setAttribute("pathLength", "1");
      var dur = Math.max(0.18, Math.min(0.7, (len / vbW) * 160 / 260));
      steps.push({ p: p, at: t, dur: dur });
      t += dur * 0.85;
    });
    var outlineEnd = 0, k = budget && t > budget ? budget / t : 1;
    steps.forEach(function (s) {
      var dur = Math.max(0.06, s.dur * k);
      s.p.style.setProperty("--delay", (s.at * k).toFixed(3) + "s");
      s.p.style.setProperty("--dur", dur.toFixed(3) + "s");
      if (!s.p.hasAttribute("data-out")) outlineEnd = Math.max(outlineEnd, s.at * k + dur);
    });
    svg.style.setProperty("--wash-delay", outlineEnd.toFixed(2) + "s");
  });

  // ---------- labs ----------
  var scene = new Labs.Scene(document.getElementById("labs-svg"), {
    onDone: function () { labsEl.classList.add("done"); }
  });
  var labsPlayed = false;
  function playLabs() {
    labsPlayed = true;
    labsEl.classList.remove("done");
    if (reduce) scene.still(); else scene.play();
  }
  labsEl.addEventListener("click", playLabs);
  labsEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playLabs(); }
  });
  if (reduce) { scene.still(); labsEl.classList.add("done"); labsPlayed = true; }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        scene.visible = e.isIntersecting;
        if (e.intersectionRatio >= 0.6 && !labsPlayed) playLabs();
      });
    }, { threshold: [0, 0.6] }).observe(labsEl);
  } else playLabs();

  // ---------- the line ----------
  // the line is a few separate paths (it hops across each doodle); one
  // running length is spread across them
  var segs = [], total = 0, samplesY = [], sampleStep = 1, anchors = [], cueLen = 0;
  // the pen flick carries on into the line: it leaves at the signature's ink
  // width and thins to the hairline over TAPER_LEN px
  var TAPER_LEN = 220, HAIR = 1.4, taperEl = null, taperW0 = HAIR, taperShown = -1;
  function endInkWidth() {
    var ws = player.widths[player.widths.length - 1];
    var m = sigSvg.getScreenCTM();
    return ws && ws.length && m ? ws[ws.length - 1] * Math.hypot(m.a, m.b) : HAIR;
  }
  function drawTaper(L) {
    L = Math.min(L, TAPER_LEN, total);
    if (L === taperShown) return;
    taperShown = L;
    if (L < 1) { taperEl.setAttribute("d", ""); return; }
    var n = Math.max(2, Math.ceil(L / 4)), left = [], right = [];
    for (var i = 0; i <= n; i++) {
      var l = (L * i) / n, a = pointAt(Math.max(0, l - 1)), b = pointAt(Math.min(total, l + 1));
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var k = l / TAPER_LEN, h = (HAIR + (taperW0 - HAIR) * Math.pow(1 - k, 1.6)) / 2;
      var c = pointAt(l);
      left.push(f(c.x - (dy / len) * h) + " " + f(c.y + (dx / len) * h));
      right.push(f(c.x + (dy / len) * h) + " " + f(c.y - (dx / len) * h));
    }
    var c0 = pointAt(0), r = taperW0 / 2;
    taperEl.setAttribute("d", "M" + left.join("L") + "L" + right.reverse().join("L") + "Z" +
      "M" + f(c0.x - r) + " " + f(c0.y) + "a" + f(r) + " " + f(r) + " 0 1 0 " + f(2 * r) + " 0a" + f(r) + " " + f(r) + " 0 1 0 " + f(-2 * r) + " 0Z");
  }
  var introStart = 0, INTRO_MS = 900;

  function pageXY(svg, x, y) {
    var m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    var r = pt.matrixTransform(m);
    return { x: r.x + window.scrollX, y: r.y + window.scrollY };
  }
  function pathEnd(svg, sel, atEnd) {
    var p = svg.querySelector(sel), pt = p.getPointAtLength(atEnd ? p.getTotalLength() : 0);
    return pageXY(svg, pt.x, pt.y);
  }
  function f(v) { return Math.round(v * 10) / 10; }
  // vertical-tangent cubic from a to b, nudged sideways by w for a gentle meander
  function seg(a, b, w, k) {
    var dy = b.y - a.y; k = k || 0.45;
    return "C" + f(a.x + w) + " " + f(a.y + dy * k) + " " + f(b.x - w) + " " + f(b.y - dy * k) + " " + f(b.x) + " " + f(b.y);
  }

  function rebuild() {
    var docW = document.documentElement.clientWidth;
    var wide = window.innerWidth >= 1180;
    var intro = document.querySelector(".intro");
    var ir = intro.getBoundingClientRect();
    var colLeft = ir.left + parseFloat(getComputedStyle(intro).paddingLeft);
    var sy = window.scrollY;

    // start: the last point the pen touched
    var e = player.endPoint();
    var P0 = pageXY(sigSvg, e.x, e.y);
    var labsRect = labsEl.getBoundingClientRect();

    var gx = wide ? colLeft - 44 - 88 : Math.max(14, colLeft - 30);
    var G = { x: wide ? gx - 70 : gx, y: labsRect.top + sy + scene.gy };
    scene.setGroundStart(G.x);
    G.y = labsRect.top + sy + scene.gy;

    var Q = { x: gx, y: ir.top + sy + 10 };
    // leave the signature along the direction the pen was already moving
    var st = window.SIGNATURE.strokes, ls = st[st.length - 1];
    var pa = ls[Math.max(0, ls.length - 6)], pb = ls[ls.length - 1];
    var tl = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    var reach = Math.min(220, window.innerWidth * 0.12);
    var c1 = { x: P0.x + ((pb.x - pa.x) / tl) * reach, y: P0.y + ((pb.y - pa.y) / tl) * reach + 30 };
    // drop down the right side, clear of the caption, then sweep to the margin
    var cap = document.querySelector(".caption").getBoundingClientRect();
    var W1 = { x: Math.min(P0.x + 30, docW - 24), y: cap.bottom + sy + Math.min(90, window.innerHeight * 0.1) };
    var d = "M" + f(P0.x) + " " + f(P0.y) + "C" + f(c1.x) + " " + f(c1.y) + " " + f(W1.x) + " " + f(W1.y - 120) + " " + f(W1.x) + " " + f(W1.y) +
      seg(W1, Q, 0, 0.6);
    var parts = [];
    anchors = [];

    if (wide) {
      var prev = Q, w = 34;
      doodles.forEach(function (svg) {
        var a = pathEnd(svg, "[data-in]", false), b = pathEnd(svg, "[data-out]", true);
        // short hops get a smaller sideways swing so they don't kink into an S
        parts.push(d + seg(prev, a, w * Math.min(1, Math.abs(a.y - prev.y) / 260)));
        d = "M" + f(b.x) + " " + f(b.y);
        anchors.push({ el: svg, y: a.y });
        prev = b; w = -w;
      });
      // bend into the horizontal so the line becomes the dogs' ground
      parts.push(d + "C" + f(prev.x) + " " + f(prev.y + (G.y - prev.y) * 0.55) + " " + f(G.x - 90) + " " + f(G.y) + " " + f(G.x) + " " + f(G.y));
    } else {
      // narrow: a thin line straight down the margin, barely wavering
      var y = Q.y, prevPt = Q, i = 0;
      while (G.y - y > 520) {
        y += 460;
        var nxt = { x: gx + (i++ % 2 ? -3 : 3), y: y };
        d += seg(prevPt, nxt, 4);
        prevPt = nxt;
      }
      d += seg(prevPt, G, 3);
      parts.push(d);
      doodles.forEach(function (svg) {
        var r = svg.getBoundingClientRect();
        anchors.push({ el: svg, y: r.top + sy + r.height * 0.6 });
      });
    }

    trail.setAttribute("width", docW);
    trail.style.height = document.documentElement.scrollHeight + "px";
    trail.innerHTML = "";
    segs = [];
    total = 0;
    parts.forEach(function (pd) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", pd);
      trail.appendChild(p);
      var len = p.getTotalLength();
      p.style.strokeDasharray = len + " " + (len + 10);
      p.style.strokeDashoffset = len;
      segs.push({ el: p, start: total, len: len, shown: -1 });
      total += len;
    });

    taperW0 = Math.max(HAIR, endInkWidth());
    taperEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    taperEl.setAttribute("class", "taper");
    trail.appendChild(taperEl);
    taperShown = -1;

    // y along the line, made monotone, so scroll depth maps to drawn length
    var n = Math.min(4000, Math.ceil(total / 6));
    sampleStep = total / n;
    samplesY = new Float32Array(n + 1);
    var maxY = -Infinity;
    for (var k = 0; k <= n; k++) {
      maxY = Math.max(maxY, pointAt(k * sampleStep).y);
      samplesY[k] = maxY;
    }

    // scroll cue sits beside where the line pauses on first view
    cueLen = lenAtY(window.innerHeight * 0.62);
    var cp = pointAt(cueLen);
    var tight = cp.x + 14 + 56 > docW;
    cue.style.transform = "translate(" + f(tight ? cp.x - 50 : cp.x + 14) + "px," + f(tight ? cp.y + 4 : cp.y - 10) + "px)";
    drawn = -1;
    requestTick();
  }

  function pointAt(L) {
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (L <= s.start + s.len || i === segs.length - 1) return s.el.getPointAtLength(Math.max(0, Math.min(s.len, L - s.start)));
    }
    return { x: 0, y: 0 };
  }

  function lenAtY(y) {
    var lo = 0, hi = samplesY.length - 1;
    if (!samplesY.length || y <= samplesY[0]) return 0;
    if (y >= samplesY[hi]) return total;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (samplesY[mid] <= y) lo = mid; else hi = mid; }
    var a = samplesY[lo], b = samplesY[hi], k = b > a ? (y - a) / (b - a) : 0;
    return (lo + k) * sampleStep;
  }

  // ---------- frame loop (only while something changes) ----------
  var ticking = false, drawn = -1;
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  function update(now) {
    ticking = false;
    if (!total) return;
    var headY = window.scrollY + window.innerHeight * 0.62;
    var target = reduce ? total : lenAtY(headY);
    var again = false;
    if (!signed) target = 0;
    else if (!reduce) {
      var k = Math.min(1, (now - introStart) / INTRO_MS);
      if (k < 1) again = true;
      target = Math.min(target, cueLen * (1 - Math.pow(1 - k, 3)) + (k >= 1 ? Infinity : 0));
    }
    // ease toward the target so fast flicks still feel drawn
    var next = drawn < 0 || reduce ? target : drawn + (target - drawn) * 0.22;
    if (Math.abs(target - next) < 0.5) next = target; else again = true;
    if (next !== drawn) {
      drawn = next;
      drawTaper(drawn);
      for (var j = 0; j < segs.length; j++) {
        var sg = segs[j], show = Math.max(0, Math.min(sg.len, drawn - sg.start));
        if (show !== sg.shown) {
          sg.shown = show;
          sg.el.style.strokeDashoffset = sg.len - show;
          sg.el.style.visibility = show > 0.5 ? "visible" : "hidden";
        }
      }
    }
    if (signed) {
      for (var i = 0; i < anchors.length; i++) {
        if (headY >= anchors[i].y || reduce) anchors[i].el.classList.add("on");
      }
    }
    if (again) requestTick();
  }

  window.addEventListener("scroll", function () {
    if (window.scrollY > 40) body.classList.add("scrolled");
    requestTick();
  }, { passive: true });

  var rt = 0;
  function scheduleRebuild() { clearTimeout(rt); rt = setTimeout(rebuild, 120); }
  window.addEventListener("resize", scheduleRebuild);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleRebuild).observe(document.querySelector("main"));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
  rebuild();
})();
