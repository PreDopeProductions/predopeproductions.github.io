"use strict";
/* SKYMYST — THIN AIR. A one-prompt platformer built on Zack Bell's platformer
   devlog architecture (Pts 1-6), translated from GameMaker to Canvas:
   oGame controller, oParSolid / oParEntity parents, Approach(), OnGround(),
   his exact tuning numbers, variable jumps, wall cling/slide/jump, jump-through
   platforms, moving platforms (here: airships) with sub-pixel movement,
   composite objects (spikes parented to a ship), gamepad + keyboard merged
   input, music/room fades. Art: Derek's supplied sprites, extracted. */
const W = 640, H = 360, TILE = 16;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

/* ---------------- assets (inlined by build.py as data URLs) ---------------- */
const IMG = {};
function loadAssets(done) {
  // Never gate the game on images: if any sprite hangs or is blocked, start
  // anyway after a short timeout — drawing code already skips missing images.
  let fired = false;
  const fire = () => { if (!fired) { fired = true; done(); } };
  setTimeout(fire, 1200);
  const names = Object.keys(ASSETS);
  let left = names.length;
  if (!left) return fire();
  names.forEach(n => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; if (--left === 0) fire(); };
    im.onerror = () => { IMG[n] = null; if (--left === 0) fire(); };
    im.src = ASSETS[n];
  });
}

/* ---------------- helpers (Pt 2) ---------------- */
function Approach(v, target, shift) {
  return v < target ? Math.min(v + shift, target) : Math.max(v - shift, target);
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

/* ---------------- input (Pt 5: keyboard + gamepad merged) ---------------- */
const keys = {};
let jumpHeldPrev = false;
addEventListener("keydown", e => {
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)) e.preventDefault();
  keys[e.code] = true; initAudio();
});
addEventListener("keyup", e => { keys[e.code] = false; });
/* touch / click: click starts the game; on touch devices the bottom of the
   screen is left | right | (gap) | jump, so it plays without a keyboard. */
const touch = { left: false, right: false, jump: false };
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function applyPointers(e) {
  const p = canvasPos(e);
  touch.left = touch.right = touch.jump = false;
  if (p.y > H - 64) {
    if (p.x < 128) touch.left = true;
    else if (p.x < 264) touch.right = true;
    else if (p.x > W - 158) touch.jump = true;
  }
  initAudio();
  if (state === "title") { state = "play"; timerFrames = 0; deaths = 0; totalShards = 0; loadLevel(0); }
  else if (state === "win") state = "title";
}
canvas.addEventListener("pointerdown", applyPointers);
canvas.addEventListener("pointermove", e => { if (e.buttons) applyPointers(e); });
addEventListener("pointerup", () => { touch.left = touch.right = touch.jump = false; });
function readInput() {
  let left = keys.ArrowLeft || keys.KeyA || touch.left, right = keys.ArrowRight || keys.KeyD || touch.right;
  let down = keys.ArrowDown || keys.KeyS, jump = keys.KeyZ || keys.Space || keys.ArrowUp || keys.KeyW || touch.jump;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (ax < -0.3) left = true; if (ax > 0.3) right = true; if (ay > 0.3) down = true;
    if (gp.buttons[0] && gp.buttons[0].pressed) jump = true;
    if (gp.buttons[14] && gp.buttons[14].pressed) left = true;
    if (gp.buttons[15] && gp.buttons[15].pressed) right = true;
  }
  const pressed = !!jump && !jumpHeldPrev, released = !jump && jumpHeldPrev;
  jumpHeldPrev = !!jump;
  return { left: !!left, right: !!right, down: !!down, jump: !!jump, jumpPressed: pressed, jumpReleased: released };
}

/* ---------------- audio (Pt 5: fades, procedural) ---------------- */
let AC = null, musicGain = null, musicTimer = null, musicStep = 0;
function initAudio() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = AC.createGain(); musicGain.gain.value = 0; musicGain.connect(AC.destination);
    const notes = [110, 130.81, 164.81, 196, 164.81, 130.81, 98, 130.81]; // A minor sky-drift
    musicTimer = setInterval(() => {
      if (!AC || state !== "play") return;
      const t = AC.currentTime;
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "triangle"; o.frequency.value = notes[musicStep % notes.length] * (musicStep % 16 >= 8 ? 2 : 1);
      g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.45);
      musicStep++;
    }, 240);
  } catch (e) { AC = null; }
}
function fadeMusic(to, seconds) {
  if (!AC || !musicGain) return;
  musicGain.gain.cancelScheduledValues(AC.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, AC.currentTime);
  musicGain.gain.linearRampToValueAtTime(to, AC.currentTime + seconds);
}
function sfx(kind) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.connect(g); g.connect(AC.destination);
  if (kind === "jump") { o.type = "square"; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.12); }
  if (kind === "collect") { o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1560, t + 0.1); }
  if (kind === "die") { o.type = "sawtooth"; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3); }
  if (kind === "switch") { o.type = "square"; o.frequency.setValueAtTime(180, t); o.frequency.setValueAtTime(520, t + 0.07); }
  if (kind === "goal") { o.type = "triangle"; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(784, t + 0.12); }
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.start(t); o.stop(t + 0.34);
}

/* ---------------- levels ----------------
   Tiles are 16px. y grows downward. solids are [x,y,w,h] in tiles.
   start / checkpoints are [tileX, surfaceTileY] (feet on that tile's top). */
const LEVELS = [
  {
    name: "ISLE ONE — PORT MERIDIAN", sub: "Stable Atmosphere · Alliance harbour",
    solids: [[0,18,14,4],[17,15,6,7],[24,18,15,4],[42,16,11,6],[58,18,13,4]],
    slopes: [[14,17,"/"],[15,16,"/"],[16,15,"/"]],
    through: [[28,15,6]],
    spikes: [[47,15,2]],
    movers: [{ x: 53, y: 17, w: 3, axis: "x", dist: 2, speed: 0.035, ship: "white" }],
    npcs: [
      { img: "npc_figure_a", x: 4, y: 18, line: "SHOPKEEPER: Dispatch for the great ship, pilot. Mind the Thin Air below." },
      { img: "npc_figure_c", x: 30, y: 18, line: "MERCHANT: Compass shards fetch a fine price. The docks bounce you up — try them." },
      { img: "npc_pilot", x: 62, y: 18, line: "PILOT: She sails when you board. R restarts, - and + hop isles." }
    ],
    shards: [[15,13],[31,12],[48,13],[56,14],[68,16]],
    enemies: [{ x: 50, y: 16, min: 43, max: 51 }],
    start: [2,18], checkpoints: [[35,18]],
    goal: { x: 68, y: 18, w: 2, h: 3 },
    door: null, sw: null
  },
  {
    name: "ISLE TWO — THE REBEL CROSSING", sub: "Red sails on the wind · wall-climb the chimney",
    solids: [[0,18,11,4],[12,18,9,4],[15,11,1,7],[19,11,1,7],[19,10,5,1],[41,14,15,8],[66,12,11,10]],
    slopes: [[56,13,"/"],[57,12,"/"],[58,11,"/"]],
    through: [[59,11,3],[62,9,3]],
    spikes: [[46,13,2]],
    movers: [{ x: 25, y: 13, w: 3, axis: "x", dist: 13, speed: 0.03, ship: "red" }],
    npcs: [
      { img: "npc_bride", x: 3, y: 18, line: "THE BRIDE: I was to sail Tuesday. The Rebels took the crossing." },
      { img: "npc_rebel2", x: 69, y: 12, line: "A REBEL, OFF DUTY: ...you did not hear the chimney tip from me." }
    ],
    shards: [[17,8],[33,10],[47,11],[63,6],[74,10]],
    enemies: [{ x: 44, y: 14, min: 42, max: 49 }, { x: 71, y: 12, min: 67, max: 75 }],
    start: [2,18], checkpoints: [[43,14]],
    goal: { x: 74, y: 12, w: 2, h: 3 },
    door: null, sw: null
  },
  {
    name: "ISLE THREE — THIN AIR", sub: "Cast off the chained ship · the anchored great ship waits",
    solids: [[0,18,10,4],[16,10,9,2],[25,10,1,2],[26,10,11,2],[53,18,10,4],[55,8,1,10],[58,8,1,10],[58,7,6,1],[64,10,15,12]],
    slopes: [],
    through: [[11,14,3]],
    spikes: [[31,9,2]],
    movers: [
      { x: 12, y: 15, w: 3, axis: "y", dist: 5, speed: 0.03, ship: "white" },
      { x: 38, y: 13, w: 4, axis: "x", dist: 11, speed: 0.032, ship: "red", spiked: true }
    ],
    npcs: [
      { img: "npc_skeleton", x: 4, y: 18, line: "THE SKELETON: I waited for a ship once. Stand on the mooring switch, pilot." },
      { img: "npc_figure_a", x: 67, y: 10, line: "SHOPKEEPER: You made it across Thin Air. She is just ahead." }
    ],
    shards: [[12,11],[22,8],[44,10],[57,5],[76,8]],
    enemies: [{ x: 29, y: 10, min: 27, max: 34 }, { x: 68, y: 10, min: 65, max: 70 }],
    start: [2,18], checkpoints: [[27,10],[54,18]],
    goal: { x: 76, y: 10, w: 2, h: 3 },
    sw: { x: 22, y: 10 }, door: [25,6,1,4]
  }
];

/* ---------------- game state (oGame, Pt 1) ---------------- */
let state = "title"; // title | play | win
let levelIdx = 0, level = null, fade = 0, fadeDir = 0, pendingAction = null;
let timerFrames = 0, deaths = 0, totalShards = 0, demoMode = false, frame = 0;
let camX = 0, doorOpen = false, switchLatch = false;
let player = null, enemies = [], movers = [], shardsLeft = [];
let respawn = { x: 0, y: 0 };
const DEMO = new URLSearchParams(location.search).has("demo");

function tileSolid(tx, ty) {
  if (!level) return false;
  for (const s of level.solids) if (tx >= s[0] && tx < s[0] + s[2] && ty >= s[1] && ty < s[1] + s[3]) return true;
  if (level.door && !doorOpen) {
    const d = level.door;
    if (tx >= d[0] && tx < d[0] + d[2] && ty >= d[1] && ty < d[1] + d[3]) return true;
  }
  return false;
}
function slopeAt(tx, ty) {
  for (const s of level.slopes) if (s[0] === tx && s[1] === ty) return s[2];
  return null;
}
function slopeSurfaceY(tx, ty, dir, cx) {
  const top = ty * TILE, lx = tx * TILE;
  if (dir === "/") return top + TILE - (cx - lx);   // rises to the right
  return top + (cx - lx);                            // "\" falls to the right
}

/* oParEntity (Pt 2/3/4): vx, vy, onGround, sub-pixel-safe AABB vs tiles,
   jump-through platforms, slopes, moving-platform landing. */
function makeEntity(x, y) {
  return { x, y, w: 12, h: 44, vx: 0, vy: 0, onGround: false, cLeft: false, cRight: false,
           standingOn: null, face: 1, animT: 0, dead: false };
}
function entityTiles(e) {
  return { l: Math.floor(e.x / TILE), r: Math.floor((e.x + e.w - 1) / TILE),
           t: Math.floor(e.y / TILE), b: Math.floor((e.y + e.h - 1) / TILE) };
}
function physMove(e) {
  e.cLeft = e.cRight = false;
  const wasGround = e.onGround;
  // --- X axis ---
  e.x += e.vx;
  let t = entityTiles(e);
  if (e.vx > 0) {
    for (let ty = t.t; ty <= t.b; ty++) if (tileSolid(t.r, ty)) { e.x = t.r * TILE - e.w - 0.01; e.cRight = true; e.vx = 0; break; }
  } else if (e.vx < 0) {
    for (let ty = t.t; ty <= t.b; ty++) if (tileSolid(t.l, ty)) { e.x = (t.l + 1) * TILE + 0.01; e.cLeft = true; e.vx = 0; break; }
  }
  // --- Y axis ---
  const prevBottom = e.y + e.h;
  e.y += e.vy;
  e.onGround = false; e.standingOn = null;
  t = entityTiles(e);
  if (e.vy > 0) {
    outer: for (let ty = t.t; ty <= t.b; ty++) for (let tx = t.l; tx <= t.r; tx++)
      if (tileSolid(tx, ty)) { e.y = ty * TILE - e.h; e.vy = 0; e.onGround = true; break outer; }
  } else if (e.vy < 0) {
    outer2: for (let ty = t.b; ty >= t.t; ty--) for (let tx = t.l; tx <= t.r; tx++)
      if (tileSolid(tx, ty)) { e.y = (ty + 1) * TILE + 0.01; e.vy = 0; break outer2; }
  }
  // jump-through platforms (Pt 3): land only when falling onto the top
  if (e.vy >= 0) {
    for (const p of level.through) {
      const px = p[0] * TILE, pw = p[2] * TILE, ptop = p[1] * TILE;
      if (e.x + e.w > px && e.x < px + pw && prevBottom <= ptop + 1 && e.y + e.h >= ptop) {
        e.y = ptop - e.h; e.vy = 0; e.onGround = true;
      }
    }
    // moving platforms (airships): land on decks
    for (const m of movers) {
      const d = m.deck();
      if (e.x + e.w > d.x && e.x < d.x + d.w && prevBottom <= d.y + 2 && e.y + e.h >= d.y) {
        e.y = d.y - e.h; e.vy = 0; e.onGround = true; e.standingOn = m;
      }
    }
  }
  // standing probe: exactly touching a solid tile counts as grounded
  if (e.vy >= 0 && !e.onGround && (e.y + e.h) % TILE === 0) {
    const row = Math.floor((e.y + e.h) / TILE);
    for (let tx = t.l; tx <= t.r; tx++) if (tileSolid(tx, row)) { e.onGround = true; break; }
  }
  // slopes: snap feet to the surface when close and not rising
  if (e.vy >= 0) {
    const cx = e.x + e.w / 2, feetTy = Math.floor((e.y + e.h) / TILE);
    for (let ty = feetTy - 1; ty <= feetTy; ty++) {
      const dir = slopeAt(Math.floor(cx / TILE), ty);
      if (dir) {
        const surf = slopeSurfaceY(Math.floor(cx / TILE), ty, dir, cx);
        const diff = (e.y + e.h) - surf;
        if (diff >= -2 && diff <= 14) { e.y = surf - e.h; e.vy = 0; e.onGround = true; }
      }
    }
  }
  if (wasGround && !e.onGround && e.vy === 0) { /* walked off a ledge: gravity takes over next frame */ }
}
function OnGround(e) { // Pt 2: one pixel below — solid, jump-through, deck, or slope
  const probe = { x: e.x, y: e.y + 1, w: e.w, h: e.h };
  const t = entityTiles(probe);
  for (let tx = t.l; tx <= t.r; tx++) if (tileSolid(tx, t.b)) return true;
  for (const p of level.through) {
    const px = p[0] * TILE, pw = p[2] * TILE, ptop = p[1] * TILE;
    if (e.x + e.w > px && e.x < px + pw && Math.abs(e.y + e.h + 1 - ptop) <= 2) return true;
  }
  return e.onGround;
}

/* ---------------- movers: airships (Pt 3/4, sub-pixel + composite) ---------------- */
function makeMover(def) {
  const m = { def, x0: def.x * TILE, y0: def.y * TILE, cx: 0, cy: 0, t: Math.random() * 6.28,
    dx: 0, dy: 0, px: 0, py: 0,
    pos() {
      const s = (Math.sin(this.t) + 1) / 2; // 0..1 along route
      if (this.def.axis === "x") return { x: this.x0 + s * this.def.dist * TILE, y: this.y0 };
      return { x: this.x0, y: this.y0 - s * this.def.dist * TILE };
    },
    deck() { const p = this.pos(); return { x: p.x, y: p.y, w: this.def.w * TILE, h: 10 }; },
    update() {
      const before = this.pos();
      this.t += this.def.speed;
      const after = this.pos();
      // sub-pixel accumulation (Pt 4): keep fractions, apply whole pixels via pos()
      this.dx = after.x - before.x; this.dy = after.y - before.y;
      this.px = after.x; this.py = after.y;
      // carry / push entities standing on deck
      for (const e of [player, ...enemies]) {
        if (e && e.standingOn === this) { e.x += this.dx; e.y += this.dy; }
      }
      // composite hazards ride at a stored offset (Pt 4)
      if (this.def.spiked) {
        const d = this.deck();
        this.spikeRect = { x: d.x + 4, y: d.y - 8, w: 20, h: 8 };
      }
    }
  };
  const p = m.pos(); m.px = p.x; m.py = p.y;
  return m;
}

/* ---------------- level lifecycle (Pt 5: fades) ---------------- */
function loadLevel(idx, keepTimer) {
  levelIdx = idx; level = LEVELS[idx];
  doorOpen = false; switchLatch = false;
  movers = level.movers.map(makeMover);
  enemies = level.enemies.map(en => {
    const e = makeEntity(en.x * TILE + 2, en.y * TILE - 44);
    e.dir = 1; e.min = en.min * TILE; e.max = en.max * TILE; return e;
  });
  shardsLeft = level.shards.map(s => ({ x: s[0] * TILE + 8, y: s[1] * TILE + 8, taken: false }));
  respawn = { x: level.start[0] * TILE + 2, y: level.start[1] * TILE - 44 };
  player = makeEntity(respawn.x, respawn.y);
  player.cling = 0; player.canStick = true; player.sticking = false;
  camX = clamp(player.x - W / 2, 0, levelWidth() - W);
  if (!keepTimer) { /* timer runs across the whole voyage */ }
  fadeMusic(0.16, 1.0);
}
function levelWidth() {
  let max = 0;
  for (const s of level.solids) max = Math.max(max, (s[0] + s[2]) * TILE);
  return Math.max(max, W);
}
function startFade(action) { fadeDir = 1; pendingAction = action; fadeMusic(0.0, 0.25); }
function die() {
  if (fadeDir) return;
  deaths++; sfx("die");
  startFade(() => {
    player = makeEntity(respawn.x, respawn.y);
    player.cling = 0; player.canStick = true; player.sticking = false;
    fadeMusic(0.16, 1.0);
  });
}

/* ---------------- player update (Pt 2 tuning, verbatim ratios) ---------------- */
const M = 1.0; // Zack's overall speed multiplier
const TUNE = { groundAccel: 1.0 * M, groundFric: 1.9 * M, airAccel: 0.75 * M, airFric: 0.1 * M,
  vxMax: 6.5 * M, vyMax: 10.0 * M, jumpHeight: 8.0 * M, gravNorm: 0.5 * M, gravSlide: 0.25 * M, clingTime: 4.0 * M };
let demoStuck = 0, demoLastX = 0;
function demoInput() {
  // attract mode: run right, jump gaps/walls, wall-jump by holding toward the wall
  const inp = { left: false, right: true, down: false, jump: false, jumpPressed: false, jumpReleased: false };
  const aheadX = player.face >= 0 ? player.x + player.w + 4 : player.x - 4;
  const groundAhead = tileSolid(Math.floor(aheadX / TILE), Math.floor((player.y + player.h + 6) / TILE));
  const wallAhead = tileSolid(Math.floor(aheadX / TILE), Math.floor((player.y + 20) / TILE));
  if (player.onGround && (!groundAhead || wallAhead)) inp.jumpPressed = true, inp.jump = true;
  if (!player.onGround && (player.cLeft || player.cRight)) { inp.jumpPressed = true; inp.jump = true; inp.right = player.cLeft; inp.left = player.cRight; }
  if (Math.abs(player.x - demoLastX) < 0.1 && player.onGround) { if (++demoStuck > 200) { demoStuck = 0; die(); } } else demoStuck = 0;
  demoLastX = player.x;
  return inp;
}
function updatePlayer(inp) {
  const p = player;
  const tempAccel = p.onGround ? TUNE.groundAccel : TUNE.airAccel;
  const tempFric = p.onGround ? TUNE.groundFric : TUNE.airFric;
  if ((!p.cRight && !p.cLeft) || p.onGround) { p.canStick = true; p.sticking = false; }
  if (((inp.right && p.cLeft) || (inp.left && p.cRight)) && p.canStick && !p.onGround) {
    p.cling = TUNE.clingTime; p.sticking = true; p.canStick = false;
  }
  if (p.sticking && p.cling > 0) p.cling--;
  if (p.cling <= 0) p.sticking = false;
  // gravity / wall slide
  if (!p.onGround) {
    if ((p.cLeft || p.cRight) && p.vy >= 0 && !p.sticking) p.vy = Approach(p.vy, TUNE.vyMax, TUNE.gravSlide);
    else if (p.sticking) p.vy = Approach(p.vy, 0.8, TUNE.gravSlide);
    else p.vy = Approach(p.vy, TUNE.vyMax, TUNE.gravNorm);
  }
  if (inp.left && !inp.right && !p.sticking) {
    if (p.vx > 0) p.vx = Approach(p.vx, 0, tempFric);
    p.vx = Approach(p.vx, -TUNE.vxMax, tempAccel); p.face = -1;
  }
  if (inp.right && !inp.left && !p.sticking) {
    if (p.vx < 0) p.vx = Approach(p.vx, 0, tempFric);
    p.vx = Approach(p.vx, TUNE.vxMax, tempAccel); p.face = 1;
  }
  if (!inp.right && !inp.left) p.vx = Approach(p.vx, 0, tempFric);
  // wall jump
  if (inp.jumpPressed && !p.onGround) {
    if (p.cLeft) { p.vy = -TUNE.jumpHeight * 1.1; p.vx = inp.left ? TUNE.jumpHeight * 0.75 : TUNE.vxMax; p.sticking = false; sfx("jump"); }
    else if (p.cRight) { p.vy = -TUNE.jumpHeight * 1.1; p.vx = inp.right ? -TUNE.jumpHeight * 0.75 : -TUNE.vxMax; p.sticking = false; sfx("jump"); }
  }
  // ground jump + variable height (Pt 2)
  if (inp.jumpPressed && p.onGround) { p.vy = -TUNE.jumpHeight; sfx("jump"); }
  else if (inp.jumpReleased && p.vy < 0) p.vy *= 0.25;
  physMove(p);
  p.animT += Math.abs(p.vx) > 0.4 && p.onGround ? Math.abs(p.vx) * 0.055 : 0;
  // checkpoints
  for (const c of level.checkpoints) {
    const cx = c[0] * TILE, cy = c[1] * TILE;
    if (Math.abs(p.x - cx) < 14 && Math.abs((p.y + p.h) - cy) < 20) respawn = { x: cx + 2, y: cy - 44 };
  }
  // switch & door (puzzle beat)
  if (level.sw && !switchLatch) {
    const sx = level.sw.x * TILE, sy = level.sw.y * TILE;
    if (p.x + p.w > sx && p.x < sx + TILE && Math.abs(p.y + p.h - sy) < 8) {
      switchLatch = true; doorOpen = true; sfx("switch");
    }
  }
  // shards
  for (const s of shardsLeft) {
    if (!s.taken && Math.abs(p.x + 6 - s.x) < 16 && Math.abs(p.y + 22 - s.y) < 26) { s.taken = true; totalShards++; sfx("collect"); }
  }
  // hazards: spikes, composite ship spikes, thin air
  for (const sp of level.spikes) {
    if (overlap(p, { x: sp[0] * TILE + 2, y: sp[1] * TILE + 9, w: sp[2] * TILE - 4, h: 7 })) return die();
  }
  for (const m of movers) if (m.spikeRect && overlap(p, m.spikeRect)) return die();
  if (p.y > 23 * TILE) return die();
  // goal
  const g = level.goal;
  if (overlap(p, { x: g.x * TILE, y: (g.y - g.h) * TILE, w: g.w * TILE, h: g.h * TILE })) {
    sfx("goal");
    if (levelIdx + 1 < LEVELS.length) startFade(() => loadLevel(levelIdx + 1, true));
    else startFade(() => { state = "win"; });
  }
}
function updateEnemies() {
  enemies = enemies.filter(e => !e.dead);
  for (const e of enemies) {
    if (!e.onGround) e.vy = Approach(e.vy, TUNE.vyMax, TUNE.gravNorm);
    e.vx = e.dir * 0.7;
    // turn at ledges and patrol bounds
    const aheadX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
    const groundAhead = tileSolid(Math.floor(aheadX / TILE), Math.floor((e.y + e.h + 6) / TILE)) ||
                        level.through.some(p => Math.abs(e.y + e.h + 1 - p[1] * TILE) <= 2 && aheadX > p[0] * TILE && aheadX < (p[0] + p[2]) * TILE);
    if (!groundAhead && e.onGround) e.dir *= -1;
    if (e.x < e.min) e.dir = 1; if (e.x > e.max) e.dir = -1;
    const pvx = e.vx; physMove(e);
    e.face = e.dir;
    if ((e.cLeft || e.cRight) && pvx !== 0) e.dir *= -1;
    e.animT += 0.06;
    if (player && overlap(player, { x: e.x + 2, y: e.y + 4, w: e.w - 4, h: e.h - 4 })) {
      // stomp: falling onto a sentry's head bounces and removes him
      if (player.vy > 1 && (player.y + player.h) - e.y < 16) {
        e.dead = true; player.vy = -5.5; totalShards += 0; sfx("collect");
      } else die();
    }
  }
}

/* ---------------- rendering ---------------- */
function drawSprite(img, x, y, flip) {
  if (!img) return;
  ctx.save();
  if (flip) { ctx.translate(Math.round(x) + img.width, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); }
  else ctx.drawImage(img, Math.round(x), Math.round(y));
  ctx.restore();
}
function drawFigure(imgStrip, e, isPlayer) {
  // strip: 8 frames of 24x48; idle uses player_idle when still
  const moving = Math.abs(e.vx) > 0.4 && e.onGround;
  ctx.save();
  const dx = Math.round(e.x - 6 - camX), dy = Math.round(e.y - 4);
  if (!e.onGround || moving) {
    const frameIdx = moving ? Math.floor(e.animT) % 8 : 1;
    ctx.translate(dx + (e.face < 0 ? 24 : 0), dy);
    ctx.scale(e.face < 0 ? -1 : 1, 1);
    if (imgStrip) ctx.drawImage(imgStrip, frameIdx * 24, 0, 24, 48, 0, 0, 24, 48);
  } else if (isPlayer && IMG.player_idle) {
    ctx.translate(dx + (e.face < 0 ? 24 : 0), dy + 4);
    ctx.scale(e.face < 0 ? -1 : 1, 1);
    ctx.drawImage(IMG.player_idle, 0, 0);
  } else if (imgStrip) {
    ctx.translate(dx + (e.face < 0 ? 24 : 0), dy);
    ctx.scale(e.face < 0 ? -1 : 1, 1);
    ctx.drawImage(imgStrip, 24, 0, 24, 48, 0, 0, 24, 48);
  }
  ctx.restore();
}
function drawIslandRect(s) {
  const x = s[0] * TILE - camX, y = s[1] * TILE, w = s[2] * TILE, h = s[3] * TILE;
  if (x + w < 0 || x > W) return;
  ctx.fillStyle = "#0b0b0d"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#33333a"; ctx.fillRect(x, y, w, 2); // lit top edge
  // jagged rock underside on exposed bottom tiles (tileset look)
  ctx.fillStyle = "#0b0b0d";
  for (let tx = s[0]; tx < s[0] + s[2]; tx++) {
    if (!tileSolid(tx, s[1] + s[3])) {
      const bx = tx * TILE - camX, by = (s[1] + s[3]) * TILE;
      const jag = ((tx * 37 + s[1] * 11) % 3) * 3;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + TILE, by); ctx.lineTo(bx + TILE / 2, by + 6 + jag); ctx.closePath(); ctx.fill();
    }
  }
}
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#45454e"); g.addColorStop(0.55, "#33333a"); g.addColorStop(1, "#232329");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // distant islands (parallax silhouettes)
  ctx.fillStyle = "rgba(16,16,19,0.55)";
  for (let i = 0; i < 7; i++) {
    const ix = ((i * 260 - camX * 0.3) % (W + 300)) - 150, iy = 60 + (i * 53) % 150;
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + 90, iy); ctx.lineTo(ix + 60, iy + 26); ctx.lineTo(ix + 30, iy + 26); ctx.closePath(); ctx.fill();
  }
  // distant drifting ships
  const ships = [["ship_white_small", 0.12, 70], ["ship_red_small", 0.2, 150], ["sloop_red", 0.16, 105]];
  ships.forEach(([n, par, sy], i) => {
    const im = IMG[n]; if (!im) return;
    const sx = ((frame * 0.11 * (i + 1) - camX * par) % (W + 200)) - 100;
    ctx.globalAlpha = 0.75; ctx.drawImage(im, sx, sy + Math.sin(frame * 0.01 + i * 2) * 3); ctx.globalAlpha = 1;
  });
  // thin-air mist at the bottom of the world
  const mg = ctx.createLinearGradient(0, H - 42, 0, H);
  mg.addColorStop(0, "rgba(210,210,220,0)"); mg.addColorStop(1, "rgba(210,210,220,0.20)");
  ctx.fillStyle = mg; ctx.fillRect(0, H - 42, W, 42);
}
function drawLevel() {
  drawBackground();
  for (const s of level.solids) drawIslandRect(s);
  // slopes: black rock ramps
  for (const s of level.slopes) {
    const x = s[0] * TILE - camX, y = s[1] * TILE;
    ctx.fillStyle = "#0b0b0d"; ctx.beginPath();
    if (s[2] === "/") { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
    else { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x, y + TILE); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#33333a"; ctx.beginPath();
    if (s[2] === "/") { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y); } else { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y + TILE); }
    ctx.stroke();
  }
  // jump-through docks
  for (const p of level.through) {
    const x = p[0] * TILE - camX, y = p[1] * TILE;
    ctx.fillStyle = "#151312"; ctx.fillRect(x, y, p[2] * TILE, 5);
    ctx.fillStyle = "#4a3b28"; ctx.fillRect(x, y, p[2] * TILE, 2);
    for (let i = 0; i < p[2]; i++) ctx.fillRect(x + i * TILE + 7, y + 5, 2, 6);
  }
  // door + switch
  if (level.door && !doorOpen) {
    const d = level.door, x = d[0] * TILE - camX, y = d[1] * TILE;
    ctx.fillStyle = "#1c1c20"; ctx.fillRect(x, y, d[2] * TILE, d[3] * TILE);
    ctx.fillStyle = "#c22"; ctx.fillRect(x, y + 4, d[2] * TILE, 3);
    ctx.strokeStyle = "#55555e"; ctx.strokeRect(x + 0.5, y + 0.5, d[2] * TILE - 1, d[3] * TILE - 1);
  }
  if (level.sw) {
    const x = level.sw.x * TILE - camX, y = level.sw.y * TILE;
    ctx.fillStyle = switchLatch ? "#3a3" : "#c22"; ctx.fillRect(x + 3, y - 4, 10, 4);
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(x + 2, y - 1, 12, 2);
  }
  // spikes
  ctx.fillStyle = "#d8d8de";
  for (const sp of level.spikes) {
    const x = sp[0] * TILE - camX, y = sp[1] * TILE;
    for (let i = 0; i < sp[2] * 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * 8, y + TILE); ctx.lineTo(x + i * 8 + 4, y + 6); ctx.lineTo(x + i * 8 + 8, y + TILE); ctx.closePath(); ctx.fill();
    }
  }
  // checkpoints (little harbour flags)
  for (const c of level.checkpoints) {
    const x = c[0] * TILE - camX, y = c[1] * TILE, active = respawn.x === c[0] * TILE + 2;
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(x + 7, y - 22, 2, 22);
    ctx.fillStyle = active ? "#e33" : "#888"; ctx.fillRect(x + 9, y - 22, 9, 6);
  }
  // movers: airships with decks, composite spikes riding (Pt 4)
  for (const m of movers) {
    const d = m.deck(), x = d.x - camX;
    const im = IMG[m.def.ship === "red" ? "ship_red_small" : "ship_white_small"];
    if (im) ctx.drawImage(im, Math.round(x + d.w / 2 - im.width / 2), Math.round(d.y - 40 + Math.sin(frame * 0.03 + m.t) * 1.5));
    ctx.fillStyle = "#151312"; ctx.fillRect(x, d.y, d.w, 5);
    ctx.fillStyle = "#4a3b28"; ctx.fillRect(x, d.y, d.w, 2);
    if (m.spikeRect) {
      ctx.fillStyle = "#d8d8de";
      for (let i = 0; i < 2; i++) {
        const sx = m.spikeRect.x - camX + i * 10;
        ctx.beginPath(); ctx.moveTo(sx, d.y); ctx.lineTo(sx + 5, d.y - 8); ctx.lineTo(sx + 10, d.y); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#c22"; ctx.fillRect(m.spikeRect.x - camX, d.y - 2, m.spikeRect.w, 2);
    }
  }
  // goal: the anchored great ship + boarding glow
  const g = level.goal, gx = g.x * TILE - camX, gy = g.y * TILE;
  const hero = IMG.ship_anchor || IMG.ship_white_large;
  if (hero && levelIdx === LEVELS.length - 1) ctx.drawImage(hero, gx - 60, gy - 250, hero.width * 0.82, hero.height * 0.82);
  else if (IMG.ship_white) ctx.drawImage(IMG.ship_white, gx - 46, gy - 108, 108, 95);
  ctx.fillStyle = "rgba(255,60,60," + (0.25 + Math.sin(frame * 0.08) * 0.12) + ")";
  ctx.fillRect(gx, gy - g.h * TILE, g.w * TILE, g.h * TILE);
  ctx.fillStyle = "#fff"; ctx.font = "8px monospace"; ctx.fillText("BOARD", gx + 2, gy - g.h * TILE - 4);
  // shards: miniature compass roses
  for (const s of shardsLeft) {
    if (s.taken) continue;
    const bob = Math.sin(frame * 0.06 + s.x) * 2;
    if (IMG.compass) ctx.drawImage(IMG.compass, s.x - camX - 8, s.y + bob - 8, 16, 16);
    else { ctx.fillStyle = "#e33"; ctx.fillRect(s.x - camX - 3, s.y + bob - 3, 6, 6); }
  }
  // NPCs + dialogue
  let dlg = null;
  for (const n of level.npcs) {
    const im = IMG[n.img]; if (!im) continue;
    const nx = n.x * TILE - camX, ny = n.y * TILE;
    ctx.drawImage(im, Math.round(nx + 2), Math.round(ny - im.height));
    if (player && Math.abs(player.x - n.x * TILE) < 42 && Math.abs(player.y + player.h - ny) < 26) dlg = n.line;
  }
  for (const e of enemies) drawFigure(IMG.rebel_walk, e, false);
  if (player) drawFigure(IMG.player_walk, player, true);
  if (navigator.maxTouchPoints > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, H - 56, 120, 56); ctx.fillRect(136, H - 56, 120, 56); ctx.fillRect(W - 150, H - 56, 150, 56);
    ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = "16px monospace";
    ctx.fillText("◀", 52, H - 22); ctx.fillText("▶", 188, H - 22); ctx.fillText("JUMP", W - 108, H - 22);
  }
  if (dlg) {
    ctx.fillStyle = "rgba(8,8,10,0.88)"; ctx.fillRect(70, H - 44, W - 140, 30);
    ctx.strokeStyle = "#c22"; ctx.strokeRect(70.5, H - 43.5, W - 140, 30);
    ctx.fillStyle = "#eee"; ctx.font = "10px monospace";
    wrapText(dlg, 80, H - 30, W - 160, 12);
  }
  drawHUD();
}
function wrapText(text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "", yy = y;
  for (const w of words) {
    if (ctx.measureText(line + w).width > maxW) { ctx.fillText(line, x, yy); line = ""; yy += lh; }
    line += w + " ";
  }
  ctx.fillText(line, x, yy);
}
function drawHUD() {
  ctx.fillStyle = "rgba(8,8,10,0.55)"; ctx.fillRect(0, 0, W, 20);
  ctx.fillStyle = "#eee"; ctx.font = "10px monospace";
  ctx.fillText(level.name, 8, 13); // Pt 1: room name in the corner
  if (IMG.compass) ctx.drawImage(IMG.compass, W - 120, 3, 14, 14);
  const secs = Math.floor(timerFrames / 60), mm = String(Math.floor(secs / 60)).padStart(2, "0"), ss = String(secs % 60).padStart(2, "0");
  ctx.fillText("x " + totalShards, W - 102, 13);
  ctx.fillText(mm + ":" + ss, W - 62, 13);
  ctx.fillStyle = "#e66"; ctx.fillText("†" + deaths, W - 26, 13);
}
function drawTitle() {
  drawBackground();
  if (IMG.ship_anchor) ctx.drawImage(IMG.ship_anchor, W - 300, 58);
  if (IMG.compass) {
    ctx.save(); ctx.translate(516, 296); ctx.rotate(frame * 0.01);
    ctx.drawImage(IMG.compass, -32, -32, 64, 64); ctx.restore();
  }
  ctx.fillStyle = "#f2f2f2"; ctx.font = "bold 44px monospace"; ctx.fillText("SKYMYST", 36, 96);
  ctx.fillStyle = "#e33"; ctx.font = "bold 15px monospace"; ctx.fillText("T H I N   A I R", 38, 122);
  ctx.fillStyle = "#ddd"; ctx.font = "11px monospace";
  ctx.fillText("A one-prompt platformer in the Stable Atmosphere.", 38, 168);
  ctx.fillText("Carry the last dispatch across three floating isles", 38, 186);
  ctx.fillText("to the great white ship. The Rebels sail red.", 38, 202);
  ctx.fillStyle = "#fff"; ctx.font = "12px monospace";
  ctx.fillText((Math.floor(frame / 30) % 2 ? "—  CLICK  HERE,  OR  PRESS  Z,  TO  SET  SAIL  —" : ""), 38, 248);
  ctx.fillStyle = "#aaa"; ctx.font = "10px monospace";
  ctx.fillText("Move: Arrows / A,D · Jump: Z / Space (hold = higher, tap walls to climb)", 38, 286);
  ctx.fillText("Gamepad works too. R restarts an isle · - / + hop isles · Esc = title", 38, 302);
  ctx.fillText("White sails: Alliance · Red sails: Rebels · Below: Thin Air. Do not fall.", 38, 318);
}
function drawWin() {
  drawBackground();
  if (IMG.ship_white_large) ctx.drawImage(IMG.ship_white_large, W / 2 - 130, 30);
  ctx.fillStyle = "#f2f2f2"; ctx.font = "bold 24px monospace"; ctx.textAlign = "center";
  ctx.fillText("DISPATCH DELIVERED", W / 2, 300 - 24);
  ctx.font = "12px monospace"; ctx.fillStyle = "#ddd";
  const secs = Math.floor(timerFrames / 60);
  ctx.fillText("Time " + Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0") + " · Compass shards " + totalShards + " / 15 · Falls " + deaths, W / 2, 300);
  ctx.fillText("Press Z to sail again — come build on make.fun", W / 2, 322);
  ctx.textAlign = "left";
}

/* ---------------- main loop (oGame step event) ---------------- */
let last = 0, acc = 0;
function step() {
  frame++;
  // fades (Pt 5 room transitions)
  if (fadeDir === 1) { fade += 0.06; if (fade >= 1) { fade = 1; if (pendingAction) { pendingAction(); pendingAction = null; } fadeDir = -1; } }
  else if (fadeDir === -1) { fade -= 0.06; if (fade <= 0) { fade = 0; fadeDir = 0; } }
  const inp = readInput();
  if (state === "title") {
    if (inp.jumpPressed || keys.Enter) { initAudio(); state = "play"; timerFrames = 0; deaths = 0; totalShards = 0; loadLevel(0); }
    return;
  }
  if (state === "win") {
    if (inp.jumpPressed) { state = "title"; }
    return;
  }
  // oGame debug traversal (Pt 1)
  if (keys.KeyR && !fadeDir) { startFade(() => loadLevel(levelIdx, true)); keys.KeyR = false; }
  if (keys.Escape) { state = "title"; keys.Escape = false; }
  if (keys.Minus && levelIdx > 0 && !fadeDir) { startFade(() => loadLevel(levelIdx - 1, true)); keys.Minus = false; }
  if (keys.Equal && levelIdx < LEVELS.length - 1 && !fadeDir) { startFade(() => loadLevel(levelIdx + 1, true)); keys.Equal = false; }
  const useInp = (demoMode || DEMO) ? demoInput() : inp;
  for (const m of movers) m.update();
  updatePlayer(useInp);
  updateEnemies();
  timerFrames++;
  camX = clamp(player.x + player.w / 2 - W / 2, 0, Math.max(0, levelWidth() - W));
}
function render() {
  ctx.clearRect(0, 0, W, H);
  if (state === "title") drawTitle();
  else if (state === "win") drawWin();
  else if (level) drawLevel();
  if (fade > 0) { ctx.fillStyle = "rgba(0,0,0," + fade + ")"; ctx.fillRect(0, 0, W, H); }
}
function loop(ts) {
  requestAnimationFrame(loop);
  acc += Math.min(100, ts - last); last = ts;
  while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
  render();
}
loadAssets(() => {
  if (new URLSearchParams(location.search).has("test")) {
    // oGame debug self-test: run the demo pilot synchronously and report state
    state = "play"; loadLevel(0);
    const nSteps = parseInt(new URLSearchParams(location.search).get("steps") || "10800", 10);
    for (let i = 0; i < nSteps; i++) step();
    render();
    document.title = JSON.stringify({ level: levelIdx, x: Math.round(player.x), y: Math.round(player.y),
      deaths, shards: totalShards, state, onGround: player.onGround });
    return;
  }
  if (DEMO) { state = "play"; loadLevel(0); }
  requestAnimationFrame(loop);
});
