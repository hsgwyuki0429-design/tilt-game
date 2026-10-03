'use strict';

/* Focused contracts for the WebGL floe renderer. This deliberately complements the
 * campaign/interaction QA rather than duplicating it. */
var http = require('http');
var fs = require('fs');
var path = require('path');
var chromium = require('playwright').chromium;

var ROOT = path.resolve(__dirname, '..');
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};
var failures = 0;

function check(label, pass, detail) {
  var mark = pass ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  console.log('  ' + mark + ' ' + label + (detail ? '  \u001b[2m' + detail + '\u001b[0m' : ''));
  if (!pass) failures++;
}

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/') pathname = '/index.html';
      var file = path.resolve(ROOT, '.' + pathname);
      if (file.indexOf(ROOT + path.sep) !== 0) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

(async function () {
  var server = await serve();
  var browser;
  try {
    browser = await chromium.launch(require('./lib/browser').launchOptions());
    var page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    var errors = [];
    page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(function () {
      var bank=window.game&&window.game.renderer&&window.game.renderer.textureBank;
      return bank&&bank.loaded===bank.expected;
    }, null, { timeout: 60000 });
    await page.click('#btn-home-play');

    console.log('\n\u001b[1mRENDER ARCHITECTURE\u001b[0m');
    var architecture = await page.evaluate(function () {
      var r = window.game.renderer, T = window.THREE, E = window.TiltEngine;
      var st = E.compile({ id: 'probe', board: ['A..#', '.#..', '...b', 'aB..'] });
      r.setStage(st, E.initialState(st)); r.frame(16, performance.now());
      var p0 = r.project(0, 0, 0), px = r.project(1, 0, 0), py = r.project(0, 1, 0), pz = r.project(0, 0, 1);
      var row0 = r.project(0, 0, 0), row4 = r.project(4, 0, 0);
      var midTop = r.project(2, 0, 0), midBottom = r.project(2, 4, 0);
      var input = window.game.input;
      // Ray down through every cell centre: ice under ice cells, water under holes.
      var ray = new T.Raycaster(), cells = true;
      r.world.updateMatrixWorld(true);
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
        ray.set(new T.Vector3(r.wx(x + .5), 3, r.wz(y + .5)), new T.Vector3(0, -1, 0));
        var hit = ray.intersectObject(r.floe, false)[0];
        var ice = st.terrain[y * 4 + x] !== E.WALL;
        if (ice !== !!(hit && Math.abs(hit.point.y) < .02)) cells = false;
      }
      var body = r.blocks[0].children[0].children[0];
      var kinds = r.blocks.map(function (b) { return b.userData.colour; }).join(',');
      return {
        webgl: r.gl instanceof T.WebGLRenderer && !!r.gl.getContext(),
        projection: px.x > p0.x && py.y > p0.y && pz.y < p0.y,
        level: Math.abs(row0.y - row4.y) < .5 && Math.abs(midTop.x - midBottom.x) < .5,
        swipes: input.classify(60, 0, false) === 'R' && input.classify(-60, 0, false) === 'L' &&
          input.classify(0, 60, false) === 'D' && input.classify(0, -60, false) === 'U',
        cells: cells,
        shadows: r.gl.shadowMap.enabled && body.castShadow && r.floe.receiveShadow,
        penguin: Array.isArray(body.material) && body.material.length === 6 &&
          body.material[4].map && body.material[4].map.isTexture,
        kinds: kinds,
        textures: r.textureBank.loaded === r.textureBank.expected && !!r.textureBank.images.goalTop,
        goals: r.goals.length === 2,
        dpr: r.dpr
      };
    });
    check('a WebGL scene renders the board', architecture.webgl);
    check('board x runs right, y runs down the screen, height rises', architecture.projection);
    check('rows stay level and the centre column stays upright', architecture.level);
    check('four swipe directions map to the same four screen axes', architecture.swipes);
    check('one floe: ice under every ice cell, open water under every hole', architecture.cells);
    check('penguins cast real shadows onto the floe', architecture.shadows);
    check('penguins are solid cubes with a face on the front', architecture.penguin && architecture.kinds === '1,2',
      'kinds=' + architecture.kinds);
    check('the aurora artwork decodes and both auroras are placed', architecture.textures && architecture.goals);
    check('devicePixelRatio is capped at 2', architecture.dpr <= 2, 'dpr=' + architecture.dpr);
    check('all nine expressions have distinct face drawings', await page.evaluate(function () {
      var faces = new Set();
      TiltExpression.EXPRESSIONS.forEach(function (e) { faces.add(TiltRender.drawFace(1, e).toDataURL()); });
      return faces.size === 9;
    }));
    check('a hole is drawn as water and ice is drawn as ice', await page.evaluate(function () {
      var r = game.renderer, E = TiltEngine;
      var st = E.compile({ id: 'water', board: ['A...', '.##.', '.##.', '...a'] });
      r.setStage(st, E.initialState(st)); r.gesture = false; r.frame(16, performance.now());
      function lum(x, y) {
        var p = r.project(x, y, 0), d = r.dpr, px = r.readPixels(Math.round(p.x * d) - 2, Math.round(p.y * d) - 2, 4, 4), s = 0;
        for (var i = 0; i < 16; i++) s += .3 * px[i * 4] + .59 * px[i * 4 + 1] + .11 * px[i * 4 + 2];
        return { l: s / 16, b: px[2] - px[0] };
      }
      var ice = lum(2.5, .5), water = lum(2, 2.1);
      return ice.l > water.l + 25 && water.b > 40;
    }));

    console.log('\n\u001b[1mICE SHAVINGS\u001b[0m');
    var ice=await page.evaluate(function(){
      var r=game.renderer,E=TiltEngine;
      var st=E.compile({id:'ice-probe',board:['A....','.....','.....','.....','....a']});
      var result={directions:true,types:true,bounded:true},counts=[];
      ['U','R','D','L'].forEach(function(dir){
        var state=E.initialState(st);state.pos[0]=[2,2];r.setStage(st,state);
        r.playMove(E.simulate(st,state,dir),function(){});
        for(var time=16;time<=96;time+=16)r.emitSlideIce(time);
        var dv=E.DV[dir];
        result.directions=result.directions&&r.particles.length>0&&r.particles.every(function(p){
          return p.dx===dv[0]&&p.dy===dv[1]&&p.vx*dv[0]+p.vy*dv[1]<=0;
        });
        result.types=result.types&&['shard','skate','frost','chip'].every(function(kind){
          return r.particles.some(function(p){return p.kind===kind;});
        });
        r.frame(16,r.anim.t0+96);
        result.occlusion=r.shards.count+r.puffs.count+r.marks.count>0;
      });
      [8,16,32].forEach(function(dt){
        r.setStage(st,E.initialState(st));r.playMove(E.simulate(st,r.state,'R'),function(){});
        for(var time=dt;time<=96;time+=dt)r.emitSlideIce(time);
        counts.push(r.particles.length);
      });
      result.refresh=counts.every(function(n){return n===counts[0];});
      r.setStage(st,E.initialState(st));r.playMove(E.simulate(st,r.state,'R'),function(){});
      var origin=r.anim.t0;r.frame(16,origin-2);r.frame(16,origin-1);
      result.fresh=r.anim.trailTime===0&&r.particles.length===0;
      for(var k=0;k<100;k++)r.iceSpray(2.5,2.5,1,0,1,true);
      result.bounded=r.particles.length<=3600;
      for(var tick=0;tick<120;tick++)r.updateEffects(16);
      result.expired=r.particles.length===0;
      r.iceSpray(2,2,1,0,1,false);r.reduceMotion=true;r.updateEffects(16);
      r.iceSpray(2,2,1,0,1,true);result.reduced=r.particles.length===0;r.reduceMotion=false;
      r.iceSpray(2,2,1,0,1,false);r.showState(E.initialState(st));result.reset=r.particles.length===0;
      r.setStage(st,E.initialState(st));r.playMove(E.simulate(st,r.state,'L'),function(){});
      r.emitSlideIce(32);result.idle=r.particles.length===0;
      game.loadStage(9);return result;
    });
    check('all four directions throw shavings backward from moving contact edges',ice.directions);
    check('shards, frost and skate marks are distinct and drawn as instanced meshes',ice.types&&ice.occlusion);
    check('emission density matches at 30, 60 and 120 Hz',ice.refresh);
    check('a fresh swipe tolerates RAF timestamps just before its input event',ice.fresh);
    check('effects have a fixed budget and expire completely',ice.bounded&&ice.expired);
    check('reduced motion, restoration and stationary blocks leave no shavings',ice.reduced&&ice.reset&&ice.idle);

    console.log('\n\u001b[1mGESTURE TILT\u001b[0m');
    await page.evaluate(function () { game.loadStage(9); game.renderer.gesture=false; });
    for (var dir of ['L','R','U','D']) {
      var before = await page.evaluate(function () { return JSON.stringify(game.state); });
      await page.evaluate(function (d) {
        var el=document.getElementById('board-area'),rect=el.getBoundingClientRect(),dv=TiltEngine.DV[d];
        function touch(type,x,y) {
          var t=new Touch({identifier:8,target:el,clientX:x,clientY:y});
          el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:[t],changedTouches:[t]}));
        }
        touch('touchstart',rect.x+rect.width/2,rect.y+rect.height/2);
        touch('touchmove',rect.x+rect.width/2+dv[0]*90,rect.y+rect.height/2+dv[1]*90);
      },dir);
      // Software WebGL is slow; wait for the lean rather than for a fixed time.
      await page.waitForFunction(function(d){var t=game.renderer.tilt,a=d==='L'||d==='R'?t.y:t.x;
        return Math.abs(a)>1;},dir,{timeout:8000}).catch(function(){});
      var aim=await page.evaluate(function(){var w=game.renderer.world.rotation;return {tilt:game.renderer.tilt,rot:[w.x,w.z],state:JSON.stringify(game.state)};});
      var angle=dir==='L'||dir==='R'?aim.tilt.y:aim.tilt.x;
      var sign=dir==='R'||dir==='U'?1:-1;
      check(dir+' drag tilts the floe in 3D without committing a grid move',
        angle*sign>1 && Math.abs(angle)<=5 && aim.state===before && Math.abs(aim.rot[0])+Math.abs(aim.rot[1])>.01);
      await page.evaluate(function(){document.getElementById('board-area').dispatchEvent(new Event('touchcancel'));});
      await page.waitForFunction(function(){var w=game.renderer.world.rotation;return w.x===0&&w.z===0;},null,{timeout:8000}).catch(function(){});
      check(dir+' cancelled drag settles exactly level',await page.evaluate(function(){var w=game.renderer.world.rotation;return w.x===0&&w.z===0;}));
    }
    check('reduced motion immediately clears existing tilt and keeps the preview level',await page.evaluate(function(){
      var r=game.renderer;r.tilt.x=4;r.tilt.y=-4;r.reduceMotion=true;r.aimDir='R';r.aimAmount=1;
      r.frame(16,performance.now());var pass=r.tilt.x===0&&r.tilt.y===0&&r.world.rotation.x===0&&r.world.rotation.z===0;
      r.aimDir=null;r.aimAmount=0;r.reduceMotion=false;return pass;
    }));

    console.log('\n\u001b[1mRESPONSIVE FLOE\u001b[0m');
    var viewports = [
      { width: 320, height: 568, name: 'iPhone SE' },
      { width: 390, height: 844, name: 'iPhone 12' },
      { width: 1280, height: 800, name: 'desktop' },
      { width: 844, height: 390, name: 'landscape phone' }
    ];
    for (var v = 0; v < viewports.length; v++) {
      var vp = viewports[v];
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (var size = 3; size <= 5; size++) {
        var fit = await page.evaluate(function (n) {
          var rows = [], y;
          for (y = 0; y < n; y++) rows.push(new Array(n + 1).join('.'));
          rows[0] = 'A' + rows[0].slice(1);
          rows[n - 1] = rows[n - 1].slice(0, n - 1) + 'a';
          var stage = window.TiltEngine.compile({ id: 900 + n, name: 'TEST', par: 1, board: rows });
          var r = window.game.renderer;
          r.setStage(stage, window.TiltEngine.initialState(stage));
          r.layout();
          r.frame(16, performance.now());
          var b = r.boardBounds;
          // The far row's penguins and the near rim both stay inside the canvas.
          var top = r.project(0, 0, .8), bottom = r.project(n, n, -.36);
          var sorted = top.y >= 0 && bottom.y <= r.cssH;
          return {
            inside: b.left >= -.5 && b.top >= -.5 && b.right <= r.cssW + .5 && b.bottom <= r.cssH + .5,
            cell: r.cell,
            sorted: sorted,
            scroll: document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight
          };
        }, size);
        check(size + '×' + size + ' fits · ' + vp.name,
          fit.inside && fit.sorted && fit.scroll,
          'cell=' + fit.cell + ' sorted=' + fit.sorted + ' scroll=' + fit.scroll);
      }
    }
    console.log('\n\u001b[1mGRAPHICS TIERS\u001b[0m');
    await page.setViewportSize({ width: 390, height: 844 });
    var tiers = await page.evaluate(async function () {
      var r = game.renderer, E = TiltEngine, Q = TiltQuality, out = {}, shots = {};
      function until(pred) { return new Promise(function (res) { var t = setInterval(function () { if (pred()) { clearInterval(t); res(); } }, 40); }); }
      var st = E.compile({ id: 'tiers', board: ['A..#', '.#..', '...b', 'aB..'] });
      var d = null;
      for (var tier of ['high', 'lite']) {
        r.setMode(tier);
        await until(function () { return r.ice.uniforms.uDetail.value.image && r.ice.uniforms.uDetail.value.image.width >= Q.TIER[tier].detail; });
        r.setStage(st, E.initialState(st)); r.gesture = false; r.layout();
        var gl = r.gl.getContext(), spec = Q.TIER[tier];
        var dprOk = r.dpr === Math.min(devicePixelRatio, spec.dpr);
        // Compare the tiers pixel for pixel: draw both at one pixel per CSS pixel.
        r.gl.setPixelRatio(1); r.gl.setSize(r.cssW, r.cssH, false); r.dpr = 1;
        r.frame(16, performance.now());
        var c = r.project(1.5, 1.5, 0), x = Math.round((c.x - 1.6 * r.cell) * r.dpr), y = Math.round((c.y - 1.2 * r.cell) * r.dpr);
        var w = Math.round(3.2 * r.cell * r.dpr), h = Math.round(2.4 * r.cell * r.dpr);
        shots[tier] = r.readPixels(x, y, w, h);
        var lum = 0; for (var i = 0; i < shots[tier].length; i += 4) lum += shots[tier][i] + shots[tier][i + 1] + shots[tier][i + 2];
        out[tier] = {
          glError: gl.getError(),
          layers: r.ice.floeMaterials.every(function (m) { return m.defines.ICE_LAYERS === String(spec.interior); }),
          caustics: ('ICE_CAUSTICS' in r.ice.floeMaterial.defines) === spec.caustics,
          glitter: ('ICE_GLITTER' in r.ice.floeMaterial.defines) === spec.glitter,
          foam: ('ICE_FOAM' in r.ice.water.defines) === spec.foam,
          shadow: r.keyLight.shadow.mapSize.x === spec.shadow,
          dpr: dprOk,
          particles: r.maxParticles === spec.particles,
          drawn: lum / (shots[tier].length / 4 * 3) > 60,
          size: [w, h]
        };
        for (var k = 0; k < 6000; k++) r.iceSpray(2, 2, 1, 0, 1, true);
        out[tier].capped = r.particles.length <= spec.particles;
        r.particles.length = 0;
        d = r.ice.uniforms.uDetail.value.image;
      }
      // the two tiers really draw differently
      var a = shots.high, b = shots.lite, diff = 0, n = Math.min(a.length, b.length);
      for (var j = 0; j < n; j++) diff += Math.abs(a[j] - b[j]);
      out.diff = diff / n;
      // the generated detail is sane in every channel
      var bank = TiltIce.Bank.data, mean = [0, 0, 0, 0], px = bank.size * bank.size;
      for (var p = 0; p < bank.detail.length; p++) mean[p & 3] += bank.detail[p];
      out.mean = mean.map(function (m) { return +(m / px / 255).toFixed(3); });
      out.bank = bank.size;
      out.programs = r.gl.info.programs.length;
      return out;
    });
    ['high', 'lite'].forEach(function (tier) {
      var t = tiers[tier];
      check(tier.toUpperCase() + ' draws the floe with no GL error', t.glError === 0 && t.drawn, 'glError=' + t.glError);
      check(tier.toUpperCase() + ' sets its shader features, shadow map, pixel ratio and particle budget',
        t.layers && t.caustics && t.glitter && t.foam && t.shadow && t.dpr && t.particles, JSON.stringify(t));
      check(tier.toUpperCase() + ' never holds more particles than its budget', t.capped);
    });
    check('HIGH and LITE draw the ice differently', tiers.diff > 2, 'mean difference ' + tiers.diff.toFixed(2) + '/255');
    check('the generated ice detail has grain, frost, fractures and bubbles',
      tiers.mean[0] > .35 && tiers.mean[0] < .65 && tiers.mean[1] > .25 && tiers.mean[1] < .75 &&
      tiers.mean[2] > .02 && tiers.mean[2] < .25 && tiers.mean[3] > .004 && tiers.mean[3] < .2,
      'means ' + tiers.mean.join(' / ') + ' at ' + tiers.bank + 'px');
    check('the ice shaders compiled', tiers.programs > 0 && errors.length === 0, errors.join(' | '));

    var guard = await page.evaluate(async function () {
      var B = TiltIce.Bank, saved = B.data, real = HTMLCanvasElement.prototype.getContext, refused = 0;
      B.reset();
      // A canvas that will not draw, as on a starved phone: only while the generator runs.
      HTMLCanvasElement.prototype.getContext = function () {
        if (B.running && this.width === 256 && this.height === 256) { refused++; throw new Error('canvas refused'); }
        return real.apply(this, arguments);
      };
      var data = await new Promise(function (res) { B.request(256, res); });
      HTMLCanvasElement.prototype.getContext = real;
      var sum = [0, 0, 0, 0];
      for (var p = 0; p < data.detail.length; p++) sum[p & 3] += data.detail[p];
      B.data = saved;
      return { size: data.size, refused: refused, grain: sum[0] > 0 && sum[1] > 0, crack: sum[2], bubble: sum[3] };
    });
    check('if the canvas refuses to draw, the ice is plainer but still arrives',
      guard.size === 256 && guard.refused >= 2 && guard.grain && guard.crack === 0 && guard.bubble === 0, JSON.stringify(guard));

    var watch = await page.evaluate(function () {
      var r = game.renderer, Q = TiltQuality, out = {}, events = [], realRender = r.gl.render;
      r.gl.render = function () {};          // the verdict is about the gaps between frames, not the pixels
      r.onQualityChange = function (e) { events.push(e); };
      r.gesture = true;                      // keeps the loop busy, as a slide would
      function drive(gap, n) { var t = performance.now(); for (var i = 0; i < n; i++) { t += gap; r.frame(gap, t); } }
      r.setMode('high'); r.mode = 'auto'; r.armMonitor(); events.length = 0;
      drive(16.7, 160);
      out.fastKept = r.tier === 'high' && events.length === 0;
      drive(33.4, 160);
      out.lowPowerKept = r.tier === 'high' && events.length === 0;
      drive(60, 120);
      out.dropped = r.tier === 'lite' && events.length === 1 && events[0].reason === 'slow' && events[0].tier === 'lite' && events[0].mode === 'auto';
      out.lite = r.ice.floeMaterials.every(function (m) { return m.defines.ICE_LAYERS === '0'; }) && r.keyLight.shadow.mapSize.x === Q.TIER.lite.shadow && r.maxParticles === Q.TIER.lite.particles;
      out.monitorOff = r.monitor === null;
      drive(60, 160);
      out.onceOnly = events.length === 1;
      r.setMode('high'); events.length = 0; drive(90, 200);
      out.chosenKept = r.tier === 'high' && events.length === 0 && r.monitor === null;
      r.setMode('auto'); r.mode = 'auto'; r.setMode('high'); r.mode = 'auto'; r.armMonitor(); events.length = 0;
      r.reduceMotion = true; drive(90, 200); r.reduceMotion = false;
      out.idleKept = true;
      r.gl.render = realRender; r.gesture = false; r.onQualityChange = null;
      r.setMode('auto');
      return out;
    });
    check('60 fps and 30 fps (Low Power Mode) keep HIGH on AUTO', watch.fastKept && watch.lowPowerKept);
    check('a sustained slow frame rate drops AUTO to LITE, once, and says why', watch.dropped && watch.onceOnly);
    check('LITE then really is lighter: no layers, smaller shadow map, smaller particle budget', watch.lite && watch.monitorOff);
    check('a tier the player chose is never taken away', watch.chosenKept);

    var fb = await page.evaluate(function () {
      var r = game.renderer, E = TiltEngine, st = E.compile({ id: 'fb', board: ['A..#', '.#..', '...b', 'aB..'] });
      r.setMode('high'); r.setStage(st, E.initialState(st));
      r.gl.debug.onShaderError();            // what three.js calls when a program fails to link
      r.frame(16, performance.now());
      var m = [].concat(r.floe.material)[0], out = {
        swapped: r.fallbackUsed === true && m.isMeshStandardMaterial === true && !m.isMeshPhysicalMaterial,
        again: false
      };
      r.setStage(st, E.initialState(st));    // and the next stage keeps the plain ice
      r.frame(16, performance.now() + 16);
      out.again = [].concat(r.floe.material)[0].isMeshStandardMaterial === true && r.gl.getContext().getError() === 0;
      return out;
    });
    check('a shader that will not compile falls back to plain ice instead of an empty pool', fb.swapped && fb.again);

    check('no console errors during renderer contracts', errors.length === 0, errors.join(' | '));
  } finally {
    if (browser) await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  }
  if (failures) {
    console.error('\n\u001b[31m' + failures + ' renderer checks failed\u001b[0m');
    process.exitCode = 1;
  } else console.log('\n\u001b[32mAll renderer checks passed\u001b[0m');
})().catch(function (err) {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
