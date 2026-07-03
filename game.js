"use strict";
/* =====================================================================
   MiniCraft — moteur (chargé par game.html) — v10
   + vie/faim (dégâts de chute, régén, manger, mort/respawn)
   + fer & four (fonte avec combustible) + outils en fer
   + grottes (bruit 3D) + textures perso via atlas.png
   ===================================================================== */

// ---------- Monde + sauvegarde ----------
const params=new URLSearchParams(location.search);
const worldName=params.get('w')||'Monde';
const registry=JSON.parse(localStorage.getItem('minicraft_worlds')||'[]');
const entry=registry.find(w=>w.name===worldName);
const SEED=entry?entry.seed:1337;
const SAVE_KEY='minicraft_save_'+worldName;
const save=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
const worldEdits=save.edits||{};
const settings=JSON.parse(localStorage.getItem('minicraft_settings')||'{}');

// ---------- Constantes & réglages ----------
const CHUNK=16, HEIGHT=48, SEA=22, M=14, STACK=64, TORCH_LIGHT=10, COOK_TIME=4;
let R=settings.render||5;
let soundOn=settings.soundOn!==false, soundVol=(settings.soundVol!=null?settings.soundVol:0.6), mouseSens=settings.sens||0.0022, FOV=settings.fov||75;
let mode=save.mode||'survival';   // 'survival' | 'creative' | 'spectator'
let difficulty=settings.difficulty||'normal';   // 'normal' | 'peaceful'
let skyDay=1;   // facteur jour (0=nuit, 1=plein jour), maj par updateSky
function saveSettings(){ try{ localStorage.setItem('minicraft_settings',JSON.stringify({soundOn,soundVol,sens:mouseSens,render:R,fov:FOV,difficulty})); }catch(e){} }

// ---------- Données du jeu ----------
// Tout (blocs, objets, recettes, textures) est défini dans blocks.js (chargé avant game.js).
// blocks.js expose en global : les ids (AIR, GRASS, …), BLOCKS, HARD, DROPS, BLOCK_TOOL,
// TOOL, SMELT, FUEL, EAT, RECIPES, TILE_FILES, ATLAS_TILES.
const dropOf=id=>DROPS[id]!=null?DROPS[id]:id;
const maxStackOf=id=>(BLOCKS[id]&&BLOCKS[id].maxStack)||STACK;
function mineMult(id){ const h=inv[selected]; if(!h) return 1; const t=TOOL[h.id]; if(!t) return 1; return BLOCK_TOOL[id]===t.k?t.m:1; }
// prédicats dérivés des drapeaux des blocs
const isTransparent=id=>id!==AIR&&!!(BLOCKS[id]&&BLOCKS[id].transparent);
const isOpaque=id=>id!==AIR&&!(BLOCKS[id]&&BLOCKS[id].transparent);
function isSolid(id){ if(id===AIR) return false; const b=BLOCKS[id]; if(!b||b.fluid) return false; if(b.solid===false) return false; if(b.noCube&&!b.solid) return false; return true; }

// ---------- Atlas de textures ----------
// Construit dynamiquement depuis TILE_FILES (défini par blocks.js d'après les noms de fichiers).
// Chaque tuile est remplie par son PNG (window.TEX base64, sinon assets/<nom>.png).
const TILE=16, ATLAS_TILES=window.ATLAS_TILES||8, ATLAS_PX=TILE*ATLAS_TILES;
const atlas=document.createElement('canvas'); atlas.width=atlas.height=ATLAS_PX;
const actx=atlas.getContext('2d');
actx.fillStyle='#c026c0'; actx.fillRect(0,0,ATLAS_PX,ATLAS_PX);   // magenta = texture manquante (le temps du chargement)

const texture=new THREE.CanvasTexture(atlas);
texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter; texture.generateMipmaps=false;
function tileUV(t){ const s=1/ATLAS_TILES,col=t%ATLAS_TILES,row=(t/ATLAS_TILES)|0,ins=0.5/ATLAS_PX; return [col*s+ins,1-(row+1)*s+ins,(col+1)*s-ins,1-row*s-ins]; }
// TILE_FILES (tuile→nom de fichier) est fourni par blocks.js d'après les textures référencées.
let _assetsLeft=Object.keys(TILE_FILES).length;
function finishAssets(){ texture.needsUpdate=true; for(const c of chunks.values()) c.dirty=true; renderHotbar(); if(invOpen) renderInvScreen(); }
// Textures intégrées (textures.js, base64) : aucun fichier externe → marche en double-clic
// et dans Bubble, sans serveur. Repli sur assets/<nom>.png si textures.js est absent.
(function loadAssets(){
  for(const t in TILE_FILES){ const tile=+t, name=TILE_FILES[tile], img=new Image();
    img.onload=()=>{ const col=tile%ATLAS_TILES,row=(tile/ATLAS_TILES)|0; actx.clearRect(col*TILE,row*TILE,TILE,TILE); actx.imageSmoothingEnabled=false; actx.drawImage(img,col*TILE,row*TILE,TILE,TILE); if(--_assetsLeft<=0) finishAssets(); };
    img.onerror=()=>{ if(--_assetsLeft<=0) finishAssets(); };
    img.src=(window.TEX&&window.TEX[name]) ? window.TEX[name] : ('assets/'+name+'.png');
  }
})();

// ---------- Fissures ----------
const crackMats=[];
for(let s=0;s<5;s++){ const cv=document.createElement('canvas'); cv.width=cv.height=16; const cx=cv.getContext('2d');
  cx.strokeStyle='rgba(0,0,0,0.55)'; cx.lineWidth=1; let seed=s*7+1; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  for(let i=0;i<(s+1)*3;i++){ cx.beginPath(); const x=rnd()*16,y=rnd()*16; cx.moveTo(x,y); cx.lineTo(x+(rnd()-0.5)*7,y+(rnd()-0.5)*7); cx.stroke(); }
  const tx=new THREE.CanvasTexture(cv); tx.magFilter=THREE.NearestFilter; tx.minFilter=THREE.NearestFilter; tx.generateMipmaps=false;
  crackMats.push(new THREE.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1})); }

// ---------- Scène ----------
const scene=new THREE.Scene();
const SKY_DAY=new THREE.Color(0x87ceeb), SKY_NIGHT=new THREE.Color(0x0a0c18);
scene.background=SKY_DAY.clone(); scene.fog=new THREE.Fog(SKY_DAY.getHex(),(R-1.5)*CHUNK,R*CHUNK);
const camera=new THREE.PerspectiveCamera(FOV,innerWidth/innerHeight,0.1,1000); camera.rotation.order='YXZ';
const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('game'),antialias:false,preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;   // ombres portées douces
// uniformes : fusionne les uniformes de lumière de Three (nécessaires aux ombres) + les nôtres
const lightU=THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
lightU.map={value:texture}; lightU.uSky={value:1.0};
lightU.uSkyColor={value:new THREE.Color(1.0,0.97,0.88)};   // teinte de la lumière du ciel (heure)
lightU.uBlockColor={value:new THREE.Color(1.0,0.72,0.40)}; // teinte chaude torches/glowstone
lightU.uShadow={value:0.45};                               // force de l'ombre du soleil
lightU.fogColor={value:new THREE.Color(0x87ceeb)}; lightU.fogNear={value:(R-1.5)*CHUNK}; lightU.fogFar={value:R*CHUNK};
// vC = (ombrage_face×AO , ciel/15 , bloc/15)  — smooth lighting par sommet (buildMesh)
const VS=`#include <common>
#include <shadowmap_pars_vertex>
attribute vec3 light3; varying vec2 vUv; varying vec3 vC; varying float vFog;
void main(){ vUv=uv; vC=light3;
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vFog=-mvPosition.z; }`;
function makeFS(cut){ return `#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform sampler2D map; uniform float uSky; uniform vec3 uSkyColor; uniform vec3 uBlockColor; uniform float uShadow; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
varying vec2 vUv; varying vec3 vC; varying float vFog;
void main(){ vec4 t=texture2D(map,vUv);
  ${cut?'if(t.a<0.5) discard;':''}
  float sh=1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow dl=directionalLightShadows[0];
    sh=getShadow(directionalShadowMap[0], dl.shadowMapSize, dl.shadowBias, dl.shadowRadius, vDirectionalShadowCoord[0]);
  #endif
  float sunVis=mix(1.0-uShadow,1.0,sh);          // zones à l'ombre : lumière du ciel réduite
  vec3 skyL=vC.y*uSky*uSkyColor*sunVis;
  vec3 blkL=vC.z*uBlockColor;
  vec3 light=max(max(skyL,blkL),vec3(0.045));
  vec3 col=t.rgb*light*vC.x;
  float lum=dot(col,vec3(0.299,0.587,0.114));
  col=mix(vec3(lum),col,1.25); col=col*1.06; col=col/(1.0+col*0.16); col=clamp(col,0.0,1.0);
  float f=clamp((vFog-fogNear)/(fogFar-fogNear),0.0,1.0); col=mix(col,fogColor,f);
  gl_FragColor=vec4(col, ${cut?'1.0':'t.a'}); }`; }
const FS=makeFS(false), FS_CUT=makeFS(true);
const matOpaque=new THREE.ShaderMaterial({uniforms:lightU,vertexShader:VS,fragmentShader:FS,lights:true});
const matCutout=new THREE.ShaderMaterial({uniforms:lightU,vertexShader:VS,fragmentShader:FS_CUT,lights:true,side:THREE.DoubleSide});   // feuilles : alpha-cutout
const matWater=new THREE.ShaderMaterial({uniforms:lightU,vertexShader:VS,fragmentShader:FS,lights:true,transparent:true,depthWrite:false,side:THREE.DoubleSide});
const matItem=new THREE.MeshBasicMaterial({map:texture});
// ---------- Soleil directionnel (ombres portées) ----------
const sunLight=new THREE.DirectionalLight(0xffffff,1.0); sunLight.castShadow=true;
sunLight.shadow.mapSize.set(2048,2048);
{ const sc=sunLight.shadow.camera; sc.near=1; sc.far=240; sc.left=-80; sc.right=80; sc.top=80; sc.bottom=-80; sc.updateProjectionMatrix(); }
sunLight.shadow.bias=-0.0004; sunLight.shadow.normalBias=0.45;
scene.add(sunLight); scene.add(sunLight.target);
const highlight=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001,1.001,1.001)),new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:0.4}));
highlight.visible=false; scene.add(highlight);
const breakBox=new THREE.Mesh(new THREE.BoxGeometry(1.003,1.003,1.003),crackMats[0]); breakBox.visible=false; breakBox.renderOrder=2; scene.add(breakBox);

// ---------- Ciel : soleil, lune, nuages + objet tenu ----------
scene.add(camera);   // pour afficher l'objet en main (enfant de la caméra)
function discTex(inner,outer){ const cv=document.createElement('canvas'); cv.width=cv.height=64; const g=cv.getContext('2d');
  const grd=g.createRadialGradient(32,32,2,32,32,32); grd.addColorStop(0,inner); grd.addColorStop(0.62,inner); grd.addColorStop(1,outer); g.fillStyle=grd; g.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(cv); return t; }
const sunMesh=new THREE.Mesh(new THREE.PlaneGeometry(48,48),new THREE.MeshBasicMaterial({map:discTex('rgba(255,246,205,1)','rgba(255,205,90,0)'),transparent:true,depthWrite:false,fog:false}));
const moonMesh=new THREE.Mesh(new THREE.PlaneGeometry(34,34),new THREE.MeshBasicMaterial({map:discTex('rgba(238,242,255,1)','rgba(196,206,235,0)'),transparent:true,depthWrite:false,fog:false}));
sunMesh.renderOrder=-2; moonMesh.renderOrder=-2; scene.add(sunMesh); scene.add(moonMesh);
function cloudTex(){ const S=256,cv=document.createElement('canvas'); cv.width=cv.height=S; const g=cv.getContext('2d');
  let s=987654321; const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  for(let i=0;i<22;i++){ const cx=rnd()*S,cy=rnd()*S,r=20+rnd()*46; g.fillStyle='rgba(255,255,255,'+(0.5+rnd()*0.4).toFixed(2)+')';
    for(let j=0;j<7;j++){ const ox=cx+(rnd()-0.5)*r,oy=cy+(rnd()-0.5)*r*0.6; g.beginPath(); g.arc(ox,oy,r*(0.45+rnd()*0.55),0,6.2832); g.fill(); } }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4); return t; }
const cloudMesh=new THREE.Mesh(new THREE.PlaneGeometry(700,700),new THREE.MeshBasicMaterial({map:cloudTex(),transparent:true,depthWrite:false,opacity:0.8}));
cloudMesh.rotation.x=-Math.PI/2; cloudMesh.renderOrder=-1; scene.add(cloudMesh);
const SUNSET=new THREE.Color(0xff7a3c);
// ---------- Dôme de ciel en dégradé (horizon → zénith) ----------
const skyDomeMat=new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
  uniforms:{ topC:{value:new THREE.Color(0x2a6bd0)}, botC:{value:new THREE.Color(0xbfe0f5)} },
  vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`varying vec3 vDir; uniform vec3 topC; uniform vec3 botC;
    void main(){ float t=clamp(vDir.y*0.5+0.5,0.0,1.0); t=pow(t,0.55); gl_FragColor=vec4(mix(botC,topC,t),1.0); }` });
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(480,24,16),skyDomeMat); skyDome.renderOrder=-3; scene.add(skyDome);
const SKY_TOP_DAY=new THREE.Color(0x2f6fd6), SKY_BOT_DAY=new THREE.Color(0xc4e4f7);
const SKY_TOP_NIGHT=new THREE.Color(0x05060f), SKY_BOT_NIGHT=new THREE.Color(0x10162e);
const SKY_TOP_DUSK=new THREE.Color(0x3a2a6a), SKY_BOT_DUSK=new THREE.Color(0xff7a3c);
const _stop=new THREE.Color(), _sbot=new THREE.Color();
// matériau & géométries pour l'objet tenu en main (plein écran, toujours visible)
const heldMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:0.25,depthTest:false});
const _heldCube={},_heldFlat={},_fullGeo={};
function uvFace(geo,faces){ const uv=geo.attributes.uv; for(let f=0;f<faces.length;f++){ const [u0,v0,u1,v1]=tileUV(faces[f]),b=f*4; uv.setXY(b,u0,v1); uv.setXY(b+1,u1,v1); uv.setXY(b+2,u0,v0); uv.setXY(b+3,u1,v0); } uv.needsUpdate=true; return geo; }
function heldCubeGeo(id){ if(_heldCube[id]) return _heldCube[id]; const d=BLOCKS[id]; return _heldCube[id]=uvFace(new THREE.BoxGeometry(0.5,0.5,0.5),[d.side,d.side,d.top,d.bottom,d.side,d.side]); }
function fullBlockGeo(id){ if(_fullGeo[id]) return _fullGeo[id]; const d=BLOCKS[id]; return _fullGeo[id]=uvFace(new THREE.BoxGeometry(1,1,1),[d.side,d.side,d.top,d.bottom,d.side,d.side]); }
function heldFlatGeo(id){ if(_heldFlat[id]) return _heldFlat[id]; const g=new THREE.PlaneGeometry(0.5,0.5),[u0,v0,u1,v1]=tileUV(BLOCKS[id].side),uv=g.attributes.uv;
  uv.setXY(0,u0,v1); uv.setXY(1,u1,v1); uv.setXY(2,u0,v0); uv.setXY(3,u1,v0); uv.needsUpdate=true; return _heldFlat[id]=g; }
let heldMesh=null,heldId=undefined,heldSwing=0;
function updateHeldItem(){ const it=inv[selected],id=it?it.id:null; if(id===heldId) return; heldId=id;
  if(heldMesh){ camera.remove(heldMesh); heldMesh=null; } if(id==null) return;
  const isItem=!!BLOCKS[id].item; heldMesh=new THREE.Mesh(isItem?heldFlatGeo(id):heldCubeGeo(id),heldMat); heldMesh.renderOrder=1000; camera.add(heldMesh); }
function animateHeld(dt){ if(!heldMesh) return; heldMesh.visible=!invOpen&&mode!=='spectator';
  if(heldSwing>0) heldSwing=Math.max(0,heldSwing-dt*3.6); const s=heldSwing,isItem=!!(BLOCKS[heldId]&&BLOCKS[heldId].item);
  heldMesh.position.set(0.5-s*0.12,-0.45-Math.sin(s*Math.PI)*0.22,-0.8+s*0.05);
  heldMesh.rotation.set((isItem?0:-0.15)-s*0.8,isItem?-0.3:0.7,(isItem?-0.5:0)+s*0.3); }

// ---------- Perlin / terrain / bruit 3D ----------
function makePerlin(seed){ const perm=[]; for(let i=0;i<256;i++) perm[i]=i;
  let s=seed>>>0; const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  for(let i=255;i>0;i--){ const j=(rnd()*(i+1))|0; const t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
  const p=new Uint8Array(512); for(let i=0;i<512;i++) p[i]=perm[i&255];
  const fade=t=>t*t*t*(t*(t*6-15)+10),L=(a,b,t)=>a+t*(b-a),grad=(h,x,y)=>((h&1)?x:-x)+((h&2)?y:-y);
  return (x,y)=>{ const X=Math.floor(x)&255,Y=Math.floor(y)&255; x-=Math.floor(x); y-=Math.floor(y);
    const u=fade(x),v=fade(y),aa=p[p[X]+Y],ab=p[p[X]+Y+1],ba=p[p[X+1]+Y],bb=p[p[X+1]+Y+1];
    return L(L(grad(aa,x,y),grad(ba,x-1,y),u),L(grad(ab,x,y-1),grad(bb,x-1,y-1),u),v); }; }
const perlin=makePerlin(SEED);
function fbm(x,z){ let a=0,amp=1,fr=0.012,n=0; for(let i=0;i<4;i++){ a+=perlin(x*fr,z*fr)*amp; n+=amp; amp*=0.5; fr*=2; } return a/n; }
function elevAt(x,z){ return perlin(x*0.0035+900,z*0.0035+900); }   // bruit d'élévation (montagnes)
function heightAt(x,z){ let hgt=24+fbm(x,z)*11; const e=elevAt(x,z); if(e>0.42) hgt+=(e-0.42)*46; return Math.floor(Math.min(HEIGHT-4,hgt)); }
function hash2(x,z){ let n=(x*374761393+z*668265263)|0; n=(n^(n>>13))*1274126177; n=n^(n>>16); return (n>>>0)/4294967295; }
function hash3(x,y,z){ let n=(x*374761393+y*668265263+z*1103515245)|0; n=(n^(n>>13))*1274126177; n=n^(n>>16); return (n>>>0)/4294967295; }
function noise3(x,y,z){ const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),L=(a,b,t)=>a+t*(b-a),h=(a,b,c)=>hash3(a,b,c)*2-1;
  const x00=L(h(xi,yi,zi),h(xi+1,yi,zi),u),x10=L(h(xi,yi+1,zi),h(xi+1,yi+1,zi),u);
  const x01=L(h(xi,yi,zi+1),h(xi+1,yi,zi+1),u),x11=L(h(xi,yi+1,zi+1),h(xi+1,yi+1,zi+1),u);
  return L(L(x00,x10,v),L(x01,x11,v),w); }

// ---------- Monde ----------
const chunks=new Map(); const torches=new Set();
const ckey=(cx,cz)=>cx+','+cz; const vidx=(x,y,z)=>x+CHUNK*(z+CHUNK*y);
function getBlock(wx,wy,wz){ if(wy<0||wy>=HEIGHT) return AIR; const cx=Math.floor(wx/CHUNK),cz=Math.floor(wz/CHUNK); const c=chunks.get(ckey(cx,cz)); if(!c) return AIR; return c.blocks[vidx(wx-cx*CHUNK,wy,wz-cz*CHUNK)]; }
function markDirty(cx,cz){ const c=chunks.get(ckey(cx,cz)); if(c) c.dirty=true; }
function setBlock(wx,wy,wz,id){ if(wy<0||wy>=HEIGHT) return; const cx=Math.floor(wx/CHUNK),cz=Math.floor(wz/CHUNK); const c=chunks.get(ckey(cx,cz)); if(!c) return;
  const lx=wx-cx*CHUNK,lz=wz-cz*CHUNK; c.blocks[vidx(lx,wy,lz)]=id; c.dirty=true;
  if(lx===0) markDirty(cx-1,cz); if(lx===CHUNK-1) markDirty(cx+1,cz); if(lz===0) markDirty(cx,cz-1); if(lz===CHUNK-1) markDirty(cx,cz+1);
  markDirty(cx-1,cz-1); markDirty(cx+1,cz-1); markDirty(cx-1,cz+1); markDirty(cx+1,cz+1); }
function editBlock(wx,wy,wz,id){ const prev=getBlock(wx,wy,wz); setBlock(wx,wy,wz,id);
  const cx=Math.floor(wx/CHUNK),cz=Math.floor(wz/CHUNK),k=ckey(cx,cz); (worldEdits[k]||(worldEdits[k]={}))[(wx-cx*CHUNK)+','+wy+','+(wz-cz*CHUNK)]=id;
  const tk=wx+','+wy+','+wz; const wasLit=BLOCKS[prev]&&BLOCKS[prev].light, isLit=BLOCKS[id]&&BLOCKS[id].light;
  if(wasLit) torches.delete(tk); if(isLit) torches.add(tk);
  if(id===AIR){ activateWater(wx,wy,wz); const ab=getBlock(wx,wy+1,wz); if(BLOCKS[ab]&&BLOCKS[ab].fall) startFall(wx,wy+1,wz,ab); }
  scheduleSave(); }

// ---------- Eau qui coule (propagation) ----------
const waterLevel=new Map(); const waterQueue=[];
function activateWater(wx,wy,wz){ if(waterQueue.length>4000) return;
  if(getBlock(wx,wy+1,wz)===WATER) waterQueue.push([wx,wy+1,wz]);
  if(getBlock(wx+1,wy,wz)===WATER) waterQueue.push([wx+1,wy,wz]); if(getBlock(wx-1,wy,wz)===WATER) waterQueue.push([wx-1,wy,wz]);
  if(getBlock(wx,wy,wz+1)===WATER) waterQueue.push([wx,wy,wz+1]); if(getBlock(wx,wy,wz-1)===WATER) waterQueue.push([wx,wy,wz-1]); }
function wlevel(x,y,z){ const l=waterLevel.get(x+','+y+','+z); return l==null?0:l; }
function spreadWater(x,y,z,lvl){ if(getBlock(x,y,z)!==AIR) return; waterLevel.set(x+','+y+','+z,lvl); editBlock(x,y,z,WATER); waterQueue.push([x,y,z]); }
function flowTick(){ let budget=24;
  while(budget>0 && waterQueue.length){ const c=waterQueue.shift(); if(getBlock(c[0],c[1],c[2])!==WATER) continue; budget--;
    const lvl=wlevel(c[0],c[1],c[2]);
    if(getBlock(c[0],c[1]-1,c[2])===AIR) spreadWater(c[0],c[1]-1,c[2],0);
    else if(lvl<7){ spreadWater(c[0]+1,c[1],c[2],lvl+1); spreadWater(c[0]-1,c[1],c[2],lvl+1); spreadWater(c[0],c[1],c[2]+1,lvl+1); spreadWater(c[0],c[1],c[2]-1,lvl+1); } } }

function plantTree(blocks,lx,baseY,lz,logId,leafId,height){ const th=height||(4+(hash2(lx*7+baseY,lz*13)*3|0));
  logId=logId||WOOD; leafId=leafId||LEAVES;
  for(let i=0;i<th;i++){ const y=baseY+i; if(y<HEIGHT) blocks[vidx(lx,y,lz)]=logId; }
  const top=baseY+th-1;
  for(let dy=-1;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){ const x=lx+dx,y=top+dy,z=lz+dz;
    if(x<0||x>=CHUNK||z<0||z>=CHUNK||y<0||y>=HEIGHT) continue; if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<=3&&blocks[vidx(x,y,z)]===AIR) blocks[vidx(x,y,z)]=leafId; } }

// ---------- Biomes (température × humidité × élévation) ----------
function biomeAt(x,z){
  if(elevAt(x,z)>0.52) return 'mountains';
  const t=perlin(x*0.004+100,z*0.004+100)+0.4*perlin(x*0.013+30,z*0.013+30);   // température
  const h=perlin(x*0.005+555,z*0.005+555)+0.4*perlin(x*0.015+8,z*0.015+8);     // humidité
  if(t<-0.35) return h>0.05?'taiga':'snow';                                     // froid
  if(t>0.42)  return h<-0.05?'desert':(h>0.30?'jungle':'mesa');                 // chaud
  if(t>0.12)  return h<-0.10?'savanna':(h>0.34?'jungle':'plains');             // tiède
  if(h>0.42)  return 'swamp';                                                   // tempéré humide
  if(h>0.04)  return 'forest';
  return 'plains';
}
// roche : pierre + filons d'andésite/granite/diorite
function stoneVariant(wx,y,wz){ const v=noise3(wx*0.06+5,y*0.06,wz*0.06+5)+0.5;   // noise3 ici ~[-1,0] → recentré
  if(v>0.26) return ANDESITE; if(v<-0.26) return GRANITE;
  if(noise3(wx*0.06+60,y*0.06+9,wz*0.06+60)+0.5>0.30) return DIORITE; return STONE; }
// minerai à une profondeur donnée (-1 = pas de minerai)
function oreAt(wx,y,wz,h,bi){
  if(y<=6 && hash3(wx*5+1,y,wz*5+1)<0.0010) return OBSIDIAN;
  if(y<=8 && hash3(wx*7+3,y,wz*7+3)<0.0016) return DIAMOND_ORE;
  if(bi==='mountains' && hash3(wx*9+2,y,wz*9+2)<0.0022) return EMERALD_ORE;
  if(y<=18 && hash3(wx*4+11,y,wz*4+11)<0.0035) return LAPIS_ORE;
  if(y<=15 && hash3(wx*6+13,y,wz*6+13)<0.006) return REDSTONE_ORE;
  if(y<=9 && hash3(wx*3+5,y,wz*3+5)<0.003) return GOLD_ORE;
  if(y>1&&y<h-6 && hash3(wx*2+7,y,wz*2+7)<0.006) return IRON_ORE;
  if(y>2 && hash3(wx,y,wz)<0.02) return COAL_ORE;
  if(y>h-9 && hash3(wx+51,y+7,wz+51)<0.04) return GRAVEL;
  return -1;
}
// arbre & densité selon le biome
function treeOf(bi,wx,wz){
  if(bi==='taiga'||bi==='snow'||bi==='mountains') return [SPRUCE_LOG,SPRUCE_LEAVES];
  if(bi==='savanna') return [ACACIA_LOG,ACACIA_LEAVES];
  if(bi==='jungle')  return [JUNGLE_LOG,JUNGLE_LEAVES];
  if(bi==='forest')  return hash2(wx*9+1,wz*9+1)<0.4?[BIRCH_LOG,BIRCH_LEAVES]:[WOOD,LEAVES];
  return [WOOD,LEAVES];   // plaines, marais
}
function treeDensity(bi){ return bi==='jungle'?0.11:bi==='forest'?0.085:bi==='taiga'?0.06:bi==='swamp'?0.04:bi==='savanna'?0.016:bi==='snow'?0.02:bi==='mountains'?0.008:0.012; }
// structures
function setL(blocks,lx,y,lz,id){ if(lx<0||lx>=CHUNK||lz<0||lz>=CHUNK||y<0||y>=HEIGHT) return; blocks[vidx(lx,y,lz)]=id; }
function buildHut(blocks,lx,gy,lz){
  for(let dx=0;dx<5;dx++) for(let dz=0;dz<5;dz++) setL(blocks,lx+dx,gy,lz+dz,COBBLE);
  for(let dy=1;dy<=2;dy++) for(let dx=0;dx<5;dx++) for(let dz=0;dz<5;dz++) if(dx===0||dx===4||dz===0||dz===4) setL(blocks,lx+dx,gy+dy,lz+dz,PLANKS);
  setL(blocks,lx+2,gy+1,lz,AIR); setL(blocks,lx+2,gy+2,lz,AIR);                 // porte
  for(let dx=0;dx<5;dx++) for(let dz=0;dz<5;dz++) setL(blocks,lx+dx,gy+3,lz+dz,PLANKS);   // toit
  setL(blocks,lx+2,gy+1,lz+2,TORCH);
}
function buildDungeon(blocks,lx,gy,lz){
  for(let dx=0;dx<5;dx++) for(let dy=0;dy<4;dy++) for(let dz=0;dz<5;dz++){ const edge=(dx===0||dx===4||dy===0||dy===3||dz===0||dz===4); setL(blocks,lx+dx,gy+dy,lz+dz,edge?MOSSY_COBBLE:AIR); }
  setL(blocks,lx+1,gy+1,lz+1,TORCH); setL(blocks,lx+3,gy+2,lz+3,TORCH); setL(blocks,lx+2,gy+1,lz+2,GOLD_ORE);
}
function buildBoat(blocks,lx,gy,lz){
  for(let dx=0;dx<3;dx++) for(let dz=0;dz<5;dz++) setL(blocks,lx+dx,gy-1,lz+dz,PLANKS);
  for(let dx=0;dx<3;dx++) for(let dz=0;dz<5;dz++) if(dx===0||dx===2||dz===0||dz===4) setL(blocks,lx+dx,gy,lz+dz,PLANKS);
}
let _villagerSpawns=[];
function buildVillageHouse(blocks,lx,gy,lz,wx,wz){ const W=6,Dp=6;
  for(let dx=0;dx<W;dx++) for(let dz=0;dz<Dp;dz++){ setL(blocks,lx+dx,gy-1,lz+dz,COBBLE); setL(blocks,lx+dx,gy,lz+dz,PLANKS); }   // fondation + sol
  for(let dy=1;dy<=3;dy++) for(let dx=0;dx<W;dx++) for(let dz=0;dz<Dp;dz++){ if(dx===0||dx===W-1||dz===0||dz===Dp-1){
    let id=PLANKS; if(dy===2&&(((dx===0||dx===W-1)&&(dz===2||dz===3))||((dz===0||dz===Dp-1)&&dx===4))) id=GLASS; setL(blocks,lx+dx,gy+dy,lz+dz,id); } }
  for(let dx=-1;dx<=W;dx++) for(let dz=-1;dz<=Dp;dz++) setL(blocks,lx+dx,gy+4,lz+dz,PLANKS);   // toit débordant
  setL(blocks,lx+2,gy+1,lz,DOOR); setL(blocks,lx+2,gy+2,lz,DOOR);                              // porte (2 de haut)
  setL(blocks,lx+2,gy+1,lz-1,AIR); setL(blocks,lx+2,gy+2,lz-1,AIR);                            // dégager devant
  setL(blocks,lx+2,gy,lz-1,GRAVEL); setL(blocks,lx+2,gy,lz-2,GRAVEL);                          // chemin
  setL(blocks,lx+1,gy+3,lz+1,TORCH); setL(blocks,lx+W-2,gy+1,lz+Dp-2,CRAFT_TABLE);             // mobilier
  _villagerSpawns.push([wx+W-2,gy+1,wz+2],[wx+2,gy+1,wz-2]);
}
function spawnVillagerNear(wx,wy,wz){ if(mobs.reduce((n,m)=>n+(m.type==='villager'?1:0),0)>=12) return;
  if(Math.hypot(wx-player.pos.x,wz-player.pos.z)>R*CHUNK+10) return; spawnMob(wx+0.5,wy,wz+0.5,'villager'); }
function buildStructures(blocks,cx,cz){
  const wx0=cx*CHUNK,wz0=cz*CHUNK;
  if(hash2(cx*131+7,cz*131+13)<0.04){ const lx=2+((hash2(cx,cz)*6)|0),lz=2+((hash2(cz,cx)*6)|0),wx=wx0+lx,wz=wz0+lz,bi=biomeAt(wx,wz),h=heightAt(wx,wz);
    if((bi==='plains'||bi==='forest')&&h>SEA+1) buildHut(blocks,lx,h,lz); }
  if(hash2(cx*271+91,cz*271+37)<0.05){ const lx=2+((hash2(cx+5,cz)*6)|0),lz=2+((hash2(cz+5,cx)*6)|0),dy=6+((hash2(cx,cz+9)*10)|0); buildDungeon(blocks,lx,dy,lz); }
  if(hash2(cx*373+3,cz*373+19)<0.04){ const lx=2+((hash2(cx+2,cz+2)*8)|0),lz=2+((hash2(cz+2,cx+2)*7)|0),wx=wx0+lx,wz=wz0+lz; if(heightAt(wx,wz)<SEA-1) buildBoat(blocks,lx,SEA+1,lz); }
  if(hash2(cx*523+17,cz*523+41)<0.022){ const lx=4,lz=4,wx=wx0+lx,wz=wz0+lz,bi=biomeAt(wx,wz),h=heightAt(wx,wz);
    if((bi==='plains'||bi==='forest')&&h>SEA+1&&Math.abs(heightAt(wx+5,wz+5)-h)<=2&&Math.abs(heightAt(wx,wz+5)-h)<=2&&Math.abs(heightAt(wx+5,wz)-h)<=2) buildVillageHouse(blocks,lx,h,lz,wx,wz); }
}
function genChunk(cx,cz){
  const blocks=new Uint8Array(CHUNK*CHUNK*HEIGHT);
  for(let lx=0;lx<CHUNK;lx++) for(let lz=0;lz<CHUNK;lz++){ const wx=cx*CHUNK+lx,wz=cz*CHUNK+lz,h=heightAt(wx,wz),bi=biomeAt(wx,wz);
    for(let y=0;y<HEIGHT;y++){ let id=AIR;
      if(y===0) id=BEDROCK;
      else if(y<h-3){                              // sous-sol profond
        if(bi==='desert'&&y>=h-7) id=SANDSTONE;
        else if(bi==='mesa'&&y>=h-7) id=(y>=h-5?TERRACOTTA:RED_SANDSTONE);
        else { const o=oreAt(wx,y,wz,h,bi); id=(o>=0)?o:stoneVariant(wx,y,wz); }
      }
      else if(y<h){                                // sous-surface (h-3..h-1)
        id=(h<=SEA+1)?SAND:(bi==='desert')?SAND:(bi==='mesa')?TERRACOTTA:(bi==='mountains'&&h>=37)?STONE:DIRT;
      }
      else if(y===h){                              // surface
        if(h<=SEA+1) id=SAND;
        else if(bi==='desert') id=SAND;
        else if(bi==='mesa') id=RED_SAND;
        else if(bi==='snow') id=SNOW;
        else if(bi==='mountains') id=(h>=41?SNOW:(h>=37?STONE:GRASS));
        else if(bi==='taiga') id=(hash2(wx*2+3,wz*2+3)<0.28?PODZOL:GRASS);
        else id=GRASS;
      }
      else if(y<=SEA) id=(bi==='snow'&&y===SEA)?ICE:WATER;
      blocks[vidx(lx,y,lz)]=id; }
    // grottes (tunnels = intersection de 2 nappes de bruit 3D)
    for(let y=2;y<h-1;y++){ const id=blocks[vidx(lx,y,lz)]; if(id===AIR||id===BEDROCK) continue;
      const a=noise3(wx*0.05,y*0.07,wz*0.05), b=noise3(wx*0.05+71,y*0.07+19,wz*0.05+43);
      if(a*a+b*b < 0.28) blocks[vidx(lx,y,lz)]=AIR; }
    // entrée de grotte : puits jusqu'à la surface aux endroits clairsemés
    if(h>SEA+1 && perlin(wx*0.07+900,wz*0.07+900)>0.58){
      for(let y=h-1;y>3;y--){ if(blocks[vidx(lx,y,lz)]===AIR){ for(let yy=h;yy>y;yy--) blocks[vidx(lx,yy,lz)]=AIR; break; } }
    }
    // décoration de surface (arbres, cactus, plantes)
    const top=blocks[vidx(lx,h,lz)];
    if(h>SEA+1 && blocks[vidx(lx,h+1,lz)]===AIR){
      if(bi==='desert'||bi==='mesa'){
        if(top===SAND||top===RED_SAND){
          if(hash2(wx,wz)<0.016){ const ch=1+(hash2(wx*3,wz*3)*3|0); for(let i=1;i<=ch;i++) if(h+i<HEIGHT) blocks[vidx(lx,h+i,lz)]=CACTUS; }
          else if(hash2(wx*5+2,wz*5+2)<0.02) blocks[vidx(lx,h+1,lz)]=DEAD_BUSH;
        }
      } else if(top===GRASS||top===SNOW||top===PODZOL){
        if(hash2(wx,wz)<treeDensity(bi)){ const tw=treeOf(bi,wx,wz); plantTree(blocks,lx,h+1,lz,tw[0],tw[1]); }
        else { const r=hash2(wx*5+2,wz*5+2);
          if(r<0.10) blocks[vidx(lx,h+1,lz)]=TALL_GRASS;
          else if(r<0.125) blocks[vidx(lx,h+1,lz)]=FLOWER_RED;
          else if(r<0.15) blocks[vidx(lx,h+1,lz)]=FLOWER_YELLOW;
        }
      }
    }
  }
  buildStructures(blocks,cx,cz);
  const e=worldEdits[ckey(cx,cz)]; if(e) for(const k in e){ const a=k.split(','); blocks[vidx(+a[0],+a[1],+a[2])]=e[k]; }
  for(let y=0;y<HEIGHT;y++) for(let z=0;z<CHUNK;z++) for(let x=0;x<CHUNK;x++){ const b=blocks[vidx(x,y,z)]; if(BLOCKS[b]&&BLOCKS[b].light) torches.add((cx*CHUNK+x)+','+y+','+(cz*CHUNK+z)); }
  const c={x:cx,z:cz,blocks,dirty:true,mesh:null,water:null,cut:null,torchG:null}; chunks.set(ckey(cx,cz),c);
  if(_villagerSpawns.length){ for(const v of _villagerSpawns) spawnVillagerNear(v[0],v[1],v[2]); _villagerSpawns.length=0; }
  markDirty(cx-1,cz); markDirty(cx+1,cz); markDirty(cx,cz-1); markDirty(cx,cz+1); return c;
}

// ---------- Lumière ----------
const PW=CHUNK+2*M; const lightSky=new Uint8Array(PW*PW*HEIGHT),lightBlk=new Uint8Array(PW*PW*HEIGHT),lq=new Int32Array(PW*PW*HEIGHT);
const pidx=(px,py,pz)=>px+PW*(pz+PW*py);
function computeLight(c){ const ox=c.x*CHUNK,oz=c.z*CHUNK,cache={};
  for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){ const cc=chunks.get(ckey(c.x+dx,c.z+dz)); cache[dx+','+dz]=cc?cc.blocks:null; }
  const blk=(wx,wy,wz)=>{ if(wy<0) return STONE; if(wy>=HEIGHT) return AIR; const ccx=Math.floor(wx/CHUNK)-c.x,ccz=Math.floor(wz/CHUNK)-c.z; const arr=cache[ccx+','+ccz]; if(!arr) return AIR; return arr[vidx(((wx%CHUNK)+CHUNK)%CHUNK,wy,((wz%CHUNK)+CHUNK)%CHUNK)]; };
  const prop=(arr,tail)=>{ for(let head=0;head<tail;head++){ const i=lq[head],l=arr[i]; if(l<=1) continue;
    const py=(i/(PW*PW))|0,rem=i-py*PW*PW,pz=(rem/PW)|0,px=rem-pz*PW,nl=l-1;
    const tN=(nx,ny,nz)=>{ if(nx<0||nx>=PW||nz<0||nz>=PW||ny<0||ny>=HEIGHT) return; const wx=ox-M+nx,wz=oz-M+nz; if(isOpaque(blk(wx,ny,wz))) return; const ni=pidx(nx,ny,nz); if(arr[ni]<nl){ arr[ni]=nl; lq[tail++]=ni; } };
    tN(px-1,py,pz); tN(px+1,py,pz); tN(px,py-1,pz); tN(px,py+1,pz); tN(px,py,pz-1); tN(px,py,pz+1); } };
  lightSky.fill(0); let t1=0;
  for(let px=0;px<PW;px++) for(let pz=0;pz<PW;pz++){ const wx=ox-M+px,wz=oz-M+pz; for(let y=HEIGHT-1;y>=0;y--){ if(isOpaque(blk(wx,y,wz))) break; const i=pidx(px,y,pz); lightSky[i]=15; lq[t1++]=i; } }
  prop(lightSky,t1);
  lightBlk.fill(0); let t2=0;
  for(const t of torches){ const a=t.split(','),wx=+a[0],wy=+a[1],wz=+a[2],px=wx-(ox-M),pz=wz-(oz-M); if(px<0||px>=PW||pz<0||pz>=PW||wy<0||wy>=HEIGHT) continue;
    const lv=(BLOCKS[blk(wx,wy,wz)]&&BLOCKS[blk(wx,wy,wz)].light)||TORCH_LIGHT; const i=pidx(px,wy,pz); if(lightBlk[i]<lv){ lightBlk[i]=lv; lq[t2++]=i; } }
  prop(lightBlk,t2);
}
function sampleLight(lx,y,lz,d){ const ny=y+d[1]; if(ny<0) return [0,0]; if(ny>=HEIGHT) return [15,0]; const i=pidx(lx+d[0]+M,ny,lz+d[2]+M); return [lightSky[i],lightBlk[i]]; }

// ---------- Maillage ----------
const FACES=[ {dir:[-1,0,0],corners:[[0,1,0,0,1],[0,0,0,0,0],[0,1,1,1,1],[0,0,1,1,0]]},
  {dir:[1,0,0],corners:[[1,1,1,0,1],[1,0,1,0,0],[1,1,0,1,1],[1,0,0,1,0]]},
  {dir:[0,-1,0],corners:[[1,0,1,1,0],[0,0,1,0,0],[1,0,0,1,1],[0,0,0,0,1]]},
  {dir:[0,1,0],corners:[[0,1,1,1,1],[1,1,1,0,1],[0,1,0,1,0],[1,1,0,0,0]]},
  {dir:[0,0,-1],corners:[[1,0,0,0,0],[0,0,0,1,0],[1,1,0,0,1],[0,1,0,1,1]]},
  {dir:[0,0,1],corners:[[0,0,1,0,0],[1,0,1,1,0],[0,1,1,0,1],[1,1,1,1,1]]} ];
const FACE_BRIGHT=[0.6,0.6,0.5,1.0,0.8,0.8];
function faceTile(id,f){ const d=BLOCKS[id]; return f===3?d.top:f===2?d.bottom:d.side; }
// ── smooth lighting + occlusion ambiante ──
const FACE_AX=FACES.map(F=>{ const d=F.dir,nax=d[0]?0:(d[1]?1:2),ts=[0,1,2].filter(a=>a!==nax); return {t1:ts[0],t2:ts[1]}; });
const AO_LEVELS=[0.40,0.60,0.81,1.0];   // 0 = coin très occulté → 3 = dégagé
function axVec(ax,s){ return ax===0?[s,0,0]:ax===1?[0,s,0]:[0,0,s]; }
function skyAt(lx,ly,lz){ if(ly<0) return 0; if(ly>=HEIGHT) return 15; const px=lx+M,pz=lz+M; if(px<0||px>=PW||pz<0||pz>=PW) return 0; return lightSky[pidx(px,ly,pz)]; }
function blkAt(lx,ly,lz){ if(ly<0||ly>=HEIGHT) return 0; const px=lx+M,pz=lz+M; if(px<0||px>=PW||pz<0||pz>=PW) return 0; return lightBlk[pidx(px,ly,pz)]; }
function buildMesh(c){ computeLight(c);
  const op={pos:[],l3:[],uv:[],idx:[],nrm:[]},tr={pos:[],l3:[],uv:[],idx:[],nrm:[]},ct={pos:[],l3:[],uv:[],idx:[],nrm:[]},ox=c.x*CHUNK,oz=c.z*CHUNK,torchPos=[],decoPos=[];
  for(let y=0;y<HEIGHT;y++) for(let z=0;z<CHUNK;z++) for(let x=0;x<CHUNK;x++){ const id=c.blocks[vidx(x,y,z)]; if(id===AIR) continue;
    if(BLOCKS[id].noCube){ if(BLOCKS[id].deco==='torch') torchPos.push([x,y,z]); else decoPos.push([x,y,z,id]); continue; }
    const target=BLOCKS[id].cutout?ct:(isTransparent(id)?tr:op);
    for(let f=0;f<6;f++){ const F=FACES[f],d=F.dir,nb=getBlock(ox+x+d[0],y+d[1],oz+z+d[2]); if(isOpaque(nb)||nb===id) continue;
      const [u0,v0,u1,v1]=tileUV(faceTile(id,f)),fb=FACE_BRIGHT[f],t1=FACE_AX[f].t1,t2=FACE_AX[f].t2,base=target.pos.length/3;
      const aLx=x+d[0],aLy=y+d[1],aLz=z+d[2],aWx=ox+aLx,aWz=oz+aLz;   // cellule d'air devant la face
      for(const cr of F.corners){
        const s1=cr[t1]?1:-1,s2=cr[t2]?1:-1,o1=axVec(t1,s1),o2=axVec(t2,s2);
        const s1S=isOpaque(getBlock(aWx+o1[0],aLy+o1[1],aWz+o1[2])),s2S=isOpaque(getBlock(aWx+o2[0],aLy+o2[1],aWz+o2[2])),cS=isOpaque(getBlock(aWx+o1[0]+o2[0],aLy+o1[1]+o2[1],aWz+o1[2]+o2[2]));
        let sky=skyAt(aLx,aLy,aLz),bl=blkAt(aLx,aLy,aLz),cnt=1;
        if(!s1S){ sky+=skyAt(aLx+o1[0],aLy+o1[1],aLz+o1[2]); bl+=blkAt(aLx+o1[0],aLy+o1[1],aLz+o1[2]); cnt++; }
        if(!s2S){ sky+=skyAt(aLx+o2[0],aLy+o2[1],aLz+o2[2]); bl+=blkAt(aLx+o2[0],aLy+o2[1],aLz+o2[2]); cnt++; }
        if(!(s1S&&s2S)&&!cS){ sky+=skyAt(aLx+o1[0]+o2[0],aLy+o1[1]+o2[1],aLz+o1[2]+o2[2]); bl+=blkAt(aLx+o1[0]+o2[0],aLy+o1[1]+o2[1],aLz+o1[2]+o2[2]); cnt++; }
        const ao=(s1S&&s2S)?0:(3-(s1S+s2S+cS)),shade=fb*AO_LEVELS[ao];
        target.pos.push(x+cr[0],y+cr[1],z+cr[2]); target.l3.push(shade,(sky/cnt)/15,(bl/cnt)/15); target.uv.push(u0+cr[3]*(u1-u0),v0+cr[4]*(v1-v0)); target.nrm.push(d[0],d[1],d[2]);
      }
      target.idx.push(base,base+1,base+2,base+2,base+1,base+3); } }
  c.mesh=swapMesh(c.mesh,op,matOpaque,ox,oz,true,true); c.cut=swapMesh(c.cut,ct,matCutout,ox,oz,true,true); c.water=swapMesh(c.water,tr,matWater,ox,oz,false,true);
  if(c.torchG){ scene.remove(c.torchG); } c.torchG=null;
  if(torchPos.length||decoPos.length){ const g=new THREE.Group();
    for(const [x,y,z] of torchPos) g.add(makeTorch(ox+x,y,oz+z));
    for(const [x,y,z,id] of decoPos){ const dc=BLOCKS[id].deco;
      if(dc==='ladder') g.add(makeLadder(ox+x,y,oz+z)); else if(dc==='cross') g.add(makeCross(ox+x,y,oz+z,id)); else g.add(makeDoor(ox+x,y,oz+z,id)); }
    scene.add(g); c.torchG=g; }
  c.dirty=false; }
function swapMesh(old,data,mat,ox,oz,cast,recv){ if(old){ scene.remove(old); old.geometry.dispose(); } if(data.pos.length===0) return null;
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(data.pos,3));
  g.setAttribute('light3',new THREE.Float32BufferAttribute(data.l3,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(data.nrm,3));
  g.setIndex(data.idx); const m=new THREE.Mesh(g,mat); m.position.set(ox,0,oz); m.castShadow=!!cast; m.receiveShadow=!!recv; scene.add(m); return m; }
const _matStick=new THREE.MeshBasicMaterial({color:0x6b4a2b}),_matFlame=new THREE.MeshBasicMaterial({color:0xffcc44});
const _stickGeo=new THREE.BoxGeometry(0.14,0.55,0.14),_flameGeo=new THREE.BoxGeometry(0.20,0.20,0.20);
function makeTorch(wx,y,wz){ const g=new THREE.Group(); const s=new THREE.Mesh(_stickGeo,_matStick); s.position.set(wx+0.5,y+0.28,wz+0.5); g.add(s);
  const f=new THREE.Mesh(_flameGeo,_matFlame); f.position.set(wx+0.5,y+0.62,wz+0.5); g.add(f); return g; }
const decoMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:0.4,side:THREE.DoubleSide});
const doorMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:0.5,side:THREE.DoubleSide});
function tileQuad(tile,w,h){ const g=new THREE.PlaneGeometry(w,h),[u0,v0,u1,v1]=tileUV(tile),uv=g.attributes.uv;
  uv.setXY(0,u0,v1); uv.setXY(1,u1,v1); uv.setXY(2,u0,v0); uv.setXY(3,u1,v0); uv.needsUpdate=true; return g; }
function uvAllFaces(g,tile){ const [u0,v0,u1,v1]=tileUV(tile),uv=g.attributes.uv; for(let f=0;f<6;f++){ const b=f*4; uv.setXY(b,u0,v1); uv.setXY(b+1,u1,v1); uv.setXY(b+2,u0,v0); uv.setXY(b+3,u1,v0); } uv.needsUpdate=true; return g; }
function makeLadder(wx,y,wz){ const m=new THREE.Mesh(tileQuad(BLOCKS[LADDER].side,0.86,1.0),decoMat);
  const dirs=[[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]]; let wall=[0,0,-1];
  for(const d of dirs){ if(isOpaque(getBlock(wx+d[0],y,wz+d[2]))){ wall=d; break; } }
  m.position.set(wx+0.5+wall[0]*0.45,y+0.5,wz+0.5+wall[2]*0.45); m.lookAt(m.position.x-wall[0],y+0.5,m.position.z-wall[2]); return m; }
function makeCross(wx,y,wz,id){ const t=BLOCKS[id].side,g=new THREE.Group();
  for(const a of [Math.PI/4,-Math.PI/4]){ const m=new THREE.Mesh(tileQuad(t,0.92,0.92),decoMat); m.position.set(wx+0.5,y+0.46,wz+0.5); m.rotation.y=a; g.add(m); } return g; }
function makeDoor(wx,y,wz,id){ const below=getBlock(wx,y-1,wz),tile=isDoor(below)?BLOCKS[id].top:BLOCKS[id].side;
  const m=new THREE.Mesh(uvAllFaces(new THREE.BoxGeometry(0.92,1.0,0.16),tile),doorMat);
  const frameX=isOpaque(getBlock(wx-1,y,wz))||isOpaque(getBlock(wx+1,y,wz)),frameZ=isOpaque(getBlock(wx,y,wz-1))||isOpaque(getBlock(wx,y,wz+1));
  let rot=(frameZ&&!frameX)?Math.PI/2:0; if(id===DOOR_OPEN) rot+=Math.PI/2;
  m.position.set(wx+0.5,y+0.5,wz+0.5); m.rotation.y=rot; return m; }

// ---------- Chunks ----------
function updateChunks(){ const pcx=Math.floor(player.pos.x/CHUNK),pcz=Math.floor(player.pos.z/CHUNK); let toGen=[];
  for(let dz=-R;dz<=R;dz++) for(let dx=-R;dx<=R;dx++){ const cx=pcx+dx,cz=pcz+dz; if(!chunks.has(ckey(cx,cz))) toGen.push([dx*dx+dz*dz,cx,cz]); }
  toGen.sort((a,b)=>a[0]-b[0]); for(let i=0;i<3&&i<toGen.length;i++) genChunk(toGen[i][1],toGen[i][2]);
  let toMesh=[]; for(const c of chunks.values()) if(c.dirty){ const dx=c.x-pcx,dz=c.z-pcz; toMesh.push([dx*dx+dz*dz,c]); }
  toMesh.sort((a,b)=>a[0]-b[0]); for(let i=0;i<3&&i<toMesh.length;i++) buildMesh(toMesh[i][1]);
  for(const [k,c] of chunks){ if(Math.abs(c.x-pcx)>R+1||Math.abs(c.z-pcz)>R+1){ if(c.mesh){ scene.remove(c.mesh); c.mesh.geometry.dispose(); } if(c.cut){ scene.remove(c.cut); c.cut.geometry.dispose(); } if(c.water){ scene.remove(c.water); c.water.geometry.dispose(); } if(c.torchG){ scene.remove(c.torchG); } chunks.delete(k); } } }

// ---------- Joueur & physique ----------
const player={ pos:{x:8,y:40,z:8}, vel:{x:0,y:0,z:0}, yaw:0, pitch:0, onGround:false, fly:false,
  hp:(save.hp!=null?save.hp:20), food:(save.food!=null?save.food:20), foodTimer:0, regenT:0, starveT:0, eatT:0, fallStart:null, dead:false };
player.fly=(mode!=='survival');
const HW=0.3, PH=1.8, EYE=1.62, EPS=1e-3, G=28, JUMP=8.6;
function solidLayer(by,minX,maxX,minZ,maxZ){ for(let bx=Math.floor(minX);bx<=Math.floor(maxX);bx++) for(let bz=Math.floor(minZ);bz<=Math.floor(maxZ);bz++) if(isSolid(getBlock(bx,by,bz))) return true; return false; }
function collideXZ(axis,amount){ player.pos[axis]+=amount;
  const minX=player.pos.x-HW,maxX=player.pos.x+HW,minZ=player.pos.z-HW,maxZ=player.pos.z+HW,y0=Math.floor(player.pos.y),y1=Math.floor(player.pos.y+PH-EPS);
  for(let by=y0;by<=y1;by++) for(let bx=Math.floor(minX);bx<=Math.floor(maxX);bx++) for(let bz=Math.floor(minZ);bz<=Math.floor(maxZ);bz++) if(isSolid(getBlock(bx,by,bz))){
    if(axis==='x') player.pos.x=amount>0?bx-HW-EPS:bx+1+HW+EPS; else player.pos.z=amount>0?bz-HW-EPS:bz+1+HW+EPS; player.vel[axis]=0; return; } }
function collideY(amount){ player.pos.y+=amount; const minX=player.pos.x-HW,maxX=player.pos.x+HW,minZ=player.pos.z-HW,maxZ=player.pos.z+HW;
  if(amount<0){ const by=Math.floor(player.pos.y); if(solidLayer(by,minX,maxX,minZ,maxZ)){ player.pos.y=by+1+EPS; player.vel.y=0; player.onGround=true; } }
  else if(amount>0){ const by=Math.floor(player.pos.y+PH); if(solidLayer(by,minX,maxX,minZ,maxZ)){ player.pos.y=by-PH-EPS; player.vel.y=0; } } }
function intersectsPlayer(bx,by,bz){ return bx<player.pos.x+HW&&bx+1>player.pos.x-HW&&by<player.pos.y+PH&&by+1>player.pos.y&&bz<player.pos.z+HW&&bz+1>player.pos.z-HW; }
function groundUnder(){ const y=Math.floor(player.pos.y-0.06); for(let bx=Math.floor(player.pos.x-HW);bx<=Math.floor(player.pos.x+HW);bx++) for(let bz=Math.floor(player.pos.z-HW);bz<=Math.floor(player.pos.z+HW);bz++) if(isSolid(getBlock(bx,y,bz))) return true; return false; }
function onLadderCheck(){ const y0=Math.floor(player.pos.y),y1=Math.floor(player.pos.y+PH-0.1);
  for(let by=y0;by<=y1;by++) for(let bx=Math.floor(player.pos.x-HW);bx<=Math.floor(player.pos.x+HW);bx++) for(let bz=Math.floor(player.pos.z-HW);bz<=Math.floor(player.pos.z+HW);bz++){ const b=getBlock(bx,by,bz); if(BLOCKS[b]&&BLOCKS[b].climb) return true; } return false; }

// ===================== INVENTAIRE / CRAFT / FOUR =====================
function padTo(a,n){ const r=(a||[]).slice(0,n); while(r.length<n) r.push(null); return r; }
let inv=padTo(save.inv,9), storage=padTo(save.storage,27);
let selected=0, cursor=null, craft=[], gridW=2, outputItem=null, recipeIdx=0, tableMode=false, furnaceMode=false, chestMode=false, openChestKey=null, invOpen=false;
let furnace=save.furnace||{input:null,fuel:null,output:null,burn:0,burnMax:0,cook:0}; let frRenderT=0;
let chests=save.chests||{};   // { "x,y,z": [27 cases] } — contenu de chaque coffre
function chestAt(key){ return chests[key]||(chests[key]=new Array(27).fill(null)); }
let lastMouse={x:0,y:0};
const hotbarEl=document.getElementById('hotbar'), invScreen=document.getElementById('invScreen'), invRoot=document.getElementById('invRoot'), cursorEl=document.getElementById('cursorItem');
function iconFor(id,size){ const cv=document.createElement('canvas'); cv.width=cv.height=size; const g=cv.getContext('2d'); g.imageSmoothingEnabled=false;
  const t=BLOCKS[id].side,c=t%ATLAS_TILES,r=(t/ATLAS_TILES)|0; g.drawImage(atlas,c*TILE,r*TILE,TILE,TILE,0,0,size,size); return cv; }
function zoneArr(z){ return z==='hotbar'?inv:z==='storage'?storage:z==='craft'?craft:z==='chest'?(openChestKey?chestAt(openChestKey):[]):null; }
function getSlot(z,i){ if(z==='output') return outputItem; if(z==='finput') return furnace.input; if(z==='ffuel') return furnace.fuel; if(z==='foutput') return furnace.output; return zoneArr(z)[i]; }
function setSlot(z,i,v){ if(z==='finput') furnace.input=v; else if(z==='ffuel') furnace.fuel=v; else if(z==='foutput') furnace.output=v; else zoneArr(z)[i]=v; }
function giveItems(id,n){ const max=maxStackOf(id);
  for(const arr of [inv,storage]) for(const s of arr) if(s&&s.id===id&&s.count<max){ const a=Math.min(max-s.count,n); s.count+=a; n-=a; if(n<=0){ refreshInv(); return 0; } }
  for(const arr of [inv,storage]) for(let i=0;i<arr.length;i++) if(!arr[i]){ const a=Math.min(max,n); arr[i]={id,count:a}; n-=a; if(n<=0){ refreshInv(); return 0; } }
  refreshInv(); return n; }
function addItemToPlayer(id,n){ return giveItems(id,n)<=0; }
function countPlayer(id){ let n=0; for(const arr of [inv,storage]) for(const s of arr) if(s&&s.id===id) n+=s.count; return n; }
function removeOneFromPlayer(id){ for(const arr of [inv,storage]) for(let i=0;i<arr.length;i++){ const s=arr[i]; if(s&&s.id===id){ s.count--; if(s.count<=0) arr[i]=null; return true; } } return false; }
function renderHotbar(){ hotbarEl.innerHTML='';
  for(let i=0;i<9;i++){ const slot=document.createElement('div'); slot.className='slot'+(i===selected?' sel':'');
    const num=document.createElement('div'); num.className='num'; num.textContent=i+1; slot.appendChild(num); const it=inv[i];
    if(it){ const ic=iconFor(it.id,38); ic.style.width=ic.style.height='38px'; slot.appendChild(ic); if(it.count>1){ const cnt=document.createElement('div'); cnt.className='cnt'; cnt.textContent=it.count; slot.appendChild(cnt); } }
    hotbarEl.appendChild(slot); } }
function selectSlot(i){ selected=i; renderHotbar(); }

// RECIPES est fourni par blocks.js (window.RECIPES) — modifie les recettes là-bas.
function recipeFits(r,W){ if(r.shapeless) return true; if(r.shape.length>W) return false; for(const row of r.shape) if(row.length>W) return false; return true; }
function availRecipes(){ return RECIPES.filter(r=>recipeFits(r,gridW)); }
function gridPattern(cells,W){ const H=cells.length/W; let minR=99,maxR=-1,minC=99,maxC=-1;
  for(let r=0;r<H;r++) for(let c=0;c<W;c++) if(cells[r*W+c]){ minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c); }
  if(maxR<0) return null; const pat=[]; for(let r=minR;r<=maxR;r++){ const row=[]; for(let c=minC;c<=maxC;c++){ const cell=cells[r*W+c]; row.push(cell?cell.id:0); } pat.push(row); } return pat; }
function patEqual(a,b){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++){ if(a[i].length!==b[i].length) return false; for(let j=0;j<a[i].length;j++) if((a[i][j]||0)!==(b[i][j]||0)) return false; } return true; }
function matchRecipe(cells,W){ const present=cells.filter(c=>c); if(present.length===0) return null;
  for(const r of RECIPES){ if(r.shapeless){ if(present.length===r.shapeless.length){ const a=present.map(c=>c.id).sort(),b=r.shapeless.slice().sort(); if(a.every((v,i)=>v===b[i])) return r.result; } }
    else { const pat=gridPattern(cells,W); if(pat&&patEqual(pat,r.shape)) return r.result; } } return null; }
function recomputeOutput(){ outputItem=matchRecipe(craft,gridW); }

function clickSlot(zone,i,right){
  if(zone==='output'){ takeOutput(); return; }
  if(zone==='foutput'){ takeFurnaceOut(); return; }
  const slot=getSlot(zone,i);
  if(!right){
    if(!cursor){ if(slot){ cursor=slot; setSlot(zone,i,null); } }
    else if(!slot){ setSlot(zone,i,cursor); cursor=null; }
    else if(slot.id===cursor.id){ const a=Math.min(maxStackOf(slot.id)-slot.count,cursor.count); slot.count+=a; cursor.count-=a; if(cursor.count<=0) cursor=null; }
    else { setSlot(zone,i,cursor); cursor=slot; }
  } else {
    if(cursor){ if(!slot){ setSlot(zone,i,{id:cursor.id,count:1}); cursor.count--; if(cursor.count<=0) cursor=null; }
                else if(slot.id===cursor.id&&slot.count<maxStackOf(slot.id)){ slot.count++; cursor.count--; if(cursor.count<=0) cursor=null; } }
    else if(slot){ const half=Math.ceil(slot.count/2); cursor={id:slot.id,count:half}; slot.count-=half; if(slot.count<=0) setSlot(zone,i,null); }
  }
  if(zone==='craft') recomputeOutput();
  refreshInv();
}
function takeOutput(){ if(!outputItem) return; if(cursor&&(cursor.id!==outputItem.id||cursor.count+outputItem.count>maxStackOf(outputItem.id))) return;
  for(let k=0;k<craft.length;k++) if(craft[k]){ craft[k].count--; if(craft[k].count<=0) craft[k]=null; }
  if(!cursor) cursor={id:outputItem.id,count:outputItem.count}; else cursor.count+=outputItem.count; recomputeOutput(); refreshInv(); }
function takeFurnaceOut(){ const o=furnace.output; if(!o) return;
  if(!cursor){ cursor=o; furnace.output=null; } else if(cursor.id===o.id){ const a=Math.min(maxStackOf(o.id)-cursor.count,o.count); cursor.count+=a; o.count-=a; if(o.count<=0) furnace.output=null; } refreshInv(); }
function autofill(r){ const need=[];
  if(r.shapeless){ r.shapeless.forEach((id,k)=>need.push({cell:k,id})); }
  else { for(let rr=0;rr<r.shape.length;rr++) for(let cc=0;cc<r.shape[rr].length;cc++){ const id=r.shape[rr][cc]; if(id){ if(cc>=gridW||rr>=gridW) return; need.push({cell:rr*gridW+cc,id}); } } }
  const want={}; need.forEach(n=>want[n.id]=(want[n.id]||0)+1);
  for(const id in want) if(countPlayer(+id)<want[id]) return;
  for(let k=0;k<craft.length;k++) if(craft[k]){ addItemToPlayer(craft[k].id,craft[k].count); craft[k]=null; }
  for(const n of need){ removeOneFromPlayer(n.id); if(!craft[n.cell]) craft[n.cell]={id:n.id,count:1}; else craft[n.cell].count++; }
  recomputeOutput(); refreshInv(); }

function makeSlot(zone,i,cls){ const d=document.createElement('div'); d.className='slot2 '+cls; d.dataset.zone=zone; d.dataset.i=i;
  const v=getSlot(zone,i); if(v){ const ic=iconFor(v.id,42); ic.style.width=ic.style.height='42px'; d.appendChild(ic); if(v.count>1){ const c=document.createElement('span'); c.className='cnt'; c.textContent=v.count; d.appendChild(c); } }
  d.onmousedown=(e)=>{ e.preventDefault(); clickSlot(zone,i,e.button===2); }; return d; }
function buildCraftArea(){ const area=document.createElement('div'); area.className='craftArea';
  const g=document.createElement('div'); g.className='cgrid'; g.style.gridTemplateColumns='repeat('+gridW+',60px)';
  for(let i=0;i<gridW*gridW;i++) g.appendChild(makeSlot('craft',i,'tan'));
  const ar=document.createElement('div'); ar.className='cArrow'; ar.textContent='➜';
  area.appendChild(g); area.appendChild(ar); area.appendChild(makeSlot('output',0,'out')); return area; }
function buildFurnaceArea(){ const area=document.createElement('div'); area.className='craftArea';
  const col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:10px;';
  col.appendChild(makeSlot('finput',0,'tan'));
  const fl=document.createElement('div'); fl.textContent='🔥'; fl.style.cssText='font-size:24px;opacity:'+(furnace.burn>0?1:0.3); col.appendChild(fl);
  col.appendChild(makeSlot('ffuel',0,'tan'));
  const ar=document.createElement('div'); ar.className='cArrow'; ar.textContent='➜';
  area.appendChild(col); area.appendChild(ar); area.appendChild(makeSlot('foutput',0,'out')); return area; }
function miniGrid(r){ const m=document.createElement('div'); m.className='rbMini';
  if(r.shapeless){ m.style.gridTemplateColumns='repeat('+r.shapeless.length+',22px)'; for(const id of r.shapeless){ const c=document.createElement('div'); c.className='rbCell'; const ic=iconFor(id,20); ic.style.width=ic.style.height='20px'; c.appendChild(ic); m.appendChild(c); } }
  else { const w=r.shape[0].length; m.style.gridTemplateColumns='repeat('+w+',22px)'; for(const rowArr of r.shape) for(const id of rowArr){ const c=document.createElement('div'); c.className='rbCell'; if(id){ const ic=iconFor(id,20); ic.style.width=ic.style.height='20px'; c.appendChild(ic); } m.appendChild(c); } } return m; }
function makeRecipeBook(){ const list=availRecipes(); const wrap=document.createElement('div'); wrap.className='recipeBook'; if(!list.length) return wrap;
  recipeIdx=((recipeIdx%list.length)+list.length)%list.length;
  const prev=document.createElement('button'); prev.className='arrow'; prev.textContent='◀'; prev.onclick=()=>{ recipeIdx=(recipeIdx-1+list.length)%list.length; renderInvScreen(); };
  const next=document.createElement('button'); next.className='arrow'; next.textContent='▶'; next.onclick=()=>{ recipeIdx=(recipeIdx+1)%list.length; renderInvScreen(); };
  const r=list[recipeIdx]; const card=document.createElement('div'); card.className='rbCard'; card.title='Cliquer pour préparer';
  const res=document.createElement('div'); res.className='rbRes'; const ic=iconFor(r.result.id,32); ic.style.width=ic.style.height='32px'; res.appendChild(ic);
  const rc=document.createElement('span'); rc.textContent=r.result.count; res.appendChild(rc);
  const ar=document.createElement('div'); ar.className='rbArrow'; ar.textContent='→';
  const nm=document.createElement('span'); nm.className='rbName'; nm.textContent=BLOCKS[r.result.id].name;
  card.appendChild(res); card.appendChild(ar); card.appendChild(miniGrid(r)); card.appendChild(nm); card.onclick=()=>autofill(r);
  wrap.appendChild(prev); wrap.appendChild(card); wrap.appendChild(next); return wrap; }
function inventoryGrids(host){ const grid=document.createElement('div'); grid.className='storeGrid'; for(let i=0;i<27;i++) grid.appendChild(makeSlot('storage',i,'light')); host.appendChild(grid);
  const bar=document.createElement('div'); bar.className='hotRow'; for(let i=0;i<9;i++) bar.appendChild(makeSlot('hotbar',i,'dark'+(i===selected?' sel':''))); host.appendChild(bar); }
function buildChestGrid(){ const g=document.createElement('div'); g.className='storeGrid'; for(let i=0;i<27;i++) g.appendChild(makeSlot('chest',i,'light')); return g; }
function renderInvScreen(){ invRoot.innerHTML=''; invRoot.className='invRoot';
  if(chestMode){ const cp=document.createElement('div'); cp.className='cpanel'; const hc=document.createElement('h2'); hc.textContent='Coffre'; cp.appendChild(hc); cp.appendChild(buildChestGrid()); invRoot.appendChild(cp);
    const ip=document.createElement('div'); ip.className='ipanel'; const h=document.createElement('h2'); h.textContent='Inventaire'; ip.appendChild(h); inventoryGrids(ip); invRoot.appendChild(ip); }
  else if(furnaceMode){ const ip=document.createElement('div'); ip.className='ipanel'; const h=document.createElement('h2'); h.textContent='Inventaire'; ip.appendChild(h); inventoryGrids(ip); invRoot.appendChild(ip);
    const fp=document.createElement('div'); fp.className='cpanel'; const h2=document.createElement('h2'); h2.textContent='Four'; fp.appendChild(h2); fp.appendChild(buildFurnaceArea()); invRoot.appendChild(fp); }
  else if(tableMode){ const ip=document.createElement('div'); ip.className='ipanel'; const h1=document.createElement('h2'); h1.textContent='Inventaire'; ip.appendChild(h1); inventoryGrids(ip); invRoot.appendChild(ip);
    const cp=document.createElement('div'); cp.className='cpanel'; const h2=document.createElement('h2'); h2.textContent='Table de craft'; cp.appendChild(h2);
    const col=document.createElement('div'); col.className='craftCol'; col.appendChild(buildCraftArea()); col.appendChild(makeRecipeBook()); cp.appendChild(col); invRoot.appendChild(cp); }
  else { const p=document.createElement('div'); p.className='ipanel big'; const h=document.createElement('h2'); h.textContent='Inventaire'; p.appendChild(h);
    const row=document.createElement('div'); row.className='soloRow'; const left=document.createElement('div'); inventoryGrids(left);
    const col=document.createElement('div'); col.className='craftCol'; col.appendChild(buildCraftArea()); col.appendChild(makeRecipeBook());
    row.appendChild(left); row.appendChild(col); p.appendChild(row); invRoot.appendChild(p); }
  const close=document.createElement('button'); close.className='btn grey'; close.textContent='Fermer (E)'; close.style.cssText='position:absolute; top:16px; right:18px;'; close.onclick=closeInv; invRoot.appendChild(close);
  updateCursorEl(); }
function updateCursorEl(){ if(cursor){ cursorEl.innerHTML=''; const ic=iconFor(cursor.id,42); ic.style.width=ic.style.height='42px'; cursorEl.appendChild(ic);
    if(cursor.count>1){ const c=document.createElement('span'); c.className='cnt'; c.textContent=cursor.count; cursorEl.appendChild(c); } cursorEl.style.display='block'; cursorEl.style.left=(lastMouse.x-22)+'px'; cursorEl.style.top=(lastMouse.y-22)+'px'; }
  else cursorEl.style.display='none'; }
function refreshInv(){ renderHotbar(); if(invOpen) renderInvScreen(); }
function openInv(table){ invOpen=true; tableMode=!!table; furnaceMode=false; gridW=table?3:2; craft=new Array(gridW*gridW).fill(null); outputItem=null; recipeIdx=0;
  invScreen.classList.remove('hidden'); overlay.classList.add('hidden'); document.exitPointerLock(); renderInvScreen(); }
function openFurnace(){ invOpen=true; furnaceMode=true; tableMode=false; chestMode=false; invScreen.classList.remove('hidden'); overlay.classList.add('hidden'); document.exitPointerLock(); renderInvScreen(); }
function openChest(key){ invOpen=true; chestMode=true; tableMode=false; furnaceMode=false; openChestKey=key; chestAt(key); invScreen.classList.remove('hidden'); overlay.classList.add('hidden'); document.exitPointerLock(); renderInvScreen(); }
function closeInv(){ for(let k=0;k<craft.length;k++) if(craft[k]){ if(!addItemToPlayer(craft[k].id,craft[k].count)) spawnItem(player.pos.x,player.pos.y+1,player.pos.z,craft[k].id,craft[k].count); craft[k]=null; }
  if(cursor){ if(!addItemToPlayer(cursor.id,cursor.count)) spawnItem(player.pos.x,player.pos.y+1,player.pos.z,cursor.id,cursor.count); cursor=null; }
  invOpen=false; furnaceMode=false; chestMode=false; openChestKey=null; invScreen.classList.add('hidden'); updateCursorEl(); saveNow(); lock(); }
function updateFurnace(dt){ const f=furnace; const inId=f.input&&f.input.id; const out=inId!=null?SMELT[inId]:null;
  const canOut = out!=null && (!f.output || (f.output.id===out && f.output.count<STACK));
  if(out!=null && canOut){
    if(f.burn<=0 && f.fuel && FUEL[f.fuel.id]){ f.burnMax=FUEL[f.fuel.id]*COOK_TIME; f.burn=f.burnMax; f.fuel.count--; if(f.fuel.count<=0) f.fuel=null; }
    if(f.burn>0){ f.burn-=dt; f.cook+=dt; if(f.cook>=COOK_TIME){ f.cook=0; if(!f.output) f.output={id:out,count:1}; else f.output.count++; f.input.count--; if(f.input.count<=0) f.input=null; } }
    else f.cook=0;
  } else { f.cook=0; if(f.burn>0) f.burn-=dt; }
  if(invOpen&&furnaceMode){ frRenderT+=dt; if(frRenderT>0.3){ frRenderT=0; renderInvScreen(); } } }

// ---------- Items au sol ----------
let items=[]; const _itemGeo={};
function itemGeo(id){ if(_itemGeo[id]) return _itemGeo[id]; const g=new THREE.BoxGeometry(0.3,0.3,0.3); const [u0,v0,u1,v1]=tileUV(BLOCKS[id].side); const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){ uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0)); } uv.needsUpdate=true; _itemGeo[id]=g; return g; }
function spawnItem(x,y,z,id,count){ if(items.length>300){ const old=items.shift(); scene.remove(old.mesh); } const mesh=new THREE.Mesh(itemGeo(id),matItem); scene.add(mesh);
  items.push({x,y,z,vx:(Math.random()-0.5)*1.2,vy:2.2+Math.random(),vz:(Math.random()-0.5)*1.2,id,count:count||1,age:0,mesh}); }
function updateItems(dt){ for(const it of items){ it.age+=dt; it.vy-=20*dt; it.y+=it.vy*dt;
    if(it.vy<0){ const by=Math.floor(it.y-0.15); if(isSolid(getBlock(Math.floor(it.x),by,Math.floor(it.z)))){ it.y=by+1+0.15; it.vy=0; } }
    it.x+=it.vx*dt; it.z+=it.vz*dt; it.vx*=0.82; it.vz*=0.82;
    const dx=player.pos.x-it.x,dy=(player.pos.y+0.8)-it.y,dz=player.pos.z-it.z,d=Math.hypot(dx,dy,dz)||1;
    if(it.age>0.4&&d<1.5){ if(d<0.7){ const left=giveItems(it.id,it.count); if(left<=0) it.dead=true; else it.count=left; } else { it.x+=dx/d*4.5*dt; it.y+=dy/d*4.5*dt; it.z+=dz/d*4.5*dt; } }
    it.mesh.position.set(it.x,it.y+Math.sin(it.age*3)*0.06,it.z); it.mesh.rotation.y=it.age*2.2; }
  if(items.some(it=>it.dead)) items=items.filter(it=>{ if(it.dead) scene.remove(it.mesh); return !it.dead; }); }

// ---------- Particules de cassage ----------
let particles=[]; const _partGeo={};
function partGeo(id){ if(_partGeo[id]) return _partGeo[id]; const g=new THREE.BoxGeometry(0.13,0.13,0.13),[u0,v0,u1,v1]=tileUV(BLOCKS[id].side),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0)); uv.needsUpdate=true; return _partGeo[id]=g; }
function spawnParticles(x,y,z,id,n){ if(!BLOCKS[id]||BLOCKS[id].item||id===WATER) return; n=n||9;
  for(let i=0;i<n;i++){ if(particles.length>150){ const o=particles.shift(); scene.remove(o.mesh); }
    const m=new THREE.Mesh(partGeo(id),matItem); m.position.set(x,y,z); scene.add(m);
    particles.push({x,y,z,vx:(Math.random()-0.5)*3,vy:1.5+Math.random()*2.5,vz:(Math.random()-0.5)*3,life:0.45+Math.random()*0.35,rot:Math.random()*6,mesh:m}); } }
function updateParticles(dt){ if(!particles.length) return;
  for(const p of particles){ p.life-=dt; p.vy-=20*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
    const by=Math.floor(p.y); if(p.vy<0&&isSolid(getBlock(Math.floor(p.x),by,Math.floor(p.z)))){ p.y=by+1; p.vy=0; p.vx*=0.5; p.vz*=0.5; }
    p.mesh.position.set(p.x,p.y,p.z); p.mesh.scale.setScalar(Math.max(0.02,Math.min(1,p.life*2.2))); p.mesh.rotation.set(p.rot,p.rot*1.3,0); }
  particles=particles.filter(p=>{ if(p.life<=0){ scene.remove(p.mesh); return false; } return true; }); }

// ---------- Blocs qui tombent (sable, gravier) ----------
let falling=[];
function startFall(wx,wy,wz,id){ if(falling.length>60||wy<=1) return; const m=new THREE.Mesh(fullBlockGeo(id),matItem);
  m.position.set(wx+0.5,wy+0.5,wz+0.5); scene.add(m); falling.push({x:wx,y:wy,z:wz,vy:0,id,mesh:m}); editBlock(wx,wy,wz,AIR); }
function updateFalling(dt){ if(!falling.length) return;
  for(const f of falling){ f.vy-=22*dt; f.y+=f.vy*dt; const below=Math.floor(f.y-0.02);
    if(below<0||isSolid(getBlock(f.x,below,f.z))){ let ry=below+1; while(ry<HEIGHT-1&&isSolid(getBlock(f.x,ry,f.z))) ry++; editBlock(f.x,ry,f.z,f.id); placeSound(f.id); scene.remove(f.mesh); f.dead=true; }
    else f.mesh.position.set(f.x+0.5,f.y+0.5,f.z+0.5); }
  falling=falling.filter(f=>!f.dead); }

// ---------- Animaux ----------
const MOB_CAP=14; let mobs=[],mobTimer=0; const _mobMat={};
function mobMat(c){ return _mobMat[c]||(_mobMat[c]=new THREE.MeshBasicMaterial({color:c})); }
function mbox(w,h,d,color,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mobMat(color)); m.position.set(x,y,z); return m; }
function makeMobModel(type){ const g=new THREE.Group(); g.userData.legs=[]; const legs=g.userData.legs;
  if(type==='pig'){ g.add(mbox(0.9,0.55,0.6,0xe79a9a,0,0.55,0)); g.add(mbox(0.45,0.45,0.4,0xe79a9a,0,0.62,0.5)); g.add(mbox(0.22,0.16,0.1,0xcf7f7f,0,0.56,0.72));
    for(const p of [[-0.3,-0.2],[0.3,-0.2],[-0.3,0.2],[0.3,0.2]]){ const l=mbox(0.18,0.35,0.18,0xcf7f7f,p[0],0.18,p[1]); g.add(l); legs.push(l); } }
  else if(type==='cow'){ g.add(mbox(1.0,0.7,0.6,0x6b4a32,0,0.72,0)); g.add(mbox(0.5,0.5,0.45,0x6b4a32,0,0.88,0.55)); g.add(mbox(0.08,0.13,0.08,0xeeeeea,-0.15,1.16,0.6)); g.add(mbox(0.08,0.13,0.08,0xeeeeea,0.15,1.16,0.6));
    for(const p of [[-0.32,-0.22],[0.32,-0.22],[-0.32,0.22],[0.32,0.22]]){ const l=mbox(0.2,0.5,0.2,0x4a3424,p[0],0.25,p[1]); g.add(l); legs.push(l); } }
  else if(type==='zombie'){ const skin=0x4f7a3a,shirt=0x394d8a,pants=0x3a3550;
    g.add(mbox(0.5,0.72,0.28,shirt,0,1.06,0));                      // torse
    g.add(mbox(0.44,0.44,0.44,skin,0,1.64,0));                      // tête
    g.add(mbox(0.13,0.12,0.05,0x1a1a1a,-0.1,1.68,0.23)); g.add(mbox(0.13,0.12,0.05,0x1a1a1a,0.1,1.68,0.23)); // yeux
    const aL=mbox(0.16,0.62,0.16,skin,-0.33,1.12,0.16); aL.rotation.x=-1.45; g.add(aL);  // bras tendus
    const aR=mbox(0.16,0.62,0.16,skin,0.33,1.12,0.16); aR.rotation.x=-1.45; g.add(aR);
    for(const sx of [-0.13,0.13]){ const l=mbox(0.2,0.62,0.22,pants,sx,0.34,0); g.add(l); legs.push(l); } }
  else if(type==='villager'){ const robe=0x6e4a30,skin=0xc69a78;
    g.add(mbox(0.5,0.96,0.34,robe,0,0.96,0));                       // robe
    g.add(mbox(0.46,0.46,0.44,skin,0,1.66,0));                      // tête
    g.add(mbox(0.12,0.22,0.2,0xb98a66,0,1.58,0.28));                // gros nez
    g.add(mbox(0.1,0.05,0.05,0x2a2018,-0.11,1.72,0.23)); g.add(mbox(0.1,0.05,0.05,0x2a2018,0.11,1.72,0.23)); // yeux
    const aL=mbox(0.13,0.52,0.16,0x5a3c26,-0.31,1.08,0.04); g.add(aL); const aR=mbox(0.13,0.52,0.16,0x5a3c26,0.31,1.08,0.04); g.add(aR);
    for(const sx of [-0.13,0.13]){ const l=mbox(0.18,0.46,0.22,0x47301e,sx,0.26,0); g.add(l); legs.push(l); } }
  else { g.add(mbox(0.4,0.4,0.3,0xf2f2f2,0,0.42,0)); g.add(mbox(0.28,0.28,0.26,0xf2f2f2,0,0.64,0.18)); g.add(mbox(0.1,0.07,0.12,0xe2a13a,0,0.62,0.36)); g.add(mbox(0.12,0.1,0.04,0xc0392b,0,0.8,0.16));
    for(const sx of [-0.1,0.1]){ const l=mbox(0.08,0.25,0.08,0xe2a13a,sx,0.12,0); g.add(l); legs.push(l); } }
  return g; }
function spawnMob(x,y,z,type){ const model=makeMobModel(type); scene.add(model);
  const d=type==='cow'?{hw:0.45,h:1.3,sp:1.0,hp:3}:type==='pig'?{hw:0.45,h:0.9,sp:1.1,hp:3}:type==='zombie'?{hw:0.3,h:1.85,sp:1.7,hp:4}:type==='villager'?{hw:0.3,h:1.9,sp:0.7,hp:5}:{hw:0.25,h:0.7,sp:1.4,hp:2};
  mobs.push({type,pos:{x,y,z},vy:0,yaw:Math.random()*6.28,wt:1+Math.random()*2,moving:true,onGround:false,walk:0,model,hw:d.hw,h:d.h,speed:d.sp,hp:d.hp,attackCd:0,burnT:0}); }
function trySpawnMob(){ if(mobs.length>=MOB_CAP) return; const ang=Math.random()*6.28,dist=10+Math.random()*12;
  const wx=Math.floor(player.pos.x+Math.cos(ang)*dist),wz=Math.floor(player.pos.z+Math.sin(ang)*dist);
  for(let y=HEIGHT-2;y>1;y--){ if(getBlock(wx,y,wz)===GRASS&&getBlock(wx,y+1,wz)===AIR){ spawnMob(wx+0.5,y+1,wz+0.5,['cow','pig','chicken'][Math.floor(Math.random()*3)]); return; } } }
function mobSolidAt(e,axis,amount){ e.pos[axis]+=amount; const hw=e.hw,h=e.h,y0=Math.floor(e.pos.y),y1=Math.floor(e.pos.y+h-EPS);
  for(let by=y0;by<=y1;by++) for(let bx=Math.floor(e.pos.x-hw);bx<=Math.floor(e.pos.x+hw);bx++) for(let bz=Math.floor(e.pos.z-hw);bz<=Math.floor(e.pos.z+hw);bz++)
    if(isSolid(getBlock(bx,by,bz))){ if(axis==='x') e.pos.x=amount>0?bx-hw-EPS:bx+1+hw+EPS; else e.pos.z=amount>0?bz-hw-EPS:bz+1+hw+EPS; return true; } return false; }
function mobY(e,amount){ e.pos.y+=amount; const hw=e.hw,h=e.h;
  if(amount<0){ const by=Math.floor(e.pos.y); for(let bx=Math.floor(e.pos.x-hw);bx<=Math.floor(e.pos.x+hw);bx++) for(let bz=Math.floor(e.pos.z-hw);bz<=Math.floor(e.pos.z+hw);bz++) if(isSolid(getBlock(bx,by,bz))){ e.pos.y=by+1+EPS; e.vy=0; e.onGround=true; return; } }
  else if(amount>0){ const by=Math.floor(e.pos.y+h); for(let bx=Math.floor(e.pos.x-hw);bx<=Math.floor(e.pos.x+hw);bx++) for(let bz=Math.floor(e.pos.z-hw);bz<=Math.floor(e.pos.z+hw);bz++) if(isSolid(getBlock(bx,by,bz))){ e.pos.y=by-h-EPS; e.vy=0; return; } } }
let zombieTimer=0;
function trySpawnZombie(){ if(difficulty!=='normal'||skyDay>0.32) return;
  if(mobs.reduce((n,m)=>n+(m.type==='zombie'?1:0),0)>=8) return;
  const ang=Math.random()*6.28,dist=14+Math.random()*16,wx=Math.floor(player.pos.x+Math.cos(ang)*dist),wz=Math.floor(player.pos.z+Math.sin(ang)*dist);
  for(let y=HEIGHT-3;y>1;y--){ if(isSolid(getBlock(wx,y,wz))&&getBlock(wx,y+1,wz)===AIR&&getBlock(wx,y+2,wz)===AIR){ spawnMob(wx+0.5,y+1,wz+0.5,'zombie'); return; } } }
function skyExposed(wx,wy,wz){ for(let y=wy+1;y<HEIGHT;y++) if(isOpaque(getBlock(wx,y,wz))) return false; return true; }
function updateMobs(dt){ mobTimer+=dt; if(mobTimer>2.5){ mobTimer=0; trySpawnMob(); }
  zombieTimer+=dt; if(zombieTimer>3){ zombieTimer=0; trySpawnZombie(); }
  for(const e of mobs){
    if(e.type==='zombie'&&difficulty!=='normal'){ scene.remove(e.model); e.dead=true; continue; }
    let vx=0,vz=0;
    if(e.type==='zombie'){
      const dx=player.pos.x-e.pos.x,dz=player.pos.z-e.pos.z,dh=Math.hypot(dx,dz)||1;
      if(dh<30&&!player.dead){ vx=dx/dh*e.speed; vz=dz/dh*e.speed; e.yaw=Math.atan2(-dx,-dz); e.moving=true; }
      else { e.wt-=dt; if(e.wt<=0){ e.wt=2+Math.random()*3; e.moving=Math.random()<0.6; e.yaw=Math.random()*6.28; } if(e.moving){ vx=-Math.sin(e.yaw)*e.speed; vz=-Math.cos(e.yaw)*e.speed; } }
      e.attackCd-=dt;
      if(dh<1.4&&Math.abs(player.pos.y-e.pos.y)<2.2&&e.attackCd<=0&&!player.dead){ e.attackCd=1.0; tone(95,0.28,'sawtooth',0.07,60);
        if(mode==='survival'){ damage(3); collideXZ('x',(dx/dh)*0.45); collideXZ('z',(dz/dh)*0.45); player.vel.y=4; } }
      if(skyDay>0.5&&skyExposed(Math.floor(e.pos.x),Math.floor(e.pos.y),Math.floor(e.pos.z))){ e.burnT+=dt; if(e.burnT>1.1){ e.burnT=0; if(--e.hp<=0){ scene.remove(e.model); e.dead=true; continue; } } }
    } else {
      e.wt-=dt; if(e.wt<=0){ e.wt=2+Math.random()*3; e.moving=Math.random()<0.7; e.yaw=Math.random()*6.28; }
      if(e.moving){ vx=-Math.sin(e.yaw)*e.speed; vz=-Math.cos(e.yaw)*e.speed; }
    }
    e.vy-=G*dt; e.onGround=false; mobY(e,e.vy*dt); const bX=mobSolidAt(e,'x',vx*dt),bZ=mobSolidAt(e,'z',vz*dt); if((bX||bZ)&&e.onGround) e.vy=6;
    const despawn=e.type==='zombie'?64:46; if(Math.hypot(e.pos.x-player.pos.x,e.pos.z-player.pos.z)>despawn){ scene.remove(e.model); e.dead=true; continue; }
    e.model.position.set(e.pos.x,e.pos.y,e.pos.z); e.model.rotation.y=e.yaw+Math.PI; const legs=e.model.userData.legs;
    if(e.moving){ e.walk+=dt*8; const s=Math.sin(e.walk)*0.4; for(let i=0;i<legs.length;i++) legs[i].rotation.x=(i%2?-s:s); } else for(const l of legs) l.rotation.x=0; }
  if(mobs.some(e=>e.dead)) mobs=mobs.filter(e=>!e.dead); }
function mobTarget(){ camera.getWorldDirection(_dir); const o=camera.position; let best=null,bd=4.5;
  for(const e of mobs){ const cx=e.pos.x-o.x,cy=(e.pos.y+e.h*0.5)-o.y,cz=e.pos.z-o.z,d=Math.hypot(cx,cy,cz); if(d>4.5) continue; const dot=(cx*_dir.x+cy*_dir.y+cz*_dir.z)/d; if(dot>0.94&&d<bd){ bd=d; best=e; } } return best; }
function hitMob(e){ e.hp--; SFX.hurt(); const dx=e.pos.x-player.pos.x,dz=e.pos.z-player.pos.z,d=Math.hypot(dx,dz)||1; e.pos.x+=dx/d*0.6; e.pos.z+=dz/d*0.6; e.vy=4;
  if(e.hp<=0){ if(e.type!=='zombie'){ const n=1+(Math.random()*2|0); for(let i=0;i<n;i++) spawnItem(e.pos.x,e.pos.y+0.4,e.pos.z,VIANDE); } scene.remove(e.model); e.dead=true; mobs=mobs.filter(m=>!m.dead); } }

// ---------- Sons (synthétisés, sans fichier audio) ----------
let ACTX=null, MGAIN=null;
function audio(){ if(!ACTX){ try{ ACTX=new (window.AudioContext||window.webkitAudioContext)(); MGAIN=ACTX.createGain(); MGAIN.gain.value=soundOn?soundVol:0; MGAIN.connect(ACTX.destination); }catch(e){} } return ACTX; }
function applySound(){ if(MGAIN) MGAIN.gain.value=soundOn?soundVol:0; }
function tone(freq,dur,type,vol,slideTo){ const a=audio(); if(!a) return; const o=a.createOscillator(),g=a.createGain();
  o.type=type||'square'; o.frequency.value=freq; if(slideTo) o.frequency.linearRampToValueAtTime(slideTo,a.currentTime+dur);
  g.gain.value=vol||0.12; g.gain.exponentialRampToValueAtTime(0.0008,a.currentTime+dur); o.connect(g); g.connect(MGAIN||a.destination); o.start(); o.stop(a.currentTime+dur); }
function noiseBurst(dur,vol,freq){ const a=audio(); if(!a) return; const len=Math.max(1,(a.sampleRate*dur)|0),buf=a.createBuffer(1,len,a.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1; const n=a.createBufferSource(); n.buffer=buf; const g=a.createGain(); g.gain.value=vol||0.18;
  g.gain.exponentialRampToValueAtTime(0.0008,a.currentTime+dur); const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=freq||1000; n.connect(f); f.connect(g); g.connect(MGAIN||a.destination); n.start(); n.stop(a.currentTime+dur); }
const SFX={ dig:()=>noiseBurst(0.13,0.25,900), place:()=>noiseBurst(0.1,0.22,520),
  step:()=>noiseBurst(0.05,0.07,380), hurt:()=>{ tone(220,0.22,'square',0.18,80); noiseBurst(0.1,0.08,600); },
  eat:()=>{ noiseBurst(0.06,0.14,800); noiseBurst(0.04,0.08,1200); },
  splash:()=>noiseBurst(0.25,0.18,1600), pop:()=>tone(740,0.07,'sine',0.14,1100),
  levelup:()=>{ tone(440,0.1,'sine',0.12); tone(550,0.1,'sine',0.1); tone(660,0.15,'sine',0.12); } };

// ---------- Minage / pose ----------
let mouseLeft=false,mouseRight=false; const mining={key:null,t:0};
function matOf(id){ return (BLOCKS[id]&&BLOCKS[id].sound)||'wood'; }   // matériau sonore défini dans blocks.js
function digSound(id){ switch(matOf(id)){
  case 'stone': noiseBurst(0.12,0.26,480); tone(100,0.08,'square',0.07,70); break;
  case 'dirt':  noiseBurst(0.14,0.24,280); tone(80,0.06,'sine',0.04,60); break;
  case 'sand':  noiseBurst(0.16,0.20,1800); break;
  case 'snow':  noiseBurst(0.14,0.14,2500); tone(600,0.06,'sine',0.03,400); break;
  case 'glass': tone(1400,0.14,'triangle',0.14,2000); noiseBurst(0.07,0.18,4500); break;
  case 'leaves':noiseBurst(0.12,0.16,2800); tone(300,0.05,'sine',0.03,200); break;
  default:      noiseBurst(0.13,0.26,1000); tone(130,0.06,'square',0.04,90); } }
function placeSound(id){ switch(matOf(id)){
  case 'stone': noiseBurst(0.09,0.22,440); tone(120,0.05,'square',0.04,90); break;
  case 'dirt':  noiseBurst(0.10,0.18,300); break;
  case 'sand': case 'snow': noiseBurst(0.11,0.15,1600); break;
  case 'glass': tone(950,0.08,'sine',0.11,1400); break;
  case 'leaves': noiseBurst(0.08,0.11,2500); break;
  default: noiseBurst(0.10,0.22,750); } }
function isDoor(id){ return id===DOOR||id===DOOR_OPEN; }
function doorSound(){ tone(230,0.1,'square',0.08,170); tone(150,0.16,'sawtooth',0.05,110); }
function toggleDoor(x,y,z){ const here=getBlock(x,y,z); if(!isDoor(here)) return; const nid=here===DOOR?DOOR_OPEN:DOOR;
  editBlock(x,y,z,nid); if(isDoor(getBlock(x,y+1,z))) editBlock(x,y+1,z,nid); if(isDoor(getBlock(x,y-1,z))) editBlock(x,y-1,z,nid); doorSound(); heldSwing=1; }
function breakBlock(x,y,z,id){ digSound(id); spawnParticles(x+0.5,y+0.5,z+0.5,id,10); heldSwing=1;
  if(id===CHEST){ const k=x+','+y+','+z,arr=chests[k]; if(arr){ for(const s of arr) if(s) spawnItem(x+0.5,y+0.6,z+0.5,s.id,s.count); delete chests[k]; } }
  if(mode!=='creative'&&id!==WATER&&id!==BEDROCK) spawnItem(x+0.5,y+0.55,z+0.5,dropOf(id)); editBlock(x,y,z,AIR);
  if(isDoor(id)){ if(isDoor(getBlock(x,y+1,z))) editBlock(x,y+1,z,AIR); else if(isDoor(getBlock(x,y-1,z))) editBlock(x,y-1,z,AIR); } }
function consumeHeld(){ if(mode!=='creative'){ const slot=inv[selected]; slot.count--; if(slot.count<=0) inv[selected]=null; } renderHotbar(); }
function tryPlace(){ const slot=inv[selected]; if(!slot||slot.count<=0) return; if(BLOCKS[slot.id].item) return;
  const hit=raycast(); if(!hit) return; const px=hit.x+hit.nx,py=hit.y+hit.ny,pz=hit.z+hit.nz,cur=getBlock(px,py,pz),pid=slot.id;
  // porte : deux blocs de haut, sur un sol solide
  if(pid===DOOR){ if((cur===AIR||cur===WATER)&&getBlock(px,py+1,pz)===AIR&&isSolid(getBlock(px,py-1,pz))&&!intersectsPlayer(px,py,pz)&&!intersectsPlayer(px,py+1,pz)){
      editBlock(px,py,pz,DOOR); editBlock(px,py+1,pz,DOOR); placeSound(DOOR); heldSwing=1; consumeHeld(); } return; }
  // échelle : peut se poser dans l'espace du joueur (non solide)
  const blocked=(pid===LADDER)?false:intersectsPlayer(px,py,pz);
  if((cur===AIR||cur===WATER)&&!blocked){ editBlock(px,py,pz,pid); placeSound(pid); heldSwing=1;
    if(BLOCKS[pid]&&BLOCKS[pid].fall){ const bl=getBlock(px,py-1,pz); if(bl===AIR||bl===WATER) startFall(px,py,pz,pid); }
    consumeHeld(); } }

// ---------- Entrées ----------
const keys={};
const canvas=document.getElementById('game'),overlay=document.getElementById('overlay');
function lock(){ const a=audio(); if(a&&a.state==='suspended') a.resume(); const p=canvas.requestPointerLock(); if(p&&p.catch)p.catch(()=>{}); }
addEventListener('keydown',e=>{
  if(e.code==='KeyE'){ if(invOpen) closeInv(); else if(document.pointerLockElement===canvas) openInv(false); return; }
  if(invOpen){ if(e.code==='Escape') closeInv(); return; }
  if(document.pointerLockElement!==canvas) return;
  keys[e.code]=true; if(e.code==='KeyF'){ setMode(mode==='creative'?'survival':'creative'); }
  if(e.code.startsWith('Digit')){ const n=+e.code.slice(5); if(n>=1&&n<=9) selectSlot(n-1); }
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
document.addEventListener('pointerlockchange',()=>{ const playing=document.pointerLockElement===canvas;
  if(playing){ overlay.classList.add('hidden'); } else { for(const k in keys) keys[k]=false; mouseLeft=false; mouseRight=false; mining.key=null; breakBox.visible=false; saveNow(); if(!invOpen&&!player.dead){ overlay.classList.remove('hidden'); refreshPauseInfo(); } } });
addEventListener('mousemove',e=>{ if(invOpen){ lastMouse.x=e.clientX; lastMouse.y=e.clientY; if(cursor){ cursorEl.style.left=(e.clientX-22)+'px'; cursorEl.style.top=(e.clientY-22)+'px'; } return; }
  if(document.pointerLockElement!==canvas) return; player.yaw-=e.movementX*mouseSens; player.pitch-=e.movementY*mouseSens; player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch)); });
addEventListener('mousedown',e=>{ if(document.pointerLockElement!==canvas) return; if(mode==='spectator') return;
  if(e.button===0){ const m=mobTarget(); if(m){ hitMob(m); heldSwing=1; } else mouseLeft=true; }
  else if(e.button===2){ mouseRight=true; const hit=raycast(); if(hit){ const use=BLOCKS[getBlock(hit.x,hit.y,hit.z)]; if(use&&use.onUse){
      if(use.onUse==='table'){ openInv(true); return; } if(use.onUse==='furnace'){ openFurnace(); return; }
      if(use.onUse==='chest'){ openChest(hit.x+','+hit.y+','+hit.z); return; } if(use.onUse==='door'){ toggleDoor(hit.x,hit.y,hit.z); return; } } } tryPlace(); } });
addEventListener('mouseup',e=>{ if(e.button===0){ mouseLeft=false; mining.key=null; breakBox.visible=false; } if(e.button===2){ mouseRight=false; player.eatT=0; } });
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('wheel',e=>{ if(document.pointerLockElement!==canvas) return; selectSlot((selected+(e.deltaY>0?1:-1)+9)%9); });
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// ---------- Raycasting ----------
const _dir=new THREE.Vector3();
function raycast(){ const o=camera.position; camera.getWorldDirection(_dir); const d=_dir;
  let x=Math.floor(o.x),y=Math.floor(o.y),z=Math.floor(o.z); const sx=d.x>0?1:-1,sy=d.y>0?1:-1,sz=d.z>0?1:-1;
  const tdx=Math.abs(1/d.x),tdy=Math.abs(1/d.y),tdz=Math.abs(1/d.z);
  let tx=d.x===0?Infinity:tdx*(d.x>0?(x+1-o.x):(o.x-x)),ty=d.y===0?Infinity:tdy*(d.y>0?(y+1-o.y):(o.y-y)),tz=d.z===0?Infinity:tdz*(d.z>0?(z+1-o.z):(o.z-z));
  let nx=0,ny=0,nz=0; const MAX=6;
  for(let i=0;i<80;i++){ const id=getBlock(x,y,z); if(id!==AIR&&id!==WATER) return {x,y,z,nx,ny,nz};
    if(tx<ty&&tx<tz){ if(tx>MAX)break; x+=sx; tx+=tdx; nx=-sx;ny=0;nz=0; } else if(ty<tz){ if(ty>MAX)break; y+=sy; ty+=tdy; nx=0;ny=-sy;nz=0; } else { if(tz>MAX)break; z+=sz; tz+=tdz; nx=0;ny=0;nz=-sz; } }
  return null; }

// ---------- Jour/nuit ----------
let dayTime=(save.dayTime!=null)?save.dayTime:0.30; const DAY_LEN=180; let _skyT=0;
const C_LIGHT_DAY=new THREE.Color(1.0,0.97,0.88), C_LIGHT_NIGHT=new THREE.Color(0.34,0.45,0.80), C_LIGHT_DUSK=new THREE.Color(1.0,0.50,0.30), _skl=new THREE.Color();
function updateSky(dt){ _skyT+=dt; dayTime=(dayTime+dt/DAY_LEN)%1;
  const s=Math.sin(dayTime*Math.PI*2),day=Math.max(0,s),skyLevel=4+11*day,horizon=Math.max(0,1-Math.abs(s)*3.2); skyDay=day;
  lightU.uSky.value=skyLevel/15;
  // teinte de la lumière du ciel : nuit (bleu) → jour (blanc chaud), orangée au crépuscule
  _skl.copy(C_LIGHT_NIGHT).lerp(C_LIGHT_DAY,day); if(horizon>0) _skl.lerp(C_LIGHT_DUSK,horizon*0.5); lightU.uSkyColor.value.copy(_skl);
  // torches : chaudes + léger scintillement
  const fl=0.93+0.05*Math.sin(_skyT*7.0)+0.025*Math.sin(_skyT*13.0); lightU.uBlockColor.value.setRGB(fl,0.72*fl,0.40*fl);
  const dl=0.30+0.70*day; decoMat.color.setScalar(dl); doorMat.color.setScalar(dl);   // déco (plantes/échelles/portes) suit le jour/nuit
  // fond + brouillard
  scene.background.copy(SKY_NIGHT).lerp(SKY_DAY,day); if(horizon>0) scene.background.lerp(SUNSET,horizon*0.5);
  scene.fog.color.copy(scene.background); lightU.fogColor.value.copy(scene.background);
  // dôme de ciel dégradé
  _stop.copy(SKY_TOP_NIGHT).lerp(SKY_TOP_DAY,day); _sbot.copy(SKY_BOT_NIGHT).lerp(SKY_BOT_DAY,day);
  if(horizon>0){ _stop.lerp(SKY_TOP_DUSK,horizon*0.5); _sbot.lerp(SKY_BOT_DUSK,horizon*0.7); }
  skyDomeMat.uniforms.topC.value.copy(_stop); skyDomeMat.uniforms.botC.value.copy(_sbot);
  const px=player.pos.x,py=player.pos.y,pz=player.pos.z; skyDome.position.set(px,py,pz);
  // astres + nuages suivent le joueur
  const ang=(dayTime-0.25)*Math.PI*2,D=300,dx=Math.sin(ang),dy=Math.cos(ang);
  sunMesh.position.set(px+dx*D,py+dy*D,pz); sunMesh.lookAt(px,py,pz);
  moonMesh.position.set(px-dx*D,py-dy*D,pz); moonMesh.lookAt(px,py,pz);
  // lumière directionnelle (ombres) : suit l'astre au-dessus de l'horizon
  const up=(s>=0)?1:-1, slx=dx*up, sly=Math.max(0.25,dy*up);
  sunLight.position.set(px+slx*130, py+sly*150, pz+0.001); sunLight.target.position.set(px,py,pz);
  lightU.uShadow.value=0.06+0.46*day;   // ombres marquées le jour, douces (lune) la nuit
  cloudMesh.position.set(px,HEIGHT+24,pz); cloudMesh.material.map.offset.x=(cloudMesh.material.map.offset.x+dt*0.003)%1; cloudMesh.material.opacity=0.2+0.62*day; }

// ---------- Vie / faim ----------
const healthCv=document.getElementById('health'),foodCv=document.getElementById('food');
const hctx=healthCv.getContext('2d'),fctx=foodCv.getContext('2d');
function heart(ctx,x,y,s,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(x+s*0.5,y+s*0.82);
  ctx.bezierCurveTo(x+s*0.02,y+s*0.42,x+s*0.12,y+s*0.04,x+s*0.5,y+s*0.30); ctx.bezierCurveTo(x+s*0.88,y+s*0.04,x+s*0.98,y+s*0.42,x+s*0.5,y+s*0.82); ctx.closePath(); ctx.fill(); }
function drum(ctx,x,y,s,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x+s*0.6,y+s*0.42,s*0.3,0,Math.PI*2); ctx.fill(); ctx.fillRect(x+s*0.12,y+s*0.55,s*0.42,s*0.15); }
function renderHUD(){ hctx.clearRect(0,0,200,20); fctx.clearRect(0,0,200,20); const s=18;
  for(let i=0;i<10;i++){ const x=i*19; heart(hctx,x,1,s,'#3a1414'); const fl=Math.max(0,Math.min(2,player.hp-i*2));
    if(fl>=2) heart(hctx,x,1,s,'#e23b3b'); else if(fl>0){ hctx.save(); hctx.beginPath(); hctx.rect(x,0,s*0.5,20); hctx.clip(); heart(hctx,x,1,s,'#e23b3b'); hctx.restore(); } }
  for(let i=0;i<10;i++){ const x=180-i*19; drum(fctx,x,1,s,'#3a2a14'); const fl=Math.max(0,Math.min(2,player.food-i*2));
    if(fl>=2) drum(fctx,x,1,s,'#c8862f'); else if(fl>0){ fctx.save(); fctx.beginPath(); fctx.rect(x+s*0.5,0,s*0.5,20); fctx.clip(); drum(fctx,x,1,s,'#c8862f'); fctx.restore(); } } }
function damage(d){ if(player.dead) return; player.hp=Math.max(0,player.hp-d); SFX.hurt(); if(player.hp<=0) die(); }
function die(){ player.dead=true; document.exitPointerLock(); document.getElementById('deathScreen').classList.remove('hidden'); overlay.classList.add('hidden'); saveNow(); }
function respawn(){ player.dead=false; player.hp=20; player.food=20; player.vel.x=player.vel.y=player.vel.z=0; player.fallStart=null;
  player.pos.x=spawnPoint.x; player.pos.y=spawnPoint.y; player.pos.z=spawnPoint.z;
  document.getElementById('deathScreen').classList.add('hidden'); lock(); }
function updateStats(dt){
  // faim : descend doucement, plus vite si on sprinte/bouge
  const moving=(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD||keys.ArrowUp||keys.ArrowDown||keys.ArrowLeft||keys.ArrowRight);
  player.foodTimer += dt*((keys.ShiftLeft||keys.ShiftRight)&&moving?1.8:moving?1:0.45);
  if(player.foodTimer>=24){ player.foodTimer=0; if(player.food>0) player.food--; }
  // régénération si bien nourri
  if(player.food>=18 && player.hp<20){ player.regenT+=dt; if(player.regenT>=4){ player.regenT=0; player.hp++; player.foodTimer+=6; } } else player.regenT=0;
  // famine : descend la vie jusqu'à 1
  if(player.food<=0 && player.hp>1){ player.starveT+=dt; if(player.starveT>=4){ player.starveT=0; player.hp--; } } else player.starveT=0;
  // manger (maintien clic droit avec de la nourriture sélectionnée)
  const held=inv[selected];
  if(mouseRight && !invOpen && held && EAT[held.id] && player.food<20){ player.eatT+=dt;
    if(player.eatT>=1.4){ player.eatT=0; SFX.eat(); player.food=Math.min(20,player.food+EAT[held.id]); held.count--; if(held.count<=0) inv[selected]=null; renderHotbar(); } }
  else player.eatT=0;
}

// ---------- Sauvegarde ----------
let saveTimer=null;
function saveNow(){ try{ localStorage.setItem(SAVE_KEY,JSON.stringify({ seed:SEED, edits:worldEdits, dayTime, inv, storage, furnace, chests, hp:player.hp, food:player.food, mode,
  player:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,pitch:player.pitch,fly:player.fly} })); }catch(e){} }
function scheduleSave(){ if(saveTimer) return; saveTimer=setTimeout(()=>{ saveTimer=null; saveNow(); },800); }
function downloadWorld(){ saveNow(); const data={format:'blkworld',version:1,name:worldName,seed:SEED,save:JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')}; const blob=new Blob([JSON.stringify(data)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=worldName+'.blkworld'; a.click(); URL.revokeObjectURL(a.href); }
addEventListener('beforeunload',saveNow); setInterval(saveNow,15000);

// ---------- Spawn ----------
function findSpawn(){ for(let r=0;r<=48;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){ if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue; if(heightAt(8+dx,8+dz)>SEA+1) return {x:8+dx,z:8+dz}; } return {x:8,z:8}; }
const _sp=findSpawn(); const spawnPoint={x:_sp.x+0.5,y:heightAt(_sp.x,_sp.z)+2,z:_sp.z+0.5};
if(save.player){ player.pos.x=save.player.x; player.pos.y=save.player.y; player.pos.z=save.player.z; player.yaw=save.player.yaw||0; player.pitch=save.player.pitch||0; player.fly=!!save.player.fly; }
else { player.pos.x=spawnPoint.x; player.pos.y=spawnPoint.y; player.pos.z=spawnPoint.z; }
const _scx=Math.floor(player.pos.x/CHUNK),_scz=Math.floor(player.pos.z/CHUNK);
for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++) if(!chunks.has(ckey(_scx+dx,_scz+dz))) genChunk(_scx+dx,_scz+dz);
renderHotbar(); renderHUD();

// ---------- Menu pause / mort ----------
const $=id=>document.getElementById(id);
function setMode(m){ mode=m; player.fly=(m!=='survival'); player.vel.y=0; if(m==='survival') player.fallStart=null; updateModeButtons(); saveNow(); }
function updateModeButtons(){ for(const [m,id] of [['survival','modeSurv'],['creative','modeCrea'],['spectator','modeSpec']]) $(id) && $(id).classList.toggle('active',mode===m); }
function refreshPauseInfo(){ const b=biomeAt(Math.floor(player.pos.x),Math.floor(player.pos.z)); const nm={plains:'Plaines',forest:'Forêt',desert:'Désert',snow:'Neige',taiga:'Taïga',jungle:'Jungle',savanna:'Savane',mesa:'Mesa',swamp:'Marais',mountains:'Montagnes'}[b]||b;
  $('biomeVal').textContent='🧭 '+nm+'  ·  X '+player.pos.x.toFixed(0)+' Y '+player.pos.y.toFixed(0)+' Z '+player.pos.z.toFixed(0); }

$('wname').textContent=worldName;
$('resume').addEventListener('click',e=>{ e.stopPropagation(); lock(); });
$('quit').addEventListener('click',e=>{ e.stopPropagation(); saveNow(); location.href='index.html'; });
$('respawnBtn').addEventListener('click',respawn);
overlay.addEventListener('click',e=>{ if(e.target===overlay) lock(); });   // seul le fond reprend
$('optBtn').addEventListener('click',()=>$('optPanel').classList.toggle('hidden'));
$('saveBtn').addEventListener('click',()=>{ saveNow(); const b=$('saveBtn'),t=b.textContent; b.textContent='✅ Sauvegardé !'; setTimeout(()=>b.textContent=t,1100); });
// valeurs initiales des réglages
$('setSound').checked=soundOn; $('setVol').value=Math.round(soundVol*100); $('setSens').value=Math.round(mouseSens/0.0002);
$('setRender').value=R; $('renderVal').textContent=R; $('setFov').value=FOV; $('fovVal').textContent=FOV;
$('setSound').addEventListener('change',e=>{ soundOn=e.target.checked; applySound(); saveSettings(); });
$('setVol').addEventListener('input',e=>{ soundVol=e.target.value/100; applySound(); saveSettings(); });
$('setSens').addEventListener('input',e=>{ mouseSens=Math.max(1,e.target.value)*0.0002; saveSettings(); });
$('setRender').addEventListener('input',e=>{ R=+e.target.value; $('renderVal').textContent=R; scene.fog.near=(R-1.5)*CHUNK; scene.fog.far=R*CHUNK; lightU.fogNear.value=(R-1.5)*CHUNK; lightU.fogFar.value=R*CHUNK; saveSettings(); });
$('setFov').addEventListener('input',e=>{ FOV=+e.target.value; $('fovVal').textContent=FOV; camera.fov=FOV; camera.updateProjectionMatrix(); saveSettings(); });
$('modeSurv').addEventListener('click',()=>setMode('survival'));
$('modeCrea').addEventListener('click',()=>setMode('creative'));
$('modeSpec').addEventListener('click',()=>setMode('spectator'));
function setDifficulty(d){ difficulty=d; if(d!=='normal') mobs=mobs.filter(m=>{ if(m.type==='zombie'){ scene.remove(m.model); return false; } return true; }); updateDiffButtons(); saveSettings(); }
function updateDiffButtons(){ $('diffPeace')&&$('diffPeace').classList.toggle('active',difficulty==='peaceful'); $('diffNormal')&&$('diffNormal').classList.toggle('active',difficulty==='normal'); }
$('diffPeace').addEventListener('click',()=>setDifficulty('peaceful'));
$('diffNormal').addEventListener('click',()=>setDifficulty('normal'));
updateDiffButtons();
$('timeMorning').addEventListener('click',()=>{ dayTime=0.15; });
$('timeDay').addEventListener('click',()=>{ dayTime=0.25; });
$('timeNight').addEventListener('click',()=>{ dayTime=0.75; });
$('seedVal').textContent=SEED;
$('copySeed').addEventListener('click',()=>{ try{ navigator.clipboard.writeText(String(SEED)); }catch(e){} const b=$('copySeed'); b.textContent='copié !'; setTimeout(()=>b.textContent='copier',1000); });
$('dlWorld').addEventListener('click',()=>downloadWorld());
updateModeButtons();
// boutons "pierre" : on utilise notre propre texture de pierre comme fond
if(window.TEX&&window.TEX.stone) document.documentElement.style.setProperty('--stone','url('+window.TEX.stone+')');

// ---------- Boucle ----------
const infoEl=document.getElementById('info');
let last=performance.now(),fpsT=0,frames=0,fps=0,lastHp=-1,lastFood=-1,stepTimer=0,waterT=0;
function frame(now){ requestAnimationFrame(frame); let dt=(now-last)/1000; last=now; if(dt>0.05) dt=0.05;
  if(!player.dead){
    const fwd=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
    const str=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
    const sneak=(keys.ControlLeft||keys.ControlRight)&&!player.fly&&mode!=='spectator';
    const sprint=(keys.ShiftLeft||keys.ShiftRight)?1.6:1; let speed=(mode==='spectator'?16:player.fly?10:4.8)*sprint; if(sneak) speed=2.4;
    let mx=0,mz=0; if(fwd||str){ const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw); let dxv=(-sy*fwd)+(cy*str),dzv=(-cy*fwd)+(-sy*str); const len=Math.hypot(dxv,dzv)||1; mx=dxv/len*speed; mz=dzv/len*speed; }
    if(mode==='spectator'){   // fantôme : vol libre, traverse les blocs
      const up=(keys.Space?1:0)-((keys.ShiftLeft||keys.ShiftRight)?1:0);
      player.pos.x+=mx*dt; player.pos.z+=mz*dt; player.pos.y+=up*speed*dt; player.onGround=false; player.fallStart=null;
    } else {
      if(sneak&&player.onGround){ const ox=player.pos.x; collideXZ('x',mx*dt); if(!groundUnder()) player.pos.x=ox; const oz=player.pos.z; collideXZ('z',mz*dt); if(!groundUnder()) player.pos.z=oz; }
      else { collideXZ('x',mx*dt); collideXZ('z',mz*dt); }
      if(player.fly){ const up=(keys.Space?1:0)-((keys.ShiftLeft||keys.ShiftRight)?1:0); collideY(up*speed*dt); player.onGround=false; player.fallStart=null; }
      else {
        const feetW=getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y+0.1),Math.floor(player.pos.z))===WATER;
        const eyeW=getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y+1.5),Math.floor(player.pos.z))===WATER;
        const inWater=feetW||eyeW; const onLad=onLadderCheck(); const wasGround=player.onGround; player.onGround=false;
        if(onLad && !inWater){ const up=keys.Space||fwd>0,down=(keys.ControlLeft||keys.ControlRight); player.vel.y=up?3.0:down?-3.0:-1.4; player.fallStart=null; }
        else if(inWater){ player.vel.y-=G*0.12*dt; player.vel.y*=0.86; if(keys.Space) player.vel.y=eyeW?5.0:JUMP; if(player.vel.y<-4) player.vel.y=-4; player.fallStart=null; }
        else { player.vel.y-=G*dt; if(player.vel.y<-50) player.vel.y=-50; if(player.fallStart==null && !wasGround) player.fallStart=player.pos.y; }
        collideY(player.vel.y*dt);
        if(player.onGround){ if(player.fallStart!=null && !inWater){ const fall=player.fallStart-player.pos.y; const dmg=Math.max(0,Math.floor(fall-3.5)); if(dmg>0) damage(dmg); } player.fallStart=null; }
        if(player.onGround && keys.Space && !inWater) player.vel.y=JUMP;
      }
    }
    stepTimer-=dt; if(player.onGround&&!player.fly&&(mx||mz)&&stepTimer<=0){ stepTimer=0.33; SFX.step(); }
    camera.position.set(player.pos.x,player.pos.y+EYE-(sneak?0.18:0),player.pos.z); camera.rotation.y=player.yaw; camera.rotation.x=player.pitch;

    const hit=raycast();
    if(hit){ highlight.visible=true; highlight.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5); } else highlight.visible=false;
    if(mouseLeft && hit && !invOpen && mode!=='spectator'){ const id=getBlock(hit.x,hit.y,hit.z); const need=mode==='creative'?0.001:(HARD[id]||1)/mineMult(id);
      if(id!==AIR&&id!==WATER&&(mode==='creative'||(HARD[id]||1)<9999)){ const k=hit.x+','+hit.y+','+hit.z; if(mining.key!==k){ mining.key=k; mining.t=0; }
        if(heldSwing<=0) heldSwing=1; mining.t+=dt; const stage=Math.min(4,Math.floor(mining.t/need*5)); breakBox.visible=true; breakBox.material=crackMats[stage]; breakBox.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
        if(mining.t>=need){ breakBlock(hit.x,hit.y,hit.z,id); mining.key=null; breakBox.visible=false; } } else { mining.key=null; breakBox.visible=false; } }
    else if(!mouseLeft){ breakBox.visible=false; }
    if(mode==='survival') updateStats(dt);
  }

  updateItems(dt); updateParticles(dt); updateFalling(dt); updateMobs(dt); updateFurnace(dt); waterT+=dt; if(waterT>0.1){ waterT=0; flowTick(); } updateChunks(); updateSky(dt);
  updateHeldItem(); animateHeld(dt);
  if(player.hp!==lastHp||player.food!==lastFood){ renderHUD(); lastHp=player.hp; lastFood=player.food; }
  renderer.render(scene,camera);

  frames++; fpsT+=dt; if(fpsT>=0.5){ fps=Math.round(frames/fpsT); frames=0; fpsT=0; }
  const hh=Math.floor((dayTime*24+6)%24);
  infoEl.innerHTML=`FPS ${fps} &nbsp; Chunks ${chunks.size} &nbsp; Mobs ${mobs.length}<br>`+
    `XYZ ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}<br>`+
    `Heure ${String(hh).padStart(2,'0')}:00 ${mode==='survival'?'🚶 Survie':mode==='creative'?'🕊️ Créatif':'👻 Spectateur'}`;
}
requestAnimationFrame(frame);
