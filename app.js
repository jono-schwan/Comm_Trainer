/* ===================================================================
   AIC Picture Caller — browser UI (DOM, HSI canvas, speech)
   Depends on engine.js (loaded first).
   =================================================================== */
"use strict";
var R2D = 180 / Math.PI;

/* ---- tiny DOM helpers ---- */
function $(id) { return document.getElementById(id); }
function val(id) { return $(id).value; }
function intv(id, d) { var v = parseInt($(id).value, 10); return isNaN(v) ? d : v; }
function chk(id) { return $(id).checked; }
function setStatus(s) { $("status").textContent = s; }
function setOut(id, s) { $(id).textContent = s; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ---- speech (Web Speech API) ---- */
var speechRate = 1.0;
function setRate(v) {
  speechRate = Math.max(0.5, Math.min(2, v));
  var s = speechRate.toFixed(1) + "\u00d7";
  if ($("rate")) $("rate").value = speechRate;
  if ($("casRate")) $("casRate").value = speechRate;
  if ($("rateVal")) $("rateVal").innerHTML = s;
  if ($("casRateVal")) $("casRateVal").innerHTML = s;
}
function speak(text, on) {
  if (!on) return;
  var synth = window.speechSynthesis;
  if (!synth) { setStatus("This browser has no speech synthesis — text still shown."); return; }
  String(text).split("  ").forEach(function (seg) {
    if (!seg.trim()) return;
    var u = new SpeechSynthesisUtterance(seg.trim());
    u.rate = speechRate; u.pitch = 1.0;
    synth.speak(u);
  });
}
function stopSpeak() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }

/* ===================================================================
   State + mode
   ================================================================= */
var mode = "A-A";
var state = { pic: null, sead: null, call: null, fighterEn: [0, 0], fighterHdg: 0,
              enemiesShown: false, proj: null, game: null };

function enemyWord() { return mode === "SEAD" ? "threats" : "enemies"; }
function modeLabel() { return mode === "SEAD" ? "SEAD threats" : "Picture"; }

function setMode(m) {
  mode = m;
  stopSpeak();
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.toggle("active", t.dataset.mode === m);
  });
  $("view-trainer").classList.toggle("hidden", m === "CAS");
  $("view-cas").classList.toggle("hidden", m !== "CAS");
  if (m !== "CAS") {
    var aa = (m === "A-A");
    $("typeRow").classList.toggle("hidden", !aa);
    $("aaToggles").classList.toggle("hidden", !aa);
    $("btnReveal").textContent = "Show " + enemyWord();
    state.pic = state.sead = state.call = null;
    state.enemiesShown = false; state.game = null;
    setOut("callOut", aa
      ? (chk("gameMode")
          ? "Game mode is on. Press “Random + Speak”, listen to the picture, then tap each contact on the scope to be scored."
          : "Press “Random + Speak”. The call is read aloud; reveal the scope to check.")
      : "Press “Random + Speak” to generate surface-to-air threats and hear the threat call (MUD / SPIKE / SINGER).");
    draw();
    setStatus(aa ? "Air-to-air intercept mode." : "SEAD (air-to-ground) mode.");
  } else {
    setStatus("CAS — press “New mission”.");
  }
}

/* ===================================================================
   HSI canvas
   ================================================================= */
var canvas = $("hsi");
var ctx = canvas.getContext("2d");

function sizeCanvas() {
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var L = Math.max(220, Math.round(rect.width));
  canvas.width = L * dpr; canvas.height = L * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return L;
}

function enemyItems() {
  var items = [];
  if (mode === "SEAD" && state.sead) {
    state.sead.threats.forEach(function (t) {
      items.push({ e: t.e, n: t.n, color: SEAD_COLOR[t.status], label: t.sam + " " + SEAD_VERB[t.status],
                   stalk: null, wez: t.wez });
    });
  } else if (state.pic) {
    state.pic.groups.forEach(function (g) {
      items.push({ e: g.e, n: g.n, color: "#ff5050", label: g.altK + "k", stalk: g.heading, wez: null });
    });
  }
  return items;
}
function enemyPositions() { return enemyItems().map(function (it) { return [it.e, it.n]; }); }

function draw() {
  var L = sizeCanvas();
  var cx = L / 2, cy = L / 2, R = cx - 24;
  ctx.clearRect(0, 0, L, L);

  var heading = chk("hdgUp") ? state.fighterHdg : 0;
  var fe = state.fighterEn;
  var items = enemyItems();

  // scale from fighter to bullseye + enemies
  var objs = [enToPolar(-fe[0], -fe[1])[1]];
  var plotted = items.map(function (it) {
    var p = enToPolar(it.e - fe[0], it.n - fe[1]);
    objs.push(p[1]);
    return { it: it, brg: p[0], rng: p[1] };
  });
  var maxr = Math.max.apply(null, objs.concat([5]));
  var scale = (R * 0.85) / maxr;
  function proj(brg, rng) {
    var a = (brg - heading) * Math.PI / 180, d = Math.min(scale * rng, R);
    return [cx + d * Math.sin(a), cy - d * Math.cos(a)];
  }
  state.proj = { cx: cx, cy: cy, scale: scale, heading: heading, fighterEn: fe };

  // range rings
  var ring = niceRing(maxr / 3);
  ctx.strokeStyle = "#27374f"; ctx.fillStyle = "#6f83a6";
  ctx.font = "11px ui-monospace,Menlo,Consolas,monospace"; ctx.lineWidth = 1;
  for (var k = 1; ring * k * scale <= R + 0.5 && k <= 10; k++) {
    var rr = ring * k * scale;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillText(String(Math.round(ring * k)), cx + 3, cy + rr - 2);
  }

  // compass ring + bearing labels
  ctx.strokeStyle = "#7f93b5"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = "#7f93b5";
  for (var v = 0; v < 360; v += 10) {
    var a = (v - heading) * Math.PI / 180, inner = R - (v % 30 === 0 ? 11 : 6);
    ctx.beginPath();
    ctx.moveTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
    ctx.lineTo(cx + inner * Math.sin(a), cy - inner * Math.cos(a));
    ctx.stroke();
  }
  ctx.fillStyle = "#cdd9ef"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 12px ui-monospace,Menlo,Consolas,monospace";
  for (var w = 0; w < 360; w += 30) {
    var aa2 = (w - heading) * Math.PI / 180;
    ctx.fillText(String(w / 10).padStart(2, "0"),
      cx + (R - 18) * Math.sin(aa2), cy - (R - 18) * Math.cos(aa2));
  }

  // lubber + heading box
  ctx.fillStyle = "#ffd23b";
  tri(cx - 6, cy - R + 13, cx + 6, cy - R + 13, cx, cy - R + 2);
  ctx.strokeStyle = "#ffd23b"; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 18, cy - R - 16, 36, 16);
  ctx.fillStyle = "#ffd23b"; ctx.font = "bold 12px ui-monospace,monospace";
  var hd = Math.round(heading) % 360; if (hd === 0) hd = 360;
  ctx.fillText(String(hd).padStart(3, "0"), cx, cy - R - 8);

  // bullseye
  var b = proj(enToPolar(-fe[0], -fe[1])[0], enToPolar(-fe[0], -fe[1])[1]);
  ctx.fillStyle = "#2d6cdf"; ctx.strokeStyle = "#bcd2ff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b[0], b[1], 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#eaf1ff"; ctx.beginPath(); ctx.arc(b[0], b[1], 2, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = "#bcd2ff"; ctx.font = "9px monospace"; ctx.fillText("BULL", b[0], b[1] - 14);

  // ownship chevron
  ctx.strokeStyle = "#37d2da"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx - 9, cy + 10);
  ctx.lineTo(cx, cy + 4); ctx.lineTo(cx + 9, cy + 10); ctx.closePath(); ctx.stroke();

  // enemies / threats
  if (state.enemiesShown) {
    plotted.forEach(function (pp) {
      var s = proj(pp.brg, pp.rng), sx = s[0], sy = s[1], it = pp.it, sz = 8;
      if (it.wez) {
        ctx.strokeStyle = it.color; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(sx, sy, it.wez * scale, 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (it.stalk != null) {
        var sa = (it.stalk - heading) * Math.PI / 180;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 20 * Math.sin(sa), sy - 20 * Math.cos(sa)); ctx.stroke();
      }
      ctx.fillStyle = it.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.fillRect(sx - sz, sy - sz, sz * 2, sz * 2);
      ctx.strokeRect(sx - sz, sy - sz, sz * 2, sz * 2);
      ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "11px ui-monospace,monospace";
      ctx.fillText(it.label, sx + sz + 3, sy);
      ctx.textAlign = "center";
    });
  } else {
    ctx.fillStyle = "#5d6f8f"; ctx.font = "12px ui-monospace,monospace";
    var msg = "hidden — press Show " + enemyWord();
    if (state.game && !state.game.revealed) {
      var noun = mode === "SEAD" ? "threat" : "group";
      msg = "GAME: tap each " + noun + " (" + state.game.clicks.length + "/" + state.game.n + ")";
    }
    ctx.fillText(msg, cx, cy + R - 8);
  }

  // game clicks + error lines
  if (state.game) {
    state.game.clicks.forEach(function (ge, i) {
      var p = enToPolar(ge[0] - fe[0], ge[1] - fe[1]); var s = proj(p[0], p[1]);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s[0] - 6, s[1] - 6); ctx.lineTo(s[0] + 6, s[1] + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s[0] - 6, s[1] + 6); ctx.lineTo(s[0] + 6, s[1] - 6); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = "bold 11px monospace";
      ctx.fillText(String(i + 1), s[0] + 8, s[1] - 8); ctx.textAlign = "center";
      if (state.game.revealed) {
        var pos = enemyPositions();
        if (pos.length) {
          var tgt = pos.reduce(function (a, c) {
            return Math.hypot(ge[0] - c[0], ge[1] - c[1]) < Math.hypot(ge[0] - a[0], ge[1] - a[1]) ? c : a;
          });
          var tp = enToPolar(tgt[0] - fe[0], tgt[1] - fe[1]); var ts = proj(tp[0], tp[1]);
          ctx.strokeStyle = "#ffd23b"; ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(ts[0], ts[1]); ctx.stroke();
          ctx.setLineDash([]);
          var d = Math.hypot(ge[0] - tgt[0], ge[1] - tgt[1]);
          ctx.fillStyle = "#ffd23b"; ctx.font = "bold 11px monospace";
          ctx.fillText(d.toFixed(0), (s[0] + ts[0]) / 2, (s[1] + ts[1]) / 2 - 7);
        }
      }
    });
  }
}
function tri(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
}
function niceRing(x) {
  if (x <= 0) return 5;
  var steps = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  for (var i = 0; i < steps.length; i++) if (steps[i] >= x) return steps[i];
  return 100;
}

/* ===================================================================
   Trainer actions
   ================================================================= */
function doRandom() {
  stopSpeak();
  if (mode === "A-A") {
    state.pic = generatePicture({ type: val("ptype"), nMin: intv("nMin", 1), nMax: intv("nMax", 3),
      rMin: intv("rMin", 30), rMax: intv("rMax", 50), aspect: chk("aspect"), flowHot: chk("flowHot") });
    state.sead = null;
    state.fighterEn = state.pic.fighterEn; state.fighterHdg = state.pic.axisBrg;
    state.call = buildCall(state.pic, val("callsign"), { aspect: chk("aspect"), flowHot: chk("flowHot") });
  } else {
    state.sead = generateSead({ nMin: intv("nMin", 1), nMax: intv("nMax", 3),
      rMin: intv("rMin", 20), rMax: intv("rMax", 60) });
    state.pic = null;
    state.fighterEn = state.sead.fighterEn; state.fighterHdg = state.sead.axisBrg;
    state.call = buildSeadCall(state.sead, val("callsign"), state.fighterHdg);
  }

  if (chk("gameMode")) {
    state.game = { clicks: [], n: enemyPositions().length, revealed: false };
    state.enemiesShown = false;
    setOut("callOut", "GAME MODE\nListen to the call, then tap each contact on the scope.\n(0/" + state.game.n + ")");
    $("btnReveal").textContent = "Show " + enemyWord();
    draw();
    speak(state.call.speech, chk("voice"));
    setStatus("Game: tap contact 1 of " + state.game.n);
  } else {
    state.game = null;
    state.enemiesShown = true;
    $("btnReveal").textContent = "Hide " + enemyWord();
    setOut("callOut", state.call.display + "\n\n— spoken as —\n" + state.call.speech);
    draw();
    speak(state.call.speech, chk("voice"));
    setStatus(modeLabel() + (chk("voice") ? " — speaking…" : " — text shown."));
  }
}
function toggleReveal() {
  if (!state.pic && !state.sead) return;
  if (state.game && !state.game.revealed) { scoreGame(); return; }
  state.enemiesShown = !state.enemiesShown;
  $("btnReveal").textContent = (state.enemiesShown ? "Hide " : "Show ") + enemyWord();
  draw();
}
function onScopeTap(ev) {
  if (!state.proj || !state.game || state.game.revealed) return;
  if (state.game.clicks.length >= state.game.n) return;
  ev.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var pt = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
  var mx = pt.clientX - rect.left, my = pt.clientY - rect.top;
  var p = state.proj, dx = mx - p.cx, dy = my - p.cy;
  var rng = Math.hypot(dx, dy) / p.scale;
  var brg = (p.heading + Math.atan2(dx, -dy) * R2D) % 360; if (brg < 0) brg += 360;
  var en = polarToEn(brg, rng);
  state.game.clicks.push([p.fighterEn[0] + en[0], p.fighterEn[1] + en[1]]);
  setOut("callOut", "GAME MODE\nKeep tapping each contact.\n(" + state.game.clicks.length + "/" + state.game.n + ")");
  draw();
  setStatus("Game: placed " + state.game.clicks.length + " of " + state.game.n);
  if (state.game.clicks.length === state.game.n) scoreGame();
}
function scoreGame() {
  if (!state.game) return;
  var pos = enemyPositions(), total = 0;
  state.game.clicks.forEach(function (ge) {
    var best = Infinity;
    pos.forEach(function (c) { best = Math.min(best, Math.hypot(ge[0] - c[0], ge[1] - c[1])); });
    total += best;
  });
  var avg = state.game.clicks.length ? total / state.game.clicks.length : 0;
  state.game.revealed = true;
  state.enemiesShown = true;
  $("btnReveal").textContent = "Hide " + enemyWord();
  draw();
  setOut("callOut", state.call.display + "\n\nGAME RESULT — average miss " + avg.toFixed(0) + " nm");
  setStatus("Average miss " + avg.toFixed(0) + " nm — press Random for another.");
}

/* ===================================================================
   CAS stepper
   ================================================================= */
var cas = { m: null, steps: [], idx: -1, html: "" };
function casStepHtml(step) {
  var who = step.who, cs = who === "AIRCREW" ? cas.m.flt : cas.m.jtac;
  var cls = who === "AIRCREW" ? "aircrew" : "jtac";
  return '<span class="hdr">\u2500\u2500 STEP ' + step.n + '/12 \u00b7 ' + esc(step.title) + ' \u2500\u2500</span>\n'
    + '<span class="' + cls + '">' + esc(who) + " (" + esc(cs) + "):\n   " + esc(step.call) + "</span>\n\n"
    + '<span class="lab">Expected response:</span>\n   ' + esc(step.response) + "\n\n";
}
function casRender() { $("casOut").innerHTML = cas.html || ""; $("casOut").scrollTop = $("casOut").scrollHeight; }
function casNew() {
  stopSpeak();
  cas.m = generateCasMission(); cas.steps = buildCasSteps(cas.m); cas.idx = -1;
  $("casStep").textContent = cas.m.flt + "  vs  " + cas.m.jtac + "  ·  Type " + cas.m.ctype + " control";
  cas.html = '<span class="lab">Flight ' + esc(cas.m.flt) + "  ·  JTAC " + esc(cas.m.jtac)
    + "  ·  Type " + cas.m.ctype + " control</span>\n\nPress “Next step ▶” to begin.\n";
  casRender();
  setStatus("New mission loaded — 12 steps.");
}
function casNext() {
  if (!cas.steps.length) { casNew(); return; }
  if (cas.idx >= cas.steps.length - 1) { setStatus("End of mission — press New mission."); return; }
  if (cas.idx === -1) cas.html = "";
  cas.idx++;
  var st = cas.steps[cas.idx];
  cas.html += casStepHtml(st);
  casRender();
  speak(st.speech, chk("casVoice"));
  $("casStep").textContent = "Step " + (cas.idx + 1) + "/12 · " + st.title;
  setStatus("Step " + (cas.idx + 1) + "/12 — " + st.who + " transmits.");
}
function casPrev() {
  if (cas.idx <= 0) return;
  cas.idx--;
  cas.html = "";
  for (var k = 0; k <= cas.idx; k++) cas.html += casStepHtml(cas.steps[k]);
  casRender();
  $("casStep").textContent = "Step " + (cas.idx + 1) + "/12 · " + cas.steps[cas.idx].title;
}
function casRepeat() { if (cas.idx >= 0 && cas.idx < cas.steps.length) speak(cas.steps[cas.idx].speech, chk("casVoice")); }
function casRevealAll() {
  if (!cas.steps.length) return;
  cas.idx = cas.steps.length - 1; cas.html = "";
  cas.steps.forEach(function (s) { cas.html += casStepHtml(s); });
  casRender();
  $("casStep").textContent = "All 12 steps revealed";
  setStatus("Revealed all steps — press New mission for another.");
}

/* ===================================================================
   Wiring
   ================================================================= */
document.querySelectorAll(".tab").forEach(function (t) {
  t.addEventListener("click", function () { setMode(t.dataset.mode); });
});
$("btnRandom").addEventListener("click", doRandom);
$("btnRepeat").addEventListener("click", function () { if (state.call) speak(state.call.speech, chk("voice")); });
$("btnStop").addEventListener("click", stopSpeak);
$("btnReveal").addEventListener("click", toggleReveal);
$("hdgUp").addEventListener("change", draw);
$("gameMode").addEventListener("change", function () {
  setStatus(chk("gameMode") ? "Game mode on — press Random + Speak to start." : "Game mode off.");
});
canvas.addEventListener("click", onScopeTap);
canvas.addEventListener("touchstart", onScopeTap, { passive: false });

$("casNew").addEventListener("click", casNew);
$("casNext").addEventListener("click", casNext);
$("casPrev").addEventListener("click", casPrev);
$("casRepeat").addEventListener("click", casRepeat);
$("casReveal").addEventListener("click", casRevealAll);
$("casStop").addEventListener("click", stopSpeak);

$("rate").addEventListener("input", function (e) { setRate(parseFloat(e.target.value)); });
$("casRate").addEventListener("input", function (e) { setRate(parseFloat(e.target.value)); });
setRate(1.0);

window.addEventListener("resize", function () { if (mode !== "CAS") draw(); });
$("srcLink").addEventListener("click", function (e) {
  if ($("srcLink").getAttribute("href") === "#") { e.preventDefault();
    setStatus("Set the View-source link to your repo URL in index.html."); }
});

setMode("A-A");
draw();
