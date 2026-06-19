"use strict";

const CELL = 20;
const COLS = 21;
const ROWS = 21;
const W = COLS * CELL;
const H = ROWS * CELL;
const TOLERANCE = 3; // px snap window at cell centers

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById("game");
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext("2d");

const mazeCanvas = document.createElement("canvas");
mazeCanvas.width = W; mazeCanvas.height = H;
const mctx = mazeCanvas.getContext("2d");
let mazeDirty = true;

// ── UI ────────────────────────────────────────────────────────────────────────
const scoreEl  = document.getElementById("score");
const livesEl  = document.getElementById("lives");
const score2El = document.getElementById("score2");
const lives2El = document.getElementById("lives2");
const levelEl  = document.getElementById("level");
const msgEl    = document.getElementById("message");
const p2ui     = document.getElementById("p2ui");

// ── Map  0=empty 1=wall 2=dot 3=pellet 4=ghost door ──────────────────────────
const BASE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,0,0,0,0,1,1,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,0,0,1,1,4,1,4,1,1,0,0,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,0,0,0,0,0,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,0,0,1,1,1,1,1,1,1,0,0,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,1,1,1,0,0,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

let map, dotCount;
function cloneMap() { return BASE_MAP.map(r => [...r]); }
function countDots(m) { return m.flat().filter(v => v === 2 || v === 3).length; }

// ── Grid helpers ──────────────────────────────────────────────────────────────
const cx = c => c * CELL + CELL / 2;
const cy = r => r * CELL + CELL / 2;
const toC = px => Math.round((px - CELL / 2) / CELL);
const toR = py => Math.round((py - CELL / 2) / CELL);
const wC  = c  => ((c % COLS) + COLS) % COLS;
const wR  = r  => ((r % ROWS) + ROWS) % ROWS;

function cellAt(c, r) { return map[wR(r)]?.[wC(c)] ?? 0; }
function isWall(c, r) { return cellAt(c, r) === 1; }
function isDoor(c, r) { return cellAt(c, r) === 4; }

function canEnter(c, r, ghostCanUseDoor = false) {
  if (isWall(c, r)) return false;
  if (isDoor(c, r) && !ghostCanUseDoor) return false;
  return true;
}

// ── Speed constants (px/s) ────────────────────────────────────────────────────
let PAC_SPD       = 120;
let GHOST_SPD     = 100;
const FRIGHT_SPD  = 65;
const EATEN_SPD   = 200;

// ── Ghost scatter/chase cycle (seconds per phase) ─────────────────────────────
const SC_CYCLE = [7, 20, 7, 20, 5, 20, 5, Infinity];
const SCATTER_CORNER = [
  { c: COLS-1, r: 0 }, { c: 0, r: 0 },
  { c: COLS-1, r: ROWS-1 }, { c: 0, r: ROWS-1 },
];

// ── Fruit table ───────────────────────────────────────────────────────────────
const TOTAL_DOTS = countDots(BASE_MAP);
const FRUIT_THRESHOLDS = [
  { at: Math.floor(TOTAL_DOTS * 0.6), pts: 100,  label: "🍒" },
  { at: Math.floor(TOTAL_DOTS * 0.3), pts: 300,  label: "🍓" },
];
const FRUIT_DURATION = 9; // seconds

// ── State ─────────────────────────────────────────────────────────────────────
let score1, score2, lives1, lives2, level;
let twoPlayer = false;
let gameState; // waiting | playing | dying | levelclear | gameover
let players, ghosts;
let frightenTimer, frightenDuration;
let scCycleTimer, scCycleIdx, chasing;
let eatCombo, dyingTimer;
let fruit; // null | { label, pts, timer, c, r }
let fruitSpawned;

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
let AC = null;
function ac() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  return AC;
}

function beep(freq, dur, type = "square", vol = 0.12) {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  } catch(e) {}
}

function sweep(f0, f1, dur, vol = 0.12) {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(f0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  } catch(e) {}
}

function melody(notes, vol = 0.15) {
  try {
    const a = ac(); let t = a.currentTime;
    for (const [f, d] of notes) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.linearRampToValueAtTime(0, t + d * 0.85);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + d); t += d;
    }
  } catch(e) {}
}

let dotFlip = false;
const sndDot    = () => { dotFlip = !dotFlip; beep(dotFlip ? 600 : 450, 0.04, "square", 0.08); };
const sndPellet = () => sweep(200, 800, 0.25, 0.15);
const sndEat    = () => sweep(1800, 120, 0.35, 0.18);
const sndFruit  = () => melody([[660,0.07],[880,0.07],[1100,0.07],[880,0.07],[660,0.1]], 0.15);
const sndDeath  = () => {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(880, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(55, a.currentTime + 1.6);
    g.gain.setValueAtTime(0.18, a.currentTime);
    g.gain.linearRampToValueAtTime(0, a.currentTime + 1.6);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 1.6);
  } catch(e) {}
};
const sndStart  = () => melody([
  [494,.12],[659,.12],[523,.12],[494,.12],[440,.12],
  [494,.25],[523,.12],[659,.25],[494,.38],
], 0.18);

let sirenOsc = null, sirenLfo = null, sirenGain = null;
function startSiren(fright = false) {
  stopSiren();
  try {
    const a = ac();
    sirenOsc = a.createOscillator();
    sirenLfo = a.createOscillator();
    const lfoG = a.createGain();
    sirenGain = a.createGain();
    sirenOsc.type = "square";
    sirenOsc.frequency.value = fright ? 320 : 160;
    sirenLfo.frequency.value = fright ? 10 : 3;
    lfoG.gain.value = fright ? 90 : 35;
    sirenGain.gain.value = 0.04;
    sirenLfo.connect(lfoG); lfoG.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain); sirenGain.connect(a.destination);
    sirenLfo.start(); sirenOsc.start();
  } catch(e) {}
}
function stopSiren() {
  try { sirenOsc?.stop(); sirenLfo?.stop(); } catch(e) {}
  sirenOsc = sirenLfo = sirenGain = null;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initGame(twoP = false) {
  twoPlayer = twoP;
  p2ui.style.display = twoP ? "inline" : "none";
  map = cloneMap();
  dotCount = countDots(map);
  score1 = score2 = 0;
  lives1 = 3; lives2 = twoP ? 3 : 0;
  level = 1;
  frightenDuration = 8;
  PAC_SPD = 120; GHOST_SPD = 100;
  mazeDirty = true;
  updateUI();
  initRound();
  gameState = "waiting";
  msgEl.textContent = "Press ENTER to start";
}

function makePac(c, r, isP2 = false) {
  return {
    px: cx(c), py: cy(r),
    dx: 0, dy: 0,
    wantDx: 1, wantDy: 0,
    speed: PAC_SPD,
    mA: 0.25, mDir: -1,
    isP2, dead: false,
  };
}

function makeGhost(i) {
  const s = [{ c:10,r:9 },{ c:9,r:10 },{ c:10,r:10 },{ c:11,r:10 }][i];
  return {
    px: cx(s.c), py: cy(s.r),
    dx: 0, dy: -1,
    color: ["#f00","#f9f","#0ff","#f80"][i],
    idx: i,
    mode: i === 0 ? "scatter" : "house",
    houseTimer: i * 3.5,
    frightened: false, eaten: false,
    speed: GHOST_SPD,
  };
}

function initRound() {
  mazeDirty = true; fruit = null; fruitSpawned = [];
  players = [makePac(10, 15)];
  if (twoPlayer) players.push(makePac(10, 13, true));
  ghosts = [0,1,2,3].map(makeGhost);
  frightenTimer = 0;
  scCycleTimer = 0; scCycleIdx = 0; chasing = false;
  eatCombo = 0; dyingTimer = 0;
  startSiren(false);
}

function updateUI() {
  scoreEl.textContent = score1; livesEl.textContent = lives1;
  score2El.textContent = score2; lives2El.textContent = lives2;
  levelEl.textContent = level;
}

// ── Movement ──────────────────────────────────────────────────────────────────
function stepPac(p, dt) {
  const c = toC(p.px), r = toR(p.py);
  const nearCX = Math.abs(p.px - cx(c)) < TOLERANCE;
  const nearCY = Math.abs(p.py - cy(r)) < TOLERANCE;

  if (nearCX && nearCY) {
    // Try buffered turn
    if ((p.wantDx !== 0 || p.wantDy !== 0) &&
        canEnter(wC(c + p.wantDx), wR(r + p.wantDy))) {
      p.dx = p.wantDx; p.dy = p.wantDy;
      p.px = cx(c); p.py = cy(r);
    }
    // Wall ahead? stop.
    if (!canEnter(wC(c + p.dx), wR(r + p.dy))) {
      p.dx = 0; p.dy = 0;
      p.px = cx(c); p.py = cy(r);
    }
  }

  p.px += p.dx * p.speed * dt;
  p.py += p.dy * p.speed * dt;
  // Tunnel
  if (p.px < -CELL/2) p.px += W;
  if (p.px > W + CELL/2) p.px -= W;

  // Mouth animation
  p.mA += 0.06 * p.mDir;
  if (p.mA <= 0.02) p.mDir = 1;
  if (p.mA >= 0.25) p.mDir = -1;
}

// BFS to find best direction for ghost toward target
function ghostDir(g, tc, tr) {
  const startC = toC(g.px), startR = toR(g.py);
  const queue = [{ c: startC, r: startR, first: null }];
  const seen = new Set([`${startC},${startR}`]);
  const dirs = [{dc:0,dr:-1},{dc:0,dr:1},{dc:-1,dr:0},{dc:1,dr:0}];

  while (queue.length) {
    const { c, r, first } = queue.shift();
    if (c === tc && r === tr) return first || { dc:1, dr:0 };
    for (const d of dirs) {
      const nc = wC(c + d.dc), nr = wR(r + d.dr);
      const key = `${nc},${nr}`;
      if (!seen.has(key) && canEnter(nc, nr, true) && !isDoor(nc, nr)) {
        seen.add(key);
        queue.push({ c: nc, r: nr, first: first || d });
      }
    }
    if (seen.size > 300) break;
  }
  // fallback: random valid
  const valid = dirs.filter(d => canEnter(wC(startC+d.dc), wR(startR+d.dr), true));
  return valid[Math.floor(Math.random() * valid.length)] || { dc:1, dr:0 };
}

function ghostTarget(g) {
  const p = players[0]; // ghosts always chase P1 (or nearest)
  const pc = toC(p.px), pr = toR(p.py);
  if (g.eaten) return { tc: 10, tr: 9 };
  if (g.frightened) return { tc: wC(pc + 10), tr: wR(pr + 10) }; // run away
  if (!chasing) return SCATTER_CORNER[g.idx]; // scatter to corner

  // Chase AI
  switch (g.idx) {
    case 0: return { tc: pc, tr: pr }; // Blinky: directly at pac
    case 1: return { tc: wC(pc + p.dx*4), tr: wR(pr + p.dy*4) }; // Pinky: 4 ahead
    case 2: { // Inky: mirror of blinky through 2-ahead
      const blinky = ghosts[0];
      const bc = toC(blinky.px), br = toR(blinky.py);
      const pivot = { c: wC(pc + p.dx*2), r: wR(pr + p.dy*2) };
      return { tc: wC(pivot.c*2 - bc), tr: wR(pivot.r*2 - br) };
    }
    case 3: { // Clyde: chase if far, scatter if near
      const dist = Math.abs(toC(g.px)-pc) + Math.abs(toR(g.py)-pr);
      return dist > 8 ? { tc: pc, tr: pr } : SCATTER_CORNER[3];
    }
  }
}

function stepGhost(g, dt) {
  const c = toC(g.px), r = toR(g.py);
  const nearCX = Math.abs(g.px - cx(c)) < TOLERANCE;
  const nearCY = Math.abs(g.py - cy(r)) < TOLERANCE;

  // House logic
  if (g.mode === "house") {
    g.houseTimer -= dt;
    if (g.houseTimer <= 0) {
      g.mode = "leaving";
      g.px = cx(10); g.py = cy(10); g.dx = 0; g.dy = -1;
    }
    return;
  }
  if (g.mode === "leaving") {
    // Move up to exit row
    g.py -= g.speed * dt;
    if (g.py <= cy(9)) {
      g.py = cy(9); g.mode = "scatter"; g.dx = 1; g.dy = 0;
    }
    return;
  }

  g.speed = g.eaten ? EATEN_SPD : g.frightened ? FRIGHT_SPD : GHOST_SPD;

  if (nearCX && nearCY) {
    g.px = cx(c); g.py = cy(r);
    // Re-enter house when eaten and back home
    if (g.eaten && c === 10 && r === 9) {
      g.eaten = false; g.frightened = false;
      g.mode = "house"; g.houseTimer = 1;
      return;
    }
    const { tc, tr } = ghostTarget(g);
    const d = ghostDir(g, tc, tr);
    g.dx = d.dc; g.dy = d.dr;
  }

  g.px += g.dx * g.speed * dt;
  g.py += g.dy * g.speed * dt;
  if (g.px < -CELL/2) g.px += W;
  if (g.px > W + CELL/2) g.px -= W;
}

// ── Game logic ────────────────────────────────────────────────────────────────
function checkDots(p) {
  const c = toC(p.px), r = toR(p.py);
  if (Math.abs(p.px - cx(c)) > TOLERANCE || Math.abs(p.py - cy(r)) > TOLERANCE) return;
  const cell = map[r]?.[c];
  if (cell === 2) {
    map[r][c] = 0; dotCount--; mazeDirty = true;
    if (p.isP2) score2 += 10; else score1 += 10;
    updateUI(); sndDot();
    spawnFruitIfNeeded();
  } else if (cell === 3) {
    map[r][c] = 0; dotCount--; mazeDirty = true;
    if (p.isP2) score2 += 50; else score1 += 50;
    updateUI(); sndPellet();
    frightenTimer = frightenDuration;
    eatCombo = 0;
    ghosts.forEach(g => { if (!g.eaten) { g.frightened = true; g.dx *= -1; g.dy *= -1; } });
    startSiren(true);
    spawnFruitIfNeeded();
  }
}

function spawnFruitIfNeeded() {
  if (fruit) return;
  for (const ft of FRUIT_THRESHOLDS) {
    if (!fruitSpawned.includes(ft.at) && dotCount <= ft.at) {
      fruitSpawned.push(ft.at);
      fruit = { ...ft, timer: FRUIT_DURATION, c: 10, r: 14 };
      return;
    }
  }
}

function checkFruit() {
  if (!fruit) return;
  for (const p of players) {
    const c = toC(p.px), r = toR(p.py);
    if (c === fruit.c && r === fruit.r &&
        Math.abs(p.px - cx(c)) < TOLERANCE && Math.abs(p.py - cy(r)) < TOLERANCE) {
      if (p.isP2) score2 += fruit.pts; else score1 += fruit.pts;
      updateUI(); sndFruit(); fruit = null; return;
    }
  }
}

function checkGhostCollisions() {
  for (const p of players) {
    if (p.dead) continue;
    const pc = toC(p.px), pr = toR(p.py);
    for (const g of ghosts) {
      if (g.mode === "house" || g.mode === "leaving") continue;
      const gc = toC(g.px), gr = toR(g.py);
      if (pc === gc && pr === gr) {
        if (g.frightened && !g.eaten) {
          g.eaten = true; g.frightened = false;
          eatCombo++;
          const pts = 200 * (1 << Math.min(eatCombo, 7));
          if (p.isP2) score2 += pts; else score1 += pts;
          updateUI(); sndEat();
        } else if (!g.eaten) {
          killPlayer(p);
        }
      }
    }
  }
}

function killPlayer(p) {
  p.dead = true;
  stopSiren();
  const allDead = players.every(pl => pl.dead);
  if (!allDead) return; // other player still alive
  gameState = "dying";
  dyingTimer = 1.8;
  sndDeath();
}

function onDyingComplete() {
  lives1--;
  if (twoPlayer) lives2--;
  updateUI();
  if (lives1 <= 0 && (!twoPlayer || lives2 <= 0)) {
    gameState = "gameover";
    msgEl.textContent = `GAME OVER — Score: ${score1}. Press ENTER to retry.`;
    stopSiren();
  } else {
    gameState = "waiting";
    initRound();
    msgEl.textContent = "Press ENTER to continue";
  }
}

// ── Main update ───────────────────────────────────────────────────────────────
function update(dt) {
  // scatter/chase cycle
  scCycleTimer += dt;
  const phaseDur = SC_CYCLE[scCycleIdx] ?? Infinity;
  if (scCycleTimer >= phaseDur) {
    scCycleTimer = 0; scCycleIdx++;
    chasing = !chasing;
  }

  // frighten timer
  if (frightenTimer > 0) {
    frightenTimer -= dt;
    if (frightenTimer <= 0) {
      frightenTimer = 0;
      ghosts.forEach(g => { g.frightened = false; });
      startSiren(false);
    }
  }

  // fruit timer
  if (fruit) {
    fruit.timer -= dt;
    if (fruit.timer <= 0) fruit = null;
  }

  for (const p of players) {
    if (!p.dead) { stepPac(p, dt); checkDots(p); }
  }
  for (const g of ghosts) stepGhost(g, dt);

  checkFruit();
  checkGhostCollisions();

  if (dotCount <= 0) {
    gameState = "levelclear";
    stopSiren();
    setTimeout(startNextLevel, 1500);
  }
}

function startNextLevel() {
  level++;
  PAC_SPD   = Math.min(160, 120 + level * 4);
  GHOST_SPD = Math.min(140, 100 + level * 5);
  frightenDuration = Math.max(3, 8 - level * 0.5);
  map = cloneMap();
  dotCount = countDots(map);
  mazeDirty = true;
  updateUI();
  initRound();
  gameState = "waiting";
  msgEl.textContent = `Level ${level}! Press ENTER to continue`;
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function drawMazeToCache() {
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, W, H);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = map[r][c];
      const px = c * CELL, py = r * CELL;
      if (cell === 1) {
        mctx.fillStyle = "#00c";
        mctx.fillRect(px, py, CELL, CELL);
        mctx.strokeStyle = "#55f";
        mctx.lineWidth = 1;
        mctx.strokeRect(px+1, py+1, CELL-2, CELL-2);
      } else if (cell === 2) {
        mctx.fillStyle = "#ddd";
        mctx.beginPath();
        mctx.arc(px+CELL/2, py+CELL/2, 2, 0, Math.PI*2);
        mctx.fill();
      } else if (cell === 3) {
        mctx.fillStyle = "#fff";
        mctx.beginPath();
        mctx.arc(px+CELL/2, py+CELL/2, 5, 0, Math.PI*2);
        mctx.fill();
      } else if (cell === 4) {
        mctx.fillStyle = "#f9f";
        mctx.fillRect(px, py+CELL/2-1, CELL, 2);
      }
    }
  }
}

function drawPac(p) {
  const angle = Math.atan2(p.dy, p.dx) || 0;
  const mouth = p.mA * Math.PI;
  const color = p.isP2 ? "#f9f" : "#ff0";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.arc(p.px, p.py, CELL/2 - 1, angle + mouth, angle + Math.PI*2 - mouth);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = "#000";
  const ex = Math.cos(angle - 0.6) * 4, ey = Math.sin(angle - 0.6) * 4;
  ctx.beginPath(); ctx.arc(p.px + ex, p.py + ey, 1.5, 0, Math.PI*2); ctx.fill();
}

function drawDeathAnim(p, progress) {
  const color = p.isP2 ? "#f9f" : "#ff0";
  ctx.fillStyle = color;
  const half = Math.PI * (1 - progress);
  const angle = -Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.arc(p.px, p.py, CELL/2 - 1, angle + half, angle + Math.PI*2 - half);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(g) {
  if (g.mode === "house") return;
  const px = g.px, py = g.py;
  const r = CELL/2 - 1;
  const flash = g.frightened && frightenTimer < 2 && Math.floor(Date.now()/250) % 2 === 0;

  if (g.eaten) {
    drawEyes(px, py, g.dx, g.dy); return;
  }

  ctx.fillStyle = g.frightened ? (flash ? "#fff" : "#00c") : g.color;
  // Body
  ctx.beginPath();
  ctx.arc(px, py - 2, r, Math.PI, 0);
  ctx.lineTo(px + r, py + r + 2);
  const waves = 3;
  for (let i = waves; i >= 0; i--) {
    const wx = (px - r) + (i / waves) * (r * 2);
    const wy = py + r + 2 - (i % 2 === 0 ? 5 : 0);
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(px - r, py + r + 2);
  ctx.closePath();
  ctx.fill();

  if (!g.frightened) {
    drawEyes(px, py - 2, g.dx, g.dy);
  } else {
    // fright face
    ctx.fillStyle = flash ? "#f00" : "#fff";
    ctx.fillRect(px-6, py-5, 3, 3);
    ctx.fillRect(px+3, py-5, 3, 3);
    ctx.fillStyle = flash ? "#fff" : "#00c";
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(px + i*4 - 1, py, 2, 2);
    }
  }
}

function drawEyes(px, py, dx, dy) {
  const ex = dx * 2, ey = dy * 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(px-4, py, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(px+4, py, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#00f";
  ctx.beginPath(); ctx.arc(px-4+ex, py+ey, 1.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(px+4+ex, py+ey, 1.5, 0, Math.PI*2); ctx.fill();
}

function drawFruit() {
  if (!fruit) return;
  ctx.font = `${CELL - 2}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fruit.label, cx(fruit.c), cy(fruit.r));
}

function draw(dyingProg) {
  if (mazeDirty) { drawMazeToCache(); mazeDirty = false; }
  ctx.drawImage(mazeCanvas, 0, 0);
  drawFruit();
  ghosts.forEach(drawGhost);

  for (const p of players) {
    if (gameState === "dying" && p.dead) {
      drawDeathAnim(p, dyingProg);
    } else if (!p.dead) {
      drawPac(p);
    }
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener("keydown", e => {
  keys[e.key] = true;
  const p1 = players?.[0], p2 = players?.[1];
  if (p1) {
    if (e.key === "ArrowLeft")  { p1.wantDx = -1; p1.wantDy = 0; }
    if (e.key === "ArrowRight") { p1.wantDx =  1; p1.wantDy = 0; }
    if (e.key === "ArrowUp")    { p1.wantDx =  0; p1.wantDy = -1; }
    if (e.key === "ArrowDown")  { p1.wantDx =  0; p1.wantDy =  1; }
  }
  if (p2) {
    if (e.key === "a") { p2.wantDx = -1; p2.wantDy = 0; }
    if (e.key === "d") { p2.wantDx =  1; p2.wantDy = 0; }
    if (e.key === "w") { p2.wantDx =  0; p2.wantDy = -1; }
    if (e.key === "s") { p2.wantDx =  0; p2.wantDy =  1; }
  }
  if (e.key === "Enter" && (gameState === "waiting" || gameState === "gameover")) {
    if (gameState === "gameover") initGame(twoPlayer);
    else { gameState = "playing"; msgEl.textContent = ""; sndStart(); startSiren(false); }
  }
  if (e.key === "Tab") {
    e.preventDefault();
    initGame(true);
    gameState = "waiting";
    msgEl.textContent = "2P Mode! Press ENTER to start";
  }
});

// ── Game loop ─────────────────────────────────────────────────────────────────
let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05); // cap at 50ms
  last = ts;

  if (gameState === "playing") {
    update(dt);
  } else if (gameState === "dying") {
    dyingTimer -= dt;
    const prog = 1 - Math.max(0, dyingTimer / 1.8);
    draw(prog);
    if (dyingTimer <= 0) onDyingComplete();
    requestAnimationFrame(loop);
    return;
  }

  draw(0);
  requestAnimationFrame(loop);
}

// ── Start ─────────────────────────────────────────────────────────────────────
initGame(false);
last = performance.now();
requestAnimationFrame(loop);
