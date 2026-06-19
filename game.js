const CELL = 20;
const COLS = 21;
const ROWS = 21;

const canvas = document.getElementById("game");
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;
const ctx = canvas.getContext("2d");

const mazeCanvas = document.createElement("canvas");
mazeCanvas.width = canvas.width;
mazeCanvas.height = canvas.height;
const mazeCtx = mazeCanvas.getContext("2d");
let mazeDirty = true;

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const msgEl = document.getElementById("message");

// 0=empty, 1=wall, 2=dot, 3=power pellet, 4=ghost house door
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

const GHOST_COLORS = ["#f00", "#f9f", "#0ff", "#f80"];
const GHOST_NAMES = ["Blinky", "Pinky", "Inky", "Clyde"];
const GHOST_HOME = { x: 10, y: 10 };
const PACMAN_START = { x: 10, y: 15 };
const GHOST_STARTS = [
  { x: 10, y: 9 },
  { x: 9,  y: 10 },
  { x: 10, y: 10 },
  { x: 11, y: 10 },
];

let map, score, lives, level, state;
let pacman, ghosts, mouthAngle, mouthDir;
let frightenTimer, frightenDuration;
let dotCount;
let inputDir;
let animFrame;

function cloneMap() {
  return BASE_MAP.map(r => [...r]);
}

function countDots(m) {
  return m.flat().filter(v => v === 2 || v === 3).length;
}

function initGame() {
  map = cloneMap();
  dotCount = countDots(map);
  score = 0;
  lives = 3;
  level = 1;
  frightenDuration = 8000;
  updateUI();
  initRound();
  state = "waiting";
  msgEl.textContent = "Press ENTER to start";
}

function initRound() {
  mazeDirty = true;
  pacman = { x: PACMAN_START.x, y: PACMAN_START.y, dx: 0, dy: 0, nextDx: 1, nextDy: 0 };
  mouthAngle = 0.25;
  mouthDir = -1;
  inputDir = { dx: 1, dy: 0 };
  frightenTimer = 0;

  ghosts = GHOST_STARTS.map((s, i) => ({
    x: s.x, y: s.y,
    dx: 0, dy: -1,
    color: GHOST_COLORS[i],
    mode: i === 0 ? "chase" : "house",
    houseTimer: i * 3000,
    frightened: false,
    eaten: false,
  }));
}

function updateUI() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
}

function canMove(x, y, dx, dy) {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return true; // tunnel
  const cell = map[ny]?.[nx];
  return cell !== 1 && cell !== 4;
}

function wrap(x, y) {
  return {
    x: (x + COLS) % COLS,
    y: (y + ROWS) % ROWS,
  };
}

let lastTime = 0;
let pacTimer = 0;
let ghostTimer = 0;
const PAC_SPEED = 200;
let GHOST_SPEED = 250;

function gameLoop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  if (state === "playing") {
    pacTimer += dt;
    ghostTimer += dt;
    if (frightenTimer > 0) frightenTimer -= dt;

    if (pacTimer >= PAC_SPEED) {
      pacTimer = 0;
      movePacman();
    }
    if (ghostTimer >= GHOST_SPEED) {
      ghostTimer = 0;
      moveGhosts();
    }
    checkCollisions();
    if (dotCount === 0) nextLevel();
  }

  draw();
  animFrame = requestAnimationFrame(gameLoop);
}

function movePacman() {
  if (canMove(pacman.x, pacman.y, inputDir.dx, inputDir.dy)) {
    pacman.dx = inputDir.dx;
    pacman.dy = inputDir.dy;
  }
  if (canMove(pacman.x, pacman.y, pacman.dx, pacman.dy)) {
    const next = wrap(pacman.x + pacman.dx, pacman.y + pacman.dy);
    pacman.x = next.x;
    pacman.y = next.y;
  }

  const cell = map[pacman.y]?.[pacman.x];
  if (cell === 2) {
    map[pacman.y][pacman.x] = 0;
    score += 10;
    dotCount--;
    mazeDirty = true;
    updateUI();
  } else if (cell === 3) {
    map[pacman.y][pacman.x] = 0;
    score += 50;
    dotCount--;
    mazeDirty = true;
    updateUI();
    frightenTimer = frightenDuration;
    ghosts.forEach(g => { if (!g.eaten) { g.frightened = true; g.dx = -g.dx; g.dy = -g.dy; } });
  }

  mouthAngle += 0.05 * mouthDir;
  if (mouthAngle <= 0.02) mouthDir = 1;
  if (mouthAngle >= 0.25) mouthDir = -1;
}

function bfsNext(ghost, targetX, targetY) {
  const start = { x: ghost.x, y: ghost.y };
  const queue = [{ ...start, path: [] }];
  const visited = new Set([`${start.x},${start.y}`]);
  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === targetX && cur.y === targetY) {
      return cur.path[0] || { dx: 0, dy: 0 };
    }
    for (const d of dirs) {
      const nx = (cur.x + d.dx + COLS) % COLS;
      const ny = (cur.y + d.dy + ROWS) % ROWS;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && canMove(cur.x, cur.y, d.dx, d.dy)) {
        visited.add(key);
        queue.push({ x: nx, y: ny, path: cur.path.length ? cur.path : [d] });
      }
    }
    if (queue.length > 200) break;
  }
  // fallback: random valid direction
  const valid = dirs.filter(d => canMove(ghost.x, ghost.y, d.dx, d.dy));
  return valid[Math.floor(Math.random() * valid.length)] || { dx: 0, dy: 0 };
}

function moveGhosts() {
  const frightened = frightenTimer > 0;

  ghosts.forEach((g, i) => {
    if (g.mode === "house") {
      g.houseTimer -= GHOST_SPEED;
      if (g.houseTimer <= 0) {
        g.mode = "leaving";
        g.x = GHOST_HOME.x;
        g.y = GHOST_HOME.y;
      }
      return;
    }

    if (g.eaten) {
      const d = bfsNext(g, GHOST_HOME.x, GHOST_HOME.y);
      g.dx = d.dx; g.dy = d.dy;
      const next = wrap(g.x + g.dx, g.y + g.dy);
      g.x = next.x; g.y = next.y;
      if (g.x === GHOST_HOME.x && g.y === GHOST_HOME.y) {
        g.eaten = false;
        g.frightened = false;
        g.mode = "chase";
      }
      return;
    }

    g.frightened = frightened;

    let targetX, targetY;
    if (g.frightened) {
      // run away
      targetX = (pacman.x + Math.floor(COLS / 2)) % COLS;
      targetY = (pacman.y + Math.floor(ROWS / 2)) % ROWS;
    } else if (i === 0) {
      targetX = pacman.x; targetY = pacman.y;
    } else if (i === 1) {
      targetX = (pacman.x + pacman.dx * 4 + COLS) % COLS;
      targetY = (pacman.y + pacman.dy * 4 + ROWS) % ROWS;
    } else if (i === 2) {
      targetX = Math.floor(COLS / 4); targetY = Math.floor(ROWS / 4);
    } else {
      const dist = Math.abs(g.x - pacman.x) + Math.abs(g.y - pacman.y);
      targetX = dist > 8 ? pacman.x : 0;
      targetY = dist > 8 ? pacman.y : ROWS - 1;
    }

    const d = bfsNext(g, targetX, targetY);
    g.dx = d.dx; g.dy = d.dy;
    const next = wrap(g.x + g.dx, g.y + g.dy);
    g.x = next.x; g.y = next.y;
  });
}

let eatCombo = 0;
function checkCollisions() {
  ghosts.forEach(g => {
    if (g.x === pacman.x && g.y === pacman.y) {
      if (g.frightened && !g.eaten) {
        g.eaten = true;
        g.frightened = false;
        eatCombo++;
        score += 200 * eatCombo;
        updateUI();
      } else if (!g.eaten && !g.frightened) {
        loseLife();
      }
    }
  });
}

function loseLife() {
  lives--;
  updateUI();
  if (lives <= 0) {
    state = "gameover";
    msgEl.textContent = `GAME OVER — Score: ${score}. Press ENTER to restart.`;
  } else {
    state = "waiting";
    initRound();
    msgEl.textContent = "Press ENTER to continue";
  }
}

function nextLevel() {
  level++;
  GHOST_SPEED = Math.max(100, 250 - level * 15);
  frightenDuration = Math.max(3000, 8000 - level * 500);
  map = cloneMap();
  dotCount = countDots(map);
  updateUI();
  state = "waiting";
  initRound();
  msgEl.textContent = `Level ${level}! Press ENTER to continue`;
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function draw() {
  if (mazeDirty) {
    mazeCtx.fillStyle = "#000";
    mazeCtx.fillRect(0, 0, mazeCanvas.width, mazeCanvas.height);
    drawMaze();
    mazeDirty = false;
  }

  ctx.drawImage(mazeCanvas, 0, 0);
  drawPacman();
  ghosts.forEach(drawGhost);
}

function drawMaze() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = map[row][col];
      const px = col * CELL;
      const py = row * CELL;
      if (cell === 1) {
        mazeCtx.fillStyle = "#00f";
        mazeCtx.fillRect(px, py, CELL, CELL);
        mazeCtx.strokeStyle = "#44f";
        mazeCtx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
      } else if (cell === 2) {
        mazeCtx.fillStyle = "#fff";
        mazeCtx.beginPath();
        mazeCtx.arc(px + CELL / 2, py + CELL / 2, 2, 0, Math.PI * 2);
        mazeCtx.fill();
      } else if (cell === 3) {
        mazeCtx.fillStyle = "#fff";
        mazeCtx.beginPath();
        mazeCtx.arc(px + CELL / 2, py + CELL / 2, 5, 0, Math.PI * 2);
        mazeCtx.fill();
      } else if (cell === 4) {
        mazeCtx.fillStyle = "#f9f";
        mazeCtx.fillRect(px, py + CELL / 2 - 1, CELL, 2);
      }
    }
  }
}

function drawPacman() {
  const px = pacman.x * CELL + CELL / 2;
  const py = pacman.y * CELL + CELL / 2;
  const angle = Math.atan2(pacman.dy, pacman.dx);
  const mouth = mouthAngle * Math.PI;

  ctx.fillStyle = "#ff0";
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, CELL / 2 - 1, angle + mouth, angle + Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(px + Math.cos(angle - 0.5) * 4, py + Math.sin(angle - 0.5) * 4, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGhost(g) {
  if (g.mode === "house") return;
  const px = g.x * CELL;
  const py = g.y * CELL;
  const cx = px + CELL / 2;
  const cy = py + CELL / 2;
  const r = CELL / 2 - 1;

  if (g.eaten) {
    // just eyes
    drawGhostEyes(cx, cy, g.dx, g.dy);
    return;
  }

  const flashing = g.frightened && frightenTimer < 2000 && Math.floor(Date.now() / 250) % 2 === 0;
  ctx.fillStyle = g.frightened ? (flashing ? "#fff" : "#00f") : g.color;

  ctx.beginPath();
  ctx.arc(cx, cy - 2, r, Math.PI, 0);
  ctx.lineTo(px + CELL - 1, py + CELL - 1);
  const wave = 3;
  for (let i = wave; i >= 0; i--) {
    const wx = px + 1 + (i / wave) * (CELL - 2);
    const wy = py + CELL - 1 - (i % 2 === 0 ? 4 : 0);
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(px + 1, py + CELL - 1);
  ctx.closePath();
  ctx.fill();

  if (!g.frightened) drawGhostEyes(cx, cy - 2, g.dx, g.dy);
  else {
    ctx.fillStyle = flashing ? "#f00" : "#fff";
    ctx.fillRect(cx - 6, cy - 4, 4, 3);
    ctx.fillRect(cx + 2, cy - 4, 4, 3);
    ctx.fillStyle = flashing ? "#fff" : "#f00";
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(cx + i * 4 - 1, cy, 2, 2);
    }
  }
}

function drawGhostEyes(cx, cy, dx, dy) {
  const ex = dx * 2;
  const ey = dy * 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx - 4 + ex, cy + ey, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4 + ex, cy + ey, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#00f";
  ctx.beginPath(); ctx.arc(cx - 4 + ex * 1.5, cy + ey * 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4 + ex * 1.5, cy + ey * 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
}

// ─── Input ──────────────────────────────────────────────────────────────────

document.addEventListener("keydown", e => {
  const dirs = {
    ArrowUp:    { dx: 0,  dy: -1 },
    ArrowDown:  { dx: 0,  dy:  1 },
    ArrowLeft:  { dx: -1, dy:  0 },
    ArrowRight: { dx:  1, dy:  0 },
    w: { dx: 0,  dy: -1 },
    s: { dx: 0,  dy:  1 },
    a: { dx: -1, dy:  0 },
    d: { dx:  1, dy:  0 },
  };
  if (dirs[e.key]) inputDir = dirs[e.key];

  if (e.key === "Enter") {
    if (state === "waiting") {
      state = "playing";
      msgEl.textContent = "";
      eatCombo = 0;
    } else if (state === "gameover") {
      initGame();
      state = "waiting";
    }
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

initGame();
lastTime = performance.now();
animFrame = requestAnimationFrame(gameLoop);
