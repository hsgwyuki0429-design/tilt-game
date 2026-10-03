'use strict';
/*
 * TILT — the ice.
 *
 * Everything that makes the floe and the water around it look like ice and
 * water rather than painted shapes. render.js owns the scene and the clock;
 * this file owns the materials, and the textures they read.
 *
 * ── what the player sees ────────────────────────────────────────────────────
 *
 *   The top of the floe is melt-polished ice with frosted patches. Looking
 *   into it you see fractures and trapped bubbles at several depths, each
 *   deeper layer shifted by parallax and tinted bluer, because ice absorbs red
 *   light first. Near an edge the ice is thin and glows cyan; the joints
 *   between cells are chiselled grooves; frosted patches glitter. The flanks
 *   run from pale at the lip to deep glacier blue, with a lapping line of slush
 *   at the water. Under the water the flanks catch moving caustics. The water
 *   is turquoise on the shelf around the ice, deeper away from it, with a
 *   broken line of foam where it meets the wall.
 *
 * ── how it is made ──────────────────────────────────────────────────────────
 *
 *   One tileable DETAIL texture and one BUMP texture, generated once in the
 *   background and shared by every stage and every renderer: grain, frost,
 *   hairline fractures and bubbles in the four channels of the first, the
 *   grain's gradient in the second. A stage adds only two tiny textures: a
 *   w×h CELL map (is there ice here, is it cracked, a random tint) and a
 *   signed-distance field of the floe, so loading a stage costs a few
 *   milliseconds however detailed the ice is.
 *
 *   The shading is a patch to three.js's own physical material, so lights,
 *   shadows, reflections, clear coat and tone mapping are all still its own.
 *   The patch decides the albedo, roughness, a bump and a little emission,
 *   from the point's position in the floe's own space. It never depends on UV
 *   coordinates, so the rounded corners and the bevel need none.
 *
 * ── two tiers ───────────────────────────────────────────────────────────────
 *
 *   HIGH marches ICE_LAYERS rays-worth of depth through the ice (see
 *   quality.js), adds caustics, glitter and foam. LITE draws the same ice
 *   with one flat layer and none of those. Same shader, same textures; only
 *   #defines differ, so switching tiers is a recompile and nothing else.
 */
(function (root) {
  var T = root.THREE;
  var E = root.TiltEngine;
  var Q = root.TiltQuality;

  // ── the floe's geometry, which the shader has to agree with ──────────────
  var FREEBOARD = .36;        // ice above the water line
  var DRAFT = 1.5;            // total slab thickness
  var BEVEL = .075;
  var INSET = .018;           // wall inset from the cell boundary
  var MARGIN = 2.5;           // how far the distance field reaches past the board, in cells
  var SDF_RES = 16;           // distance-field texels per cell
  var SDF_RANGE = 1.2;        // the field stores -1.2 .. +1.2 cells

  // ── noise ───────────────────────────────────────────────────────────────
  function hash1(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
  function Rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
      return s / 4294967296;
    };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

  function lattice(per, seed) {
    var t = new Float32Array(per * per);
    for (var i = 0; i < t.length; i++) t[i] = hash1(i * 1.7133 + seed * 19.19 + per * 3.1);
    return t;
  }
  /* Value noise that wraps every `per` lattice cells, so the texture tiles. */
  function vnoise(tab, per, x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var xa = ((x0 % per) + per) % per, xb = (xa + 1) % per;
    var ya = ((y0 % per) + per) % per, yb = (ya + 1) % per;
    var a = tab[ya * per + xa], b = tab[ya * per + xb], c = tab[yb * per + xa], d = tab[yb * per + xb];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ── the detail bank ─────────────────────────────────────────────────────
  /*
   * Generated in slices of a few milliseconds so that a phone is never frozen
   * by it, then handed to every renderer that asked. Until it arrives the ice
   * is drawn flat (a neutral placeholder), which is what the launch curtain
   * and the home screen cover.
   *
   *   detail  R  grain / height          G  frost mask
   *           B  hairline fractures      A  trapped bubbles
   *   bump    R,G  gradient of the grain, 0.5 = flat
   */
  var Bank = {
    data: null,            // { size, detail: Uint8Array, bump: Uint8Array }
    running: false,
    want: 0,
    waiting: [],           // { size, cb }

    /* Forget everything generated (tests use this to run the generator again). */
    reset: function () { this.data = null; this.want = 0; this.waiting = []; this.failed = false; },

    request: function (size, cb) {
      if (this.data && this.data.size >= size) { cb(this.data); return; }
      this.waiting.push({ size: size, cb: cb });
      if (size > this.want) this.want = size;
      this.start();
    },
    start: function () {
      if (this.running) return;
      this.running = true;
      var self = this, size = this.want, job = makeJobs(size), at = 0;
      function pump() {
        var t0 = now(), deadline = t0 + 7;
        try {
          while (at < job.jobs.length) {
            if (job.jobs[at](deadline)) at++;
            if (now() >= deadline) break;
          }
        } catch (e) {            // out of memory, say: leave the ice plain rather than wedge
          self.running = false; self.failed = true; self.waiting = [];
          if (typeof console !== 'undefined' && console.warn) console.warn('TILT: ice detail not generated', e);
          return;
        }
        if (at < job.jobs.length) { setTimeout(pump, 0); return; }
        self.data = job.result();
        self.running = false;
        var rest = [];
        self.waiting.forEach(function (w) { if (self.data.size >= w.size) w.cb(self.data); else rest.push(w); });
        self.waiting = rest;
        if (rest.length) self.start();
      }
      setTimeout(pump, 0);
    }
  };
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  /* A job that must never take the others down with it: if the canvas will not
     draw (it can fail on a starved phone), that channel stays empty and the
     ice is merely plainer. */
  function guarded(job, fail) {
    return function (deadline) {
      try { return job(deadline); } catch (e) { fail(); return true; }
    };
  }

  function makeJobs(N) {
    var S = N / 512;
    var rF = new Float32Array(N * N), gF = new Float32Array(N * N);
    var crack = null, bubble = null, row = 0, grow = 0;
    var perR = [6, 12, 24, 48, 96, 192], perG = [3, 6, 12, 24];
    var tabR = perR.map(function (p, i) { return lattice(p, 1 + i); });
    var tabG = perG.map(function (p, i) { return lattice(p, 40 + i); });
    var detail = new Uint8Array(N * N * 4), bump = new Uint8Array(N * N * 4);
    var jobs = [];

    // Grain and frost, a few rows at a time.
    jobs.push(function (deadline) {
      while (row < N) {
        var v = row / N, o, x;
        for (x = 0; x < N; x++) {
          var u = x / N, r = 0, amp = 1, tot = 0, g = 0, ga = 1, gt = 0;
          for (o = 0; o < perR.length; o++) {
            r += amp * vnoise(tabR[o], perR[o], u * perR[o], v * perR[o]); tot += amp; amp *= .56;
          }
          for (o = 0; o < perG.length; o++) {
            g += ga * vnoise(tabG[o], perG[o], u * perG[o], v * perG[o]); gt += ga; ga *= .5;
          }
          r = clamp01((r / tot - .5) * 2.4 + .5);
          g = smooth(.32, .68, g / gt);
          rF[row * N + x] = r; gF[row * N + x] = g;
        }
        row++;
        if (now() >= deadline) return row >= N;
      }
      return true;
    });

    // Hairline fractures: long meandering lines that branch, each with a wide
    // faint halo (light scatters out of a crack) and a sharp core. Drawn nine
    // times, shifted by a tile, so they wrap.
    jobs.push(guarded(function () {
      var c = document.createElement('canvas'); c.width = c.height = N;
      var g = c.getContext('2d', { willReadFrequently: true }), rnd = Rng(11), lines = [], k, s;
      g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (k = 0; k < 44; k++) {
        var x = rnd() * N, y = rnd() * N, a = rnd() * 6.2832, len = (80 + rnd() * 330) * S;
        var seg = 13 * S, pts = [[x, y]], w = (.9 + rnd() * 1.4) * S, al = .5 + rnd() * .5;
        for (s = 0; s < len / seg; s++) {
          a += (rnd() - .5) * .6; x += Math.cos(a) * seg; y += Math.sin(a) * seg; pts.push([x, y]);
          if (rnd() < .13) {
            var bx = x, by = y, ba = a + (rnd() < .5 ? .85 : -.85) + (rnd() - .5) * .4, bp = [[bx, by]], bl = (3 + rnd() * 9) | 0;
            for (var q = 0; q < bl; q++) { ba += (rnd() - .5) * .6; bx += Math.cos(ba) * seg * .8; by += Math.sin(ba) * seg * .8; bp.push([bx, by]); }
            lines.push({ pts: bp, w: w * .6, al: al * .8 });
          }
        }
        lines.push({ pts: pts, w: w, al: al });
      }
      [[4.2, .1], [1, 1]].forEach(function (pass) {
        lines.forEach(function (ln) {
          g.lineWidth = ln.w * pass[0]; g.strokeStyle = 'rgba(255,255,255,' + (ln.al * pass[1]) + ')';
          for (var oy = -N; oy <= N; oy += N) for (var ox = -N; ox <= N; ox += N) {
            g.beginPath();
            g.moveTo(ln.pts[0][0] + ox, ln.pts[0][1] + oy);
            for (var i = 1; i < ln.pts.length; i++) g.lineTo(ln.pts[i][0] + ox, ln.pts[i][1] + oy);
            g.stroke();
          }
        });
      });
      crack = g.getImageData(0, 0, N, N).data;
      return true;
    }, function () { crack = new Uint8ClampedArray(N * N * 4); }));

    // Trapped air: clusters and scatter of soft discs, mostly tiny.
    jobs.push(guarded(function () {
      var c = document.createElement('canvas'); c.width = c.height = N;
      var g = c.getContext('2d', { willReadFrequently: true }), rnd = Rng(23), i;
      g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
      var sp = document.createElement('canvas'); sp.width = sp.height = 64;
      var sg = sp.getContext('2d'), rg = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(.6, 'rgba(255,255,255,.8)'); rg.addColorStop(.86, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'lighter';
      var centres = [];
      for (i = 0; i < 38; i++) centres.push([rnd() * N, rnd() * N, (20 + rnd() * 60) * S]);
      var total = Math.round(N * N / 420);
      for (i = 0; i < total; i++) {
        var x, y;
        if (rnd() < .55) {
          var cc = centres[(rnd() * centres.length) | 0], ang = rnd() * 6.2832, d = Math.abs(rnd() + rnd() - 1) * cc[2];
          x = cc[0] + Math.cos(ang) * d; y = cc[1] + Math.sin(ang) * d;
        } else { x = rnd() * N; y = rnd() * N; }
        var r = (1.1 + Math.pow(rnd(), 3) * 3.6) * S;
        g.globalAlpha = .3 + rnd() * .6;
        for (var oy = -N; oy <= N; oy += N) for (var ox = -N; ox <= N; ox += N) {
          var px = x + ox, py = y + oy;
          if (px < -r || py < -r || px > N + r || py > N + r) continue;
          g.drawImage(sp, px - r, py - r, r * 2, r * 2);
        }
      }
      bubble = g.getImageData(0, 0, N, N).data;
      return true;
    }, function () { bubble = new Uint8ClampedArray(N * N * 4); }));

    // Gradient of the grain, for the bump map.
    jobs.push(function (deadline) {
      var k = 4 * S, W = N;
      while (grow < N) {
        var y = grow, ya = (y + N - 1) % N, yb = (y + 1) % N;
        for (var x = 0; x < N; x++) {
          var xa = (x + N - 1) % W, xb = (x + 1) % W, i = (y * N + x) * 4;
          var gx = (rF[y * N + xb] - rF[y * N + xa]) * k, gy = (rF[yb * N + x] - rF[ya * N + x]) * k;
          bump[i] = clamp01(gx * .5 + .5) * 255; bump[i + 1] = clamp01(gy * .5 + .5) * 255; bump[i + 2] = 128; bump[i + 3] = 255;
        }
        grow++;
        if (now() >= deadline) return grow >= N;
      }
      return true;
    });

    jobs.push(function () {
      for (var p = 0; p < N * N; p++) {
        var i = p * 4;
        detail[i] = rF[p] * 255; detail[i + 1] = gF[p] * 255; detail[i + 2] = crack[i]; detail[i + 3] = bubble[i];
      }
      return true;
    });

    return { jobs: jobs, result: function () { return { size: N, detail: detail, bump: bump }; } };
  }

  // ── what a stage adds: a cell map and a distance field ───────────────────
  /* Per cell: R ice (255) or water (0), G cracked ice, B a random tint. */
  function cellData(stage) {
    var w = stage.w, h = stage.h, out = new Uint8Array(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      var t = stage.terrain[i];
      out[i * 4] = t === E.WALL ? 0 : 255;
      out[i * 4 + 1] = t === E.HAZARD ? 255 : 0;
      out[i * 4 + 2] = Math.round(hash1(i * 3.7 + w * 11 + h * 5) * 255);
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  /*
   * Signed distance from each point to the floe's wall, in cells: positive
   * inside the ice, negative in the water. Measured to the cell squares and
   * then moved by the wall's inset, so 0 is where the wall really stands.
   * The rounded corners are not followed; they differ by under a tenth of a
   * cell, which the foam and the glow do not show.
   */
  function sdfData(stage) {
    var w = stage.w, h = stage.h, SW = Math.round((w + 2 * MARGIN) * SDF_RES), SH = Math.round((h + 2 * MARGIN) * SDF_RES);
    var out = new Uint8Array(SW * SH), ice = [], gap = [], i, j, c;
    for (c = 0; c < w * h; c++) (stage.terrain[c] === E.WALL ? gap : ice).push([c % w, (c / w) | 0]);
    for (j = 0; j < SH; j++) for (i = 0; i < SW; i++) {
      var px = (i + .5) / SDF_RES - MARGIN, py = (j + .5) / SDF_RES - MARGIN;
      var dOut = 1e9, dIn = Math.min(px, py, w - px, h - py), k, cell, dx, dy, d;
      for (k = 0; k < ice.length; k++) {
        cell = ice[k]; dx = Math.max(cell[0] - px, 0, px - cell[0] - 1); dy = Math.max(cell[1] - py, 0, py - cell[1] - 1);
        d = Math.sqrt(dx * dx + dy * dy); if (d < dOut) dOut = d;
      }
      for (k = 0; k < gap.length; k++) {
        cell = gap[k]; dx = Math.max(cell[0] - px, 0, px - cell[0] - 1); dy = Math.max(cell[1] - py, 0, py - cell[1] - 1);
        d = Math.sqrt(dx * dx + dy * dy); if (d < dIn) dIn = d;
      }
      var sd = (dOut > 0 ? -dOut : dIn) - INSET;
      out[j * SW + i] = Math.round(clamp01((sd + SDF_RANGE) / (2 * SDF_RANGE)) * 255);
    }
    return { data: out, w: SW, h: SH, rect: [-w / 2 - MARGIN, -h / 2 - MARGIN, w + 2 * MARGIN, h + 2 * MARGIN] };
  }

  // ── the shaders ──────────────────────────────────────────────────────────
  var VERT_PARS = [
    'varying vec3 vIcePos;', 'varying vec3 vIceNrm;', 'varying vec3 vIceView;'
  ].join('\n');

  /* Everything is worked out in the floe's own space, so the ice stays put on
     the mesh while the whole world leans. */
  var VERT_MAIN = [
    'vIcePos = transformed;',
    'vIceNrm = objectNormal;',
    'vIceView = transpose(mat3(modelMatrix)) * (cameraPosition - (modelMatrix * vec4(transformed, 1.0)).xyz);'
  ].join('\n');

  var FRAG_COMMON = [
    'uniform sampler2D uDetail;', 'uniform sampler2D uBump;', 'uniform sampler2D uCells;', 'uniform sampler2D uSdf;',
    'uniform vec2 uBoard;', 'uniform vec4 uSdfRect;', 'uniform float uTime;', 'uniform vec3 uAbsorb;',
    'uniform vec4 uTune;', 'uniform mat3 uIceNM;',
    'uniform vec3 uColMilk;', 'uniform vec3 uColShallow;', 'uniform vec3 uColEdge;',
    'uniform vec3 uColSide;', 'uniform vec3 uColMid;', 'uniform vec3 uColDeep;',
    'float iceHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float iceNoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(iceHash(i), iceHash(i + vec2(1.0, 0.0)), f.x), mix(iceHash(i + vec2(0.0, 1.0)), iceHash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'float iceAt(ivec2 c) {',
    '  ivec2 b = ivec2(uBoard);',
    '  if (c.x < 0 || c.y < 0 || c.x >= b.x || c.y >= b.y) return 0.0;',
    '  return texelFetch(uCells, c, 0).r;',
    '}',
    // Which two object axes span the face a point is on, and back.
    'vec2 iceFace(vec3 p, int axis) { return axis == 0 ? p.xz : (axis == 1 ? vec2(p.z, -p.y) : vec2(p.x, -p.y)); }',
    'vec3 iceTan(vec2 g, int axis) { return axis == 0 ? vec3(g.x, 0.0, g.y) : (axis == 1 ? vec3(0.0, -g.y, g.x) : vec3(g.x, -g.y, 0.0)); }'
  ].join('\n');

  var FRAG_FLOE_PARS = [
    'varying vec3 vIcePos;', 'varying vec3 vIceNrm;', 'varying vec3 vIceView;',
    // Moving light on the submerged flanks (after Dave Hoskins' tileable water caustic).
    'float iceCaustic(vec2 uv, float t) {',
    '  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;',
    '  vec2 i = p; float c = 1.0; float inten = 0.005;',
    '  for (int n = 0; n < 4; n++) {',
    '    float tt = t * (1.0 - (3.5 / float(n + 1)));',
    '    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));',
    '    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));',
    '  }',
    '  c /= 4.0; c = 1.17 - pow(c, 1.4);',
    '  return clamp(pow(abs(c), 8.0), 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Replaces <map_fragment>: works out iceCol, iceRough, iceBump and iceEmis
     for the point, and sets the albedo. The later hooks only consume them. */
  var FRAG_FLOE_MAIN = [
    'vec3 nO = normalize(vIceNrm);',
    'vec3 vO = normalize(vIceView);',
    'vec3 pO = vIcePos;',
    'vec3 aN = abs(nO);',
    'int axis = (aN.y >= aN.x && aN.y >= aN.z) ? 0 : ((aN.x >= aN.z) ? 1 : 2);',
    'float topK = smoothstep(0.55, 0.92, nO.y);',
    'vec2 bc = pO.xz + uBoard * 0.5;',
    'vec2 bcIn = bc - nO.xz * 0.04;',
    'ivec2 cell = ivec2(clamp(floor(bcIn), vec2(0.0), uBoard - 1.0));',
    'vec4 cd = texelFetch(uCells, cell, 0);',
    // Each top cell gets its own window into the detail, hidden by the joints. A
    // wall runs past many cells, so there the window must not jump.
    'vec2 cellOff = vec2(iceHash(vec2(cell) + 1.7), iceHash(vec2(cell) + 9.1)) * topK;',
    'float sd = texture(uSdf, (pO.xz - uSdfRect.xy) / uSdfRect.zw).r * 2.4 - 1.2;',
    'float depthY = -pO.y;',
    'vec2 fuv = iceFace(pO, axis);',
    'vec4 dA = texture(uDetail, fuv * 0.5 + cellOff);',
    'vec4 dB = texture(uDetail, fuv * 0.19 + cellOff.yx * 3.0);',
    'vec2 gA = texture(uBump, fuv * 0.5 + cellOff).rg * 2.0 - 1.0;',
    'vec2 gB = texture(uBump, fuv * 1.9 + cellOff.yx * 5.0).rg * 2.0 - 1.0;',

    // Frost sits away from the edges, where the ice is thick and cold.
    'float frostN = smoothstep(0.36, 0.72, mix(dA.g, dB.g, 0.6));',
    'float frost = clamp(frostN * uTune.z, 0.0, 1.0) * smoothstep(0.02, 0.5, sd) * topK;',
    'float edgeK = exp(-max(sd - 0.06, 0.0) * 7.0) * topK;',

    // Looking into the ice: layers of fractures and bubbles, each deeper one
    // dimmer and bluer, found by following the refracted view ray down.
    'vec3 vol = vec3(0.0);',
    '#if ICE_LAYERS > 0',
    '{',
    '  vec3 rd = refract(-vO, nO, 0.7634);',
    '  float cosr = max(abs(dot(rd, nO)), 0.28);',
    '  for (int k = 0; k < ICE_LAYERS; k++) {',
    '    float fk = float(k);',
    '    float tk = (0.05 + fk * 0.15) / cosr;',
    '    vec3 pk = pO + rd * tk;',
    '    vec4 dk = texture(uDetail, iceFace(pk, axis) * 0.5 + cellOff + vec2(fk * 0.317, fk * 0.529), fk * 0.9);',
    '    vec3 att = exp(-uAbsorb * tk);',
    '    float cr = smoothstep(0.30, 0.85, dk.b);',
    '    float bu = smoothstep(0.30, 0.80, dk.a);',
    '    vol += att * (cr * 0.85 * vec3(0.74, 0.92, 1.0) + bu * 0.34 * vec3(0.96, 0.99, 1.0) + dk.g * 0.07 * vec3(0.45, 0.78, 0.95));',
    '  }',
    '}',
    '#else',
    'vol = (smoothstep(0.35, 0.90, dA.b) * 0.45 + smoothstep(0.30, 0.80, dA.a) * 0.18) * vec3(0.86, 0.95, 1.0);',
    '#endif',

    // The body colour: clear ice on top, glacier blue down the flanks.
    'vec3 topBase = mix(uColShallow, uColMilk, frost);',
    'topBase = mix(topBase, uColEdge, edgeK * 0.55);',
    'vec3 sideBase = mix(uColSide, uColMid, smoothstep(0.0, 0.5, depthY));',
    'sideBase = mix(sideBase, uColDeep, smoothstep(0.35, 1.3, depthY));',
    'vec3 col = mix(sideBase, topBase, topK) + vol * (1.0 - frost * 0.85);',

    // Chiselled joints between neighbouring cells.
    'float sl = iceAt(cell + ivec2(-1, 0)), sr = iceAt(cell + ivec2(1, 0)), su = iceAt(cell + ivec2(0, -1)), sb = iceAt(cell + ivec2(0, 1));',
    'vec2 fr = bcIn - vec2(cell);',
    'float wob = (iceNoise(bc * 8.0) - 0.5) * 0.012;',
    'float seamD = 1.0; vec2 seamDir = vec2(0.0);',
    'float s0 = fr.x + wob;       if (sl > 0.5 && s0 < seamD) { seamD = s0; seamDir = vec2( 1.0,  0.0); }',
    'float s1 = 1.0 - fr.x + wob; if (sr > 0.5 && s1 < seamD) { seamD = s1; seamDir = vec2(-1.0,  0.0); }',
    'float s2 = fr.y + wob;       if (su > 0.5 && s2 < seamD) { seamD = s2; seamDir = vec2( 0.0,  1.0); }',
    'float s3 = 1.0 - fr.y + wob; if (sb > 0.5 && s3 < seamD) { seamD = s3; seamDir = vec2( 0.0, -1.0); }',
    'float st = clamp(seamD / 0.034, 0.0, 1.0);',
    'float groove = (1.0 - st * st * (3.0 - 2.0 * st)) * topK;',
    'vec3 seamBump = vec3(-seamDir.x, 0.0, -seamDir.y) * (6.0 * st * (1.0 - st) / 0.034 * uTune.y) * topK;',
    'col = mix(col, uColDeep * 0.9, groove * 0.5);',

    // Cracked ice (stages that have it) and per-cell variation.
    'col = mix(col, uColDeep * 0.85, cd.g * 0.68 * topK);',
    'col += cd.g * smoothstep(0.2, 0.7, dA.b) * 0.85 * topK;',
    'col *= 0.965 + cd.b * 0.07;',

    // Water: darker, bluer and lit by caustics below the line, and a lapping
    // band of slush right at it.
    'float uw = smoothstep(0.0, 0.06, depthY - ICE_FREEBOARD);',
    'col = mix(col, col * vec3(0.62, 0.86, 1.0), uw);',
    'col = mix(col, uColDeep * 0.75, smoothstep(0.0, 1.0, depthY - ICE_FREEBOARD) * 0.55 * uw);',
    'float lap = sin(fuv.x * 3.1 + uTime * 1.6) * 0.012 + sin(fuv.x * 7.3 - uTime * 1.1) * 0.006;',
    'float wl = exp(-pow((depthY - ICE_FREEBOARD - lap) / 0.028, 2.0)) * (1.0 - topK);',
    'col = mix(col, vec3(0.92, 0.98, 1.0), wl * 0.55);',
    'vec3 iceEmis = vec3(0.0);',
    '#ifdef ICE_CAUSTICS',
    'iceEmis += vec3(0.55, 0.95, 1.0) * iceCaustic(fuv * 0.55, uTime * 0.6) * uw * exp(-(depthY - ICE_FREEBOARD) * 1.6) * (1.0 - topK) * 0.6;',
    '#endif',

    // How glossy: polished near the edges and in the clear, dull where frosted.
    'float rough = mix(0.10, 0.62, frost);',
    'rough = mix(rough, 0.35, groove);',
    'rough *= mix(1.0, 0.65, exp(-max(sd, 0.0) * 7.0));',
    'rough = mix(0.08, rough, topK);',
    'rough = clamp(rough + (dA.r - 0.5) * 0.12, 0.04, 0.95);',

    // Bump: grain (more of it where it is frosty) and the joints.
    'vec3 iceBump = -iceTan(gA * 0.7 + gB * 0.3, axis) * uTune.x * (0.35 + 0.65 * frost) * (0.25 + 0.75 * topK) + seamBump;',
    '#ifdef ICE_GLITTER',
    '{',
    '  vec2 gp = fuv * 30.0;',
    '  vec2 gid = floor(gp);',
    '  float gh = iceHash(gid + cellOff * 11.0);',
    '  float gon = step(0.62, gh) * topK * smoothstep(0.15, 0.5, frostN) * uTune.w;',
    '  vec2 gr = vec2(iceHash(gid + 3.7), iceHash(gid + 8.3)) * 2.0 - 1.0;',
    '  gr += vec2(sin(uTime * 0.9 + gh * 40.0), cos(uTime * 0.8 + gh * 31.0)) * 0.25;',
    '  float gm = gon * smoothstep(0.5, 0.15, length(fract(gp) - 0.5));',
    '  iceBump += iceTan(gr * 0.9 * gm, axis);',
    '  rough = mix(rough, 0.14, gm);',
    '}',
    '#endif',
    'float iceRough = rough;',

    // A little light that comes from inside: thin ice glows, and everything is
    // lit a touch from within so shade is blue and never black.
    'iceEmis += col * 0.14 + uColEdge * edgeK * 0.5 + vec3(0.8, 0.95, 1.0) * wl * 0.3;',
    'diffuseColor.rgb = clamp(col, 0.0, 1.0);'
  ].join('\n');

  var FRAG_WATER_PARS = [
    'uniform vec3 uWaterShallow;', 'uniform vec3 uColFoam;', 'varying vec3 vWp;'
  ].join('\n');

  var FRAG_WATER_MAIN = [
    'float wsd = texture(uSdf, (vWp.xz - uSdfRect.xy) / uSdfRect.zw).r * 2.4 - 1.2;',
    'float dOut = max(-wsd, 0.0);',
    // A pale far side, a deeper foreground and long world-space wavelets
    // make the sea read as a surface receding behind the floe.
    'float nearWater = smoothstep(-uBoard.y * 0.65, uBoard.y * 0.8, vWp.z);',
    'diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.15, 1.18, 1.12), diffuseColor.rgb * vec3(0.62, 0.78, 0.88), nearWater);',
    'diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow, exp(-dOut * 2.6) * 0.5);',
    'float wave = sin(vWp.z * 18.0 + sin(vWp.x * 2.1 + uTime * 0.35) * 0.8 - uTime * 0.8);',
    'float wavelet = smoothstep(0.95, 1.0, wave) * smoothstep(0.3, 0.8, iceNoise(vWp.xz * vec2(1.8, 3.0)));',
    'diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow, wavelet * 0.16 * smoothstep(0.2, 0.7, dOut));',
    'diffuseColor.rgb *= 1.0 - 0.30 * exp(-dOut * 14.0);',
    'diffuseColor.a *= mix(0.60, 1.0, smoothstep(0.0, 1.0, dOut));',
    'float foam = 0.0;',
    '#ifdef ICE_FOAM',
    '{',
    '  float n1 = iceNoise(vWp.xz * 12.0 + vec2(uTime * 0.21, -uTime * 0.13));',
    '  float n2 = iceNoise(vWp.xz * 17.0 - vec2(uTime * 0.17, uTime * 0.11));',
    '  float band = smoothstep(0.15, 0.0, dOut + (n1 - 0.5) * 0.06);',
    '  float breakup = smoothstep(0.28, 0.62, n1 * 0.6 + n2 * 0.5);',
    '  float slush = smoothstep(0.74, 0.86, n2) * smoothstep(0.34, 0.06, dOut);',
    '  foam = clamp(band * mix(0.45, 1.0, breakup) + slush * 0.3, 0.0, 1.0);',
    '}',
    '#endif',
    'diffuseColor.rgb = mix(diffuseColor.rgb, uColFoam, foam);',
    'diffuseColor.a = mix(diffuseColor.a, 0.96, foam);'
  ].join('\n');

  function injectFloe(shader, u) {
    Object.keys(u).forEach(function (k) { shader.uniforms[k] = u[k]; });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_COMMON + '\n' + FRAG_FLOE_PARS)
      .replace('#include <map_fragment>', FRAG_FLOE_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = iceRough;')
      .replace('#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(normal + uIceNM * iceBump);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += iceEmis;');
  }
  function injectWater(shader, u) {
    Object.keys(u).forEach(function (k) { shader.uniforms[k] = u[k]; });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_COMMON + '\n' + FRAG_WATER_PARS)
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n' + FRAG_WATER_MAIN)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uColFoam * foam * 0.28;');
  }

  // ── the kit a renderer holds ─────────────────────────────────────────────
  function dataTex(data, w, h, format, opts) {
    var t = new T.DataTexture(data, w, h, format || T.RGBAFormat, T.UnsignedByteType);
    opts = opts || {};
    t.colorSpace = T.NoColorSpace;
    t.magFilter = opts.nearest ? T.NearestFilter : T.LinearFilter;
    t.minFilter = opts.mips ? T.LinearMipmapLinearFilter : (opts.nearest ? T.NearestFilter : T.LinearFilter);
    t.generateMipmaps = !!opts.mips;
    t.wrapS = t.wrapT = opts.repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    t.anisotropy = opts.anisotropy || 1;
    if (format === T.RedFormat) t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  }
  function col(hex) { return new T.Color(hex); }

  /**
   * One per renderer. `tier` is 'high' or 'lite'; `onDetail` is called when
   * the background texture generation finishes and the ice has just got its
   * real surface (the caller should draw a frame).
   */
  function create(opts) {
    opts = opts || {};
    var kit = { tier: opts.tier || 'high', ready: false, fallback: false }, owned = [];
    var neutralDetail = dataTex(new Uint8Array([128, 128, 0, 0]), 1, 1, null, { repeat: true });
    var neutralBump = dataTex(new Uint8Array([128, 128, 128, 255]), 1, 1, null, { repeat: true });
    var cells0 = dataTex(new Uint8Array([255, 0, 128, 255]), 1, 1, null, { nearest: true });
    var sdf0 = dataTex(new Uint8Array([255]), 1, 1, T.RedFormat);

    var u = kit.uniforms = {
      uDetail: { value: neutralDetail }, uBump: { value: neutralBump },
      uCells: { value: cells0 }, uSdf: { value: sdf0 },
      uBoard: { value: new T.Vector2(1, 1) }, uSdfRect: { value: new T.Vector4(-3, -3, 6, 6) },
      uTime: { value: 0 }, uIceNM: { value: new T.Matrix3() },
      uAbsorb: { value: new T.Vector3(2.0, 0.62, 0.28) },
      uTune: { value: new T.Vector4(1.5, 0.5, 1.1, 1.0) },
      uColMilk: { value: col('#f3fafd') }, uColShallow: { value: col('#93cfe4') }, uColEdge: { value: col('#57c4de') },
      uColSide: { value: col('#cdeef6') }, uColMid: { value: col('#58bdd8') }, uColDeep: { value: col('#1e6f9a') },
      uWaterShallow: { value: col('#6fd4e6') }, uColFoam: { value: col('#f1fbff') }
    };

    /* Two materials from one shader: the flat top, which shows the sky in its
       gloss, and the flanks, which should stay deep blue and so take less of it. */
    function floeMaterial(envStrength) {
      var m = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0, ior: 1.31,
        specularIntensity: 1, clearcoat: 1, clearcoatRoughness: .1 });
      m.onBeforeCompile = function (shader) { injectFloe(shader, u); };
      m.customProgramCacheKey = function () { return 'tilt-ice-floe-1'; };
      m.userData.envStrength = envStrength;
      m.userData.shared = true;
      return m;
    }
    kit.floeMaterial = floeMaterial(2.0);
    kit.sideMaterial = floeMaterial(0.9);
    kit.floeMaterials = [kit.floeMaterial, kit.sideMaterial];
    kit.setEnvironment = function (env) {
      kit.floeMaterials.forEach(function (m) {
        m.envMap = env; m.envMapIntensity = m.userData.envStrength; m.needsUpdate = true;
      });
    };

    /* The water keeps render.js's textures and settings; this adds the shelf,
       the foam and the see-through edge. */
    kit.waterMaterial = function (params) {
      var m = new T.MeshStandardMaterial(params);
      m.onBeforeCompile = function (shader) { injectWater(shader, u); };
      m.customProgramCacheKey = function () { return 'tilt-ice-water-2'; };
      m.defines = m.defines || {};
      kit.water = m;
      kit.applyDefines();
      return m;
    };

    kit.applyDefines = function () {
      var spec = Q.TIER[kit.tier];
      kit.floeMaterials.forEach(function (m) {
        var f = m.defines;
        f.ICE_LAYERS = String(spec.interior);
        f.ICE_FREEBOARD = String(FREEBOARD.toFixed(3));
        if (spec.caustics) f.ICE_CAUSTICS = ''; else delete f.ICE_CAUSTICS;
        if (spec.glitter) f.ICE_GLITTER = ''; else delete f.ICE_GLITTER;
        m.needsUpdate = true;
      });
      if (kit.water) {
        if (spec.foam) kit.water.defines.ICE_FOAM = ''; else delete kit.water.defines.ICE_FOAM;
        kit.water.needsUpdate = true;
      }
    };
    kit.applyDefines();

    /* Swap in the generated textures (and the right anisotropy for the tier). */
    kit.attachDetail = function (data) {
      var an = Q.TIER[kit.tier].anisotropy, old = [u.uDetail.value, u.uBump.value];
      u.uDetail.value = dataTex(data.detail, data.size, data.size, null, { mips: true, repeat: true, anisotropy: an });
      u.uBump.value = dataTex(data.bump, data.size, data.size, null, { mips: true, repeat: true, anisotropy: an });
      old.forEach(function (t) { if (t !== neutralDetail && t !== neutralBump) t.dispose(); });
      kit.ready = true;
    };
    kit.detailSize = function () { return Q.TIER[kit.tier].detail; };
    kit.requestDetail = function () {
      Bank.request(kit.detailSize(), function (data) {
        kit.attachDetail(data);
        if (opts.onDetail) opts.onDetail();
      });
    };

    kit.setTier = function (tier) {
      kit.tier = tier;
      kit.applyDefines();
      var an = Q.TIER[tier].anisotropy;
      [u.uDetail.value, u.uBump.value].forEach(function (t) { if (t.image && t.image.width > 1) { t.anisotropy = an; t.needsUpdate = true; } });
      if (!Bank.data || Bank.data.size < kit.detailSize()) kit.requestDetail();
    };

    kit.setStage = function (stage) {
      var cells = dataTex(cellData(stage), stage.w, stage.h, null, { nearest: true });
      var s = sdfData(stage), sdf = dataTex(s.data, s.w, s.h, T.RedFormat);
      if (u.uCells.value !== cells0) u.uCells.value.dispose();
      if (u.uSdf.value !== sdf0) u.uSdf.value.dispose();
      u.uCells.value = cells; u.uSdf.value = sdf;
      u.uBoard.value.set(stage.w, stage.h);
      u.uSdfRect.value.set(s.rect[0], s.rect[1], s.rect[2], s.rect[3]);
    };

    kit.setTime = function (t) { u.uTime.value = t; };

    /* The floe's normal matrix (floe space → view space), which the fragment
       shader needs to turn a bump found in floe space into a view-space normal. */
    var mv = new T.Matrix4(), inv = new T.Matrix4();
    kit.setView = function (camera, world) {
      inv.copy(camera.matrixWorld).invert();
      mv.multiplyMatrices(inv, world.matrixWorld);
      u.uIceNM.value.getNormalMatrix(mv);
    };

    /* The shader failed to compile on this GPU. Fall back to plain materials so
       the game still shows a floe, a pool and a board. */
    kit.useFallback = function () {
      kit.fallback = true;
      var f = new T.MeshStandardMaterial({ color: '#cfeaf3', roughness: .22, metalness: 0 });
      f.userData.shared = true;
      kit.floeMaterial = kit.sideMaterial = f;
      kit.floeMaterials = [f];
      if (kit.water) {
        var w = kit.water;
        w.onBeforeCompile = function () {};
        w.customProgramCacheKey = function () { return 'tilt-ice-water-plain'; };
        w.needsUpdate = true;
      }
      return f;
    };

    kit.dispose = function () {
      [u.uDetail.value, u.uBump.value, u.uCells.value, u.uSdf.value, neutralDetail, neutralBump, cells0, sdf0]
        .forEach(function (t) { t.dispose(); });
      kit.floeMaterials.forEach(function (m) { m.dispose(); }); if (kit.water) kit.water.dispose();
    };

    kit.requestDetail();
    return kit;
  }

  root.TiltIce = {
    create: create, Bank: Bank,
    FREEBOARD: FREEBOARD, DRAFT: DRAFT, BEVEL: BEVEL, INSET: INSET, MARGIN: MARGIN,
    SDF_RES: SDF_RES, SDF_RANGE: SDF_RANGE,
    cellData: cellData, sdfData: sdfData
  };
})(typeof window !== 'undefined' ? window : globalThis);
