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
      var bank=window.game&&window.game.renderer&&window.game.renderer.textureBank;
      return bank&&bank.loaded===bank.expected;
    }, null, { timeout: 10000 });
    await page.click('#btn-home-play');

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
      var commandProbe = r.commands.map(function (c) {
        return { depth: c.depth, layer: c.layer, pass: c.pass };
      });
      var names = ['top', 'bottom', 'north', 'south', 'east', 'west'];
      var materials = ['ice', 'wall-smooth', 'wall-brick', 'cracked', 'goal',
        'penguin-orange', 'penguin-purple'];
      var input = window.game.input;
      var facesReady = materials.every(function (material) {
        return names.every(function (face) {
          var image = r.textureBank.faces[material] && r.textureBank.faces[material][face];
          return image && image.width === 512 && image.height === 512;
        });
      });
      return {
        projection: px.x > p0.x && px.y === p0.y && py.x === p0.x && py.y > p0.y &&
          pz.x === p0.x && pz.y < p0.y,
        height: geometry.south[2].y > geometry.south[1].y && geometry.east[2].x === geometry.east[0].x,
        swipes: input.classify(60, 0, false) === 'R' && input.classify(-60, 0, false) === 'L' &&
          input.classify(0, 60, false) === 'D' && input.classify(0, -60, false) === 'U',
        faces: names.every(function (name) { return geometry[name] && geometry[name].length === 4; }),
        facesReady: facesReady,
        suppliedTextures: Object.keys(window.TiltRender.TEXTURE_FILES).length,
        loadedTextures: r.textureBank.loaded,
        footprintDepth: commandProbe.every(function (c) { return c.depth === commandProbe[0].depth; }),
        layers: commandProbe.map(function (c) { return c.layer; }).join(','),
        passes: commandProbe.map(function (c) { return c.pass; }).join(','),
        penguinFaceOnTop: r.textureBank.faces['penguin-orange'].top === r.textureBank.images.penguinFront,
        staticSprites: Object.keys(r.staticSprites || {}).length,
        dpr: r.dpr
      };
    });
    check('grid stays screen-aligned and perpendicular while height projects upward', architecture.projection);
    check('frontal view shows height without a sideways camera angle', architecture.height);
    check('four swipe directions map to the same four screen-aligned grid axes', architecture.swipes);
    check('box geometry exposes all six named faces', architecture.faces);
    check('all standalone supplied textures decode into semantic 512px faces',
      architecture.facesReady && architecture.suppliedTextures === 16 && architecture.loadedTextures === 16,
      'configured=' + architecture.suppliedTextures + ' loaded=' + architecture.loadedTextures);
    check('depth key uses the shared footprint, not object height', architecture.footprintDepth);
    check('equal-footprint layers remain floor → goal → penguin', architecture.layers === '0,1,4');
    check('terrain is fully painted before raised penguins', architecture.passes === '0,0,1');
    check('penguins and wall cubes render without raster artwork',await page.evaluate(function(){
      var r=game.renderer,called=0,old=r.drawFace;
      r.drawFace=function(g,pts,texture){if(texture)called++;return old.apply(this,arguments);};
      try{
        r.drawPenguin(r.ctx,{pos:[0,0],colour:1,react:{expression:'normal',scale:1,dx:0,dy:0,lift:0}});
        r._buildingSprites=true;r.drawWall(r.ctx,{x:0,y:0});
      }finally{r._buildingSprites=false;r.drawFace=old;}
      return called===0;
    }));
    check('all nine procedural expressions have distinct drawings',await page.evaluate(function(){
      var r=game.renderer,c=document.createElement('canvas');c.width=c.height=256;
      var g=c.getContext('2d'),faces=new Set();
      TiltExpression.EXPRESSIONS.forEach(function(e){g.clearRect(0,0,256,256);
        r.drawCubePenguinFace(g,[{x:0,y:0},{x:256,y:0},{x:256,y:256},{x:0,y:256}],e);
        faces.add(c.toDataURL());});return faces.size===9;
    }));
    check('penguin is a cube with its face on top; both ice obstacles are low',await page.evaluate(function(){
      var r=game.renderer,oldBox=r.drawBox,oldFace=r.drawCubePenguinFace,boxes=[],topFace=false,last;
      r.drawBox=function(g,o){boxes.push(o);last=oldBox.apply(this,arguments);return last;};
      r.drawCubePenguinFace=function(g,face){topFace=face===last.top;return oldFace.apply(this,arguments);};
      try{
        r.drawPenguin(r.ctx,{pos:[0,0],colour:1,react:{expression:'normal',scale:1,dx:0,dy:0,lift:0}});
        r._buildingSprites=true;r.drawWall(r.ctx,{x:1,y:1});r.drawDrifter(r.ctx,{pos:[2,2]});
      }finally{r._buildingSprites=false;r.drawBox=oldBox;r.drawCubePenguinFace=oldFace;}
      var p=boxes[0],w=boxes[1],d=boxes[2];
      return topFace&&Math.abs((p.x1-p.x0)-(p.z1-p.z0))<.001&&
        Math.abs(w.z1-.21)<.001&&Math.abs((d.z1-d.z0)-.19)<.001;
    }));
    check('five used terrain variants are cached', architecture.staticSprites === 5,
      'sprites=' + architecture.staticSprites);
    check('devicePixelRatio is capped at 2', architecture.dpr <= 2, 'dpr=' + architecture.dpr);

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
        result.types=result.types&&['shard','skate','frost'].every(function(kind){
          return r.particles.some(function(p){return p.kind===kind;});
        });
        r.collectCommands(96);
        result.occlusion=r.commands.filter(function(c){return c.kind==='particle';}).every(function(c){return c.pass<=1;});
      });
      [8,16,32].forEach(function(dt){
        r.setStage(st,E.initialState(st));r.playMove(E.simulate(st,r.state,'R'),function(){});
        for(var time=dt;time<=96;time+=dt)r.emitSlideIce(time);
        counts.push(r.particles.length);
      });
      result.refresh=counts.every(function(n){return n===counts[0];});
      for(var k=0;k<100;k++)r.iceSpray(2.5,2.5,1,0,1,true);
      result.bounded=r.particles.length<=420;
      for(var tick=0;tick<80;tick++)r.updateEffects(16);
      result.expired=r.particles.length===0;
      r.iceSpray(2,2,1,0,1,false);r.reduceMotion=true;r.updateEffects(16);
      r.iceSpray(2,2,1,0,1,true);result.reduced=r.particles.length===0;r.reduceMotion=false;
      r.iceSpray(2,2,1,0,1,false);r.showState(E.initialState(st));result.reset=r.particles.length===0;
      r.setStage(st,E.initialState(st));r.playMove(E.simulate(st,r.state,'L'),function(){});
      r.emitSlideIce(32);result.idle=r.particles.length===0;
      game.loadStage(9);return result;
    });
    check('all four directions throw shavings backward from moving contact edges',ice.directions);
    check('shards, frost and skate marks are distinct and depth-occluded',ice.types&&ice.occlusion);
    check('emission density matches at 30, 60 and 120 Hz',ice.refresh);
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
      await page.waitForTimeout(220);
      var aim=await page.evaluate(function(){return {tilt:game.renderer.tilt,transform:game.canvas.style.transform,state:JSON.stringify(game.state)};});
      var angle=dir==='L'||dir==='R'?aim.tilt.y:aim.tilt.x;
      var sign=dir==='R'||dir==='U'?1:-1;
      check(dir+' drag tilts the tray without committing a grid move',
        angle*sign>1 && Math.abs(angle)<=4.5 && aim.state===before && /perspective/.test(aim.transform));
      await page.evaluate(function(){document.getElementById('board-area').dispatchEvent(new Event('touchcancel'));});
      await page.waitForTimeout(700);
      check(dir+' cancelled drag settles exactly level',await page.evaluate(function(){return game.canvas.style.transform==='none';}));
    }
    check('reduced motion immediately clears existing tilt and keeps the preview level',await page.evaluate(function(){
      var r=game.renderer;r.tilt.x=4;r.tilt.y=-4;r.reduceMotion=true;r.aimDir='R';r.aimAmount=1;
      r.frame(16,performance.now());var pass=r.tilt.x===0&&r.tilt.y===0&&r.canvas.style.transform==='none';
      r.aimDir=null;r.aimAmount=0;r.reduceMotion=false;return pass;
    }));

    console.log('\n\u001b[1mRESPONSIVE ICE DIORAMA\u001b[0m');
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
          var sorted = r.commands.every(function (c, i, all) {
            if (!i) return true;
            var p = all[i - 1];
            if (p.pass !== c.pass) return p.pass < c.pass;
            if (Math.abs(p.depth - c.depth) > .01) return p.depth < c.depth;
            if (p.layer !== c.layer) return p.layer < c.layer;
            return p.tie <= c.tie;
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
