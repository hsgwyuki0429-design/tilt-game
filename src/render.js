'use strict';
/*
 * TILT — sculpted, screen-aligned ice diorama.
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
  /* How far, in cells, a block creeps while a swipe is still being made. Far
     enough to read as movement, short enough that it cannot be mistaken for
     the move itself having happened. */
  var AIM_SLIDE = .3;
  var MAX_CELL = 112;
  /* Ceiling on live particles. Slides spray from the whole block, so a long
     two-penguin move needs more headroom than the old edge-only trail. */
  var MAX_PARTICLES = 420;
  /* Frontal elevation: grid X and Y remain perpendicular on screen.
     Height reveals only the front face, with no sideways camera angle. */
  var GRID_X = 1;
  var GRID_Y = .95;
  var Z_X = 0;
  var Z_Y = .30;
  var WALL_HEIGHT = .30;
  var DRIFTER_HEIGHT = .19;
  var PENGUIN_HEIGHT = .76;
  var FACE_SIZE = 512;
  var FACE_NAMES = ['top','bottom','north','south','east','west'];

  function easeOut(p) { return 1-Math.pow(1-p,2.45); }
  function clamp01(v) { return v<0?0:v>1?1:v; }
  function lerp(a,b,t) { return a+(b-a)*t; }
  /* Deterministic grain: the same board always has the same ice, frame after
     frame, so texture never shimmers. */
  function hash(n) { n=Math.sin(n*127.1+311.7)*43758.5453; return n-Math.floor(n); }

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
    this.commands=[]; this.cells=[]; this.baseCache=null; this.staticSprites={};
    this.gravity=null; this.aimDir=null; this.aimAmount=0; this.aimSlide=0; this.clearGlow=0; this.time=0;
    this.reduceMotion=false; this.gesture=false; this.gestureDir='L'; this.gestureT=0;
    this.shift={x:0,y:0}; this.tilt={x:0,y:0}; this.nudge=null; this.shake=0;
    this.dpr=1; this.cell=40; this.ox=0; this.oy=0;
    this.stepX=40; this.stepY=40; this.zShiftX=4; this.zScale=11;
    this.cssW=1; this.cssH=1;
    this.boardBounds={left:0,right:0,top:0,bottom:0};
    this.onEvent=null;
    /* Set by the game to a TiltExpression.PenguinReactions. The renderer asks
       it what face and what pose each penguin wants and draws that; it knows
       nothing about which expressions exist or what causes them. */
    this.reactions=null;
    this.textureBank=new TextureBank(function(){
      self.textureVersion=(self.textureVersion||0)+1;
      if(self.stage)self.buildTerrain();
      if(self.onInvalidate)self.onInvalidate();
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
    this.gravity=null; this.aimDir=null; this.aimAmount=0; this.aimSlide=0;
    this.clearGlow=0; this.shake=0; this.nudge=null;
    this.shift.x=this.shift.y=0; this.tilt.x=this.tilt.y=0;
    this.canvas.style.transform='none'; this.onEvent=null; this.layout();
  };
  Renderer.prototype.showState=function(state){
    this.state=state; this.anim=null; this.grazes.length=0;
    this.particles.length=0; this.ripples.length=0;
  };

  Renderer.prototype.layout=function(){
    // offset sizes do not change when the canvas tilts in CSS perspective.
    var w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight);
    var dpr=Math.min(window.devicePixelRatio||1,2);
    this.dpr=dpr; this.cssW=w; this.cssH=h;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){
      this.canvas.width=Math.round(w*dpr); this.canvas.height=Math.round(h*dpr);
    }
    if(!this.stage)return;
    var st=this.stage,margin=Math.max(15,Math.min(w,h)*.048);
    var widthUnits=st.w+.94,heightUnits=st.h*GRID_Y+1.35;
    this.cell=Math.max(8,Math.min((w-margin*2)/widthUnits,(h-margin*2)/heightUnits,MAX_CELL));
    this.stepX=this.cell*GRID_X; this.stepY=this.cell*GRID_Y;
    this.zShiftX=this.cell*Z_X; this.zScale=this.cell*Z_Y;
    this.ox=(w-st.w*this.stepX)/2;
    this.oy=(h-st.h*this.stepY)/2-this.cell*.13;
    this.boardBounds={left:this.ox-this.cell*.37,right:this.ox+st.w*this.stepX+this.cell*.37,
      top:this.oy-this.cell*.42,bottom:this.oy+st.h*this.stepY+this.cell*.68};
    this.canvas.style.transformOrigin=(w/2)+'px '+(h/2)+'px';
    this.buildTerrain();
  };

  Renderer.prototype.buildTerrain=function(){
    var st=this.stage;
    this.cells.length=0;
    for(var y=0;y<st.h;y++)for(var x=0;x<st.w;x++){
      var i=y*st.w+x,t=st.terrain[i];
      this.cells.push({x:x,y:y,i:i,terrain:t,
        material:t===E.HAZARD?'cracked':(st.goal[i]?'goal':'ice'),
        outer:t===E.WALL&&(x===0||y===0||x===st.w-1||y===st.h-1)});
    }
    var c=document.createElement('canvas'),dpr=this.dpr;
    c.width=Math.max(1,Math.round(this.cssW*dpr));
    c.height=Math.max(1,Math.round(this.cssH*dpr));
    this.buildStaticSprites();
    var g=c.getContext('2d'); g.scale(dpr,dpr); this.drawDioramaBase(g);
    /* Plain and cracked ice never move, so they are painted into the base
       once, each cell with its own window into the ice texture. A single
       cached tile repeated across the tray reads as wallpaper; real ice does
       not repeat. */
    for(var k=0;k<this.cells.length;k++)if(this.cells[k].material!=='goal')
      this.drawFloorTile(g,this.cells[k],k+st.w*17+st.h*5);
    this.floorBaked=true;
    this.baseCache=c;
  };

  Renderer.prototype.drawDioramaBase=function(g){
    var c=this.cell,x=this.ox-c*.30,y=this.oy-c*.30;
    var w=this.stage.w*this.stepX+c*.60,h=this.stage.h*this.stepY+c*.60;
    var r=c*.26,depth=c*.28;
    g.save();
    // One continuous cast shadow grounds the complete tray.
    g.shadowColor='rgba(38,93,109,.23)';g.shadowBlur=c*.40;g.shadowOffsetY=c*.30;
    g.fillStyle='#90beca';g.beginPath();g.roundRect(x,y+depth,w,h,r);g.fill();
    g.shadowColor='transparent';
    var side=g.createLinearGradient(0,y+h,0,y+h+depth);
    side.addColorStop(0,'#c4e4e9');side.addColorStop(.35,'#8dc1d0');side.addColorStop(1,'#5c9fb6');
    g.fillStyle=side;g.beginPath();g.roundRect(x,y+depth*.3,w,h+depth*.7,r);g.fill();
    var snow=g.createLinearGradient(x,y,x+w,y+h);
    snow.addColorStop(0,'#ffffff');snow.addColorStop(.55,'#f4fbfc');snow.addColorStop(1,'#d6ebee');
    g.fillStyle=snow;g.beginPath();g.roundRect(x,y,w,h,r);g.fill();
    g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=1.5;g.stroke();
    this.drawSnowGrain(g,x,y,w,h,r,depth);
    // The inset well ties the floor together instead of framing every texture.
    g.fillStyle='#b9dbe2';g.beginPath();g.roundRect(this.ox-c*.025,this.oy-c*.025,
      this.stage.w*this.stepX+c*.05,this.stage.h*this.stepY+c*.05,c*.08);g.fill();
    g.restore();
  };

  /* Packed snow and glacier ice, on the tray's existing shapes and colours:
     a soft bevel on the snow, sparkling grains, gentle unevenness, and faint
     layering through the visible ice thickness. */
  Renderer.prototype.drawSnowGrain=function(g,x,y,w,h,r,depth){
    var c=this.cell,st=this.stage,fx=this.ox-c*.04,fy=this.oy-c*.04;
    var fw=st.w*this.stepX+c*.08,fh=st.h*this.stepY+c*.08,k;
    g.save();g.beginPath();g.roundRect(x,y+depth*.3,w,h+depth*.7,r);g.clip();
    for(k=0;k<3;k++){var sy=y+h+depth*(.12+k*.25);
      g.strokeStyle='rgba(255,255,255,'+(.22-k*.05)+')';g.lineWidth=Math.max(.8,c*.012);
      g.beginPath();g.moveTo(x,sy);
      for(var sx=x;sx<=x+w+c*.4;sx+=c*.4)g.lineTo(sx,sy+Math.sin(sx/c*2.1+k*1.7)*c*.012);
      g.stroke();}
    g.restore();
    g.save();g.beginPath();g.roundRect(x,y,w,h,r);g.clip();
    // Snow is never perfectly flat: broad soft drifts catching the light.
    for(k=0;k<Math.round((w+h)/c*3);k++){
      var px=x+hash(k*3.1+1)*w,py=y+hash(k*5.7+2)*h,pr=c*(.12+hash(k*1.3)*.22);
      if(px>fx&&px<fx+fw&&py>fy&&py<fy+fh)continue;
      var dip=g.createRadialGradient(px,py,0,px,py,pr);
      dip.addColorStop(0,'rgba(255,255,255,.5)');dip.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=dip;g.fillRect(px-pr,py-pr,pr*2,pr*2);
    }
    // Sparkle: crystals catching the light, with a faint cool shadow grain.
    var n=Math.round((w+h)*.9),gs=Math.max(.6,c*.011);
    for(k=0;k<n;k++){
      var qx=x+hash(k*1.31+3)*w,qy=y+hash(k*2.17+9)*h;
      if(qx>fx&&qx<fx+fw&&qy>fy&&qy<fy+fh)continue;
      if(hash(k*4.3)>.55){g.fillStyle='rgba(120,165,185,'+(.12+hash(k)*.14)+')';g.fillRect(qx,qy,gs,gs);}
      else{g.fillStyle='rgba(255,255,255,'+(.7+hash(k)*.3)+')';g.fillRect(qx,qy,gs,gs);}
    }
    // Soft bevel: light along the outer upper-left lip, shade at the inner lip.
    g.lineWidth=c*.05;g.strokeStyle='rgba(255,255,255,.7)';
    g.beginPath();g.roundRect(x+c*.015,y+c*.015,w,h,r);g.stroke();
    g.strokeStyle='rgba(120,165,185,.16)';g.lineWidth=c*.035;
    g.beginPath();g.roundRect(fx-c*.01,fy-c*.01,fw+c*.02,fh+c*.02,c*.1);g.stroke();
    g.restore();
  };

  Renderer.prototype.buildStaticSprites=function(){
    if(typeof document==='undefined'||!this.stage)return;
    var specs=[
      {key:'floor:ice',kind:'floor',data:{material:'ice'}},
      {key:'floor:cracked',kind:'floor',data:{material:'cracked'}},
      {key:'floor:goal',kind:'floor',data:{material:'goal'}},
      {key:'wall:smooth',kind:'wall',data:{ring:false,outer:false}},
      {key:'wall:outer',kind:'wall',data:{ring:false,outer:true}}
    ];
    var cssW=Math.ceil(this.cell*1.50),cssH=Math.ceil(this.cell*1.82);
    var anchorX=this.cell*.22,anchorY=this.cell*.66,dpr=this.dpr;
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
      passes:this.findPasses(frames),firedPass:{},fired:{},trailTime:0,trailDistance:[],
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
  // Distance-spaced shavings stay continuous across refresh rates. Each pair
  // peels from a rear contact edge, fans sideways, then tumbles onto the ice.
  Renderer.prototype.iceSpray=function(x,y,dx,dy,speed,impact){
    if(this.reduceMotion)return;
    /* A sliding block grinds the ice along its whole underside, so the
       shavings come from the full footprint — front to back, side to side —
       not only the trailing edge. Skate lines lie in fixed lanes under the
       body so they read as parallel tracks; shards and frost start anywhere
       under it and get thrown backward and out to the sides. */
    var count=impact?26:11,LANES=[-.3,-.1,.1,.3];
    for(var j=0;j<count;j++){
      var kind=j%5===0?'frost':(j%5===1&&!impact)?'skate':'shard';
      var side=Math.random()<.5?-1:1,spread=side*(.00045+Math.random()*.0015)*(impact?1.5:1);
      var back=(.0004+Math.random()*.0009)*speed;
      var along,across;
      if(impact){along=.12+Math.random()*.26;across=(Math.random()-.5)*.8;}
      else if(kind==='skate'){along=-.38+Math.random()*.2;across=LANES[j%LANES.length]+(Math.random()-.5)*.04;}
      else{along=-.38+Math.random()*.74;across=(Math.random()-.5)*.78;}
      var px=x+dx*along-dy*across,py=y+dy*along+dx*across;
      if(px<.025||py<.025||px>this.stage.w-.025||py>this.stage.h-.025)continue;
      this.particles.push({kind:kind,x:px,y:py,z:.025,
        vx:-dx*back-dy*spread,vy:-dy*back+dx*spread,
        vz:kind==='skate'?0:(.0012+Math.random()*.0024)*(impact?1.3:1),
        life:0,max:kind==='skate'?340:420+Math.random()*320,
        size:kind==='frost'?.04+Math.random()*.04:.018+Math.random()*.034,
        angle:Math.random()*Math.PI*2,spin:(Math.random()-.5)*.018,glint:Math.random()<.26,
        dx:dx,dy:dy,col:j%3?'#e4faff':'#83bed3'});
    }
    if(this.particles.length>MAX_PARTICLES)this.particles.splice(0,this.particles.length-MAX_PARTICLES);
  };
  Renderer.prototype.emitSlideIce=function(elapsed){
    var a=this.anim,previous=a.trailTime;a.trailTime=elapsed;
    if(this.reduceMotion||elapsed-previous>100||elapsed<=previous)return;
    for(var i=0;i<a.runs.length;i++){
      var alive=a.frames[Math.max(0,Math.min(a.frames.length-1,Math.floor(elapsed/TICK)))].alive[i];
      if(!alive)continue;
      var p=this.animPos(i,previous),q=this.animPos(i,elapsed);
      var dx=q[0]-p[0],dy=q[1]-p[1],distance=Math.sqrt(dx*dx+dy*dy);
      if(distance<.0001)continue;
      dx/=distance;dy/=distance;
      var spacing=.075,remainder=a.trailDistance[i]||0;
      for(var d=spacing-remainder;d<=distance;d+=spacing){
        var f=d/distance;
        this.iceSpray(p[0]+(q[0]-p[0])*f+.5,p[1]+(q[1]-p[1])*f+.5,
          dx,dy,Math.min(1.8,distance/(elapsed-previous)*75),false);
      }
      a.trailDistance[i]=(remainder+distance)%spacing;
    }
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
    }else if(ev.type==='stop'){
      this.addShake(.42,2.1);
      var dir=E.DV[this.gravity];
      if(dir)this.iceSpray(x,y,dir[0],dir[1],1.2,true);
    }
    else if(ev.type==='lost'){
      this.burst(x,y,.2,THEME.lost,18,1.75);this.ripple(x,y,.04,THEME.lostRing,.18,1.05,480);
      this.addShake(2.4,4);
    }
    if(this.onEvent)this.onEvent(ev);
  };
  Renderer.prototype.updateEffects=function(dt){
    var busy=false,i,p;
    if(this.reduceMotion)this.particles.length=0;
    for(i=this.ripples.length-1;i>=0;i--){p=this.ripples[i];p.life+=dt;
      if(p.life>=p.max)this.ripples.splice(i,1);else busy=true;}
    for(i=this.particles.length-1;i>=0;i--){p=this.particles[i];p.life+=dt;
      if(p.life>=p.max){this.particles.splice(i,1);continue;}
      var step=Math.min(dt,40);
      p.x+=p.vx*step;p.y+=p.vy*step;
      if(p.kind==='skate'){p.z=.012;p.vx=0;p.vy=0;}
      else{p.z+=p.vz*step;p.vz-=.000012*step;}
      if(p.angle!=null)p.angle+=p.spin*step;
      var drag=Math.exp(-step*(p.z<=.035?.013:.002));p.vx*=drag;p.vy*=drag;
      if(p.z<.025){p.z=.025;p.vz*=-.22;p.spin*=.55;}
      if(p.kind){p.x=Math.max(.025,Math.min(this.stage.w-.025,p.x));
        p.y=Math.max(.025,Math.min(this.stage.h-.025,p.y));}busy=true;}
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
      // RAF's timestamp can precede an input event in the same display frame.
      // Never use a negative frame index for a newly committed swipe.
      elapsed=Math.max(0,now-this.anim.t0);
      this.emitSlideIce(elapsed);
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
    var want={x:0,y:0},tiltDir=this.aimDir||(this.anim?this.gravity:null);
    if(tiltDir&&!this.reduceMotion){
      var amount=this.aimDir?clamp01(this.aimAmount||0):Math.min(1,Math.max(0,(this.anim.duration-elapsed)/180));
      if(tiltDir==='L')want.y=-4.5*amount;else if(tiltDir==='R')want.y=4.5*amount;
      else if(tiltDir==='U')want.x=4.5*amount;else want.x=-4.5*amount;
    }
    var k=1-Math.exp(-Math.min(dt,64)/70);
    if(this.reduceMotion){this.tilt.x=0;this.tilt.y=0;}
    else ['x','y'].forEach(function(axis){
      if(Math.abs(this.tilt[axis]-want[axis])>.008){
        this.tilt[axis]=lerp(this.tilt[axis],want[axis],k);busy=true;
      }else this.tilt[axis]=want[axis];
    },this);
    var transform=this.tilt.x||this.tilt.y?
      'perspective(1000px) rotateX('+this.tilt.x.toFixed(3)+'deg) rotateY('+this.tilt.y.toFixed(3)+'deg)':'none';
    if(this.canvas.style.transform!==transform)this.canvas.style.transform=transform;
    /* The board leans as a whole; the blocks that gravity would actually move
       also creep, in cells, the way they are about to go. Both track the swipe
       as it happens, so a move that is still being made already reads. */
    var wantSlide=(this.aimDir&&!this.reduceMotion&&!this.anim)
      ?AIM_SLIDE*Math.max(0,Math.min(1,this.aimAmount||0)):0;
    if(Math.abs(this.aimSlide-wantSlide)>.0015){
      this.aimSlide=lerp(this.aimSlide,wantSlide,k);busy=true;
    }else this.aimSlide=wantSlide;
    var nx=0,ny=0;
    if(this.nudge){
      this.nudge.life+=dt;var np=this.nudge.life/this.nudge.max;
      if(np>=1)this.nudge=null;else{
        var amp=Math.sin(np*Math.PI)*(1-np)*this.cell*.105,d=this.nudge.dir;
        nx=d==='L'?-amp:d==='R'?amp:0;ny=d==='U'?-amp:d==='D'?amp:0;busy=true;
      }
    }
    if(this.updateEffects(dt))busy=true;
    /* Expressions expire on the frame clock rather than on timers of their own,
       so a reaction keeps the loop at full rate until it is finished with. */
    if(this.reactions&&this.reactions.tick(now))busy=true;
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
    var pass=kind==='particle'?(data.kind?(data.kind==='skate'?.5:1):2):
      (kind==='wall'||kind==='penguin'?1:0);
    this.commands.push({kind:kind,x:x,y:y,z:z||0,layer:layer,pass:pass,
      depth:p.y,tie:p.x,data:data});
  };
  /**
   * Which blocks would actually get to move if the aim being held were
   * committed? A block moves when the next cell is open, or when the block
   * standing in it moves too. Previewing a slide for a penguin wedged against
   * a wall would promise a move the board is not going to make, and the whole
   * point of the preview is that it never lies about the rules.
   */
  Renderer.prototype.aimMovers=function(dir){
    var st=this.stage,s=this.state;
    if(!st||!s||!dir||!E.DV[dir])return null;
    if(this.moverDir===dir&&this.moverState===s)return this.movers;
    var d=E.DV[dir],dx=d[0],dy=d[1],w=st.w,h=st.h,n=s.pos.length,i;
    var occ={};
    for(i=0;i<n;i++)if(s.alive[i])occ[s.pos[i][1]*w+s.pos[i][0]]=i;
    var out=new Array(n),seen=new Array(n);
    var can=function(idx){
      if(seen[idx])return out[idx];
      seen[idx]=true;out[idx]=false;
      var nx=s.pos[idx][0]+dx,ny=s.pos[idx][1]+dy;
      if(nx<0||ny<0||nx>=w||ny>=h)return false;
      if(st.terrain[ny*w+nx]===E.WALL)return false;
      var o=occ[ny*w+nx];
      out[idx]=(o===undefined||o===idx)?true:can(o);
      return out[idx];
    };
    for(i=0;i<n;i++){out[i]=false;seen[i]=false;}
    for(i=0;i<n;i++)if(s.alive[i])can(i);
    this.moverDir=dir;this.moverState=s;this.movers=out;
    return out;
  };
  Renderer.prototype.collectCommands=function(elapsed){
    var st=this.stage;this.commands.length=0;var i,c;
    for(i=0;i<this.cells.length;i++){
      c=this.cells[i];this.pushCommand('floor',c.x,c.y,0,0,c);
      if(st.goal[c.i])this.pushCommand('goal',c.x,c.y,.012,1,c);
      if(c.terrain===E.WALL)this.pushCommand('wall',c.x,c.y,.025,3,c);
    }
    var frames=this.anim?this.anim.frames:null,state=this.anim?null:this.state;
    var slideX=0,slideY=0,movers=null;
    if(state&&this.aimDir&&this.aimSlide>.001){
      movers=this.aimMovers(this.aimDir);
      if(movers){var dv=E.DV[this.aimDir];slideX=dv[0]*this.aimSlide;slideY=dv[1]*this.aimSlide;}
    }
    for(i=0;i<st.blocks.length;i++){
      var pos,squash=0;
      if(this.anim){
        var gone=-1;for(var j=0;j<frames.length;j++)if(!frames[j].alive[i]){gone=j;break;}
        if(gone>=0&&elapsed>=gone*TICK+TICK*.55)continue;
        pos=this.animPos(i,elapsed);squash=this.impactOf(i,elapsed);
      }else{
        if(!state||!state.alive[i])continue;pos=state.pos[i];
        if(movers&&movers[i])pos=[pos[0]+slideX,pos[1]+slideY];
      }
      var inert=st.win==='select'&&st.collectable&&!st.collectable[i];
      var react=this.reactions?this.reactions.visualFor(i,this.time):null;
      this.pushCommand('penguin',pos[0],pos[1],.035,4,
        {index:i,pos:pos,squash:squash,colour:st.colour?st.colour[i]:0,inert:inert,
         react:react,drifter:st.colour?st.colour[i]===E.GRAY:false});
    }
    for(i=0;i<this.ripples.length;i++){var r=this.ripples[i];
      this.pushCommand('ripple',r.x-.5,r.y-.5,r.z,2,r);}
    for(i=0;i<this.particles.length;i++){var p=this.particles[i];
      this.pushCommand('particle',p.x-.92,p.y-.92,p.z,6,p);}
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
    'wall-brick':{top:['#f0fcff','#c3e5f0'],south:['#95cadc','#629fb8'],east:['#88C2E2','#4E89B5']},
    'penguin-orange':{top:['#2C3138','#171A1F'],south:['#3A424B','#20262E'],east:['#30363E','#171C22']},
    'penguin-purple':{top:['#2C3138','#171A1F'],south:['#3A424B','#20262E'],east:['#30363E','#171C22']},
    /* Old drift ice. Deliberately the only desaturated thing on the board: the
       walls are white-blue and the penguins near-black, so a cold blue-grey
       reads as "movable, but not yours" against both. The top-to-side falloff
       is wide on purpose — it is what makes the slab read as a solid object at
       39px rather than a grey square. */
    'penguin-amber-solid':{top:['#ffe5aa','#f2c366'],south:['#bd842e','#96601f'],east:['#ae7429','#85521f']},
    'penguin-violet-solid':{top:['#e1d7fb','#bca2e6'],south:['#8260b3','#5f438d'],east:['#72529f','#513977']},
    drifter:{top:['#B2C1CF','#71818F'],south:['#A3AFBB','#76828F'],east:['#8F9CA9','#64717F']}
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
    var textures=o.textures||{},self=this;
    function texture(name){return Object.prototype.hasOwnProperty.call(textures,name)?textures[name]:self.textureBank.face(o.material,name);}
    if(f.south[2].y-f.top[0].y>0){
      var body=[f.top[0],f.top[1],f.south[2],f.south[3]];
      this.drawFace(g,body,null,s.south,null,o.radius);
    }
    if(Math.abs(f.east[2].x-f.east[0].x)>.01)
      this.drawFace(g,f.east,texture('east'),s.east,o.eastShade,o.radius,.24);
    if(o.southShade!=null)
      this.drawFace(g,f.south,texture('south'),s.south,o.southShade,o.radius,.24);
    this.drawFace(g,f.top,texture(o.topTextureFace||'top'),s.top,o.topShade,o.radius,o.textureAlpha,o.textureInset);
    return f;
  };

  Renderer.prototype.drawFace=function(g,pts,texture,colours,shade,radius,textureAlpha,textureInset){
    g.save();roundedPoly(g,pts,radius||0);
    var gr=g.createLinearGradient(pts[0].x,pts[0].y,pts[2].x,pts[2].y);
    gr.addColorStop(0,colours[0]);gr.addColorStop(1,colours[1]);g.fillStyle=gr;g.fill();
    if(texture){var size=texture.naturalWidth||texture.width||FACE_SIZE,pad=size*(textureInset||0);
      g.save();roundedPoly(g,pts,radius||0);g.clip();faceTransform(g,pts,size);
      g.globalAlpha=textureAlpha==null?1:textureAlpha;
      g.drawImage(texture,pad,pad,size-pad*2,size-pad*2,0,0,size,size);g.restore();}
    if(shade){roundedPoly(g,pts,radius||0);g.fillStyle=shade;g.fill();}
    roundedPoly(g,pts,radius||0);g.strokeStyle='rgba(51,116,139,.16)';
    g.lineWidth=Math.max(.65,this.cell*.008);g.stroke();g.restore();
  };

  Renderer.prototype.drawFloor=function(g,c){
    if(c.material!=='goal'&&this.floorBaked&&!this._buildingSprites)return;
    if(this.blitStaticSprite(g,'floor:'+c.material,c.x,c.y))return;
    if(c.material!=='goal')return this.drawFloorTile(g,c,0);
    var gap=.014,material=c.material;
    var f={top:this.topFace(c.x+gap,c.y+gap,c.x+1-gap,c.y+1-gap,0)};
    this.drawFace(g,f.top,this.textureBank.face(material,'top'),MATERIAL_STYLE[material].top,
      material==='goal'?null:'rgba(237,251,252,.08)',this.cell*(material==='goal'?.11:.045),
      material==='goal'?1:(material==='cracked'?.62:.22),material==='goal'?.015:.10);
    g.save();g.strokeStyle='rgba(255,255,255,.56)';g.lineWidth=1;
    g.beginPath();g.moveTo(f.top[0].x+this.cell*.05,f.top[0].y+1);
    g.lineTo(f.top[1].x-this.cell*.05,f.top[1].y+1);g.stroke();g.restore();
    if(material==='cracked'&&!this.textureBank.face('cracked','top'))this.drawCracks(g,f.top);
  };

  /**
   * One ice tile, in the same shape and palette as before, given the depth of
   * real ice: its own crop of the ice texture, light falling off into the
   * thickness toward the lower right, a few frozen bubbles, a polished sheen,
   * and a bevel that catches the light on the upper-left edges.
   */
  Renderer.prototype.drawFloorTile=function(g,c,seed){
    var gap=.014,material=c.material,cell=this.cell,cracked=material==='cracked';
    var top=this.topFace(c.x+gap,c.y+gap,c.x+1-gap,c.y+1-gap,0),rad=cell*.045;
    this.drawFace(g,top,null,MATERIAL_STYLE[material].top,null,rad);
    var tex=this.textureBank.face(material,'top');
    g.save();roundedPoly(g,top,rad);g.clip();
    if(tex){
      var size=tex.naturalWidth||tex.width||FACE_SIZE;
      var win=cracked?size*.86:size*(.5+hash(seed*3.3)*.18);
      var sx=cracked?size*.07:size*(.12+hash(seed)*(.76-win/size));
      var sy=cracked?size*.07:size*(.12+hash(seed*1.7)*(.76-win/size));
      var cx=(top[0].x+top[2].x)/2,cy=(top[0].y+top[2].y)/2,tw=top[1].x-top[0].x,th=top[3].y-top[0].y;
      g.save();g.translate(cx,cy);
      if(!cracked){g.rotate(Math.floor(hash(seed*2.9)*4)*Math.PI/2);if(hash(seed*3.7)>.5)g.scale(-1,1);}
      var side=Math.max(tw,th);
      g.globalAlpha=cracked?.66:.42;
      g.drawImage(tex,sx,sy,win,win,-side/2,-side/2,side,side);
      g.globalAlpha=cracked?.18:.22;g.globalCompositeOperation='soft-light';
      g.drawImage(tex,sx,sy,win,win,-side/2,-side/2,side,side);
      g.restore();
    }
    var x0=top[0].x,y0=top[0].y,x1=top[2].x,y1=top[2].y,w=x1-x0,h=y1-y0;
    // Thickness: clear ice darkens and blues as you look deeper into it.
    var deep=g.createRadialGradient(x0+w*.78,y0+h*.82,0,x0+w*.7,y0+h*.75,w*.85);
    deep.addColorStop(0,cracked?'rgba(30,90,130,.16)':'rgba(70,150,190,.17)');
    deep.addColorStop(1,'rgba(70,150,190,0)');g.fillStyle=deep;g.fillRect(x0,y0,w,h);
    // Frozen bubbles.
    for(var b=0;b<(cracked?2:5);b++){
      var bx=x0+w*(.12+hash(seed*7.1+b)*.76),by=y0+h*(.12+hash(seed*5.3+b*2)*.76);
      var br=Math.max(.5,cell*(.006+hash(seed+b*3.1)*.012));
      g.fillStyle='rgba(255,255,255,.55)';g.beginPath();g.arc(bx,by,br,0,Math.PI*2);g.fill();
      g.fillStyle='rgba(60,130,170,.18)';g.beginPath();g.arc(bx+br*.5,by+br*.6,br*.7,0,Math.PI*2);g.fill();
    }
    // Polished surface: a soft diagonal reflection of the sky.
    var sheen=g.createLinearGradient(x0,y0,x1,y1);
    sheen.addColorStop(0,'rgba(255,255,255,.26)');sheen.addColorStop(.32,'rgba(255,255,255,.04)');
    sheen.addColorStop(.42,'rgba(255,255,255,.16)');sheen.addColorStop(.5,'rgba(255,255,255,0)');
    g.fillStyle=sheen;g.fillRect(x0,y0,w,h);
    // Bevel: lit upper-left lip, shaded lower-right lip.
    g.lineWidth=Math.max(1,cell*.022);g.lineCap='round';
    g.strokeStyle='rgba(255,255,255,.75)';
    g.beginPath();g.moveTo(x0+rad,y1-rad);g.lineTo(x0+cell*.012,y0+rad);g.moveTo(x0+rad,y0+cell*.012);g.lineTo(x1-rad,y0+cell*.012);g.stroke();
    g.strokeStyle='rgba(40,110,150,.20)';
    g.beginPath();g.moveTo(x1-cell*.012,y0+rad);g.lineTo(x1-cell*.012,y1-rad);g.moveTo(x0+rad,y1-cell*.012);g.lineTo(x1-rad,y1-cell*.012);g.stroke();
    g.restore();
    if(cracked&&!tex)this.drawCracks(g,top);
  };

  Renderer.prototype.drawWall=function(g,c){
    var key=c.outer?'wall:outer':'wall:smooth';
    if(this.blitStaticSprite(g,key,c.x,c.y))return;
    var gap=0;
    this.drawContactShadow(g,c.x+.5,c.y+.62,.40,.36,true);
    var f=this.drawBox(g,{x0:c.x+gap,y0:c.y+gap,x1:c.x+1-gap,y1:c.y+1-gap,
      z0:.015,z1:WALL_HEIGHT,material:'wall-brick',radius:this.cell*.012,
      textures:{top:null,south:null,east:null}});
    this.drawIceFront(g,f.south);
    this.drawIceBevel(g,f.top);
  };
  /* The low front face of the ice block: a bright refraction band under the
     lip, the body going deeper blue, and light pooling at the foot. */
  Renderer.prototype.drawIceFront=function(g,face){
    if(face[3].y-face[0].y<1)return;
    g.save();roundedPoly(g,face,this.cell*.045);g.clip();faceTransform(g,face,256);
    var gr=g.createLinearGradient(0,0,0,256);
    gr.addColorStop(0,'rgba(240,253,255,.75)');gr.addColorStop(.22,'rgba(200,240,250,.12)');
    gr.addColorStop(.7,'rgba(30,90,125,.14)');gr.addColorStop(1,'rgba(210,245,255,.45)');
    g.fillStyle=gr;g.fillRect(0,0,256,256);
    for(var k=0;k<7;k++){var x=hash(k*4.7)*240;
      var s=g.createLinearGradient(x,0,x+22,0);
      s.addColorStop(0,'rgba(255,255,255,0)');s.addColorStop(.5,'rgba(255,255,255,'+(.06+hash(k)*.08)+')');
      s.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=s;g.fillRect(x,0,22,256);}
    g.restore();
  };

  Renderer.prototype.drawIceBevel=function(g,top){
    g.save();roundedPoly(g,top,this.cell*.045);g.clip();faceTransform(g,top,256);
    // Inside the block: denser, bluer ice toward the lower right, a frosted
    // cloud of trapped air, and a few bubbles — shapeless, so nothing in it
    // ever reads as a mark.
    var body=g.createRadialGradient(180,190,8,160,170,220);
    body.addColorStop(0,'rgba(70,160,205,.38)');body.addColorStop(.6,'rgba(120,195,225,.14)');
    body.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=body;g.fillRect(0,0,256,256);
    [[78,150,52,.26],[170,92,38,.20],[140,196,30,.14]].forEach(function(c){
      var cl=g.createRadialGradient(c[0],c[1],0,c[0],c[1],c[2]);
      cl.addColorStop(0,'rgba(255,255,255,'+c[3]+')');cl.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=cl;g.fillRect(c[0]-c[2],c[1]-c[2],c[2]*2,c[2]*2);});
    [[60,70,5],[196,150,4],[110,206,3.5],[208,62,3],[150,120,2.5]].forEach(function(b){
      g.fillStyle='rgba(255,255,255,.75)';g.beginPath();g.arc(b[0],b[1],b[2],0,Math.PI*2);g.fill();
      g.fillStyle='rgba(50,120,160,.22)';g.beginPath();g.arc(b[0]+b[2]*.5,b[1]+b[2]*.6,b[2]*.7,0,Math.PI*2);g.fill();});
    // Frost settled along the far edge.
    var frost=g.createLinearGradient(0,0,0,64);
    frost.addColorStop(0,'rgba(255,255,255,.6)');frost.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=frost;g.fillRect(0,0,256,64);
    // Thin inward bevel: the frosted cap never extends beyond the ice body.
    g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=8;
    g.beginPath();g.moveTo(4,246);g.lineTo(4,4);g.lineTo(246,4);g.stroke();
    g.strokeStyle='rgba(82,148,173,.26)';g.lineWidth=7;
    g.beginPath();g.moveTo(252,12);g.lineTo(252,252);g.lineTo(12,252);g.stroke();
    var gleam=g.createLinearGradient(0,0,256,210);
    gleam.addColorStop(0,'rgba(255,255,255,.30)');gleam.addColorStop(.45,'rgba(255,255,255,.06)');
    gleam.addColorStop(.47,'rgba(255,255,255,.20)');gleam.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gleam;g.fillRect(8,8,240,240);
    var sp=g.createRadialGradient(64,48,2,64,48,52);
    sp.addColorStop(0,'rgba(255,255,255,.8)');sp.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=sp;g.fillRect(0,0,140,120);
    g.restore();
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
    if(d.drifter)return this.drawDrifter(g,d);
    var p=d.pos,sq=d.squash&&d.squash.amount?d.squash:null,q=sq?sq.amount:0;
    var re=d.react||null,rk=re?re.scale:1,rdx=re?re.dx:0,rdy=re?re.dy:0;
    var lift=re&&re.lift?re.lift:0;
    var sx=(sq&&sq.axis==='x'?1+q*.045:1-q*.018)*rk;
    var sy=(sq&&sq.axis==='y'?1+q*.045:1-q*.018)*rk;
    var h=PENGUIN_HEIGHT,inset=.12;
    var cx=p[0]+.5+rdx,cy=p[1]+.5+rdy;
    var x0=cx-(.5-inset)*sx,x1=cx+(.5-inset)*sx;
    var y0=cy-(.5-inset)*sy,y1=cy+(.5-inset)*sy;
    /* A hop leaves the tray, so its shadow stays on the ground and only tightens
       under it. Everything else drags its shadow along unchanged. */
    this.drawContactShadow(g,cx,p[1]+.64+rdy*(1-lift),
      .43*(1-lift*.16),.33*(1-lift*.20),false);
    // A grounded square footprint and a soft south-east cast make the volume
    // readable without changing the screen-aligned camera or cube dimensions.
    var ground=this.topFace(x0,y0,x1,y1,.008);
    g.save();g.shadowColor='rgba(23,49,67,.34)';g.shadowBlur=this.cell*(.065+lift*.12);
    g.shadowOffsetX=this.cell*.035;g.shadowOffsetY=this.cell*(.055+lift*.06);
    g.fillStyle='rgba(23,49,67,'+(.23-lift*.12)+')';
    roundedPoly(g,ground,this.cell*.025);g.fill();g.restore();
    var style=d.colour===2?'penguin-violet-solid':'penguin-amber-solid';
    var f=this.drawBox(g,{x0:x0,y0:y0,x1:x1,y1:y1,z0:.035+lift,z1:.035+h+lift,
      material:style,radius:this.cell*.035,topShade:'rgba(255,255,255,.012)',
      textures:{top:null,south:null,east:null},
      southShade:d.inert?'rgba(185,213,220,.22)':'rgba(0,18,30,.025)',
      eastShade:d.inert?'rgba(180,205,214,.28)':'rgba(0,10,24,.13)'});
    this.drawPlumage(g,f.south,1);
    g.save();g.strokeStyle='rgba(63,43,53,.32)';g.lineWidth=Math.max(.7,this.cell*.012);
    g.beginPath();g.moveTo(f.south[0].x+this.cell*.035,f.south[0].y);
    g.lineTo(f.south[1].x-this.cell*.035,f.south[1].y);g.stroke();
    g.strokeStyle='rgba(255,249,230,.62)';g.lineWidth=Math.max(.7,this.cell*.014);
    g.beginPath();g.moveTo(f.top[3].x+this.cell*.008,f.top[3].y-this.cell*.035);
    g.lineTo(f.top[0].x+this.cell*.008,f.top[0].y+this.cell*.035);
    g.lineTo(f.top[1].x-this.cell*.035,f.top[1].y+this.cell*.008);g.stroke();g.restore();
    // The readable face is formed on the upward plane of the solid cube.
    this.drawCubePenguinFace(g,f.top,re?re.expression:'normal');
    var beakZ=.035+lift+h+.015,beakY=cy+.13;
    var nose=[this.project(cx-.065,beakY,beakZ),this.project(cx,beakY,beakZ+.08),
      this.project(cx+.065,beakY,beakZ),this.project(cx,beakY+.10,beakZ-.035)];
    // Same faceted beak, shaded as horn rather than flat plastic: each facet
    // falls off toward its edge, with a glossy ridge and a soft cast shadow.
    g.save();g.fillStyle='rgba(120,70,10,.22)';
    drawPoly(g,[{x:nose[0].x+this.cell*.01,y:nose[0].y+this.cell*.03},{x:nose[2].x+this.cell*.01,y:nose[2].y+this.cell*.03},
      {x:nose[3].x+this.cell*.012,y:nose[3].y+this.cell*.04}]);g.fill();
    var fl=g.createLinearGradient(nose[0].x,nose[0].y,nose[3].x,nose[3].y);
    fl.addColorStop(0,'#ffe08a');fl.addColorStop(1,'#f2b23c');
    g.fillStyle=fl;drawPoly(g,[nose[0],nose[1],nose[3]]);g.fill();
    var fr=g.createLinearGradient(nose[1].x,nose[1].y,nose[2].x,nose[3].y);
    fr.addColorStop(0,'#f4b23a');fr.addColorStop(1,'#d88a1f');
    g.fillStyle=fr;drawPoly(g,[nose[1],nose[2],nose[3]]);g.fill();
    var fb=g.createLinearGradient(0,nose[0].y,0,nose[3].y);
    fb.addColorStop(0,'#e59a2b');fb.addColorStop(1,'#c27717');
    g.fillStyle=fb;drawPoly(g,[nose[0],nose[2],nose[3]]);g.fill();
    g.strokeStyle='rgba(255,246,214,.75)';g.lineWidth=Math.max(.6,this.cell*.007);g.lineCap='round';
    g.beginPath();g.moveTo(nose[1].x,nose[1].y);g.lineTo(nose[3].x,nose[3].y);g.stroke();
    g.restore();
    var badge=this.project(cx,y1,.035+lift+h*.44);
    g.save();g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=Math.max(1,this.cell*.017);
    glyph(g,badge.x,badge.y,this.cell*.041,paletteOf(d.colour).shape);g.stroke();g.restore();
  };

  Renderer.prototype.drawCubePenguinFace=function(g,front,expression){
    this.drawPlumage(g,front,0);
    g.save();roundedPoly(g,front,this.cell*.05);g.clip();faceTransform(g,front,256);
    // The same white bib, but feathered: a soft edge where it meets the
    // coloured plumage, gentle form shading, and fine down along its grain.
    var bib=g.createLinearGradient(40,30,160,252);bib.addColorStop(0,'#ffffff');bib.addColorStop(1,'#e4eff0');
    function bibPath(){g.beginPath();g.moveTo(32,233);g.lineTo(32,108);
      g.bezierCurveTo(32,23,88,21,128,69);g.bezierCurveTo(168,21,224,23,224,108);
      g.lineTo(224,233);g.quadraticCurveTo(128,256,32,233);}
    g.save();g.shadowColor='rgba(255,255,255,.85)';g.shadowBlur=9;
    g.fillStyle=bib;bibPath();g.fill();g.restore();
    g.save();bibPath();g.clip();
    var form=g.createRadialGradient(118,120,20,128,140,150);
    form.addColorStop(0,'rgba(255,255,255,0)');form.addColorStop(1,'rgba(90,120,140,.20)');
    g.fillStyle=form;g.fillRect(0,0,256,256);
    g.lineCap='round';
    for(var k=0;k<70;k++){var fx=36+hash(k*2.3)*184,fy=60+hash(k*3.9)*180,fl=6+hash(k*1.7)*9;
      g.strokeStyle=hash(k*5.1)>.5?'rgba(255,255,255,.7)':'rgba(140,165,180,.16)';g.lineWidth=1.6;
      g.beginPath();g.moveTo(fx,fy);g.quadraticCurveTo(fx+(fx<128?-2:2),fy+fl*.6,fx+(fx<128?-1:1),fy+fl);g.stroke();}
    g.restore();
    // Cheeks: warmth under the down rather than a painted disc.
    [54,202].forEach(function(cx){var ck=g.createRadialGradient(cx,164,1,cx,164,22);
      ck.addColorStop(0,'rgba(231,146,135,.42)');ck.addColorStop(1,'rgba(231,146,135,0)');
      g.fillStyle=ck;g.fillRect(cx-24,140,48,48);});
    g.strokeStyle='#263d49';g.fillStyle='#263d49';g.lineWidth=9;g.lineCap='round';g.lineJoin='round';
    var happy=expression==='good'||expression==='perfect'||expression==='clear';
    var worried=expression==='danger'||expression==='bad';
    [84,172].forEach(function(x){
      g.beginPath();
      if(expression==='perfect'){
        g.moveTo(x,93);g.lineTo(x+7,110);g.lineTo(x+20,118);g.lineTo(x+7,126);
        g.lineTo(x,143);g.lineTo(x-7,126);g.lineTo(x-20,118);g.lineTo(x-7,110);g.closePath();g.fill();
      }
      else if(happy){g.moveTo(x-15,131);g.quadraticCurveTo(x,expression==='clear'?83:103,x+15,131);g.stroke();}
      else if(expression==='fail'){g.moveTo(x-12,104);g.lineTo(x+12,133);g.moveTo(x+12,104);g.lineTo(x-12,133);g.stroke();}
      else if(expression==='miss'){g.moveTo(x-13,124);g.lineTo(x+13,124);g.stroke();}
      else {var ey=expression==='surprise'?114:122,erx=expression==='surprise'?17:13,ery=expression==='surprise'?25:20;
        g.ellipse(x,ey,erx,ery,0,0,Math.PI*2);g.fill();
        // A wet eye: warm iris depth, the key-light catchlight, and a faint
        // second reflection from the ice below.
        var iris=g.createRadialGradient(x+2,ey+7,1,x,ey+2,ery);
        iris.addColorStop(0,'rgba(110,72,44,.7)');iris.addColorStop(1,'rgba(110,72,44,0)');
        g.fillStyle=iris;g.beginPath();g.ellipse(x,ey,erx,ery,0,0,Math.PI*2);g.fill();
        g.fillStyle='#fff';g.beginPath();g.ellipse(x-4,112,4,6,0,0,Math.PI*2);g.fill();
        g.fillStyle='rgba(200,240,255,.55)';g.beginPath();g.arc(x+4,ey+ery*.55,2.2,0,Math.PI*2);g.fill();
        g.fillStyle='#263d49';}
      if(worried){var slope=expression==='bad'?-1:1;
        g.beginPath();g.moveTo(x-15,87+slope*(x<128?10:0));g.lineTo(x+15,87+slope*(x<128?0:10));g.stroke();}
    });
    g.restore();
  };
  /* Feathers, on the penguin's own coloured plumage: short overlapping
     strokes in the colour's light and shade, a soft sheen where the key light
     grazes the down, and darker roots toward the lower edge. `front` is 1 for
     the low front face, 0 for the top. */
  Renderer.prototype.drawPlumage=function(g,face,front){
    if(Math.abs(face[3].y-face[0].y)<2)return;
    g.save();roundedPoly(g,face,this.cell*.06);g.clip();faceTransform(g,face,256);
    var sh=g.createRadialGradient(70,front?20:40,6,90,front?40:70,front?220:190);
    sh.addColorStop(0,'rgba(255,255,255,.26)');sh.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=sh;g.fillRect(0,0,256,256);
    // Overlapping contour feathers: rows of small offset scales, each lit on
    // its upper rim and shadowed under its lower edge, smaller toward the top.
    var rows=front?4:9,cols=front?9:9;
    for(var r=0;r<rows;r++)for(var c=0;c<=cols;c++){
      var k=r*31+c*7+front*500,fw=256/cols,fh=256/rows;
      var fx=(c+(r%2)*.5)*fw+(hash(k)-.5)*fw*.2,fy=(r+.55)*fh+(hash(k*1.9)-.5)*fh*.15;
      var rx=fw*.62,ry=fh*(front?.62:.7);
      g.strokeStyle='rgba(255,255,255,'+(.06+hash(k*3.3)*.07)+')';g.lineWidth=front?6:3;
      g.beginPath();g.ellipse(fx,fy,rx,ry,0,Math.PI*1.08,Math.PI*1.92);g.stroke();
      g.strokeStyle='rgba(60,30,0,'+(.04+hash(k*4.1)*.05)+')';g.lineWidth=front?5:2.5;
      g.beginPath();g.ellipse(fx,fy+ry*.25,rx*.95,ry,0,Math.PI*.12,Math.PI*.88);g.stroke();
    }
    var root=g.createLinearGradient(0,front?80:150,0,256);
    root.addColorStop(0,'rgba(60,30,0,0)');root.addColorStop(1,'rgba(60,30,0,.16)');
    g.fillStyle=root;g.fillRect(0,0,256,256);
    g.restore();
  };
  /**
   * A drifting floe: a slab of old, dense ice that gravity moves and no aurora
   * will take.
   *
   * The front face and broad bevel make the thickness legible. IS IT MINE — it is
   * the only desaturated thing on the board: no face, no beak, no colour for an
   * aurora to match. CAN I PUSH IT — it sits ON the tray rather than being part
   * of it: inset from the cell, rounded, with a contact shadow underneath.
   * The bevel does
   * most of that second job, which is why it is drawn wide enough to survive at
   * the 39px cell an iPhone SE gets: a flat grey square with no rim reads as a
   * hole cut in the ice, not a block resting on it.
   */
  Renderer.prototype.drawDrifter=function(g,d){
    var p=d.pos,sq=d.squash&&d.squash.amount?d.squash:null,q=sq?sq.amount:0;
    var sx=sq&&sq.axis==='x'?1+q*.05:1-q*.02;
    var sy=sq&&sq.axis==='y'?1+q*.05:1-q*.02;
    var inset=.10;
    var x0=p[0]+.5-(.5-inset)*sx,x1=p[0]+.5+(.5-inset)*sx;
    var y0=p[1]+.5-(.5-inset)*sy,y1=p[1]+.5+(.5-inset)*sy;
    this.drawContactShadow(g,p[0]+.5,p[1]+.62,.44,.38,true);
    var f=this.drawBox(g,{x0:x0,y0:y0,x1:x1,y1:y1,z0:.035,z1:.035+DRIFTER_HEIGHT,
      material:'drifter',radius:this.cell*.075,
      textures:{top:null,south:null,east:null}});
    this.drawFloeGrain(g,f.top,f.south);
    g.save();roundedPoly(g,f.top,this.cell*.075);g.strokeStyle='rgba(240,252,255,.65)';
    g.lineWidth=1.2;g.stroke();g.restore();
  };
  /* Old sea ice, on the same grey slab: uneven density, grit frozen in, a thin
     dusting of snow on the far half, and a weathered front edge. */
  Renderer.prototype.drawFloeGrain=function(g,top,front){
    var k;
    g.save();roundedPoly(g,top,this.cell*.075);g.clip();faceTransform(g,top,256);
    for(k=0;k<14;k++){var x=hash(k*2.3)*256,y=hash(k*3.7)*256,rr=22+hash(k*5.1)*38;
      var m=g.createRadialGradient(x,y,0,x,y,rr);
      m.addColorStop(0,hash(k)>.5?'rgba(255,255,255,.16)':'rgba(40,52,64,.13)');m.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=m;g.fillRect(x-rr,y-rr,rr*2,rr*2);}
    for(k=0;k<20;k++){g.fillStyle='rgba(45,52,60,'+(.18+hash(k*7.7)*.3)+')';
      g.beginPath();g.arc(28+hash(k*1.9)*200,36+hash(k*8.3)*190,1.4+hash(k*3.3)*3,0,Math.PI*2);g.fill();}
    var snow=g.createLinearGradient(0,0,0,120);
    snow.addColorStop(0,'rgba(250,253,255,.62)');snow.addColorStop(1,'rgba(250,253,255,0)');
    g.fillStyle=snow;g.beginPath();g.moveTo(0,0);g.lineTo(256,0);g.lineTo(256,62);
    g.bezierCurveTo(200,84,160,56,110,80);g.bezierCurveTo(70,100,30,74,0,92);g.closePath();g.fill();
    g.restore();
    if(front[3].y-front[0].y<1)return;
    g.save();roundedPoly(g,front,this.cell*.05);g.clip();faceTransform(g,front,256);
    var lip=g.createLinearGradient(0,0,0,256);
    lip.addColorStop(0,'rgba(255,255,255,.28)');lip.addColorStop(.3,'rgba(255,255,255,0)');
    lip.addColorStop(1,'rgba(20,30,40,.18)');g.fillStyle=lip;g.fillRect(0,0,256,256);
    for(k=0;k<8;k++){g.fillStyle='rgba(30,36,44,'+(.14+hash(k*9)*.18)+')';
      g.fillRect(hash(k*4)*240,70+hash(k*6)*160,5+hash(k)*10,4+hash(k*2)*6);}
    g.restore();
  };
  Renderer.prototype.drawFloeTop=function(g,face){
    var r=this.cell*.12;
    g.save();roundedPoly(g,face,r);g.clip();faceTransform(g,face,256);
    /* The raised inner panel. The band left around it is the bevel, and at 17%
       of the block it stays several pixels wide on the smallest board. */
    var panel=[{x:44,y:44},{x:212,y:44},{x:212,y:212},{x:44,y:212}];
    var lift=g.createLinearGradient(44,44,212,212);
    lift.addColorStop(0,'rgba(255,255,255,.46)');
    lift.addColorStop(.52,'rgba(255,255,255,.14)');
    lift.addColorStop(1,'rgba(30,44,60,.13)');
    roundedPoly(g,panel,26);g.fillStyle=lift;g.fill();
    /* Glass, not marking. Anything with a countable number of strokes on it
       turns into a glyph at 39px — two frost lines here read as a slash — so
       the ice quality comes from a wide diagonal sweep and one soft highlight,
       which have no shape to misread. */
    roundedPoly(g,panel,26);g.save();g.clip();
    var sweep=g.createLinearGradient(60,196,196,60);
    sweep.addColorStop(0,'rgba(255,255,255,0)');
    sweep.addColorStop(.44,'rgba(255,255,255,.26)');
    sweep.addColorStop(.58,'rgba(255,255,255,.05)');
    sweep.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=sweep;g.fillRect(0,0,256,256);
    var gloss=g.createRadialGradient(96,92,4,96,92,86);
    gloss.addColorStop(0,'rgba(255,255,255,.34)');
    gloss.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gloss;g.fillRect(0,0,256,256);
    g.restore();
    /* Lit from the north-west, like every floor tile and wall cap on the board:
       bright along the two near edges, shaded along the two far ones. */
    g.strokeStyle='rgba(240,252,255,.82)';g.lineWidth=9;g.lineJoin='round';
    g.beginPath();g.moveTo(6,238);g.lineTo(6,6);g.lineTo(238,6);g.stroke();
    g.strokeStyle='rgba(28,58,84,.27)';g.lineWidth=9;
    g.beginPath();g.moveTo(250,18);g.lineTo(250,250);g.lineTo(18,250);g.stroke();
    g.restore();
    /* One crisp outline, outside the clip, so the block keeps a hard edge
       against a pale floor tile at any size. Saved and restored like every
       other draw here: the command list shares one context, and a stroke style
       left behind leaks into whatever paints next. */
    g.save();roundedPoly(g,face,r);
    g.strokeStyle='rgba(46,66,88,.42)';g.lineWidth=Math.max(1,this.cell*.02);
    g.lineJoin='round';g.stroke();g.restore();
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
    var c=this.project(x,y,.008);g.save();
    g.translate(c.x+this.cell*.025,c.y+this.cell*.025);g.scale(this.cell*rx*1.2,this.cell*ry*1.1);
    var shadow=g.createRadialGradient(0,0,.12,0,0,1);
    shadow.addColorStop(0,deep?'rgba(24,65,85,.36)':'rgba(24,65,85,.42)');
    shadow.addColorStop(.55,'rgba(24,65,85,.20)');
    shadow.addColorStop(1,'rgba(24,65,85,0)');g.fillStyle=shadow;
    g.fillRect(-1,-1,2,2);g.restore();
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
    if(p.kind){
      g.save();g.globalAlpha=Math.min(1,a*2)*.9;
      if(p.kind==='skate'){
        g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=Math.max(.6,this.cell*.009);
        var tail=this.project(p.x-p.dx*.17,p.y-p.dy*.17,.012);
        g.beginPath();g.moveTo(tail.x,tail.y);g.lineTo(c.x,c.y);g.stroke();
      }else if(p.kind==='frost'){
        var mist=g.createRadialGradient(c.x,c.y,0,c.x,c.y,s*2.2);
        mist.addColorStop(0,'rgba(247,255,255,.6)');mist.addColorStop(1,'rgba(220,248,255,0)');
        g.fillStyle=mist;g.fillRect(c.x-s*2.2,c.y-s*2.2,s*4.4,s*4.4);
      }else{
        var ground=this.project(p.x,p.y,.01);
        g.fillStyle='rgba(37,104,127,.12)';g.beginPath();
        g.ellipse(ground.x+1,ground.y+1,s*.85,s*.35,0,0,Math.PI*2);g.fill();
        g.translate(c.x,c.y);g.rotate(p.angle);
        g.fillStyle=p.col;g.beginPath();g.moveTo(-s,-s*.35);g.lineTo(s*.2,-s);
        g.lineTo(s,s*.3);g.lineTo(-s*.2,s*.7);g.closePath();g.fill();
        g.fillStyle='#fff';g.beginPath();g.moveTo(-s,-s*.35);g.lineTo(s*.2,-s);
        g.lineTo(s*.1,s*.12);g.closePath();g.fill();
        g.strokeStyle='rgba(73,145,175,.65)';g.lineWidth=.5;g.beginPath();
        g.moveTo(-s*.2,s*.7);g.lineTo(s,s*.3);g.stroke();
        if(p.glint&&Math.sin(p.angle*2)>.94&&p.z>.055){
          g.strokeStyle='#fff';g.lineWidth=.8;g.beginPath();
          g.moveTo(-s*1.6,0);g.lineTo(s*1.6,0);g.moveTo(0,-s*1.6);g.lineTo(0,s*1.6);g.stroke();
        }
      }
      g.restore();return;
    }
    g.save();g.globalAlpha=a*.9;g.fillStyle=p.col;g.beginPath();g.arc(c.x,c.y,s,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,255,255,.72)';g.beginPath();g.arc(c.x-s*.25,c.y-s*.3,s*.28,0,Math.PI*2);g.fill();g.restore();
  };
  Renderer.prototype.drawClearGlow=function(g,a){
    var st=this.stage,p=[this.project(-.28,-.30,.03),this.project(st.w+.28,-.30,.03),
      this.project(st.w+.28,st.h+.30,.03),this.project(-.28,st.h+.30,.03)];
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
    var st=this.stage,x=st.w/2,y=st.h/2,lead=0;
    /* Colour the burst after a penguin, never after a drifter: a board can
       list the drifter first, and a grey firework for a clear is a shrug. */
    if(st.colour)for(var i=0;i<st.colour.length;i++){if(st.colour[i]!==E.GRAY){lead=st.colour[i];break;}}
    if(!this.reduceMotion){this.ripple(x,y,.08,THEME.clearRing,.28,Math.max(st.w,st.h)*.72,640);
      this.burst(x,y,.28,paletteOf(lead).mid,16,1.5);this.addShake(1.6,3.4);}
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
