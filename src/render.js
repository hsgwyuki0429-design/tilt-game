'use strict';
/*
 * TILT — a floating ice floe, drawn in real 3D.
 *
 * The engine remains a deterministic 2D grid and the single source of truth.
 * This file turns it into a WebGL scene (three.js, vendored as a plain script
 * in src/vendor/three.js): one thick slab of ice in the shape of the board's
 * floor, floating in a pool of water, lit by a sky, a sun and the auroras.
 *
 * There are no walls any more. A cell the engine calls a wall is open water:
 * the floe simply has no ice there. A penguin gliding towards it stops at the
 * edge of the ice exactly as it stops at the outer rim, so the rules are the
 * engine's, unchanged, and the picture finally says what they mean.
 *
 * World units are cells. Board x runs along world +X, board y along world +Z
 * (towards the camera), and height is world +Y with the ice surface at 0.
 * Swipes still map straight to the screen: the camera looks down the board
 * from the front, so rows stay level and columns stay upright.
 *
 * The ice and the water around it are src/ice.js's; which of the two graphics
 * tiers is drawn (and when to fall back from HIGH to LITE) is src/quality.js's
 * decision, carried out here.
 */
(function (root) {
  var E = root.TiltEngine;
  var T = root.THREE;
  var Ice = root.TiltIce;
  var Q = root.TiltQuality;

  // ── timing and motion (shared with the game clock) ──────────────────────
  var TICK = 54;
  var TAIL = 48;
  var SQUASH = 150;
  var AIM_SLIDE = .3;
  var MAX_CELL = 112;
  var MAX_PARTICLES = 3600;
  var VANISH = 420;
  var TILT_DEG = 5;

  // ── the floe ────────────────────────────────────────────────────────────
  var FREEBOARD = Ice.FREEBOARD;   // ice above the water line
  var DRAFT = Ice.DRAFT;           // total slab thickness; the rest is under water
  var BEVEL = Ice.BEVEL;
  var INSET = Ice.INSET;
  var CORNER = .2;            // rounding on the outside of a corner
  var NOTCH = .07;            // rounding inside a corner
  var PENGUIN = .74;

  var PALETTE = [
    { hi:'#84E4F0', mid:'#0B8DAE', lo:'#05637C', body:'#2fb0cf', shape:'circle' },
    { hi:'#FFD57A', mid:'#E39A1C', lo:'#8A5300', body:'#f2ae3c', shape:'triangle' },
    { hi:'#CAB8FF', mid:'#7A4AE8', lo:'#4A249B', body:'#9573e2', shape:'square' },
    { hi:'#8EE7CA', mid:'#0D9469', lo:'#06674A', body:'#2fbf8f', shape:'diamond' }
  ];
  function paletteOf(c) { return PALETTE[c] || PALETTE[0]; }

  var TEXTURE_FILES = {
    goalTop: 'assets/textures/faces/goal-top.png'
  };

  function easeOut(p) { return 1 - Math.pow(1 - p, 2.45); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* Deterministic grain: the same board always has the same ice. */
  function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
  function canvas(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function colourTexture(c, repeat) {
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  function dataTexture(c, repeat) {
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.NoColorSpace || '';
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }

  // ── shared procedural textures ──────────────────────────────────────────
  var SHARED = null;
  function shared() {
    if (SHARED) return SHARED;
    SHARED = {};
    // A soft round blob: contact shadows, frost puffs, glows.
    var c = canvas(128, 128), g = c.getContext('2d');
    var r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.45, 'rgba(255,255,255,.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    SHARED.blob = colourTexture(c);

    /* Contact shadow: dense in the middle of a square footprint. Built from
       stacked translucent rounded squares rather than a canvas blur filter,
       because Safari has no `ctx.filter` and would draw a hard-edged box. */
    c = canvas(128, 128); g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (var k = 0; k < 26; k++) {
      var ins = 12 + k * 1.5;
      g.beginPath(); g.roundRect(ins, ins, 128 - ins * 2, 128 - ins * 2, 30 - k * .5); g.fill();
    }
    SHARED.contact = colourTexture(c);

    // Water ripples: a tileable height field of crossing swells, as normals.
    var N = 256, hgt = new Float32Array(N * N), x, y, k;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var v = 0;
      for (k = 0; k < 6; k++) {
        var fx = 1 + Math.floor(hash(k * 3.1) * 4), fy = 1 + Math.floor(hash(k * 7.7) * 4);
        if (k % 2) fx = -fx;
        v += Math.sin((x * fx + y * fy) / N * Math.PI * 2 + hash(k) * 6.3) / (1 + k * .5);
      }
      hgt[y * N + x] = v;
    }
    c = canvas(N, N); g = c.getContext('2d');
    var img = g.createImageData(N, N);
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N];
      var dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      var nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      var o = (y * N + x) * 4;
      img.data[o] = (nx / len * .5 + .5) * 255; img.data[o + 1] = (ny / len * .5 + .5) * 255;
      img.data[o + 2] = (nz / len * .5 + .5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    SHARED.waterNormal = dataTexture(c, true);

    // The pool fades into the page: opaque in the middle, gone at the rim.
    c = canvas(256, 256); g = c.getContext('2d');
    r = g.createRadialGradient(128, 128, 40, 128, 128, 128);
    r.addColorStop(0, '#fff'); r.addColorStop(.62, '#fff'); r.addColorStop(1, '#000');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    SHARED.poolAlpha = dataTexture(c);


    // A ring for ripples.
    c = canvas(256, 256); g = c.getContext('2d');
    var rg = g.createRadialGradient(128, 128, 88, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(.38, 'rgba(255,255,255,.4)');
    rg.addColorStop(.6, 'rgba(255,255,255,1)'); rg.addColorStop(.82, 'rgba(255,255,255,.4)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    SHARED.ring = colourTexture(c);
    return SHARED;
  }

  // ── the floe's outline ──────────────────────────────────────────────────
  /*
   * The boundary of the floor cells as closed loops of grid corners. Every
   * cell contributes its edges clockwise (in board coordinates, y down) where
   * the neighbour is not ice; chaining them gives outer rims and holes with
   * opposite windings. Where two cells touch only at a corner the chain turns
   * back around its own cell, so the ice does not join through a point.
   */
  function floorLoops(stage) {
    var w = stage.w, h = stage.h;
    function ice(x, y) { return x >= 0 && y >= 0 && x < w && y < h && stage.terrain[y * w + x] !== E.WALL; }
    var out = {}, edges = [], x, y;
    function add(ax, ay, bx, by) {
      var e = { a: [ax, ay], b: [bx, by], used: false };
      edges.push(e);
      var k = ax + ',' + ay;
      (out[k] = out[k] || []).push(e);
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (!ice(x, y)) continue;
      if (!ice(x, y - 1)) add(x, y, x + 1, y);
      if (!ice(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!ice(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!ice(x - 1, y)) add(x, y + 1, x, y);
    }
    var loops = [];
    edges.forEach(function (first) {
      if (first.used) return;
      var loop = [], e = first;
      while (e && !e.used) {
        e.used = true; loop.push(e.a);
        var dIn = [e.b[0] - e.a[0], e.b[1] - e.a[1]], best = null, bestTurn = -2;
        (out[e.b[0] + ',' + e.b[1]] || []).forEach(function (n) {
          if (n.used && n !== first) return;
          var dOut = [n.b[0] - n.a[0], n.b[1] - n.a[1]];
          var turn = dIn[0] * dOut[1] - dIn[1] * dOut[0];
          if (turn > bestTurn) { bestTurn = turn; best = n; }
        });
        e = best === first ? null : best;
      }
      // Drop collinear corners: only real turns remain.
      var pts = [];
      for (var i = 0; i < loop.length; i++) {
        var p = loop[(i + loop.length - 1) % loop.length], q = loop[i], r = loop[(i + 1) % loop.length];
        var cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
        if (cross !== 0) pts.push(q);
      }
      if (pts.length >= 4) loops.push(pts);
    });
    return loops;
  }
  function signedArea(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  function inside(pt, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  /* A loop as a smooth path, pulled in by `inset`, corners rounded. Board
     coordinates are shifted so the floe is centred on the origin. */
  function tracePath(path, pts, inset, ox, oy) {
    var n = pts.length, k;
    var info = [];
    for (k = 0; k < n; k++) {
      var p = pts[(k + n - 1) % n], q = pts[k], r = pts[(k + 1) % n];
      var din = [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
      var dout = [Math.sign(r[0] - q[0]), Math.sign(r[1] - q[1])];
      var turn = din[0] * dout[1] - din[1] * dout[0];
      // Inward normal of an edge walked with the ice on its right: (-dy, dx).
      var nx = -din[1] - dout[1], ny = din[0] + dout[0];
      var cx = q[0] + nx * inset + ox, cy = q[1] + ny * inset + oy;
      var rad = turn > 0 ? CORNER : NOTCH;
      info.push({ c: [cx, cy], din: din, dout: dout, rad: rad });
    }
    for (k = 0; k < n; k++) {
      var it = info[k];
      var a = [it.c[0] - it.din[0] * it.rad, it.c[1] - it.din[1] * it.rad];
      var b = [it.c[0] + it.dout[0] * it.rad, it.c[1] + it.dout[1] * it.rad];
      if (k === 0) path.moveTo(a[0], a[1]); else path.lineTo(a[0], a[1]);
      path.quadraticCurveTo(it.c[0], it.c[1], b[0], b[1]);
    }
    path.closePath();
    return path;
  }
  function floeShapes(stage, inset) {
    var loops = floorLoops(stage), ox = -stage.w / 2, oy = -stage.h / 2;
    var outer = [], holes = [];
    loops.forEach(function (l) { (signedArea(l) > 0 ? outer : holes).push(l); });
    return outer.map(function (o) {
      var s = tracePath(new T.Shape(), o, inset, ox, oy);
      holes.forEach(function (hl) {
        // Half a cell to the water side of the hole's first edge.
        var a = hl[0], b = hl[1], dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        var probe = [a[0] + dx * .5 + dy * .5, a[1] + dy * .5 - dx * .5];
        if (inside(probe, o)) s.holes.push(tracePath(new T.Path(), hl, inset, ox, oy));
      });
      return s;
    });
  }

  // ── penguins ────────────────────────────────────────────────────────────
  var FACE = 256;
  function bibPath(g) {
    g.beginPath(); g.moveTo(34, 256); g.lineTo(34, 112);
    g.bezierCurveTo(34, 30, 90, 26, 128, 70); g.bezierCurveTo(166, 26, 222, 30, 222, 112);
    g.lineTo(222, 256); g.closePath();
  }
  function plumage(g, colour, seed) {
    var pal = paletteOf(colour), gr = g.createLinearGradient(0, 0, 0, FACE);
    gr.addColorStop(0, pal.hi); gr.addColorStop(.55, pal.body); gr.addColorStop(1, pal.mid);
    g.fillStyle = gr; g.fillRect(0, 0, FACE, FACE);
    for (var r = 0; r < 7; r++) for (var c = 0; c <= 8; c++) {
      var k = r * 31 + c * 7 + seed, fw = FACE / 8, fh = FACE / 7;
      var fx = (c + (r % 2) * .5) * fw + (hash(k) - .5) * fw * .2, fy = (r + .55) * fh;
      g.strokeStyle = 'rgba(255,255,255,' + (.05 + hash(k * 3.3) * .07) + ')'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(fx, fy, fw * .62, fh * .7, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.strokeStyle = 'rgba(70,30,0,' + (.04 + hash(k * 4.1) * .05) + ')'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(fx, fy + fh * .18, fw * .58, fh * .7, 0, Math.PI * .12, Math.PI * .88); g.stroke();
    }
  }
  function glyph(g, cx, cy, r, shape) {
    g.beginPath();
    if (shape === 'square') { var s = r * .84; g.rect(cx - s, cy - s, s * 2, s * 2); }
    else if (shape === 'triangle') {
      var hh = r * 1.12; g.moveTo(cx, cy - hh); g.lineTo(cx + hh * .93, cy + hh * .62);
      g.lineTo(cx - hh * .93, cy + hh * .62); g.closePath();
    } else if (shape === 'diamond') {
      var d = r * 1.18; g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath();
    } else g.arc(cx, cy, r, 0, Math.PI * 2);
  }
  /* The front of the cube: plumage, the white bib, cheeks and eyes. The beak
     is real geometry, so the face is drawn around where it will sit. */
  function drawFace(colour, expression) {
    var c = canvas(FACE, FACE), g = c.getContext('2d');
    plumage(g, colour, 500);
    var bib = g.createLinearGradient(40, 30, 160, 256);
    bib.addColorStop(0, '#ffffff'); bib.addColorStop(1, '#e2eef1');
    g.save(); g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 8;
    g.fillStyle = bib; bibPath(g); g.fill(); g.restore();
    g.save(); bibPath(g); g.clip();
    var form = g.createRadialGradient(118, 130, 20, 128, 150, 160);
    form.addColorStop(0, 'rgba(255,255,255,0)'); form.addColorStop(1, 'rgba(90,120,140,.22)');
    g.fillStyle = form; g.fillRect(0, 0, FACE, FACE);
    g.lineCap = 'round';
    for (var k = 0; k < 60; k++) {
      var fx = 40 + hash(k * 2.3) * 176, fy = 70 + hash(k * 3.9) * 180, fl = 6 + hash(k * 1.7) * 9;
      g.strokeStyle = hash(k * 5.1) > .5 ? 'rgba(255,255,255,.7)' : 'rgba(140,165,180,.16)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + (fx < 128 ? -2 : 2), fy + fl * .6, fx + (fx < 128 ? -1 : 1), fy + fl); g.stroke();
    }
    g.restore();
    [58, 198].forEach(function (cx) {
      var ck = g.createRadialGradient(cx, 150, 1, cx, 150, 24);
      ck.addColorStop(0, 'rgba(236,140,128,.5)'); ck.addColorStop(1, 'rgba(236,140,128,0)');
      g.fillStyle = ck; g.fillRect(cx - 26, 124, 52, 52);
    });
    g.strokeStyle = '#263d49'; g.fillStyle = '#263d49'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    var happy = expression === 'good' || expression === 'perfect' || expression === 'clear';
    var worried = expression === 'danger' || expression === 'bad';
    var EY = 104;
    [86, 170].forEach(function (x) {
      g.beginPath();
      if (expression === 'perfect') {
        g.moveTo(x, EY - 26); g.lineTo(x + 7, EY - 9); g.lineTo(x + 20, EY - 1); g.lineTo(x + 7, EY + 7);
        g.lineTo(x, EY + 24); g.lineTo(x - 7, EY + 7); g.lineTo(x - 20, EY - 1); g.lineTo(x - 7, EY - 9); g.closePath(); g.fill();
      } else if (happy) {
        g.moveTo(x - 15, EY + 10); g.quadraticCurveTo(x, expression === 'clear' ? EY - 38 : EY - 18, x + 15, EY + 10); g.stroke();
      } else if (expression === 'fail') {
        g.moveTo(x - 12, EY - 15); g.lineTo(x + 12, EY + 14); g.moveTo(x + 12, EY - 15); g.lineTo(x - 12, EY + 14); g.stroke();
      } else if (expression === 'miss') {
        g.moveTo(x - 13, EY + 4); g.lineTo(x + 13, EY + 4); g.stroke();
      } else {
        var ey = expression === 'surprise' ? EY - 6 : EY, erx = expression === 'surprise' ? 17 : 13, ery = expression === 'surprise' ? 24 : 19;
        g.ellipse(x, ey, erx, ery, 0, 0, Math.PI * 2); g.fill();
        var iris = g.createRadialGradient(x + 2, ey + 7, 1, x, ey + 2, ery);
        iris.addColorStop(0, 'rgba(110,72,44,.7)'); iris.addColorStop(1, 'rgba(110,72,44,0)');
        g.fillStyle = iris; g.beginPath(); g.ellipse(x, ey, erx, ery, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 4, ey - 8, 4.5, 6.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(200,240,255,.6)'; g.beginPath(); g.arc(x + 4, ey + ery * .55, 2.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#263d49';
      }
      if (worried) {
        var slope = expression === 'bad' ? -1 : 1;
        g.beginPath(); g.moveTo(x - 15, EY - 34 + slope * (x < 128 ? 10 : 0)); g.lineTo(x + 15, EY - 34 + slope * (x < 128 ? 0 : 10)); g.stroke();
      }
    });
    return c;
  }
  function drawCrown(colour) {
    var c = canvas(FACE, FACE), g = c.getContext('2d');
    plumage(g, colour, 900);
    var sh = g.createRadialGradient(90, 80, 10, 128, 128, 190);
    sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, FACE, FACE);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 7; g.lineJoin = 'round';
    glyph(g, 128, 118, 22, paletteOf(colour).shape); g.stroke();
    return c;
  }
  function drawSide(colour, seed) {
    var c = canvas(FACE, FACE), g = c.getContext('2d');
    plumage(g, colour, seed);
    return c;
  }
  var FACES = {};
  function faceTexture(colour, expression) {
    var key = colour + ':' + expression;
    if (!FACES[key]) FACES[key] = colourTexture(drawFace(colour, expression));
    return FACES[key];
  }
  var KITS = {};
  function penguinKit(colour) {
    if (KITS[colour]) return KITS[colour];
    var pal = paletteOf(colour);
    function mat(map) {
      return new T.MeshPhysicalMaterial({ map: map, roughness: .58, sheen: .6, sheenRoughness: .45,
        sheenColor: new T.Color(pal.hi), clearcoat: .15, clearcoatRoughness: .5 });
    }
    var side = mat(colourTexture(drawSide(colour, 200))), back = mat(colourTexture(drawSide(colour, 300)));
    var top = mat(colourTexture(drawCrown(colour)));
    var bottom = new T.MeshStandardMaterial({ color: pal.mid, roughness: .7 });
    var orange = new T.MeshPhysicalMaterial({ color: '#f39a1f', roughness: .35, clearcoat: .6, clearcoatRoughness: .2 });
    var flipper = new T.MeshPhysicalMaterial({ color: new T.Color(pal.mid), roughness: .55, sheen: .4,
      sheenColor: new T.Color(pal.hi) });
    var kit = KITS[colour] = {
      body: new T.RoundedBoxGeometry(PENGUIN, PENGUIN * 1.06, PENGUIN * .92, 5, .15),
      beak: new T.ConeGeometry(.075, .17, 16).rotateX(Math.PI / 2),
      foot: new T.SphereGeometry(.075, 16, 10).scale(1.25, .42, 1.55),
      wing: new T.RoundedBoxGeometry(.07, .36, .24, 3, .03),
      shadow: new T.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2),
      side: side, back: back, top: top, bottom: bottom, orange: orange, flipper: flipper
    };
    Object.keys(kit).forEach(function (k) { kit[k].userData.shared = true; });
    return kit;
  }
  function makePenguin(colour, contactTex) {
    var kit = penguinKit(colour), g = new T.Group();
    var front = kit.side.clone();
    front.map = faceTexture(colour, 'normal');
    // BoxGeometry groups: +x, -x, +y, -y, +z (front), -z.
    var body = new T.Mesh(kit.body, [kit.side, kit.side, kit.top, kit.bottom, front, kit.back]);
    body.position.y = PENGUIN * .53 + .01;
    body.castShadow = true; body.receiveShadow = true;
    var beak = new T.Mesh(kit.beak, kit.orange);
    beak.position.set(0, PENGUIN * .6, PENGUIN * .46 + .07);
    var feet = [-1, 1].map(function (s) {
      var f = new T.Mesh(kit.foot, kit.orange); f.position.set(s * .15, .03, PENGUIN * .46 - .03); return f;
    });
    var wings = [-1, 1].map(function (s) {
      var pivot = new T.Group();
      pivot.position.set(s * (PENGUIN / 2 + .015), PENGUIN * .7, .02);
      var wmesh = new T.Mesh(kit.wing, kit.flipper);
      wmesh.position.y = -.17; wmesh.castShadow = true;
      pivot.add(wmesh); pivot.userData.side = s;
      return pivot;
    });
    var lean = new T.Group();
    lean.add(body); lean.add(beak); wings.forEach(function (w) { lean.add(w); });
    g.add(lean); feet.forEach(function (f) { g.add(f); });
    var shadow = new T.Mesh(kit.shadow,
      new T.MeshBasicMaterial({ map: contactTex, color: '#174a66', transparent: true, opacity: .42, depthWrite: false }));
    shadow.position.y = .006; shadow.renderOrder = 1;
    g.add(shadow);
    g.userData = { colour: colour, front: front, lean: lean, wings: wings, shadow: shadow, expression: 'normal' };
    return g;
  }
  function makeDrifter() {
    var g = new T.Group();
    var m = new T.Mesh(new T.RoundedBoxGeometry(.8, .3, .8, 4, .08),
      new T.MeshPhysicalMaterial({ color: '#9fb1c0', roughness: .5, clearcoat: .4 }));
    m.position.y = .16; m.castShadow = true; m.receiveShadow = true;
    g.add(m); g.userData = { drifter: true, lean: m, wings: [] };
    return g;
  }

  // ── auroras ─────────────────────────────────────────────────────────────
  var AURORA = {};
  function auroraTexture(colour, img) {
    var key = colour + (img ? ':img' : ':plain');
    if (AURORA[key]) return AURORA[key];
    var S = 256, c = canvas(S, S), g = c.getContext('2d'), pal = paletteOf(colour);
    g.save(); g.beginPath(); g.roundRect(8, 8, S - 16, S - 16, 58); g.clip();
    if (img) g.drawImage(img, 0, 0, S, S);
    else {
      var r = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * .55);
      r.addColorStop(0, '#fff'); r.addColorStop(.4, '#9ef'); r.addColorStop(1, '#58a');
      g.fillStyle = r; g.fillRect(0, 0, S, S);
    }
    g.globalCompositeOperation = 'color'; g.globalAlpha = .85; g.fillStyle = pal.mid; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = .25; g.fillStyle = pal.mid; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 1;
    var glow = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * .4);
    glow.addColorStop(0, 'rgba(255,255,255,.4)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    g.restore();
    AURORA[key] = colourTexture(c);
    return AURORA[key];
  }

  // ── texture bank (decoded images) ───────────────────────────────────────
  function TextureBank(onReady) {
    this.images = {}; this.loaded = 0;
    this.expected = Object.keys(TEXTURE_FILES).length;
    this.onReady = onReady || function () {};
    if (typeof Image === 'undefined') return;
    var self = this;
    Object.keys(TEXTURE_FILES).forEach(function (name) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { self.images[name] = img; self.loaded++; if (self.loaded === self.expected) self.onReady(name); };
      img.onerror = function () { self.loaded++; if (self.loaded === self.expected) self.onReady(name); };
      img.src = TEXTURE_FILES[name];
    });
  }

  // ── the renderer ────────────────────────────────────────────────────────
  /* What the browser will say about this GPU and machine. Every field may be
     missing; quality.js never counts a missing field against the device. */
  function deviceInfo(gl) {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var info = { cores: nav.hardwareConcurrency || 0, memory: nav.deviceMemory || 0 };
    try {
      var ctx = gl.getContext(), ext = ctx.getExtension('WEBGL_debug_renderer_info');
      info.renderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
      info.maxTexture = ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
    } catch (e) { /* the browser said nothing */ }
    return info;
  }

  /**
   * opts.mode     'auto' (default) | 'high' | 'lite' — what the player chose
   * opts.learned  { at } if AUTO once had to drop this device to LITE
   * opts.tier     force a tier, ignoring all of the above (the home preview)
   */
  function Renderer(canvasEl, opts) {
    var self = this;
    opts = opts || {};
    if (!T) throw new Error('three.js is missing (src/vendor/three.js)');
    this.canvas = canvasEl;
    this.gl = new T.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
    // Only the ice's own shaders are worth falling back for; a failure in some
    // other material is three.js's to report and the rest of the scene to survive.
    this.gl.debug.onShaderError = function (ctx, program, vs, fs) {
      var src = '';
      try { src = ctx.getShaderSource(fs) || ''; } catch (e) { /* unknown: assume it was ours */ }
      if (!src || /vIceNrm|uWaterShallow/.test(src)) self.shaderBroken = true;
    };
    this.mode = Q.validMode(opts.mode);
    this.hint = Q.detect(deviceInfo(this.gl));
    var pick = opts.tier ? { tier: opts.tier, reason: 'forced' } : Q.resolve(this.mode, this.hint, opts.learned || null, Date.now());
    this.tier = pick.tier; this.tierReason = pick.reason;
    this.maxParticles = Q.TIER[this.tier].particles;
    this.onQualityChange = null; this.shaderBroken = false;
    this.armMonitor();
    this.ice = Ice.create({ tier: this.tier, onDetail: function () { if (self.onInvalidate) self.onInvalidate(); } });
    this.gl.setClearColor(0x000000, 0);
    this.gl.toneMapping = T.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.04;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = T.PCFShadowMap;
    this.ctx = null;

    this.stage = null; this.state = null; this.anim = null;
    this.particles = []; this.ripples = []; this.flashes = []; this.grazes = []; this.vanishing = [];
    this.gravity = null; this.aimDir = null; this.aimAmount = 0; this.aimSlide = 0; this.clearGlow = 0; this.time = 0;
    this.reduceMotion = false; this.gesture = false; this.gestureDir = 'L'; this.gestureT = 0;
    this.shift = { x: 0, y: 0 }; this.tilt = { x: 0, y: 0 }; this.nudge = null; this.shake = 0;
    this.dpr = 1; this.cell = 40; this.cssW = 1; this.cssH = 1;
    this.boardBounds = { left: 0, right: 0, top: 0, bottom: 0 };
    this.onEvent = null; this.onInvalidate = null; this.reactions = null;

    this.buildScene();
    this.textureBank = new TextureBank(function () {
      self.textureVersion = (self.textureVersion || 0) + 1;
      if (self.stage) self.buildGoals();
      if (self.onInvalidate) self.onInvalidate();
    });
    canvasEl.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; }, false);
    canvasEl.addEventListener('webglcontextrestored', function () {
      self.lost = false;
      if (self.monitor) self.monitor.reset();
      self.buildEnvironment();
      if (self.stage) self.setStage(self.stage, self.state);
      if (self.onInvalidate) self.onInvalidate();
    }, false);
  }

  // ── graphics tiers ──────────────────────────────────────────────────────
  Renderer.prototype.armMonitor = function () {
    this.monitor = (this.mode === 'auto' && this.tier === 'high') ? new Q.FrameMonitor() : null;
  };
  Renderer.prototype.applyTier = function () {
    var spec = Q.TIER[this.tier], sh = this.keyLight && this.keyLight.shadow;
    this.maxParticles = spec.particles;
    if (this.particles.length > this.maxParticles) this.particles.splice(0, this.particles.length - this.maxParticles);
    this.ice.setTier(this.tier);
    if (sh && sh.mapSize.x !== spec.shadow) {
      sh.mapSize.set(spec.shadow, spec.shadow);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
    }
    this.layout();
  };
  Renderer.prototype.setTier = function (tier, reason) {
    if (tier !== 'high' && tier !== 'lite') return;
    var changed = tier !== this.tier;
    this.tier = tier; this.tierReason = reason || this.tierReason;
    this.armMonitor();
    if (!changed) return;
    this.applyTier();
    if (this.onQualityChange) this.onQualityChange({ tier: tier, reason: reason, mode: this.mode });
  };
  /* Compile every shader now, in the background where the browser allows it,
     so that the first swipe is not the frame that pays for them. */
  Renderer.prototype.precompile = function () {
    try {
      if (this.gl.compileAsync) this.gl.compileAsync(this.scene, this.camera).catch(function () {});
      else this.gl.compile(this.scene, this.camera);
    } catch (e) { /* the first frame compiles what it needs */ }
  };
  /* The player's choice, from Settings. */
  Renderer.prototype.setMode = function (mode, learned) {
    this.mode = Q.validMode(mode);
    var pick = Q.resolve(this.mode, this.hint, learned || null, Date.now());
    this.setTier(pick.tier, pick.reason);
    this.armMonitor();
  };
  /* The device cannot keep up (the frame monitor's verdict). */
  Renderer.prototype.downgrade = function (reason) {
    if (this.tier !== 'high') return;
    this.setTier('lite', reason || 'slow');
  };
  /* A shader failed to compile on this GPU: plain materials, so the game
     still shows a floe and a pool. */
  Renderer.prototype.recoverShaders = function () {
    this.shaderBroken = false;
    if (this.ice.fallback) return;
    var f = this.ice.useFallback();
    if (this.floe) this.floe.material = [f, f];
    this.fallbackUsed = true;
  };

  Renderer.prototype.buildScene = function () {
    var S = shared();
    var scene = this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(30, 1, .1, 100);
    this.buildEnvironment();
    scene.environmentIntensity = .55;

    scene.add(new T.HemisphereLight('#f4fbff', '#4f9fbd', .95));
    var key = this.keyLight = new T.DirectionalLight('#fff4e4', 2.8);
    key.position.set(-4.2, 7, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(Q.TIER[this.tier].shadow, Q.TIER[this.tier].shadow); key.shadow.radius = 3;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.bias = -.0006; key.shadow.normalBias = .02;
    scene.add(key); scene.add(key.target);
    var rim = new T.DirectionalLight('#bfe6ff', .9);
    rim.position.set(3, 3.5, -6); scene.add(rim);

    // The pool. The floe tilts in it; the water stays level.
    var water = this.water = new T.Mesh(new T.CircleGeometry(1, 96).rotateX(-Math.PI / 2),
      this.ice.waterMaterial({ color: '#3f9fbe', roughness: .06, metalness: 0, transparent: true, opacity: .86,
        normalMap: S.waterNormal, normalScale: new T.Vector2(.12, .12), alphaMap: S.poolAlpha,
        depthWrite: false }));
    water.receiveShadow = true;
    water.material.normalMap.repeat.set(3, 3);
    water.position.y = -FREEBOARD; water.renderOrder = 2;
    scene.add(water);

    this.world = new T.Group(); scene.add(this.world);
    this.floeGroup = new T.Group(); this.world.add(this.floeGroup);
    this.goalGroup = new T.Group(); this.world.add(this.goalGroup);
    this.blockGroup = new T.Group(); this.world.add(this.blockGroup);
    this.fxGroup = new T.Group(); this.world.add(this.fxGroup);

    // Particles: shards of shaved ice, frost puffs, skate marks, coloured sparks.
    var shard = new T.BufferGeometry();
    shard.setAttribute('position', new T.Float32BufferAttribute([0, .6, 0, -.5, -.4, .12, .55, -.35, -.1, 0, -.2, -.6], 3));
    shard.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
    shard.computeVertexNormals();
    this.shards = new T.InstancedMesh(shard, new T.MeshPhysicalMaterial({ color: '#eefbff', roughness: .12,
      clearcoat: 1, transparent: true, opacity: .94 }), MAX_PARTICLES);
    this.puffs = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: S.blob, color: '#ffffff',
      transparent: true, opacity: .75, depthWrite: false }), MAX_PARTICLES);
    this.marks = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({
      map: S.blob, color: '#7fb4cc', transparent: true, opacity: .7, depthWrite: false }), MAX_PARTICLES);
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(.5), new T.MeshBasicMaterial({ color: '#ffffff' }), 128);
    [this.shards, this.puffs, this.marks, this.sparks].forEach(function (m) {
      m.count = 0; m.frustumCulled = false; this.fxGroup.add(m);
    }, this);
    this.puffs.renderOrder = 6; this.marks.renderOrder = 1;
    this.sparks.setColorAt(0, new T.Color('#fff'));

    // Ripple rings (pooled).
    this.ringPool = [];
    for (var i = 0; i < 10; i++) {
      var ring = new T.Mesh(new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
        new T.MeshBasicMaterial({ map: S.ring, transparent: true, depthWrite: false, opacity: 0 }));
      ring.visible = false; ring.renderOrder = 5; this.scene.add(ring); this.ringPool.push(ring);
    }

    // Aim and gravity markers, and the first-run swipe cue.
    this.markers = {};
    ['U', 'R', 'D', 'L'].forEach(function (d) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: arrowTexture(d), transparent: true, depthTest: false, opacity: 0 }));
      sp.renderOrder = 20; sp.visible = false; this.scene.add(sp); this.markers[d] = sp;
    }, this);
    this.cue = new T.Sprite(new T.SpriteMaterial({ map: S.blob, color: '#1d3a5e', transparent: true, depthTest: false, opacity: 0 }));
    this.cue.renderOrder = 21; this.cue.visible = false; this.scene.add(this.cue);
    this.cueTrail = [];
    for (i = 0; i < 6; i++) {
      var tr = new T.Sprite(new T.SpriteMaterial({ map: S.blob, color: '#1d3a5e', transparent: true, depthTest: false, opacity: 0 }));
      tr.renderOrder = 20; tr.visible = false; this.scene.add(tr); this.cueTrail.push(tr);
    }
  };

  Renderer.prototype.buildEnvironment = function () {
    var pmrem = new T.PMREMGenerator(this.gl);
    var sky = colourTexture(skyCanvas());
    sky.mapping = T.EquirectangularReflectionMapping;
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = pmrem.fromEquirectangular(sky).texture;
    // Ice shows the sky in its gloss. The scene's own environment strength is
    // right for the penguins; the floe takes its own (see ice.js).
    this.ice.setEnvironment(this.scene.environment);
    sky.dispose(); pmrem.dispose();
  };

  /* A small studio sky for reflections: pale overhead, a bright horizon,
     a cool sea below, and two soft windows that put a glint on the ice and
     the penguins. Painted once, at 256×128. */
  function skyCanvas() {
    var c = canvas(256, 128), g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#f6fbff'); sky.addColorStop(.42, '#d8eef7'); sky.addColorStop(.5, '#ffffff');
    sky.addColorStop(.56, '#9fd2e3'); sky.addColorStop(1, '#2f7f9f');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
    // Soft windows: radial falloff scaled to an ellipse (no canvas blur, see above).
    function window_(x, y, w, h, colour) {
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(w / 2, h / 2);
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, colour); rg.addColorStop(.55, colour); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(-1, -1, 2, 2); g.restore();
    }
    window_(46, 14, 56, 38, '#ffffff'); window_(164, 22, 42, 30, '#ffffff');
    window_(104, 4, 48, 22, 'rgba(255,240,220,.9)');
    return c;
  }

  var ARROWS = {};
  function arrowTexture(d) {
    if (ARROWS[d]) return ARROWS[d];
    var c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = 'rgba(240,251,255,.94)'; g.strokeStyle = 'rgba(7,112,148,.75)'; g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#087A9C'; g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round';
    var s = 22; g.beginPath();
    if (d === 'U') { g.moveTo(64 - s, 64 + s * .4); g.lineTo(64, 64 - s * .7); g.lineTo(64 + s, 64 + s * .4); }
    else if (d === 'D') { g.moveTo(64 - s, 64 - s * .4); g.lineTo(64, 64 + s * .7); g.lineTo(64 + s, 64 - s * .4); }
    else if (d === 'L') { g.moveTo(64 + s * .4, 64 - s); g.lineTo(64 - s * .7, 64); g.lineTo(64 + s * .4, 64 + s); }
    else { g.moveTo(64 - s * .4, 64 - s); g.lineTo(64 + s * .7, 64); g.lineTo(64 - s * .4, 64 + s); }
    g.stroke();
    ARROWS[d] = colourTexture(c);
    return ARROWS[d];
  }

  /* Board coordinates (cell corners at integers, height in cells) to world. */
  Renderer.prototype.wx = function (x) { return x - this.stage.w / 2; };
  Renderer.prototype.wz = function (y) { return y - this.stage.h / 2; };
  Renderer.prototype.isIce = function (x, y) {
    var st = this.stage;
    return x >= 0 && y >= 0 && x < st.w && y < st.h && st.terrain[y * st.w + x] !== E.WALL;
  };
  /* Height of whatever is under a point: the ice, or the water. */
  Renderer.prototype.groundAt = function (x, y) {
    return this.isIce(Math.floor(x), Math.floor(y)) ? 0 : -FREEBOARD;
  };

  /* The point (x, y, z) of the board — z up, in cells — in CSS pixels. */
  Renderer.prototype.project = function (x, y, z) {
    if (!this.stage) return { x: 0, y: 0 };
    var v = new T.Vector3(this.wx(x), z || 0, this.wz(y));
    this.world.updateMatrixWorld();
    v.applyMatrix4(this.world.matrixWorld).project(this.camera);
    return { x: (v.x * .5 + .5) * this.cssW, y: (-v.y * .5 + .5) * this.cssH };
  };
  Renderer.prototype.cellRect = function (x, y) {
    var c = this.project(x + .5, y + .5, 0);
    return { x: c.x - this.cell / 2, y: c.y - this.cell / 2, s: this.cell };
  };

  Renderer.prototype.setStage = function (stage, state) {
    this.stage = stage; this.state = state; this.anim = null;
    this.particles.length = 0; this.ripples.length = 0; this.flashes.length = 0;
    this.grazes.length = 0; this.vanishing.length = 0;
    this.gravity = null; this.aimDir = null; this.aimAmount = 0; this.aimSlide = 0;
    this.clearGlow = 0; this.shake = 0; this.nudge = null;
    this.shift.x = this.shift.y = 0; this.tilt.x = this.tilt.y = 0;
    this.onEvent = null;
    if (this.monitor) this.monitor.settle(8);
    this.buildFloe(); this.buildGoals(); this.buildBlocks();
    this.layout();
  };
  Renderer.prototype.showState = function (state) {
    this.state = state; this.anim = null; this.grazes.length = 0;
    this.particles.length = 0; this.ripples.length = 0; this.vanishing.length = 0;
  };

  /* Free what a stage built for itself. Penguin kits and shared textures are
     marked `shared` and outlive every stage. */
  function disposeTree(o) {
    o.traverse(function (n) {
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
      var mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      mats.forEach(function (m) { if (!m.userData.shared) m.dispose(); });
    });
  }

  Renderer.prototype.buildFloe = function () {
    var st = this.stage;
    this.floeGroup.children.slice().forEach(function (o) { disposeTree(o); });
    this.floeGroup.clear();
    var shapes = floeShapes(st, INSET + BEVEL);
    var geo = new T.ExtrudeGeometry(shapes, {
      depth: DRAFT, steps: 10, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
      bevelSegments: 5, curveSegments: 6
    });
    // Lay it down: shape x → world x, shape y → world z, extrusion → down.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, -BEVEL, 0);
    // The extruder gives every triangle its own flat normal, which facets the
    // rounded corners. Weld the vertices and let the normals average.
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = T.mergeVertices(geo, 1e-4);
    geo.computeVertexNormals();
    // Two groups: what faces up (the top and the upper bevel), and the rest.
    var index = geo.index.array, nrm = geo.attributes.normal, up = [], rest = [];
    for (var t = 0; t < index.length; t += 3) {
      var a = index[t], b = index[t + 1], c = index[t + 2];
      ((nrm.getY(a) + nrm.getY(b) + nrm.getY(c)) / 3 > .5 ? up : rest).push(a, b, c);
    }
    geo.setIndex(up.concat(rest));
    geo.clearGroups(); geo.addGroup(0, up.length, 0); geo.addGroup(up.length, rest.length, 1);
    this.ice.setStage(st);
    var floe = new T.Mesh(geo, [this.ice.floeMaterial, this.ice.sideMaterial]);
    floe.receiveShadow = true; floe.castShadow = true;
    this.floeGroup.add(floe);
    this.floe = floe;
  };

  Renderer.prototype.buildGoals = function () {
    var st = this.stage, S = shared(), img = this.textureBank && this.textureBank.images.goalTop;
    if (!st) return;
    this.goalGroup.children.slice().forEach(function (o) { disposeTree(o); });
    this.goalGroup.clear();
    this.goals = [];
    for (var i = 0; i < st.goalCells.length; i++) {
      var cell = st.goalCells[i], gx = cell % st.w, gy = (cell / st.w) | 0, col = st.goalColour[cell];
      var pal = paletteOf(col), grp = new T.Group();
      grp.position.set(this.wx(gx + .5), 0, this.wz(gy + .5));
      var tex = auroraTexture(col, img);
      var decal = new T.Mesh(new T.PlaneGeometry(.8, .8).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new T.Color('#ffffff'),
          emissiveIntensity: .55, roughness: .3, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      decal.position.y = .004; decal.receiveShadow = true; decal.renderOrder = 1;
      var glow = new T.Mesh(new T.PlaneGeometry(.95, .95).rotateX(-Math.PI / 2),
        new T.MeshBasicMaterial({ map: S.blob, color: new T.Color(pal.hi), transparent: true, opacity: .32,
          blending: T.AdditiveBlending, depthWrite: false }));
      glow.position.y = .012; glow.renderOrder = 2;
      var motes = [];
      for (var m = 0; m < 7; m++) {
        var mote = new T.Sprite(new T.SpriteMaterial({ map: S.blob, color: new T.Color(pal.hi), transparent: true,
          opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
        mote.renderOrder = 7; mote.userData = { seed: hash(cell * 7 + m), a: m / 7 * Math.PI * 2 };
        grp.add(mote); motes.push(mote);
      }
      grp.add(decal); grp.add(glow);
      this.goalGroup.add(grp);
      this.goals.push({ cell: [gx, gy], group: grp, decal: decal, glow: glow, motes: motes, colour: col, phase: hash(cell + 3) * 6 });
    }
  };

  Renderer.prototype.buildBlocks = function () {
    var st = this.stage, S = shared();
    this.blockGroup.children.slice().forEach(function (o) { disposeTree(o); });
    this.blockGroup.clear();
    this.blocks = [];
    for (var i = 0; i < st.blocks.length; i++) {
      var colour = st.colour[i];
      var m = colour === E.GRAY ? makeDrifter() : makePenguin(colour, S.contact);
      this.blockGroup.add(m);
      this.blocks.push(m);
    }
  };

  Renderer.prototype.layout = function () {
    var w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, Q.TIER[this.tier].dpr);
    this.dpr = dpr; this.cssW = w; this.cssH = h;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    if (!this.stage) return;
    this.frameCamera();
  };

  /* Fit the floe, its penguins and the aim markers into the canvas from a
     fixed, front-on elevation. */
  Renderer.prototype.frameCamera = function () {
    var st = this.stage, cam = this.camera, w = this.cssW, h = this.cssH;
    cam.aspect = w / h;
    var narrow = w / h < .8;
    cam.fov = narrow ? 34 : 30;
    var elev = 52 * Math.PI / 180;
    var target = new T.Vector3(0, .1, .12);
    var hx = st.w / 2 + .5, hz = st.h / 2 + .5, pts = [];
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      pts.push(new T.Vector3(sx * hx, -FREEBOARD, sz * hz));
      pts.push(new T.Vector3(sx * (st.w / 2), PENGUIN + .1, sz * (st.h / 2)));
    }); });
    var margin = Math.max(.86, 1 - 24 / Math.min(w, h));
    var dist = 12;
    for (var it = 0; it < 6; it++) {
      cam.position.set(target.x, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
      cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      var mx = 0, my = 0;
      pts.forEach(function (p) {
        var v = p.clone().project(cam);
        mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y));
      });
      dist *= Math.max(mx / margin, my / margin);
    }
    cam.position.set(target.x, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
    cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    this.camBase = cam.position.clone();
    this.camTarget = target;
    var a = this.project(0, 0, 0), b = this.project(st.w, 0, 0), c = this.project(0, st.h, 0), d = this.project(st.w, st.h, 0);
    this.cell = Math.min(MAX_CELL, Math.max(8, ((b.x - a.x) + (d.x - c.x)) / 2 / st.w));
    this.boardBounds = { left: Math.min(a.x, c.x), right: Math.max(b.x, d.x), top: Math.min(a.y, b.y), bottom: Math.max(c.y, d.y) };
    // The pool fills what the camera sees of the water, then fades out
    // before the canvas edge, so it melts into the page.
    var reach = function (nx, ny) {
      var o = new T.Vector3(nx, ny, -1).unproject(cam), d = new T.Vector3(nx, ny, 1).unproject(cam).sub(o).normalize();
      var t = (-FREEBOARD - o.y) / d.y;
      return o.add(d.multiplyScalar(t));
    };
    var cy = new T.Vector3(0, -FREEBOARD, 0).project(cam).y;
    var side = Math.abs(reach(1, cy).x), far = Math.abs(reach(0, 1).z), near = Math.abs(reach(0, -1).z);
    var Rx = Math.min(side * .98, st.w / 2 + 3.2), Rz = Math.min(far, near) * .98;
    Rz = Math.min(Rz, st.h / 2 + 3.2);
    this.water.scale.set(Math.max(Rx, st.w / 2 + .8), 1, Math.max(Rz, st.h / 2 + .8));
    var off = .7;
    this.markers.U.position.set(0, -.05, -st.h / 2 - off);
    this.markers.D.position.set(0, -.05, st.h / 2 + off);
    this.markers.L.position.set(-st.w / 2 - off, -.05, 0);
    this.markers.R.position.set(st.w / 2 + off, -.05, 0);

  };

  // ── moves (same clock and semantics as the engine's frames) ─────────────
  Renderer.prototype.playMove = function (result, onDone) {
    var frames = result.frames, n = this.stage.blocks.length, runs = [];
    for (var i = 0; i < n; i++) {
      var br = [], start = -1;
      for (var t = 1; t < frames.length; t++) {
        var p = frames[t - 1].pos[i], q = frames[t].pos[i];
        var moved = frames[t - 1].alive[i] && (p[0] !== q[0] || p[1] !== q[1]);
        if (moved && start < 0) start = t - 1;
        if (!moved && start >= 0) { br.push([start, t - 1]); start = -1; }
      }
      if (start >= 0) br.push([start, frames.length - 1]); runs.push(br);
    }
    this.anim = { frames: frames, runs: runs, events: result.events.slice(),
      passes: this.findPasses(frames), firedPass: {}, fired: {}, trailTime: 0, trailDistance: [],
      t0: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      duration: Math.max(TICK, (frames.length - 1) * TICK + TAIL + SQUASH),
      endState: result.state, onDone: onDone, done: false };
  };
  Renderer.prototype.findPasses = function (frames) {
    var st = this.stage, out = [], seen = {}, n = frames[0].pos.length;
    for (var i = 0; i < n; i++) for (var t = 1; t + 1 < frames.length; t++) {
      if (!frames[t].alive[i]) break;
      var p = frames[t].pos[i], ci = p[1] * st.w + p[0];
      if (!st.goal[ci] || !E.accepts(st.goalColour[ci], st.colour[i])) continue;
      var q = frames[t + 1].pos[i];
      if (q[0] === p[0] && q[1] === p[1]) continue;
      var key = ci + '@' + t; if (seen[key]) continue; seen[key] = 1;
      out.push({ t: t, cell: [p[0], p[1]] }); if (out.length >= 4) return out;
    }
    return out;
  };
  Renderer.prototype.animPos = function (i, elapsed) {
    var a = this.anim, rs = a.runs[i], frames = a.frames;
    if (!rs.length) return frames[0].pos[i];
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1], t0 = s * TICK, t1 = e * TICK + TAIL;
      if (elapsed <= t0) return frames[s].pos[i];
      if (elapsed < t1) {
        var f = easeOut(clamp01((elapsed - t0) / (t1 - t0))), p = frames[s].pos[i], q = frames[e].pos[i];
        return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      }
      if (k === rs.length - 1) return frames[e].pos[i];
    }
    return frames[frames.length - 1].pos[i];
  };
  Renderer.prototype.impactOf = function (i, elapsed) {
    var a = this.anim, rs = a.runs[i]; if (!rs.length || this.reduceMotion) return 0;
    for (var k = 0; k < rs.length; k++) {
      var s = rs[k][0], e = rs[k][1], end = e * TICK + TAIL, dt = elapsed - end;
      if (dt >= 0 && dt < SQUASH) {
        var dx = a.frames[e].pos[i][0] - a.frames[s].pos[i][0];
        var dy = a.frames[e].pos[i][1] - a.frames[s].pos[i][1];
        var power = Math.min(1, (Math.abs(dx) + Math.abs(dy)) / 3) * .72 + .18;
        return { amount: (1 - dt / SQUASH) * power, axis: dx !== 0 ? 'x' : 'y' };
      }
    }
    return 0;
  };
  /* How fast, in cells per tick, a block is gliding right now (signed). */
  Renderer.prototype.speedOf = function (i, elapsed) {
    var p = this.animPos(i, Math.max(0, elapsed - 16)), q = this.animPos(i, elapsed);
    return [(q[0] - p[0]) / 16 * TICK, (q[1] - p[1]) / 16 * TICK];
  };

  // ── effects ─────────────────────────────────────────────────────────────
  Renderer.prototype.burst = function (wx, wy, wz, col, count, power) {
    if (this.reduceMotion) return;
    var n = Math.min(count, 18);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + Math.random() * .5, sp = (.00045 + Math.random() * .00072) * power;
      this.particles.push({ kind: 'spark', x: wx, y: wy, z: wz, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        vz: .0009 + Math.random() * .0014, life: 0, max: 380 + Math.random() * 220,
        size: .035 + Math.random() * .04, col: col, angle: Math.random() * 6, spin: (Math.random() - .5) * .02 });
    }
    this.trimParticles();
  };
  Renderer.prototype.ripple = function (wx, wy, wz, col, r0, r1, ms) {
    this.ripples.push({ x: wx, y: wy, z: wz, col: col, r0: r0, r1: r1, life: 0, max: ms });
    if (this.ripples.length > this.ringPool.length) this.ripples.shift();
  };
  Renderer.prototype.trimParticles = function () {
    if (this.particles.length > this.maxParticles) this.particles.splice(0, this.particles.length - this.maxParticles);
  };
  /* A sliding block grinds the ice along its whole underside: shavings come
     from the full footprint — front to back, side to side — and are thrown
     backwards, sideways and up. Heavy, fast and many: chunks that tumble and
     bounce, a haze of fine splinters, frost clouds, and scratches that stay
     on the ice after the penguin has gone. */
  Renderer.prototype.iceSpray = function (x, y, dx, dy, speed, impact) {
    if (this.reduceMotion) return;
    var count = impact ? 100 : 32, LANES = [-.34, -.2, -.07, .07, .2, .34];
    for (var j = 0; j < count; j++) {
      var m = j % 8, kind = m === 0 ? 'frost' : (m === 1 && !impact) ? 'skate' : (m === 2 ? 'chip' : 'shard');
      if (impact && m === 1) kind = 'frost';
      var side = Math.random() < .5 ? -1 : 1, hard = impact ? 1.8 : 1;
      var spread = side * (.0006 + Math.random() * .0026) * hard;
      var back = (.0006 + Math.random() * .0016) * speed * (kind === 'chip' ? 1.5 : 1), along, across;
      if (impact) { along = .05 + Math.random() * .42; across = (Math.random() - .5) * .9; }
      else if (kind === 'skate') { along = -.42 + Math.random() * .3; across = LANES[j % LANES.length] + (Math.random() - .5) * .03; }
      else { along = -.5 + Math.random() * .95; across = (Math.random() - .5) * .86; }
      var px = x + dx * along - dy * across, py = y + dy * along + dx * across;
      if ((kind === 'skate') && this.groundAt(px, py) < 0) continue;
      var up = kind === 'skate' ? 0 : (.0018 + Math.random() * .0042) * (impact ? 1.4 : 1) * (kind === 'chip' ? 1.3 : 1);
      this.particles.push({ kind: kind, x: px, y: py, z: .03,
        vx: -dx * back - dy * spread, vy: -dy * back + dx * spread, vz: up,
        life: 0, max: kind === 'skate' ? 1000 : 600 + Math.random() * 500,
        size: kind === 'frost' ? .09 + Math.random() * .1 : kind === 'chip' ? .04 + Math.random() * .045 : .016 + Math.random() * .03,
        angle: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * .03,
        dx: dx, dy: dy });
    }
    this.trimParticles();
  };
  Renderer.prototype.emitSlideIce = function (elapsed) {
    var a = this.anim, previous = a.trailTime; a.trailTime = elapsed;
    if (this.reduceMotion || elapsed - previous > 100 || elapsed <= previous) return;
    for (var i = 0; i < a.runs.length; i++) {
      var alive = a.frames[Math.max(0, Math.min(a.frames.length - 1, Math.floor(elapsed / TICK)))].alive[i];
      if (!alive) continue;
      var p = this.animPos(i, previous), q = this.animPos(i, elapsed);
      var dx = q[0] - p[0], dy = q[1] - p[1], distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < .0001) continue;
      dx /= distance; dy /= distance;
      var spacing = .032, remainder = a.trailDistance[i] || 0;
      for (var d = spacing - remainder; d <= distance; d += spacing) {
        var f = d / distance;
        this.iceSpray(p[0] + (q[0] - p[0]) * f + .5, p[1] + (q[1] - p[1]) * f + .5,
          dx, dy, Math.min(1.8, distance / (elapsed - previous) * 75), false);
      }
      a.trailDistance[i] = (remainder + distance) % spacing;
    }
  };
  Renderer.prototype.addShake = function (amount, cap) {
    if (!this.reduceMotion) this.shake = Math.min(this.shake + amount, cap);
  };
  Renderer.prototype.fireEvent = function (ev) {
    var x = ev.cell[0] + .5, y = ev.cell[1] + .5;
    var pal = paletteOf(this.stage.colour ? this.stage.colour[ev.block] : 0);
    if (ev.type === 'goal') {
      this.burst(x, y, .3, pal.hi, 16, 1.3);
      this.ripple(x, y, .02, pal.hi, .2, .95, 520);
      this.flashes.push({ cell: ev.cell, life: 0, max: 620 });
      this.vanishing.push({ block: ev.block, cell: ev.cell, life: 0, max: VANISH });
      this.addShake(.9, 2.5);
    } else if (ev.type === 'stop') {
      this.addShake(.42, 2.1);
      var dir = E.DV[this.gravity];
      if (dir) {
        this.iceSpray(x, y, dir[0], dir[1], 1.2, true);
        // Stopped at the edge of the ice: the water answers with a ring.
        var ex = ev.cell[0] + dir[0], ey = ev.cell[1] + dir[1];
        if (!this.isIce(ex, ey) && !this.reduceMotion) {
          this.ripple(x + dir[0] * .62, y + dir[1] * .62, -FREEBOARD + .01, '#e6fbff', .12, .62, 620);
        }
      }
    } else if (ev.type === 'lost') {
      this.burst(x, y, .2, '#4DBAD8', 18, 1.75); this.ripple(x, y, .02, '#4DBAD8', .18, 1.05, 480);
      this.addShake(2.4, 4);
    }
    if (this.onEvent) this.onEvent(ev);
  };
  Renderer.prototype.updateEffects = function (dt) {
    var busy = false, i, p;
    if (this.reduceMotion) this.particles.length = 0;
    for (i = this.ripples.length - 1; i >= 0; i--) {
      p = this.ripples[i]; p.life += dt;
      if (p.life >= p.max) this.ripples.splice(i, 1); else busy = true;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i]; p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      var step = Math.min(dt, 40);
      p.x += p.vx * step; p.y += p.vy * step;
      var floor = this.groundAt(p.x, p.y) + .02;
      if (p.kind === 'skate') { p.z = .006; p.vx = 0; p.vy = 0; }
      else { p.z += p.vz * step; p.vz -= .000012 * step; }
      if (p.angle != null) p.angle += p.spin * step;
      var drag = Math.exp(-step * (p.z <= floor + .01 ? .013 : .002)); p.vx *= drag; p.vy *= drag;
      if (p.z < floor) {
        if (floor < 0) { p.life = Math.max(p.life, p.max - 60); }   // into the water
        p.z = floor; p.vz *= -.22; p.spin *= .55;
      }
      busy = true;
    }
    for (i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life += dt;
      if (this.flashes[i].life >= this.flashes[i].max) this.flashes.splice(i, 1); else busy = true;
    }
    for (i = this.grazes.length - 1; i >= 0; i--) {
      this.grazes[i].life += dt;
      if (this.grazes[i].life >= this.grazes[i].max) this.grazes.splice(i, 1); else busy = true;
    }
    for (i = this.vanishing.length - 1; i >= 0; i--) {
      this.vanishing[i].life += dt;
      if (this.vanishing[i].life >= this.vanishing[i].max) this.vanishing.splice(i, 1); else busy = true;
    }
    return busy;
  };

  /**
   * Which blocks would actually move if the aim being held were committed?
   * The preview never promises a move the board is not going to make.
   */
  Renderer.prototype.aimMovers = function (dir) {
    var st = this.stage, s = this.state;
    if (!st || !s || !dir || !E.DV[dir]) return null;
    if (this.moverDir === dir && this.moverState === s) return this.movers;
    var d = E.DV[dir], dx = d[0], dy = d[1], w = st.w, h = st.h, n = s.pos.length, i;
    var occ = {};
    for (i = 0; i < n; i++) if (s.alive[i]) occ[s.pos[i][1] * w + s.pos[i][0]] = i;
    var out = new Array(n), seen = new Array(n);
    var can = function (idx) {
      if (seen[idx]) return out[idx];
      seen[idx] = true; out[idx] = false;
      var nx = s.pos[idx][0] + dx, ny = s.pos[idx][1] + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
      if (st.terrain[ny * w + nx] === E.WALL) return false;
      var o = occ[ny * w + nx];
      out[idx] = (o === undefined || o === idx) ? true : can(o);
      return out[idx];
    };
    for (i = 0; i < n; i++) { out[i] = false; seen[i] = false; }
    for (i = 0; i < n; i++) if (s.alive[i]) can(i);
    this.moverDir = dir; this.moverState = s; this.movers = out;
    return out;
  };

  // ── the frame ───────────────────────────────────────────────────────────
  Renderer.prototype.frame = function (dt, now, gap) {
    this.time = now; var st = this.stage; if (!st || this.lost) return false;
    var busy = false, elapsed = 0, i;
    if (this.anim) {
      // RAF's timestamp can precede the input event in the same display frame.
      elapsed = Math.max(0, now - this.anim.t0);
      this.emitSlideIce(elapsed);
      for (i = 0; i < this.anim.events.length; i++) {
        var ev = this.anim.events[i]; if (this.anim.fired[i]) continue;
        var when = ev.t * TICK + (ev.type === 'stop' ? TAIL : TICK * .55);
        if (elapsed >= when) { this.anim.fired[i] = true; this.fireEvent(ev); }
      }
      for (i = 0; i < this.anim.passes.length; i++) {
        if (this.anim.firedPass[i]) continue; var pass = this.anim.passes[i];
        if (elapsed >= pass.t * TICK + TICK * .4) {
          this.anim.firedPass[i] = true; this.grazes.push({ cell: pass.cell, life: 0, max: 560 });
        }
      }
      if (elapsed >= this.anim.duration) {
        var cb = this.anim.onDone; this.state = this.anim.endState; this.anim = null; if (cb) cb();
      } else busy = true;
    }
    // The floe leans the way gravity is about to go.
    var want = { x: 0, y: 0 }, tiltDir = this.aimDir || (this.anim ? this.gravity : null);
    if (tiltDir && !this.reduceMotion) {
      var amount = this.aimDir ? clamp01(this.aimAmount || 0) : Math.min(1, Math.max(0, (this.anim.duration - elapsed) / 180));
      if (tiltDir === 'L') want.y = -TILT_DEG * amount; else if (tiltDir === 'R') want.y = TILT_DEG * amount;
      else if (tiltDir === 'U') want.x = TILT_DEG * amount; else want.x = -TILT_DEG * amount;
    }
    var k = 1 - Math.exp(-Math.min(dt, 64) / 70);
    if (this.reduceMotion) { this.tilt.x = 0; this.tilt.y = 0; }
    else ['x', 'y'].forEach(function (axis) {
      if (Math.abs(this.tilt[axis] - want[axis]) > .008) { this.tilt[axis] = lerp(this.tilt[axis], want[axis], k); busy = true; }
      else this.tilt[axis] = want[axis];
    }, this);
    var wantSlide = (this.aimDir && !this.reduceMotion && !this.anim) ? AIM_SLIDE * clamp01(this.aimAmount || 0) : 0;
    if (Math.abs(this.aimSlide - wantSlide) > .0015) { this.aimSlide = lerp(this.aimSlide, wantSlide, k); busy = true; }
    else this.aimSlide = wantSlide;
    var nx = 0, ny = 0;
    if (this.nudge) {
      this.nudge.life += dt; var np = this.nudge.life / this.nudge.max;
      if (np >= 1) this.nudge = null; else {
        var amp = Math.sin(np * Math.PI) * (1 - np) * .1, d = this.nudge.dir;
        nx = d === 'L' ? -amp : d === 'R' ? amp : 0; ny = d === 'U' ? -amp : d === 'D' ? amp : 0; busy = true;
      }
    }
    if (this.updateEffects(dt)) busy = true;
    if (this.reactions && this.reactions.tick(now)) busy = true;

    // World transform: the lean (tilt.x about X, tilt.y about Z) and nudge.
    this.world.rotation.set(-this.tilt.x * Math.PI / 180, 0, -this.tilt.y * Math.PI / 180);
    this.world.position.set(nx, 0, ny);
    var sx = 0, sy = 0;
    if (this.shake > .01) {
      sx = (Math.random() - .5) * this.shake; sy = (Math.random() - .5) * this.shake;
      this.shake *= Math.pow(.0025, dt / 1000); if (this.shake < .05) this.shake = 0; busy = true;
    }
    if (this.camBase) {
      var px = 1 / Math.max(8, this.cell) * .9;
      this.camera.position.set(this.camBase.x + sx * px, this.camBase.y + sy * px, this.camBase.z);
    }

    this.ice.setTime(this.reduceMotion ? 0 : now / 1000);
    this.camera.updateMatrixWorld(); this.world.updateMatrixWorld();
    this.ice.setView(this.camera, this.world);
    // The sun wanders a hair, so glitter on the frost twinkles instead of sitting still.
    if (this.tier === 'high' && !this.reduceMotion) this.keyLight.position.set(-4.2 + Math.sin(now / 5200) * .22, 7, 2.6 + Math.cos(now / 6100) * .18);
    this.updateBlocks(elapsed);
    this.updateGoals(now);
    this.updateWater(now);
    this.updateParticles();
    this.updateRipples();
    this.updateMarkers(dt);
    if (this.topMaterial) this.topMaterial.emissiveIntensity = this.clearGlow * .35;
    this.gl.render(this.scene, this.camera);
    if (this.gesture && !this.reduceMotion) busy = true;
    if (this.clearGlow > 0) { this.clearGlow = Math.max(0, this.clearGlow - dt / 900); busy = true; }
    if (this.shaderBroken) this.recoverShaders();
    if (this.monitor && this.monitor.observe(gap || dt, busy) === 'slow') this.downgrade('slow');
    return busy;
  };

  Renderer.prototype.updateBlocks = function (elapsed) {
    var st = this.stage, frames = this.anim ? this.anim.frames : null, state = this.anim ? null : this.state;
    var slideX = 0, slideY = 0, movers = null;
    if (state && this.aimDir && this.aimSlide > .001) {
      movers = this.aimMovers(this.aimDir);
      if (movers) { var dv = E.DV[this.aimDir]; slideX = dv[0] * this.aimSlide; slideY = dv[1] * this.aimSlide; }
    }
    for (var i = 0; i < this.blocks.length; i++) {
      var m = this.blocks[i], ud = m.userData, pos = null, squash = 0, vel = [0, 0], vanish = null;
      for (var v = 0; v < this.vanishing.length; v++) if (this.vanishing[v].block === i) vanish = this.vanishing[v];
      if (this.anim) {
        var gone = -1; for (var j = 0; j < frames.length; j++) if (!frames[j].alive[i]) { gone = j; break; }
        if (gone >= 0 && elapsed >= gone * TICK + TICK * .55) pos = vanish ? vanish.cell : null;
        else { pos = this.animPos(i, elapsed); squash = this.impactOf(i, elapsed); vel = this.speedOf(i, elapsed); }
      } else if (state && state.alive[i]) {
        pos = state.pos[i];
        if (movers && movers[i]) pos = [pos[0] + slideX, pos[1] + slideY];
      } else if (vanish) pos = vanish.cell;
      if (!pos) { m.visible = false; continue; }
      m.visible = true;
      var react = this.reactions && !ud.drifter ? this.reactions.visualFor(i, this.time) : null;
      var rk = react ? react.scale : 1, rdx = react ? react.dx : 0, rdy = react ? react.dy : 0, lift = react && react.lift ? react.lift : 0;
      var sxs = 1, sys = 1, szs = 1;
      if (squash && squash.amount) {
        var q = squash.amount;
        if (squash.axis === 'x') { sxs = 1 + q * .09; szs = 1 - q * .03; } else { szs = 1 + q * .09; sxs = 1 - q * .03; }
        sys = 1 - q * .08;
      }
      var hop = lift * .32;
      var vt = 0;
      if (vanish && (!state || !state.alive[i])) {
        vt = clamp01(vanish.life / vanish.max);
        var e = easeOut(vt);
        rk *= 1 - e * .92; hop += e * .55;
      }
      m.position.set(this.wx(pos[0] + .5 + rdx), hop, this.wz(pos[1] + .5 + rdy));
      m.scale.set(sxs * rk, sys * rk, szs * rk);
      m.rotation.y = vt ? easeOut(vt) * Math.PI * 1.2 : 0;
      // Lean back against the glide; flippers lift with speed.
      var speed = Math.min(1, Math.hypot(vel[0], vel[1]));
      if (ud.lean && !ud.drifter) {
        ud.lean.rotation.x = this.reduceMotion ? 0 : -vel[1] * .16;
        ud.lean.rotation.z = this.reduceMotion ? 0 : vel[0] * .16;
        ud.wings.forEach(function (wg) { wg.rotation.z = wg.userData.side * (.08 + speed * .75 + (vt ? .9 * Math.sin(vt * 9) : 0)); });
        ud.shadow.material.opacity = .42 * (1 - Math.min(1, hop * 2.2)) * (1 - vt);
        var expr = react && react.expression ? react.expression : 'normal';
        if (ud.expression !== expr) { ud.front.map = faceTexture(ud.colour, expr); ud.expression = expr; }
      }
    }
  };

  Renderer.prototype.updateGoals = function (now) {
    if (!this.goals) return;
    var t = this.reduceMotion ? 0 : now / 1000;
    for (var i = 0; i < this.goals.length; i++) {
      var g = this.goals[i], flash = 0, graze = 0, k;
      for (k = 0; k < this.flashes.length; k++) {
        var f = this.flashes[k];
        if (f.cell[0] === g.cell[0] && f.cell[1] === g.cell[1]) flash = Math.max(flash, 1 - f.life / f.max);
      }
      for (k = 0; k < this.grazes.length; k++) {
        var z = this.grazes[k];
        if (z.cell[0] === g.cell[0] && z.cell[1] === g.cell[1]) graze = Math.max(graze, 1 - z.life / z.max);
      }
      var pulse = .5 + .5 * Math.sin(t * 1.3 + g.phase);
      g.decal.material.emissiveIntensity = .45 + pulse * .2 + flash * 1.2;
      g.glow.material.opacity = .08 + pulse * .08 + flash * .6 + graze * .3;
      // Motes of light drift up off the aurora and fade.
      for (k = 0; k < g.motes.length; k++) {
        var mo = g.motes[k], sd = mo.userData.seed, life = this.reduceMotion ? .35 : ((t * .32 + sd) % 1);
        var ang = mo.userData.a + t * .4, rad = .16 + sd * .2;
        mo.position.set(Math.cos(ang) * rad, .06 + life * (.7 + flash * .4), Math.sin(ang) * rad);
        var ms = (.07 + sd * .05) * (1 + flash * .8); mo.scale.set(ms, ms, 1);
        mo.material.opacity = Math.sin(life * Math.PI) * (.55 + flash * .45);
      }
    }
  };

  Renderer.prototype.updateWater = function (now) {
    var t = this.reduceMotion ? 0 : now / 1000;
    this.water.material.normalMap.offset.set(t * .012, t * .008);
  };

  var tmpM = null, tmpQ = null, tmpV = null, tmpS = null, tmpE = null, tmpC = null;
  Renderer.prototype.updateParticles = function () {
    if (!tmpM) { tmpM = new T.Matrix4(); tmpQ = new T.Quaternion(); tmpV = new T.Vector3(); tmpS = new T.Vector3(); tmpE = new T.Euler(); tmpC = new T.Color(); }
    var ns = 0, np = 0, nm = 0, nk = 0, camQ = this.camera.quaternion;
    var invWorld = new T.Quaternion().copy(this.world.quaternion).invert();
    var faceCam = new T.Quaternion().copy(invWorld).multiply(camQ);
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i], f = 1 - p.life / p.max;
      tmpV.set(this.wx(p.x), p.z, this.wz(p.y));
      if (p.kind === 'shard' || p.kind === 'chip') {
        tmpE.set(p.angle, p.angle * .7, p.angle * 1.3); tmpQ.setFromEuler(tmpE);
        var s = p.size * (.35 + .65 * f) * 1.6; tmpS.set(s, s, s);
        tmpM.compose(tmpV, tmpQ, tmpS); this.shards.setMatrixAt(ns++, tmpM);
      } else if (p.kind === 'frost') {
        var fs = p.size * 1.0 * (1.2 - .5 * f) * Math.min(1, f * 2.2); tmpS.set(fs, fs, fs);
        tmpM.compose(tmpV, faceCam, tmpS); this.puffs.setMatrixAt(np++, tmpM);
      } else if (p.kind === 'skate') {
        tmpQ.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(p.dx, p.dy));
        tmpS.set(.03 * (.4 + .6 * f), 1, .34 * (.5 + .5 * f)); tmpM.compose(tmpV, tmpQ, tmpS); this.marks.setMatrixAt(nm++, tmpM);
      } else if (p.kind === 'spark' && nk < 128) {
        tmpE.set(p.angle, p.angle, 0); tmpQ.setFromEuler(tmpE);
        var ks = p.size * Math.min(1, f * 1.6); tmpS.set(ks, ks, ks);
        tmpM.compose(tmpV, tmpQ, tmpS); this.sparks.setMatrixAt(nk, tmpM);
        tmpC.set(p.col); this.sparks.setColorAt(nk, tmpC); nk++;
      }
    }
    this.shards.count = ns; this.puffs.count = np; this.marks.count = nm; this.sparks.count = nk;
    this.shards.instanceMatrix.needsUpdate = true; this.puffs.instanceMatrix.needsUpdate = true;
    this.marks.instanceMatrix.needsUpdate = true; this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  };

  Renderer.prototype.updateRipples = function () {
    for (var i = 0; i < this.ringPool.length; i++) {
      var ring = this.ringPool[i], r = this.ripples[i];
      if (!r) { ring.visible = false; continue; }
      var p = clamp01(r.life / r.max), rad = lerp(r.r0, r.r1, easeOut(p));
      var v = new T.Vector3(this.wx(r.x), r.z, this.wz(r.y));
      if (r.z > -FREEBOARD + .05) this.world.localToWorld(v);
      ring.position.copy(v);
      ring.scale.set(rad, 1, rad);
      ring.material.color.set(r.col || '#ffffff');
      ring.material.opacity = (1 - p) * .8;
      ring.visible = true;
    }
  };

  Renderer.prototype.updateMarkers = function (dt) {
    var self = this;
    ['U', 'R', 'D', 'L'].forEach(function (d) {
      var sp = self.markers[d], a = 0;
      if (self.aimDir === d) a = .9;
      else if (self.gravity === d && !self.aimDir) a = .32;
      sp.material.opacity = a; sp.visible = a > 0;
      var s = self.aimDir === d ? .56 : .44; sp.scale.set(s, s, 1);
    });
    // First-run swipe cue: a fingertip gliding across the floe.
    var show = this.gesture && this.stage;
    this.cue.visible = !!show;
    this.cueTrail.forEach(function (t) { t.visible = !!show && !self.reduceMotion; });
    if (!show) return;
    var d = this.gestureDir, horiz = d === 'L' || d === 'R', sign = d === 'R' || d === 'D' ? 1 : -1;
    var span = (horiz ? this.stage.w : this.stage.h) * .55;
    var at = function (e) {
      var o = -span / 2 + span * e;
      return horiz ? new T.Vector3(o * sign, 1.05, 0) : new T.Vector3(0, 1.05, o * sign);
    };
    if (this.reduceMotion) {
      this.cue.position.copy(at(1)); this.cue.material.opacity = .5; this.cue.scale.set(.3, .3, 1); return;
    }
    this.gestureT += dt;
    var p = (this.gestureT % 2100) / 2100, travel = clamp01(p / .55);
    var e = travel < 1 ? easeOut(travel) : 1, fade = travel < .08 ? travel / .08 : (travel > .86 ? Math.max(0, (1 - travel) / .14) : 1);
    this.cue.position.copy(at(e)); this.cue.material.opacity = .8 * fade; this.cue.scale.set(.3, .3, 1);
    this.cueTrail.forEach(function (t, i) {
      var back = Math.max(0, e - (i + 1) * .045);
      t.position.copy(at(back)); t.material.opacity = .35 * fade * (1 - i / 6) * (e > .02 ? 1 : 0);
      var s = .24 * (1 - i / 9); t.scale.set(s, s, 1);
    });
  };

  Renderer.prototype.celebrate = function () {
    var st = this.stage, x = st.w / 2, y = st.h / 2, lead = 0;
    if (st.colour) for (var i = 0; i < st.colour.length; i++) { if (st.colour[i] !== E.GRAY) { lead = st.colour[i]; break; } }
    if (!this.reduceMotion) {
      this.ripple(x, y, -FREEBOARD + .01, '#dff8ff', Math.max(st.w, st.h) * .5, Math.max(st.w, st.h) * 1.05, 900);
      this.burst(x, y, .5, paletteOf(lead).hi, 18, 1.6); this.addShake(1.6, 3.4);
    }
    this.clearGlow = 1;
  };
  Renderer.prototype.rebuff = function (dir) {
    if (this.reduceMotion) {
      var st = this.stage; this.ripple(st.w / 2, st.h / 2, .02, '#9fc7da', .42, .56, 260); return;
    }
    this.nudge = { dir: dir, life: 0, max: 300 };
  };

  /* Read back a rectangle of the last frame, in device pixels. Tests use this
     to look at what was actually drawn; it renders first so the buffer holds
     the current picture. */
  Renderer.prototype.readPixels = function (x, y, w, h) {
    this.gl.render(this.scene, this.camera);
    var gl = this.gl.getContext(), out = new Uint8Array(w * h * 4);
    gl.readPixels(x, this.canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  };

  root.TiltRender = {
    Renderer: Renderer, PALETTE: PALETTE, TICK: TICK, TAIL: TAIL, MAX_CELL: MAX_CELL,
    TEXTURE_FILES: TEXTURE_FILES, FREEBOARD: FREEBOARD, PENGUIN: PENGUIN,
    floorLoops: floorLoops, drawFace: drawFace, deviceInfo: deviceInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
