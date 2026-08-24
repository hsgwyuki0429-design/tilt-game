'use strict';

/* Focused contracts for the 2.5D renderer. This deliberately complements the
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
    var launch = {};
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      launch.executablePath = process.env.CHROME_PATH;
    }
    browser = await chromium.launch(launch);
    var page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    var errors = [];
    page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(function () {
      return window.game && window.game.renderer && window.game.renderer.textureBank.loaded === 6;
    }, null, { timeout: 10000 });

    console.log('\n\u001b[1mRENDER ARCHITECTURE\u001b[0m');
    var architecture = await page.evaluate(function () {
      var r = window.game.renderer;
      var p0 = r.project(0, 0, 0), px = r.project(1, 0, 0);
      var py = r.project(0, 1, 0), pz = r.project(0, 0, 1);
      var geometry = r.boxGeometry({ x0: 0, y0: 0, x1: 1, y1: 1, z0: 0, z1: 1 });
      r.commands.length = 0;
      r.pushCommand('floor', 1, 1, 0, 0, {});
      r.pushCommand('goal', 1, 1, .012, 1, {});
      r.pushCommand('penguin', 1, 1, .035, 4, {});
      var commandProbe = r.commands.map(function (c) { return { depth: c.depth, layer: c.layer }; });
      var names = ['top', 'bottom', 'north', 'south', 'east', 'west'];
      var materials = ['ice', 'wall-smooth', 'wall-brick', 'cracked', 'goal', 'penguin'];
      var facesReady = materials.every(function (material) {
        return names.every(function (face) {
          var image = r.textureBank.faces[material] && r.textureBank.faces[material][face];
          return image && image.width === 256 && image.height === 256;
        });
      });
      return {
        projection: px.x > p0.x && px.y > p0.y && py.x < p0.x && py.y > p0.y &&
          pz.x === p0.x && pz.y < p0.y,
        faces: names.every(function (name) { return geometry[name] && geometry[name].length === 4; }),
        facesReady: facesReady,
        footprintDepth: commandProbe.every(function (c) { return c.depth === commandProbe[0].depth; }),
        layers: commandProbe.map(function (c) { return c.layer; }).join(','),
        staticSprites: Object.keys(r.staticSprites || {}).length,
        dpr: r.dpr
      };
    });
    check('project() uses two ground axes and one upward z axis', architecture.projection);
    check('box geometry exposes all six named faces', architecture.faces);
    check('all six material atlases decode to six 256px faces', architecture.facesReady);
    check('depth key uses the shared footprint, not object height', architecture.footprintDepth);
    check('equal-footprint layers remain floor → goal → penguin', architecture.layers === '0,1,4');
    check('seven static terrain variants are cached', architecture.staticSprites === 7,
      'sprites=' + architecture.staticSprites);
    check('devicePixelRatio is capped at 2', architecture.dpr <= 2, 'dpr=' + architecture.dpr);

    console.log('\n\u001b[1mRESPONSIVE DIORAMA\u001b[0m');
    var viewports = [
      { width: 320, height: 568, name: 'iPhone SE' },
      { width: 390, height: 844, name: 'iPhone 12' },
      { width: 1280, height: 800, name: 'desktop' }
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
          var sorted = r.commands.every(function (c, i, all) {
            return !i || all[i - 1].depth <= c.depth + .01;
          });
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
