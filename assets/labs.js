/* Two labs: pen-outline dogs built from a tiny skeleton (body, head, ear,
   tail, four legs), posed by hand-authored joint angles, redrawn at 12fps with
   a fresh jitter each tick so the line "boils" like hand-drawn animation. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var D2R = Math.PI / 180;

  // ---------- geometry helpers (dog space: x forward, y up, units ~px) ----------
  function rot(p, a) {
    var c = Math.cos(a * D2R), s = Math.sin(a * D2R);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }

  var jitterAmt = 0, rng = mulberry(1);
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function J(p) { return [p[0] + (rng() - 0.5) * jitterAmt, p[1] + (rng() - 0.5) * jitterAmt]; }

  var f1 = function (v) { return Math.round(v * 10) / 10; };
  // y is flipped here: dog space is y-up, SVG is y-down
  function P(p) { return f1(p[0]) + " " + f1(-p[1]); }

  /* Catmull-Rom through points as cubic beziers. */
  function smooth(pts, closed) {
    var n = pts.length, d = "M" + P(pts[0]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      var p1 = pts[i], p2 = pts[(i + 1) % n];
      var p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += "C" + P(c1) + " " + P(c2) + " " + P(p2);
    }
    return closed ? d + "Z" : d;
  }

  /* A limb: chain of joints with widths -> closed fill outline and an open
     ink contour that starts partway down the first bone (so it grows out of
     the body instead of drawing a seam across it). */
  function limb(joints, w, startFrac, capDir) {
    var a = joints[0], b = joints[1];
    var ws = w[0] + (w[1] - w[0]) * startFrac;
    var js = [[a[0] + (b[0] - a[0]) * startFrac, a[1] + (b[1] - a[1]) * startFrac]].concat(joints.slice(1));
    var wl = [ws].concat(w.slice(1));
    var L = [], R = [], n = js.length;
    for (var i = 0; i < n; i++) {
      var p = js[Math.max(0, i - 1)], q = js[Math.min(n - 1, i + 1)];
      var dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      var nx = -dy / l, ny = dx / l, h = wl[i] / 2;
      L.push(J([js[i][0] + nx * h, js[i][1] + ny * h]));
      R.push(J([js[i][0] - nx * h, js[i][1] - ny * h]));
    }
    var e = js[n - 1], pe = js[n - 2];
    var tx = e[0] - pe[0], ty = e[1] - pe[1], tl = Math.hypot(tx, ty) || 1;
    var cap = J([e[0] + (tx / tl) * wl[n - 1] * 0.55, e[1] + (ty / tl) * wl[n - 1] * 0.55]);
    var ring = L.concat([cap], R.slice().reverse());
    return { fill: smooth(ring, true), line: smooth(ring, false) };
  }

  // ---------- the dog ----------
  /* Body silhouette in body space (spine along x, origin mid-back). The neck
     points are appended per pose so the neck flows into the head. */
  var BODY_BACK = [[-57, 3], [-46, 9], [-26, 7], [-4, 5], [18, 6], [33, 10]];
  var BODY_FRONT = [[57, -6], [61, -20], [55, -33], [40, -42], [20, -44], [2, -40], [-14, -33], [-28, -28], [-42, -31], [-54, -24], [-61, -11]];

  /* Head in head space: origin at occiput, x toward the nose. Broad skull,
     clear stop, deep square muzzle: the lab profile. */
  var HEAD = [[0, 3], [6, 10.5], [16, 13], [24, 11.5], [28.5, 7], [33, 4.6], [40, 4], [44.5, 2.6], [46.6, -1], [46.4, -5.6], [44.4, -9], [41.5, -14], [35.5, -16.6], [30, -19.6], [20, -20.6], [10, -19], [2, -11]];
  var EAR = [[8, 8], [17, 7.5], [21, -2], [20.4, -12], [17.4, -20.6], [11.4, -20.4], [6.4, -11], [5, -1]];

  var FRONT_LEN = [24, 31, 10, 8], FRONT_W = [20, 13, 9, 8, 8.6, 6.4];
  var HIND_LEN = [29, 30, 19, 8], HIND_W = [31, 18, 11, 8.6, 8.8, 6.4];
  var TAIL_LEN = [14, 13, 12, 10], TAIL_W = [19, 16, 13, 9.6, 5];

  function chain(origin, lens, angs) {
    // leg angles: 0 = straight down, + = forward
    var pts = [origin], p = origin;
    for (var i = 0; i < lens.length; i++) {
      p = [p[0] + Math.sin(angs[i] * D2R) * lens[i], p[1] - Math.cos(angs[i] * D2R) * lens[i]];
      pts.push(p);
    }
    return pts;
  }
  function tailChain(origin, lens, angs) {
    // tail angles: 0 = straight back, + = up
    var pts = [origin], p = origin;
    for (var i = 0; i < lens.length; i++) {
      p = [p[0] - Math.cos(angs[i] * D2R) * lens[i], p[1] + Math.sin(angs[i] * D2R) * lens[i]];
      pts.push(p);
    }
    return pts;
  }

  /* Pose fields:
     y: spine height above ground, pitch: body tilt (deg, + nose up),
     arch: spine flex (+ rounds the back), stretch: body length scale,
     head: [x, y, angle] of occiput in body space, ear: ear swing (deg, + back),
     tail: 4 segment angles, fn/ff/hn/hf: near/far front and hind leg angles. */
  function build(pose) {
    var out = [];
    var bodyT = function (p) {
      var x = p[0] * 0.92 * (pose.stretch || 1);
      var y = p[1] + (pose.arch || 0) * 7 * (1 - Math.min(1, (p[0] / 60) * (p[0] / 60)));
      var r = rot([x, y], pose.pitch || 0);
      return [r[0], r[1] + pose.y];
    };
    var hp = pose.head, ha = hp[2];
    var headT = function (p) { var r = rot([p[0] * 1.2, p[1] * 1.2], ha); return add(bodyT([hp[0], hp[1]]), r); };

    var shoulder = bodyT([39, -17]), hip = bodyT([-41, -12]), tailBase = bodyT([-59, 2]);

    // far side first (lighter), then tail, body, head, near legs
    var far = [limb(chain(add(shoulder, [-5, 1]), FRONT_LEN, pose.ff), FRONT_W, 0.45),
      limb(chain(add(hip, [-5, 1]), HIND_LEN, pose.hf), HIND_W, 0.5)];
    far.forEach(function (l) { out.push({ d: l.fill, cls: "f farf" }, { d: l.line, cls: "l far" }); });

    var tail = limb(tailChain(tailBase, TAIL_LEN, pose.tail), TAIL_W, 0.15);
    out.push({ d: tail.fill, cls: "f" }, { d: tail.line, cls: "l" });

    // body + neck as one contour: back line, up the neck, (head covers the join), down the throat, chest, belly
    var neckTop = [bodyT([44, 19])], neckFront = [bodyT([61, 6])];
    var body = BODY_BACK.map(bodyT).concat(neckTop, [headT([2, 1])], [headT([10, -16])], neckFront, BODY_FRONT.map(bodyT)).map(J);
    out.push({ d: smooth(body, true), cls: "f l" });

    var head = HEAD.map(headT).map(J);
    out.push({ d: smooth(head, true), cls: "f l" });
    // eye, nose, mouth
    var eye = headT([23.5, 0.5]);
    out.push({ d: "M" + P(add(eye, [-1.6, 0])) + "a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0", cls: "dot" });
    out.push({ d: smooth([headT([42.6, 1.2]), headT([46.8, -0.6]), headT([46, -4.4]), headT([42.6, -3.6])].map(J), true), cls: "dot nose" });
    out.push({ d: smooth([headT([44, -9.4]), headT([38.5, -12.6]), headT([32, -13.6])].map(J), false), cls: "l thin" });
    // floppy ear, swung about its root
    var ea = pose.ear || 0;
    var ear = EAR.map(function (p) { return headT(add(rot([(p[0] - 9) * 0.8, (p[1] - 7) * 0.82], ea), [8, 7])); }).map(J);
    out.push({ d: smooth(ear, true), cls: "f l ear" });

    var near = [limb(chain(shoulder, FRONT_LEN, pose.fn), FRONT_W, 0.5),
      limb(chain(hip, HIND_LEN, pose.hn), HIND_W, 0.42)];
    near.forEach(function (l) { out.push({ d: l.fill, cls: "f" }, { d: l.line, cls: "l" }); });
    return out;
  }

  // ---------- poses ----------
  var STAND = { y: 58, pitch: 0, arch: 0, head: [62, 30, -6], ear: 0, tail: [-14, -8, -2, 8],
    fn: [-22, 0, 14, 85], ff: [-18, 3, 16, 85], hn: [30, -42, -6, 82], hf: [26, -40, -4, 82] };

  // rotary gallop, 4 frames: extended suspension, front stance, collected suspension, hind stance
  var GALLOP = [
    { y: 60, pitch: 1, arch: -0.7, stretch: 1.1, head: [64, 22, -12], ear: 40, tail: [10, 14, 18, 22],
      fn: [64, 82, 96, 115], ff: [52, 70, 88, 110], hn: [-52, -80, -92, -66], hf: [-42, -70, -86, -60] },
    { y: 53, pitch: -5, arch: 0.6, stretch: 0.96, head: [64, 22, -20], ear: 25, tail: [12, 18, 24, 30],
      fn: [6, 0, 14, 82], ff: [-26, -40, -60, 30], hn: [56, 26, 34, 100], hf: [46, 12, 24, 96] },
    { y: 57, pitch: -2, arch: 1.6, stretch: 0.86, head: [62, 24, -16], ear: 10, tail: [2, 8, 14, 22],
      fn: [-34, -72, -98, -40], ff: [-44, -84, -108, -50], hn: [72, 46, 42, 106], hf: [80, 56, 52, 110] },
    { y: 58, pitch: 7, arch: 0.3, stretch: 1.02, head: [64, 26, -6], ear: 30, tail: [8, 14, 20, 26],
      fn: [66, 40, 70, 110], ff: [52, 16, 46, 100], hn: [6, -40, -30, 72], hf: [-16, -56, -62, 30] }
  ];

  // leap: front tucked, hind streaming back, body long
  var LEAP = { y: 60, pitch: 0, arch: 0.6, stretch: 1.06, head: [66, 24, -10], ear: 55, tail: [6, 10, 14, 18],
    fn: [62, 38, 56, 92], ff: [54, 26, 44, 86], hn: [-60, -86, -98, -76], hf: [-50, -78, -92, -70] };

  // play bow: elbows down, rump up, tail high (two wag frames)
  var BOW = [
    { y: 46, pitch: -17, arch: -0.3, head: [62, 30, 22], ear: -4, tail: [38, 48, 58, 66],
      fn: [62, 86, 92, 95], ff: [58, 84, 90, 94], hn: [28, -46, -8, 84], hf: [22, -44, -6, 84] },
    { y: 46, pitch: -17, arch: -0.3, head: [62, 30, 18], ear: 2, tail: [30, 62, 76, 70],
      fn: [62, 86, 92, 95], ff: [58, 84, 90, 94], hn: [28, -46, -8, 84], hf: [22, -44, -6, 84] }
  ];

  var POSES = { STAND: STAND, GALLOP: GALLOP, LEAP: LEAP, BOW: BOW };

  /* Lowest paw y for grounding a pose. */
  function groundOffset(pose) {
    var minY = Infinity;
    build(pose).forEach(function () {});
    ["fn", "ff", "hn", "hf"].forEach(function (k) {
      var front = k[0] === "f";
      var bodyT = function (p) {
        var x = p[0] * 0.92 * (pose.stretch || 1);
        var y = p[1] + (pose.arch || 0) * 7 * (1 - Math.min(1, (p[0] / 60) * (p[0] / 60)));
        var r = rot([x, y], pose.pitch || 0);
        return [r[0], r[1] + pose.y];
      };
      var o = bodyT(front ? [39, -17] : [-41, -12]);
      var c = chain(o, front ? FRONT_LEN : HIND_LEN, pose[k]);
      c.forEach(function (p) { minY = Math.min(minY, p[1] - 4); });
    });
    return minY;
  }

  /* Render a pose into an SVG group. seed picks the boil variant. */
  function draw(g, pose, seed, jitter) {
    rng = mulberry(seed * 7919 + 13);
    jitterAmt = jitter == null ? 1.1 : jitter;
    var parts = build(pose), html = "";
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].cls, w = (1.45 + rng() * 0.5).toFixed(2);
      html += '<path class="' + c + '" d="' + parts[i].d + '"' + (c.indexOf("l") >= 0 ? ' stroke-width="' + w + '"' : "") + "/>";
    }
    g.innerHTML = html;
  }



  // ---------- names ----------
  /* Norman and Maui, hand-written under the dogs during the mutual bow. Pen
     strokes from the EMS Allure single-line script (SIL OFL): y down, cap
     height 1, centered on x = 0. */
  var NAMES = {"Norman":{"w":5.261,"d":["M-2.63 0.05L-2.63 0.07L-2.62 0.09L-2.61 0.11L-2.60 0.13L-2.59 0.15L-2.57 0.16L-2.55 0.17L-2.52 0.18L-2.49 0.18L-2.46 0.18L-2.43 0.17L-2.40 0.15L-2.36 0.13L-2.32 0.11L-2.28 0.08L-2.25 0.05L-2.21 0.01L-2.18 -0.04L-2.15 -0.10L-2.12 -0.15L-2.09 -0.21L-2.05 -0.27L-2.02 -0.33L-2.00 -0.39L-1.97 -0.45L-1.95 -0.51L-1.93 -0.56L-1.91 -0.62L-1.89 -0.67L-1.87 -0.71L-1.86 -0.76L-1.84 -0.80L-1.83 -0.85L-1.82 -0.91L-1.81 -0.95L-1.80 -0.94L-1.80 -0.86L-1.80 -0.73L-1.79 -0.58L-1.79 -0.47L-1.78 -0.40L-1.78 -0.35L-1.77 -0.31L-1.76 -0.27L-1.74 -0.21L-1.71 -0.15L-1.69 -0.09L-1.66 -0.05L-1.64 -0.02L-1.62 0.00L-1.60 0.02L-1.58 0.03L-1.56 0.04L-1.53 0.05L-1.51 0.05L-1.48 0.05L-1.46 0.05L-1.44 0.04L-1.41 0.02L-1.38 0.00L-1.35 -0.04L-1.32 -0.08L-1.29 -0.13L-1.26 -0.18L-1.23 -0.23L-1.21 -0.28L-1.19 -0.33L-1.18 -0.39L-1.16 -0.46L-1.15 -0.54L-1.13 -0.61L-1.12 -0.67L-1.12 -0.73L-1.11 -0.77L-1.11 -0.81L-1.11 -0.84L-1.12 -0.87L-1.12 -0.89L-1.13 -0.90L-1.13 -0.92L-1.14 -0.95L-1.15 -0.98L-1.16 -1.00L-1.16 -1.01L-1.15 -1.00L-1.13 -0.97L-1.11 -0.94L-1.10 -0.92L-1.08 -0.90L-1.07 -0.89L-1.06 -0.88L-1.05 -0.86L-1.05 -0.86L-1.04 -0.85L-1.03 -0.84L-1.02 -0.84L-1.01 -0.83L-1.00 -0.82L-0.99 -0.82L-0.98 -0.81","M-2.08 -0.73L-2.08 -0.73L-2.08 -0.73L-2.07 -0.73L-2.06 -0.74L-2.03 -0.75L-2.00 -0.76L-1.96 -0.78L-1.93 -0.80L-1.92 -0.81L-1.90 -0.82L-1.89 -0.83L-1.88 -0.85L-1.87 -0.87L-1.86 -0.90L-1.84 -0.92L-1.83 -0.94","M-0.69 -0.48L-0.70 -0.49L-0.72 -0.51L-0.74 -0.52L-0.77 -0.52L-0.79 -0.51L-0.82 -0.50L-0.85 -0.47L-0.88 -0.45L-0.90 -0.42L-0.93 -0.39L-0.96 -0.36L-0.98 -0.33L-1.00 -0.31L-1.01 -0.28L-1.02 -0.26L-1.03 -0.23L-1.04 -0.20L-1.05 -0.17L-1.06 -0.14L-1.05 -0.11L-1.04 -0.08L-1.01 -0.05L-0.98 -0.03L-0.95 -0.01L-0.92 -0.01L-0.89 -0.02L-0.86 -0.04L-0.83 -0.06L-0.80 -0.08L-0.76 -0.10L-0.73 -0.13L-0.71 -0.16L-0.69 -0.19L-0.67 -0.23L-0.65 -0.27L-0.64 -0.30L-0.63 -0.32L-0.63 -0.33L-0.63 -0.34L-0.63 -0.35L-0.63 -0.37L-0.63 -0.38L-0.63 -0.40L-0.63 -0.41L-0.63 -0.41L-0.64 -0.41L-0.65 -0.41L-0.66 -0.41","M-0.73 -0.23L-0.73 -0.21L-0.72 -0.19L-0.72 -0.16L-0.71 -0.14L-0.70 -0.13L-0.69 -0.12L-0.68 -0.11L-0.67 -0.10L-0.65 -0.10L-0.64 -0.10L-0.62 -0.10L-0.61 -0.11L-0.59 -0.12L-0.58 -0.13L-0.56 -0.14L-0.55 -0.16L-0.53 -0.18L-0.51 -0.20L-0.48 -0.23L-0.46 -0.26L-0.44 -0.29L-0.42 -0.33L-0.39 -0.36L-0.36 -0.41L-0.32 -0.47L-0.26 -0.55L-0.21 -0.62L-0.19 -0.66L-0.21 -0.66L-0.26 -0.63L-0.31 -0.59L-0.34 -0.56L-0.36 -0.54L-0.36 -0.53L-0.35 -0.53L-0.34 -0.52L-0.35 -0.52L-0.35 -0.51L-0.35 -0.51L-0.33 -0.51L-0.26 -0.51L-0.17 -0.52L-0.09 -0.52L-0.04 -0.50L-0.05 -0.47L-0.10 -0.41L-0.16 -0.36L-0.20 -0.31L-0.24 -0.26L-0.26 -0.22L-0.28 -0.18L-0.30 -0.14L-0.30 -0.11L-0.30 -0.08L-0.29 -0.05L-0.27 -0.03L-0.25 -0.02L-0.22 -0.02L-0.18 -0.03L-0.15 -0.04L-0.11 -0.07L-0.06 -0.11L-0.02 -0.15L0.01 -0.19L0.03 -0.21L0.04 -0.23L0.05 -0.24L0.07 -0.26L0.10 -0.29L0.13 -0.31L0.16 -0.34L0.18 -0.36L0.20 -0.40L0.22 -0.44L0.23 -0.47L0.22 -0.46L0.19 -0.38L0.14 -0.25L0.09 -0.12L0.07 -0.04L0.07 -0.03L0.10 -0.06L0.13 -0.10L0.17 -0.15L0.21 -0.20L0.26 -0.26L0.31 -0.31L0.35 -0.36L0.38 -0.39L0.41 -0.41L0.43 -0.43L0.45 -0.44L0.47 -0.46L0.49 -0.47L0.50 -0.47L0.52 -0.48L0.53 -0.49L0.53 -0.49L0.54 -0.49L0.55 -0.49L0.55 -0.48L0.55 -0.47L0.56 -0.46L0.56 -0.45L0.56 -0.44L0.56 -0.43L0.55 -0.42L0.54 -0.39L0.51 -0.34L0.46 -0.26L0.43 -0.19L0.41 -0.15L0.43 -0.16L0.48 -0.19L0.53 -0.24L0.57 -0.28L0.60 -0.31L0.63 -0.33L0.66 -0.35L0.69 -0.37L0.73 -0.39L0.77 -0.41L0.80 -0.42L0.82 -0.42L0.81 -0.41L0.80 -0.39L0.77 -0.36L0.75 -0.33L0.74 -0.28L0.71 -0.23L0.70 -0.18L0.69 -0.14L0.68 -0.11L0.69 -0.08L0.69 -0.07L0.70 -0.05L0.72 -0.04L0.74 -0.03L0.76 -0.03L0.79 -0.03L0.82 -0.04L0.85 -0.05L0.88 -0.07L0.92 -0.10L0.95 -0.14L0.99 -0.18L1.03 -0.23L1.05 -0.26","M1.80 -0.26L1.79 -0.25L1.78 -0.23L1.77 -0.21L1.75 -0.19L1.73 -0.17L1.72 -0.15L1.70 -0.13L1.68 -0.11L1.65 -0.09L1.62 -0.08L1.60 -0.06L1.57 -0.04L1.55 -0.04L1.52 -0.03L1.50 -0.02L1.48 -0.03L1.47 -0.04L1.46 -0.05L1.45 -0.07L1.44 -0.09L1.44 -0.11L1.45 -0.14L1.45 -0.17L1.46 -0.20L1.47 -0.25L1.49 -0.31L1.51 -0.36L1.52 -0.39L1.52 -0.40L1.52 -0.39L1.51 -0.37L1.49 -0.35L1.46 -0.32L1.43 -0.28L1.39 -0.24L1.35 -0.21L1.31 -0.17L1.27 -0.14L1.23 -0.11L1.20 -0.08L1.16 -0.06L1.13 -0.04L1.10 -0.03L1.07 -0.03L1.05 -0.03L1.03 -0.05L1.02 -0.07L1.01 -0.09L1.00 -0.12L1.00 -0.15L1.00 -0.19L1.02 -0.22L1.04 -0.26L1.07 -0.30L1.11 -0.34L1.15 -0.37L1.19 -0.40L1.23 -0.43L1.27 -0.45L1.31 -0.47L1.34 -0.49L1.37 -0.50L1.40 -0.50L1.43 -0.51L1.46 -0.51L1.49 -0.51L1.52 -0.51L1.54 -0.51L1.55 -0.50L1.56 -0.50L1.56 -0.49L1.56 -0.49","M2.06 -0.47L2.02 -0.38L1.97 -0.24L1.92 -0.11L1.91 -0.04L1.93 -0.05L1.99 -0.12L2.06 -0.20L2.11 -0.27L2.15 -0.31L2.18 -0.34L2.21 -0.37L2.23 -0.40L2.26 -0.42L2.28 -0.43L2.30 -0.44L2.33 -0.45L2.34 -0.46L2.36 -0.47L2.38 -0.48L2.39 -0.48L2.40 -0.48L2.41 -0.48L2.41 -0.47L2.41 -0.45L2.40 -0.41L2.37 -0.37L2.34 -0.32L2.32 -0.28L2.30 -0.24L2.29 -0.21L2.27 -0.17L2.26 -0.14L2.26 -0.12L2.26 -0.10L2.26 -0.08L2.27 -0.07L2.27 -0.05L2.29 -0.04L2.30 -0.03L2.32 -0.02L2.33 -0.02L2.36 -0.02L2.38 -0.03L2.40 -0.04L2.42 -0.05L2.45 -0.06L2.47 -0.08L2.49 -0.10L2.51 -0.12L2.54 -0.14L2.56 -0.17L2.58 -0.19L2.60 -0.21L2.61 -0.23L2.62 -0.25L2.63 -0.26"]},"Maui":{"w":3.753,"d":["M-1.50 -0.77L-1.48 -0.77L-1.45 -0.79L-1.42 -0.80L-1.39 -0.81L-1.37 -0.83L-1.36 -0.84L-1.35 -0.85L-1.33 -0.86L-1.32 -0.88L-1.31 -0.89L-1.29 -0.91L-1.28 -0.92L-1.27 -0.94L-1.26 -0.96L-1.25 -0.98L-1.24 -0.99L-1.23 -1.00L-1.22 -1.01L-1.21 -1.02L-1.21 -1.00L-1.22 -0.96L-1.25 -0.90L-1.27 -0.83L-1.30 -0.76L-1.33 -0.68L-1.36 -0.60L-1.38 -0.52L-1.41 -0.45L-1.44 -0.38L-1.47 -0.32L-1.50 -0.27L-1.53 -0.21L-1.56 -0.16L-1.59 -0.11L-1.61 -0.06L-1.64 -0.03L-1.66 0.00L-1.69 0.03L-1.71 0.04L-1.73 0.06L-1.76 0.07L-1.78 0.08L-1.80 0.09L-1.82 0.09L-1.84 0.08L-1.86 0.06L-1.87 0.04L-1.88 0.02L-1.88 0.00L-1.88 -0.01L-1.87 -0.04L-1.85 -0.07L-1.82 -0.11L-1.78 -0.16L-1.74 -0.21L-1.69 -0.27L-1.64 -0.32L-1.58 -0.38L-1.53 -0.45L-1.47 -0.51L-1.40 -0.58L-1.32 -0.65L-1.25 -0.72L-1.18 -0.77L-1.13 -0.81L-1.09 -0.84L-1.05 -0.86L-1.01 -0.88L-0.98 -0.89L-0.95 -0.90L-0.92 -0.90L-0.90 -0.90L-0.87 -0.90L-0.84 -0.89L-0.81 -0.88L-0.79 -0.86L-0.77 -0.84L-0.76 -0.81L-0.75 -0.78L-0.74 -0.73L-0.74 -0.67L-0.75 -0.59L-0.76 -0.52L-0.77 -0.45L-0.77 -0.40L-0.78 -0.35L-0.78 -0.31L-0.79 -0.27L-0.81 -0.22L-0.82 -0.18L-0.83 -0.14L-0.84 -0.11L-0.84 -0.09L-0.83 -0.09L-0.82 -0.10L-0.81 -0.12L-0.79 -0.14L-0.77 -0.18L-0.74 -0.22L-0.70 -0.28L-0.65 -0.37L-0.58 -0.47L-0.51 -0.58L-0.45 -0.66L-0.41 -0.72L-0.39 -0.76L-0.36 -0.79L-0.34 -0.81L-0.32 -0.84L-0.29 -0.86L-0.27 -0.88L-0.24 -0.89L-0.22 -0.89L-0.20 -0.89L-0.19 -0.88L-0.17 -0.88L-0.16 -0.87L-0.15 -0.86L-0.15 -0.85L-0.14 -0.84L-0.14 -0.83L-0.13 -0.81L-0.13 -0.79L-0.13 -0.77L-0.13 -0.74L-0.15 -0.69L-0.16 -0.65L-0.18 -0.61L-0.19 -0.58L-0.21 -0.55L-0.22 -0.53L-0.23 -0.50L-0.25 -0.47L-0.27 -0.43L-0.28 -0.40L-0.30 -0.36L-0.31 -0.34L-0.32 -0.31L-0.32 -0.28L-0.33 -0.26L-0.33 -0.23L-0.33 -0.20L-0.33 -0.17L-0.33 -0.14L-0.32 -0.11L-0.31 -0.08L-0.30 -0.05L-0.27 -0.03L-0.25 -0.03L-0.21 -0.03L-0.17 -0.04L-0.14 -0.05L-0.10 -0.08L-0.06 -0.12L-0.02 -0.15L0.01 -0.18L0.03 -0.21L0.05 -0.23L0.06 -0.25L0.06 -0.26","M0.82 -0.26L0.81 -0.25L0.79 -0.23L0.78 -0.21L0.76 -0.19L0.74 -0.17L0.73 -0.15L0.71 -0.13L0.69 -0.11L0.66 -0.09L0.64 -0.08L0.61 -0.06L0.58 -0.04L0.56 -0.04L0.53 -0.03L0.51 -0.02L0.50 -0.03L0.48 -0.04L0.47 -0.05L0.46 -0.07L0.46 -0.09L0.45 -0.11L0.46 -0.14L0.46 -0.17L0.47 -0.20L0.49 -0.25L0.50 -0.31L0.52 -0.36L0.53 -0.39L0.53 -0.40L0.53 -0.39L0.52 -0.37L0.50 -0.35L0.48 -0.32L0.44 -0.28L0.40 -0.24L0.36 -0.21L0.32 -0.17L0.28 -0.14L0.24 -0.11L0.21 -0.08L0.17 -0.06L0.14 -0.04L0.11 -0.03L0.08 -0.03L0.06 -0.03L0.04 -0.05L0.03 -0.07L0.02 -0.09L0.01 -0.12L0.01 -0.15L0.01 -0.19L0.03 -0.22L0.05 -0.26L0.08 -0.30L0.12 -0.34L0.16 -0.37L0.20 -0.40L0.24 -0.43L0.28 -0.45L0.32 -0.47L0.35 -0.49L0.38 -0.50L0.41 -0.50L0.44 -0.51L0.47 -0.51L0.50 -0.51L0.53 -0.51L0.55 -0.51L0.57 -0.50L0.57 -0.50L0.57 -0.49L0.57 -0.49","M0.93 -0.44L0.91 -0.42L0.88 -0.38L0.86 -0.35L0.83 -0.31L0.82 -0.28L0.80 -0.24L0.79 -0.21L0.78 -0.18L0.78 -0.15L0.77 -0.12L0.77 -0.10L0.78 -0.08L0.79 -0.07L0.80 -0.05L0.82 -0.04L0.85 -0.04L0.87 -0.04L0.91 -0.05L0.94 -0.06L0.97 -0.08L1.00 -0.10L1.02 -0.13L1.04 -0.16L1.07 -0.20L1.09 -0.23L1.13 -0.27L1.16 -0.30L1.18 -0.34L1.21 -0.38L1.24 -0.43L1.26 -0.48L1.28 -0.50L1.30 -0.52L1.32 -0.52L1.33 -0.51L1.32 -0.49L1.29 -0.44L1.25 -0.37L1.20 -0.29L1.17 -0.23L1.15 -0.20L1.15 -0.17L1.15 -0.16L1.15 -0.14L1.15 -0.12L1.14 -0.10L1.14 -0.09L1.15 -0.08L1.16 -0.06L1.18 -0.05L1.20 -0.04L1.22 -0.03L1.25 -0.03L1.27 -0.04L1.29 -0.04L1.32 -0.06L1.35 -0.08L1.39 -0.11L1.42 -0.14L1.45 -0.17L1.47 -0.20L1.49 -0.22L1.50 -0.24L1.52 -0.26L1.55 -0.28L1.57 -0.30L1.60 -0.31L1.62 -0.34L1.64 -0.38L1.65 -0.43L1.66 -0.47L1.65 -0.47L1.63 -0.41L1.58 -0.31L1.54 -0.20L1.51 -0.12L1.51 -0.08L1.51 -0.06L1.52 -0.04L1.54 -0.03L1.56 -0.02L1.59 -0.01L1.61 -0.01L1.64 -0.01L1.67 -0.02L1.70 -0.05L1.73 -0.07L1.76 -0.10L1.78 -0.12L1.80 -0.14L1.81 -0.16L1.83 -0.18L1.84 -0.21L1.86 -0.23L1.87 -0.25L1.88 -0.26","M1.74 -0.68L1.70 -0.63"]}};
  var NAME_CAP = 32;     // cap height in dog units (about a third of a dog)
  var NAME_ROOM = 44;    // extra band below the ground, in dog units
  // [name, track index, write start (s), x offset under the dog in dog units]
  var NAME_PLAN = [["Norman", 0, 3.86, 8], ["Maui", 1, 4.06, -8]];
  var WRITE = 0.6;

  // ---------- the scene ----------
  function clone(o, extra) { var c = {}, k; for (k in o) c[k] = o[k]; for (k in extra) c[k] = extra[k]; return c; }
  var DUCK = clone(STAND, { y: 54, pitch: -4, head: [60, 18, -26], ear: 6 }); // ducks as the other dog sails over
  var offCache = new Map();
  function off(pose) {
    if (pose.pitch !== undefined && pose.__dyn) return groundOffset(pose);
    if (!offCache.has(pose)) offCache.set(pose, groundOffset(pose));
    return offCache.get(pose);
  }
  var STRIDE = 150; // units travelled per 4-frame gallop cycle

  /* Choreography in seconds and scene units. xa: where the first dog stops. */
  function tracks(vw) {
    var xa = Math.max(110, Math.min(vw * 0.4, vw - 480)), out = vw + 220;
    var gap = Math.max(180, Math.min(300, vw - xa - 80)); // room for both bows on a phone
    return [
      { scale: 1, segs: [
        { t0: 0, t1: 0.25, mode: "hidden" },
        { t0: 0.25, t1: 2.05, x0: -170, x1: xa, mode: "gallop", ease: "out" },
        { t0: 2.05, t1: 2.55, x0: xa, x1: xa, mode: "stand" },
        { t0: 2.55, t1: 3.35, x0: xa, x1: xa, mode: "look" },
        { t0: 3.35, t1: 3.8, x0: xa, x1: xa, mode: "stand" },
        { t0: 3.8, t1: 5.0, x0: xa, x1: xa, mode: "bow" },
        { t0: 5.0, t1: 5.3, x0: xa, x1: xa, mode: "stand" },
        { t0: 5.3, t1: 6.9, x0: xa, x1: out, mode: "gallop", ease: "in" }
      ] },
      { scale: 0.9, segs: [
        { t0: 0, t1: 1.0, mode: "hidden" },
        { t0: 1.0, t1: 2.6, x0: -170, x1: xa - 200, mode: "gallop" },
        { t0: 2.6, t1: 3.3, x0: xa - 200, x1: xa + 230, mode: "leap", arc: 140 },
        { t0: 3.3, t1: 3.62, x0: xa + 230, x1: xa + gap, mode: "gallop", ease: "out" },
        { t0: 3.62, t1: 3.78, x0: xa + gap, x1: xa + gap, mode: "stand", face: -1 },
        { t0: 3.78, t1: 5.05, x0: xa + gap, x1: xa + gap, mode: "bow", face: -1 },
        { t0: 5.05, t1: 6.35, x0: xa + gap, x1: out, mode: "gallop", ease: "in" }
      ] }
    ];
  }
  var DURATION = 7.0;

  function ease(u, kind) {
    if (kind === "out") return 1 - Math.pow(1 - u, 1.7);
    if (kind === "in") return Math.pow(u, 1.5);
    return u;
  }

  /* Distance travelled at time t along the gallop segments, for foot-synced frames. */
  function sample(track, t) {
    var segs = track.segs, seg = segs[segs.length - 1], dist = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (t < s.t1 || i === segs.length - 1) { seg = s; break; }
      if (s.x0 !== undefined) dist += Math.abs(s.x1 - s.x0);
    }
    if (seg.mode === "hidden") return null;
    var u = Math.max(0, Math.min(1, (t - seg.t0) / (seg.t1 - seg.t0)));
    var e = ease(u, seg.ease), x = seg.x0 + (seg.x1 - seg.x0) * e;
    dist += Math.abs(x - seg.x0);
    var pose, lift = 0, tick = Math.floor(t * 12);
    if (seg.mode === "gallop") {
      var f = Math.floor((dist / STRIDE) * 4) % 4;
      pose = GALLOP[f];
      if (f === 0 || f === 2) lift = 7;
    } else if (seg.mode === "leap") {
      var h = seg.arc, dx = seg.x1 - seg.x0;
      lift = 4 * h * u * (1 - u);
      var slope = (4 * h * (1 - 2 * u)) / dx;
      pose = clone(LEAP, { pitch: Math.atan(slope) * (180 / Math.PI) * 0.75, __dyn: true });
    } else if (seg.mode === "bow") {
      pose = BOW[Math.floor(t * 5) % 2];
    } else if (seg.mode === "look") pose = DUCK;
    else pose = STAND;
    return { x: x, lift: lift, pose: pose, face: seg.face || 1, tick: tick };
  }

  function Scene(svg, opts) {
    this.svg = svg;
    this.opts = opts || {};
    this.t = 0;
    this.running = false;
    this.visible = true;
    this.groundStart = 0;
    svg.innerHTML = "";
    this.ground = document.createElementNS(NS, "path");
    this.ground.setAttribute("class", "ground");
    this.ground.setAttribute("pathLength", "1");
    svg.appendChild(this.ground);
    this.names = NAME_PLAN.map(function (plan) {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "name");
      svg.appendChild(g);
      var paths = NAMES[plan[0]].d.map(function () {
        var p = document.createElementNS(NS, "path");
        g.appendChild(p);
        return p;
      });
      return { g: g, plan: plan, paths: paths, lens: [], total: 0 };
    });
    this.dogs = [0, 1].map(function () {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "dog");
      svg.appendChild(g);
      return { g: g, key: "" };
    });
    this.layout();
  }

  Scene.prototype.layout = function () {
    var r = this.svg.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.s = this.H / (236 + NAME_ROOM); // dog units per px: band fits a dog, a leap, and the names
    this.vw = this.W / this.s;
    this.gy = this.H - 22 - NAME_ROOM * this.s;
    this.svg.setAttribute("viewBox", "0 0 " + this.W + " " + this.H);
    this.tracks = tracks(this.vw);
    // hand-drawn ground: a long, barely wavering stroke with a few gaps
    var x0 = this.groundStart, x1 = this.W - Math.min(40, this.W * 0.05), d = "", x = x0, y = this.gy;
    rng = mulberry(42);
    d = "M" + f1(x) + " " + f1(y);
    while (x < x1) {
      var nx = Math.min(x1, x + 60 + rng() * 80), ny = this.gy + (rng() - 0.5) * 1.6;
      d += "Q" + f1((x + nx) / 2) + " " + f1(this.gy + (rng() - 0.5) * 2.4) + " " + f1(nx) + " " + f1(ny);
      x = nx;
    }
    this.ground.setAttribute("d", d);
    this.layoutNames();
    if (!this.running) this.render(this.t);
  };

  /* Names are laid out around x = 0, a little below the ground; render()
     slides each one along under its dog, so it leaves the band with it. */
  Scene.prototype.layoutNames = function () {
    var self = this, cap = NAME_CAP * this.s, top = this.gy + 13 * this.s + cap;
    this.names.forEach(function (nm) {
      var cx = nm.plan[3] * self.tracks[nm.plan[1]].scale * self.s;
      var data = NAMES[nm.plan[0]];
      nm.total = 0;
      nm.paths.forEach(function (p, i) {
        p.setAttribute("d", data.d[i].replace(/(-?[\d.]+) (-?[\d.]+)/g, function (_, x, y) {
          return f1(cx + x * cap) + " " + f1(top + y * cap);
        }));
        var len = p.getTotalLength();
        nm.lens[i] = len;
        nm.total += len;
      });
      nm.g.style.strokeWidth = Math.max(1.1, Math.min(1.7, cap / 24)).toFixed(2);
    });
  };

  /* Write each name stroke by stroke as one continuous pen run; it then
     stays put under its dog. xs: each dog's x in scene units (null if hidden). */
  Scene.prototype.renderNames = function (t, xs) {
    var self = this;
    this.names.forEach(function (nm) {
      var x = xs[nm.plan[1]];
      var u = self.isStill ? 1 : Math.max(0, Math.min(1, (t - nm.plan[2]) / WRITE));
      if (x == null) u = 0;
      var show = u * nm.total;
      nm.g.style.opacity = u > 0 ? "1" : "0";
      if (u > 0) nm.g.setAttribute("transform", "translate(" + f1(x * self.s) + " 0)");
      for (var i = 0; i < nm.paths.length; i++) {
        var L = nm.lens[i], vis = Math.max(0, Math.min(L, show));
        show -= L;
        nm.paths[i].style.strokeDasharray = L + " " + (L + 10);
        nm.paths[i].style.strokeDashoffset = (L - vis).toFixed(2);
        nm.paths[i].style.visibility = vis > 0.3 ? "visible" : "hidden";
      }
    });
  };

  Scene.prototype.setGroundStart = function (x) { this.groundStart = x; this.layout(); };

  Scene.prototype.render = function (t) {
    var xs = [];
    for (var i = 0; i < 2; i++) {
      var dog = this.dogs[i], tr = this.tracks[i], st = sample(tr, t);
      xs[i] = st ? st.x : null;
      if (!st) { dog.g.style.display = "none"; dog.key = ""; continue; }
      dog.g.style.display = "";
      var sc = this.s * tr.scale;
      var y = this.gy - st.lift * sc;
      dog.g.setAttribute("transform", "translate(" + f1(st.x * this.s) + " " + f1(y) + ") scale(" + (st.face * sc).toFixed(3) + " " + sc.toFixed(3) + ") translate(0 " + f1(off(st.pose)) + ")");
      var key = (st.pose.__dyn ? "leap" + Math.round(st.pose.pitch) : st.pose === STAND ? "s" : JSON.stringify(st.pose.fn)) + ":" + (st.tick % 3);
      if (key !== dog.key) {
        draw(dog.g, st.pose, (st.tick % 3) + i * 5);
        dog.key = key;
      }
    }
    this.renderNames(t, xs);
  };

  Scene.prototype.play = function () {
    var self = this;
    this.t = 0;
    this.isStill = false;
    this.svg.classList.remove("drawn", "still");
    void this.svg.getBoundingClientRect();
    this.svg.classList.add("drawn"); // css draws the ground
    if (this.running) return;
    this.running = true;
    var last = null;
    function frame(now) {
      if (last === null) last = now;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (self.visible) self.t += dt;
      self.render(self.t);
      if (self.t < DURATION) self.raf = requestAnimationFrame(frame);
      else { self.running = false; if (self.opts.onDone) self.opts.onDone(); }
    }
    this.raf = requestAnimationFrame(frame);
  };

  /* Reduced motion: one still frame, both dogs mid play bow. */
  Scene.prototype.still = function () {
    this.svg.classList.add("drawn", "still");
    this.isStill = true;
    this.t = 4.4;
    this.render(4.4);
  };

  window.Labs = { POSES: POSES, draw: draw, groundOffset: groundOffset, NS: NS, Scene: Scene, DURATION: DURATION };
})();
