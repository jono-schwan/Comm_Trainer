/* ===================================================================
   AIC Picture Caller — engine (pure logic, no DOM)
   Ported from the Python trainer: air-to-air pictures, SEAD threats,
   and the 12-step CAS attack. Safe to unit-test under Node.
   =================================================================== */
"use strict";

/* ---- geometry (bullseye-centred; bearing measured from north) ---- */
var D2R = Math.PI / 180, R2D = 180 / Math.PI;
function polarToEn(brg, rng) { return [rng * Math.sin(brg * D2R), rng * Math.cos(brg * D2R)]; }
function enToPolar(e, n) { var b = Math.atan2(e, n) * R2D; if (b < 0) b += 360; return [b, Math.hypot(e, n)]; }
function unitFromBearing(b) { return [Math.sin(b * D2R), Math.cos(b * D2R)]; }

/* ---- random helpers ---- */
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function uniform(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pad3(n) { return String(((Math.round(n) % 360) + 360) % 360).padStart(3, "0"); }

/* ---- speech spelling ---- */
var DIGIT = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
              "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "niner" };
function sayDigits(s) { return String(s).split("").map(function (c) { return DIGIT[c] || c; }).join(" "); }
function spokenBearing(b) { return sayDigits(pad3(b)); }

var CARD8 = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
function cardinalWord(b) { return CARD8[Math.round((((b % 360) + 360) % 360) / 45) % 8]; }
var COUNT_WORD = { 1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX", 7: "SEVEN", 8: "EIGHT" };

/* =================================================================
   AIR-TO-AIR PICTURES
   ================================================================= */
var PIC_TYPES = ["SINGLE", "AZIMUTH", "RANGE", "WALL", "LADDER", "VIC", "CHAMPAGNE", "ECHELON"];

function generatePicture(opts) {
  opts = opts || {};
  var type = (opts.type && opts.type !== "Any") ? opts.type : choice(PIC_TYPES);
  var rMin = opts.rMin == null ? 30 : opts.rMin;
  var rMax = opts.rMax == null ? 50 : opts.rMax;

  var centerEn = polarToEn(uniform(0, 360), uniform(25, 55));
  var axisBrg = uniform(0, 360);
  var axis = unitFromBearing(axisBrg);
  var perp = [axis[1], -axis[0]];                 // 90° right of the axis (axisBrg + 90)
  var D = uniform(rMin, rMax);
  var fighterEn = [centerEn[0] - axis[0] * D, centerEn[1] - axis[1] * D];

  var splitL = Math.round(uniform(10, 28));        // lateral (azimuth) split
  var splitR = Math.round(uniform(10, 28));        // depth (range) split
  function place(depth, lat) {
    return [centerEn[0] + axis[0] * depth + perp[0] * lat,
            centerEn[1] + axis[1] * depth + perp[1] * lat];
  }
  var leftWord = cardinalWord(axisBrg - 90).toUpperCase();
  var rightWord = cardinalWord(axisBrg + 90).toUpperCase();

  function nWanted(def) {
    var lo = opts.nMin == null ? def : opts.nMin, hi = opts.nMax == null ? def : opts.nMax;
    lo = Math.max(1, Math.min(10, lo)); hi = Math.max(lo, Math.min(10, hi));
    return randInt(lo, hi);
  }

  var placed = [];
  if (type === "SINGLE") {
    placed = [{ pos: place(0, 0), label: "SINGLE GROUP" }];
  } else if (type === "AZIMUTH") {
    placed = [{ pos: place(0, -splitL / 2), label: leftWord + " GROUP" },
              { pos: place(0, splitL / 2), label: rightWord + " GROUP" }];
  } else if (type === "RANGE") {
    placed = [{ pos: place(-splitR / 2, 0), label: "LEAD GROUP" },
              { pos: place(splitR / 2, 0), label: "TRAIL GROUP" }];
  } else if (type === "WALL") {
    var nw = Math.max(3, Math.min(4, nWanted(3)));
    for (var i = 0; i < nw; i++) {
      var x = (i - (nw - 1) / 2) * splitL;
      var lbl = i === 0 ? leftWord + " GROUP" : (i === nw - 1 ? rightWord + " GROUP" : "MIDDLE GROUP");
      placed.push({ pos: place(0, x), label: lbl });
    }
    if (nw === 4) { placed[1].label = "SECOND GROUP"; placed[2].label = "THIRD GROUP"; }
  } else if (type === "LADDER") {
    var nl = Math.max(3, Math.min(4, nWanted(3)));
    var rows = [];
    for (var j = 0; j < nl; j++) rows.push({ d: (j - (nl - 1) / 2) * splitR });
    rows.sort(function (a, b) { return a.d - b.d; });      // nearest fighter (−depth) first
    placed = rows.map(function (r, k) {
      var lbl = k === 0 ? "LEAD GROUP" : (k === rows.length - 1 ? "TRAIL GROUP" : "MIDDLE GROUP");
      return { pos: place(r.d, 0), label: lbl };
    });
    if (nl === 4) { placed[1].label = "SECOND GROUP"; placed[2].label = "THIRD GROUP"; }
  } else if (type === "VIC") {
    placed = [{ pos: place(-splitR / 2, 0), label: "LEAD GROUP" },
              { pos: place(splitR / 2, -splitL / 2), label: leftWord + " TRAIL" },
              { pos: place(splitR / 2, splitL / 2), label: rightWord + " TRAIL" }];
  } else if (type === "CHAMPAGNE") {
    placed = [{ pos: place(-splitR / 2, -splitL / 2), label: leftWord + " LEAD" },
              { pos: place(-splitR / 2, splitL / 2), label: rightWord + " LEAD" },
              { pos: place(splitR / 2, 0), label: "TRAIL GROUP" }];
  } else if (type === "ECHELON") {
    for (var e = 0; e < 3; e++) {
      var s = (e - 1);
      placed.push({ pos: place(s * splitR, s * splitL), label: e === 0 ? "LEAD GROUP" : (e === 2 ? "TRAIL GROUP" : "MIDDLE GROUP") });
    }
  }

  var flowHot = !!opts.flowHot;
  var groups = placed.map(function (p) {
    var ge = p.pos[0], gn = p.pos[1];
    var losToFighter = enToPolar(fighterEn[0] - ge, fighterEn[1] - gn)[0];
    var heading = flowHot ? losToFighter : (((losToFighter + uniform(-70, 70)) % 360) + 360) % 360;
    var be = enToPolar(ge, gn);
    return { e: ge, n: gn, heading: heading, altK: randInt(8, 38),
             contacts: choice([1, 1, 1, 1, 2, 2, 3]), decl: "HOSTILE",
             label: p.label, beBrg: be[0], beRng: be[1] };
  });
  return { type: type, groups: groups, fighterEn: fighterEn, axisBrg: axisBrg, splitL: splitL, splitR: splitR };
}

function aspectOf(g, fighterEn) {
  var brgTtoF = enToPolar(fighterEn[0] - g.e, fighterEn[1] - g.n)[0];
  var diff = Math.abs((((g.heading - brgTtoF) % 360 + 540) % 360) - 180);
  return diff <= 30 ? "HOT" : diff <= 60 ? "FLANK" : diff <= 120 ? "BEAM" : "DRAG";
}

function pictureDesc(pic) {
  var word = COUNT_WORD[pic.groups.length] || String(pic.groups.length);
  switch (pic.type) {
    case "SINGLE": return { disp: "SINGLE GROUP", speech: "single group" };
    case "AZIMUTH": return { disp: "TWO GROUPS AZIMUTH " + pic.splitL, speech: "two groups azimuth " + sayDigits(pic.splitL) };
    case "RANGE": return { disp: "TWO GROUPS RANGE " + pic.splitR, speech: "two groups range " + sayDigits(pic.splitR) };
    case "WALL": return { disp: word + " GROUP WALL", speech: word.toLowerCase() + " group wall" };
    case "LADDER": return { disp: word + " GROUP LADDER", speech: word.toLowerCase() + " group ladder" };
    case "VIC": return { disp: "VIC", speech: "vic" };
    case "CHAMPAGNE": return { disp: "CHAMPAGNE", speech: "champagne" };
    case "ECHELON": var d = cardinalWord(pic.axisBrg + 90); return { disp: "ECHELON " + d.toUpperCase(), speech: "echelon " + d.toLowerCase() };
  }
  return { disp: pic.type, speech: pic.type.toLowerCase() };
}

function buildCall(pic, callsign, opts) {
  opts = opts || {};
  var inclAspect = opts.aspect !== false && !opts.flowHot;
  var pd = pictureDesc(pic);
  var cs = callsign ? callsign + ", " : "";
  var disp = [cs + "PICTURE, " + pd.disp + "."];
  var sp = [cs.toLowerCase() + "picture, " + pd.speech + "."];
  pic.groups.forEach(function (g) {
    var brg = pad3(g.beBrg), rng = Math.round(g.beRng), track = cardinalWord(g.heading);
    var asp = inclAspect ? aspectOf(g, pic.fighterEn) : null;
    disp.push("   " + g.label + ", BULLSEYE " + brg + "/" + rng + ", " + g.altK +
              " THOUSAND, TRACK " + track.toUpperCase() + (asp ? ", " + asp : "") + ", " + g.decl + ".");
    sp.push(g.label + ", bullseye " + spokenBearing(g.beBrg) + ", " + rng + ", " + g.altK +
            " thousand, track " + track.toLowerCase() + (asp ? ", " + asp.toLowerCase() : "") + ", " + g.decl.toLowerCase() + ".");
  });
  return { display: disp.join("\n"), speech: sp.join("  ") };
}

/* =================================================================
   SEAD SURFACE THREATS
   ================================================================= */
var SAM_RANGES = { "SA-2": 22, "SA-3": 15, "SA-6": 14, "SA-8": 6, "SA-10": 40, "SA-11": 18, "SA-15": 7, "SA-19": 5, "ZSU-23": 2 };
var SAM_LIST = Object.keys(SAM_RANGES);
var SEAD_STATUS = ["SEARCH", "SEARCH", "TRACK", "TRACK", "LAUNCH"];
var SEAD_VERB = { SEARCH: "MUD", TRACK: "SPIKE", LAUNCH: "SINGER" };
var SEAD_COLOR = { SEARCH: "#ffd23b", TRACK: "#ff9a3c", LAUNCH: "#ff4040" };

function saySam(t) {
  return t.split("-").map(function (p) { return /^[A-Za-z]+$/.test(p) ? p.split("").join(" ") : p; }).join(" ");
}
function generateSead(opts) {
  opts = opts || {};
  var rMin = opts.rMin == null ? 20 : opts.rMin, rMax = opts.rMax == null ? 60 : opts.rMax;
  var lo = Math.max(1, Math.min(10, opts.nMin == null ? 1 : opts.nMin));
  var hi = Math.max(lo, Math.min(10, opts.nMax == null ? 3 : opts.nMax));
  var n = randInt(lo, hi);
  var centerEn = polarToEn(uniform(0, 360), uniform(25, 55));
  var axisBrg = uniform(0, 360), axis = unitFromBearing(axisBrg), perp = [axis[1], -axis[0]];
  var D = uniform(rMin, rMax);
  var fighterEn = [centerEn[0] - axis[0] * D, centerEn[1] - axis[1] * D];
  var threats = [];
  for (var i = 0; i < n; i++) {
    var depth = uniform(-0.4, 0.4) * D, lat = uniform(-0.6, 0.6) * D;
    var ge = centerEn[0] + axis[0] * depth + perp[0] * lat;
    var gn = centerEn[1] + axis[1] * depth + perp[1] * lat;
    var sam = choice(SAM_LIST), status = choice(SEAD_STATUS), be = enToPolar(ge, gn);
    threats.push({ e: ge, n: gn, sam: sam, status: status, wez: SAM_RANGES[sam], beBrg: be[0], beRng: be[1] });
  }
  return { threats: threats, fighterEn: fighterEn, axisBrg: axisBrg };
}
function clockOf(fighterEn, hdg, e, n) {
  var los = enToPolar(e - fighterEn[0], n - fighterEn[1])[0];
  var rel = ((los - hdg) % 360 + 360) % 360, c = Math.round(rel / 30) % 12;
  return c === 0 ? 12 : c;
}
function buildSeadCall(sead, callsign, fighterHdg) {
  var n = sead.threats.length, lead = callsign ? callsign + ", " : "";
  var head = lead + n + " SURFACE THREAT" + (n !== 1 ? "S" : "");
  var disp = [head + ":"], sp = [head + "."];
  sead.threats.forEach(function (t) {
    var verb = SEAD_VERB[t.status], clk = clockOf(sead.fighterEn, fighterHdg, t.e, t.n);
    var def = t.status === "LAUNCH" ? " — DEFEND" : "";
    disp.push("   " + verb + " " + t.sam + ", BULLSEYE " + pad3(t.beBrg) + "/" + Math.round(t.beRng) + ", " + clk + " o'clock" + def + ".");
    sp.push(verb + " " + saySam(t.sam) + ", bullseye " + spokenBearing(t.beBrg) + ", " + Math.round(t.beRng) + ", " + clk + " o'clock" + (t.status === "LAUNCH" ? ", defend" : "") + ".");
  });
  return { display: disp.join("\n"), speech: sp.join("  ") };
}

/* =================================================================
   CAS — 9-line + 12-step attack
   ================================================================= */
var PHON = { A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliet", K: "Kilo", L: "Lima", M: "Mike",
  N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango",
  U: "Uniform", V: "Victor", W: "Whiskey", X: "Xray", Y: "Yankee", Z: "Zulu" };
var IP_NAMES = ["ALPHA", "BRAVO", "CADILLAC", "TEXACO", "STEELERS", "COWBOY", "DALLAS", "RAMROD", "VIPER", "ANVIL", "HAMMER", "RODEO"];
var TGT_DESC = ["2x T-72 tanks", "BMP-2 platoon in revetments", "troops in the open", "technical with ZU-23",
  "SA-15 TELAR", "towed artillery battery", "BTR-80 column", "mortar position", "command bunker",
  "ammo cache", "infantry in tree line", "SA-8 SAM site"];
var DIRW = { N: "north", S: "south", E: "east", W: "west", NE: "northeast", NW: "northwest", SE: "southeast", SW: "southwest" };

function sayDecimal(x) { var s = x.toFixed(1).split("."); return parseInt(s[0], 10) + " point " + s[1]; }
function fdistText(m) { return m >= 1000 ? (m / 1000).toFixed(1) + " km" : m + " m"; }
function fdistSpeech(m) { return m >= 1000 ? sayDecimal(m / 1000) + " kilometers" : m + " meters"; }
function sayGrid(grid) {
  var p = grid.split(" "), z = p[0];
  var zone = sayDigits(z.slice(0, -1)) + " " + (PHON[z.slice(-1).toUpperCase()] || z.slice(-1));
  var square = p[1].split("").map(function (c) { return PHON[c.toUpperCase()] || c; }).join(" ");
  return zone + ", " + square + ", " + sayDigits(p[2]) + ", " + sayDigits(p[3]);
}

function generateNineLine() {
  var ctype = choice([2, 2, 2, 3, 1]);
  var mark = choice(["laser", "laser", "WP smoke", "IR pointer", "IR strobe", "talk-on"]);
  var fdistM = choice([200, 300, 400, 500, 800, 1000, 1500, 2000]);
  var a = randInt(0, 9) * 30;
  var zone = randInt(30, 39) + choice(["S", "T", "U"]);
  var sq = choice("ABCDEFGHJKLMN".split("")) + choice("ABCDEFGHJKLMNPQRSTUV".split(""));
  var grid = zone + " " + sq + " " + String(randInt(0, 99999)).padStart(5, "0") + " " + String(randInt(0, 99999)).padStart(5, "0");
  return {
    ctype: ctype, ip: choice(IP_NAMES), heading: randInt(0, 359),
    offset: choice(["left", "right", null, null]),
    dist: Math.round(uniform(4, 14) * 10) / 10, elev: randInt(2, 60) * 100,
    desc: choice(TGT_DESC), grid: grid, mark: mark,
    code: mark === "laser" ? "1" + randInt(1, 7) + randInt(1, 8) + randInt(1, 8) : null,
    fdir: choice(Object.keys(DIRW)), fdistM: fdistM, dangerClose: fdistM <= 1000,
    egress: choice(["north", "south", "east", "west", "left to IP", "right to IP", "back to IP"]),
    fah: [a, (a + 60) % 360]
  };
}
function commaNum(n) { return n.toLocaleString("en-US"); }
function formatNineLine(d) {
  var off = d.offset ? "  (offset " + d.offset[0].toUpperCase() + ")" : "";
  var mark = d.mark + (d.code ? ", code " + d.code : "");
  var rem = ["FAH " + pad3(d.fah[0]) + "-" + pad3(d.fah[1])];
  if (d.mark === "laser") rem.push("laser-to-target " + pad3(d.heading));
  if (d.dangerClose) rem.push("DANGER CLOSE - commander's initials required");
  rem.push("cleared hot at my command");
  return [
    "TYPE " + d.ctype + " CONTROL",
    "1. IP / BP ........ IP " + d.ip,
    "2. Heading ........ " + pad3(d.heading) + off,
    "3. Distance ....... " + d.dist.toFixed(1) + " NM",
    "4. Elevation ...... " + commaNum(d.elev) + " ft MSL",
    "5. Description .... " + d.desc,
    "6. Location ....... " + d.grid,
    "7. Mark ........... " + mark,
    "8. Friendlies ..... " + d.fdir + " " + fdistText(d.fdistM),
    "9. Egress ......... " + d.egress,
    "Remarks: " + rem.join("; ") + "."
  ].join("\n");
}
function speakNineLine(d) {
  var off = d.offset ? ", offset " + d.offset : "";
  var mark = d.mark + (d.code ? ", code " + sayDigits(d.code) : "");
  var dc = d.dangerClose ? ", danger close, read back commander's initials" : "";
  return [
    "Type " + d.ctype + " control. Advise ready for nine line.",
    "Line 1, India Papa " + d.ip + ".",
    "Line 2, heading " + sayDigits(pad3(d.heading)) + off + ".",
    "Line 3, distance " + sayDecimal(d.dist) + ".",
    "Line 4, elevation " + d.elev + ".",
    "Line 5, " + d.desc + ".",
    "Line 6, grid " + sayGrid(d.grid) + ".",
    "Line 7, mark " + mark + ".",
    "Line 8, friendlies " + DIRW[d.fdir] + " " + fdistSpeech(d.fdistM) + ".",
    "Line 9, egress " + d.egress + ".",
    "Remarks, final attack heading " + sayDigits(pad3(d.fah[0])) + " to " + sayDigits(pad3(d.fah[1])) + dc + ". Cleared hot at my command."
  ].join("  ");
}

var FLIGHTS = ["Hawg", "Uzi", "Viper", "Hammer", "Colt", "Dude", "Raven", "Tusk"];
var JTAC_CS = ["Warhawk", "Dusty", "Talon", "Saber", "Sentry", "Ranger", "Gunfighter"];
var AC = ["F/A-18C Hornets", "F-35C Lightnings", "F-16C Vipers", "A-10C Warthogs"];
var ORD = ["2 GBU-12 and 500 rounds 20 millimeter", "4 GBU-38 and 2 AGM-65", "2 GBU-12 and 2 GBU-38", "gun and 2 GBU-12", "2 GBU-16 and gun"];
var THREATS = ["small arms and MANPADS", "ZU-23 anti-aircraft artillery", "reported SA-15 to the north", "no significant air defense", "MANPADS threat in the target area"];
var FEATURES = ["a road junction", "a tree line", "the edge of the village", "a dry riverbed", "a cluster of buildings", "a lone hilltop"];
var BDA = [["target destroyed", false], ["good effects, target destroyed", false], ["target damaged, re-attack required", true], ["two vehicles destroyed, one mobile, re-attack", true]];

function generateCasMission() {
  var m = generateNineLine();
  m.flt = choice(FLIGHTS) + " " + randInt(1, 5);
  m.jtac = choice(JTAC_CS);
  m.num = choice([2, 2, 2, 4]);
  m.ac = choice(AC);
  m.ord = choice(ORD);
  m.playtime = choice([20, 30, 45, 60]);
  m.sensor = choice(["targeting pod, laser capable", "sniper pod and PGMs", "FLIR, laser capable"]);
  m.threat = choice(THREATS);
  m.method = (m.mark === "laser" || Math.random() < 0.6) ? "bomb on target" : "bomb on coordinate";
  m.feature = choice(FEATURES);
  m.attackDir = choice(["north", "south", "east", "west"]);
  var b = choice(BDA); m.bda = b[0]; m.reattack = b[1];
  return m;
}
function buildCasSteps(m) {
  var flt = m.flt, jtac = m.jtac;
  var clr = (m.ctype === 1 || m.ctype === 2) ? "cleared hot" : "cleared to engage";
  var nlLines = formatNineLine(m).split("\n");
  var nineDisp = nlLines.filter(function (l) { return l.indexOf("Remarks") !== 0; }).join("\n");
  var remarksDisp = nlLines.filter(function (l) { return l.indexOf("Remarks") === 0; })[0] || "Remarks: none.";
  var sp = speakNineLine(m).split("  ");
  var nineSpeech = sp.filter(function (p) { return p.indexOf("Remarks") !== 0; }).join("  ");
  var remarksSpeech = sp.filter(function (p) { return p.indexOf("Remarks") === 0; })[0] || "Remarks, none.";
  var dc = m.dangerClose ? " Danger close, read back commander's initials." : "";
  var capture = m.mark === "laser" ? "captured" : "contact";

  var steps = [
    { n: 1, title: "CHECK-IN", who: "AIRCREW",
      call: jtac + ", " + flt + ", checking in as fragged. Flight of " + m.num + " " + m.ac + ", " + m.ord + ", " + m.playtime + " minutes playtime, " + m.sensor + ".",
      response: jtac + ": loud and clear. Ready to pass situation update." },
    { n: 2, title: "SITUATION UPDATE", who: "JTAC",
      call: flt + ", " + jtac + ", situation update. Friendlies " + DIRW[m.fdir] + " " + fdistText(m.fdistM) + " from the target. Threat: " + m.threat + ". Fires are clear, no airspace coordinating measures in effect. I am your clearance authority.",
      response: flt + ": copy situation update." },
    { n: 3, title: "GAME PLAN", who: "JTAC",
      call: flt + ", " + jtac + ", game plan: Type " + m.ctype + " control, " + m.method + ". How copy?",
      response: flt + ": copy game plan, ready to copy 9-line." },
    { n: 4, title: "9-LINE", who: "JTAC", call: nineDisp, speech: nineSpeech,
      response: flt + ": ready to copy — will read back lines 4 and 6." },
    { n: 5, title: "REMARKS & RESTRICTIONS", who: "JTAC", call: remarksDisp, speech: remarksSpeech,
      response: flt + ": copy remarks." },
    { n: 6, title: "READBACK (lines 4 & 6)", who: "AIRCREW",
      call: flt + " readback: line 4, " + commaNum(m.elev) + " feet; line 6, " + m.grid + "." + (m.dangerClose ? " Danger close, initials to follow." : ""),
      speech: flt + " readback. Line 4, " + m.elev + ". Line 6, grid " + sayGrid(m.grid) + "." + dc,
      response: jtac + ": good readback." },
    { n: 7, title: "TALK-ON / CORRELATION", who: "JTAC",
      call: flt + ", " + jtac + ", talk-on: from the IP look " + m.attackDir + " " + m.dist.toFixed(1) + " miles for " + m.desc + " near " + m.feature + ". Call " + capture + ".",
      response: flt + ": " + capture + " target." },
    { n: 8, title: "IP INBOUND / PUSH", who: "AIRCREW", call: flt + ", IP inbound.", response: jtac + ": continue." },
    { n: 9, title: "\"IN\" CALL", who: "AIRCREW",
      call: flt + ", IN " + m.attackDir + (m.mark === "laser" ? ", laser on." : "."),
      response: jtac + " checks attack geometry and friendlies, then passes clearance — or directs ABORT." },
    { n: 10, title: "CLEARANCE", who: "JTAC", call: flt + ", " + clr + ".",
      response: "Aircrew executes and calls OFF. If you hear \u201cABORT, ABORT, ABORT\u201d, cease the attack immediately." },
    { n: 11, title: "\"OFF\" CALL", who: "AIRCREW", call: flt + ", off " + m.attackDir + ".", response: jtac + ": copy off, stand by for BDA." },
    { n: 12, title: "BDA / END OF MISSION", who: "JTAC",
      call: flt + ", " + jtac + ", battle damage assessment: " + m.bda + "." + (m.reattack ? " Re-attack with the same 9-line." : " End of mission. " + jtac + " out."),
      response: m.reattack ? flt + ": re-attack inbound." : flt + ": copy end of mission, returning to base." }
  ];
  steps.forEach(function (s) { if (!s.speech) s.speech = s.call; });
  return steps;
}

/* ---- exports for Node unit-tests ---- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    polarToEn: polarToEn, enToPolar: enToPolar, PIC_TYPES: PIC_TYPES,
    generatePicture: generatePicture, buildCall: buildCall, aspectOf: aspectOf,
    SAM_RANGES: SAM_RANGES, SEAD_COLOR: SEAD_COLOR, SEAD_VERB: SEAD_VERB,
    generateSead: generateSead, buildSeadCall: buildSeadCall,
    generateNineLine: generateNineLine, formatNineLine: formatNineLine,
    generateCasMission: generateCasMission, buildCasSteps: buildCasSteps,
    cardinalWord: cardinalWord
  };
}
