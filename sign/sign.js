/* Signature capture: records pointer strokes {x, y, t, p} over a photo
   underlay and exports assets/signature.js for the homepage. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), live = $("live"), under = $("under"), status = $("status");
  var strokes = [], current = null, t0 = null, pointerId = null;
  var sig = null; // last normalized result

  function size() {
    var r = stage.getBoundingClientRect();
    live.setAttribute("viewBox", "0 0 " + r.width + " " + r.height);
    return r;
  }

  // --- photo underlay, local only ---
  $("photo").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    under.onload = function () {
      stage.style.aspectRatio = under.naturalWidth + " / " + under.naturalHeight;
      size(); redraw();
    };
    under.src = url;
    under.hidden = !$("show").checked;
  });
  $("show").addEventListener("change", function () { under.hidden = !this.checked || !under.src; });
  $("opacity").addEventListener("input", function () { under.style.opacity = this.value; });

  // --- capture ---
  function point(e, base) {
    var r = stage.getBoundingClientRect();
    if (t0 === null) t0 = base.timeStamp;
    return {
      x: Math.round((e.clientX - r.left) * 10) / 10,
      y: Math.round((e.clientY - r.top) * 10) / 10,
      t: Math.round(e.timeStamp - t0),
      p: Math.round((e.pressure || 0.5) * 100) / 100
    };
  }
  function pathFor(i) {
    var p = live.children[i];
    if (!p) { p = document.createElementNS(NS, "path"); live.appendChild(p); }
    return p;
  }
  function drawStroke(i) {
    var s = strokes[i];
    pathFor(i).setAttribute("d", Ink.outline(s, Ink.widths(s, 3.2)));
  }
  function redraw() {
    while (live.children.length > strokes.length) live.removeChild(live.lastChild);
    for (var i = 0; i < strokes.length; i++) drawStroke(i);
    var n = strokes.reduce(function (a, s) { return a + s.length; }, 0);
    var last = strokes.length ? strokes[strokes.length - 1] : null;
    status.textContent = strokes.length
      ? strokes.length + " stroke" + (strokes.length > 1 ? "s" : "") + ", " + n + " points, " + (last[last.length - 1].t - strokes[0][0].t) + " ms"
      : "No strokes yet.";
  }

  stage.addEventListener("pointerdown", function (e) {
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    stage.setPointerCapture(e.pointerId);
    size();
    current = [point(e, e)];
    strokes.push(current);
    sig = null;
    drawStroke(strokes.length - 1);
  });
  stage.addEventListener("pointermove", function (e) {
    if (e.pointerId !== pointerId || !current) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!evs.length) evs = [e];
    for (var i = 0; i < evs.length; i++) {
      var p = point(evs[i], e), q = current[current.length - 1];
      if (p.x !== q.x || p.y !== q.y) current.push(p);
    }
    drawStroke(strokes.length - 1);
  });
  function end(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    current = null;
    redraw();
  }
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  $("undo").addEventListener("click", function () { strokes.pop(); sig = null; redraw(); });
  $("clear").addEventListener("click", function () { strokes = []; t0 = null; sig = null; redraw(); });

  // --- normalize: crop to the ink, start the clock at 0, optionally squash long pauses ---
  function normalize() {
    if (!strokes.length) return null;
    var all = [].concat.apply([], strokes);
    var minX = Math.min.apply(null, all.map(function (p) { return p.x; }));
    var maxX = Math.max.apply(null, all.map(function (p) { return p.x; }));
    var minY = Math.min.apply(null, all.map(function (p) { return p.y; }));
    var maxY = Math.max.apply(null, all.map(function (p) { return p.y; }));
    var pad = 16, start = strokes[0][0].t, shift = 0, prevEnd = null;
    var squash = $("squash").checked;
    var out = strokes.map(function (s) {
      if (prevEnd !== null) {
        var gap = s[0].t - prevEnd;
        if (squash && gap > 600) shift += gap - 300;
      }
      prevEnd = s[s.length - 1].t;
      return s.map(function (p) {
        return { x: Math.round((p.x - minX + pad) * 10) / 10, y: Math.round((p.y - minY + pad) * 10) / 10, t: p.t - start - shift, p: p.p };
      });
    });
    return { width: Math.ceil(maxX - minX + pad * 2), height: Math.ceil(maxY - minY + pad * 2), strokes: out };
  }

  var player = null;
  function replay() {
    sig = sig || normalize();
    if (!sig) { status.textContent = "Trace something first."; return; }
    if (player) player.stop();
    player = new Ink.Player($("preview"), sig);
    player.play();
  }
  $("replay").addEventListener("click", replay);
  $("normalize").addEventListener("click", function () {
    sig = normalize();
    if (!sig) return;
    status.textContent = "Normalized: " + sig.width + " x " + sig.height + ", " + sig.strokes.length + " strokes, " + sig.strokes[sig.strokes.length - 1].slice(-1)[0].t + " ms";
    replay();
  });

  $("download").addEventListener("click", function () {
    sig = sig || normalize();
    if (!sig) { status.textContent = "Trace something first."; return; }
    var body = sig.strokes.map(function (s) {
      return "    [" + s.map(function (p) { return "{x:" + p.x + ",y:" + p.y + ",t:" + p.t + ",p:" + p.p + "}"; }).join(",") + "]";
    }).join(",\n");
    var js = "// Captured at /sign/. Format: strokes of {x, y, t ms, p pressure}.\n" +
      "window.SIGNATURE = {\n  width: " + sig.width + ",\n  height: " + sig.height + ",\n  strokes: [\n" + body + "\n  ]\n};\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
    a.download = "signature.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    status.textContent = "Downloaded. Replace assets/signature.js with it.";
  });

  window.addEventListener("resize", size);
  size();
})();
