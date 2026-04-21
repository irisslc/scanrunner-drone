import * as THREE from "three";

// ==============================
// Elementos del HUD
// ==============================
const hudStatus = document.querySelector("#status");
const hudTime   = document.querySelector("#time");
const hudScan   = document.querySelector("#scan");

// ==============================
// Valores base del juego
// ==============================
const batteryMax        = 100;
const scanTime          = 0.85;
const scanMaxDist       = 10.0;
const enemyMoveSpeed    = 7.8;
const enemy2MoveSpeed   = 4.9;
const enemyDamagePerSec = 14;
const enemy2DmgPerSec   = 9;
const hazardDmgPerSec   = 7;

// ==============================
// Estado de la partida
// ==============================
let gameState = "start"; // "start"|"playing"|"paused"|"won"|"lost"
let elapsed = 0, finalTime = 0;
let batteryLeft = batteryMax;
let currentTargetIndex = 0;
let damageSeconds = 0, batteryDamage = 0;

// ==============================
// Sonidos
// ==============================
let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function beep(freq, dur, when, type = "sine", vol = 0.12) {
  if (!audioCtx) return;
  const t0 = when ?? audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol,    t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function playHit()          { ensureAudio(); if (!audioCtx) return; const t = audioCtx.currentTime; beep(220,.06,t,"square",.16); beep(140,.10,t+.05,"square",.14); }
function playWin()          { ensureAudio(); if (!audioCtx) return; const t = audioCtx.currentTime; beep(440,.10,t,"sine",.12); beep(554,.10,t+.1,"sine",.12); beep(659,.12,t+.2,"sine",.14); beep(880,.14,t+.33,"sine",.16); }
function playLose()         { ensureAudio(); if (!audioCtx) return; const t = audioCtx.currentTime; beep(220,.10,t,"sawtooth",.14); beep(165,.12,t+.12,"sawtooth",.14); beep(110,.18,t+.26,"sawtooth",.16); }
function playScanDone()     { ensureAudio(); if (!audioCtx) return; const t = audioCtx.currentTime; beep(880,.06,t,"triangle",.12); beep(660,.08,t+.06,"triangle",.10); }
function playNextTick()     { ensureAudio(); if (!audioCtx) return; beep(520,.045, audioCtx.currentTime,"square",.08); }

// ==============================
// Texturas hechas con canvas
// ==============================
function makeGridTexture() {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#060c18"; ctx.fillRect(0, 0, S, S);

  // líneas finas
  ctx.strokeStyle = "#0c1e38"; ctx.lineWidth = 1;
  for (let i = 0; i <= S; i += S / 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  // líneas más marcadas
  ctx.strokeStyle = "#103060"; ctx.lineWidth = 2;
  for (let i = 0; i <= S; i += S / 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  // puntos decorativos
  ctx.fillStyle = "#1a4080";
  for (let x = S/8; x < S; x += S/4)
    for (let y = S/8; y < S; y += S/4) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
    }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

function makeWallTexture() {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a1220"; ctx.fillRect(0, 0, W, H);
  const pw = W/4, ph = H/2;
  for (let x = 0; x < W; x += pw)
    for (let y = 0; y < H; y += ph) {
      ctx.strokeStyle = "#14253d"; ctx.lineWidth = 2;
      ctx.strokeRect(x+5, y+5, pw-10, ph-10);
      ctx.strokeStyle = "#0c1a2f";
      ctx.strokeRect(x+10, y+10, pw-20, ph-20);
    }
  ctx.strokeStyle = "#fff"; ctx.lineWidth = .5; ctx.globalAlpha = .03;
  for (let y = 0; y < H; y += 3) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

// ==============================
// Skybox procedural (6 caras canvas con campo de estrellas)
// ==============================
function makeSkyboxCubeTex() {
  const SIZE = 512;

  // Dibuja una cara del cubo con fondo estelar sci-fi
  function makeFace(nebulaColor) {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d");

    // Fondo: gradiente oscuro azul-negro
    const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    bg.addColorStop(0, "#020610");
    bg.addColorStop(1, "#050c1e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Nébula suave
    const ng = ctx.createRadialGradient(SIZE * .55, SIZE * .45, 0, SIZE * .5, SIZE * .5, SIZE * .65);
    ng.addColorStop(0, nebulaColor);
    ng.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Estrellas pequeñas (blancas)
    for (let i = 0; i < 320; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const r = Math.random() * 1.4 + 0.2;
      const a = 0.35 + Math.random() * 0.65;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Estrellas de colores (azuladas, doradas, verdes)
    const starColors = ["#88ccff", "#ffddaa", "#aaffcc", "#ffffff"];
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const col = starColors[Math.floor(Math.random() * starColors.length)];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    return c;
  }

  // Tonos de nébula distintos por cara para dar variedad
  const nebulaColors = [
    "rgba(0,40,120,0.12)",  // +X
    "rgba(0,40,120,0.12)",  // -X
    "rgba(0,20,80,0.08)",   // +Y (arriba, más oscuro)
    "rgba(0,10,40,0.06)",   // -Y (abajo)
    "rgba(20,0,100,0.14)",  // +Z  (tono más morado)
    "rgba(0,60,100,0.14)",  // -Z  (tono más cyan)
  ];

  const faces = nebulaColors.map(col => makeFace(col));
  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  return tex;
}

const skyboxTex = makeSkyboxCubeTex();

// ==============================
// Escena principal
// ==============================
const scene = new THREE.Scene();
scene.background = skyboxTex;          // skybox en lugar de color sólido
scene.fog = new THREE.FogExp2(0x060c18, 0.024);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 2.5, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ==============================
// Luces
// ==============================
scene.add(new THREE.AmbientLight(0x1a2a4a, 0.9));

const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(5, 12, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// luces de neón en las paredes
const neonData = [
  { color: 0x00ffcc, pos: [-11, 3, 0] },
  { color: 0x00ffcc, pos: [ 11, 3, 0] },
  { color: 0x0066ff, pos: [0, 3, -11] },
  { color: 0x0066ff, pos: [0, 3,  11] },
];
for (const { color, pos } of neonData) {
  const pl = new THREE.PointLight(color, 2.0, 18);
  pl.position.set(...pos);
  scene.add(pl);
}

// ── Foco fijo con sombras (proyecta sombras dramáticas desde la esquina) ──
// Esta luz tiene ángulo estrecho y alta resolución de sombra para que
// los objetos proyecten sombras nítidas sobre el suelo.
const shadowSpot = new THREE.SpotLight(0xfff4e0, 2.8, 38, Math.PI / 9, 0.28, 1.4);
shadowSpot.position.set(-8, 10, -8);          // esquina superior izquierda
shadowSpot.target.position.set(3, 0, 3);      // apunta al centro del hangar
shadowSpot.castShadow = true;
shadowSpot.shadow.mapSize.set(2048, 2048);    // mapa de sombra de alta resolución
shadowSpot.shadow.camera.near = 3;
shadowSpot.shadow.camera.far  = 40;
shadowSpot.shadow.bias = -0.002;              // elimina shadow acne
scene.add(shadowSpot);
scene.add(shadowSpot.target);

// foco que sigue al dron
const spot = new THREE.SpotLight(0x66aaff, 1.5, 25, Math.PI/7, 0.5, 1);
spot.position.set(0, 8, 0);
spot.castShadow = true;
scene.add(spot);
scene.add(spot.target);

// ==============================
// Suelo
// ==============================
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ map: makeGridTexture(), roughness: 0.7, metalness: 0.15 })
);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);

// ==============================
// Paredes del hangar
// ==============================
const wallMat = new THREE.MeshStandardMaterial({ map: makeWallTexture(), roughness: 0.85, metalness: 0.1 });
function addWall(x, z, w, h, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), wallMat);
  m.position.set(x, h/2, z);
  m.rotation.y = rotY;
  m.receiveShadow = true; m.castShadow = true;
  scene.add(m);
}
addWall( 0, -12, 24, 6);
addWall( 0,  12, 24, 6);
addWall(-12,  0, 24, 6, Math.PI/2);
addWall( 12,  0, 24, 6, Math.PI/2);

// ==============================
// Tiras de neón
// ==============================
function addNeonStrip(x, y, z, len, rotY, color) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 });
  const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), mat);
  s.position.set(x, y, z); s.rotation.y = rotY;
  scene.add(s);
}

// tiras superiores
addNeonStrip( 0, 5.8, -11.8, 22,        0, 0x00ffcc);
addNeonStrip( 0, 5.8,  11.8, 22,        0, 0x00ffcc);
addNeonStrip(-11.8, 5.8, 0,  22, Math.PI/2, 0x0066ff);
addNeonStrip( 11.8, 5.8, 0,  22, Math.PI/2, 0x0066ff);

// detalles del suelo
addNeonStrip( 0, 0.06, -11.5, 22, 0, 0x002233);
addNeonStrip( 0, 0.06,  11.5, 22, 0, 0x002233);

// ==============================
// Objetos del escenario
// ==============================
const crateMat  = new THREE.MeshStandardMaterial({ color: 0x1a2535, roughness: 0.8, metalness: 0.35 });
const drumMat   = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.7, metalness: 0.5  });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0x331100, emissiveIntensity: 0.6, roughness: 0.5 });

function addCrate(x, z, w=1, h=1, d=1) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
  b.position.set(x, h/2, z); b.castShadow = true; b.receiveShadow = true;
  scene.add(b);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w+.02, .08, d+.02), accentMat);
  stripe.position.set(x, h*.62, z);
  scene.add(stripe);
}
function addDrum(x, z) {
  const d = new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.9,12), drumMat);
  d.position.set(x, .45, z); d.castShadow = true; scene.add(d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.3,.03,8,16), accentMat);
  ring.position.set(x, .9, z); ring.rotation.x = Math.PI/2; scene.add(ring);
}

addCrate(-9,-9, 1.2,1.2,1.2); addCrate(-7.5,-9, 1.0,.9,1.0); addCrate(-9,-7.5, 1.0,1.7,1.0);
addCrate( 8,-9, 1.2,1.2,1.2); addCrate( 9,-7.5, 1.0,.9,1.0);
addCrate(-9, 8, 1.2,1.0,1.2); addCrate( 8, 8, 1.0,1.4,1.0); addCrate( 9, 9, 1.2,1.0,1.4);
addDrum(-8,3); addDrum(-7.2,3.8); addDrum(8,3); addDrum(7.2,3.8);

// ==============================
// Dron del jugador
// ==============================
const drone = new THREE.Group();
scene.add(drone);

const bodyMat2  = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: .25, metalness: .75 });
const armMat2   = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: .5,  metalness: .6  });
const rotorMat2 = new THREE.MeshStandardMaterial({ color: 0x060c18, roughness: .7,  transparent: true, opacity: .8 });
const ledFrMat  = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 2.5 });
const ledBkMat  = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 2.0 });
const camMat2   = new THREE.MeshStandardMaterial({ color: 0x050a10, roughness: .15, metalness: .95 });
const lensMat2  = new THREE.MeshStandardMaterial({ color: 0x0033ff, emissive: 0x0022cc, emissiveIntensity: 2.0 });

// cuerpo principal
const droneBody = new THREE.Mesh(new THREE.BoxGeometry(.72,.16,.48), bodyMat2);
droneBody.castShadow = true;
drone.add(droneBody);

// parte superior
const topDome = new THREE.Mesh(
  new THREE.SphereGeometry(.16, 16, 8, 0, Math.PI*2, 0, Math.PI/2),
  bodyMat2
);
topDome.position.y = .08;
drone.add(topDome);

// luces LED
const ledFr = new THREE.Mesh(new THREE.BoxGeometry(.74,.04,.04), ledFrMat);
ledFr.position.set(0,0,.25); drone.add(ledFr);
const ledBk = new THREE.Mesh(new THREE.BoxGeometry(.74,.04,.04), ledBkMat);
ledBk.position.set(0,0,-.25); drone.add(ledBk);

// brazos y hélices
const rotors = [];
const armDirs = [[.52,.34],[-.52,.34],[.52,-.34],[-.52,-.34]];
for (const [ax,az] of armDirs) {
  const len = Math.hypot(ax, az);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(len,.05,.06), armMat2);
  arm.position.set(ax/2, 0, az/2);
  arm.rotation.y = Math.atan2(-az, ax);
  drone.add(arm);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.07,8), armMat2);
  hub.position.set(ax, .1, az); drone.add(hub);

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.02,18), rotorMat2);
  rotor.position.set(ax, .14, az); drone.add(rotor);
  rotors.push(rotor);
}

// cámara frontal
const camPod = new THREE.Mesh(new THREE.SphereGeometry(.09,12,12), camMat2);
camPod.position.set(0,-.11,.1); drone.add(camPod);
const lens3d = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.06,12), lensMat2);
lens3d.rotation.x = Math.PI/2; lens3d.position.set(0,-.11,.18); drone.add(lens3d);

// luz del dron
const droneLed = new THREE.PointLight(0x00ffcc, 0.9, 3.5);
drone.add(droneLed);

drone.position.set(0, 1.5, 8);

// ==============================
// Objetivos a escanear
// ==============================
const targets = [];
const tMatOff = new THREE.MeshStandardMaterial({ color: 0x1a2d4a, roughness: .4, metalness: .3, emissive: 0x061020, emissiveIntensity: .5 });
const tMatOn  = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00cc88, emissiveIntensity: 1.5 });
const tMatAct = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xff9911, emissiveIntensity: 1.5 });
const haloBaseMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false });

function makeTarget(x, y, z) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,1.2,20), tMatOff.clone());
  pillar.castShadow = true;
  grp.add(pillar); grp.userData.pillar = pillar;

  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2244ff, emissiveIntensity: 2.0 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(.18,16,16), topMat);
  top.position.y = .72; grp.add(top); grp.userData.top = top;

  const halo = new THREE.Mesh(new THREE.RingGeometry(.55,.82,48), haloBaseMat.clone());
  halo.rotation.x = -Math.PI/2; halo.position.y = -.58; halo.visible = false;
  grp.add(halo); grp.userData.halo = halo;

  const pRingMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 1.5, transparent: true, opacity: 0 });
  const pRing = new THREE.Mesh(new THREE.TorusGeometry(.28,.04,8,32), pRingMat);
  pRing.position.y = .72; grp.add(pRing); grp.userData.progressRing = pRing;

  grp.userData.scanned = false;
  scene.add(grp);
  targets.push(grp);
}

makeTarget(-6, .6, 5);
makeTarget( 6, .6, 5);
makeTarget(-7, .6,-5);
makeTarget( 7, .6,-4);
makeTarget( 0, .6, 0);

// ==============================
// Zonas peligrosas
// ==============================
const hazardZones = [];
function makeHazardZone(x, z, radius) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff1100, emissive: 0xff0800, emissiveIntensity: 1.0,
    transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), mat);
  mesh.rotation.x = -Math.PI/2; mesh.position.set(x, .02, z);
  scene.add(mesh);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide, transparent: true, opacity: .85 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius-.12, radius+.02, 36), ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.set(x, .03, z);
  scene.add(ring);

  // poste de aviso
  const postMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 2.0 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(.07,.9,.07), postMat);
  post.position.set(x + radius + .15, .45, z); scene.add(post);

  // luz de advertencia
  const pl = new THREE.PointLight(0xff2200, 1.0, 5);
  pl.position.set(x, .5, z); scene.add(pl);

  hazardZones.push({ mat, x, z, radius });
}

makeHazardZone(-4, 3, 1.9);
makeHazardZone( 5,-6, 1.7);
makeHazardZone(-3,-6, 1.6);

function checkHazard() {
  for (const hz of hazardZones) {
    if (Math.hypot(drone.position.x - hz.x, drone.position.z - hz.z) < hz.radius) return true;
  }
  return false;
}

// ==============================
// Enemigos
// ==============================
const enemyMinY = 1.05;
const enemyMaxY = 4.25;

const enemy1VerticalSpeed = 5.2;
const enemy2VerticalSpeed = 3.8;
const enemy1HoverAmp = 0.22;
const enemy2HoverAmp = 0.48;
const enemy1HoverFreq = 2.2;
const enemy2HoverFreq = 1.4;

// ── ENV MAP: Reflexión (enemy1, esfera roja) ──────────────────────────────
// Usamos el skyboxTex con mapping CubeReflectionMapping (valor por defecto).
// MeshStandardMaterial con metalness alto + envMap produce un espejo que
// refleja el entorno (el cielo estrellado del skybox).
const enemy1Mat = new THREE.MeshStandardMaterial({
  color:            0xff3344,
  emissive:         0x330008,
  emissiveIntensity: 0.35,
  roughness:        0.04,   // casi perfectamente liso → reflejo nítido
  metalness:        0.92,   // muy metálico → predomina el envMap
  envMap:           skyboxTex,          // CubeReflectionMapping (defecto)
  envMapIntensity:  1.4,
});

const enemy1 = new THREE.Mesh(new THREE.SphereGeometry(.42, 22, 22), enemy1Mat);
enemy1.castShadow = true;
scene.add(enemy1);

// ── ENV MAP: Refracción (enemy2, esfera púrpura) ──────────────────────────
// Clonamos el skyboxTex y cambiamos su mapping a CubeRefractionMapping.
// refractionRatio controla la "apertura" de la lente: 1.0 = sin refracción,
// valores menores (~0.85-0.95) dan el efecto de vidrio o cristal.
const refractionTex = skyboxTex.clone();
refractionTex.mapping = THREE.CubeRefractionMapping;
refractionTex.needsUpdate = true;

const enemy2Mat = new THREE.MeshPhongMaterial({
  color:            0xcc88ff,
  emissive:         0x440088,
  emissiveIntensity: 0.6,
  shininess:        160,
  envMap:           refractionTex,      // CubeRefractionMapping → refracción
  refractionRatio:  0.88,              // índice: 0=mucha refracción, 1=ninguna
  transparent:      true,
  opacity:          0.82,
});

const enemy2 = new THREE.Mesh(new THREE.SphereGeometry(.65, 22, 22), enemy2Mat);
enemy2.castShadow = true;
scene.add(enemy2);

// posición inicial de cada enemigo
enemy1.position.set(3, 1.35, 0);
enemy2.position.set(-4, 2.2, -3);

// luces de apoyo de los enemigos
const e1Light = new THREE.PointLight(0xff2233, 1.2, 4);
scene.add(e1Light);
const e2Light = new THREE.PointLight(0x8833ff, 1.0, 5);
scene.add(e2Light);

const up3 = new THREE.Vector3(0,1,0);
const arenaMin = -10.5, arenaMax = 10.5;

const e1Vel = new THREE.Vector3(1,0,0).multiplyScalar(enemyMoveSpeed);
const e2Vel = new THREE.Vector3(-1,0,.6).normalize().multiplyScalar(enemy2MoveSpeed);

const timers = { e1: 0, e2: 0 };
const enemyHoverPhase = {
  e1: Math.random() * Math.PI * 2,
  e2: Math.random() * Math.PI * 2,
};

let wasTouchE1 = false, wasTouchE2 = false;

function randVel(spd) {
  const a = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(spd);
}

function bounceWalls(pos, vel, r, spd) {
  const mn = arenaMin + r, mx = arenaMax - r;
  let b = false;

  if (pos.x < mn) { pos.x = mn; vel.x = Math.abs(vel.x); b = true; }
  else if (pos.x > mx) { pos.x = mx; vel.x = -Math.abs(vel.x); b = true; }

  if (pos.z < mn) { pos.z = mn; vel.z = Math.abs(vel.z); b = true; }
  else if (pos.z > mx) { pos.z = mx; vel.z = -Math.abs(vel.z); b = true; }

  if (b) {
    vel.applyAxisAngle(up3, (Math.random() - .5) * .8);
    vel.setLength(spd);
  }
}

function bounceTargets(pos, vel, r, spd) {
  for (const t of targets) {
    const dx = pos.x - t.position.x;
    const dz = pos.z - t.position.z;
    const d = Math.hypot(dx, dz);
    const mn = r + .35;

    if (d > 0 && d < mn) {
      pos.x = t.position.x + (dx / d) * mn;
      pos.z = t.position.z + (dz / d) * mn;

      const vn = vel.x * (dx / d) + vel.z * (dz / d);
      vel.x -= 2 * vn * (dx / d);
      vel.z -= 2 * vn * (dz / d);

      vel.applyAxisAngle(up3, (Math.random() - .5) * 1.2);
      vel.setLength(spd);
    }
  }
}

function updateEnemyAltitude(mesh, radius, maxVerticalSpeed, hoverAmp, hoverFreq, phase, dt) {
  const minY = Math.max(enemyMinY, radius + 0.15);
  const maxY = enemyMaxY;

  const desiredY = THREE.MathUtils.clamp(
    drone.position.y + Math.sin(elapsed * hoverFreq + phase) * hoverAmp,
    minY,
    maxY
  );

  const maxStep = maxVerticalSpeed * dt;
  mesh.position.y += THREE.MathUtils.clamp(desiredY - mesh.position.y, -maxStep, maxStep);
}

function stepEnemy(
  mesh, vel, spd, eR, dmgPS, wasTouch, timerKey, dt,
  verticalSpeed, hoverAmp, hoverFreq, hoverPhase
) {
  timers[timerKey] -= dt;

  if (timers[timerKey] <= 0) {
    timers[timerKey] = 0.55 + Math.random() * 0.55;
    vel.applyAxisAngle(up3, (Math.random() - .5) * 1.1);
    vel.setLength(spd);
  }

  mesh.position.addScaledVector(vel, dt);
  bounceWalls(mesh.position, vel, eR, spd);
  bounceTargets(mesh.position, vel, eR, spd);

  // los enemigos ajustan su altura a la del dron
  updateEnemyAltitude(mesh, eR, verticalSpeed, hoverAmp, hoverFreq, hoverPhase, dt);

  const dx = drone.position.x - mesh.position.x;
  const dy = drone.position.y - mesh.position.y;
  const dz = drone.position.z - mesh.position.z;
  const dist = Math.hypot(dx, dy, dz);
  const touching = dist < (.55 + eR);

  if (touching && !wasTouch) playHit();

  if (touching) {
    const dmg = dmgPS * dt;
    batteryLeft = Math.max(0, batteryLeft - dmg);
    batteryDamage += dmg;
    damageSeconds += dt;
  }

  return touching;
}

function updateEnemies(dt) {
  const t1 = stepEnemy(
    enemy1, e1Vel, enemyMoveSpeed, .42, enemyDamagePerSec, wasTouchE1, "e1", dt,
    enemy1VerticalSpeed, enemy1HoverAmp, enemy1HoverFreq, enemyHoverPhase.e1
  );

  const t2 = stepEnemy(
    enemy2, e2Vel, enemy2MoveSpeed, .65, enemy2DmgPerSec, wasTouchE2, "e2", dt,
    enemy2VerticalSpeed, enemy2HoverAmp, enemy2HoverFreq, enemyHoverPhase.e2
  );

  wasTouchE1 = t1;
  wasTouchE2 = t2;

  e1Light.position.copy(enemy1.position);
  e1Light.position.y += 0.2;

  e2Light.position.copy(enemy2.position);
  e2Light.position.y += 0.25;

  return t1 || t2;
}

// ==============================
// Pantalla de inicio
// ==============================
const startScreen = document.createElement("div");
startScreen.style.cssText = `
  position:fixed;inset:0;background:rgba(4,8,20,.97);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:white;font-family:system-ui,sans-serif;z-index:200;
`;
startScreen.innerHTML = `
  <div style="font-size:58px;font-weight:900;letter-spacing:.12em;color:#00ffcc;
    text-shadow:0 0 40px #00ffcc,0 0 80px #00ffcc44;margin-bottom:6px;">SCAN RUNNER</div>
  <div style="font-size:16px;opacity:.55;letter-spacing:.22em;margin-bottom:34px;">DRONE · EDITION</div>
  <div style="background:rgba(255,255,255,.04);border:1px solid rgba(0,255,200,.22);
    border-radius:12px;padding:18px 34px;margin-bottom:26px;font-size:14px;line-height:2.1;max-width:480px;">
    <div>🎮 <b>WASD</b> — Mover &nbsp;|&nbsp; <b>Click + arrastrar</b> — Cámara</div>
    <div>⬆️ <b>Espacio</b> — Subir &nbsp;|&nbsp; <b>Shift</b> — Bajar</div>
    <div>🔍 <b>E</b> (mantén) — Escanear objetivo activo</div>
    <div>⚠️ Huye del <span style="color:#ff4455">enemigo rojo</span> y del <span style="color:#aa66ff">púrpura</span></div>
    <div>🔴 Evita las <b>zonas rojas</b> del suelo · drenan batería</div>
    <div>⏸ <b>ESC</b> — Pausa &nbsp;|&nbsp; <b>R</b> — Reiniciar</div>
  </div>
  <button id="btnStart" style="background:linear-gradient(135deg,#00ffcc,#0088ff);color:#040a16;
    border:none;border-radius:8px;padding:14px 52px;font-size:19px;font-weight:800;
    cursor:pointer;letter-spacing:.1em;box-shadow:0 0 28px #00ffcc55;transition:transform .1s;">▶ INICIAR</button>
`;
document.body.appendChild(startScreen);
document.getElementById("btnStart").addEventListener("pointerenter", e => e.target.style.transform="scale(1.06)");
document.getElementById("btnStart").addEventListener("pointerleave", e => e.target.style.transform="scale(1)");
document.getElementById("btnStart").addEventListener("click", () => {
  ensureAudio();
  startScreen.style.display = "none";
  resetGame();
});

// ==============================
// Pantallas de pausa, victoria y derrota
// ==============================
const overlay = document.createElement("div");
overlay.style.cssText = `position:fixed;inset:0;display:none;align-items:center;justify-content:center;
  flex-direction:column;color:white;font-family:system-ui,sans-serif;text-align:center;pointer-events:none;gap:10px;`;

const rankBadge = document.createElement("div");
rankBadge.style.cssText = `display:none;font-size:96px;font-weight:900;letter-spacing:.08em;
  text-transform:uppercase;text-shadow:0 10px 30px rgba(0,0,0,.55);
  transform:scale(.6);transition:transform 220ms cubic-bezier(.2,.9,.2,1);`;
overlay.appendChild(rankBadge);
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = `font-size:42px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;`;
const overlaySub = document.createElement("div");
overlaySub.style.cssText = `font-size:18px;opacity:.95;white-space:pre-line;`;
overlay.appendChild(overlayTitle); overlay.appendChild(overlaySub);
document.body.appendChild(overlay);

function computeRank(t, dmg) {
  let r = "C";
  if (t<=42) r="S"; else if (t<=60) r="A"; else if (t<=80) r="B";
  if (dmg>25&&r==="S") r="A";
  if (dmg>45&&r!=="C") r="B";
  if (dmg>65) r="C";
  return r;
}
const rankColors = { S:"#00ffcc", A:"#ffdd44", B:"#aaffaa", C:"#ffaaaa" };

function showOverlay(kind) {
  rankBadge.style.display = "none";
  const pct = Math.round((batteryLeft/batteryMax)*100);
  if (kind==="paused") {
    overlay.style.background="rgba(0,0,0,.5)";
    overlayTitle.textContent="PAUSA";
    overlaySub.textContent=`BATERÍA: ${pct}%\nPulsa ESC para continuar`;
  } else if (kind==="won") {
    const rank=computeRank(finalTime,batteryDamage);
    overlay.style.background="rgba(0,0,0,.35)";
    overlayTitle.textContent="¡COMPLETADO!";
    overlaySub.textContent=`TIEMPO: ${finalTime.toFixed(1)}s\nDAÑO RECIBIDO: ${batteryDamage.toFixed(1)} (${damageSeconds.toFixed(1)}s)\nRANK: ${rank}\nPulsa R para reiniciar`;
    rankBadge.style.display="block";
    rankBadge.textContent=rank;
    rankBadge.style.color=rankColors[rank]||"white";
    requestAnimationFrame(()=>{ rankBadge.style.transform="scale(1.15)"; setTimeout(()=>rankBadge.style.transform="scale(1.0)",150); });
  } else {
    overlay.style.background="rgba(60,0,0,.52)";
    overlayTitle.textContent="BATERÍA AGOTADA";
    overlaySub.textContent=`ESCANEADOS: ${currentTargetIndex}/${targets.length}\nTIEMPO: ${finalTime.toFixed(1)}s\nPulsa R para reintentar`;
  }
  overlay.style.display="flex";
}
function hideOverlay() { overlay.style.display="none"; rankBadge.style.display="none"; }

// ==============================
// Efectos visuales
// ==============================
function makeFXDiv(gradient) {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;inset:0;pointer-events:none;opacity:0;background:${gradient};`;
  document.body.appendChild(d); return d;
}
const damageFX = makeFXDiv("radial-gradient(circle at center,rgba(255,0,0,.15) 0%,rgba(255,0,0,.65) 100%)");
const hazardFX = makeFXDiv("radial-gradient(circle at center,rgba(255,90,0,.10) 0%,rgba(255,50,0,.55) 100%)");

let damageAlpha=0, damageHold=0, hazardAlpha=0;

function updateFX(dt, dmg, hz) {
  if (gameState!=="playing") { dmg=false; hz=false; }
  if (dmg) damageHold=.5; else damageHold=Math.max(0,damageHold-dt);
  const dTgt=(dmg||damageHold>0)?.65:0;
  damageAlpha+=((dTgt>damageAlpha?22:2)*dt)*(dTgt-damageAlpha);
  damageFX.style.opacity=damageAlpha.toFixed(3);
  const hTgt=hz?.55:0;
  hazardAlpha+=((hTgt>hazardAlpha?10:3)*dt)*(hTgt-hazardAlpha);
  hazardFX.style.opacity=hazardAlpha.toFixed(3);
}

// aviso visual de batería
let hudPhase=0, battBlinkHold=0;
hudTime.style.transition="color .08s linear";

function updateBattHUD(dt, dmg) {
  hudPhase+=dt;
  const pct=Math.round((batteryLeft/batteryMax)*100);
  const low=pct<=20;
  if (gameState!=="playing") { hudTime.style.color="white"; }
  else {
    if (dmg) battBlinkHold=.55; else battBlinkHold=Math.max(0,battBlinkHold-dt);
    const blink=(battBlinkHold>0&&Math.sin(hudPhase*28)>0)||(low&&Math.sin(hudPhase*6)>0);
    hudTime.style.color=(battBlinkHold>0||low)&&blink?"rgb(255,80,80)":"white";
  }
  hudTime.textContent=`Tiempo: ${batteryLeft.toFixed(1)}s | Batería: ${pct}%${low?" ⚠ BAJA":""}`;
}

// ==============================
// Flecha que marca el siguiente objetivo
// ==============================
const navWrap = document.createElement("div");
navWrap.style.cssText="margin-top:10px;display:flex;align-items:center;gap:10px;user-select:none;";
const navArrow=document.createElement("div"); navArrow.textContent="➤";
navArrow.style.cssText="font-size:22px;display:inline-block;transform-origin:50% 50%;";
const navText=document.createElement("div"); navText.style.cssText="opacity:.9;font-size:14px;";
navWrap.appendChild(navArrow); navWrap.appendChild(navText);
document.querySelector("#hud").appendChild(navWrap);

const _tv1=new THREE.Vector3(), _tv2=new THREE.Vector3();
function updateNav() {
  if (gameState!=="playing"||currentTargetIndex>=targets.length) { navWrap.style.display="none"; return; }
  navWrap.style.display="flex";
  _tv1.copy(targets[currentTargetIndex].position).sub(drone.position); _tv1.y=0;
  const dist=_tv1.length(); if(dist<.001) return;
  _tv1.divideScalar(dist);
  _tv2.copy(_tv1).applyQuaternion(camera.quaternion.clone().invert()); _tv2.y=0; _tv2.normalize();
  navArrow.style.transform=`rotate(${Math.atan2(_tv2.x,-_tv2.z)-Math.PI/2}rad)`;
  navText.textContent=`OBJETIVO ${currentTargetIndex+1}/${targets.length} · ${dist.toFixed(1)}m`;
}

// ==============================
// Controles
// ==============================
const keys=new Set();
let yaw=0,pitch=0,mouseDown=false;
function freezeInputs(){ keys.clear(); mouseDown=false; }

window.addEventListener("keydown",e=>{
  ensureAudio();
  if (e.code==="Escape") {
    if (gameState==="playing")       { gameState="paused"; freezeInputs(); showOverlay("paused"); }
    else if (gameState==="paused")   { gameState="playing"; hideOverlay(); freezeInputs(); }
    return;
  }
  if (e.code==="KeyR"&&(gameState==="won"||gameState==="lost")) { resetGame(); return; }
  if (gameState==="playing") keys.add(e.code);
});
window.addEventListener("keyup",e=>keys.delete(e.code));
window.addEventListener("mousedown",()=>{ ensureAudio(); if(gameState==="playing") mouseDown=true; });
window.addEventListener("mouseup",()=>mouseDown=false);
window.addEventListener("mousemove",e=>{
  if(gameState!=="playing"||!mouseDown) return;
  yaw-=e.movementX*.0025;
  pitch=THREE.MathUtils.clamp(pitch-e.movementY*.002,-.6,.35);
});

// ==============================
// Movimiento y cámara
// ==============================
const velocity=new THREE.Vector3(), tempVec=new THREE.Vector3();
const camEuler=new THREE.Euler(0,0,0,"YXZ"), camQuat=new THREE.Quaternion();
const camFwd=new THREE.Vector3();

function clampDrone(p){ p.x=THREE.MathUtils.clamp(p.x,-10.5,10.5); p.z=THREE.MathUtils.clamp(p.z,-10.5,10.5); p.y=THREE.MathUtils.clamp(p.y,.8,4.5); }
function clampCam(p)  { p.x=THREE.MathUtils.clamp(p.x,-10.2,10.2); p.z=THREE.MathUtils.clamp(p.z,-10.2,10.2); p.y=THREE.MathUtils.clamp(p.y,1.0,6.0); }

function resolveDroneVsTargets() {
  for (const t of targets) {
    const dx=drone.position.x-t.position.x, dz=drone.position.z-t.position.z;
    const d=Math.hypot(dx,dz);
    if(d>0&&d<.9){ const push=(.9-d)/d; drone.position.x+=dx*push; drone.position.z+=dz*push; velocity.x*=.4; velocity.z*=.4; }
  }
}

function updateCamera(dt) {
  if(gameState!=="playing") return;
  camEuler.set(pitch,yaw,0); camQuat.setFromEuler(camEuler);
  const offset=new THREE.Vector3(0,2.0,4.2).applyQuaternion(camQuat);
  const desired=drone.position.clone().add(offset);
  clampCam(desired);
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  camFwd.set(0,0,-1).applyQuaternion(camQuat);
  camera.lookAt(drone.position.clone().add(new THREE.Vector3(0,.7,0)).add(camFwd.clone().multiplyScalar(6)));
  drone.quaternion.setFromAxisAngle(up3,yaw);
  spot.target.position.copy(drone.position);
}

function updateMovement(dt) {
  if(gameState!=="playing") return;
  const fwd=(keys.has("KeyW")?1:0)-(keys.has("KeyS")?1:0);
  const str=(keys.has("KeyD")?1:0)-(keys.has("KeyA")?1:0);
  const lift=(keys.has("Space")?1:0)-(keys.has("ShiftLeft")?1:0);
  tempVec.set(str,0,-fwd); if(tempVec.lengthSq()>0) tempVec.normalize();
  tempVec.applyAxisAngle(up3,yaw);
  velocity.x+=tempVec.x*28*dt; velocity.z+=tempVec.z*28*dt; velocity.y+=lift*20*dt;
  velocity.multiplyScalar(Math.max(0,1-4*dt));
  drone.position.addScaledVector(velocity,dt);
  clampDrone(drone.position);
  resolveDroneVsTargets();
  droneBody.rotation.z=THREE.MathUtils.clamp(-velocity.x*.08,-.35,.35);
  droneBody.rotation.x=THREE.MathUtils.clamp(velocity.z*.08,-.25,.25);
}

// ==============================
// Escaneo
// ==============================
const raycaster=new THREE.Raycaster();
let scanProgress=0;

function getLookTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  raycaster.far=scanMaxDist;
  const meshes=targets.map(t=>t.userData.pillar).filter(Boolean);
  const hits=raycaster.intersectObjects(meshes,false);
  if(!hits.length) return null;
  const grp=targets.find(t=>t.userData.pillar===hits[0].object);
  return grp?{group:grp,distance:hits[0].distance}:null;
}

function updateTargetVisuals() {
  const pulse=1+.1*Math.sin(elapsed*6);
  const haloOpacity=.4+.18*Math.sin(elapsed*6);
  for(let i=0;i<targets.length;i++){
    const t=targets[i];
    if(t.userData.halo) t.userData.halo.visible=false;
    if(t.userData.scanned){
      if(t.userData.pillar) t.userData.pillar.material=tMatOn;
      if(t.userData.top){ t.userData.top.material.emissive.setHex(0x00cc88); t.userData.top.material.emissiveIntensity=2; }
      if(t.userData.progressRing) t.userData.progressRing.material.opacity=0;
      continue;
    }
    if(i===currentTargetIndex&&gameState==="playing"){
      if(t.userData.pillar) t.userData.pillar.material=tMatAct;
      if(t.userData.top){ t.userData.top.material.emissive.setHex(0xff9911); t.userData.top.material.emissiveIntensity=2; }
      if(t.userData.halo){ t.userData.halo.visible=true; t.userData.halo.scale.setScalar(pulse); t.userData.halo.material.opacity=haloOpacity; }
      if(t.userData.progressRing){ t.userData.progressRing.material.opacity=scanProgress; t.userData.progressRing.material.emissiveIntensity=1.5+scanProgress*2; }
    } else {
      if(t.userData.pillar) t.userData.pillar.material=tMatOff;
      if(t.userData.top){ t.userData.top.material.emissive.setHex(0x2244ff); t.userData.top.material.emissiveIntensity=2; }
      if(t.userData.progressRing) t.userData.progressRing.material.opacity=0;
    }
  }
}

function updateScan(dt, dmg) {
  if(gameState!=="playing") return;
  updateTargetVisuals();
  const hit=getLookTarget();
  const active=targets[currentTargetIndex];
  let info="En mira: no | Apunta al OBJETIVO ACTIVO y mantén E";
  let canScan=false, wrong=false;
  if(hit){
    if(hit.group===active){ info=`Objetivo activo | Dist: ${hit.distance.toFixed(2)}m`; if(hit.distance<=scanMaxDist) canScan=true; }
    else { wrong=true; info=`Objetivo incorrecto | Dist: ${hit.distance.toFixed(2)}m`; }
  }
  if(dmg) info+="  ⚠ DAÑO";
  if(keys.has("KeyE")&&canScan){
    scanProgress+=dt/scanTime;
    if(scanProgress>=1){
      scanProgress=0; playScanDone();
      active.userData.scanned=true; active.scale.setScalar(1.18);
      setTimeout(()=>active.scale.setScalar(1),120);
      currentTargetIndex++;
      if(currentTargetIndex<targets.length) playNextTick();
      if(currentTargetIndex>=targets.length){
        gameState="won"; finalTime=elapsed; freezeInputs(); updateTargetVisuals(); showOverlay("won"); playWin();
      }
    }
  } else {
    scanProgress=Math.max(0,scanProgress-dt*(wrong?2.0:1.2));
  }
  const sc=Math.min(currentTargetIndex,targets.length);
  hudStatus.textContent=`Objetivo: ${Math.min(currentTargetIndex+1,targets.length)}/${targets.length} | Escaneados: ${sc}/${targets.length}`;
  hudScan.textContent=`Escaneo: ${Math.round(scanProgress*100)}% | ${info}`;
}

// ==============================
// Reinicio de la partida
// ==============================
function resetGame() {
  gameState="playing"; elapsed=0; finalTime=0;
  batteryLeft=batteryMax; currentTargetIndex=0; damageSeconds=0; batteryDamage=0;
  wasTouchE1=false; wasTouchE2=false; scanProgress=0;
  velocity.set(0,0,0); drone.position.set(0,1.5,8); yaw=0; pitch=0;
  enemy1.position.set(3, 1.35, 0); e1Vel.copy(randVel(enemyMoveSpeed));
  enemy2.position.set(-4, 2.2, -3); e2Vel.copy(randVel(enemy2MoveSpeed));
  timers.e1=0; timers.e2=0;
  hideOverlay(); freezeInputs();
  damageAlpha=0; hazardAlpha=0; damageHold=0;
  damageFX.style.opacity="0"; hazardFX.style.opacity="0";
  battBlinkHold=0; hudPhase=0; hudTime.style.color="white";
  for(const t of targets){
    t.userData.scanned=false; t.scale.setScalar(1);
    if(t.userData.pillar) t.userData.pillar.material=tMatOff;
    if(t.userData.top){ t.userData.top.material.emissive.setHex(0x2244ff); t.userData.top.material.emissiveIntensity=2; }
    if(t.userData.halo){ t.userData.halo.visible=false; t.userData.halo.scale.setScalar(1); }
    if(t.userData.progressRing) t.userData.progressRing.material.opacity=0;
  }
  hudStatus.textContent=`Objetivo: 1/${targets.length} | Escaneados: 0/${targets.length}`;
  hudScan.textContent="Escaneo: 0% | En mira: no";
  updateBattHUD(0,false);
}

// ==============================
// Bucle principal
// ==============================
const clock=new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.033);
  let takingDmg=false, inHazard=false;

  if(gameState==="playing"){
    elapsed+=dt;
    for(const r of rotors) r.rotation.z+=dt*20;
    batteryLeft=Math.max(0,batteryLeft-dt);
    takingDmg=updateEnemies(dt);
    inHazard=checkHazard();
    if(inHazard){ const d=hazardDmgPerSec*dt; batteryLeft=Math.max(0,batteryLeft-d); batteryDamage+=d; }

    // pequeña animación para las zonas peligrosas
    const hz_pulse=.8+.5*Math.sin(elapsed*3.5);
    for(const hz of hazardZones){ hz.mat.emissiveIntensity=hz_pulse; hz.mat.opacity=.25+.18*Math.sin(elapsed*3.5); }

    if(batteryLeft<=0){
      gameState="lost"; finalTime=elapsed; freezeInputs(); updateTargetVisuals(); showOverlay("lost"); playLose();
    }
    updateMovement(dt); updateCamera(dt); updateScan(dt,takingDmg); updateNav();
  } else if(gameState==="paused"){
    for(const r of rotors) r.rotation.z+=dt*4;
    navWrap.style.display="none";
  } else {
    navWrap.style.display="none";
  }

  updateFX(dt,takingDmg,inHazard);
  updateBattHUD(dt,takingDmg);
  renderer.render(scene,camera);
}

animate();

window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});