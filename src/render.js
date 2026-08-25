'use strict';
/*
 * TILT — flat top-down ice board.
 *
 * The engine remains the single source of truth in grid coordinates. Rendering
 * interpolates those coordinates and only then calls project(x, y, z).
 */
(function (root) {
  var E = root.TiltEngine;

  var THEME = {
    trayFill: '#B9DDEA',
    trayEdge: 'rgba(36,105,145,.30)',
    floor: '#DCECF3',
    floorEdge: 'rgba(45,126,164,.34)',
    wallHi: '#F9FDFF',
    wallLo: '#4B9FCB',
    wallEdge: 'rgba(255,255,255,.64)',
    wallSeam: 'rgba(31,103,146,.30)',
    hazFill: '#83BDD5',
    hazFillLo: '#4A98C0',
    hazStripe: 'rgba(32,93,137,.75)',
    hazShade: 'rgba(20,74,116,.16)',
    hazEdge: 'rgba(30,101,146,.54)',
    socketWell: 'rgba(65,190,212,.18)',
    socketShade: 'rgba(31,100,144,.22)',
    blockShade: 'rgba(25,55,102,.22)',
    glyphInk: 'rgba(255,255,255,.94)',
    inertEdge: '#5A7080',
    grazeRing: 'rgba(55,88,128,.92)',
    cueInk: 'rgba(29,58,94,.78)',
    cueTrail: 'rgba(29,58,94,',
    cueGlow: 'rgba(74,184,220,.30)',
    clearRing: 'rgba(74,218,231,.72)',
    rebuffRing: 'rgba(55,88,128,.30)',
    lost: '#4DBAD8',
    lostRing: 'rgba(25,102,146,.86)',
    inertDrain: '#D9E8EC',
    inertDrainK: .5,
    inertEdgeK: .3,
    aim: 'rgba(7,122,156,',
    grav: 'rgba(55,88,112,',
    contact: 'rgba(27,58,108,.18)',
    contactDeep: 'rgba(22,48,94,.24)',
    ao: 'rgba(25,66,112,.16)'
  };

  var PALETTE = [
    { hi:'#84E4F0', mid:'#0B8DAE', lo:'#05637C', rim:'rgba(5,99,124,.62)',
      socket:'#087B9C', socketGlow:'rgba(34,198,218,.34)', shape:'circle' },
    { hi:'#FFD57A', mid:'#C87C08', lo:'#8A5300', rim:'rgba(138,83,0,.62)',
      socket:'#AF6E08', socketGlow:'rgba(240,174,71,.34)', shape:'triangle' },
    { hi:'#CAB8FF', mid:'#7A4AE8', lo:'#4A249B', rim:'rgba(74,36,155,.62)',
      socket:'#6D3FD4', socketGlow:'rgba(158,126,246,.34)', shape:'square' },
    { hi:'#8EE7CA', mid:'#0D9469', lo:'#06674A', rim:'rgba(6,103,74,.62)',
      socket:'#0A7D59', socketGlow:'rgba(71,211,169,.34)', shape:'diamond' }
  ];
  var BLOCK = PALETTE[0];
  var SOCKET = { mid:PALETTE[0].socket, glow:PALETTE[0].socketGlow };
  function paletteOf(c) { return PALETTE[c] || PALETTE[0]; }

  function glyph(g, cx, cy, r, shape) {
    g.beginPath();
    if (shape === 'square') {
      var s = r * .84; g.rect(cx-s, cy-s, s*2, s*2);
    } else if (shape === 'triangle') {
      var h = r * 1.12;
      g.moveTo(cx,cy-h); g.lineTo(cx+h*.93,cy+h*.62);
      g.lineTo(cx-h*.93,cy+h*.62); g.closePath();
    } else if (shape === 'diamond') {
      var d = r * 1.18;
      g.moveTo(cx,cy-d); g.lineTo(cx+d,cy); g.lineTo(cx,cy+d);
      g.lineTo(cx-d,cy); g.closePath();
    } else g.arc(cx,cy,r,0,Math.PI*2);
  }

  var TICK = 54;
  var TAIL = 48;
  var SQUASH = 150;
  var MAX_CELL = 112;
  /* A strictly top-down basis. Supplied square textures remain square and the
     live board uses the same visual language as the home-screen tile preview. */
  var GRID_X = 1;
  var GRID_Y = 1;
  var Z_X = 0;
  var Z_Y = 0;
  var FLOOR_DEPTH = 0;
  var WALL_HEIGHT = .02;
  var RING_HEIGHT = .02;
  var FRONT_RING_HEIGHT = .02;
  var PENGUIN_HEIGHT = .02;
  var SCENE_HEIGHT = 0;
  var FACE_SIZE = 512;
  var FACE_NAMES = ['top','bottom','north','south','east','west'];

  function easeOut(p) { return 1-Math.pow(1-p,2.45); }
  function clamp01(v) { return v<0?0:v>1?1:v; }
  function lerp(a,b,t) { return a+(b-a)*t; }

  /* The supplied images are standalone face assets, not contact sheets. They
     are only resized to a practical 512px decode size; the artwork itself is
     mapped directly to the matching cube face. */
  var TEXTURE_FILES = {
    iceTop:'assets/textures/faces/ice-top.png',
    wallSouthA:'assets/textures/faces/wall-south-a.png',
    wallSouthB:'assets/textures/faces/wall-south-b.png',
    wallEastA:'assets/textures/faces/wall-east-a.png',
    wallEastB:'assets/textures/faces/wall-east-b.png',
    wallTopIce:'assets/textures/faces/wall-top-ice.png',
    wallTopSnow:'assets/textures/faces/wall-top-snow.png',
    crackedTop:'assets/textures/faces/cracked-top.png',
    goalTop:'assets/textures/faces/goal-top.png',
    penguinFront:'assets/textures/faces/penguin-front.png',
    penguinBack:'assets/textures/faces/penguin-back.png',
    penguinWest:'assets/textures/faces/penguin-west.png',
    penguinEast:'assets/textures/faces/penguin-east.png',
    penguinBottom:'assets/textures/faces/penguin-bottom.png',
    penguinTopOrange:'assets/textures/faces/penguin-top-orange.png',
    penguinTopPurple:'assets/textures/faces/penguin-top-purple.png'
  };
  var MATERIAL_FACES = {
    ice:{top:'iceTop',bottom:'iceTop',north:'iceTop',south:'iceTop',east:'iceTop',west:'iceTop'},
    cracked:{top:'crackedTop',bottom:'iceTop',north:'iceTop',south:'iceTop',east:'iceTop',west:'iceTop'},
    goal:{top:'goalTop',bottom:'iceTop',north:'iceTop',south:'iceTop',east:'iceTop',west:'iceTop'},
    'wall-smooth':{top:'wallTopIce',bottom:'wallTopIce',north:'wallSouthA',south:'wallSouthA',
      east:'wallEastA',west:'wallEastA'},
    'wall-brick':{top:'wallTopSnow',bottom:'wallTopIce',north:'wallSouthB',south:'wallSouthB',
      east:'wallEastB',west:'wallEastB'},
    /* The face belongs on the upward plane. Colour identity is painted onto the
       beak at runtime, so every goal colour uses the same readable penguin. */
    'penguin-orange':{top:'penguinFront',bottom:'penguinBottom',north:'penguinBack',
      south:'penguinBack',east:'penguinEast',west:'penguinWest'},
    'penguin-purple':{top:'penguinFront',bottom:'penguinBottom',north:'penguinBack',
      south:'penguinBack',east:'penguinEast',west:'penguinWest'}
  };

  function TextureBank(onReady) {
    this.faces = {};
    this.images = {};
    this.loaded = 0;
    this.expected = Object.keys(TEXTURE_FILES).length;
    this.onReady = onReady || function () {};
    this.load();
  }
  TextureBank.prototype.load = function () {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    var self=this;
    Object.keys(TEXTURE_FILES).forEach(function (name) {
      var img=new Image();
      img.decoding='async';
      img.onload=function () {
        self.images[name]=img;self.loaded++;self.syncFaces();
        if(self.loaded===self.expected)self.onReady(name);
      };
      img.onerror=function(){self.loaded++;self.syncFaces();
        if(self.loaded===self.expected)self.onReady(name);};
      img.src=TEXTURE_FILES[name];
    });
  };
  TextureBank.prototype.syncFaces = function () {
    var bank=this;
    Object.keys(MATERIAL_FACES).forEach(function (material) {
      var set={},map=MATERIAL_FACES[material];
      for(var i=0;i<FACE_NAMES.length;i++)set[FACE_NAMES[i]]=bank.images[map[FACE_NAMES[i]]]||null;
      bank.faces[material]=set;
    });
  };
  TextureBank.prototype.face = function (material, face) {
    var set=this.faces[material];
    return set&&set[face]?set[face]:null;
  };

  function Renderer(canvas) {
    var self=this;
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true});
    this.stage=null; this.state=null; this.anim=null;
    this.particles=[]; this.ripples=[]; this.flashes=[]; this.grazes=[];
    this.commands=[]; this.cells=[]; this.ring=[]; this.baseCache=null; this.staticSprites={};
    this.gravity=null; this.aimDir=null; this.clearGlow=0; this.time=0;
    this.reduceMotion=false; this.gesture=false; this.gestureDir='L'; this.gestureT=0;
    this.shift={x:0,y:0}; this.nudge=null; this.shake=0;
    this.dpr=1; this.cell=40; this.ox=0; this.oy=0;
    this.stepX=40; this.stepY=40; this.zShiftX=4; this.zScale=11;
    this.cssW=1; this.cssH=1;
    this.boardBounds={left:0,right:0,top:0,bottom:0};
    this.onEvent=null;
    this.textureBank=new TextureBank(function(){
      self.textureVersion=(self.textureVersion||0)+1;
      if(self.stage)self.buildStaticSprites();
    });
  }

  /* Canonical logical-world projection used by every drawable. */
  Renderer.prototype.project=function(x,y,z){
    z=z||0;
    return {
      x:this.ox+x*this.stepX-z*this.zShiftX,
      y:this.oy+y*this.stepY-z*this.zScale
    };
  };
  Renderer.prototype.cellRect=function(x,y){
    var c=this.project(x+.5,y+.5,.02);
    return {x:c.x-this.cell/2,y:c.y-this.cell/2,s:this.cell};
  };

  Renderer.prototype.setStage=function(stage,state){
    this.stage=stage; this.state=state; this.anim=null;
    this.particles.length=0; this.ripples.length=0; this.flashes.length=0; this.grazes.length=0;
    this.gravity=null; this.aimDir=null; this.clearGlow=0; this.shake=0; this.nudge=null;
    this.shift.x=this.shift.y=0; this.onEvent=null; this.layout();
  };
  Renderer.prototype.showState=function(state){
    this.state=state; this.anim=null; this.grazes.length=0;
  };

  Renderer.prototype.layout=function(){
    var rect=this.canvas.getBoundingClientRect();
    var w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
    var dpr=Math.min(window.devicePixelRatio||1,2);
    this.dpr=dpr; this.cssW=w; this.cssH=h;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){
      this.canvas.width=Math.round(w*dpr); this.canvas.height=Math.round(h*dpr);
    }
    if(!this.stage)return;
    var st=this.stage,margin=Math.max(7,Math.min(w,h)*.022),pad=.20;
    var zRange=0;
    var widthUnits=st.w+2+zRange*Z_X+pad;
    var heightUnits=st.h+2+zRange*Z_Y+pad;
    var cell=Math.floor(Math.min(
      (w-margin*2)/widthUnits,(h-margin*2)/heightUnits,
      (w-margin*2)/st.w,(h-margin*2)/st.h,MAX_CELL
    ));
    this.cell=Math.max(24,cell);
    this.stepX=this.cell*GRID_X; this.stepY=this.cell*GRID_Y;
    this.zShiftX=this.cell*Z_X; this.zScale=this.cell*Z_Y;
    var boardW=widthUnits*this.cell;
    var boardH=heightUnits*this.cell;
    var left=(w-boardW)/2;
    var top=(h-boardH)/2-Math.min(5,Math.max(0,(h-boardH)*.02));
    this.ox=left+(1+pad*.5)*this.cell+SCENE_HEIGHT*this.zShiftX;
    this.oy=top+(1+pad*.5)*this.cell+SCENE_HEIGHT*this.zScale;
    this.boardBounds={left:left,right:left+boardW,top:top,bottom:top+boardH};
    this.buildTerrain();
  };

  Renderer.prototype.buildTerrain=function(){
    var st=this.stage;
    this.cells.length=0; this.ring.length=0;
    for(var y=0;y<st.h;y++)for(var x=0;x<st.w;x++){
      var i=y*st.w+x,t=st.terrain[i];
      this.cells.push({x:x,y:y,i:i,terrain:t,
        material:t===E.HAZARD?'cracked':(st.goal[i]?'goal':'ice'),
        outer:t===E.WALL&&(x===0||y===0||x===st.w-1||y===st.h-1)});
    }
    for(y=-1;y<=st.h;y++)for(x=-1;x<=st.w;x++){
      if(x===-1||y===-1||x===st.w||y===st.h)
        this.ring.push({x:x,y:y,ring:true,front:x===st.w||y===st.h,
          outer:true,material:'wall-brick'});
    }
    var c=document.createElement('canvas'),dpr=this.dpr;
    c.width=Math.max(1,Math.round(this.cssW*dpr));
    c.height=Math.max(1,Math.round(this.cssH*dpr));
    var g=c.getContext('2d'); g.scale(dpr,dpr); this.drawDioramaBase(g);
    this.baseCache=c;
    this.buildStaticSprites();
  };

  Renderer.prototype.drawDioramaBase=function(g){
    var b=this.boardBounds,r=Math.min(28,this.cell*.28);
    g.save();g.fillStyle='rgba(123,188,211,.18)';
    g.strokeStyle='rgba(71,139,166,.16)';g.lineWidth=Math.max(1,this.cell*.016);
    g.beginPath();
    if(g.roundRect)g.roundRect(b.left,b.top,b.right-b.left,b.bottom-b.top,r);
    else g.rect(b.left,b.top,b.right-b.left,b.bottom-b.top);
    g.fill();g.stroke();g.restore();
  };

  /* Static cells remain individual painter commands for correct occlusion, but
     their expensive affine texture mapping is rasterized only on layout or
     texture decode. A frame therefore blits one small sprite per terrain cell. */
  Renderer.prototype.buildStaticSprites=function(){
    if(typeof document==='undefined'||!this.stage)return;
    var specs=[
      {key:'floor:ice',kind:'floor',data:{material:'ice'}},
      {key:'floor:cracked',kind:'floor',data:{material:'cracked'}},
      {key:'floor:goal',kind:'floor',data:{material:'goal'}},
      {key:'wall:smooth',kind:'wall',data:{ring:false,outer:false}},
      {key:'wall:outer',kind:'wall',data:{ring:false,outer:true}},
      {key:'wall:ring-back',kind:'wall',data:{ring:true,front:false,outer:true}},
      {key:'wall:ring-front',kind:'wall',data:{ring:true,front:true,outer:true}}
    ];
    var cssW=Math.ceil(this.cell*1.46),cssH=Math.ceil(this.cell*1.54);
    var anchorX=this.cell*.18,anchorY=this.cell*.48,dpr=this.dpr;
    var oldOx=this.ox,oldOy=this.oy,oldBuilding=this._buildingSprites;
    var sprites={};this._buildingSprites=true;this.ox=anchorX;this.oy=anchorY;
    try{
      for(var i=0;i<specs.length;i++){
        var spec=specs[i],canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(cssW*dpr));
        canvas.height=Math.max(1,Math.round(cssH*dpr));
        var g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
        var data={x:0,y:0,material:spec.data.material,ring:spec.data.ring,
          front:spec.data.front,outer:spec.data.outer};
        if(spec.kind==='floor')this.drawFloor(g,data);else this.drawWall(g,data);
        sprites[spec.key]={canvas:canvas,w:cssW,h:cssH,ox:anchorX,oy:anchorY};
      }
    }finally{
      this.ox=oldOx;this.oy=oldOy;this._buildingSprites=oldBuilding;
    }
    this.staticSprites=sprites;
  };
  Renderer.prototype.blitStaticSprite=function(g,key,x,y){
    if(this._buildingSprites)return false;
    var sprite=this.staticSprites&&this.staticSprites[key];if(!sprite)return false;
    var p=this.project(x,y,0);
    g.drawImage(sprite.canvas,0,0,sprite.canvas.width,sprite.canvas.height,
      p.x-sprite.ox,p.y-sprite.oy,sprite.w,sprite.h);
    return true;
  };

  Renderer.prototype.playMove=function(result,onDone){
    var frames=result.frames,n=this.stage.blocks.length,runs=[];
    for(var i=0;i<n;i++){
      var br=[],start=-1;
      for(var t=1;t<frames.length;t++){
        var p=frames[t-1].pos[i],q=frames[t].pos[i];
        var moved=frames[t-1].alive[i]&&(p[0]!==q[0]||p[1]!==q[1]);
        if(moved&&start<0)start=t-1;
        if(!moved&&start>=0){br.push([start,t-1]);start=-1;}
      }
      if(start>=0)br.push([start,frames.length-1]);runs.push(br);
    }
    this.anim={frames:frames,runs:runs,events:result.events.slice(),
      passes:this.findPasses(frames),firedPass:{},fired:{},
      t0:(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(),
      duration:Math.max(TICK,(frames.length-1)*TICK+TAIL+SQUASH),
      endState:result.state,onDone:onDone,done:false};
  };
  Renderer.prototype.findPasses=function(frames){
    var st=this.stage,out=[],seen={},n=frames[0].pos.length;
    for(var i=0;i<n;i++)for(var t=1;t+1<frames.length;t++){
      if(!frames[t].alive[i])break;
      var p=frames[t].pos[i],ci=p[1]*st.w+p[0];
      if(!st.goal[ci]||!E.accepts(st.goalColour[ci],st.colour[i]))continue;
      var q=frames[t+1].pos[i];
      if(q[0]===p[0]&&q[1]===p[1])continue;
      var key=ci+'@'+t;if(seen[key])continue;seen[key]=1;
      out.push({t:t,cell:[p[0],p[1]]});if(out.length>=4)return out;
    }
    return out;
  };
  Renderer.prototype.animPos=function(i,elapsed){
    var a=this.anim,rs=a.runs[i],frames=a.frames;
    if(!rs.length)return frames[0].pos[i];
    for(var k=0;k<rs.length;k++){
      var s=rs[k][0],e=rs[k][1],t0=s*TICK,t1=e*TICK+TAIL;
      if(elapsed<=t0)return frames[s].pos[i];
      if(elapsed<t1){
        var f=easeOut(clamp01((elapsed-t0)/(t1-t0))),p=frames[s].pos[i],q=frames[e].pos[i];
        return [p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f];
      }
      if(k===rs.length-1)return frames[e].pos[i];
    }
    return frames[frames.length-1].pos[i];
  };
  Renderer.prototype.impactOf=function(i,elapsed){
    var a=this.anim,rs=a.runs[i];if(!rs.length||this.reduceMotion)return 0;
    for(var k=0;k<rs.length;k++){
      var s=rs[k][0],e=rs[k][1],end=e*TICK+TAIL,dt=elapsed-end;
      if(dt>=0&&dt<SQUASH){
        var dx=a.frames[e].pos[i][0]-a.frames[s].pos[i][0];
        var dy=a.frames[e].pos[i][1]-a.frames[s].pos[i][1];
        var power=Math.min(1,(Math.abs(dx)+Math.abs(dy))/3)*.72+.18;
        return {amount:(1-dt/SQUASH)*power,axis:dx!==0?'x':'y'};
      }
    }
    return 0;
  };

  Renderer.prototype.burst=function(wx,wy,wz,col,count,power){
    if(this.reduceMotion)return;
    var n=Math.min(count,18);
    for(var i=0;i<n;i++){
      var a=i/n*Math.PI*2+Math.random()*.5,sp=(.00045+Math.random()*.00072)*power;
      this.particles.push({x:wx,y:wy,z:wz,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        vz:.0007+Math.random()*.0012,life:0,max:300+Math.random()*180,
        size:.025+Math.random()*.035,col:col});
    }
    if(this.particles.length>96)this.particles.splice(0,this.particles.length-96);
  };
  Renderer.prototype.ripple=function(wx,wy,wz,col,r0,r1,ms){
    this.ripples.push({x:wx,y:wy,z:wz,col:col,r0:r0,r1:r1,life:0,max:ms});
  };
  Renderer.prototype.addShake=function(amount,cap){
    if(!this.reduceMotion)this.shake=Math.min(this.shake+amount,cap);
  };
  Renderer.prototype.fireEvent=function(ev){
    var x=ev.cell[0]+.5,y=ev.cell[1]+.5;
    var pal=paletteOf(this.stage.colour?this.stage.colour[ev.block]:0);
    if(ev.type==='goal'){
      this.burst(x,y,.22,pal.mid,14,1.25);this.ripple(x,y,.045,pal.mid,.18,.78,390);
      this.flashes.push({cell:ev.cell,life:0,max:460});this.addShake(.9,2.5);
    }else if(ev.type==='stop')this.addShake(.42,2.1);
    else if(ev.type==='lost'){
      this.burst(x,y,.2,THEME.lost,18,1.75);this.ripple(x,y,.04,THEME.lostRing,.18,1.05,480);
      this.addShake(2.4,4);
    }
    if(this.onEvent)this.onEvent(ev);
  };
  Renderer.prototype.updateEffects=function(dt){
    var busy=false,i,p;
    for(i=this.ripples.length-1;i>=0;i--){p=this.ripples[i];p.life+=dt;
      if(p.life>=p.max)this.ripples.splice(i,1);else busy=true;}
    for(i=this.particles.length-1;i>=0;i--){p=this.particles[i];p.life+=dt;
      if(p.life>=p.max){this.particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=.0000044*dt;
      p.vx*=.994;p.vy*=.994;if(p.z<.035){p.z=.035;p.vz*=-.24;}busy=true;}
    for(i=this.flashes.length-1;i>=0;i--){this.flashes[i].life+=dt;
      if(this.flashes[i].life>=this.flashes[i].max)this.flashes.splice(i,1);else busy=true;}
    for(i=this.grazes.length-1;i>=0;i--){this.grazes[i].life+=dt;
      if(this.grazes[i].life>=this.grazes[i].max)this.grazes.splice(i,1);else busy=true;}
    return busy;
  };

  Renderer.prototype.frame=function(dt,now){
    this.time=now;var g=this.ctx,st=this.stage;if(!st)return false;
    var busy=false,elapsed=0,i;
    if(this.anim){
      elapsed=now-this.anim.t0;
      for(i=0;i<this.anim.events.length;i++){
        var ev=this.anim.events[i];if(this.anim.fired[i])continue;
        var when=ev.t*TICK+(ev.type==='stop'?TAIL:TICK*.55);
        if(elapsed>=when){this.anim.fired[i]=true;this.fireEvent(ev);}
      }
      for(i=0;i<this.anim.passes.length;i++){
        if(this.anim.firedPass[i])continue;var pass=this.anim.passes[i];
        if(elapsed>=pass.t*TICK+TICK*.4){
          this.anim.firedPass[i]=true;this.grazes.push({cell:pass.cell,life:0,max:560});
        }
      }
      if(elapsed>=this.anim.duration){
        var cb=this.anim.onDone;this.state=this.anim.endState;this.anim=null;if(cb)cb();
      }else busy=true;
    }
    var want={x:0,y:0};
    if(this.aimDir&&!this.reduceMotion){
      var lean=Math.min(6,this.cell*.05);
      if(this.aimDir==='L')want.x=-lean;else if(this.aimDir==='R')want.x=lean;
      else if(this.aimDir==='U')want.y=-lean;else want.y=lean;
    }
    var k=Math.min(1,dt/90);
    if(Math.abs(this.shift.x-want.x)>.05||Math.abs(this.shift.y-want.y)>.05){
      this.shift.x=lerp(this.shift.x,want.x,k);this.shift.y=lerp(this.shift.y,want.y,k);busy=true;
    }else{this.shift.x=want.x;this.shift.y=want.y;}
    var nx=0,ny=0;
    if(this.nudge){
      this.nudge.life+=dt;var np=this.nudge.life/this.nudge.max;
      if(np>=1)this.nudge=null;else{
        var amp=Math.sin(np*Math.PI)*(1-np)*this.cell*.105,d=this.nudge.dir;
        nx=d==='L'?-amp:d==='R'?amp:0;ny=d==='U'?-amp:d==='D'?amp:0;busy=true;
      }
    }
    if(this.updateEffects(dt))busy=true;
    g.save();g.setTransform(this.dpr,0,0,this.dpr,0,0);g.clearRect(0,0,this.cssW,this.cssH);
    var sx=0,sy=0;
    if(this.shake>.01){sx=(Math.random()-.5)*this.shake;sy=(Math.random()-.5)*this.shake;
      this.shake*=Math.pow(.0025,dt/1000);if(this.shake<.05)this.shake=0;busy=true;}
    g.save();g.translate(this.shift.x+nx+sx,this.shift.y+ny+sy);
    if(this.baseCache)g.drawImage(this.baseCache,0,0,this.baseCache.width,this.baseCache.height,
      0,0,this.cssW,this.cssH);
    this.collectCommands(elapsed);this.commands.sort(depthCompare);
    for(i=0;i<this.commands.length;i++)this.drawCommand(g,this.commands[i]);
    if(this.clearGlow>0)this.drawClearGlow(g,this.clearGlow);
    g.restore();
    this.drawGravityField(g);
    if(this.gesture){this.drawGesture(g,dt);if(!this.reduceMotion)busy=true;}
    g.restore();
    if(this.clearGlow>0){this.clearGlow=Math.max(0,this.clearGlow-dt/900);busy=true;}
    return busy;
  };

  function depthCompare(a,b){
    /* Terrain is a base pass. Without this split, a floor tile in the next row
       can be painter-sorted over a penguin while its fractional animation
       position crosses the row boundary. Raised objects still depth-sort
       together, so walls keep their legitimate positional occlusion. */
    if(a.pass!==b.pass)return a.pass-b.pass;
    if(Math.abs(a.depth-b.depth)>.01)return a.depth-b.depth;
    if(a.layer!==b.layer)return a.layer-b.layer;
    return a.tie-b.tie;
  }
  Renderer.prototype.pushCommand=function(kind,x,y,z,layer,data){
    /* Painter order follows the footprint, never the object's height. Using z
       here makes tall objects sort behind their own floor tile. */
    var p=this.project(x+.92,y+.92,0);
    var pass=kind==='particle'?2:(kind==='wall'||kind==='penguin'?1:0);
    this.commands.push({kind:kind,x:x,y:y,z:z||0,layer:layer,pass:pass,
      depth:p.y,tie:p.x,data:data});
  };
  Renderer.prototype.collectCommands=function(elapsed){
    var st=this.stage;this.commands.length=0;var i,c;
    for(i=0;i<this.ring.length;i++){c=this.ring[i];this.pushCommand('wall',c.x,c.y,-.01,3,c);}
    for(i=0;i<this.cells.length;i++){
      c=this.cells[i];this.pushCommand('floor',c.x,c.y,0,0,c);
      if(st.goal[c.i])this.pushCommand('goal',c.x,c.y,.012,1,c);
      if(c.terrain===E.WALL)this.pushCommand('wall',c.x,c.y,.025,3,c);
    }
    var frames=this.anim?this.anim.frames:null,state=this.anim?null:this.state;
    for(i=0;i<st.blocks.length;i++){
      var pos,squash=0;
      if(this.anim){
        var gone=-1;for(var j=0;j<frames.length;j++)if(!frames[j].alive[i]){gone=j;break;}
        if(gone>=0&&elapsed>=gone*TICK+TICK*.55)continue;
        pos=this.animPos(i,elapsed);squash=this.impactOf(i,elapsed);
      }else{if(!state||!state.alive[i])continue;pos=state.pos[i];}
      var inert=st.win==='select'&&st.collectable&&!st.collectable[i];
      this.pushCommand('penguin',pos[0],pos[1],.035,4,
        {index:i,pos:pos,squash:squash,colour:st.colour?st.colour[i]:0,inert:inert});
    }
    for(i=0;i<this.ripples.length;i++){var r=this.ripples[i];
      this.pushCommand('ripple',r.x-.5,r.y-.5,r.z,2,r);}
    for(i=0;i<this.particles.length;i++){var p=this.particles[i];
      this.pushCommand('particle',p.x-.5,p.y-.5,p.z,6,p);}
  };
  Renderer.prototype.drawCommand=function(g,c){
    if(c.kind==='floor')this.drawFloor(g,c.data);
    else if(c.kind==='wall')this.drawWall(g,c.data);
    else if(c.kind==='goal')this.drawGoal(g,c.data);
    else if(c.kind==='penguin')this.drawPenguin(g,c.data);
    else if(c.kind==='ripple')this.drawRipple(g,c.data);
    else if(c.kind==='particle')this.drawParticle(g,c.data);
  };

  var MATERIAL_STYLE={
    ice:{top:['#F8FDFF','#C5E7F0'],south:['#C0E2ED','#83BED8'],east:['#9BCDE0','#5E9FC6']},
    cracked:{top:['#B9DEEA','#68AFCF'],south:['#C0E2ED','#83BED8'],east:['#9BCDE0','#5E9FC6']},
    goal:{top:['#C6E8ED','#79BDC9'],south:['#C0E2ED','#83BED8'],east:['#9BCDE0','#5E9FC6']},
    'wall-smooth':{top:['#FFFFFF','#EAF5FA'],south:['#79C8E2','#43A0CB'],east:['#62B5D8','#347FB1']},
    'wall-brick':{top:['#FFFFFF','#EDF7FC'],south:['#A9D9F3','#629FC6'],east:['#88C2E2','#4E89B5']},
    'penguin-orange':{top:['#2C3138','#171A1F'],south:['#3A424B','#20262E'],east:['#30363E','#171C22']},
    'penguin-purple':{top:['#2C3138','#171A1F'],south:['#3A424B','#20262E'],east:['#30363E','#171C22']}
  };

  Renderer.prototype.boxGeometry=function(o){
    var self=this,project=o.projector||function(x,y,z){return self.project(x,y,z);};
    var p00=project(o.x0,o.y0,o.z1),p10=project(o.x1,o.y0,o.z1);
    var p11=project(o.x1,o.y1,o.z1),p01=project(o.x0,o.y1,o.z1);
    var b00=project(o.x0,o.y0,o.z0),b10=project(o.x1,o.y0,o.z0);
    var b11=project(o.x1,o.y1,o.z0),b01=project(o.x0,o.y1,o.z0);
    return {
      top:[p00,p10,p11,p01],bottom:[b00,b10,b11,b01],
      north:[p00,p10,b10,b00],south:[p01,p11,b11,b01],
      east:[p10,p11,b11,b10],west:[p00,p01,b01,b00]
    };
  };
  Renderer.prototype.drawBox=function(g,o){
    var f=this.boxGeometry(o),s=MATERIAL_STYLE[o.material]||MATERIAL_STYLE.ice;
    var xFace=o.visibleX||'east',yFace=o.visibleY||'south',textures=o.textures||{};
    var texture=function(name){return Object.prototype.hasOwnProperty.call(textures,name)?
      textures[name]:this.textureBank.face(o.material,name);}.bind(this);
    this.drawFace(g,f[xFace],texture(xFace),s.east,o.eastShade,o.radius);
    this.drawFace(g,f[yFace],texture(yFace),s.south,o.southShade,o.radius);
    this.drawFace(g,f.top,texture(o.topTextureFace||'top'),s.top,o.topShade,o.radius);
    return f;
  };
  Renderer.prototype.drawFace=function(g,pts,texture,colours,shade,radius){
    g.save();roundedPoly(g,pts,radius||0);
    var gr=g.createLinearGradient(pts[0].x,pts[0].y,pts[2].x,pts[2].y);
    gr.addColorStop(0,colours[0]);gr.addColorStop(1,colours[1]);g.fillStyle=gr;g.fill();
    if(texture){var size=texture.naturalWidth||texture.width||FACE_SIZE;
      g.save();roundedPoly(g,pts,radius||0);g.clip();faceTransform(g,pts,size);
      g.drawImage(texture,0,0,size,size);g.restore();}
    if(shade){roundedPoly(g,pts,radius||0);g.fillStyle=shade;g.fill();}
    roundedPoly(g,pts,radius||0);g.strokeStyle=THEME.floorEdge;
    g.lineWidth=Math.max(.75,this.cell*.011);g.lineJoin='round';g.stroke();g.restore();
  };

  Renderer.prototype.drawFloor=function(g,c){
    if(this.blitStaticSprite(g,'floor:'+c.material,c.x,c.y))return;
    var gap=.012;
    var f=this.drawBox(g,{x0:c.x+gap,y0:c.y+gap,x1:c.x+1-gap,y1:c.y+1-gap,
      z0:-FLOOR_DEPTH,z1:0,material:c.material,radius:this.cell*.075,
      topShade:'rgba(242,251,255,.12)',southShade:'rgba(24,100,140,.025)',
      eastShade:'rgba(18,72,126,.075)'});
    g.save();g.strokeStyle='rgba(255,255,255,.72)';g.lineWidth=Math.max(.8,this.cell*.011);
    g.beginPath();g.moveTo(f.top[0].x,f.top[0].y);g.lineTo(f.top[1].x,f.top[1].y);
    g.moveTo(f.top[0].x,f.top[0].y);g.lineTo(f.top[3].x,f.top[3].y);g.stroke();g.restore();
    if(c.material==='cracked'&&!this.textureBank.face('cracked','top'))this.drawCracks(g,f.top);
  };
  Renderer.prototype.drawWall=function(g,c){
    var spriteKey=c.ring?(c.front?'wall:ring-front':'wall:ring-back'):(c.outer?'wall:outer':'wall:smooth');
    if(this.blitStaticSprite(g,spriteKey,c.x,c.y))return;
    var material='wall-brick';
    var h = c.ring ? (c.front ? FRONT_RING_HEIGHT : RING_HEIGHT) : WALL_HEIGHT;
    var gap = c.ring ? .018 : .022;
    var z0 = c.ring ? -.04 : .015;
    var f=this.drawBox(g,{x0:c.x+gap,y0:c.y+gap,x1:c.x+1-gap,y1:c.y+1-gap,
      z0:z0,z1:h,material:material,radius:this.cell*.095,
      topShade:'rgba(255,255,255,.014)',southShade:'rgba(19,88,133,.025)',
      eastShade:'rgba(12,63,113,.10)'});
    if(!this.textureBank.face(material,'south'))this.drawSnow(g,f.south);
    if(!this.textureBank.face(material,'east'))this.drawSnow(g,f.east);
    this.drawAO(g,f.south);this.drawAO(g,f.east);
  };
  Renderer.prototype.drawCracks=function(g,top){
    var rays=[[128,132,24,32],[128,132,220,20],[128,132,238,130],
      [128,132,204,238],[128,132,90,248],[128,132,10,184],[128,132,22,92]];
    g.save();roundedPoly(g,top,this.cell*.034);g.clip();faceTransform(g,top,256);
    g.lineCap='round';g.lineJoin='round';
    for(var pass=0;pass<2;pass++){g.strokeStyle=pass?'rgba(226,250,255,.94)':'rgba(30,95,141,.55)';
      g.lineWidth=pass?3.1:7;
      for(var i=0;i<rays.length;i++){var r=rays[i];
        g.beginPath();g.moveTo(r[0],r[1]);g.lineTo((r[0]+r[2])*.54+(i%2?8:-6),(r[1]+r[3])*.54);
        g.lineTo(r[2],r[3]);g.stroke();}}
    var core=g.createRadialGradient(128,132,2,128,132,38);
    core.addColorStop(0,'rgba(235,253,255,.86)');core.addColorStop(1,'rgba(116,203,226,0)');
    g.fillStyle=core;g.beginPath();g.arc(128,132,38,0,Math.PI*2);g.fill();g.restore();
  };
  Renderer.prototype.drawSnow=function(g,face){
    g.save();roundedPoly(g,face,this.cell*.07);g.clip();faceTransform(g,face,256);
    g.fillStyle='rgba(255,255,255,.48)';g.beginPath();g.moveTo(0,0);g.lineTo(256,0);g.lineTo(256,36);
    g.bezierCurveTo(220,28,203,50,168,35);g.bezierCurveTo(132,19,105,49,70,33);
    g.bezierCurveTo(39,20,24,45,0,31);g.closePath();g.fill();
    g.strokeStyle='rgba(255,255,255,.66)';g.lineWidth=3;g.beginPath();g.moveTo(10,8);g.lineTo(242,8);g.stroke();g.restore();
  };
  Renderer.prototype.drawAO=function(g,face){
    g.save();roundedPoly(g,face,this.cell*.06);g.clip();faceTransform(g,face,256);
    var ao=g.createLinearGradient(0,180,0,256);ao.addColorStop(0,'rgba(25,66,112,0)');
    ao.addColorStop(1,THEME.ao);g.fillStyle=ao;g.fillRect(0,176,256,80);g.restore();
  };

  Renderer.prototype.drawGoal=function(g,c){
    var st=this.stage,pal=paletteOf(st.goalColour?st.goalColour[c.i]:0);
    var top=this.topFace(c.x+.035,c.y+.035,c.x+.965,c.y+.965,.018);
    var flash=0,graze=0,i;
    for(i=0;i<this.flashes.length;i++){var f=this.flashes[i];
      if(f.cell[0]===c.x&&f.cell[1]===c.y)flash=Math.max(flash,1-f.life/f.max);}
    for(i=0;i<this.grazes.length;i++){var z=this.grazes[i];
      if(z.cell[0]===c.x&&z.cell[1]===c.y)graze=Math.max(graze,1-z.life/z.max);}
    var pulse=this.reduceMotion ? .10 : (.08+(.5+.5*Math.sin(this.time/760))*.055);
    g.save();roundedPoly(g,top,this.cell*.075);g.clip();faceTransform(g,top,FACE_SIZE);
    /* Keep one aurora artwork and identify its destination with a true colour
       filter. No extra symbol or badge is laid over the goal. */
    g.globalCompositeOperation='color';g.globalAlpha=.64;g.fillStyle=pal.mid;
    g.fillRect(0,0,FACE_SIZE,FACE_SIZE);
    g.globalCompositeOperation='source-over';g.globalAlpha=1;
    var glow=g.createRadialGradient(256,256,18,256,256,218);
    glow.addColorStop(0,'rgba(255,255,255,'+(pulse+flash*.18)+')');
    glow.addColorStop(.58,'rgba(255,255,255,'+(pulse*.32)+')');
    glow.addColorStop(1,'rgba(255,255,255,0)');
    g.globalCompositeOperation='screen';g.fillStyle=glow;g.fillRect(0,0,FACE_SIZE,FACE_SIZE);
    g.globalCompositeOperation='source-over';
    if(graze>0){g.globalAlpha=graze*.38;g.strokeStyle='rgba(255,255,255,.94)';g.lineWidth=11;
      g.beginPath();g.arc(256,256,150+(1-graze)*58,0,Math.PI*2);g.stroke();}
    g.restore();
  };

  Renderer.prototype.drawPenguin=function(g,d){
    var p=d.pos,sq=d.squash&&d.squash.amount?d.squash:null,q=sq?sq.amount:0;
    var sx=sq&&sq.axis==='x'?1+q*.045:1-q*.018;
    var sy=sq&&sq.axis==='y'?1+q*.045:1-q*.018;
    var h=PENGUIN_HEIGHT,inset=.075;
    var x0=p[0]+.5-(.5-inset)*sx,x1=p[0]+.5+(.5-inset)*sx;
    var y0=p[1]+.5-(.5-inset)*sy,y1=p[1]+.5+(.5-inset)*sy;
    this.drawContactShadow(g,p[0]+.5,p[1]+.5,.37,.20,false);
    var material=d.colour===2?'penguin-purple':'penguin-orange';
    var f=this.drawBox(g,{x0:x0,y0:y0,x1:x1,y1:y1,z0:.035,z1:.035+h,
      material:material,radius:this.cell*.11,topShade:'rgba(255,255,255,.012)',
      southShade:d.inert?'rgba(185,213,220,.22)':'rgba(0,18,30,.025)',
      eastShade:d.inert?'rgba(180,205,214,.28)':'rgba(0,10,24,.13)'});
    this.drawPenguinBeak(g,f.top,paletteOf(d.colour));
    if(!this.textureBank.face(material,'south'))this.drawPenguinFallback(g,f);
  };
  Renderer.prototype.drawPenguinBeak=function(g,top,pal){
    g.save();roundedPoly(g,top,this.cell*.1);g.clip();faceTransform(g,top,FACE_SIZE);
    g.globalCompositeOperation='color';g.globalAlpha=.98;g.fillStyle=pal.mid;
    g.beginPath();g.moveTo(198,278);g.bezierCurveTo(215,229,297,226,316,278);
    g.bezierCurveTo(298,320,218,322,198,278);g.closePath();g.fill();
    g.globalCompositeOperation='source-over';g.globalAlpha=.30;g.fillStyle=pal.hi;
    g.beginPath();g.ellipse(256,266,48,15,0,Math.PI,Math.PI*2);g.fill();
    g.restore();
  };
  Renderer.prototype.drawContactShadow=function(g,x,y,rx,ry,deep){
    var c=this.project(x,y,.008);g.save();g.fillStyle=deep?THEME.contactDeep:THEME.contact;
    g.beginPath();g.ellipse(c.x+this.cell*.035,c.y+this.cell*.075,this.cell*rx,this.cell*ry,0,0,Math.PI*2);g.fill();g.restore();
  };
  Renderer.prototype.drawPenguinFallback=function(g,f){
    g.save();roundedPoly(g,f.top,this.cell*.1);g.clip();faceTransform(g,f.top,256);
    g.fillStyle='#F8FCFD';g.beginPath();g.ellipse(128,150,76,91,0,0,Math.PI*2);g.fill();
    g.fillStyle='#07131B';g.beginPath();g.arc(101,103,9,0,Math.PI*2);g.arc(155,103,9,0,Math.PI*2);g.fill();
    g.fillStyle='#F6D0C9';g.beginPath();g.arc(76,137,11,0,Math.PI*2);g.arc(180,137,11,0,Math.PI*2);g.fill();
    g.fillStyle='#F3AC2D';g.beginPath();g.moveTo(128,121);g.lineTo(106,139);g.lineTo(150,139);g.closePath();g.fill();g.restore();
  };
  Renderer.prototype.drawRipple=function(g,r){
    var p=r.life/r.max,rad=r.r0+(r.r1-r.r0)*easeOut(p),c=this.project(r.x,r.y,r.z);
    g.save();g.globalAlpha=(1-p)*.82;g.strokeStyle=r.col;g.lineWidth=Math.max(1.2,this.cell*.05*(1-p));
    g.beginPath();g.ellipse(c.x,c.y,this.cell*rad*.72,this.cell*rad*.23,0,0,Math.PI*2);g.stroke();g.restore();
  };
  Renderer.prototype.drawParticle=function(g,p){
    var c=this.project(p.x,p.y,p.z),a=1-p.life/p.max,s=this.cell*p.size*(.45+a*.55);
    g.save();g.globalAlpha=a*.9;g.fillStyle=p.col;g.beginPath();g.arc(c.x,c.y,s,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,255,255,.72)';g.beginPath();g.arc(c.x-s*.25,c.y-s*.3,s*.28,0,Math.PI*2);g.fill();g.restore();
  };
  Renderer.prototype.drawClearGlow=function(g,a){
    var st=this.stage,p=[this.project(-1,-1,.03),this.project(st.w+1,-1,.03),
      this.project(st.w+1,st.h+1,.03),this.project(-1,st.h+1,.03)];
    g.save();g.globalAlpha=a*.55;g.strokeStyle=THEME.clearRing;g.lineWidth=Math.max(2,this.cell*.035);
    g.lineJoin='round';drawPoly(g,p);g.stroke();g.restore();
  };

  Renderer.prototype.drawGravityField=function(g){
    var a=[],b=this.boardBounds;
    if(this.gravity&&this.gravity!==this.aimDir)a.push({d:this.gravity,a:.30,aim:false});
    if(this.aimDir)a.push({d:this.aimDir,a:.88,aim:true});
    for(var i=0;i<a.length;i++){
      var q=a[i],d=q.d,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2,pad=Math.min(22,this.cell*.34);
      if(d==='U')cy=Math.max(17,b.top-pad);else if(d==='D')cy=Math.min(this.cssH-17,b.bottom+pad);
      else if(d==='L')cx=Math.max(17,b.left-pad);else cx=Math.min(this.cssW-17,b.right+pad);
      g.save();g.globalAlpha=q.a;g.fillStyle=q.aim?'rgba(235,251,255,.9)':'rgba(239,248,252,.64)';
      g.strokeStyle=q.aim?'rgba(7,112,148,.72)':'rgba(48,78,112,.42)';g.lineWidth=q.aim?1.5:1;
      g.beginPath();g.arc(cx,cy,q.aim?15:12,0,Math.PI*2);g.fill();g.stroke();
      g.strokeStyle=q.aim?'#087A9C':'#445E78';g.lineWidth=q.aim?2.8:2.2;g.lineCap='round';g.lineJoin='round';
      var s=q.aim?6.5:5;g.beginPath();
      if(d==='U'){g.moveTo(cx-s,cy+s*.35);g.lineTo(cx,cy-s);g.lineTo(cx+s,cy+s*.35);}
      else if(d==='D'){g.moveTo(cx-s,cy-s*.35);g.lineTo(cx,cy+s);g.lineTo(cx+s,cy-s*.35);}
      else if(d==='L'){g.moveTo(cx+s*.35,cy-s);g.lineTo(cx-s,cy);g.lineTo(cx+s*.35,cy+s);}
      else{g.moveTo(cx-s*.35,cy-s);g.lineTo(cx+s,cy);g.lineTo(cx-s*.35,cy+s);}
      g.stroke();g.restore();
    }
  };
  Renderer.prototype.drawGesture=function(g,dt){
    var b=this.boardBounds,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2,d=this.gestureDir;
    var horiz=d==='L'||d==='R',sign=d==='R'||d==='D'?1:-1;
    var span=(horiz?b.right-b.left:b.bottom-b.top)*.40;
    if(this.reduceMotion){
      g.save();g.globalAlpha=.42;g.strokeStyle=THEME.cueInk;g.lineWidth=Math.max(2,this.cell*.045);
      g.lineCap='round';g.lineJoin='round';var z=this.cell*.16,hx=horiz?span*.5*sign:0,hy=horiz?0:span*.5*sign;
      g.beginPath();g.moveTo(cx-hx,cy-hy);g.lineTo(cx+hx,cy+hy);
      if(horiz){g.moveTo(cx+hx-z*sign,cy-z);g.lineTo(cx+hx,cy);g.lineTo(cx+hx-z*sign,cy+z);}
      else{g.moveTo(cx-z,cy+hy-z*sign);g.lineTo(cx,cy+hy);g.lineTo(cx+z,cy+hy-z*sign);}
      g.stroke();g.restore();return;
    }
    this.gestureT+=dt;var p=(this.gestureT%2100)/2100,travel=clamp01(p/.55);
    var e=travel<1?easeOut(travel):1,fade=travel<.08?travel/.08:(travel>.86?Math.max(0,(1-travel)/.14):1);
    var trail=this.cell*.68,x=horiz?cx-span*.5*sign+span*e*sign:cx;
    var y=horiz?cy:cy-span*.5*sign+span*e*sign,tx=horiz?x-trail*sign:x,ty=horiz?y:y-trail*sign;
    g.save();var gr=g.createLinearGradient(tx,ty,x,y);gr.addColorStop(0,'rgba(29,58,94,0)');
    gr.addColorStop(1,'rgba(29,58,94,'+(.25*fade)+')');g.strokeStyle=gr;g.lineWidth=this.cell*.105;
    g.lineCap='round';g.beginPath();g.moveTo(tx,ty);g.lineTo(x,y);g.stroke();
    g.globalAlpha=fade;g.fillStyle=THEME.cueInk;g.beginPath();g.arc(x,y,this.cell*.09,0,Math.PI*2);g.fill();g.restore();
  };

  Renderer.prototype.celebrate=function(){
    var st=this.stage,x=st.w/2,y=st.h/2;
    if(!this.reduceMotion){this.ripple(x,y,.08,THEME.clearRing,.28,Math.max(st.w,st.h)*.72,640);
      this.burst(x,y,.28,paletteOf(st.colour?st.colour[0]:0).mid,16,1.5);this.addShake(1.6,3.4);}
    this.clearGlow=1;
  };
  Renderer.prototype.rebuff=function(dir){
    if(this.reduceMotion){var st=this.stage;this.ripple(st.w/2,st.h/2,.05,THEME.rebuffRing,.42,.56,260);return;}
    this.nudge={dir:dir,life:0,max:300};
  };

  Renderer.prototype.topFace=function(x0,y0,x1,y1,z){
    return [this.project(x0,y0,z),this.project(x1,y0,z),this.project(x1,y1,z),this.project(x0,y1,z)];
  };
  function faceTransform(g,p,s){
    g.transform((p[1].x-p[0].x)/s,(p[1].y-p[0].y)/s,
      (p[3].x-p[0].x)/s,(p[3].y-p[0].y)/s,p[0].x,p[0].y);
  }
  function drawPoly(g,p){
    g.beginPath();g.moveTo(p[0].x,p[0].y);for(var i=1;i<p.length;i++)g.lineTo(p[i].x,p[i].y);g.closePath();
  }
  function roundedPoly(g,p,r){
    if(!r){drawPoly(g,p);return;}
    var n=p.length,s=[],e=[];
    for(var i=0;i<n;i++){
      var a=p[(i+n-1)%n],b=p[i],c=p[(i+1)%n];
      var d0=Math.hypot(b.x-a.x,b.y-a.y)||1,d1=Math.hypot(c.x-b.x,c.y-b.y)||1;
      var r0=Math.min(r,d0*.28),r1=Math.min(r,d1*.28);
      s[i]={x:b.x+(a.x-b.x)*r0/d0,y:b.y+(a.y-b.y)*r0/d0};
      e[i]={x:b.x+(c.x-b.x)*r1/d1,y:b.y+(c.y-b.y)*r1/d1};
    }
    g.beginPath();g.moveTo(e[0].x,e[0].y);
    for(i=1;i<=n;i++){var j=i%n;g.lineTo(s[j].x,s[j].y);g.quadraticCurveTo(p[j].x,p[j].y,e[j].x,e[j].y);}
    g.closePath();
  }
  root.TiltRender={
    Renderer:Renderer,BLOCK:BLOCK,SOCKET:SOCKET,PALETTE:PALETTE,
    THEME:THEME,TICK:TICK,TAIL:TAIL,MAX_CELL:MAX_CELL,FACE_SIZE:FACE_SIZE,
    TEXTURE_FILES:TEXTURE_FILES,MATERIAL_FACES:MATERIAL_FACES
  };
})(typeof window!=='undefined'?window:globalThis);
