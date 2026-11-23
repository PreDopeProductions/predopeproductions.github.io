"use strict";
/* SKYMYST — Original World.
   A port + expansion of Derek Boe's GameMaker 8.0 prototype (decompiled from
   SkyDemo.exe). Object behaviours are translated from the extracted .gml event
   files in original/skydemo_src/objects/. Room layouts, tiles and instances
   come from the extracted room.json data (see world.js, built by gen_world.py).
   Movement uses the original's own pixel-stepping (repeat(spd) 1px steps),
   which is also the v2 engine's quality bar. Room speed 30, view 640x480. */
const cv = document.getElementById("game"), ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false; // 1:1 pixel art: never smooth a scaled sprite
const VW = 640, VH = 480;
const Q = new URLSearchParams(location.search);
const TEST = Q.has("test"), SHOT = Q.get("shot");

/* ---------- assets ---------- */
const IMG = {};   // sprite name -> [Image frames]
const BGIMG = {}; // background name -> Image
function loadAssets() {
  for (const k in ASSETS) {
    const img = new Image(); img.src = ASSETS[k];
    if (k.startsWith("spr:")) {
      const base = k.slice(4), m = base.match(/^(.*)_(\d+)$/);
      if (m) (IMG[m[1]] = IMG[m[1]] || [])[+m[2]] = img;
    } else if (k.startsWith("bg:")) BGIMG[k.slice(3)] = img;
  }
}
const SPR = n => WORLD.sprites[n];
function sprImg(name, idx) {
  const f = IMG[name]; if (!f || !f.length) return null;
  return f[Math.abs(Math.floor(idx)) % f.length];
}

/* ---------- items (scripts/scr_items.gml, verbatim data) ---------- */
const ITEMS = { name: [""], type: [""], info: [""], atk: [0], def: [0], hp: [0] };
function defItem(id, name, type, info, extra) {
  ITEMS.name[id] = name; ITEMS.type[id] = type; ITEMS.info[id] = info;
  if (extra) { if (extra.atk) ITEMS.atk[id] = extra.atk; if (extra.def) ITEMS.def[id] = extra.def; if (extra.hp) ITEMS.hp[id] = extra.hp; }
}
defItem(1, "Dubloons", "stackable", "Currency within the Myst");
defItem(2, "Flowers", "stackable", "A pretty flower");
defItem(3, "Potion", "consumable", "A potion used for healing", { hp: 10 });
defItem(4, "Meat", "consumable", "Delicious", { hp: 5 });
defItem(5, "Cannon", "weapon", "Shoots a volley bullet", { atk: 10 });
defItem(6, "Bomb", "weapon", "A fuze lit bomb with shrapnel", { atk: 20 });
defItem(11, "Double Cannon", "weapon", "Shoots two volley bullets", { atk: 15 });
defItem(12, "Tail Cannon", "weapon", "Shoots backwards", { atk: 12 });
defItem(7, "Metal Shield", "shield", "This should do me good in battle", { def: 25 });
defItem(8, "Wood Shield", "shield", "Weak and flimsy", { def: 8 });
defItem(13, "Dubloon Magnet", "shield", "Pulls in stray dubloon pieces", { def: 4 });
defItem(9, "Coal", "stackable", "A combustible black sedimentary rock");
defItem(10, "Skull", "stackable", "A human skull");
/* EXPANSION items — defined exactly the way scr_items.gml defines the originals.
   Icons are spr_inventory_obj frames 14/15, drawn at native 32x32 in the
   original palette (expansion_assets/, see style_check.py). */
defItem(14, "Skybloom", "stackable", "A heavy bloom from the Thick Air garden isle");
defItem(15, "Salvage", "stackable", "Sky-metal torn from a derelict wreck");

/* ---------- globals (obj_control/create_0.gml) ---------- */
const G = {
  shipnum: 2, trade: false, traded: 0, tradestock: 0, canTrade: 0, tradeItem: 0, mapMarked: false,
  crew: 1, max_crew: 10, invW: 6, invH: 2,
  max_hp: 100, hp: 100, base_attack: 20, base_defense: 20, atk: 20, def: 20,
  equip: [0, 0], inventory: [], stack: [],
  invShow: false, equipShow: false, menuShow: false, menu: [], menuX: 0, menuY: 0,
  menuSelH: 0, menuSelV: 0, mouseSelObj: 0, mouseSelAmt: 0, mouseSelPH: 0, mouseSelPV: 0,
};
for (let k = 0; k < G.invH; k++) { G.inventory.push(new Array(G.invW).fill(0)); G.stack.push(new Array(G.invW).fill(0)); }
/* scripts/item_add.gml */
function item_add(id, amt) {
  let found = 0, count = amt;
  if (ITEMS.type[id] === "stackable") {
    for (let i = 0; i < G.invH && !found; i++) for (let j = 0; j < G.invW; j++)
      if (G.inventory[i][j] === id) { G.stack[i][j] += amt; found = 1; break; }
    if (!found) for (let i = 0; i < G.invH && !found; i++) for (let j = 0; j < G.invW; j++)
      if (G.inventory[i][j] === 0) { G.inventory[i][j] = id; G.stack[i][j] = amt; found = 1; break; }
  } else for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++)
    if (G.inventory[i][j] === 0 && count > 0) { G.inventory[i][j] = id; G.stack[i][j] = 1; count--; }
}
function item_remove(id, amt) { /* scripts/item_remove.gml */
  let count = amt;
  if (ITEMS.type[id] === "stackable") {
    for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++)
      if (G.inventory[i][j] === id) {
        if (G.stack[i][j] > count) G.stack[i][j] -= count;
        else { G.inventory[i][j] = 0; G.stack[i][j] = 0; }
      }
  } else for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++)
    if (G.inventory[i][j] === id && count > 0) { G.inventory[i][j] = 0; G.stack[i][j] = 0; count--; }
}
function item_amount(id) { /* scripts/item_amount.gml */
  let count = 0;
  if (ITEMS.type[id] === "stackable") {
    for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++)
      if (G.inventory[i][j] === id) count = G.stack[i][j];
  } else for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++)
    if (G.inventory[i][j] === id) count++;
  return count;
}
function item_clear(id) { for (let i = 0; i < G.invH; i++) for (let j = 0; j < G.invW; j++) if (G.inventory[i][j] === id) G.stack[i][j] = 0; }
function inventory_space() { let c = 0; for (let k = 0; k < G.invH; k++) for (let i = 0; i < G.invW; i++) if (!G.inventory[k][i]) c++; return c; }
function inventory_clear() { for (let k = 0; k < G.invH; k++) for (let i = 0; i < G.invW; i++) G.stack[k][i] = 0; }
item_add(5, 1); // obj_control create: item_add(5,1) — a Cannon to start

/* ---------- messages (show_message) ---------- */
let toast = "", toastT = 0;
function showMessage(s) { toast = s; toastT = 150; }

/* ---------- air bands (EXPANSION: Derek's skymap — Thick / Stable / Thin) ---------- */
const ROOM_ALT = { rmTravel: null, rmExplore: 0.50, rmExplore2: 0.45, rmExplore3: 0.18, rmExplore4: 0.82, rm_test: 0.50, rmGarden: 0.15, rmDerelict: 0.85 };
function altitudeAt(roomName, y) {
  const r = WORLD.rooms[roomName];
  if (ROOM_ALT[roomName] === null || ROOM_ALT[roomName] === undefined) return 1 - y / r.h; // rmTravel spans all bands
  return ROOM_ALT[roomName] + (0.5 - y / r.h) * 0.25;
}
function bandAt(roomName, y) {
  const a = altitudeAt(roomName, y);
  if (a >= 0.66) return { name: "THIN AIR", alt: a, grav: 1.4, airSpd: 3, jump: -12.5, projGrav: 0.7, sink: 0.5 };
  if (a <= 0.33) return { name: "THICK AIR", alt: a, grav: 0.5, airSpd: 5, jump: -10, projGrav: 0.3, sink: -0.3 };
  return { name: "STABLE ATMOSPHERE", alt: a, grav: 1.0, airSpd: 5, jump: -11, projGrav: 0.5, sink: 0 };
}

/* ---------- world / entities ---------- */
let roomName = "rmTravel", ents = [], cam = { x: 0, y: 0 }, mode = "ship"; // mode: ship | foot
let player = null, vessel = null, frame = 0, started = false, gameOver = false;
let travelSave = null, lastCombatFrame = -9999, raidTimer = 45 * 30, walkVariant = 0;
const solidHash = new Map(); // "cx,cy" -> true for block instances (per current room)
function cellKey(x, y) { return (x >> 5) + "," + (y >> 5); }
function rebuildSolids() {
  solidHash.clear();
  for (const e of ents) if (e.type === "objBlock16" || e.type === "objBlock32") {
    const s = e.type === "objBlock16" ? 16 : 32;
    for (let x = e.x; x < e.x + s; x += 16) for (let y = e.y; y < e.y + s; y += 16) solidHash.set(cellKey(x, y), true);
  }
}
function bbox(e) {
  const m = SPR(e.spr); if (!m) return { l: e.x - 8, t: e.y - 8, r: e.x + 8, b: e.y + 8 };
  const xs = e.xscale || 1;
  let l, r;
  if (xs >= 0) { l = e.x + m.left - m.ox; r = e.x + m.right - m.ox; }
  else { l = e.x - (m.right - m.ox); r = e.x - (m.left - m.ox); }
  return { l, t: e.y + m.top - m.oy, r, b: e.y + m.bottom - m.oy };
}
function overlap(a, b) { return a.l <= b.r && b.l <= a.r && a.t <= b.b && b.t <= a.b; }
function placeMeeting(e, dx, dy, types) {
  const save = { x: e.x, y: e.y }; e.x += dx; e.y += dy;
  const bb = bbox(e); let hit = null;
  for (const o of ents) { if (o !== e && !o.dead && types.includes(o.type) && overlap(bb, bbox(o))) { hit = o; break; } }
  e.x = save.x; e.y = save.y; return hit;
}
function solidMeeting(e, dx, dy) { // blocks only, via hash (player/ship collision parent)
  const save = { x: e.x, y: e.y }; e.x += dx; e.y += dy;
  const bb = bbox(e); let hit = false;
  for (let cx = Math.floor(bb.l / 32) * 32; cx <= bb.r && !hit; cx += 32)
    for (let cy = Math.floor(bb.t / 32) * 32; cy <= bb.b && !hit; cy += 32)
      if (solidHash.has(cellKey(cx, cy))) {
        // refine: test actual block rects in this cell neighbourhood
        for (const o of ents) if (!o.dead && (o.type === "objBlock16" || o.type === "objBlock32")) {
          const s = o.type === "objBlock16" ? 16 : 32;
          if (bb.l < o.x + s && bb.r > o.x && bb.t < o.y + s && bb.b > o.y) { hit = true; break; }
        }
      }
  e.x = save.x; e.y = save.y; return hit;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearest(x, y, types, excl) {
  let best = null, bd = 1e18;
  for (const o of ents) if (!o.dead && o !== excl && types.includes(o.type)) { const d = (o.x - x) ** 2 + (o.y - y) ** 2; if (d < bd) { bd = d; best = o; } }
  return best;
}
function anyOf(types) { return ents.some(e => !e.dead && types.includes(e.type)); }
const ENEMY_TYPES = ["objEnemyBomber", "objSmlBoat"];
const isEnemy = e => ENEMY_TYPES.includes(e.type);

function create(type, x, y, props) {
  const meta = WORLD.objects[type] || {};
  const e = { type, x, y, spr: meta.spr || null, depth: meta.depth || 0, visible: meta.visible !== false, img: 0, imgSpd: 1,
    xscale: 1, yscale: 1, angle: 0, alpha: 1, vx: 0, vy: 0, dir: 1, dead: false, t: 0 };
  Object.assign(e, makeState(type));
  if (props) Object.assign(e, props);
  ents.push(e); return e;
}
function destroy(e) { if (!e || e.dead) return; e.dead = true; onDestroy(e); }

/* ---------- per-object create events (translated from create_0.gml) ---------- */
function makeState(type) {
  switch (type) {
    case "objPlayer": return { vspd: 0, grav: 1, spd: 5, isMoving: false, isInAir: false, takeOff: 0, pickUp: false, pickAlarm: -1, frac: 0 };
    case "objShip": return { SPEED: 3, canShoot: 1, crewShoot: true, shootCd: 0, crewCd: 0, repair: 0, kind: "ship" };
    case "objShip1": return { SPEED: 4, canShoot: 1, crewShoot: true, shootCd: 0, crewCd: 0, repair: 0, kind: "ship1" };
    case "objRowBoat": return { SPEED: 2, canShoot: 0, shootCd: 0, crewShoot: false, crewCd: 0, repair: 0, kind: "rowboat", hp: 5 };
    case "objEnemyBomber": return { hp: 100, crew: 1 + irnd(10), goldN: 5 + irnd(4), spd: 3, ang: rnd(360), canShoot: true, crewShoot: true, shootCd: 30, crewCd: 30, flockCd: 10 };
    case "objSmlBoat": return { hp: 20, spd: 4, ang: irnd(360), crew: 2 + irnd(2), canShoot: true, crewShoot: true, shootCd: 30, crewCd: 30, flockCd: 10 };
    case "objBomb": case "objEBomb": return { fuse: 50, dir: type === "objEBomb" ? (Math.random() < 0.5 ? 1 : -1) : 1 };
    case "objGold": return { life: 500 };
    case "objDebris": return { life: 50, spin: Math.random() < 0.5 ? 1 : 2, img: irnd(5) };
    case "objShrapnel": return { life: 50 };
    case "objCrew": return { life: 50, spin: Math.random() < 0.5 ? 1 : 2 };
    case "objBlast": case "objSMLBlast": case "objESmlBlast": return { life: type === "objBlast" ? 3 : 4 };
    case "objSkull": case "objskullTake": case "objFlowerPatch": case "objSkybloomPatch": case "objSalvage": return { stock: 1 };
    case "objWreck": return { img: 3, imgSpd: 0 }; // the derelict: sprShipDmg's worst quartile, static
    case "objCrate": return { vy: 0 };
    default:
      if (NPC_TYPES.includes(type)) return { t: 0, done: false };
      return {};
  }
}
const NPC_TYPES = ["obj_speech1", "object10", "obj_mayor", "obj_mayorTrade", "object55", "obj_speechTrade", "obj_sacrifice", "obj_crewInfo", "obj_flowers", "obj_harbormaster", "obj_gardener"];
const TRADE_NPCS = ["obj_mayorTrade", "object55", "obj_speechTrade"];
function rnd(a) { return Math.random() * a; }
function irnd(a) { return Math.floor(Math.random() * a); }
function choose(...a) { return a[Math.floor(Math.random() * a.length)]; }

/* ---------- room loading (room.json: tiles + instances, verbatim) ---------- */
let tileCanvas = null;
function loadRoom(name, keepTravel) {
  if (roomName === "rmTravel" && name !== "rmTravel" && !keepTravel) {
    travelSave = ents.filter(e => !e.dead && !["objBullet", "objBullet2", "objRearBullet", "objCrewBullet", "objEBullet", "objECrewBullet", "objBomb", "objEBomb", "objBlast", "objSMLBlast", "objESmlBlast", "objDebris", "objShrapnel", "objCrew"].includes(e.type));
  }
  roomName = name; ents = []; player = null; vessel = null;
  const R = WORLD.rooms[name];
  if (name === "rmTravel" && travelSave) {
    ents = travelSave; travelSave = null;
    vessel = ents.find(e => e.type === "objShip" || e.type === "objShip1" || e.type === "objRowBoat") || null;
  } else {
    for (const [obj, x, y, code] of R.insts) {
      if (obj === "obj_control") continue; // obj_control is persistent (depth -4, persistent:true)
      const e = create(obj, x, y);
      if (code && code.includes("dir=-1")) e.dir = -1; // rmExplore2 player creation code
      if (obj === "objPlayer") player = e;
      if (obj === "objShip" || obj === "objShip1" || obj === "objRowBoat") vessel = e;
    }
    if (name === "rmTravel") { // objShip/create_0.gml globals
      G.hp = 100; G.max_hp = 100; G.max_crew = 9; G.shipnum = 2; if (G.crew < 1) G.crew = 1;
    }
  }
  rebuildSolids();
  // Pre-render tile layer (depth-sorted: higher depth drawn first = behind)
  tileCanvas = document.createElement("canvas"); tileCanvas.width = R.w; tileCanvas.height = R.h;
  const tc = tileCanvas.getContext("2d");
  const tiles = [...R.tiles].sort((a, b) => b[7] - a[7]);
  for (const [x, y, bg, tx, ty, w, h] of tiles) {
    const img = BGIMG[bg]; if (img && img.complete && img.naturalWidth) tc.drawImage(img, tx, ty, w, h, x, y, w, h);
  }
  focusCamera(true);
}
function gotoRoom(name) { loadRoom(name); mode = (name === "rmTravel" || name === "rm_test") ? (name === "rmTravel" ? "ship" : "foot") : "foot"; if (name === "rm_test") mode = "foot"; }

/* ---------- destroy events ---------- */
function burst(e, type, n, props) { for (let i = 0; i < n; i++) { const p = create(type, e.x, e.y, props); p.vx = Math.cos(rnd(Math.PI * 2)) * rnd(type === "objGold" ? 3 : 9); p.vy = Math.sin(rnd(Math.PI * 2)) * rnd(type === "objGold" ? 3 : 9) - (type === "objDebris" ? 2 : 0); } }
function onDestroy(e) {
  switch (e.type) {
    case "objShip": case "objShip1": // objShip/destroy_0.gml
      burst(e, "objShrapnel", 10); burst(e, "objDebris", 25);
      for (let i = 0; i < G.crew; i++) burst(e, "objCrew", 1);
      create("objRowBoat", e.x, e.y); G.shipnum = 0; G.hp = 10; G.max_hp = 10; G.max_crew = 1; G.crew = 1;
      vessel = ents[ents.length - 1]; showMessage("Ship lost! The crew escapes in the rowboat."); break;
    case "objRowBoat": // objRowBoat/destroy_0.gml: rebuild the ship you can afford
      if (G.shipnum === 1) { vessel = create("objShip1", e.x, e.y); G.hp = 20; G.max_hp = 20; G.max_crew = 3; }
      else if (G.shipnum === 2) { vessel = create("objShip", e.x, e.y); G.hp = 100; G.max_hp = 100; G.max_crew = 9; }
      else if (vessel === e) { gameOver = true; }
      break;
    case "objEnemyBomber": burst(e, "objGold", e.goldN); burst(e, "objShrapnel", 5); burst(e, "objDebris", 15); break;
    case "objSmlBoat": burst(e, "objGold", 1 + irnd(5)); burst(e, "objShrapnel", 5); burst(e, "objDebris", 15); break;
    case "objBomb": case "objEBomb": create("objSMLBlast", e.x, e.y); break;
    case "objBullet": case "objBullet2": case "objRearBullet": case "objCrewBullet": case "objEBullet": case "objECrewBullet":
      create("objBlast", e.x, e.y); break;
  }
}

/* ---------- input ---------- */
const keys = {}, pressed = {};
let mouseX = 0, mouseY = 0, clicks = [], rclicks = [];
addEventListener("keydown", e => { if (!keys[e.code]) pressed[e.code] = true; keys[e.code] = true; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault(); if (!started) { started = true; } });
addEventListener("keyup", e => { keys[e.code] = false; });
function canvasPos(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * VW / r.width, y: (ev.clientY - r.top) * VH / r.height }; }
cv.addEventListener("mousemove", e => { const p = canvasPos(e); mouseX = p.x; mouseY = p.y; });
cv.addEventListener("mousedown", e => { started = true; const p = canvasPos(e); (e.button === 2 ? rclicks : clicks).push({ sx: p.x, sy: p.y, wx: p.x + cam.x, wy: p.y + cam.y }); });
cv.addEventListener("contextmenu", e => e.preventDefault());
const K = {
  left: () => keys.KeyA || keys.ArrowLeft, right: () => keys.KeyD || keys.ArrowRight,
  up: () => keys.KeyW || keys.ArrowUp, down: () => keys.KeyS || keys.ArrowDown,
  jumpP: () => pressed.ControlLeft || pressed.ControlRight || pressed.Space,
  fire: () => keys.ControlLeft || keys.ControlRight,
  sP: () => pressed.KeyS || pressed.ArrowDown, wP: () => pressed.KeyW || pressed.ArrowUp,
};

/* ---------- objPlayer step (step_1.gml port; pixel-stepping) ---------- */
function stepPlayer(p) {
  const band = bandAt(roomName, p.y);
  if (p.pickAlarm > 0) { p.pickAlarm--; if (p.pickAlarm === 0) p.pickUp = false; } // alarm_0: pickUp=false
  const wasAir = p.isInAir;
  if (K.right() && !K.left() && !p.pickUp) { p.dir = 1; p.isMoving = true; }
  if (K.left() && !K.right() && !p.pickUp) { p.dir = -1; p.isMoving = true; }
  if (!K.left() && !K.right()) p.isMoving = false;
  if (K.jumpP() && !p.pickUp) { if (solidMeeting(p, 0, 1)) p.vspd = band.jump; }
  // Take-off (W near objtakeOff)
  const pad = nearest(p.x, p.y, ["objtakeOff"], p);
  if (K.wP() && pad && dist(p, pad) <= 32) {
    if (p.takeOff === 0) p.takeOff = 1;
    else if (!p.isInAir) { gotoRoom("rmTravel"); mode = "ship"; showMessage("Take-off! Back to the ship."); return; }
  }
  if (K.sP()) {
    if (p.takeOff === 1) p.takeOff = 0;
    if (!p.pickUp && !p.isInAir && !p.isMoving) {
      const pk = nearest(p.x, p.y, ["objPickUpPar", "objFlowerPatch", "objSkybloomPatch", "objSalvage", "objSkull", "objskullTake", ...NPC_TYPES], p);
      if (pk && dist(p, pk) <= 24) { p.pickUp = true; p.pickAlarm = 16; interact(p, pk); }
    }
  }
  // Horizontal: repeat(spd) 1px steps, slope up/down (original algorithm)
  if (p.isMoving) {
    const spd = p.isInAir ? band.airSpd : p.spd;
    for (let i = 0; i < spd; i++) {
      if (!solidMeeting(p, Math.sign(p.dir), 0)) {
        p.x += Math.sign(p.dir);
        if (!solidMeeting(p, 0, 1) && !p.isInAir) p.y += 1; // down slope
      } else if (!solidMeeting(p, Math.sign(p.dir), -1)) { p.x += Math.sign(p.dir); p.y -= 1; } // up slope
    }
  }
  // Vertical: repeat(abs(vspd)) 1px steps, sub-pixel fraction carried
  p.frac += p.vspd; const steps = Math.trunc(p.frac); p.frac -= steps;
  for (let i = 0; i < Math.abs(steps); i++) {
    if (!solidMeeting(p, 0, Math.sign(steps))) { p.y += Math.sign(steps); if (solidMeeting(p, 0, -1)) p.vspd = 0; }
    else { p.vspd = 0; break; }
  }
  if (!solidMeeting(p, 0, 1)) { p.isInAir = true; p.vspd += p.grav * band.grav; if (p.vspd > (band.name === "THICK AIR" ? 6 : 20)) p.vspd = band.name === "THICK AIR" ? 6 : 20; }
  else { p.isInAir = false; p.vspd = 0; }
  if (wasAir && !p.isInAir) p.frac = 0;
  G.trade = !!nearest(p.x, p.y, TRADE_NPCS, p) && dist(p, nearest(p.x, p.y, TRADE_NPCS, p)) <= 24;
  if (p.y > WORLD.rooms[roomName].h + 64) { const s = WORLD.rooms[roomName].insts.find(i => i[0] === "objPlayer"); if (s) { p.x = s[1]; p.y = s[2]; p.vspd = 0; } }
}
function interact(p, o) {
  if (NPC_TYPES.includes(o.type)) { advanceSpeech(o); return; }
  if (o.type === "objFlowerPatch" && o.stock > 0) { o.stock--; item_add(2, 1); showMessage("Picked a flower."); if (o.stock <= 0) destroy(o); return; }
  if (o.type === "objSkybloomPatch" && o.stock > 0) { o.stock--; item_add(14, 1); showMessage("Picked a Skybloom."); if (o.stock <= 0) destroy(o); return; }
  if (o.type === "objSalvage" && o.stock > 0) { o.stock--; item_add(15, 1); showMessage("Salvaged a chunk of sky-metal."); if (o.stock <= 0) destroy(o); return; }
  if (o.type === "objskullTake" && o.stock > 0) { o.stock--; item_add(10, 1); showMessage("Took a skull."); if (o.stock <= 0) destroy(o); return; }
  if (o.type === "objSkull" && o.stock > 0) { // objSkull GML adds item 6 (labelled "skull" in its comment; id 6 is Bomb in scr_items — original quirk, kept)
    if (inventory_space() > 0) { o.stock--; item_add(6, 1); showMessage("Picked up... a bomb? (original adds item 6)"); if (o.stock <= 0) destroy(o); }
    else showMessage("Your inventory is full!"); return;
  }
}
function advanceSpeech(o) {
  const lines = WORLD.texts[o.type] || [];
  o.t++;
  if (o.t > lines.length) { o.done = true; destroy(o); completeTrade(o); }
}
function completeTrade(o) {
  // EXPANSION: the harbormaster marks the chart when his dialogue completes
  // (not a trade — runs even when G.traded is 0).
  if (o.type === "obj_harbormaster") {
    if (!G.mapMarked) { G.mapMarked = true; showMessage("Chart marked: Garden Isle low in the Thick Air (south dock), the Derelict high in the Thin Air (north dock). F = compass."); }
    return;
  }
  if (!G.traded) return;
  if (o.type === "obj_speechTrade") { // the tribe trader's table
    const n = G.tradestock;
    if (G.tradeItem === 14) { // EXPANSION: Skybloom sells for 2 dubloons each
      item_remove(14, n); item_add(1, n * 2); G.traded = 0; G.tradestock = 0; showMessage("Sold " + n + " Skybloom for " + (n * 2) + " dubloons.");
    } else if (G.tradeItem === 15) { // EXPANSION: Salvage sells for 3 dubloons each
      item_remove(15, n); item_add(1, n * 3); G.traded = 0; G.tradestock = 0; showMessage("Sold " + n + " Salvage for " + (n * 3) + " dubloons.");
    } else { // flowers -> coal, 1:1 (mirrors mayorTrade pattern)
      item_add(9, n); G.traded = 0; G.tradestock = 0; showMessage("Traded " + n + " flowers for " + n + " coal.");
    }
  } else if (o.type === "obj_mayorTrade" || o.type === "object55") { // obj_mayorTrade/keypress_83.gml
    G.traded = 0;
    if (G.tradeItem === 14) { // EXPANSION: the mayor's second chain — 5 Skybloom -> Double Cannon
      if (G.tradestock >= 5) { item_remove(14, 5); item_add(11, 1); G.tradestock = 0; showMessage("The mayor trades: 5 Skybloom for a Double Cannon!"); }
      else showMessage("The mayor wants 5 Skybloom for his Double Cannon.");
    } else if (G.tradeItem === 15) { // EXPANSION: 8 Salvage -> Metal Shield
      if (G.tradestock >= 8) { item_remove(15, 8); item_add(7, 1); G.tradestock = 0; showMessage("The mayor trades: 8 Salvage for a Metal Shield!"); }
      else showMessage("The mayor wants 8 Salvage for his Metal Shield.");
    } else if (G.tradestock >= 10) { item_add(5, 1); item_remove(9, 10); G.tradestock = 0; showMessage("Traded 10 coal for a Cannon!"); }
    else showMessage("You do not have enough coal.");
  }
}

/* ---------- vessels: objShip / objShip1 / objRowBoat (step_1.gml port) ---------- */
function stepVessel(v) {
  const band = bandAt(roomName, v.y);
  const spdMult = v.kind === "ship" && G.hp <= 10 ? 0.5 : 1; // repair=1 -> SPEED halves (draw_0 sets repair when hp<=10)
  const SPEED = Math.max(1, Math.round(v.SPEED * spdMult * (band.name === "THIN AIR" ? 0.8 : band.name === "THICK AIR" ? 1.15 : 1)));
  const blocked = (dx, dy) => solidMeeting(v, dx, dy);
  if (!K.up() && !K.down()) v.angle = 0;
  if (K.up()) for (let i = 0; i < SPEED; i++) { if (!blocked(0, -1)) { v.y -= 1; v.angle = v.dir === 1 ? -40 : 40; } }
  if (K.down()) for (let i = 0; i < SPEED; i++) { if (!blocked(0, 1)) { v.y += 2; v.angle = v.dir === 1 ? 40 : -40; } }
  if (K.right() && !K.left()) for (let i = 0; i < SPEED; i++) { if (!blocked(1, 0)) { v.x += 1; v.dir = 1; } }
  if (K.left() && !K.right()) for (let i = 0; i < SPEED; i++) { if (!blocked(-1, 0)) { v.x -= 1; v.dir = -1; } }
  if (keys.Space) { // reverse thrust (objShip step_1 space block)
    if (v.dir === 1) { if (!blocked(-1, 0)) v.x -= 3; } else if (!blocked(1, 0)) v.x += 3;
  }
  if (!blocked(v.dir, 0)) v.x += v.dir; // idle cruise: engine always pushes forward 1/step
  // Air band drift (EXPANSION): thin air sinks unpowered vessels, thick air buoys them
  if (!K.up() && !K.down() && band.sink !== 0) {
    v.sinkAcc = (v.sinkAcc || 0) + band.sink * (v.kind === "rowboat" ? 1.6 : 1);
    const s = Math.trunc(v.sinkAcc); v.sinkAcc -= s;
    for (let i = 0; i < Math.abs(s); i++) { if (!blocked(0, Math.sign(s))) v.y += Math.sign(s); else break; }
  }
  const R = WORLD.rooms[roomName];
  v.x = Math.max(20, Math.min(R.w - 20, v.x)); v.y = Math.max(20, Math.min(R.h - 20, v.y));
  v.imgSpd = (K.up() || K.down() || K.left() || K.right()) ? 1 : 0.25; // "slow engine down" when no key
  // --- firing (player cannon by equipped weapon; objShip step_1) ---
  if (v.shootCd > 0) v.shootCd--;
  const canShoot = v.shootCd <= 0;
  const fireHeld = v.kind === "rowboat" ? (pressed.ControlLeft || pressed.ControlRight) : K.fire();
  if (fireHeld && canShoot && G.equip[0]) {
    if (G.atk === 30) { spawnBullet("objBullet", v); v.shootCd = v.kind === "rowboat" ? 30 : 15; }
    else if (G.atk === 32 && v.kind !== "rowboat") { spawnBullet("objRearBullet", v); v.shootCd = 15; }
    else if (G.atk === 40) { spawnBomb(v); v.shootCd = v.kind === "rowboat" ? 50 : 35; }
    else if (G.atk === 35 && v.kind !== "rowboat") { spawnBullet("objBullet", v); spawnBullet("objBullet2", v); v.shootCd = 20; }
  }
  // --- crew auto-fire (objShip step_1 + alarm_1 ports) ---
  if (v.crewCd > 0) v.crewCd--;
  if (v.kind !== "rowboat" && v.crewShoot !== false) {
    const foe = nearest(v.x, v.y, ENEMY_TYPES, v);
    if (foe && dist(v, foe) <= 128 && v.crewCd <= 0) {
      for (let i = 0; i < Math.max(0, G.crew - 1); i++) spawnCrewBullet(v, foe, false);
      v.crewCd = 60; lastCombatFrame = frame;
    }
    const boat = nearest(v.x, v.y, ["objSmlBoat"], v);
    if (boat && dist(v, boat) <= 64 && v.crewCd <= 0) { spawnCrewBullet(v, boat, false); v.crewCd = 20; lastCombatFrame = frame; }
  }
  if (G.hp <= 0 && v.kind !== "rowboat") destroy(v);
  if (v.kind === "rowboat" && v.hp <= 0) destroy(v);
}
function spawnBullet(type, v) {
  const b = create(type, v.x, v.y + (type === "objBomb" ? 8 : 0));
  const band = bandAt(roomName, v.y);
  if (type === "objBullet") {
    if (!K.up() && !K.down()) { b.vx = 8 * v.dir; b.vy = -5; }
    else if (K.up()) { b.vx = 4 * v.dir; b.vy = -11; }
    else { b.vx = 8 * v.dir; b.vy = -2; }
  } else if (type === "objBullet2") { b.vx = 8 * v.dir; b.vy = -7; }
  else if (type === "objRearBullet") { b.vx = -8 * v.dir; b.vy = -5; }
  b.grav = band.projGrav; return b;
}
function spawnBomb(v) { const b = create("objBomb", v.x, v.y + 8); b.vx = v.dir === 1 ? -3 : 3; b.vy = -5; b.grav = bandAt(roomName, v.y).projGrav; b.dir = v.dir; return b; }
function spawnCrewBullet(from, target, enemy) {
  const b = create(enemy ? "objECrewBullet" : "objCrewBullet", from.x + choose(-4, -8, -18, 16, 8, 4) * (enemy ? 0.3 : 1), from.y);
  const tx = target.x + choose(-6, -3, 0, 3, 6), ty = target.y - choose(2, 6, 10);
  const d = Math.hypot(tx - b.x, ty - b.y) || 1, sp = enemy ? choose(5, 6, 7) : choose(4, 5, 6);
  b.vx = (tx - b.x) / d * sp; b.vy = (ty - b.y) / d * sp; b.imgSpd = 0; b.xscale = 0.5; b.yscale = 0.5; return b;
}

/* ---------- enemies: objEnemyBomber + objSmlBoat (flocking + raids) ---------- */
function steer(e, tx, ty, spd, avoidBlocks) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  const nx = e.x + Math.cos(a) * spd, ny = e.y + Math.sin(a) * spd;
  const save = { x: e.x, y: e.y };
  e.x = nx; e.y = ny;
  if (avoidBlocks && solidMeeting(e, 0, 0)) { e.x = save.x; if (solidMeeting(e, 0, 0)) { e.x = nx; e.y = save.y; if (solidMeeting(e, 0, 0)) { e.x = save.x; e.y = save.y; } } }
  e.ang = a * 180 / Math.PI;
}
function flock(e, fleeTypes, fleeR) { // alarm_0 port (simplified): separation + flee projectiles + ship avoidance for bombers
  let ax = 0, ay = 0, n = 0;
  for (const o of ents) {
    if (o === e || o.dead) continue;
    const d = dist(e, o);
    if (o.type === e.type && d < 32) { ax += (e.x - o.x) / (d + 1) * (d < 16 ? 2 : 1); ay += (e.y - o.y) / (d + 1) * (d < 16 ? 2 : 1); n++; }
    else if (fleeTypes.includes(o.type) && d < fleeR) { ax += (e.x - o.x) / (d + 1) * 5; ay += (e.y - o.y) / (d + 1) * 5; n++; }
    else if (e.type === "objEnemyBomber" && o.type === "objGold" && d < 50) { ax += Math.cos(o.ang || 0); ay += Math.sin(o.ang || 0); n++; }
  }
  if (n) { e.ang = Math.atan2(ay, ax) * 180 / Math.PI; }
}
function stepBomber(e) {
  e.x += Math.cos(e.ang * Math.PI / 180) * 3; e.y += Math.sin(e.ang * Math.PI / 180) * 3;
  wrapRoom(e);
  if (solidMeeting(e, 0, 0)) { // push out of blocks (collision_objBlock16 port)
    const c = nearest(e.x, e.y, ["objBlock16"], e); if (c) { const a = Math.atan2(e.y - c.y, e.x - c.x); e.x += Math.cos(a); e.y += Math.sin(a); }
    e.ang += 180;
  }
  if (--e.flockCd <= 0) { e.flockCd = 20; flock(e, ["objBullet", "objBullet2", "objRearBullet", "objCrewBullet", "objBomb"], 64); }
  if (vessel && G.shipnum !== 0) {
    const d = dist(e, vessel);
    if (d < 200 && d > 64) steer(e, vessel.x, vessel.y - 64, 1, true);
    else if (d < 32) steer(e, vessel.x, vessel.y, -2, true);
    if (e.shootCd > 0) e.shootCd--;
    if (d <= 64 && e.canShoot && e.shootCd <= 0) { const b = create("objEBomb", e.x, e.y); b.vy = -5; b.vx = 0; b.grav = bandAt(roomName, e.y).projGrav; e.shootCd = 50; lastCombatFrame = frame; }
    if (e.crewCd > 0) e.crewCd--;
    if (d <= 128 && e.crewShoot && e.crewCd <= 0) { for (let i = 0; i < e.crew; i++) spawnCrewBullet(e, vessel, true); e.crewCd = 60; lastCombatFrame = frame; }
  }
  if (e.hp <= 0) destroy(e);
}
function stepSmlBoat(e) {
  e.x += Math.cos(e.ang * Math.PI / 180) * e.spd; e.y += Math.sin(e.ang * Math.PI / 180) * e.spd;
  wrapRoom(e);
  if (solidMeeting(e, 0, 0)) { const c = nearest(e.x, e.y, ["objBlock16"], e); if (c) { const a = Math.atan2(e.y - c.y, e.x - c.x); e.x += Math.cos(a) * 2; e.y += Math.sin(a) * 2; } e.ang += 180; }
  if (--e.flockCd <= 0) { e.flockCd = 20; flock(e, ["objBullet", "objBullet2", "objRearBullet", "objCrewBullet", "objBomb"], 32); }
  const dock = nearest(e.x, e.y, ["objEnemyDock"], e);
  if (e.hp < 10 && dock) steer(e, dock.x, dock.y, 4, true); // retreat to enemy dock when hurt
  else if (vessel && G.shipnum !== 0) {
    const d = dist(e, vessel);
    if (d < 200 && d > 128) steer(e, vessel.x, vessel.y - 8, 4, false);
    if (e.shootCd > 0) e.shootCd--;
    if (d <= 64 && e.canShoot && e.shootCd <= 0) {
      const b = create("objEBullet", e.x, e.y); b.vx = vessel.x >= e.x ? 6 : -6; b.vy = -4; b.grav = bandAt(roomName, e.y).projGrav; b.imgSpd = 0; e.shootCd = 50; lastCombatFrame = frame;
    }
    if (e.crewCd > 0) e.crewCd--;
    if (d <= 128 && e.crewShoot && e.crewCd <= 0) { for (let i = 0; i < e.crew; i++) spawnCrewBullet(e, vessel, true); e.crewCd = 120; lastCombatFrame = frame; }
  }
  if (e.hp <= 0) destroy(e);
}
function wrapRoom(e) { const R = WORLD.rooms[roomName]; if (e.x < -2) e.x = R.w + 2; if (e.x > R.w + 2) e.x = -2; if (e.y < -2) e.y = R.h + 2; if (e.y > R.h + 2) e.y = -2; }

/* ---------- projectiles / particles / misc steps ---------- */
function damageEnemy(e, dmg) { e.hp -= dmg; lastCombatFrame = frame; }
function stepProjectile(e) {
  const enemySide = ["objEBullet", "objECrewBullet", "objEBomb"].includes(e.type);
  if (e.grav !== undefined) e.vy += e.grav; // crew bullets fly straight (move_towards_point, no gravity in the GML)
  e.x += e.vx; e.y += e.vy;
  if (e.type === "objBomb" || e.type === "objEBomb") { e.angle += e.dir === 1 ? -5 : 5; if (--e.fuse <= 0) { destroy(e); return; } }
  if (solidMeeting(e, 0, 0)) { destroy(e); return; }
  if (enemySide) {
    if (vessel && overlap(bbox(e), bbox(vessel))) {
      if (e.type === "objEBullet") { G.hp -= 2; if (G.crew > 1) { const c = choose(0, 0, 1, 2); G.crew = Math.max(1, G.crew - c); } }
      else if (e.type === "objECrewBullet") G.hp -= 1;
      lastCombatFrame = frame; destroy(e); return;
    }
  } else {
    const foe = nearest(e.x, e.y, ENEMY_TYPES, e);
    if (foe && overlap(bbox(e), bbox(foe))) {
      damageEnemy(foe, e.type === "objCrewBullet" ? (foe.type === "objEnemyBomber" ? 1 : 0.5) : 2);
      destroy(e); return;
    }
  }
  const R = WORLD.rooms[roomName];
  if (e.x < -32 || e.y < -32 || e.x > R.w + 32 || e.y > R.h + 32) e.dead = true; // outside room
}
function stepParticle(e) { // objGold / objDebris / objShrapnel / objCrew (ejected crew)
  const band = bandAt(roomName, e.y);
  let grav = e.type === "objGold" ? band.projGrav : 0.8;
  if (e.type === "objGold" && G.equip[1] === 13 && vessel && dist(e, vessel) <= 96) { // Dubloon Magnet (objGold/step_1)
    const a = Math.atan2(vessel.y - e.y, vessel.x - e.x); e.vx += Math.cos(a) * 0.4; e.vy += Math.sin(a) * 0.4;
  } else e.vy += grav;
  e.x += e.vx; e.y += e.vy;
  if (solidMeeting(e, 0, 0)) { e.y -= Math.sign(e.vy) || -1; e.vy *= -0.4; e.vx *= 0.8; if (e.type === "objGold") { e.vx *= 0.9; } }
  if (e.type === "objCrew") e.angle += e.spin === 1 ? -5 : 5;
  if (e.type === "objGold" && vessel && roomName === "rmTravel" && overlap(bbox(e), bbox(vessel))) { item_add(1, 1); e.dead = true; return; }
  if (e.type === "objGold" && anyEnemyTouch(e)) { e.dead = true; return; } // enemies steal gold (collision_objEnemyPar)
  if (--e.life <= 0) e.dead = true;
}
function anyEnemyTouch(e) { const f = nearest(e.x, e.y, ENEMY_TYPES, e); return f && overlap(bbox(e), bbox(f)); }
function stepShadow(e) { // objShadow: alpha by player distance / line of sight (simplified LOS)
  if (!player) { e.alpha = 0.75; return; }
  const d = dist(e, player);
  e.alpha = d <= 32 ? 0.4 : d <= 64 ? 0.5 : d <= 96 ? 0.6 : 0.75;
}

/* ---------- docks (collision_objShip events) ---------- */
const DOCK_DEST = { objDock: "rmExplore", objDock2: "rmExplore2", objDock3: "rmExplore3", objEnemyDock: "rmExplore4", objDock4: "rmGarden", objDock5: "rmDerelict" };
function checkDocks(v) {
  for (const d of ents) {
    if (d.dead || !DOCK_DEST[d.type]) continue;
    if (overlap(bbox(v), bbox(d))) {
      if (d.type === "objDock" && nearest(v.x, v.y, ["objSmlBoat"], v) && dist(v, nearest(v.x, v.y, ["objSmlBoat"], v)) <= 128) {
        showMessage("You cannot dock when enemies are around"); v.y -= 32; return;
      }
      for (const g of ents) if (g.type === "objGold") g.dead = true; // with objGold instance_destroy (dock events)
      v.y -= 32;
      gotoRoom(DOCK_DEST[d.type]); mode = "foot";
      showMessage("Docked: " + DOCK_DEST[d.type] + " — explore on foot. W at a take-off pad returns to the ship.");
      return;
    }
  }
}

/* ---------- obj_control: crew repair alarm + debug spawns + raids (EXPANSION) ---------- */
let healTimer = 50;
function stepControl() {
  G.atk = G.base_attack + (ITEMS.atk[G.equip[0]] || 0);
  G.def = G.base_defense + (ITEMS.def[G.equip[1]] || 0);
  for (let k = 0; k < G.invH; k++) for (let i = 0; i < G.invW; i++) if (!G.stack[k][i]) G.inventory[k][i] = 0;
  // Crew repair (obj_control/alarm_0): cycle length shrinks as crew grows.
  // EXPANSION rule: repairs only while out of combat (no enemy fire for 3s).
  if (--healTimer <= 0) {
    healTimer = G.crew <= 2 ? 150 : G.crew <= 5 ? 100 : G.crew <= 10 ? 50 : G.crew <= 15 ? 25 : G.crew <= 25 ? 15 : 5;
    if (G.hp <= G.max_hp - 1 && G.crew >= 2 && frame - lastCombatFrame > 90 && (mode === "ship")) G.hp += 1;
  }
  if (pressed.Digit1 && vessel) create("objSmlBoat", mouseX + cam.x, mouseY + cam.y); // obj_control/step_2 debug spawns
  if (pressed.Digit2 && vessel) create("objEnemyBomber", mouseX + cam.x, mouseY + cam.y);
  if (pressed.Digit3) { gotoRoom("rm_test"); } // dev access to the test room (EXPANSION)
  // EXPANSION: enemy raids on the travel hub
  if (roomName === "rmTravel" && started && !TEST) {
    if (--raidTimer <= 0) {
      raidTimer = 45 * 30;
      const docks = ents.filter(e => e.type === "objEnemyDock");
      const foeCount = ents.filter(e => isEnemy(e) && !e.dead).length;
      if (docks.length && foeCount < 16) {
        const d = choose(...docks);
        if (Math.random() < 0.5) create("objEnemyBomber", d.x, d.y); else { create("objSmlBoat", d.x + 16, d.y); create("objSmlBoat", d.x - 16, d.y); }
        showMessage("Raiders incoming from an enemy dock!");
      }
    }
  }
}

/* ---------- per-step dispatch ---------- */
const PROJECTILES = ["objBullet", "objBullet2", "objRearBullet", "objCrewBullet", "objEBullet", "objECrewBullet", "objBomb", "objEBomb"];
let CREATED = 0; const _create = create; create = function (t, x, y, p) { CREATED++; return _create(t, x, y, p); };
function stepAll() {
  frame++;
  stepControl();
  if (mode === "foot" && player && !player.dead) stepPlayer(player);
  if (mode === "ship" && vessel && !vessel.dead) { stepVessel(vessel); if (!vessel.dead) checkDocks(vessel); }
  for (const e of [...ents]) {
    if (e.dead) continue;
    e.t++;
    if (e.imgSpd) e.img += e.imgSpd;
    switch (e.type) {
      case "objEnemyBomber": stepBomber(e); break;
      case "objSmlBoat": stepSmlBoat(e); break;
      case "objGold": case "objDebris": case "objShrapnel": case "objCrew": stepParticle(e); break;
      case "objShadow": stepShadow(e); break;
      case "objBlast": if (--e.life <= 0) e.dead = true; break;
      case "objSMLBlast": case "objESmlBlast":
        if (e.t === 1) { // explosion moment: area damage (collision ports)
          if (e.type === "objESmlBlast") burst(e, "objShrapnel", 5);
          if (vessel && dist(e, vessel) <= 40) { G.hp -= 5; lastCombatFrame = frame; }
          for (const f of ents) if (isEnemy(f) && !f.dead && dist(e, f) <= 40) damageEnemy(f, 5);
        }
        if (--e.life <= 0) e.dead = true; break;
      case "objCrate": // objCrate/step_0: falls until a block or another crate
        if (!solidMeeting(e, 0, 1) && !placeMeeting(e, 0, 1, ["objCrate"])) e.y += 2; break;
      case "obj_speechTrade": G.canTrade = (item_amount(2) >= 1 || item_amount(14) >= 1 || item_amount(15) >= 1) ? 1 : 0; break;
      case "obj_mayorTrade": case "object55": G.canTrade = (item_amount(9) >= 1 || item_amount(14) >= 1 || item_amount(15) >= 1) ? 1 : 0; break;
      default:
        if (PROJECTILES.includes(e.type)) stepProjectile(e);
    }
  }
  ents = ents.filter(e => !e.dead);
  if (vessel && vessel.dead) vessel = ents.find(e => ["objShip", "objShip1", "objRowBoat"].includes(e.type)) || vessel;
  // clicks (mouse events are view-space; convert in handlers)
  while (clicks.length) handleClick(clicks.shift(), false);
  while (rclicks.length) handleClick(rclicks.shift(), true);
  for (const k in pressed) delete pressed[k];
  if (toastT > 0) toastT--;
  focusCamera(false);
}
function focusCamera(snap) {
  const R = WORLD.rooms[roomName]; if (!R) return;
  const tgt = mode === "ship" ? vessel : player; if (!tgt) return;
  let tx = tgt.x - VW / 2, ty = tgt.y - VH / 2;
  tx = R.w <= VW ? (R.w - VW) / 2 : Math.max(0, Math.min(R.w - VW, tx));
  ty = R.h <= VH ? (R.h - VH) / 2 : Math.max(0, Math.min(R.h - VH, ty));
  if (snap) { cam.x = tx; cam.y = ty; } else { cam.x += (tx - cam.x) * 0.35; cam.y += (ty - cam.y) * 0.35; }
}

/* ---------- mouse: inventory (obj_control mouse_53/54/56) + world buttons ---------- */
function invCellAt(sx, sy) { // inventory panel drawn at (0,7); cells 32px, x0=7, y0=11, dy=33
  if (!G.invShow) return null;
  for (let k = 0; k < G.invH; k++) for (let i = 0; i < G.invW; i++) {
    const x = 7 + i * 32, y = 11 + k * 33;
    if (sx >= x && sx < x + 32 && sy >= y && sy < y + 32) return { i, k };
  } return null;
}
function equipCellAt(sx, sy) {
  if (!G.equipShow) return null;
  for (let j = 0; j < 2; j++) { const x = 232 + j * 34, y = 32; if (sx >= x && sx < x + 32 && sy >= y && sy < y + 32) return j; }
  return null;
}
function openMenu(kind, i, k) { // scripts/scr_*_menu.gml
  G.menuShow = true; G.menuX = mouseX; G.menuY = mouseY; G.menuSelH = i; G.menuSelV = k; G.menuCtx = kind;
  if (kind === "equip") G.menu = ["Unequip"];
  else {
    const t = ITEMS.type[G.inventory[k][i]];
    G.menu = t === "consumable" ? ["Consume", "Drop", "Examine", "Trade"] : (t === "weapon" || t === "shield") ? ["Equip", "Examine", "Drop"] : ["Trade", "Examine", "Drop"];
  }
}
function menuAction(act) {
  const k = G.menuSelV, i = G.menuSelH;
  if (G.menuCtx === "equip") {
    if (act === "Unequip") {
      for (let kk = 0; kk < G.invH; kk++) for (let jj = 0; jj < G.invW; jj++)
        if (!G.inventory[kk][jj]) { G.inventory[kk][jj] = G.equip[i]; G.stack[kk][jj] += 1; G.equip[i] = 0; G.menuShow = false; return; }
      showMessage("Your inventory is full!");
    }
    return;
  }
  const id = G.inventory[k][i]; if (!id) return;
  if (act === "Examine") showMessage(ITEMS.name[id] + " — " + ITEMS.info[id]);
  if (act === "Drop") G.stack[k][i] = 0;
  if (act === "Consume") {
    if (G.hp !== G.max_hp) { G.hp = Math.min(G.hp + (ITEMS.hp[id] || 0), G.max_hp); G.stack[k][i] = 0; }
    else showMessage("Your health is already full!");
  }
  if (act === "Trade") {
    G.tradeItem = id; G.tradestock = G.stack[k][i];
    if (G.trade && G.canTrade) { G.traded = 1; const npc = nearest(player.x, player.y, TRADE_NPCS, player); if (npc) completeTrade(npc); }
    else showMessage("No one is around to trade this.");
  }
  if (act === "Equip") {
    const t = ITEMS.type[id], slot = t === "weapon" ? 0 : 1;
    const change = G.inventory[k][i]; G.inventory[k][i] = G.equip[slot]; if (!G.inventory[k][i]) G.stack[k][i] = 0; else G.stack[k][i] = 1;
    G.equip[slot] = change;
  }
  G.menuShow = false;
}
function handleClick(c, right) {
  const sx = c.sx, sy = c.sy;
  if (G.menuShow) {
    for (let i = 0; i < G.menu.length; i++) {
      const y = G.menuY + i * 15;
      if (sx >= G.menuX && sx < G.menuX + 64 && sy >= y && sy < y + 16) { menuAction(G.menu[i]); return; }
    }
    G.menuShow = false; return;
  }
  const cell = invCellAt(sx, sy), eq = equipCellAt(sx, sy);
  if (right) {
    if (eq !== null && G.equip[eq]) { openMenu("equip", eq, 0); return; }
    if (cell && G.inventory[cell.k][cell.i] && !G.mouseSelObj) { openMenu("inv", cell.i, cell.k); return; }
    return;
  }
  if (cell) { // pick up / swap (mouse_53 + mouse_56 ports)
    if (!G.mouseSelObj && G.inventory[cell.k][cell.i]) {
      G.mouseSelObj = G.inventory[cell.k][cell.i]; G.mouseSelAmt = G.stack[cell.k][cell.i];
      G.mouseSelPH = cell.i; G.mouseSelPV = cell.k; G.stack[cell.k][cell.i] = 0;
    } else if (G.mouseSelObj) {
      const tmpO = G.inventory[cell.k][cell.i], tmpA = G.stack[cell.k][cell.i];
      G.inventory[cell.k][cell.i] = G.mouseSelObj; G.stack[cell.k][cell.i] = G.mouseSelAmt;
      G.inventory[G.mouseSelPV][G.mouseSelPH] = tmpO; G.stack[G.mouseSelPV][G.mouseSelPH] = tmpA;
      G.mouseSelObj = 0; G.mouseSelAmt = 0;
    }
    return;
  }
  if (G.invShow || G.equipShow) return;
  // world buttons (mouse_4 events): hire crew, fill crew, sword button, item objects
  const wx = sx + cam.x, wy = sy + cam.y;
  for (const e of ents) {
    if (e.dead) continue;
    const bb = bbox(e); if (wx < bb.l || wx > bb.r || wy < bb.t || wy > bb.b) continue;
    if (e.type === "objHireCrew") { // objHireCrew/mouse_4.gml
      if (item_amount(1) >= 10) { if (G.crew < G.max_crew) { item_remove(1, 10); G.crew += 1; showMessage("Hired a crew member. Crew: " + G.crew); } else showMessage("Your ship can only hold " + G.max_crew + " people."); }
      else showMessage("You do not have enough gold."); return;
    }
    if (e.type === "objFillCrew") { // objFillCrew/mouse_4.gml
      const cost = 10 * G.max_crew - 10;
      if (item_amount(1) >= cost && G.crew < G.max_crew) { item_remove(1, cost); G.crew = G.max_crew; showMessage("You have hired " + (G.max_crew - 1) + " people."); }
      else showMessage("You do not have enough gold."); return;
    }
    if (e.type === "obj_sword_button") { // buys item 6 for 10 dubloons (mouse_4.gml)
      if (item_amount(1) >= 10) { if (inventory_space() > 0 || item_amount(1) === 10) { item_remove(1, 10); item_add(6, 1); showMessage("Bought a Bomb."); } else showMessage("You do not have enough space."); }
      else showMessage("You do not have enough gold."); return;
    }
    if (e.type === "obj_object") { item_add(e.img | 0, 1); destroy(e); return; }
    if (e.type === "objRowBoat" && e === vessel) { /* handled by Space below */ }
  }
  // Rowboat: Space buys the small ship (objRowBoat/keypress_32.gml)
}
addEventListener("keydown", e => {
  if (e.code === "KeyQ") { G.invShow = !G.invShow; G.menuShow = false; if (G.mouseSelObj) { G.inventory[G.mouseSelPV][G.mouseSelPH] = G.mouseSelObj; G.stack[G.mouseSelPV][G.mouseSelPH] = G.mouseSelAmt; G.mouseSelObj = 0; } }
  if (e.code === "KeyE") { G.equipShow = !G.equipShow; G.menuShow = false; }
  if (e.code === "KeyC") { walkVariant = (walkVariant + 1) % 3; }
  if (e.code === "KeyR") { initGame(); }
  if (e.code === "Enter") { item_add(1, 100); item_add(5, 1); item_add(6, 1); item_add(11, 1); item_add(12, 1); item_add(13, 1); showMessage("Debug grant (obj_control keypress_13)."); } // obj_control/keypress_13.gml
  if (e.code === "Space" && mode === "ship" && vessel && vessel.kind === "rowboat" && roomName === "rmTravel") {
    if (item_amount(1) >= 10) { item_remove(1, 10); G.shipnum = 1; destroy(vessel); showMessage("Bought the small ship!"); }
    else showMessage("You do not have enough gold.");
  }
});

/* ---------- drawing ---------- */
function drawSprite(name, idx, x, y, xs, ys, ang, alpha) {
  const img = sprImg(name, idx); if (!img || !img.complete || !img.naturalWidth) return;
  const m = SPR(name); if (!m) return;
  ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.translate(Math.round(x - cam.x), Math.round(y - cam.y));
  if (ang) ctx.rotate(ang * Math.PI / 180);
  ctx.scale(xs || 1, ys || 1);
  ctx.drawImage(img, -m.ox, -m.oy);
  ctx.restore();
}
function drawText(txt, x, y, color, size, align) {
  ctx.fillStyle = color || "#fff"; ctx.font = (size || 12) + "px monospace"; ctx.textAlign = align || "left";
  String(txt).split("\n").forEach((ln, i) => ctx.fillText(ln, x, y + i * ((size || 12) + 3)));
}
const SKIP_DRAW = ["objEnemyPar", "objProjectilePar", "objEnemyProjectile", "objPickUpPar", "objTradePar", "obj_control", "object32", "objBlock16", "objBlock32"];
function drawEnt(e) {
  if (e.visible === false) return; // object.json visible:false (blocks, object16, objtakeOff) — invisible in the original; draw-only, physics untouched
  if (SKIP_DRAW.includes(e.type)) return; // parents are abstract
  switch (e.type) {
    case "objPlayer": {
      let spr, idx = 0;
      if (e.pickUp) { spr = "sprPlayerPickUp"; }
      else if (e.isInAir) spr = e.vspd < 0 ? "sprPlayerJump" : "sprPlayerFall";
      else if (e.isMoving) { spr = ["sprPlayer", "sprPlayer1", "sprPlayer2"][walkVariant]; idx = e.img; }
      else spr = "sprPlayerIdle";
      drawSprite(spr, idx, e.x, e.y, e.dir, 1, 0, 1);
      if (e.takeOff === 1 && !e.isInAir) { drawSprite("spr_takeoff", 0, e.x, e.y - 32, 1, 1, 0, 1); }
      const pad = nearest(e.x, e.y, ["objtakeOff"], e);
      if (pad && dist(e, pad) <= 32 && !e.isInAir) {
        drawText("Take-off", e.x - cam.x + 16, e.y - cam.y - 64, "#fff", 11);
        drawSprite("spr_takeoff", 0, e.x, e.y - 56, 1, 1, 0, 1);
        drawText("Stay here", e.x - cam.x + 16, e.y - cam.y + 16, "#fff", 11);
      }
      const pk = nearest(e.x, e.y, ["objPickUpPar", "objFlowerPatch", "objSkybloomPatch", "objSalvage", "objSkull", "objskullTake"], e);
      if (pk && dist(e, pk) <= 24) drawText("Examine (S)", e.x - cam.x + 16, e.y - cam.y + 16, "#fff", 11);
      break;
    }
    case "objShip": {
      const dmg = G.hp < G.max_hp;
      if (!dmg) drawSprite("sprShip", e.img, e.x, e.y, e.dir, 1, e.angle, 1);
      else drawSprite("sprShipDmg", Math.min(3, Math.floor((1 - G.hp / G.max_hp) * 4)), e.x, e.y, e.dir, 1, e.angle, 1);
      break;
    }
    case "objShip1": drawSprite("sprSBoat", 0, e.x, e.y, e.dir, 1, e.angle, 1); break;
    case "objRowBoat": drawSprite("sprRowBoat", e.img, e.x, e.y, e.dir, 1, e.angle, 1); break;
    case "objEnemyBomber": drawSprite("sprEnemyBomber", e.img, e.x, e.y, Math.cos(e.ang * Math.PI / 180) >= 0 ? -1 : 1, 1, 0, 1); break;
    case "objSmlBoat": drawSprite("sprSmlBoat", 0, e.x, e.y, Math.cos(e.ang * Math.PI / 180) >= 0 ? -1 : 1, 1, 0, 1); break;
    case "objCrewBullet": case "objECrewBullet": drawSprite("sprCrewBullet", 0, e.x, e.y, 0.5, 0.5, 0, 1); break;
    case "objBullet": case "objBullet2": case "objEBullet": drawSprite("sprCannonBullet", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objRearBullet": drawSprite("sprCannonBullet", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objBomb": drawSprite("sprBomb", e.img, e.x, e.y, 1, 1, e.angle, 1); break;
    case "objEBomb": drawSprite("sprite51", e.img, e.x, e.y, 1, 1, e.angle, 1); break;
    case "objBlast": drawSprite("sprBlast", e.img, e.x, e.y, 1, 1, 0, 1); break;
    case "objSMLBlast": case "objESmlBlast": drawSprite("sprsmallBlast", e.img, e.x, e.y, 2, 2, 0, 1); break;
    case "objGold": drawSprite("sprGold", e.img, e.x, e.y, 1, 1, 0, 1); break;
    case "objDebris": drawSprite("sprDebris", e.img, e.x, e.y, 1, 1, e.angle, 1); break;
    case "objShrapnel": drawSprite("sprShrapnel", 0, e.x, e.y, 1, 1, e.angle, 1); break;
    case "objCrew": drawSprite("sprCrew", 0, e.x, e.y, 1, 1, e.angle, 1); break;
    case "objShadow": drawSprite("sprShadow", 0, e.x, e.y, 1, 1, 0, e.alpha); break;
    case "objBoatPreview": drawSprite("sprBoatPrev", G.shipnum, e.x, e.y, 1, 1, 0, 1); break;
    case "objtakeOff": drawSprite("spr_takeoff", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objHireCrew": {
      const near = player && dist(e, player) <= 32;
      drawSprite("sprite53", 0, e.x, e.y, 1, 1, 0, near ? 1 : 0.55);
      if (near) drawText("Current crew: " + G.crew + "/" + G.max_crew + " — click to hire (10 dubloons)", e.x - cam.x, e.y - cam.y - 20, "#fff", 11);
      break;
    }
    case "objFillCrew": drawSprite("sprite54", 0, e.x, e.y, 1, 1, 0, 0.8); break;
    case "obj_sword_button": drawSprite("spr_sword_button", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "obj_object": drawSprite("spr_inventory_obj", e.img | 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objSkull": drawSprite("sprite34", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objskullTake": case "objskullLess": drawSprite("sprSkele", e.img | 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objFlowerPatch": case "obj_flowers": drawSprite("sprite24", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objCrate": drawSprite("sprCrate", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objDock": case "objDock2": case "objDock3": case "objEnemyDock": case "objDock4": case "objDock5": drawSprite("sprDock", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objSkybloomPatch": drawSprite("sprSkybloom", 0, e.x, e.y, 1, 1, 0, 1); break;
    case "objSalvage": drawSprite("sprSalvage", 0, e.x, e.y, 1, 1, 0, 1); break;
    default:
      if (NPC_TYPES.includes(e.type)) {
        if (e.type === "obj_harbormaster") drawSprite("sprHarbormaster", 0, e.x, e.y, 1, 1, 0, 1); // EXPANSION body (other NPCs are bubble-only in the port)
        if (e.type === "obj_gardener") drawSprite("sprGardener", 0, e.x, e.y, 1, 1, 0, 1);
        drawSprite("spr_speech", Math.min(2, e.t), e.x, e.y - 8, 1, 1, 0, 0.9);
        const lines = WORLD.texts[e.type] || [];
        if (e.t >= 1 && e.t <= lines.length && player && dist(e, player) <= 64) {
          ctx.fillStyle = "rgba(0,0,0,0.55)"; const w = 260, h = 16 + lines[e.t - 1].split("\n").length * 14;
          ctx.fillRect(e.x - cam.x - 8, e.y - cam.y - 62 - h, w, h);
          drawText(lines[e.t - 1], e.x - cam.x, e.y - cam.y - 48 - h, "#fff", 11);
          drawText("(S)", e.x - cam.x + w - 28, e.y - cam.y - 66 - h + 12, "#ff8", 10);
        }
      } else if (e.spr) drawSprite(e.spr, e.img, e.x, e.y, e.xscale, e.yscale, e.angle, e.alpha);
  }
}
let tilesBuilt = -1;
function buildTiles() {
  const R = WORLD.rooms[roomName]; if (!R) return;
  tileCanvas = document.createElement("canvas"); tileCanvas.width = R.w; tileCanvas.height = R.h;
  const tc = tileCanvas.getContext("2d"); let drawn = 0;
  for (const [x, y, bg, tx, ty, w, h] of [...R.tiles].sort((a, b) => b[7] - a[7])) {
    const img = BGIMG[bg]; if (img && img.complete && img.naturalWidth) { tc.drawImage(img, tx, ty, w, h, x, y, w, h); drawn++; }
  }
  tilesBuilt = drawn;
  // Block instances are NOT drawn: objBlock16/objBlock32 are visible:false in
  // the original (magenta placeholder sprites smlBlock/bigBlock) — they are
  // collision only, and the tile layer above is the visible terrain.
}
function bgr(c) { return "rgb(" + (c & 0xFF) + "," + ((c >> 8) & 0xFF) + "," + ((c >> 16) & 0xFF) + ")"; }
function render() {
  if (CLOSEUP) { drawCloseup(); return; }
  const R = WORLD.rooms[roomName]; if (!R) return;
  ctx.fillStyle = bgr(R.color); ctx.fillRect(0, 0, VW, VH);
  const bg5 = BGIMG.background5;
  if (bg5 && bg5.complete && bg5.naturalWidth) { // room background 0 = background5 (index 5)
    if (roomName === "rmTravel") { const ox = -(cam.x % 1000), oy = -(cam.y % 1000); for (let x = ox; x < VW; x += 1000) for (let y = oy; y < VH; y += 1000) ctx.drawImage(bg5, x, y); }
    else ctx.drawImage(bg5, 0, 0, VW, VH);
  }
  if (!tileCanvas || tilesBuilt < R.tiles.length) buildTiles();
  if (tileCanvas) ctx.drawImage(tileCanvas, cam.x, cam.y, VW, VH, 0, 0, VW, VH);
  const sorted = [...ents].filter(e => !e.dead).sort((a, b) => b.depth - a.depth);
  for (const e of sorted) drawEnt(e);
  drawHUD();
  if (!started && !TEST && (!SHOT || SHOT === "title")) drawTitle();
  if (gameOver) { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, VW, VH); drawText("THE MYST CLAIMS ANOTHER SHIP", 150, 220, "#f66", 20); drawText("Press R to restart", 240, 260, "#fff", 13); }
}
function drawHUD() {
  const band = bandAt(roomName, (mode === "ship" && vessel) ? vessel.y : (player ? player.y : 0));
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, VW, 22);
  drawText(roomName + "   " + band.name, 8, 15, band.name === "THIN AIR" ? "#9cf" : band.name === "THICK AIR" ? "#fc9" : "#cfc", 12);
  drawText("Dubloons: " + item_amount(1) + "   Crew: " + G.crew + "/" + G.max_crew + "   HP: " + Math.ceil(G.hp) + "/" + G.max_hp, 300, 15, "#fff", 12);
  if (keys.KeyF) { const c = sprImg("sprCompass", 0); if (c && c.complete) ctx.drawImage(c, 552, 40); drawText("COMPASS", 566, 140, "#fff", 10); if (G.mapMarked) { drawText("GARDEN ISLE — low, THICK AIR", 380, 158, "#fc9", 10); drawText("THE DERELICT — high, THIN AIR", 380, 172, "#9cf", 10); } }
  if (G.invShow) { // obj_control draw_0 inventory port
    const panel = sprImg("spr_inventory", 0); if (panel && panel.complete) ctx.drawImage(panel, 0, 7);
    for (let k = 0; k < G.invH; k++) for (let i = 0; i < G.invW; i++) {
      const id = G.inventory[k][i]; if (!id) continue;
      const im = sprImg("spr_inventory_obj", id); if (im && im.complete) ctx.drawImage(im, 7 + i * 32, 11 + k * 33);
      if (ITEMS.type[id] === "stackable") drawText(G.stack[k][i], 7 + i * 32 + 24, 11 + k * 33 + 10, "#000", 10, "right");
      if (mouseX >= 7 + i * 32 && mouseX < 7 + i * 32 + 32 && mouseY >= 11 + k * 33 && mouseY < 11 + k * 33 + 32) drawText(ITEMS.name[id], 128, 87, "#fff", 11);
    }
    if (G.mouseSelObj) { const im = sprImg("spr_inventory_obj", G.mouseSelObj); if (im && im.complete) ctx.drawImage(im, mouseX - 16, mouseY - 16); }
  }
  if (G.equipShow) {
    const panel = sprImg("spr_equip", 0); if (panel && panel.complete) ctx.drawImage(panel, 228, 0);
    for (let j = 0; j < 2; j++) { const im = sprImg("spr_inventory_obj", G.equip[j]); if (im && im.complete) ctx.drawImage(im, 232 + j * 34, 32); }
    drawText("Attack : " + G.base_attack + "+" + (ITEMS.atk[G.equip[0]] || 0) + " = " + G.atk, 320, 335, "#fff", 11);
    drawText("Defense : " + G.base_defense + "+" + (ITEMS.def[G.equip[1]] || 0) + " = " + G.def, 320, 351, "#fff", 11);
    if (vessel) { drawText("Crew: " + G.crew, vessel.x - cam.x, vessel.y - cam.y + 48, "#fff", 11); drawText("Ship status: " + Math.ceil(G.hp) + "/" + G.max_hp, vessel.x - cam.x, vessel.y - cam.y + 64, "#fff", 11); }
  }
  if (G.menuShow) {
    ctx.fillStyle = "#888"; ctx.fillRect(G.menuX, G.menuY, 64, G.menu.length * 15 + 1);
    ctx.strokeStyle = "#000"; ctx.strokeRect(G.menuX, G.menuY, 64, G.menu.length * 15 + 1);
    G.menu.forEach((m, i) => drawText(m, G.menuX + 3, G.menuY + 12 + i * 15, mouseY >= G.menuY + i * 15 && mouseY < G.menuY + i * 15 + 16 && mouseX >= G.menuX && mouseX < G.menuX + 64 ? "#fff" : "#000", 11));
  }
  if (toastT > 0) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(70, VH - 34, VW - 140, 24); drawText(toast, VW / 2, VH - 17, "#ff8", 12, "center"); }
}
function drawTitle() {
  ctx.fillStyle = "rgba(8,8,20,0.82)"; ctx.fillRect(0, 0, VW, VH);
  drawText("SKYMYST", 198, 120, "#9cf", 44);
  drawText("— ORIGINAL WORLD —", 218, 152, "#fff", 16);
  drawText("A port + expansion of the GameMaker 8 prototype (SkyDemo.exe)", 92, 186, "#ccc", 12);
  drawText("SHIP:  W A S D sail · CTRL fire (equip a cannon first: Q, right-click it, Equip)", 62, 232, "#fff", 12);
  drawText("FOOT:  A D move · CTRL / SPACE jump · S examine & pick up · W take-off at pads", 62, 254, "#fff", 12);
  drawText("Q inventory · E equipment · F compass · R restart · dock the ship to explore isles", 62, 276, "#fff", 12);
  drawText("Mind the air: THICK below, STABLE mid-sky, THIN above.", 118, 298, "#fc9", 12);
  drawText("New isles: the Garden low in the Thick, the Derelict high in the Thin — ask the harbormaster at the port.", 30, 318, "#cfc", 11);
  const s = sprImg("sprShip", 0); if (s && s.complete) ctx.drawImage(s, 290, 330);
  drawText("click or press any key", 238, 440, "#ff8", 13);
}

/* ---------- game init / restart (game_restart port) ---------- */
function initGame() {
  for (let k = 0; k < G.invH; k++) { G.inventory[k].fill(0); G.stack[k].fill(0); }
  G.hp = 100; G.max_hp = 100; G.crew = 1; G.max_crew = 10; G.shipnum = 2; G.equip = [0, 0];
  G.traded = 0; G.tradestock = 0; G.canTrade = 0; G.tradeItem = 0; G.mapMarked = false; G.invShow = false; G.equipShow = false; G.menuShow = false; G.mouseSelObj = 0;
  item_add(5, 1); travelSave = null; gameOver = false; raidTimer = 45 * 30; lastCombatFrame = -9999;
  loadRoom("rmTravel"); mode = "ship";
}

/* ---------- self-test (?test=1) + screenshot setups (?shot=) ---------- */
function runTests() {
  const res = { rooms: {}, bands: {}, created0: CREATED };
  for (const name of WORLD.roomOrder) {
    loadRoom(name);
    res.rooms[name] = { ents: ents.length, tiles: WORLD.rooms[name].tiles.length, player: !!player, vessel: !!vessel };
  }
  // foot movement + jump on rmExplore
  loadRoom("rmExplore"); mode = "foot";
  const x0 = player.x; keys.KeyD = true; for (let i = 0; i < 30; i++) stepAll();
  keys.KeyD = false; res.walkDx = Math.round(player.x - x0);
  pressed.Space = true; let jumped = false; for (let i = 0; i < 20; i++) { stepAll(); if (player.isInAir || player.vspd < 0) jumped = true; }
  res.jumped = jumped;
  // combat: crew auto-fire in rmTravel
  loadRoom("rmTravel"); mode = "ship"; started = true; G.crew = 5; G.equip[0] = 5;
  const bomber = create("objEnemyBomber", vessel.x + 100, vessel.y);
  const c0 = CREATED; let crewShots = 0;
  for (let i = 0; i < 600; i++) { const before = CREATED; stepAll(); for (let j = 0; j < CREATED - before; j++) {} crewShots = Math.max(crewShots, ents.filter(e => e.type === "objCrewBullet").length); }
  res.crewBulletsSeen = crewShots; res.bomberHpAfter = Math.round(bomber.hp); res.bomberAlive = !bomber.dead;
  // direct hit check: crew bullet overlapping a bomber damages it (collision port)
  const b2 = create("objEnemyBomber", vessel.x + 300, vessel.y); const hp0 = b2.hp;
  const cb = create("objCrewBullet", b2.x, b2.y); cb.vx = 0; cb.vy = 0; stepAll();
  res.directHitDmg = hp0 - b2.hp;
  // repair: crew>=2, out of combat, hp rises (obj_control alarm_0). Fresh travel
  // room so the combat phase can't have docked the ship into foot mode.
  loadRoom("rmTravel"); mode = "ship";
  ents = ents.filter(e => e === vessel || e.type === "objBlock16"); // empty arena: ship + islands only
  G.hp = 50; G.crew = 5; lastCombatFrame = -9999; healTimer = 1; // restaff: combat may have cost crew, and repair needs crew>=2
  const pinX = vessel.x, pinY = vessel.y; // pin the ship at spawn so it can't cruise into a dock mid-test
  for (let i = 0; i < 400; i++) { vessel.x = pinX; vessel.y = pinY; stepAll(); }
  res.hpRepairedTo = G.hp;
  res.bands = { travelTop: bandAt("rmTravel", 10).name, travelBottom: bandAt("rmTravel", 1240).name, explore: bandAt("rmExplore", 500).name, explore3: bandAt("rmExplore3", 500).name, explore4top: bandAt("rmExplore4", 10).name, garden: bandAt("rmGarden", 800).name, derelict: bandAt("rmDerelict", 100).name };
  /* ---------- EXPANSION tests ---------- */
  const exp = {};
  loadRoom("rmGarden"); mode = "foot"; // new-item pickup: Skybloom patch
  const patch = ents.find(e => e.type === "objSkybloomPatch");
  const sb0 = item_amount(14); if (patch) interact(player, patch);
  exp.skybloomPicked = item_amount(14) - sb0;
  exp.gardenerLines = (WORLD.texts.obj_gardener || []).length;
  loadRoom("rmDerelict"); mode = "foot"; // new-item pickup: Salvage
  const salv = ents.find(e => e.type === "objSalvage");
  const sv0 = item_amount(15); if (salv) interact(player, salv);
  exp.salvagePicked = item_amount(15) - sv0;
  exp.wreckPresent = ents.some(e => e.type === "objWreck");
  loadRoom("rmExplore"); mode = "foot"; // harbormaster: full dialogue marks the chart
  const hb = ents.find(e => e.type === "obj_harbormaster");
  exp.harborLines = (WORLD.texts.obj_harbormaster || []).length;
  let guard = 0; while (hb && !hb.dead && guard++ < 30) advanceSpeech(hb);
  exp.mapMarked = !!G.mapMarked;
  item_add(15, 2); item_add(14, 3); // trader table: salvage + skybloom sell for dubloons
  const trader = create("obj_speechTrade", player.x, player.y);
  const dub0 = item_amount(1);
  G.trade = true; G.canTrade = 1; G.traded = 1; G.tradeItem = 15; G.tradestock = 2; completeTrade(trader);
  exp.salvageDub = item_amount(1) - dub0;
  G.traded = 1; G.tradeItem = 14; G.tradestock = 3; const dub1 = item_amount(1); completeTrade(trader);
  exp.skybloomDub = item_amount(1) - dub1;
  item_add(14, 5); // mayor's second chain: 5 Skybloom -> Double Cannon
  const mayor = create("obj_mayorTrade", player.x, player.y);
  G.traded = 1; G.tradeItem = 14; G.tradestock = 5; completeTrade(mayor);
  exp.mayorChain = item_amount(11) >= 1 && item_amount(14) === 1;
  travelSave = null; // fresh hub (the repair test filtered the saved travel ents)
  loadRoom("rmTravel"); mode = "ship"; started = true; // new docks sail to the new isles
  const d4 = ents.find(e => e.type === "objDock4");
  if (d4 && vessel) { vessel.x = d4.x; vessel.y = d4.y; stepAll(); }
  exp.dockGarden = roomName === "rmGarden";
  loadRoom("rmTravel"); mode = "ship";
  const d5 = ents.find(e => e.type === "objDock5");
  if (d5 && vessel) { vessel.x = d5.x; vessel.y = d5.y; stepAll(); }
  exp.dockDerelict = roomName === "rmDerelict";
  res.expansion = exp;
  res.pass = res.walkDx > 10 && res.jumped && res.crewBulletsSeen > 0 && res.directHitDmg > 0 && res.hpRepairedTo > 50 &&
    res.bands.travelTop === "THIN AIR" && res.bands.travelBottom === "THICK AIR" &&
    res.bands.garden === "THICK AIR" && res.bands.derelict === "THIN AIR" &&
    res.rooms.rmGarden.ents > 100 && res.rooms.rmDerelict.ents > 80 &&
    exp.skybloomPicked === 1 && exp.salvagePicked === 1 && exp.wreckPresent &&
    exp.harborLines >= 6 && exp.gardenerLines >= 4 && exp.mapMarked &&
    exp.salvageDub === 6 && exp.skybloomDub === 6 && exp.mayorChain &&
    exp.dockGarden && exp.dockDerelict;
  document.title = "TEST " + JSON.stringify(res);
  loadRoom("rmTravel"); mode = "ship"; render();
  return res;
}
let CLOSEUP = false;
function drawCloseup() { // EXPANSION proof scene: new art at exact integer zooms, smoothing off
  ctx.fillStyle = "#20202c"; ctx.fillRect(0, 0, VW, VH);
  drawText("NEW ART AT INTEGER ZOOM — 1:1 PIXELS, ORIGINAL PALETTE ONLY", 70, 34, "#fff", 14);
  const figs = [["sprHarbormaster", "HARBORMASTER 24x48 @4x"], ["sprGardener", "GARDENER 24x48 @4x"], ["sprSkybloom", "SKYBLOOM 32x32 @4x"], ["sprSalvage", "SALVAGE 6x6 @8x"]];
  figs.forEach(([n, label], i) => {
    const img = sprImg(n, 0), x = 36 + i * 152, y = 64, s = n === "sprSalvage" ? 8 : 4;
    if (img && img.complete) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, img.naturalWidth * s, img.naturalHeight * s); }
    drawText(label, x, y + 200, "#ff8", 10);
  });
  [["spr_inventory_obj", 14, "ITEM 14 SKYBLOOM ICON 32x32 @4x"], ["spr_inventory_obj", 15, "ITEM 15 SALVAGE ICON 32x32 @4x"]].forEach(([n, idx, label], i) => {
    const img = sprImg(n, idx), x = 120 + i * 220, y = 292;
    if (img && img.complete) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, img.naturalWidth * 4, img.naturalHeight * 4); }
    drawText(label, x - 24, y + 140, "#ff8", 10);
  });
}
function setupShot(kind) {
  started = true; initGame();
  if (kind === "closeup") { CLOSEUP = true; return; }
  if (kind === "garden") { gotoRoom("rmGarden"); mode = "foot"; if (player) player.x = 470; for (let i = 0; i < 30; i++) stepAll(); }
  else if (kind === "derelict") { gotoRoom("rmDerelict"); mode = "foot"; if (player) { player.x = 730; player.y = 590; } for (let i = 0; i < 30; i++) stepAll(); }
  else if (kind === "harbor") {
    gotoRoom("rmExplore"); mode = "foot";
    const hb = ents.find(e => e.type === "obj_harbormaster");
    if (hb && player) { player.x = hb.x - 26; player.y = hb.y; hb.t = 1; focusCamera(true); }
  }
  else if (kind === "explore") { gotoRoom("rmExplore"); mode = "foot"; for (let i = 0; i < 30; i++) stepAll(); }
  else if (kind === "combat") {
    G.crew = 5; G.equip[0] = 5; G.hp = 62;
    create("objEnemyBomber", vessel.x + 110, vessel.y - 10);
    create("objSmlBoat", vessel.x + 90, vessel.y + 40);
    for (let i = 0; i < 150; i++) stepAll();
  } else { for (let i = 0; i < 30; i++) stepAll(); }
  render();
}

/* ---------- boot + main loop (30 steps/sec, room speed) ---------- */
loadAssets();
initGame();
function imagesReady() {
  for (const n in IMG) for (const im of IMG[n]) if (im && (!im.complete || !im.naturalWidth)) return false;
  for (const n in BGIMG) { const im = BGIMG[n]; if (!im.complete || !im.naturalWidth) return false; }
  return true;
}
if (TEST) { runTests(); }
else {
  let pendingShot = SHOT, acc = 0, last = performance.now();
  function loop(now) {
    acc += now - last; last = now;
    if (pendingShot && imagesReady()) { // screenshots: wait for sprites, set the scene, then freeze it
      if (pendingShot === "title") { started = false; }
      else { setupShot(pendingShot); started = false; }
      pendingShot = null;
    }
    const stepMs = 1000 / 30;
    let n = 0;
    while (acc >= stepMs && n < 5) { if (started && !gameOver) stepAll(); else for (const k in pressed) delete pressed[k]; acc -= stepMs; n++; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
