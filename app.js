import { getVfx, framePath, VFX_DEFAULTS, VFX_IDS } from "./vfx-data.js";
import { parseAiJson, sanitizeFighter, buildFighterModule, extractEmojis } from "./fighter-code.js";
import { playSfx, playUploadedSfx, panFromX, toggleSfxMuted, isSfxMuted, primeSfx } from "./sfx.js";
import { WEAPON_BASE, WEAPON_IDS, WEAPON_BY_ID, WEAPON_MOTIONS, WEAPON_DEFAULT_MOTION } from "./weapon-data.js";

const $ = (s) => document.querySelector(s);
const arena = $("#arena"), ctx = arena.getContext("2d");

const kungFuMan = {
  id: "kung-fu-man", name: "Kung Fu Man", author: "Elecbyte", prompt: "The simple baseline fighter.",
  config: { style: "classic balanced martial artist", emojis: ["👊", "🦵", "💢"], buttons: 6, combo: 1, specials: [{ name: "Palm Strike", type: "melee", variant: "light", visual: { effect: "arc", mainVfx: "main_slash_color1", hitVfx: "hit_round_spark", vfxFps: 18, color: "#f2c447", secondary: "#ffffff", size: 55, emoji: "✦" }, behavior: { motion: "none", radius: 0 } }], color: "#f2c447", accent: "#bd293a", banter: [] },
  script: `// Kung Fu Man — baseline fighter\nexport const fighter = {\n  name: "Kung Fu Man", buttons: 6, comboAptitude: 1,\n  specials: [{ name: "Palm Strike", type: "melee", visual: { effect: "arc", color: "#f2c447", secondary: "#ffffff", size: 55, emoji: "✦" }, behavior: { motion: "none" } }]\n};`, portrait_url: null, example: true
};

let fighters = [kungFuMan], selected = [kungFuMan.id, kungFuMan.id], activeSlot = 0;
let cursor = 0, rosterColumns = 1;
let spriteSheet = null, spriteThumbs = {};
// Portraits are fighter art, not just select-screen thumbnails. Keep a small
// image cache so a saved portrait can be drawn by the canvas during a match.
const portraitSprites = new Map();
// Where each fighter lives on the source sheet, and which way that art faces:
// 1 for art already drawn facing right, -1 for art drawn facing left.
const SPRITE_CROPS = { kung:{ x:225, y:0, w:300, h:415, facing:1 }, cyber:{ x:905, y:0, w:375, h:415, facing:-1 } };
let battle = null, lastFrame = 0, comboReadoutTimer = 0, moveCalloutTimer = 0;
const FIGHT_START_LEFT = 480, FIGHT_START_RIGHT = 800;
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function fighterById(id) { return fighters.find(f => f.id === id) || kungFuMan; }
function parseConfig(value) { try { const config = typeof value === "string" ? JSON.parse(value) : value; return config && typeof config === "object" && !Array.isArray(config) ? config : null; } catch { return null; } }
function recoverTruncatedMoves(value) {
  // Older generated kits were truncated by the save route, leaving invalid
  // JSON. Their leading move names and types are still intact, which is enough
  // for the normalizer to restore playable default data instead of falling all
  // the way back to the unrelated Quick Strike placeholder.
  const source = String(value || ""), seen = new Set(), moves = [];
  const pattern = /"name"\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*"type"\s*:\s*("(?:\\.|[^"\\])*")/g;
  for (const match of source.matchAll(pattern)) {
    try {
      const name = JSON.parse(match[1]), type = JSON.parse(match[2]);
      if (!name || seen.has(name) || !["melee", "projectile", "combo", "trap", "grapple", "freeze", "teleport", "pillar", "bomb", "gun"].includes(type)) continue;
      seen.add(name); moves.push({ name, type });
      if (moves.length === 10) break;
    } catch { /* keep looking for the next intact move header */ }
  }
  return moves;
}
function normalizeFighter(row) {
  const config = parseConfig(row.config);
  if (config) { config.buttons = 6; return { ...row, config }; }
  const specials = recoverTruncatedMoves(row.config);
  return { ...row, config:{ name:row.name, author:row.author, buttons:6, specials } };
}
function portraitSprite(fighter) {
  const url = String(fighter?.portrait_url || "").trim();
  if (!url) return null;
  let entry = portraitSprites.get(url);
  if (!entry) {
    const image = new Image();
    entry = { image, ready:false, failed:false };
    image.onload = () => { entry.ready = image.naturalWidth > 0; renderRoster(); };
    image.onerror = () => { entry.failed = true; };
    image.src = url;
    portraitSprites.set(url, entry);
  }
  return entry.ready ? entry.image : null;
}
function warmPortraitSprites(list) { list.forEach(portraitSprite); }
function avatar(f) {
  const em = f.config?.emojis?.[0] || "🥊";
  // Every forged fighter fights with the same in-battle sprite crop, so that
  // crop - not a generic emoji - is what a fighter looks like by default.
  // A custom portrait upload still wins when one exists.
  const sprite = f.example ? spriteThumbs.kung : spriteThumbs.cyber;
  return f.portrait_url ? `<img src="${escapeHtml(f.portrait_url)}" alt="" />` : sprite ? `<img src="${sprite}" alt="" />` : em;
}

async function loadRoster() {
  try {
    const res = await fetch("/api/fighters");
    const data = await res.json();
    fighters = [kungFuMan, ...(data.fighters || []).map(normalizeFighter)];
  } catch { fighters = [kungFuMan]; }
  warmPortraitSprites(fighters);
  renderRoster();
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER SELECT
// The dossier reads the same numbers the fight engine reads, so what the select
// screen promises about a fighter is what the arena actually does with it.
// ─────────────────────────────────────────────────────────────────────────────
const ARCHETYPE_COPY = {
  rushdown: { label: "RUSHDOWN", blurb: "Fast buttons, relentless pressure, lives in your face." },
  zoner:    { label: "ZONER",    blurb: "Controls space from range and punishes the approach." },
  grappler: { label: "GRAPPLER", blurb: "Walks you down and cashes out in command grabs." },
  balanced: { label: "BALANCED", blurb: "No glaring holes, answers at every range." }
};

function fighterProfile(fighter) {
  const shell = { fighter };
  const moves = combatMoves(shell);
  const startups = moves.map(move => moveFrames(move).startup);
  const averageStartup = startups.reduce((sum, value) => sum + value, 0) / Math.max(1, startups.length);
  const reach = Math.max(...moves.map(move => moveReach(move)), 70);
  const heavy = moves.filter(move => move.variant === "heavy" || isLauncher(move) || isGrapple(move)).length;
  const stats = {
    power: Math.round(Math.min(100, 34 + heavy / Math.max(1, moves.length) * 46 + moves.length * 4)),
    speed: Math.round(Math.min(100, Math.max(10, 118 - averageStartup * 5.2))),
    reach: Math.round(Math.min(100, (reach - 70) / 450 * 100)),
    combo: Math.round(Math.min(100, (Number(fighter.config?.combo) || 2) / 5 * 100))
  };
  return { moves, stats, archetype: fighterArchetype(shell) };
}

function statRow(label, value) {
  return `<div class="stat"><span>${label}</span><i><b style="width:${value}%"></b></i><em>${String(value).padStart(2, "0")}</em></div>`;
}

function renderDossier(fighter) {
  const host = $("#dossier"); if (!host) return;
  const { moves, stats, archetype } = fighterProfile(fighter);
  const copy = ARCHETYPE_COPY[archetype] || ARCHETYPE_COPY.balanced;
  const config = fighter.config || {};
  // The universal six buttons occupy the first six slots, so limiting this
  // preview to six would hide every signature special from the dossier.
  const moveRows = moves.map(move => {
    const frames = moveFrames(move);
    const multi = multiHitProfile(move);
    const tags = [
      isLauncher(move) ? "LAUNCHER" : "", isGrapple(move) ? "GRAB" : "",
      isGun(move) ? "GUN" : isRanged(move) ? "RANGED" : "",
      isWallSlam(move) ? "WALL SLAM" : "", isSpin(move) ? "SPIN" : "", move?.followUp ? "FOLLOW-UP" : "",
      isFlyIn(move) ? "FLY-IN" : "", isGroundPound(move) ? "POUND" : "",
      isDiveKick(move) ? "DIVE" : "", multi ? `${multi.hits} HITS` : ""
    ].filter(Boolean);
    return `<li><span class="move-name">${escapeHtml(move.name || "Strike")}</span>
      <span class="move-tags">${escapeHtml(moveCategory(move).toUpperCase())} · ${escapeHtml(move.type || "melee").toUpperCase()}${tags.length ? ` · ${tags.join(" · ")}` : ""}</span>
      <span class="move-frames">${frames.startup}<i>startup</i>${frames.hitstun}<i>stun</i>${Math.round(moveReach(move))}<i>reach</i></span></li>`;
  }).join("");
  host.innerHTML = `
    <div class="dossier-top">
      <span class="dossier-portrait">${avatar(fighter)}</span>
      <div class="dossier-id">
        <span class="overline">DOSSIER</span>
        <strong>${escapeHtml(fighter.name)}</strong>
        <small>BY ${escapeHtml(fighter.author)}</small>
        <span class="archetype" data-archetype="${archetype}">${copy.label}</span>
      </div>
    </div>
    <p class="dossier-blurb">${escapeHtml(config.style || copy.blurb)}</p>
    <div class="dossier-stats">
      ${statRow("POWER", stats.power)}${statRow("SPEED", stats.speed)}${statRow("REACH", stats.reach)}${statRow("COMBO", stats.combo)}
    </div>
    <span class="overline dossier-heading">MOVE LIST / ${moves.length}</span>
    <ul class="dossier-moves">${moveRows}</ul>
    ${config.banter?.[0] ? `<blockquote class="dossier-quote">“${escapeHtml(config.banter[0])}”</blockquote>` : ""}`;
}

function assignFighter(id, slot = activeSlot) {
  primeSfx();
  playSfx("menuSelect", { volume: .7 });
  selected[slot] = id;
  activeSlot = slot === 0 ? 1 : 0;
  renderRoster();
}

function moveCursor(delta) {
  if (!fighters.length) return;
  playSfx("menuCursor", { volume: .5, cooldown: .04 });
  cursor = (cursor + delta + fighters.length) % fighters.length;
  renderRoster();
  const card = document.querySelector(`[data-index="${cursor}"]`);
  card?.scrollIntoView({ block: "nearest" });
}

function renderRoster() {
  if (!fighters.some(f => f.id === selected[0])) selected[0] = fighters[0].id;
  if (!fighters.some(f => f.id === selected[1])) selected[1] = fighters[0].id;
  cursor = Math.max(0, Math.min(fighters.length - 1, cursor));
  $("#fighter-count").textContent = `${fighters.length} FIGHTER${fighters.length === 1 ? "" : "S"}`;
  const left = fighterById(selected[0]), right = fighterById(selected[1]);
  $("#player-pick-name").textContent = left.name.toUpperCase();
  $("#cpu-pick-name").textContent = right.name.toUpperCase();
  $("#player-pick-portrait").innerHTML = avatar(left);
  $("#cpu-pick-portrait").innerHTML = avatar(right);
  $("#player-pick-meta").textContent = `${left.config?.style || "READY TO FIGHT"}`.toUpperCase();
  $("#cpu-pick-meta").textContent = `${right.config?.style || "READY TO FIGHT"}`.toUpperCase();
  $("#select-prompt").textContent = activeSlot === 0 ? "Choose Player 1" : "Choose CPU";
  document.querySelectorAll(".select-slot").forEach(slot => slot.classList.toggle("active", Number(slot.dataset.slot) === activeSlot));
  if (!battle) {
    $("#left-name").textContent = left.name.toUpperCase();
    $("#right-name").textContent = right.name.toUpperCase();
    $("#mode-label").textContent = "READY ROOM";
    $("#round-text").textContent = "SELECT";
    $("#timer").textContent = "--";
    $("#left-wins").textContent = "0";
    $("#right-wins").textContent = "0";
    for (const id of ["#left-hp", "#right-hp", "#left-guard", "#right-guard"]) { const el = $(id); if (el) el.style.width = "100%"; }
    for (const id of ["#left-meter", "#right-meter"]) { const el = $(id); if (el) el.style.width = "0%"; }
  }
  $("#roster").innerHTML = fighters.map((f, index) => {
    const p1 = selected[0] === f.id, cpu = selected[1] === f.id;
    const label = p1 && cpu ? "P1 / CPU" : p1 ? "P1" : cpu ? "CPU" : "SELECT";
    const archetype = fighterProfile(f).archetype;
    const editAction = f.example ? "" : `<a class="edit-fighter" href="editor.html?id=${encodeURIComponent(f.id)}">EDIT <span>↗</span></a>`;
    return `<article class="fighter-card ${p1 || cpu ? "selected" : ""} ${index === cursor ? "focused" : ""}" data-index="${index}">
      <button class="fighter-pick" data-fighter="${escapeHtml(f.id)}" role="option" aria-selected="${index === cursor}">
        <span class="portrait">${avatar(f)}<i class="card-archetype">${(ARCHETYPE_COPY[archetype] || ARCHETYPE_COPY.balanced).label}</i></span>
        <span class="fighter-info"><strong>${escapeHtml(f.name)}</strong><span>BY ${escapeHtml(f.author)} · ${f.config?.buttons || 6} BTN</span></span>
        <em>${label}</em>
      </button>${editAction}</article>`;
  }).join("");
  document.querySelectorAll("[data-fighter]").forEach((node) => {
    const index = Number(node.closest("[data-index]").dataset.index);
    node.onclick = () => { cursor = index; assignFighter(node.dataset.fighter); };
    // Hovering previews a fighter without committing to them.
    node.onmouseenter = () => { playSfx("menuCursor", { volume: .35, cooldown: .05 }); cursor = index; document.querySelectorAll(".fighter-card").forEach((card, i) => card.classList.toggle("focused", i === index)); renderDossier(fighters[index]); };
  });
  renderDossier(fighters[cursor] || left);
}
document.querySelectorAll(".select-slot").forEach(slot => slot.onclick = () => {
  activeSlot = Number(slot.dataset.slot);
  renderRoster();
});

function rosterColumnCount() {
  const grid = $("#roster");
  if (!grid) return 1;
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
}
function randomFighterId() { return fighters[Math.floor(Math.random() * fighters.length)].id; }

$("#random-pick").onclick = () => { const id = randomFighterId(); cursor = fighters.findIndex(f => f.id === id); assignFighter(id); };
$("#mirror-pick").onclick = () => { const id = fighters[cursor]?.id || selected[0]; selected[0] = selected[1] = id; activeSlot = 0; renderRoster(); };

// Arcade selects are driven from the stick. Arrow keys walk the grid, Enter
// locks the highlighted fighter into the active side, Tab flips sides.
document.addEventListener("keydown", (event) => {
  if (document.body.classList.contains("in-match")) return;
  if (event.target instanceof Element && event.target.matches("input, textarea, select, [contenteditable]")) return;
  const columns = rosterColumnCount();
  switch (event.key) {
    case "ArrowLeft": moveCursor(-1); break;
    case "ArrowRight": moveCursor(1); break;
    case "ArrowUp": moveCursor(-columns); break;
    case "ArrowDown": moveCursor(columns); break;
    case "Enter": case " ": assignFighter(fighters[cursor].id); break;
    case "Tab": activeSlot = activeSlot === 0 ? 1 : 0; renderRoster(); break;
    case "r": case "R": { const id = randomFighterId(); cursor = fighters.findIndex(f => f.id === id); assignFighter(id); break; }
    default: return;
  }
  event.preventDefault();
});

function moveFrameDefaults(type = "melee") { return type === "gun" ? { startup:10, active:2, endlag:26, hitstun:11 } : type === "projectile" ? { startup:18, active:3, endlag:30, hitstun:10 } : type === "combo" ? { startup:5, active:3, endlag:24, hitstun:18 } : type === "trap" ? { startup:10, active:3, endlag:22, hitstun:16 } : type === "grapple" ? { startup:9, active:12, endlag:28, hitstun:24 } : type === "freeze" ? { startup:14, active:3, endlag:28, hitstun:16 } : type === "teleport" ? { startup:5, active:3, endlag:24, hitstun:18 } : type === "pillar" ? { startup:16, active:4, endlag:30, hitstun:20 } : type === "bomb" ? { startup:14, active:3, endlag:32, hitstun:18 } : { startup:7, active:2, endlag:18, hitstun:14 }; }
const moveVisualDefaults = {
  melee: { effect: "arc", color: "#f7d35b", secondary: "#ffffff", size: 58, emoji: "✦" },
  projectile: { effect: "orb", color: "#56d9ff", secondary: "#d8ff3e", size: 22, emoji: "✦" },
  combo: { effect: "slashes", color: "#ff6c61", secondary: "#ffd05d", size: 62, emoji: "✧" },
  trap: { effect: "rune", color: "#bd8cff", secondary: "#56d9ff", size: 72, emoji: "◇" },
  gun: { effect: "orb", color: "#ffe66d", secondary: "#ffffff", size: 16, emoji: "\u2022", element: "energy" },
  grapple: { effect: "grapple", color: "#ff9f43", secondary: "#fff2c2", size: 68, emoji: "⛓", element: "energy" },
  freeze: { effect: "freeze", color: "#73e7ff", secondary: "#eefcff", size: 30, emoji: "❄", element: "ice" },
  teleport: { effect: "teleport", color: "#d28cff", secondary: "#56d9ff", size: 74, emoji: "◇", element: "shadow" },
  pillar: { effect: "pillar", color: "#ff7043", secondary: "#ffd05d", size: 86, emoji: "▲", element: "fire" },
  bomb: { effect: "burst", color: "#ff7043", secondary: "#ffd05d", size: 62, emoji: "💣", element: "fire" }
};
const moveBehaviorDefaults = {
  melee: { motion: "none", speed: 0, radius: 0, shots: 1, knockback: { horizontal: 180, vertical: 0, angle: 0, direction: "away", hitstop: .045 } },
  projectile: { motion: "projectile", pattern: "straight", speed: 390, radius: 22, shots: 1 },
  combo: { motion: "none", speed: 0, radius: 0, shots: 1, knockback: { horizontal: 150, vertical: 0, angle: 0, direction: "away", hitstop: .04 } },
  trap: { motion: "trap", speed: 0, radius: 68, shots: 1, lifetime: 1.7 },
  grapple: { motion: "grapple", speed: 300, radius: 0, shots: 1, hold: .2, finisher: "slam", knockback: { horizontal: 260, vertical: 470, angle: 55, direction: "away", hitstop: .08 } },
  freeze: { motion: "projectile", pattern: "straight", speed: 360, radius: 28, shots: 1, freeze: .95, status: "freeze" },
  teleport: { motion: "teleport", speed: 0, radius: 0, shots: 1, offset: 92 },
  pillar: { motion: "pillar", speed: 0, radius: 76, shots: 1, lifetime: 1.45, status: "none", element: "fire" },
  gun: { motion: "gun", pattern: "straight", speed: 1150, radius: 13, shots: 1, knockback: { horizontal: 150, vertical: 0, angle: 0, direction: "away", hitstop: .035 } },
  bomb: { motion: "bomb", pattern: "straight", speed: 330, radius: 78, shots: 1, fuse: .62, dashDistance: 96, status: "none", element: "fire", knockback: { horizontal: 310, vertical: 260, angle: 0, direction: "away", hitstop: .08, carry: false } }
};
const moveAnimationDefaults = {
  melee: { style: "strike", windup: "coil", contact: "snap", finish: "recoil", intensity: .9 },
  projectile: { style: "cast", windup: "coil", contact: "energy", finish: "recoil", intensity: .9 },
  combo: { style: "spin", windup: "coil", contact: "slash", finish: "spin", intensity: 1 },
  trap: { style: "cast", windup: "crouch", contact: "energy", finish: "recoil", intensity: .8 },
  grapple: { style: "grapple", windup: "reach", contact: "grab", finish: "slam", intensity: 1.15 },
  freeze: { style: "cast", windup: "coil", contact: "energy", finish: "recoil", intensity: .9 },
  teleport: { style: "dash", windup: "hop", contact: "body", finish: "snap", intensity: 1.1 },
  pillar: { style: "cast", windup: "crouch", contact: "energy", finish: "slam", intensity: 1 },
  bomb: { style: "cast", windup: "crouch", contact: "energy", finish: "slam", intensity: 1.1 },
  gun: { style: "cast", windup: "reach", contact: "energy", finish: "snap", intensity: .8 }
};
function clampNumber(value, min, max, fallback) { return Math.min(max, Math.max(min, Number(value) || fallback)); }
function normalizeFreeTransform(input = {}) {
  const raw = input && typeof input === "object" ? input : {}, rotation = raw.rotation && typeof raw.rotation === "object" ? raw.rotation : {};
  return {
    rotateX: clampNumber(raw.rotateX ?? raw.rotationX ?? rotation.x, -360, 360, 0),
    rotateY: clampNumber(raw.rotateY ?? raw.rotationY ?? rotation.y, -360, 360, 0),
    rotateZ: clampNumber(raw.rotateZ ?? raw.rotationZ ?? rotation.z, -360, 360, 0),
    spin: clampNumber(raw.spin, -720, 720, 0),
    spinSpeed: clampNumber(raw.spinSpeed, -12, 12, 0),
    scaleX: clampNumber(raw.scaleX, .35, 2.4, 1),
    scaleY: clampNumber(raw.scaleY, .35, 2.4, 1),
    skewX: clampNumber(raw.skewX, -.95, .95, 0),
    skewY: clampNumber(raw.skewY, -.95, .95, 0),
    offsetX: clampNumber(raw.offsetX, -180, 180, 0),
    offsetY: clampNumber(raw.offsetY, -180, 180, 0),
    orbit: clampNumber(raw.orbit, -1, 1, 0),
    pulse: clampNumber(raw.pulse, 0, 1, 0)
  };
}
function normalizeKnockback(input, type, rawMove = {}) {
  const defaults = moveBehaviorDefaults[type]?.knockback || { horizontal: 180, vertical: 0, angle: 0, direction: "away", hitstop: .045 };
  const raw = input && typeof input === "object" ? input : {};
  const likelyLauncher = rawMove.launcher === true || rawMove.role === "launcher" || /launch|uppercut|rising|breaker|lift|anti.?air/i.test(String(rawMove.name || ""));
  const fallbackVertical = likelyLauncher ? 620 : defaults.vertical;
  const direction = ["away", "toward", "up", "down"].includes(String(raw.direction || "").toLowerCase()) ? String(raw.direction).toLowerCase() : defaults.direction;
  return {
    horizontal: clampNumber(raw.horizontal, 0, 900, defaults.horizontal),
    vertical: clampNumber(raw.vertical, 0, 900, fallbackVertical),
    power: clampNumber(raw.power, 0, 900, 0),
    angle: clampNumber(raw.angle, -80, 80, defaults.angle),
    direction,
    hitstop: clampNumber(raw.hitstop, 0, .2, defaults.hitstop),
    carry: raw.carry !== false,
    wallBounce: raw.wallBounce === true,
    groundBounce: raw.groundBounce === true
  };
}
const visualScriptCache = new Map();

const hexMixCache = new Map();
function mixHex(hex, target, amount) {
  const key = `${hex}|${target}|${amount}`;
  const cached = hexMixCache.get(key); if (cached) return cached;
  const parse = (value) => { const s = String(value || "").replace("#", ""); return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0]; };
  const [r1, g1, b1] = parse(hex), [r2, g2, b2] = parse(target), t = Math.max(0, Math.min(1, amount));
  const channel = (a, b) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  const out = `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
  if (hexMixCache.size < 512) hexMixCache.set(key, out);
  return out;
}

// Trace the same geometry three times: bloom, body, hot core.
function glowStroke(trace, color, width, opacity, softness = 1) {
  const w = Math.max(.6, width), a = Math.max(0, Math.min(1, opacity));
  if (a <= .01) return;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = Math.min(48, (w * 3.2 + 9) * softness);
  ctx.lineWidth = w * 2.7; ctx.globalAlpha = a * .17; trace(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = w; ctx.globalAlpha = a * .78; trace(); ctx.stroke();
  ctx.strokeStyle = mixHex(color, "#ffffff", .74); ctx.lineWidth = Math.max(.8, w * .32); ctx.globalAlpha = Math.min(1, a * 1.1); trace(); ctx.stroke();
  ctx.restore();
}
function glowFill(trace, color, opacity, blur = 18) {
  const a = Math.max(0, Math.min(1, opacity));
  if (a <= .01) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.globalAlpha = a * .55; trace(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = mixHex(color, "#ffffff", .6); ctx.globalAlpha = a; trace(); ctx.fill();
  ctx.restore();
}
const slashVfx = ["main_slash_color1", "main_slash2_color1", "main_slash3_color2", "main_slash3_color3"];
const burstVfx = ["main_firework", "main_musicburst", "main_stylized_explosion", "main_vfx_start"];
const visualScriptVfx = [...slashVfx, ...burstVfx];
// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT MOVE VISUALS
// Each motion gets artwork built around what it physically does, animated
// across the move's own progress so the effect sweeps, expands or trails
// instead of sitting on screen as a static decal. `p` runs 0..1 over the whole
// move, `t` is seconds, and `active` is true only during the hit frames.
// ─────────────────────────────────────────────────────────────────────────────
function visualScriptFallback(rawMove = {}, type = "melee") {
  const key = `${String(rawMove.name || "unnamed")}::${type}`;
  let seed = 0; for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const tilt = ((seed % 13) - 6) * .07;
  const motion = String(rawMove.behavior?.motion || "").toLowerCase();
  const name = String(rawMove.name || "").toLowerCase();
  const burstLike = /bomb|pillar|trap|freeze|gun/.test(`${type} ${motion}`) || /pound|shaker|seismic|quake|blast|nova|burst/.test(name);
  const pool = burstLike ? burstVfx : slashVfx;
  const asset = pool[seed % pool.length];
  const has = (re) => re.test(name);

  // ── Rotating multi-hit ────────────────────────────────────────────────────
  if (motion === "spin" || has(/spin|whirl|cyclone|tornado|twister/)) return `
const turn = t * 13;
for (let ring = 0; ring < 3; ring++) {
  const r = size * (.5 + ring * .26), a = turn - ring * .7;
  api.slash(0, 0, r, a, 2.5, ring % 2 ? secondary : color, 9 - ring * 2, active ? .9 : .25);
}
for (let i = 0; i < 6; i++) { const a = turn * .7 + i * Math.PI / 3; api.line(Math.cos(a) * size * .3, Math.sin(a) * size * .3, Math.cos(a) * size * 1.05, Math.sin(a) * size * 1.05, secondary, 3, active ? .5 : .12); }
api.asset("${asset}", 0, 0, size * 1.3, active ? .6 : .2, turn * .5);
if (active) api.flash(0, 0, size * .55, secondary, .3);`;

  // ── Rising multi-hit uppercut ─────────────────────────────────────────────
  if (motion === "multi-uppercut" || has(/shoryu|rising|upper/)) return `
const rise = p * size * 1.5;
for (let i = 0; i < 5; i++) {
  const y = -rise + i * size * .3, fade = 1 - i / 5;
  api.slash(size * .1, y, size * (.44 + i * .07), -2.5 + tiltless, 1.9, i % 2 ? secondary : color, 8 * fade, (active ? .9 : .25) * fade);
}
api.line(-size * .1, size * .5, size * .25, -rise - size * .35, color, 7, active ? .8 : .2);
api.line(size * .2, size * .45, size * .5, -rise - size * .2, secondary, 4, active ? .6 : .15);
api.asset("${asset}", size * .2, -rise * .55, size * 1.1, active ? .55 : .22, -.7);
if (active) api.flash(size * .25, -rise - size * .1, size * .6, secondary, .38);`.replace("tiltless", tilt.toFixed(3));

  // ── Crouching slide ───────────────────────────────────────────────────────
  if (motion === "slide" || has(/\bslide\b|skid|low.?dash/)) return `
const rush = p > .12;
for (let i = 0; i < 5; i++) { const sx = -size * (1.0 + i * .55), sy = size * (.25 + i * .05), fade = (1 - i / 5) * (active ? .9 : .25); api.line(sx, sy, sx - size * .22, sy - size * .18, color, 5 * fade, fade); api.line(sx - size * .08, sy + size * .08, sx - size * .28, sy - size * .10, secondary, 3 * fade, fade * .7); }
if (rush) { api.wedge(-size * .18, size * .22, size * 1.05, size * .22, color, active ? .32 : .08); api.streak(-size * .12, size * .18, size * 2.1, 4, secondary, size * .14, active ? .88 : .28); }
if (active) { api.flash(size * .2, size * .2, size * .55, secondary, .42); api.spark(0, size * .22, size * .7, color, .7, 0); }`;

  // ── Airborne rush ─────────────────────────────────────────────────────────
  if (motion === "fly-in" || has(/fly|soar|swoop|comet/)) return `
api.wedge(-size * .2, 0, size * 1.15, size * .42, color, active ? .34 : .1);
api.streak(-size * .1, 0, size * 2.4, 6, secondary, size * .17, active ? .95 : .3);
for (let i = 0; i < 3; i++) { const off = i * size * .5; api.ring(-off, 0, size * (.42 - i * .1), color, 4 - i, (active ? .55 : .15) * (1 - i * .3)); }
api.asset("${asset}", size * .35, 0, size * 1.2, active ? .55 : .25, ${tilt.toFixed(3)});
if (active) api.flash(size * .5, 0, size * .7, secondary, .4);`;

  // ── Falling slam ──────────────────────────────────────────────────────────
  if (motion === "ground-pound" || has(/pound|shaker|seismic|quake/)) return `
if (active) {
  const wave = (p - .35) / .65;
  for (let i = 0; i < 3; i++) { const r = size * (.5 + wave * 2.6) - i * size * .34; if (r > 0) api.shock(0, size * .95, r, i % 2 ? secondary : color, 7 - i * 2, Math.max(0, .85 - wave * .7)); }
  for (let i = 0; i < 7; i++) { const a = -Math.PI * .12 - i * Math.PI * .12, d = size * (.5 + wave * 1.1); api.line(Math.cos(a) * d * .4, size * .9, Math.cos(a) * d, size * .9 + Math.sin(a) * size * .8, secondary, 3, Math.max(0, .7 - wave * .6)); }
  api.flash(0, size * .9, size * (.6 + wave * .9), secondary, Math.max(0, .55 - wave * .5));
} else {
  api.streak(0, -size * .3, size * 1.2, 3, color, size * .3, .35);
  api.ring(0, 0, size * (.3 + p * .3), color, 5, .4);
}
api.asset("${asset}", 0, size * .7, size * 1.4, active ? .55 : .15, 0);`;

  // ── Wall slam ─────────────────────────────────────────────────────────────
  if (motion === "wall-slam" || has(/wall/)) return `
api.wedge(0, 0, size * 1.25, size * .5, color, active ? .4 : .1);
for (let i = 0; i < 7; i++) {
  const a = (i - 3) * .34, len = size * (.85 + (i % 2) * .4);
  api.line(size * .3, 0, size * .3 + Math.cos(a) * len, Math.sin(a) * len, i % 2 ? secondary : color, 4, active ? .8 : .18);
}
api.ring(size * .35, 0, size * (.35 + p * .5), secondary, 6, active ? .75 : .18);
api.asset("${asset}", size * .55, 0, size * 1.4, active ? .55 : .22, 0);
if (active) api.flash(size * .6, 0, size * .85, secondary, .5);`;

  // ── Firearm ───────────────────────────────────────────────────────────────
  if (type === "gun" || motion === "gun" || has(/gun|pistol|revolver|rifle|magnum|shotgun/)) return `
if (active) {
  api.line(size * .5, 0, size * 7, 0, secondary, 3, .9);
  api.line(size * .5, 0, size * 5, 0, color, 6, .5);
  for (let i = 0; i < 7; i++) { const a = (i - 3) * .42; api.line(size * .5, 0, size * .5 + Math.cos(a) * size * 1.5, Math.sin(a) * size * 1.5, i % 2 ? secondary : color, 3, .85); }
  api.flash(size * .55, 0, size * 1.5, secondary, .85);
} else {
  api.ring(size * .35, 0, size * (.7 - p * .3), color, 2, .25);
}
api.asset("${asset}", size * .8, 0, size * 1.25, active ? .6 : .12, 0);`;

  // ── Jab barrage ───────────────────────────────────────────────────────────
  if (motion === "rapid-jab" || has(/rapid|ora|barrage|flurry|rush/)) return `
const beat = Math.floor(t * 22);
for (let i = 0; i < 7; i++) {
  const lane = ((i * 7 + beat) % 5 - 2) * size * .19;
  const reach = size * (.75 + ((i + beat) % 3) * .26);
  api.line(-size * .25, lane, reach, lane * .55, i % 2 ? secondary : color, 5 - (i % 3), active ? .9 : .2);
}
api.wedge(-size * .2, 0, size * 1.1, size * .45, color, active ? .22 : .06);
api.asset("${asset}", size * .55, 0, size * 1.25, active ? .55 : .2, (beat % 2 ? .18 : -.18));
if (active) api.flash(size * (.8 + (beat % 3) * .12), ((beat % 5) - 2) * size * .14, size * .45, secondary, .55);`;

  // ── Dive kick ─────────────────────────────────────────────────────────────
  if (motion === "dive-kick" || has(/dive|stomp|meteor kick/)) return `
const ang = .72;
api.wedge(-size * .3, -size * .45, size * 1.3, size * .3, color, active ? .3 : .08);
for (let i = 0; i < 4; i++) {
  const off = i * size * .22;
  api.line(-size * .5 - off, -size * .95 - off, size * .75 - off * .4, size * .75 - off * .4, i % 2 ? secondary : color, 6 - i, active ? .85 : .2);
}
api.slash(size * .35, size * .35, size * .6, -2.3, 1.6, secondary, 7, active ? .8 : .18);
api.asset("${asset}", size * .4, size * .4, size * 1.2, active ? .55 : .22, ang);
if (active) api.flash(size * .5, size * .5, size * .65, secondary, .45);`;

  // ── Grapple ───────────────────────────────────────────────────────────────
  if (type === "grapple" || motion === "grapple" || has(/grab|throw|clinch|suplex|slam/)) return `
const reach = size * (.6 + p * .8);
api.line(0, 0, reach, -size * .1, color, 7, active ? .9 : .3);
api.ring(reach, -size * .1, size * (.26 + Math.sin(t * 14) * .04), secondary, 5, active ? .95 : .3);
api.spark(reach, -size * .1, size * .5, secondary, 6, t * 3);
api.asset("${asset}", reach, -size * .1, size * 1.3, active ? .6 : .2, 0);
if (active) api.flash(reach, -size * .1, size * .5, secondary, .4);`;

  // ── Projectiles and casts ─────────────────────────────────────────────────
  if (type === "projectile" || type === "freeze" || type === "bomb" || type === "pillar" || type === "trap" || motion === "projectile") return `
const charge = Math.min(1, p * 2.2), orb = size * (.3 + charge * .3);
api.circle(size * .35, 0, orb, color, secondary, 3, active ? .95 : .35);
api.ring(size * .35, 0, orb * (1.7 + Math.sin(t * 11) * .12), secondary, 3, active ? .7 : .22);
for (let i = 0; i < 5; i++) { const a = t * 4 + i * Math.PI * .4, r = orb * (2.1 + Math.sin(t * 6 + i) * .3); api.line(size * .35 + Math.cos(a) * r, Math.sin(a) * r * .7, size * .35 + Math.cos(a) * r * .6, Math.sin(a) * r * .42, secondary, 3, active ? .75 : .2); }
api.asset("${asset}", size * .35, 0, size * 1.2, active ? .55 : .3, t * .8);
if (active) api.flash(size * .35, 0, orb * 1.6, secondary, .5);`;

  // ── Default: a real sweeping slash ────────────────────────────────────────
  return `
const sweep = -2.0 + ${tilt.toFixed(3)} + p * 3.1;
api.slash(0, 0, size * (.62 + p * .22), sweep, 1.5, color, 10, active ? .95 : .22);
api.slash(0, 0, size * (.84 + p * .18), sweep + .3, 1.1, secondary, 5, active ? .8 : .18);
api.streak(-size * .1, 0, size * 1.1, 3, secondary, size * .22, active ? .5 : .12);
api.asset("${asset}", Math.cos(sweep + .75) * size * .6, Math.sin(sweep + .75) * size * .6, size * 1.1, active ? .55 : .24, sweep + .75);
if (active) api.flash(Math.cos(sweep + .75) * size * .7, Math.sin(sweep + .75) * size * .7, size * .55, secondary, .45);`;
}
function sanitizeVisualScript(value, fallbackMove, type) {
  let script = String(value || "").trim().replace(/^```(?:javascript|js)?\s*/i, "").replace(/\s*```$/i, "");
  const blocked = /\b(?:window|document|globalThis|fetch|XMLHttpRequest|WebSocket|location|navigator|localStorage|sessionStorage|eval|Function|constructor|prototype|__proto__|setTimeout|setInterval|import|require)\b/;
  if (!script || script.length > 4200 || blocked.test(script)) script = visualScriptFallback(fallbackMove, type);
  return script;
}
function compileVisualScript(script) {
  if (visualScriptCache.has(script)) return visualScriptCache.get(script);
  let fn = null;
  try { fn = new Function("api", "t", "p", "active", "size", "color", "secondary", "move", "Math", `"use strict";\n${script}`); } catch { fn = null; }
  visualScriptCache.set(script, fn);
  return fn;
}
function runVisualScript(state, x, y, size, active, progress) {
  const script = state.visual?.script; if (!script) return false;
  const move = state.move || {}, v = state.visual || {}, baseX = x, baseY = y;
  const alpha = (value = 1) => Math.max(0, Math.min(1, Number(value) || 0));
  const api = {
    line: (x1, y1, x2, y2, stroke = v.color, width = 4, opacity = 1) =>
      glowStroke(() => { ctx.beginPath(); ctx.moveTo(baseX + x1, baseY + y1); ctx.lineTo(baseX + x2, baseY + y2); }, stroke, width, alpha(opacity)),
    arc: (cx, cy, radius, start, end, stroke = v.color, width = 4, opacity = 1) =>
      glowStroke(() => { ctx.beginPath(); ctx.arc(baseX + cx, baseY + cy, Math.max(0, radius), start, end); }, stroke, width, alpha(opacity)),
    ring: (cx, cy, radius, stroke = v.color, width = 4, opacity = 1) => api.arc(cx, cy, radius, 0, Math.PI * 2, stroke, width, opacity),
    circle: (cx, cy, radius, fill = v.color, stroke = "", width = 0, opacity = 1) => {
      glowFill(() => { ctx.beginPath(); ctx.arc(baseX + cx, baseY + cy, Math.max(0, radius), 0, Math.PI * 2); }, fill, alpha(opacity), Math.max(8, radius * .9));
      if (stroke && width) api.ring(cx, cy, radius, stroke, width, opacity);
    },
    spark: (cx, cy, radius, stroke = v.secondary, count = 6, rotation = 0) => {
      const n = Math.max(2, Math.min(18, count));
      for (let i = 0; i < n; i++) { const ang = rotation + i * Math.PI * 2 / n, inner = radius * .25, outer = radius * (.8 + (i % 3) * .18); api.line(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner, cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer, stroke, 2 + radius * .035, active ? .9 : .2); }
    },
    // A tapering swipe: the shape a limb actually carves through the air.
    slash: (cx, cy, radius, start, sweep, stroke = v.color, width = 8, opacity = 1) => {
      const steps = 9;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const taper = Math.sin(Math.PI * (t0 * .85 + .1));
        api.arc(cx, cy, radius * (.92 + t0 * .16), start + sweep * t0, start + sweep * t1, stroke, width * taper, opacity * (.35 + taper * .65));
      }
    },
    // Speed lines trailing behind motion.
    streak: (cx, cy, length, count = 4, stroke = v.secondary, spread = 26, opacity = 1) => {
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * spread, taper = 1 - Math.abs(i - (count - 1) / 2) / Math.max(1, count);
        api.line(cx, cy + off, cx - length * (.55 + taper * .6), cy + off * 1.25, stroke, 2 + taper * 3.5, opacity * (.3 + taper * .55));
      }
    },
    // An expanding ground ring, drawn in perspective.
    shock: (cx, cy, radius, stroke = v.color, width = 5, opacity = 1) =>
      glowStroke(() => { ctx.beginPath(); ctx.ellipse(baseX + cx, baseY + cy, Math.max(0, radius), Math.max(0, radius * .3), 0, 0, Math.PI * 2); }, stroke, width, alpha(opacity)),
    // A solid cone of force pointing forward.
    wedge: (cx, cy, length, spread, fill = v.color, opacity = 1) =>
      glowFill(() => { ctx.beginPath(); ctx.moveTo(baseX + cx, baseY + cy); ctx.lineTo(baseX + cx + length, baseY + cy - spread); ctx.lineTo(baseX + cx + length * 1.12, baseY + cy); ctx.lineTo(baseX + cx + length, baseY + cy + spread); ctx.closePath(); }, fill, alpha(opacity), 22),
    // A hot flash that blooms and fades - use at the moment of contact.
    flash: (cx, cy, radius, fill = v.secondary, opacity = 1) => {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const gradient = ctx.createRadialGradient(baseX + cx, baseY + cy, 0, baseX + cx, baseY + cy, Math.max(1, radius));
      gradient.addColorStop(0, mixHex(fill, "#ffffff", .85)); gradient.addColorStop(.4, fill); gradient.addColorStop(1, "transparent");
      ctx.globalAlpha = alpha(opacity); ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(baseX + cx, baseY + cy, Math.max(1, radius), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    },
    glow: (stroke = v.color, blur = size * .4) => { ctx.shadowColor = stroke; ctx.shadowBlur = Math.max(0, Math.min(80, Number(blur) || 0)); },
    asset: (id, ox = 0, oy = 0, drawSize = size * 2, opacity = 1, rotation = 0) => { if (VFX_IDS.has(id)) drawVfxAsset(id, state.t * (Number(v.vfxFps) || 18), baseX + ox, baseY + oy, Math.max(20, Math.min(280, Number(drawSize) || size)), alpha(opacity), rotation); },
    // Draw this move's weapon wherever the program wants it, so an author can
    // choreograph the swing themselves instead of taking the default arc.
    weapon: (ox = 0, oy = 0, rotation = 0, length = 0, opacity = 1) => {
      const image = weaponImage(v.weapon); if (!image) return;
      const entry = WEAPON_BY_ID.get(v.weapon);
      const width = Math.max(40, Math.min(260, Number(length) || entry.reach * .82));
      const height = width * (image.naturalHeight / Math.max(1, image.naturalWidth));
      ctx.save(); ctx.globalAlpha = alpha(opacity); ctx.translate(baseX + ox, baseY + oy); ctx.rotate(Number(rotation) || 0);
      ctx.drawImage(image, -width * .18, -height * .5, width, height); ctx.restore();
    }
  };
  const fn = compileVisualScript(script); if (!fn) return false;
  try { ctx.save(); ctx.shadowBlur = 0; fn(api, state.t, progress, active, size, v.color, v.secondary, move, Math); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore(); return true; }
  catch { ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore(); return false; }
}
function normalizeMove(move, fighterConfig = {}, depth = 0) {
  const raw = typeof move === "string" ? { name: move, type: "melee" } : (move || {});
  const type = ["melee", "projectile", "combo", "trap", "grapple", "freeze", "teleport", "pillar", "bomb", "gun"].includes(raw.type) ? raw.type : "melee";
  const visualInput = typeof raw.visual === "string" ? { effect: raw.visual } : (raw.visual || {});
  const behaviorInput = raw.behavior || {};
  const animationInput = raw.animation || {};
  const visual = { ...moveVisualDefaults[type], ...visualInput };
  const behavior = { ...moveBehaviorDefaults[type], ...behaviorInput };
  const animation = { ...moveAnimationDefaults[type], ...animationInput };
  const effectAliases = { slash: "slashes", slashwave: "slashes", ring: "rune", circle: "orb", explosion: "burst", chain: "grapple", lock: "grapple" };
  const allowedEffects = ["arc", "orb", "slashes", "rune", "beam", "burst", "grapple", "freeze", "teleport", "pillar"];
  visual.effect = effectAliases[String(visual.effect || "").toLowerCase()] || String(visual.effect || moveVisualDefaults[type].effect).toLowerCase();
  if (!allowedEffects.includes(visual.effect)) visual.effect = moveVisualDefaults[type].effect;
  visual.color = /^#[0-9a-f]{6}$/i.test(visual.color) ? visual.color : (fighterConfig.accent || moveVisualDefaults[type].color);
  visual.secondary = /^#[0-9a-f]{6}$/i.test(visual.secondary) ? visual.secondary : (fighterConfig.color || moveVisualDefaults[type].secondary);
  visual.size = clampNumber(visual.size, 12, 130, moveVisualDefaults[type].size);
  visual.spriteUrl = /^https?:\/\/[^\s"'<>]+$/i.test(String(visual.spriteUrl || "")) ? String(visual.spriteUrl).slice(0, 600) : "";
  visual.soundUrl = /^https?:\/\/[^\s"'<>]+$/i.test(String(visual.soundUrl || "")) ? String(visual.soundUrl).slice(0, 600) : "";
  const vfxDefault = VFX_DEFAULTS[type] || VFX_DEFAULTS.melee;
  visual.mainVfx = VFX_IDS.has(visual.mainVfx) ? visual.mainVfx : vfxDefault.mainVfx;
  visual.hitVfx = VFX_IDS.has(visual.hitVfx) ? visual.hitVfx : vfxDefault.hitVfx;
  visual.vfxFps = clampNumber(visual.vfxFps, 6, 30, 18);
  visual.script = sanitizeVisualScript(visual.script, raw, type);
  const allowedMotion = ["none", "projectile", "trap", "dash", "dash-attack", "slide", "dive-kick", "rapid-jab", "charge", "bomb", "pull", "grapple", "teleport", "pillar", "gun", "wall-slam", "spin", "multi-uppercut", "fly-in", "ground-pound"];
  behavior.motion = String(behavior.motion || moveBehaviorDefaults[type].motion).toLowerCase();
  if (!allowedMotion.includes(behavior.motion)) behavior.motion = moveBehaviorDefaults[type].motion;
  behavior.speed = clampNumber(behavior.speed, 0, type === "gun" || behavior.motion === "gun" ? 1600 : 700, moveBehaviorDefaults[type].speed);
  behavior.radius = clampNumber(behavior.radius, 0, 140, moveBehaviorDefaults[type].radius);
  behavior.shots = Math.round(clampNumber(behavior.shots, 1, 3, 1));
  behavior.lifetime = clampNumber(behavior.lifetime, .35, 3, moveBehaviorDefaults[type].lifetime || 1.2);
  behavior.hold = clampNumber(behavior.hold, .08, 1.2, moveBehaviorDefaults[type].hold || .2);
  behavior.freeze = clampNumber(behavior.freeze, .25, 2.5, moveBehaviorDefaults[type].freeze || .95);
  behavior.offset = clampNumber(behavior.offset, 40, 180, moveBehaviorDefaults[type].offset || 92);
  behavior.charge = clampNumber(behavior.charge, .12, 2.5, moveBehaviorDefaults[type].charge || .5);
  behavior.chargePower = clampNumber(behavior.chargePower, .7, 2.5, moveBehaviorDefaults[type].chargePower || 1.35);
  behavior.dashDistance = clampNumber(behavior.dashDistance, 30, 300, moveBehaviorDefaults[type].dashDistance || 110);
  behavior.fuse = clampNumber(behavior.fuse, .18, 2.5, moveBehaviorDefaults[type].fuse || .62);
  behavior.pattern = ["straight", "arc", "fan", "boomerang", "orbit", "rain"].includes(String(behavior.pattern).toLowerCase()) ? String(behavior.pattern).toLowerCase() : (moveBehaviorDefaults[type].pattern || "straight");
  behavior.gravity = clampNumber(behavior.gravity, -1600, 1600, 0);
  if (Number(behavior.hits) > 1) behavior.hits = Math.round(clampNumber(behavior.hits, 2, 10, 4));
  if (behavior.hitInterval != null) behavior.hitInterval = clampNumber(behavior.hitInterval, .04, .2, .07);
  // A move may equip a weapon from the library; anything unrecognised is
  // simply dropped rather than drawn as a missing image.
  visual.weapon = WEAPON_IDS.has(String(raw.visual?.weapon || "")) ? String(raw.visual.weapon) : "";
  // A second weapon in the off hand. Only meaningful alongside a main hand, so
  // a stray offhand id on an unarmed move is dropped.
  visual.weaponOffhand = visual.weapon && WEAPON_IDS.has(String(raw.visual?.weaponOffhand || "")) ? String(raw.visual.weaponOffhand) : "";
  visual.weaponScale = clampNumber(raw.visual?.weaponScale, .35, 1.8, 1);
  behavior.weaponMotionOffhand = WEAPON_MOTIONS.includes(String(raw.behavior?.weaponMotionOffhand || "").toLowerCase()) ? String(raw.behavior.weaponMotionOffhand).toLowerCase() : "";
  behavior.weaponMotion = WEAPON_MOTIONS.includes(String(raw.behavior?.weaponMotion || "").toLowerCase())
    ? String(raw.behavior.weaponMotion).toLowerCase()
    : (visual.weapon ? WEAPON_DEFAULT_MOTION[WEAPON_BY_ID.get(visual.weapon).weaponClass] || "swipe" : "");
  // A weapon has physical length, so an armed move reaches further than a fist
  // unless the author already said otherwise.
  const weaponReach = visual.weapon && !(Number(raw.reach) > 0) ? WEAPON_BY_ID.get(visual.weapon).reach : Number(raw.reach) || 0;
  if (behavior.motion === "wall-slam") behavior.carrySpeed = clampNumber(behavior.carrySpeed, 420, 1500, 900);
  if (behavior.motion === "multi-uppercut") behavior.rise = clampNumber(behavior.rise, 120, 620, 300);
  if (behavior.motion === "fly-in") { behavior.flySpeed = clampNumber(behavior.flySpeed ?? behavior.speed, 320, 1100, 620); behavior.flyHeight = clampNumber(behavior.flyHeight, 0, 260, 96); }
  if (behavior.motion === "ground-pound") { behavior.slamSpeed = clampNumber(behavior.slamSpeed, 480, 1600, 980); behavior.shockRadius = clampNumber(behavior.shockRadius, 90, 420, 210); }
  if (behavior.motion === "slide") behavior.slideSpeed = clampNumber(behavior.slideSpeed ?? behavior.speed, 180, 560, 360);
  behavior.homing = clampNumber(behavior.homing, 0, 1, 0);
  behavior.spread = clampNumber(behavior.spread, -75, 75, behavior.pattern === "fan" ? 22 : 0);
  behavior.bounces = Math.round(clampNumber(behavior.bounces, 0, 3, 0));
  behavior.orbitRadius = clampNumber(behavior.orbitRadius, 24, 220, 84);
  behavior.orbitSpeed = clampNumber(behavior.orbitSpeed, -12, 12, 3.5);
  behavior.returnDelay = clampNumber(behavior.returnDelay, .15, 1.5, .62);
  const moveName = String(raw.name || "").toLowerCase();
  // Name heuristics exist to rescue a move whose author never said what it is.
  // They must never overrule a motion that was declared outright, and they match
  // on whole words - "Wall Crusher" is not a rush, and was quietly becoming one.
  const declaredMotion = allowedMotion.includes(String(raw.behavior?.motion || "").toLowerCase()) ? String(raw.behavior.motion).toLowerCase() : null;
  const rapidJab = behavior.motion === "rapid-jab" || Number(behavior.rapidHits) > 1
    || (!declaredMotion && /\b(?:rapid|ora|barrage|flurry|rush)\b/.test(moveName) && /\b(?:jab|jabs|punch|punches|fist|fists|barrage|rush)\b/.test(moveName));
  const diveKick = behavior.motion === "dive-kick" || (!declaredMotion && /\bdive.?kick\b|\bmeteor kick\b|\bstomp kick\b/.test(moveName));
  if (rapidJab) behavior.motion = "rapid-jab";
  if (diveKick) behavior.motion = "dive-kick";
  behavior.rapidHits = rapidJab ? Math.round(clampNumber(behavior.rapidHits, 2, 8, 5)) : 1;
  behavior.rapidInterval = clampNumber(behavior.rapidInterval, .045, .18, .075);
  behavior.status = ["none", "freeze"].includes(String(behavior.status).toLowerCase()) ? String(behavior.status).toLowerCase() : (type === "freeze" ? "freeze" : "none");
  behavior.element = ["fire", "ice", "stone", "lightning", "shadow", "energy"].includes(String(behavior.element).toLowerCase()) ? String(behavior.element).toLowerCase() : (visual.element || moveBehaviorDefaults[type].element || "energy");
  behavior.knockback = normalizeKnockback(behavior.knockback, type, raw);
  visual.element = behavior.element;
  animation.style = ["strike", "kick", "spin", "grapple", "slam", "dash", "cast"].includes(String(animation.style).toLowerCase()) ? String(animation.style).toLowerCase() : moveAnimationDefaults[type].style;
  animation.windup = ["none", "coil", "crouch", "reach", "hop", "spin"].includes(String(animation.windup).toLowerCase()) ? String(animation.windup).toLowerCase() : moveAnimationDefaults[type].windup;
  animation.contact = ["fist", "foot", "grab", "hook", "body", "energy", "slash"].includes(String(animation.contact).toLowerCase()) ? String(animation.contact).toLowerCase() : moveAnimationDefaults[type].contact;
  animation.finish = ["recoil", "follow-through", "throw", "slam", "spin", "snap", "hold"].includes(String(animation.finish).toLowerCase()) ? String(animation.finish).toLowerCase() : moveAnimationDefaults[type].finish;
  animation.intensity = clampNumber(animation.intensity, .45, 1.6, moveAnimationDefaults[type].intensity);
  animation.gesture = String(animation.gesture || ({ melee:"palm", projectile:"cast", combo:"spin", grapple:"clinch", freeze:"cast", teleport:"blink", pillar:"slam", trap:"rune", bomb:"bomb" }[type] || "strike")).toLowerCase().slice(0, 24);
  animation.transform = normalizeFreeTransform(animation.transform);
  // A follow-up is a second move that only exists as a sequel to this one:
  // land the parent, and a short window opens where the sequel is available.
  // Nesting stops at one level so a chain of follow-ups cannot recurse.
  const followUp = raw.followUp && depth < 1 ? normalizeMove({ ...raw.followUp, followUp: null }, fighterConfig, depth + 1) : null;
  const followUpWindow = followUp ? clampNumber(raw.followUpWindow, .18, 1.2, .55) : 0;
  return { ...raw, ...(weaponReach > 0 ? { reach: weaponReach } : {}), type, name: String(raw.name || "Unnamed Move").slice(0, 28), role: String(raw.role || "auto"), launcher: raw.launcher === true || raw.role === "launcher", air: raw.air === true || diveKick, juggle: Math.round(clampNumber(raw.juggle, 1, 15, raw.type === "combo" ? 3 : 4)), followUp, followUpWindow, visual, behavior, animation };
}
const rebuiltKungFuConfig = {
  name: "Kung Fu Man",
  author: "Fighter Forge",
  style: "classic pressure fighter / disciplined rushdown",
  personality: "calm, focused, and impossible to keep down",
  backstory: "A traveling martial artist who turns every exchange into a lesson and every lesson into another hit.",
  buttons: 6,
  combo: 2,
  emojis: ["👊", "🦵", "🐉", "💥"],
  color: "#f2c447",
  accent: "#e65342",
  banter: [],
  specials: [
    { name:"Iron Palm", type:"melee", role:"light-punch", variant:"light", startup:5, active:3, endlag:10, hitstun:15, reach:138, visual:{ effect:"arc", mainVfx:"main_slash2_color1", hitVfx:"hit_round_spark", vfxFps:20, color:"#f2c447", secondary:"#fff8d2", size:56, emoji:"✦" }, behavior:{ motion:"none", radius:0, knockback:{ horizontal:150, vertical:0, hitstop:.035, carry:true } }, animation:{ style:"strike", windup:"none", contact:"fist", finish:"follow-through", intensity:.78, transform:{ rotateY:-18, scaleX:1.08 } } },
    { name:"Ora Barrage", type:"combo", role:"light-punch", variant:"light", startup:4, active:15, endlag:8, hitstun:28, reach:174, visual:{ effect:"slashes", mainVfx:"main_slash3_color2", hitVfx:"hit_middle_directional", vfxFps:24, color:"#ff6c61", secondary:"#fff0b4", size:68, emoji:"ORA" }, behavior:{ motion:"rapid-jab", rapidHits:5, rapidInterval:.075, radius:0, knockback:{ horizontal:70, vertical:0, hitstop:.025, carry:true } }, animation:{ style:"strike", windup:"none", contact:"fist", finish:"follow-through", gesture:"ora barrage", intensity:1.08, transform:{ scaleX:1.12, skewY:.12 } } },
    { name:"Rising Palm", type:"melee", role:"launcher", variant:"heavy", launcher:true, juggle:8, startup:8, active:4, endlag:12, hitstun:32, reach:148, visual:{ effect:"burst", mainVfx:"main_slash3_color2", hitVfx:"hit_bottom_directional", vfxFps:20, color:"#ff7043", secondary:"#ffe48a", size:78, emoji:"▲" }, behavior:{ motion:"dash", speed:90, radius:0, knockback:{ horizontal:100, vertical:680, angle:62, hitstop:.1, carry:true } }, animation:{ style:"strike", windup:"crouch", contact:"fist", finish:"follow-through", intensity:1.08, transform:{ rotateX:-28, rotateZ:18, offsetY:-10, scaleY:1.08 } } },
    { name:"Meteor Dive Kick", type:"combo", role:"air-heavy-kick", variant:"heavy", air:true, juggle:3, startup:4, active:8, endlag:14, hitstun:24, reach:178, visual:{ effect:"slashes", mainVfx:"main_slash3_color3", hitVfx:"hit_bottom_directional", vfxFps:22, color:"#56d9ff", secondary:"#eefcff", size:76, emoji:"↘" }, behavior:{ motion:"dive-kick", speed:360, radius:0, knockback:{ horizontal:270, vertical:115, angle:18, hitstop:.075, carry:false, groundBounce:true } }, animation:{ style:"kick", windup:"hop", contact:"foot", finish:"follow-through", gesture:"dive kick", intensity:1.18, transform:{ rotateX:22, rotateZ:-28, offsetX:18, offsetY:14, scaleX:1.14, scaleY:1.08 } } },
    { name:"Dragon Breath", type:"projectile", role:"special", variant:"heavy", startup:16, active:4, endlag:26, hitstun:16, reach:520, visual:{ effect:"beam", mainVfx:"main_vfx_repeatable", hitVfx:"hit_firework", vfxFps:18, color:"#ff7043", secondary:"#ffe48a", size:30, emoji:"🐉" }, behavior:{ motion:"projectile", speed:470, radius:28, shots:1, knockback:{ horizontal:300, vertical:20, hitstop:.05, carry:false } }, animation:{ style:"cast", windup:"coil", contact:"energy", finish:"recoil", intensity:1.1, transform:{ rotateX:12, rotateY:-20, scaleY:1.12, orbit:.15 } } }
  ]
};
kungFuMan.config = sanitizeFighter(rebuiltKungFuConfig, normalizeMove, rebuiltKungFuConfig);
// These authored benchmark attacks predate the editor's explicit category
// field. Keep them in the signature-special pool when the universal normals
// are backfilled at runtime.
kungFuMan.config.specials = kungFuMan.config.specials.map((move) => ({ ...move, category: move.category || "special" }));
kungFuMan.script = buildFighterModule(kungFuMan.config, normalizeMove);


// ─────────────────────────────────────────────────────────────────────────────
// COMBAT RULES
// Every tunable number the fight engine leans on lives here so the feel of a
// match can be adjusted in one place instead of hunting through the systems.
// ─────────────────────────────────────────────────────────────────────────────
const RULES = {
  maxHp: 160, roundTime: 99, roundsToWin: 2,
  floorY: 534, wallLeft: 115, wallRight: 1165, cornerZone: 105,
  meterMax: 100, superCost: 100, exCost: 35,
  meterOnDealt: .55, meterOnTaken: .95, meterOnBlocked: .38, meterOnWhiff: .8,
  guardMax: 100, guardRegen: 23, guardCostBase: 2.2, guardCostScale: .85, guardImmuneAfterBreak: 1.6,
  // Guard push: the defender's answer to a blockstring. It costs meter, shoves
  // the attacker out of range, and buys back a slice of guard - so holding
  // block is a choice with an exit, not a slow loss.
  pushblockCost: 20, pushblockPush: 560, pushblockCooldown: .85, pushblockGuardRefund: 14,
  // How worn down the guard has to get before the AI stops trusting it.
  guardPanicRatio: .46, guardStreakLimit: 3,
  guardBreakStun: 1.05, chipRatio: .12, blockPushback: 190, blockstunRatio: .74,
  // Long combos are a style flex, not a kill: damage scales down hard and
  // bottoms out low, so a 40-hit route does less than four clean hits.
  comboScaleStep: .9, minScale: .08, scalingFloorHits: 24,
  comboMaxHits: 48, gatlingDepth: 4, airStringDepth: 5,
  juggleGravityStep: .045, maxJuggleGravity: 1.9, juggleStart: .62,
  juggleBudget: 46, juggleCostDefault: 1, launchHeight: 760,
  techWindow: .16, hardKnockdown: .92, softKnockdown: .58, wakeupInvuln: .3,
  // Bounces are the connective tissue of a long route: each one is a free
  // extension, so each is limited to once per combo.
  groundBounceHeight: 560, wallBounceSpeed: 560, wallBounceHeight: 600,
  bounceJuggle: 22, otgWindow: .5, otgJuggle: 14,
  counterDamage: 1.35, counterHitstun: 1.45,
  gravity: 1700, koSlowmo: .26,
  // One deliberate burst of horizontal control per jump. The dash is short
  // enough to be a positioning tool, not a way to permanently hover.
  airDashDuration: .18, airDashSpeed: 760
};
const ARCHETYPES = {
  rushdown: { idealGap: 118, aggression: .96, blockBias: .78, jumpBias: 1.15, zoneBias: .25, punish: 1.05, patience: .35 },
  zoner:    { idealGap: 395, aggression: .48, blockBias: 1.15, jumpBias: .5,  zoneBias: 1.85, punish: .85, patience: .85 },
  grappler: { idealGap: 148, aggression: .88, blockBias: 1.3,  jumpBias: .55, zoneBias: .2,  punish: 1.2,  patience: .55 },
  balanced: { idealGap: 205, aggression: .74, blockBias: 1,    jumpBias: .85, zoneBias: .75, punish: 1,    patience: .6 }
};
const camera = { x: 640, y: 330, zoom: 1, targetX: 640, targetY: 330, targetZoom: 1, focus: null };

function foeOf(me) { return battle?.fighters.find(f => f !== me) || null; }
function inCorner(f) { return f.x <= RULES.wallLeft + RULES.cornerZone || f.x >= RULES.wallRight - RULES.cornerZone; }
function addShake(power) { if (battle) battle.shake = Math.max(battle.shake || 0, power); }
function addHitstop(seconds) { if (battle) battle.hitstop = Math.max(battle.hitstop || 0, seconds); }
function gainMeter(f, amount) { if (f) f.meter = Math.min(RULES.meterMax, (f.meter || 0) + amount); }
function spendMeter(f, amount) { if (!f || (f.meter || 0) < amount) return false; f.meter -= amount; return true; }
function resetCombo(f) {
  // Every extender the victim spent surviving this combo is refunded when the
  // combo ends, so the next one gets the same tools.
  const victim = f.combo.target;
  if (victim) { victim.bounceUsed = false; victim.wallBounceUsed = false; victim.otgUsed = false; victim.groundBouncePending = 0; }
  f.combo.timer = 0; f.combo.count = 0; f.combo.target = null; f.combo.scale = 1; f.combo.damage = 0;
}

function fighterArchetype(me) {
  const authored = String(me.fighter.config?.ai?.archetype || "").toLowerCase();
  if (ARCHETYPES[authored]) return authored;
  const moves = combatMoves(me), total = moves.length || 1;
  const signature = moves.filter(move => !/^(?:light|medium|heavy) (?:punch|kick)$/i.test(String(move.name || "")));
  const signatureTotal = signature.length || total;
  const ranged = signature.filter(isRanged).length / signatureTotal;
  const grapples = signature.filter(isGrapple).length / signatureTotal;
  const fast = signature.filter(move => moveFrames(move).startup <= 8).length / signatureTotal;
  if (ranged >= .5) return "zoner";
  if (grapples >= .34) return "grappler";
  if (fast >= .5 || (Number(me.fighter.config?.combo) || 2) >= 4) return "rushdown";
  return "balanced";
}

// How dangerous is the opponent's current attack, right now, to me?
// 0 means no reason to respect it; 1 means it is about to become active in my face.
function threatLevel(me, foe) {
  const state = foe.attackState; if (!state) return 0;
  const remaining = state.startup / 60 - state.t;
  const distance = Math.abs(foe.x - me.x), range = (state.hitRange || 180) + 46;
  if (distance > range) return 0;
  // Startup is the best time to react, but an attack that is already active
  // is still dangerous. Dropping threat to zero on the first active frame made
  // custom fighters walk into slow, obvious swings instead of respecting them.
  const activeEnd = (state.startup + state.active) / 60;
  if (remaining < -.03) return state.t <= activeEnd ? .92 : 0;
  return Math.max(0, Math.min(1, 1 - remaining / .34));
}
// A move that has passed its active frames without confirming is a free punish.
function foeIsWhiffing(me, foe) {
  const state = foe.attackState; if (!state || state.grapple) return false;
  const activeEnd = (state.startup + state.active) / 60;
  return state.t > activeEnd && !state.hitConfirmed && state.duration - state.t > .1;
}
function incomingProjectile(me) {
  return (battle?.projectiles || []).find(p => p.target === me && !p.trap && !p.pillar && !p.exploding
    && Math.abs(p.x - me.x) < 430 && (me.x - p.x) * (p.vx || 0) > 0);
}
function isOverhead(move, variant) { return variant === "air" || move?.overhead === true || /overhead|axe|dive|hammer|drop/i.test(move?.name || ""); }
function isLowHit(move, variant) { return variant === "crouch" || move?.low === true || /sweep|low|shin|ankle|slide/i.test(move?.name || ""); }
function startBattle() {
  const left = fighterById(selected[0]), right = fighterById(selected[1]);
  document.body.classList.add("in-match");
  battle = { left, right, fighters:[makeCombatant(left, FIGHT_START_LEFT, 1), makeCombatant(right, FIGHT_START_RIGHT, -1)], projectiles:[], phase:"intro", elapsed:0, shake:0, hitstop:0, round:1, wins:[0,0], maxRounds:3, messageIndex:0, introLines:null, result:"", clock:RULES.roundTime, koTimer:0, pendingWinner:null, bannerTimer:0 };
  camera.x = camera.targetX = 640; camera.y = camera.targetY = 330; camera.zoom = camera.targetZoom = 1; camera.focus = null;
  $("#left-name").textContent = left.name.toUpperCase(); $("#right-name").textContent = right.name.toUpperCase(); $("#left-wins").textContent = 0; $("#right-wins").textContent = 0; $("#result").classList.remove("show"); $("#rematch").hidden = true;
  $("#mode-label").textContent = "WATCH MODE"; $("#round-text").textContent = "ROUND 1"; $("#timer").textContent = RULES.roundTime; hideComboReadout(); hideMoveCallout(); clearBanter(); updateHud();
  beginPreFightDialogue(battle);
}
function showBanner(text, duration = 1.1, tone = "") {
  const el = $("#result"); el.textContent = text; el.dataset.tone = tone; el.classList.add("show");
  if (battle) battle.bannerTimer = duration;
}
function hideBanner() { const el = $("#result"); el.classList.remove("show"); el.removeAttribute("data-tone"); if (battle) battle.bannerTimer = 0; }
function beginRoundProper() {
  battle.phase = "fight"; battle.elapsed = 0; battle.clock = RULES.roundTime; clearBanter();
  playSfx("getSet", { volume: .85 });
  showBanner("FIGHT!", .75, "go");
}
function makeCombatant(fighter,x,dir) {
  const aptitude = Number(fighter.config?.combo) || 2;
  // A forged kit is the thing being tested, so its pilot gets decisive inputs
  // and a good read on neutral. Kung Fu Man remains the transparent baseline:
  // competent enough to teach the systems, but not a hidden final boss.
  const forgePilot = !fighter.example;
  // Custom stat sliders (1-5). KFM is locked at 1 (lowest) on every axis.
  const statSmartness  = forgePilot ? Math.max(1, Math.min(5, Number(fighter.config?.smartness)  || 3)) : 1;
  const statAggression = forgePilot ? Math.max(1, Math.min(5, Number(fighter.config?.aggression) || 3)) : 1;
  const statDefense    = forgePilot ? Math.max(1, Math.min(5, Number(fighter.config?.defense)    || 3)) : 1;
  const statSpeed      = forgePilot ? Math.max(1, Math.min(5, Number(fighter.config?.speed)      || 3)) : 1;
  const statRange      = forgePilot ? Math.max(1, Math.min(5, Number(fighter.config?.range)      || 3)) : 3;
  // Smartness 1 ≈ original KFM (~0.38-0.46 skill); 5 ≈ improved KFM (~0.72-0.80).
  const skillBase = 0.38 + (statSmartness - 1) * 0.085;
  const skill = Math.min(skillBase + 0.10, Math.max(skillBase - 0.02,
    skillBase + (aptitude - 2) * .02 + (Math.random() - .5) * .04));
  const c = { fighter, x, y:RULES.floorY, vy:0, vx:0, grounded:true, hp:RULES.maxHp, dir, hurt:0, hitDirection:0, bounceTimer:0, frozen:0, invuln:0, hitstunFrames:0, recovery:null, recoveryAttempted:false, recoveryCooldown:0, attack:0, attackState:null, pose:"idle", cd:0, jumpCd:.2, crouch:0, running:false, runJump:false, blocking:false, blockTimer:0, blockFlash:0, trail:[], effects:[], dodge:0, airDash:0, airDashUsed:false, airDashDir:dir, airComboTarget:null, airComboTimer:0, airComboJumpQueued:false, airComboHits:0, juggle:0, juggleGravity:1, comboPlan:null, comboStep:0, comboPlanSerial:0, grappleTarget:null, grappledBy:null, grappledState:null, grappleLock:0,
    meter:0, guard:RULES.guardMax, guardBroken:0, guardImmune:0, wallSlam:null, blockLow:false, guardFlash:0, down:null, techTimer:0, counterFlash:0, superFlash:0, backdash:0, damageTaken:0,
    groundBouncePending:0, bounceUsed:false, wallBounceUsed:false, otgUsed:false, followUpWindow:null, pushblockCd:0, guardStreak:0,
    combo:{ count:0, timer:0, target:null, scale:1, damage:0, max:Math.round(8 + aptitude * 8) } };
  // A high combo stat is not just a longer counter - it is a faster, lighter
  // fighter. Agility scales startup, recovery, footspeed and jump arc, so the
  // combo-heavy blueprints actually move like combo characters.
  // Low combo aptitude should mean shorter routes, not a fighter who cannot
  // physically play neutral. Custom fighters get a reliable baseline, then
  // still scale upward with the authored combo stat.
  const agilityFloor = fighter.example ? .9 : .85 + (statSpeed - 1) * .065;
  c.agility = Math.min(1.38, Math.max(agilityFloor, agilityFloor + (aptitude - 2) * .07));
  // Range stat scales how far this fighter's attacks reach and how the AI reads space.
  c.reachMult = fighter.example ? 1.0 : 0.82 + (statRange - 1) * 0.095; // 1: 0.82, 3: 1.01, 5: 1.20
  const archetype = fighterArchetype(c), authoredAi = fighter.config?.ai || {}, ranges = aiMoveRanges(c);
  const clampAi = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const authoredGap = clampAi(authoredAi.idealGap, 80, 500, ARCHETYPES[archetype].idealGap);
  // AI-authored spacing is a hint, not a teleport target. A generated fighter
  // with a short-range kit should still enter its own range even if the pilot
  // pass guessed a zoner-like gap, while a real projectile kit keeps its room.
  const gapCeiling = archetype === "zoner" ? Math.max(300, Math.min(500, ranges.rangedReach * .88)) : Math.max(132, ranges.meleeReach + 28);
  const practicalGap = Math.min(authoredGap, gapCeiling);
  const aggrFloor = forgePilot ? 0.20 + statAggression * 0.15 : 0;
  const aggrCap   = forgePilot ? 0.50 + statAggression * 0.14 : 1.4;
  const patCap    = forgePilot ? 1.40 - statAggression * 0.18 : 1.5;
  const blkCap    = forgePilot ? 1.42 - statDefense * 0.14 : 1.8;
  const punFloor  = forgePilot ? 0.55 + statDefense * 0.14 : 0.25;
  const profile = { ...ARCHETYPES[archetype],
    aggression:Math.min(aggrCap, Math.max(aggrFloor, clampAi(authoredAi.aggression, 0, 1.4, ARCHETYPES[archetype].aggression))),
    idealGap:clampAi(practicalGap, 80, 500, ARCHETYPES[archetype].idealGap),
    blockBias:Math.min(blkCap, clampAi(authoredAi.blockBias, .25, 1.8, ARCHETYPES[archetype].blockBias)),
    jumpBias:clampAi(authoredAi.jumpBias, 0, 1.8, ARCHETYPES[archetype].jumpBias),
    zoneBias:clampAi(authoredAi.zoneBias, 0, 2.2, ARCHETYPES[archetype].zoneBias),
    punish:Math.max(punFloor, clampAi(authoredAi.punish, .25, 1.8, ARCHETYPES[archetype].punish)),
    patience:Math.min(patCap, clampAi(authoredAi.patience, .15, 1.5, ARCHETYPES[archetype].patience)),
    antiAir:clampAi(authoredAi.antiAir, 0, 1.5, .72),
    comboCommit:Math.max(forgePilot ? .88 : .25, clampAi(authoredAi.comboCommit, .25, 1.2, .72)),
    preferredMoves:Array.isArray(authoredAi.preferredMoves) ? authoredAi.preferredMoves.map(name => String(name).toLowerCase()) : [],
    avoidMoves:Array.isArray(authoredAi.avoidMoves) ? authoredAi.avoidMoves.map(name => String(name).toLowerCase()) : []
  };
  c.ai = { skill, archetype, profile, ranges, lastMoveKey:"", hesitation:0,
    intent:"neutral", intentTimer:0, think:Math.random() * .1, reaction:Math.max(.075, .27 - skill * .21),
    blockedStreak:0, hitStreak:0, pressure:0, respect:.5 };
  return c;
}
function fighterDialogueProfile(fighter) {
  const config = fighter.config || {}, moves = Array.isArray(config.specials) ? config.specials.slice(0, 5).map(move => move.name).filter(Boolean).join(", ") : "";
  return `Name: ${fighter.name}. Prompt: ${fighter.prompt || "not supplied"}. Style: ${config.style || "not supplied"}. Personality: ${config.personality || "not supplied"}. Backstory: ${config.backstory || "not supplied"}. Signature moves: ${moves || "not supplied"}.`;
}
async function beginPreFightDialogue(match) {
  const create = window.websim?.chat?.completions?.create;
  // No generic substitute dialogue: an unavailable runtime means an immediate
  // clean jump into the round, exactly like choosing to skip the intro.
  if (typeof create !== "function") { if (battle === match) beginRoundProper(); return; }
  const system = `Write a tiny pre-fight exchange for an arcade fighting game. Return JSON only: {"left":"...","right":"..."}. Each line is 4-16 words, direct speech, and a respectful challenge. Make each voice reflect only the supplied fighter profile. If a profile clearly references existing source material, aim for its broad voice without quoting, claiming canon, or inventing lore facts. Avoid narrator text, stage directions, profanity, and generic arena announcements.`;
  const user = `LEFT FIGHTER\n${fighterDialogueProfile(match.left)}\n\nRIGHT FIGHTER\n${fighterDialogueProfile(match.right)}`;
  try {
    const completion = await Promise.race([
      create({ messages:[{ role:"system", content:system }, { role:"user", content:user }], json:true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Pre-fight dialogue timed out.")), 4500))
    ]);
    const lines = parseAiJson(completion.content);
    const left = String(lines.left || "").replace(/\s+/g, " ").trim().slice(0, 150);
    const right = String(lines.right || "").replace(/\s+/g, " ").trim().slice(0, 150);
    if (!left || !right) throw new Error("Incomplete pre-fight dialogue.");
    if (battle !== match || match.phase !== "intro") return;
    match.introLines = [left, right]; match.phase = "banter"; match.elapsed = 0; match.messageIndex = 0;
    setBanter(left, match.left.name, "left");
  } catch {
    if (battle === match && match.phase === "intro") beginRoundProper();
  }
}
function setBanter(text, speaker = "", side = "left") { const el = $("#banter"); el.querySelector(".banter-speaker").textContent = speaker ? `${speaker.toUpperCase()} // COMMS` : ""; el.querySelector(".banter-text").textContent = text; el.dataset.side = side; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
function clearBanter() { $("#banter").classList.remove("show"); }
function hideComboReadout() { const el = $("#combo-readout"); el.classList.remove("show", "leaving"); el.removeAttribute("data-side"); if (comboReadoutTimer) clearTimeout(comboReadoutTimer); comboReadoutTimer = 0; }
function hideMoveCallout() { const el = $("#move-callout"); if (!el) return; el.classList.remove("show"); if (moveCalloutTimer) clearTimeout(moveCalloutTimer); moveCalloutTimer = 0; }
function showMoveCallout(me, state) {
  const el = $("#move-callout"); if (!el) return;
  const move = state.move, visual = state.visual, behavior = state.behavior;
  el.dataset.side = me === battle.fighters[1] ? "right" : "left";
  el.style.setProperty("--move-color", visual.color);
  el.querySelector(".move-callout-type").textContent = `${move.type} / ${visual.effect}${visual.element ? ` / ${visual.element}` : ""}`.toUpperCase();
  el.querySelector("#move-callout-name").textContent = state.label;
  const pathLabel = behavior.pattern && behavior.pattern !== "straight" ? ` / ${behavior.pattern}` : "";
  el.querySelector("#move-callout-detail").textContent = `${behavior.motion}${pathLabel} · ${state.startup}F STARTUP · ${state.hitstun}F STUN`;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  if (moveCalloutTimer) clearTimeout(moveCalloutTimer);
  moveCalloutTimer = setTimeout(() => el.classList.remove("show"), 900);
}
function showComboReadout(me, count) {
  if (count < 2) return;
  const el = $("#combo-readout"); el.textContent = `${count} hits`; el.dataset.side = me === battle.fighters[1] ? "right" : "left"; el.classList.remove("show", "leaving"); void el.offsetWidth; el.classList.add("show");
  if (comboReadoutTimer) clearTimeout(comboReadoutTimer);
  comboReadoutTimer = setTimeout(() => { el.classList.remove("show"); el.classList.add("leaving"); comboReadoutTimer = setTimeout(() => { el.classList.remove("leaving"); el.removeAttribute("data-side"); }, 330); }, 700);
}
const sfxToggle = $("#sfx-toggle");
if (sfxToggle) {
  const paintSfxToggle = () => { const off = isSfxMuted(); sfxToggle.textContent = off ? "♪ MUTED" : "♪ SOUND"; sfxToggle.classList.toggle("muted", off); sfxToggle.setAttribute("aria-pressed", String(!off)); };
  paintSfxToggle();
  sfxToggle.onclick = () => { primeSfx(); toggleSfxMuted(); paintSfxToggle(); playSfx("menuOk", { volume: .7 }); };
}
$("#start-match").onclick = () => { primeSfx(); playSfx("menuStart", { volume: .9 }); startBattle(); }; $("#rematch").onclick = () => { primeSfx(); playSfx("menuStart", { volume: .9 }); activeSlot = 0; renderRoster(); startBattle(); };

function fightTick(dt) {
  if (!battle) return;
  if (battle.bannerTimer > 0 && (battle.bannerTimer -= dt) <= 0 && battle.phase !== "between" && battle.phase !== "done") hideBanner();
  const [a,b] = battle.fighters;
  if (battle.phase === "intro") { updateCamera(dt, .95); return; }
  if (battle.phase === "banter") {
    battle.elapsed += dt; updateCamera(dt, .95);
    if (battle.elapsed > 1.9 && battle.messageIndex === 0) { setBanter(battle.introLines?.[1] || "", battle.right.name, "right"); battle.messageIndex++; battle.elapsed=0; }
    else if (battle.messageIndex && battle.elapsed > 1.65) beginRoundProper();
    return;
  }
  if (battle.phase === "ko") {
    // The knockout plays out in slow motion with the camera pushed in on the
    // loser, so the last hit of a round actually reads as the last hit.
    const slow = dt * RULES.koSlowmo;
    battle.koTimer -= dt; battle.elapsed += slow; battle.shake = Math.max(0, battle.shake - slow * 1.6);
    updateAttack(a, b, slow); updateAttack(b, a, slow);
    updatePhysics(a, slow); updatePhysics(b, slow); resolvePushBoxes(a, b);
    updateProjectiles(slow); updateCamera(dt, 1.75); updateHud();
    if (battle.koTimer <= 0) awardRound();
    return;
  }
  if (battle.phase === "between") { battle.elapsed += dt; updateCamera(dt, 1); if (battle.elapsed > 2.4) nextRound(); return; }
  if (battle.phase === "done") { updateCamera(dt, 1.25); return; }
  if (battle.hitstop > 0) { battle.hitstop = Math.max(0, battle.hitstop - dt); updateCamera(dt, 1); return; }
  battle.elapsed += dt; battle.shake = Math.max(0, (battle.shake || 0) - dt * 1.7);
  battle.clock = Math.max(0, battle.clock - dt);
  $("#timer").textContent = Math.ceil(battle.clock);
  updateGuard(a, dt); updateGuard(b, dt);
  updateCombo(a, dt); updateCombo(b, dt); updateAttack(a, b, dt); updateAttack(b, a, dt);
  updateAI(a,b,dt); updateAI(b,a,dt); updatePhysics(a,dt); updatePhysics(b,dt); resolvePushBoxes(a,b);
  // Track direction changes for the 3-D turn squash in drawFighter.
  for (const f of battle.fighters) {
    if (f.prevDir === undefined) f.prevDir = f.dir;
    if (f.prevDir !== f.dir) f.turnTimer = 0.11;
    if ((f.turnTimer || 0) > 0) f.turnTimer = Math.max(0, f.turnTimer - dt);
    f.prevDir = f.dir;
  }
  updateProjectiles(dt); updateCamera(dt, 1);
  if (a.hp <= 0 || b.hp <= 0) finishRound(a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0, "K.O.");
  else if (battle.clock <= 0) finishRound(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, "TIME OVER");
  updateHud();
}
function updateGuard(f, dt) {
  if (f.guardBroken > 0) { f.guardBroken = Math.max(0, f.guardBroken - dt); if (f.guardBroken === 0) { f.guard = RULES.guardMax; f.guardImmune = RULES.guardImmuneAfterBreak; } return; }
  f.guardFlash = Math.max(0, f.guardFlash - dt); f.guardImmune = Math.max(0, (f.guardImmune || 0) - dt);
  if (!f.blocking && f.hurt <= 0) f.guard = Math.min(RULES.guardMax, f.guard + RULES.guardRegen * dt);
}
function updateCamera(dt, zoomBias = 1) {
  if (!battle) return;
  const [a,b] = battle.fighters;
  const mid = (a.x + b.x) / 2, gap = Math.abs(a.x - b.x);
  const highest = Math.min(a.y, b.y);
  camera.targetZoom = Math.max(1, Math.min(1.5, (1.34 - Math.max(0, gap - 190) / 1250) * zoomBias));
  camera.targetX = camera.focus ? camera.focus.x * .6 + mid * .4 : mid;
  camera.targetY = 330 + Math.min(0, (highest - RULES.floorY) * .28);
  const ease = Math.min(1, dt * (battle.phase === "ko" ? 3.4 : 5.2));
  camera.zoom += (camera.targetZoom - camera.zoom) * ease;
  camera.x += (camera.targetX - camera.x) * ease;
  camera.y += (camera.targetY - camera.y) * ease;
  const halfW = 640 / camera.zoom, halfH = 360 / camera.zoom;
  camera.x = Math.max(halfW, Math.min(1280 - halfW, camera.x));
  camera.y = Math.max(halfH, Math.min(720 - halfH, camera.y));
}
const UNIVERSAL_THROW = {
  name: "Throw", type: "grapple", variant: "medium", startup: 5, active: 4, endlag: 22, hitstun: 26, reach: 98,
  visual: { effect: "grapple", color: "#ffffff", secondary: "#ffd05d", size: 54, emoji: "\u270a" },
  behavior: { motion: "grapple", finisher: "throw", knockback: { horizontal: 330, vertical: 250, hitstop: .09 } },
  animation: { style: "grapple", gesture: "grab", contact: "grab", finish: "throw", intensity: 1 }
};
function throwMove(me) { return normalizeMove(UNIVERSAL_THROW, me.fighter.config); }

function combatMoves(me) {
  const configured = Array.isArray(me.fighter.config?.specials) ? me.fighter.config.specials : [];
  const moves = configured.map(move => normalizeMove(move, me.fighter.config));
  const basicDefaults = [
    ["Light Punch", "light-punch", "light", 4, 10], ["Medium Punch", "medium-punch", "medium", 6, 12], ["Heavy Punch", "heavy-punch", "heavy", 9, 18],
    ["Light Kick", "light-kick", "light", 5, 11], ["Medium Kick", "medium-kick", "medium", 7, 15], ["Heavy Kick", "heavy-kick", "heavy", 10, 20]
  ];
  const basics = basicDefaults.map(([name, role, variant, startup, endlag]) => moves.find(move => {
    const category = String(move.category || "").toLowerCase();
    const exactName = String(move.name || "").toLowerCase() === name.toLowerCase();
    return category !== "special" && (exactName || (category === "normal" && moveRole(move) === role));
  }) || normalizeMove({ name, role, variant, category:"normal", type:"melee", startup, active:3, endlag, hitstun:variant === "heavy" ? 16 : 12 }, me.fighter.config));
  const combined = [...basics, ...moves.filter(move => !basics.includes(move))];
  return combined.length ? combined : basics;
}
function aiMoveRanges(me) {
  const moves = combatMoves(me);
  const melee = moves.filter(move => !isRanged(move) && !isGrapple(move));
  const ranged = moves.filter(isRanged);
  const practical = melee.filter(move => moveFrames(move).startup <= 14);
  const reachOf = (move, variant = "ground") => moveDecisionRange(move, variant);
  const mult = me.reachMult || 1;
  const meleeReach = Math.max(120, ...melee.map(move => reachOf(move))) * mult;
  const pokeReach = Math.max(112, ...practical.map(move => reachOf(move))) * mult;
  const rangedReach = Math.max(260, ...ranged.map(move => moveReach(move))) * mult;
  return { meleeReach, pokeReach, rangedReach };
}
function isLauncher(move) {
  // Explicit launchers remain hard launchers. A rising attack without that
  // declaration is a soft launcher: it pops both fighters up, then releases
  // early for an air cancel instead of owning the full launcher route.
  if (move?.launcher === true || move?.role === "launcher") return true;
  if (isRisingAttack(move)) return false;
  return /launch|uppercut|breaker|lift|sky|anti.?air|dragon/i.test(move?.name || "");
}
function isRapidJab(move) {
  const name = String(move?.name || "").toLowerCase(), behavior = move?.behavior || {};
  return behavior.motion === "rapid-jab" || Number(behavior.rapidHits) > 1 || (/rapid|ora|barrage|flurry|rush/.test(name) && /jab|punch|fist|barrage|rush/.test(name));
}
function isDiveKick(move) {
  const name = String(move?.name || "").toLowerCase();
  return move?.behavior?.motion === "dive-kick" || /dive.?kick|meteor kick|stomp kick/.test(name);
}
function isGrapple(move) {
  return move?.type === "grapple" || move?.behavior?.motion === "grapple" || /grapple|clinch|throw|slam|suplex|tackle|lock|grab/i.test(move?.name || "");
}
function isFreeze(move) { return move?.type === "freeze" || move?.behavior?.status === "freeze" || /freeze|frost|ice|glacier|stasis/i.test(move?.name || ""); }
function isTeleport(move) { return move?.type === "teleport" || move?.behavior?.motion === "teleport" || /teleport|blink|warp|phase/i.test(move?.name || ""); }
function isPillar(move) { return move?.type === "pillar" || move?.behavior?.motion === "pillar" || /pillar|eruption|geyser|obelisk|spike/i.test(move?.name || ""); }
function isAirComboMove(move) {
  if (isGrapple(move) || isRanged(move)) return false;
  return move?.type === "combo" || move?.air === true || String(moveRole(move) || "").startsWith("air-");
}
function airComboMoves(moves) {
  const explicit = moves.filter(isAirComboMove);
  const safeExplicit = explicit.filter(move => !isLauncher(move));
  const fallback = moves.filter(move => !isGrapple(move) && !isRanged(move) && !isLauncher(move) && !explicit.includes(move));
  // Prefer dedicated aerial buttons, then reuse grounded normals as aerial
  // follow-ups so a sparse generated moveset can still produce a real juggle.
  return [...safeExplicit, ...fallback];
}
function moveFrames(move, variant = "ground") {
  const defaults = moveFrameDefaults(move?.type), value = (key, fallback) => Number(move?.[key]) || fallback;
  const startup = value("startup", defaults.startup), endlag = value("endlag", defaults.endlag), hitstun = value("hitstun", defaults.hitstun);
  return { startup:variant === "crouch" ? startup + 2 : variant === "air" ? Math.max(3, startup - 1) : startup, endlag:variant === "air" ? endlag + 3 : variant === "crouch" ? endlag + 2 : endlag, hitstun:Math.min(60, hitstun + (variant === "air" ? 2 : variant === "crouch" ? 1 : 0)) };
}
function moveRole(move) {
  const name = String(move?.name || "").toLowerCase(), variant = String(move?.variant || "").toLowerCase();
  const air = move?.air === true || /\bair\b|aerial|jump/i.test(name), crouch = move?.crouch === true || /crouch|low|sweep/i.test(name);
  const tier = /light|jab|quick/i.test(name) || variant === "light" ? "light" : /heavy/i.test(name) || variant === "heavy" ? "heavy" : "medium";
  if (move?.role && move.role !== "auto") return String(move.role);
  if (isLauncher(move)) return "launcher";
  if (/punch|jab|fist|palm|strike/.test(name)) return `${air ? "air-" : ""}${tier}-punch`;
  if (/kick|heel|knee/.test(name)) return `${air ? "air-" : ""}${crouch ? `${tier}-crouch` : tier}-kick`;
  return air ? "air-special" : "special";
}
function canLink(previous, next, previousVariant = "ground", nextVariant = "ground", mode = "link") {
  if (!previous || !next) return true;
  const from = moveFrames(previous, previousVariant), into = moveFrames(next, nextVariant);
  const reach = Number(previous?.reach) > 0 && Number(next?.reach) > 0 ? Number(next.reach) + 18 >= Number(previous.reach) * .58 : true;
  const rapidBuffer = isRapidJab(previous) ? 8 : 0;
  // A cancel interrupts the previous move's recovery - that is what makes
  // "normal into special" work at all. A gatling chain gets a smaller
  // discount. A raw link has to beat the full endlag on frame data alone.
  const recovery = mode === "cancel" ? from.endlag * .15 : mode === "gatling" ? from.endlag * .55 : from.endlag;
  // Give links a tiny input buffer. With the old exact comparison, a normal
  // with 12F hitstun could not link into a 6F normal after 10F of recovery
  // (12 < 5.5 + 6 + 1), so generated fighters frequently abandoned their
  // first confirmed string while Kung Fu Man's authored route happened to
  // survive it. The buffer is small enough to keep frame data meaningful.
  return reach && from.hitstun + rapidBuffer + 2 >= recovery + into.startup;
}
function comboCandidates(moves, phase, used = new Set()) {
  const pool = phase === "air" ? airComboMoves(moves) : moves;
  return pool.filter(move => {
    if ((phase !== "air" && used.has(move)) || isRanged(move) || isGrapple(move)) return false;
    const role = moveRole(move), air = role.startsWith("air-") || move.air === true;
    return phase === "air" ? true : !air && !isLauncher(move);
  });
}
function routeScore(route) {
  const preferred = ["light-punch", "medium-punch", "medium-kick", "light-crouch-kick", "heavy-crouch-kick"];
  const gestures = new Set(route.map(step => String(step.move.animation?.gesture || moveRole(step.move))));
  return route.length * 5 + gestures.size * 2 + route.reduce((score, step, index) => score + (moveRole(step.move) === preferred[index] ? 12 : 0) + (step.move.variant === "light" ? 2 : 0) - moveFrames(step.move).startup * .08, 0) + (Math.random() - .5) * 5;
}
function findGroundRoute(moves, launcher) {
  const candidates = comboCandidates(moves, "ground");
  let best = null;
  const visit = (route, used, previous, previousVariant, depth) => {
    if (depth > 5) return;
    if (canLink(previous, launcher, previousVariant, "ground")) {
      const scored = routeScore(route);
      if (!best || scored > best.score) best = { route, score:scored };
    }
    for (const move of candidates) {
      const crouch = move.crouch === true || moveRole(move).includes("crouch") || /crouch|low|sweep/i.test(move.name || ""), nextVariant = crouch ? "crouch" : "ground";
      if (used.has(move) || !canLink(previous, move, previousVariant, nextVariant)) continue;
      used.add(move); route.push({ move, crouch });
      visit(route, used, move, nextVariant, depth + 1);
      route.pop(); used.delete(move);
    }
  };
  visit([], new Set([launcher]), null, "ground", 0);
  return best?.route || null;
}
// ─────────────────────────────────────────────────────────────────────────────
// COMBO ROUTING
// A real route has stages, the way a fighting game does:
//   neutral normals -> gatling into heavier normals -> cancel into a special
//   -> launcher -> air string -> air finisher
// Each stage has its own rules about what may follow what, so a long combo is
// built out of legitimate links rather than repeating one strong button.
// ─────────────────────────────────────────────────────────────────────────────
function moveCategory(move) {
  if (move?.category === "normal" || move?.category === "special") return move.category;
  const rangedType = isRanged(move) || isGrapple(move);
  if (rangedType || isLauncher(move) || moveFrames(move).startup > 10) return "special";
  return "normal";
}
function moveWeight(move) {
  const variant = String(move?.variant || "medium");
  if (variant === "light") return 1;
  if (variant === "heavy") return 3;
  return 2;
}
// How many times this move actually connects, so the planner can reason about
// real hit counts instead of assuming one hit per button.
function moveHitCount(move) {
  const profile = multiHitProfile(move);
  return profile ? profile.hits : 1;
}

// Normals gatling upward in weight; that is what makes a neutral string feel
// like a chain instead of a mash.
function buildGatlingString(normals, depth) {
  const pool = normals.slice().sort((a, b) => moveWeight(a) - moveWeight(b) || moveFrames(a).startup - moveFrames(b).startup);
  const route = [];
  let lastWeight = 0, previous = null;
  for (const move of pool) {
    if (route.length >= depth) break;
    const weight = moveWeight(move);
    if (weight < lastWeight) continue;
    if (previous && !canLink(previous, move, "ground", move.crouch ? "crouch" : "ground", "gatling")) continue;
    route.push({ move, crouch: move.crouch === true || moveRole(move).includes("crouch") });
    lastWeight = weight; previous = move;
  }
  return { route, previous };
}

function buildComboPlan(me, foe) {
  const moves = combatMoves(me);
  const distance = Math.abs(foe.x - me.x);
  const usable = moves.filter(move => !isRanged(move) && !isGrapple(move) && !isDiveKick(move));
  if (!usable.length) return null;

  // Forged fighters do not always arrive with editor category metadata. Treat
  // fast, grounded attacks as practical normals so their AI can still build a
  // sensible hit-confirm instead of reserving routing for the benchmark kit.
  const grounded = usable.filter(move => !move.air && !isLauncher(move));
  const normals = usable.filter(move => moveCategory(move) === "normal" && !isLauncher(move));
  const routeNormals = normals.length ? normals : grounded.filter(move => moveFrames(move).startup <= 12);
  const specials = usable.filter(move => moveCategory(move) === "special" && !isLauncher(move));
  const routeSpecials = specials.length ? specials : grounded.filter(move => !routeNormals.includes(move));
  const launcher = usable.find(isLauncher) || usable.find(isRisingAttack) || usable.find(isMultiUppercut) || null;
  const wallSlammer = usable.find(isWallSlam);
  const skill = me.ai?.skill || .64;
  const aptitude = Number(me.fighter.config?.combo) || 2;
  const depth = Math.max(2, Math.round(RULES.gatlingDepth * (.55 + skill * .7)));
  const airDepth = Math.max(2, Math.round(RULES.airStringDepth * (.5 + skill * .8)));
  const room = Math.min(foe.x - RULES.wallLeft, RULES.wallRight - foe.x);

  // Optional jump-in opener: air move → land → ground gatling → launcher → juggle.
  // Prefer air kicks for the realistic cross-up feeling of a jump-in combo.
  const jumpInCandidates = comboCandidates(moves, "air", new Set())
    .filter(move => !isDiveKick(move) && moveWeight(move) <= 2)
    .sort((a, b) => (/kick/i.test(a.name) ? -1 : 1) - (/kick/i.test(b.name) ? -1 : 1)
      || moveFrames(a).startup - moveFrames(b).startup);
  const jumpIn = jumpInCandidates[0] || null;
  const useJumpIn = jumpIn && distance > 140 && distance < 420 && Math.random() < (.40 + skill * .32);

  const steps = [{ action: "dash" }];
  if (useJumpIn) steps.push({ move: jumpIn, air: true, jumpIn: true });
  let previous = null;

  // One rep is a complete fighting-game cycle: neutral normals gatling upward,
  // cancel into a special, launch, then a juggle finished on something heavy.
  // A heavy air ender spikes them into the floor, and that bounce is what buys
  // the next rep - which is how a route reaches forty or more hits without
  // ever repeating the same special over and over.
  function buildRep(index) {
    const used = new Set();
    let opened = false;

    const gatling = buildGatlingString(routeNormals, depth);
    for (const step of gatling.route) {
      // A new rep starts on the ground: whatever ended the last one has by now
      // spiked them back down in front of us.
      if (previous && !canLink(previous, step.move, "ground", step.crouch ? "crouch" : "ground", "gatling")) continue;
      steps.push({ ...step, rep: index }); used.add(step.move); previous = step.move; opened = true;
    }

    const cancelInto = routeSpecials
      .filter(move => !used.has(move))
      .sort((a, b) => moveHitCount(b) - moveHitCount(a) || moveFrames(a).startup - moveFrames(b).startup);
    for (const move of cancelInto) {
      if (previous && !canLink(previous, move, "ground", "ground", "cancel")) continue;
      steps.push({ move, cancel: true, rep: index }); used.add(move); previous = move; opened = true;
      break;
    }

    let airborne = false;
    if (wallSlammer && !used.has(wallSlammer) && room > 260 && index === 0 && (!launcher || Math.random() < .5)) {
      steps.push({ move: wallSlammer, wallCarry: true, rep: index }); used.add(wallSlammer); previous = wallSlammer; airborne = true;
    } else if (launcher && !used.has(launcher)) {
      steps.push({ move: launcher, launcher: true, rep: index }); used.add(launcher); previous = launcher; airborne = true;
    }
    if (!airborne) return opened;

    const airPool = comboCandidates(moves, "air", used).sort((a, b) => {
      const rank = (move) => ({ "air-light-punch": 1, "air-medium-punch": 2, "air-medium-kick": 3, "air-special": 4 }[moveRole(move)] || 5);
      return rank(a) - rank(b) || moveFrames(a).startup - moveFrames(b).startup;
    });
    let airCount = 0;
    for (const move of airPool) {
      if (airCount >= airDepth) break;
      const phase = previous === launcher || previous === wallSlammer ? "ground" : "air";
      if (previous && !canLink(previous, move, phase, "air", "cancel")) continue;
      steps.push({ move, air: true, rep: index }); used.add(move); previous = move; airCount++;
    }
    // The ender is deliberately the heaviest air option left: that is the hit
    // that spikes them, and the spike is what opens the next rep.
    const enders = moves.filter(move => !isRanged(move) && !isGrapple(move) && (move.air === true || isDiveKick(move) || isAirComboMove(move)))
      .sort((a, b) => moveWeight(b) - moveWeight(a) || moveHitCount(b) - moveHitCount(a));
    const ender = enders.find(move => !used.has(move)) || enders[0];
    if (ender) { steps.push({ move: ender, air: true, finisher: true, rep: index }); previous = ender; }
    return true;
  }

  // How many reps a fighter is allowed to attempt is their combo aptitude:
  // a low-combo bruiser gets one clean route, a combo specialist gets the
  // bounce loops that make a forty-hit string possible.
  const reps = Math.max(1, Math.min(3, Math.round(1 + (aptitude - 2) * .6)));
  let built = 0;
  for (let index = 0; index < reps; index++) {
    if (buildRep(index)) built++;
    else break;
  }
  if (!built) return null;

  const realSteps = steps.filter(step => step.move);
  // A kit without a launcher can still confirm two grounded buttons. This is
  // deliberately a short route: it gives sparse custom kits competence
  // without pretending every fighter is a juggle specialist.
  if (realSteps.length < 2 && grounded.length >= 2) {
    const fallback = grounded.slice().sort((a, b) => moveFrames(a).startup - moveFrames(b).startup || moveWeight(a) - moveWeight(b));
    const fallbackSteps = fallback.slice(0, Math.min(3, fallback.length)).map((move, index) => ({ move, fallback:true, cancel:index > 0 }));
    steps.splice(1, steps.length - 1, ...fallbackSteps);
  }
  const confirmedSteps = steps.filter(step => step.move);
  if (confirmedSteps.length < 2) return null;
  // If neutral has already brought us into the opener's range, begin on the
  // first button immediately. Routes still use the short dash when needed, but
  // they no longer look like an empty run before every string.
  const openingStep = steps.find(step => step.move);
  const opening = openingStep?.move;
  const openingInRange = opening && distance <= moveDecisionRange(opening, openingStep.crouch ? "crouch" : "ground");
  if (openingInRange && steps[0]?.action === "dash") steps.shift();

  me.comboPlanSerial += 1;
  me.comboPlan = {
    id: me.comboPlanSerial, target: foe, dashTimer: openingInRange ? 0 : .12,
    reliability: Math.min(.97, Math.max(.76, skill * (.86 + (me.ai?.profile?.comboCommit || .72) * .15))),
    projectedHits: confirmedSteps.reduce((total, step) => total + moveHitCount(step.move), 0),
    steps
  };
  me.comboStep = 0;
  return me.comboPlan;
}
function cancelComboPlan(me) { me.comboPlan = null; me.comboStep = 0; }
function airComboApproach(me, foe, move) {
  const chaseDir = foe.x >= me.x ? 1 : -1;
  me.dir = chaseDir;
  const reach = moveHitRange(move, "air"), idealGap = Math.min(96, Math.max(40, reach * .42));
  const desiredX = foe.x - chaseDir * idealGap, error = desiredX - me.x;
  me.vx = Math.max(-520, Math.min(520, error * 9.5));
  if (Math.abs(error) < 22) me.vx *= .45;
  // Aim slightly above where the foe will be when the next attack becomes
  // active, rather than where they were on this frame. That one small lead is
  // what keeps a juggle from swinging underneath a falling target.
  const fallLead = Math.max(-36, Math.min(72, foe.vy * .11));
  const verticalError = (foe.y - 38 + fallLead) - me.y;
  if (Math.abs(verticalError) > 12) me.vy = Math.max(-960, Math.min(720, me.vy + verticalError * 6.8));
  me.running = false;
  return { distance:Math.abs(foe.x - me.x), vertical:Math.abs(foe.y - me.y), error };
}
function updatePlannedCombo(me, foe, dt) {
  const plan = me.comboPlan;
  if (!plan || plan.target !== foe) return false;
  const step = plan.steps[me.comboStep];
  if (!step) { cancelComboPlan(me); return false; }
  me.dir = foe.x >= me.x ? 1 : -1;
  const distance = Math.abs(foe.x - me.x);
  const incomingRange = foe.attackState?.hitRange || 0;
  // During an active air juggle the foe cannot attack back, and there is
  // always a brief inter-hit gap where foe.hurt drops to zero before the next
  // button connects. Treating that gap as an opening would cancel mid-string.
  const inAirJuggle = !me.grounded && !foe.grounded && foe.juggle > 0;
  const comboLive = me.combo.count > 0 && me.combo.target === foe && (foe.hurt > 0 || inAirJuggle);
  if (!comboLive && foe.attackState && me.cd === 0 && distance < incomingRange + 34 && Math.random() < dt * (.55 + (me.ai?.skill || .62) * .65)) {
    cancelComboPlan(me);
    // Forged fighters should recover from a read without looking like they
    // forgot how to press a button. Keep the small pause on the benchmark,
    // but let custom pilots immediately re-enter neutral.
    if (me.ai && me.fighter.example) me.ai.hesitation = .02 + Math.random() * .03;
    return false;
  }
  if (step.action === "dash") {
    plan.dashTimer -= dt; me.running = true; me.vx = me.dir * (330 + (Number(me.fighter.config?.combo) || 2) * 12); me.pose = "run";
    if (plan.dashTimer <= 0 || distance < 275) me.comboStep++;
    return true;
  }
  // Execution risk lives at the start of a route, not spread across it. Once
  // the combo is actually connecting the fighter commits, which is what lets a
  // long confirmed string play out instead of dissolving a few links in. Only
  // the first few links are ever rolled for - a route that is already landing
  // is never abandoned mid-string.
  if (!step.linkChecked && me.comboStep > 1 && me.comboStep < 5) {
    step.linkChecked = true;
    const confirmed = me.combo.count >= 2 && me.combo.target === foe;
    const reliability = confirmed ? .99 : (plan.reliability || .64);
    if (Math.random() > reliability) {
      cancelComboPlan(me);
      if (me.ai && me.fighter.example) me.ai.hesitation = .12 + Math.random() * .12;
      return false;
    }
  }
  // A cancel skips the previous move's recovery, so the next button is
  // available immediately rather than after the usual chain cooldown.
  if (step.cancel && me.cd > 0 && me.combo.count > 0) me.cd = 0;
  if (step.air && me.grounded) { me.jumpCd=0; startJump(me, true, foe); return true; }
  if (!step.air && !me.grounded) {
    // Waiting to land before executing the next ground step. Keep drifting
    // toward the foe so we don't land too far to continue the route.
    me.vx = Math.max(-260, Math.min(260, (foe.x - me.x) * 3.2));
    me.pose = me.runJump ? "run-jump" : "jump";
    return true;
  }
  const reach = moveReach(step.move, step.air ? "air" : me.crouch > 0 ? "crouch" : "ground");
  if (me.cd > 0) {
    // For air steps keep tracking the foe during cooldown so the next button
    // fires from the right position rather than from wherever we drifted.
    if (step.air && !me.grounded) airComboApproach(me, foe, step.move);
    else me.vx = 0;
    me.pose = me.grounded ? "idle" : "jump";
    return true;
  }
  if (step.crouch) me.crouch = .24; else if (me.grounded) me.crouch = 0;
  const airSpacing = step.air ? airComboApproach(me, foe, step.move) : null;
  const inRange = (airSpacing?.distance ?? distance) <= moveDecisionRange(step.move, step.air ? "air" : me.crouch > 0 ? "crouch" : "ground"), verticalDistance = airSpacing?.vertical ?? Math.abs(foe.y - me.y);
  if (inRange && (!step.air || verticalDistance < 255)) { startAttack(me, foe, step.move, me.comboStep, { airFinisher:Boolean(step.finisher) }); return true; }
  if (!step.air) me.vx = me.dir * 285;
  me.running = !step.air; me.pose = step.air ? (me.runJump ? "run-jump" : "jump") : "run";
  return true;
}
// The strongest move a fighter owns, used as the super when meter is full.
function pickSuperMove(me) {
  const moves = combatMoves(me).filter(move => !isGrapple(move));
  if (!moves.length) return combatMoves(me)[0] || null;
  return moves.slice().sort((a, b) =>
    ((Number(b.visual?.size) || 58) + moveFrames(b).startup * 1.5) -
    ((Number(a.visual?.size) || 58) + moveFrames(a).startup * 1.5))[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// AI BRAIN
// Decisions are made on a reaction tick (roughly 5-16 frames depending on
// skill) and then executed every frame. That split is what stops the fighters
// from looking like coin flips: they commit to an idea, and a better fighter
// simply commits sooner and to better ideas.
// ─────────────────────────────────────────────────────────────────────────────
function aiThink(me, foe) {
  const ai = me.ai, profile = ai.profile;
  const distance = Math.abs(foe.x - me.x), hp = me.hp / RULES.maxHp;
  const desperate = hp < .3, winning = me.hp > foe.hp + 40;
  const attackOpportunity = combatMoves(me).some(move => {
    const range = moveDecisionRange(move);
    return distance <= range && (isRanged(move) || Math.abs(foe.y - me.y) < 170);
  });
  const projectile = incomingProjectile(me);
  const openings = foe.guardBroken > 0 || (foe.down && foe.down.t > foe.down.duration - .28) || foe.frozen > 0;
  const superReady = me.meter >= RULES.superCost && combatMoves(me).length > 0;
  const superMove = superReady ? pickSuperMove(me) : null;
  const superRange = superMove ? moveDecisionRange(superMove) : 0;
  let intent = "neutral", timer = ai.reaction * (1.0 + Math.random() * .5);

  // A fresh knockdown with an unspent OTG is worth walking in for: a low
  // scrapes them off the floor and the combo carries on.
  const otgReady = foe.down && !foe.otgUsed && foe.down.t < foe.down.duration - RULES.wakeupInvuln && combatMoves(me).some(move => isLowHit(move, "crouch") || move.crouch === true || isGroundPound(move));
  if (otgReady && distance < 320) intent = "otg";
  else if (openings && distance < 420) intent = "punish";
  else if (superReady && distance < Math.max(380, superRange) && (desperate || openings || foe.hurt > 0 || Math.random() < .30 + ai.skill * .40)) intent = "super";
  else if (foeIsWhiffing(me, foe) && distance < 320 && Math.random() < .28 + profile.punish * .18) intent = "whiff-punish";
  else if (!foe.grounded && foe.vy > -180 && distance < 300 && Math.random() < .40 + ai.skill * .28) intent = "antiair";
  else if (projectile) intent = distance > 290 && Math.random() < .35 + profile.jumpBias * .25 ? "leap" : "block";
  else if (ai.blockedStreak >= 2 && distance < 280) intent = "anti-guard";
  else if (inCorner(me) && !inCorner(foe) && distance < 300 && Math.random() < .55 + ai.skill * .3) intent = "escape";
  else if (inCorner(foe) && distance < 260 && Math.random() < .60 + ai.skill * .28) intent = "pressure";
  else if (foe.hurt > 0 && distance < 300) intent = "pressure";
  else if (foe.attackState && distance < (foe.attackState.hitRange || 180) + 60) {
    // Respect grows when we keep eating the same attack and shrinks when we
    // block so much that we are just feeding the opponent free pressure.
    const guardBias = profile.blockBias * (ai.respect + .35) * (me.guard / RULES.guardMax);
    intent = Math.random() < guardBias * .6 ? "block" : Math.random() < .35 ? "evade" : "pressure";
  }
  // A fighter that has a usable button in range should take the turn. The old
  // spacing checks ran before this decision, so the pilot could drift into
  // range, start a dash plan, and visibly fail to press an attack on entry.
  else if (attackOpportunity) intent = "pressure";
  else if (combatMoves(me).some(isGun) && distance > 260 && Math.random() < .62 + ai.skill * .2) intent = "zone";
  else if (combatMoves(me).some(isFlyIn) && distance > 300 && Math.random() < .35) intent = "fly-in";
  else if (!inCorner(foe) && combatMoves(me).some(isWallSlam) && distance < 200 && Math.random() < .4) intent = "wall-carry";
  else if (ai.archetype === "zoner" && distance < profile.idealGap * .8) intent = "space";
  else if (profile.zoneBias > 1 && distance > 220 && Math.random() < profile.zoneBias * .52 + ai.skill * .14) intent = "zone";
  else if (distance > profile.idealGap * 1.35) intent = Math.random() < (profile.jumpBias * .32 + ai.skill * .10) ? "leap" : "approach";
  else if (distance < profile.idealGap * .5 && !desperate && Math.random() < .32 * profile.patience) intent = "space";
  else if (Math.random() < profile.aggression * (desperate ? 1.15 : winning ? .88 : 1)) intent = "pressure";
  else intent = "neutral";

  ai.intent = intent; ai.intentTimer = timer;
}

function aiWalk(me, target, speed, pose) {
  const delta = target - me.x;
  if (Math.abs(delta) < 18) { me.vx *= .8; me.running = false; me.pose = "idle"; return true; }
  me.vx = Math.sign(delta) * speed * (me.agility || 1); me.running = speed > 240; me.pose = pose || (me.running ? "run" : "walk");
  return false;
}

function aiEngageGap(me, intent = "neutral") {
  const profile = me.ai?.profile || ARCHETYPES.balanced;
  const ranges = me.ai?.ranges || { meleeReach: 193, pokeReach: 170, rangedReach: 390 };
  if (intent === "zone") return Math.max(220, Math.min(profile.idealGap, ranges.rangedReach * .78));
  if (intent === "pressure" || intent === "punish") return Math.max(86, Math.min(220, ranges.pokeReach * .64));
  // Stand just inside the fighter's best practical button. This is more
  // reliable than a universal 205px target for weapons, short normals, and
  // generated kits whose useful range is very different from the benchmark.
  return Math.max(105, Math.min(profile.idealGap, ranges.meleeReach * .86));
}

function aiTryAttack(me, foe, variant, intent, chance = 1) {
  // Hesitation may keep a pilot from starting an elaborate combo route, but it
  // must never suppress a basic attack when the opponent is in range.
  if (me.cd > 0) return false;
  const distance = Math.abs(foe.x - me.x);
  const candidates = rankMoves(me, foe, variant, intent).filter(({ move }) => {
    const range = moveDecisionRange(move, variant);
    return distance <= range;
  }).slice(0, 3);
  if (!candidates.length || Math.random() > chance) return false;
  const move = pickRankedMove(candidates);
  startAttack(me, foe, move);
  return true;
}

function updateAI(me, foe, dt) {
  me.cd = Math.max(0,me.cd-dt); me.hurt=Math.max(0,me.hurt-dt); me.hitstunFrames=me.hurt>0 ? Math.ceil(me.hurt*60) : 0; me.frozen=Math.max(0,me.frozen-dt); me.invuln=Math.max(0,me.invuln-dt); me.recoveryCooldown=Math.max(0,me.recoveryCooldown-dt); me.dodge=Math.max(0,me.dodge-dt); me.jumpCd=Math.max(0,me.jumpCd-dt); me.crouch=Math.max(0,me.crouch-dt); me.blockFlash=Math.max(0,me.blockFlash-dt); me.airComboTimer=Math.max(0,me.airComboTimer-dt);
  me.pushblockCd=Math.max(0,(me.pushblockCd||0)-dt); me.airDash=Math.max(0,(me.airDash||0)-dt);
  me.counterFlash=Math.max(0,me.counterFlash-dt); me.superFlash=Math.max(0,me.superFlash-dt); me.techTimer=Math.max(0,me.techTimer-dt); me.bounceTimer=Math.max(0,(me.bounceTimer||0)-dt); me.backdash=Math.max(0,me.backdash-dt); me.grappleLock=Math.max(0,(me.grappleLock||0)-dt);
  const distance = Math.abs(foe.x-me.x), profile = me.ai.profile, skill = me.ai?.skill || .62;
  if (me.ai) me.ai.hesitation = Math.max(0, me.ai.hesitation - dt);
  if (me.airComboTarget && (me.airComboTimer === 0 || foe.grounded || foe.juggle <= 0)) me.airComboTarget = null;
  if (me.airComboTimer === 0 || foe.grounded) me.airComboJumpQueued = false;
  if (me.followUpWindow && (me.followUpWindow.t -= dt) <= 0) me.followUpWindow = null;

  // ── Locked states ────────────────────────────────────────────────────────
  if (me.down) {
    // Knocked down. Getting up is a real, punishable moment: the last stretch
    // grants invulnerability so wake-up is a read rather than a free kill.
    me.down.t += dt; me.vx *= .82; me.blocking = false; me.attackState = null; me.attack = 0;
    me.pose = me.down.t > me.down.duration - .3 ? "getup" : "down";
    if (me.down.t > me.down.duration - RULES.wakeupInvuln) me.invuln = Math.max(me.invuln, .06);
    if (me.down.t >= me.down.duration) {
      me.down = null; me.juggle = 0; me.juggleGravity = 1; me.cd = .05; me.pose = "idle";
      me.bounceUsed = false; me.wallBounceUsed = false; me.otgUsed = false;
      // Wake-up option: reversal, block, or just stand up.
      const roll = Math.random();
      if (roll < .30 + skill * .36 && distance < 250) aiTryAttack(me, foe, "ground", "launcher", 1);
      else if (roll < .56) startBlock(me, .22 + Math.random() * .16);
    }
    return;
  }
  if (me.guardBroken > 0) { me.vx *= .88; me.blocking = false; me.attackState = null; me.attack = 0; me.pose = "guard-break"; cancelComboPlan(me); return; }
  if (me.frozen > 0) { if (me.attackState?.grappled) releaseGrapple(me, foe); me.attackState=null; me.attack=0; me.blocking=false; me.vx=0; me.pose="frozen"; return; }
  if (me.recovery) {
    me.recovery.t += dt; me.pose = me.recovery.type === "backflip" ? "recover-ground" : "recover-air"; me.vx *= .96;
    if (me.recovery.t >= me.recovery.duration) { me.recovery = null; me.cd = Math.max(me.cd, .12); me.pose = me.grounded ? "idle" : "jump"; }
    return;
  }
  if (me.grappledBy) { me.vx=0; me.pose="grappled"; return; }
  // The exclusive sequel outranks everything the AI would otherwise consider:
  // the window is short, and letting it lapse wastes the whole point of the move.
  if (me.followUpWindow && me.followUpWindow.target === foe && me.hurt <= 0 && !me.down && me.guardBroken <= 0) {
    const sequel = me.followUpWindow.move;
    const sequelVariant = !me.grounded ? "air" : me.crouch > 0 ? "crouch" : "ground";
    if (distance <= moveHitRange(sequel, sequelVariant) + 40 || isRanged(sequel)) {
      const queued = me.followUpWindow; me.followUpWindow = null;
      me.cd = 0; me.ai.hesitation = 0;
      startAttack(me, foe, sequel, null, { followUp: true }); if (me.attackState) { me.attackState.label = `${queued.name} > ${sequel.name}`.toUpperCase(); return; }
    }
  }
  if (me.hurt > 0) {
    cancelComboPlan(me); if (!me.wallSlam) me.vx *= .88; me.pose = me.wallSlam ? "wall-carry" : "hurt";
    // Recovery is considered only in the configured late-hitstun window. The
    // one-shot roll lives in startRecovery, after launcher eligibility checks.
    const lateHitstun = me.hurt <= RULES.techWindow;
    if (lateHitstun && !me.recoveryAttempted && startRecovery(me, foe)) return;
    return;
  }
  if (me.attackState) return;
  if (me.blocking) {
    me.blockTimer -= dt; me.vx *= .7; me.pose = me.blockLow ? "block-low" : "block";
    // Holding guard until it shatters is the worst option available. Once the
    // meter is worn down or the string has gone on too long, buy the way out.
    const worn = me.guard / RULES.guardMax < RULES.guardPanicRatio;
    const strung = (me.guardStreak || 0) >= RULES.guardStreakLimit;
    if ((worn || strung) && me.meter >= RULES.pushblockCost && me.pushblockCd <= 0 && Math.random() < .55 + skill * .4) {
      if (tryPushblock(me, foe)) return;
    }
    if (me.blockTimer <= 0) {
      me.blocking = false; me.blockLow = false;
      // Counter after blocking — less reflexive so the combo game has room.
      if (!worn && me.cd === 0 && distance < (me.ai?.ranges?.pokeReach || 180) + 60 && Math.random() < .22 + skill * .14) {
        if (aiTryAttack(me, foe, "ground", "punish", 1)) return;
      }
      if (worn && me.backdash === 0 && distance < 210 && Math.random() < .5 + skill * .35) {
        me.backdash = .5; me.dodge = .3; me.vx = -me.dir * (340 + skill * 90); me.pose = "evade"; me.guardStreak = 0;
        playSfx("airBackdash", { pan: panFromX(me.x), volume: .45 });
        return;
      }
    }
    else return;
  }

  // ── Reflex layer: runs every frame so blocking still feels reactive ──────
  const threat = threatLevel(me, foe);
  if (threat > .5 && me.cd === 0 && !me.attackState) {
    // Confidence in guard falls off sharply, not linearly: a fighter at a
    // quarter guard should be looking for an escape, not another block.
    const guardHealth = me.guard / RULES.guardMax;
    const guardBias = profile.blockBias * (me.ai.respect + .3) * guardHealth * guardHealth * skill;
    const desperateGuard = guardHealth < RULES.guardPanicRatio || (me.guardStreak || 0) >= RULES.guardStreakLimit;
    if (desperateGuard && me.cd === 0 && Math.random() < dt * 14 * (.6 + skill)) {
      // The three real answers to being pinned: a reversal through the gap,
      // a backdash out of range, or a jump over the top of the string.
      const reversals = combatMoves(me).filter(move => isLauncher(move) || isMultiUppercut(move));
      if (reversals.length && distance < 190) {
        me.invuln = Math.max(me.invuln, .12); me.guardStreak = 0;
        startAttack(me, foe, reversals[Math.floor(Math.random() * reversals.length)]);
        return;
      }
      if (me.backdash === 0 && !inCorner(me)) {
        me.backdash = .5; me.dodge = .32; me.vx = -me.dir * (340 + skill * 90); me.pose = "evade"; me.guardStreak = 0;
        playSfx("airBackdash", { pan: panFromX(me.x), volume: .45 });
        return;
      }
      if (me.jumpCd === 0 && startJump(me, true)) { me.guardStreak = 0; return; }
    }
    if (Math.random() < dt * 24 * guardBias) {
      // Guess high or low against the incoming attack. Guessing wrong is what
      // makes overheads and sweeps worth throwing.
      const incoming = foe.attackState.move;
      const readsLow = isLowHit(incoming, foe.attackState.variant);
      const guessLow = Math.random() < (readsLow ? .5 + skill * .4 : .35);
      startBlock(me, .26 + Math.random() * .22, guessLow);
      return;
    }
  }

  // ── Committed sequences keep priority ────────────────────────────────────
  const chainReady = me.combo.timer > 0 && me.combo.target === foe && me.combo.count < me.combo.max;
  if (me.airComboJumpQueued && me.airComboTarget === foe && !foe.grounded && me.grounded && distance < 420) { me.airComboJumpQueued=false; me.jumpCd=0; me.cd=0; startJump(me, true, foe); return; }
  if (me.airComboTarget === foe && !foe.grounded && me.grounded && me.jumpCd === 0 && distance < 310) { startJump(me, true, foe); return; }
  if (me.comboPlan && updatePlannedCombo(me, foe, dt)) return;
  if (!me.grounded) { updateAirAI(me, foe, dt, distance, skill); return; }

  // ── Think tick ───────────────────────────────────────────────────────────
  me.ai.think -= dt; me.ai.intentTimer -= dt;
  const urgentRead = (foe.guardBroken > 0 && me.ai.intent !== "punish") ||
    (foe.down && me.ai.intent !== "otg" && me.ai.intent !== "punish" && me.ai.intent !== "pressure");
  if (me.ai.think <= 0 || me.ai.intentTimer <= 0 || urgentRead) { me.ai.think = me.ai.reaction; aiThink(me, foe); }
  executeIntent(me, foe, dt, distance, chainReady);
}

function updateAirAI(me, foe, dt, distance, skill) {
  const chasing = me.airComboTarget === foe && !foe.grounded && foe.juggle > 0;
  if (me.airDash > 0) {
    me.vx = me.airDashDir * RULES.airDashSpeed;
    me.vy *= .88; me.pose = "air-dash";
    if (Math.random() < dt * 24) me.trail.push({ t:.16, x:me.x - me.airDashDir * 36, y:me.y - 56 });
    // Air dash attack: attack out of the dash for a burst option.
    const airDashRange = rankMoves(me, foe, "air", "air");
    const dashAttackMove = airDashRange[0]?.move;
    if (me.cd === 0 && dashAttackMove && Math.abs(foe.x - me.x) < moveDecisionRange(dashAttackMove, "air") + 28
        && Math.abs(foe.y - me.y) < 180 && Math.random() < dt * (4.5 + skill * 3.0)) {
      startAttack(me, foe, dashAttackMove); return;
    }
    return;
  }
  // Air-to-air: when both fighters are airborne, prioritise fast air normals.
  const airToAir = !foe.grounded && !chasing;
  if (airToAir && me.cd === 0) {
    const ataPool = rankMoves(me, foe, "air", "air").filter(({ move }) => !isDiveKick(move) && moveFrames(move).startup <= 9);
    const atMove = ataPool[0]?.move;
    const ataDist = Math.abs(foe.x - me.x), ataVert = Math.abs(foe.y - me.y);
    if (atMove && ataDist < moveDecisionRange(atMove, "air") + 18 && ataVert < 155 && Math.random() < dt * (6.0 + skill * 4.0)) {
      startAttack(me, foe, atMove); return;
    }
  }
  const finisherWindow = chasing && foe.y > 438 && foe.vy > 120;
  const ranked = rankMoves(me, foe, "air", chasing ? "air-combo" : "air");
  const enders = ranked.filter(({ move }) => isDiveKick(move) || move.variant === "heavy" || move.behavior?.knockback?.groundBounce === true);
  const airMove = finisherWindow && enders.length ? pickRankedMove(enders, ranked[0]?.move) : pickRankedMove(ranked, null);
  if (!airMove) return;
  const verticalWindow = chasing ? 220 : 170;
  const reachWindow = chasing ? moveDecisionRange(airMove, "air") + 20 : moveDecisionRange(airMove, "air");
  const verticalGap = Math.abs(foe.y - me.y);
  const incomingAirThreat = !foe.grounded && foe.attackState
    && distance < (foe.attackState.hitRange || 180) + 70 && verticalGap < 190;
  // Air dashes are deliberate: chase a launched foe that is slipping away,
  // burst through open air toward a grounded foe, or retreat from a live aerial
  // hitbox. One dash per jump keeps this readable and prevents hover loops.
  if (!me.airDashUsed && me.juggle <= 0 && !me.wallSlam) {
    const needsJuggleChase = chasing && distance > reachWindow * .62 && distance < 520 && verticalGap < 235;
    const neutralApproach = !chasing && foe.grounded && distance > reachWindow * .9 && distance < 440
      && me.y < RULES.floorY - 72 && me.vy < 220 && Math.random() < dt * (1.6 + skill * 1.8);
    if (needsJuggleChase || neutralApproach) { startAirDash(me, me.dir); return; }
    if (!chasing && incomingAirThreat && me.vy > -360 && Math.random() < dt * (5 + skill * 4)) { startAirDash(me, -me.dir); return; }
  }
  const approach = chasing ? airComboApproach(me, foe, airMove) : null;
  if (!chasing) me.vx = me.dir * (me.runJump ? 240 : 155);
  const aligned = (approach?.distance ?? distance) <= reachWindow && (approach?.vertical ?? Math.abs(foe.y - me.y)) < verticalWindow;
  const goodMoment = !chasing || Math.abs(me.vy - foe.vy) < 700 || me.vy > foe.vy - 340;
  const lastChance = chasing && foe.y > 470 && (approach?.distance ?? distance) <= reachWindow + 46;
  if (me.cd === 0 && ((aligned && goodMoment) || lastChance) && (chasing || Math.random() < dt * (5.0 + skill * 3.8))) { startAttack(me, foe, airMove, null, { airFinisher:finisherWindow && (isDiveKick(airMove) || airMove.variant === "heavy") }); }
  else me.pose = me.runJump ? "run-jump" : "jump";
}

function executeIntent(me, foe, dt, distance, chainReady) {
  const ai = me.ai, profile = ai.profile, skill = ai.skill;
  switch (ai.intent) {
    case "super": {
      const move = pickSuperMove(me);
      if (!move) { ai.intent = "pressure"; return; }
      const range = moveDecisionRange(move);
      if (distance <= range && me.cd === 0) { startAttack(me, foe, move, null, { super: true }); ai.intent = "neutral"; return; }
      aiWalk(me, foe.x - me.dir * range * .7, 300);
      return;
    }
    case "punish":
    case "whiff-punish": {
      // Free damage. Walk in and take the biggest thing that reaches.
      if (me.cd === 0 && !me.comboPlan && distance < 300 && buildComboPlan(me, foe)) { updatePlannedCombo(me, foe, dt); return; }
      if (me.cd === 0 && aiTryAttack(me, foe, "ground", "punish", 1)) return;
      if (aiTryAttack(me, foe, "ground", "launcher", .9)) return;
      if (aiTryAttack(me, foe, "ground", "special", 1)) return;
      aiWalk(me, foe.x - me.dir * aiEngageGap(me, "punish"), 320);
      return;
    }
    case "antiair": {
      if (me.cd === 0 && distance < 230 && aiTryAttack(me, foe, "ground", "launcher", 1)) return;
      if (me.jumpCd === 0 && distance < 200 && Math.random() < dt * 3) { startJump(me, true); return; }
      aiWalk(me, foe.x - me.dir * 150, 200);
      return;
    }
    case "block": {
      startBlock(me, .3 + Math.random() * .25, Math.random() < .45);
      if (!me.blocking) aiWalk(me, me.x - me.dir * 90, 190);
      return;
    }
    case "evade": {
      // A backdash with a short invulnerable window; the classic way out of
      // pressure that does not burn guard meter.
      if (me.backdash === 0) { me.backdash = .5; me.dodge = .34; me.vx = -me.dir * (330 + skill * 90); me.pose = "evade"; playSfx("airBackdash", { pan: panFromX(me.x), volume: .45 }); }
      else me.vx *= .9;
      return;
    }
    case "anti-guard": {
      // They are holding guard. Walk into throw range and take the throw, or
      // hit the half of the body they are not defending.
      const grabs = combatMoves(me).filter(isGrapple);
      const grab = grabs.length ? grabs[Math.floor(Math.random() * grabs.length)] : throwMove(me);
      const grabRange = moveDecisionRange(grab);
      if (me.grappleLock > 0) {
        // The last grab attempt is still cooling down - lean on a mix-up
        // instead of walking in for a grab that cannot come out yet.
        ai.intent = "pressure";
        return;
      }
      if (distance <= grabRange && me.cd === 0) {
        ai.blockedStreak = 0;
        startAttack(me, foe, grab);
        return;
      }
      // Too far to grab: mix high and low so guarding one way stays a gamble.
      if (me.cd === 0 && distance < 230 && Math.random() < dt * 6) {
        const wantLow = !foe.blockLow;
        const mixMoves = combatMoves(me).filter(move => wantLow ? isLowHit(move, "crouch") : isOverhead(move, "ground"));
        if (mixMoves.length) {
          ai.blockedStreak = 0;
          if (wantLow) me.crouch = .3;
          startAttack(me, foe, mixMoves[Math.floor(Math.random() * mixMoves.length)]);
          return;
        }
        // No dedicated overhead: jump in, which is an overhead by definition.
        if (!wantLow && me.jumpCd === 0) { ai.blockedStreak = 0; startJump(me, true); return; }
      }
      aiWalk(me, foe.x - me.dir * Math.max(70, grabRange - 24), 300);
      return;
    }
    case "fly-in": {
      const flyers = combatMoves(me).filter(isFlyIn);
      if (flyers.length && me.cd === 0) { startAttack(me, foe, flyers[Math.floor(Math.random() * flyers.length)]); return; }
      aiWalk(me, foe.x - me.dir * aiEngageGap(me, "pressure"), 300);
      return;
    }
    case "otg": {
      // Only something that hits low can reach them, so crouch first and use it.
      const lows = combatMoves(me).filter(move => isLowHit(move, "crouch") || move.crouch === true || isGroundPound(move));
      const low = lows[Math.floor(Math.random() * lows.length)];
      if (!low) { ai.intent = "neutral"; return; }
      if (me.cd === 0 && distance <= moveDecisionRange(low, "crouch")) { me.crouch = .3; startAttack(me, foe, low); return; }
      aiWalk(me, foe.x - me.dir * Math.max(72, Math.min(130, me.ai.ranges?.pokeReach * .52 || 90)), 330);
      return;
    }
    case "wall-carry": {
      // Drive them toward the nearest wall, then cash out with the slam.
      const slams = combatMoves(me).filter(isWallSlam);
      const slam = slams[0];
      if (slam && me.cd === 0 && distance <= moveDecisionRange(slam)) { startAttack(me, foe, slam); return; }
      aiWalk(me, foe.x - me.dir * Math.max(82, Math.min(150, moveDecisionRange(slam || { type: "melee" }) * .58)), 310);
      return;
    }
    case "escape": {
      // Out of the corner: jump over the pressure, or barge through it.
      if (me.jumpCd === 0) { startJump(me, true); me.vx = me.dir * 380; return; }
      if (me.cd === 0 && distance < 150 && aiTryAttack(me, foe, "ground", "launcher", .8)) return;
      me.vx = me.dir * 300; me.running = true; me.pose = "run";
      return;
    }
    case "approach": {
      // Mix dash runs and jump-ins to close distance dynamically.
      if (distance > 280 && me.grounded && me.backdash === 0 && Math.random() < dt * 2.8) {
        me.running = true; me.vx = me.dir * (340 + skill * 60); me.pose = "run"; return;
      }
      if (distance > 200 && distance < 400 && me.jumpCd === 0 && Math.random() < dt * (0.55 + skill * 0.35)) {
        startJump(me, true); return;
      }
      if (me.cd === 0 && !me.comboPlan && distance < 340 && buildComboPlan(me, foe)) {
        updatePlannedCombo(me, foe, dt);
        return;
      }
      if (me.cd === 0 && aiTryAttack(me, foe, "ground", "pressure", 1)) {
        ai.intent = "pressure";
        return;
      }
      const target = foe.x - me.dir * aiEngageGap(me, "pressure");
      if (aiWalk(me, target, 385)) ai.intent = "pressure";
      return;
    }
    case "leap": {
      if (me.jumpCd === 0) startJump(me, true);
      else aiWalk(me, foe.x - me.dir * aiEngageGap(me, "neutral"), 260);
      return;
    }
    case "zone": {
      const ranged = combatMoves(me).filter(isRanged);
      // Don't stack projectiles — wait if one is already travelling toward the foe.
      const alreadyFiring = (battle.projectiles || []).some(p => p.owner === me && !p.trap && !p.pillar && !p.exploding);
      if (ranged.length && me.cd === 0 && !alreadyFiring && aiTryAttack(me, foe, "ground", "zone", 1)) return;
      // Zoners back-walk to maintain distance while the projectile travels.
      const zoneGap = aiEngageGap(me, "zone");
      const tooClose = Math.abs(foe.x - me.x) < zoneGap * .75;
      if (tooClose && !inCorner(me)) { me.vx = -me.dir * 160 * (me.agility || 1); me.pose = "walk"; me.running = false; }
      else aiWalk(me, foe.x - me.dir * zoneGap, 160);
      return;
    }
    case "space": {
      // Hold the range where my move reaches and theirs does not.
      const wanted = foe.x - me.dir * aiEngageGap(me, "neutral");
      if (aiWalk(me, wanted, 220) && me.cd === 0 && Math.random() < dt * 1.4) me.crouch = .28;
      return;
    }
    case "pressure": {
      if (chainReady && me.cd === 0 && aiTryAttack(me, foe, me.crouch > 0 ? "crouch" : "ground", "chain", 1)) return;
      // Forged fighters always attempt a real route. Kung Fu Man still drops
      // some routes as the baseline, but a plan starts directly on its opener
      // whenever it is already in range.
      const routeCommit = me.fighter.example ? (ai.profile.comboCommit || .72) : 1;
      if (!me.comboPlan && me.cd === 0 && ai.hesitation === 0 && distance < 340 && Math.random() < routeCommit) {
        if (buildComboPlan(me, foe)) { updatePlannedCombo(me, foe, dt); return; }
      }
      if (me.cd === 0 && aiTryAttack(me, foe, me.crouch > 0 ? "crouch" : "ground", "pressure", 1)) return;
      const wantLauncher = distance < 215 && Math.random() < .14 + skill * .22;
      if (aiTryAttack(me, foe, me.crouch > 0 ? "crouch" : "ground", wantLauncher ? "launcher" : "special", Math.min(1, dt * (3.4 + skill * 2.8) * 12))) return;
      // Jump in for a cross-up or overhead if not already airborne.
      if (me.jumpCd === 0 && distance > 190 && distance < 400 && Math.random() < dt * (1.8 + skill * 2.0)) { startJump(me, true); return; }
      // Mix in a low so blocking high is not free.
      if (me.cd === 0 && distance < 200 && Math.random() < dt * 2.8) { me.crouch = .3; return; }
      aiWalk(me, foe.x - me.dir * aiEngageGap(me, "pressure"), 320);
      return;
    }
    default: {
      const wanted = foe.x - me.dir * aiEngageGap(me, "neutral");
      const needsToClose = (wanted - me.x) * me.dir > 50;
      const tooClose = distance < aiEngageGap(me, "neutral") - 35;
      // Dynamic footsies: jump, dash in, or backdash before settling into an attack.
      if (me.grounded && me.jumpCd === 0 && Math.random() < dt * (0.18 + skill * 0.12)) {
        startJump(me, needsToClose); return;
      }
      if (needsToClose && me.grounded && me.backdash === 0 && Math.random() < dt * (2.2 + skill * 1.2)) {
        me.running = true; me.vx = me.dir * (320 + skill * 70); me.pose = "run"; return;
      }
      if (tooClose && me.grounded && me.backdash === 0 && !inCorner(me) && Math.random() < dt * (0.9 + skill * 0.6)) {
        me.backdash = .36; me.dodge = .24; me.vx = -me.dir * (280 + skill * 70); me.pose = "evade";
        playSfx("airBackdash", { pan: panFromX(me.x), volume: .32 }); return;
      }
      // Agile fighters (speed 4-5) do cat-like feints: dash in briefly, then spring back.
      const isAgile = (me.agility || 1) >= 1.04;
      if (isAgile && needsToClose && me.grounded && me.backdash === 0 && !me.ai.feintTimer && Math.random() < dt * (1.6 + skill * 1.0)) {
        me.ai.feintTimer = 0.08 + Math.random() * 0.07;
        me.running = true; me.vx = me.dir * (340 + skill * 90); me.pose = "run"; return;
      }
      if (me.ai.feintTimer !== undefined) {
        me.ai.feintTimer -= dt;
        if (me.ai.feintTimer <= 0) {
          delete me.ai.feintTimer;
          if (!inCorner(me)) { me.backdash = .28; me.dodge = .18; me.vx = -me.dir * (260 + skill * 60); me.pose = "evade"; playSfx("airBackdash", { pan: panFromX(me.x), volume: .26 }); return; }
        } else { me.running = true; me.vx = me.dir * (340 + skill * 90); me.pose = "run"; return; }
      }
      if (Math.abs(me.x - wanted) > 40) aiWalk(me, wanted, 230);
      else { me.running = false; me.vx *= .84; me.pose = Math.random() < dt * .8 ? "crouch" : "idle"; if (me.pose === "crouch") me.crouch = .25; }
      if (me.cd === 0 && distance < 270 && Math.random() < dt * (2.6 + skill * 1.8)) aiTryAttack(me, foe, "ground", "pressure", 1);
    }
  }
}
function isBomb(move) { return move?.type === "bomb" || move?.behavior?.motion === "bomb"; }
function isGun(move) { return move?.type === "gun" || move?.behavior?.motion === "gun" || /\bgun|pistol|revolver|rifle|blaster|magnum|bullet|buckshot|shotgun/i.test(move?.name || ""); }
function isWallSlam(move) { return move?.behavior?.motion === "wall-slam" || /wall ?slam|wall ?punch|wall ?bang|slam.*wall|into the wall/i.test(move?.name || ""); }
function isSpin(move) { return move?.behavior?.motion === "spin" || /spin|whirl|cyclone|tornado|twister|carousel|helicopter/i.test(move?.name || ""); }
function isMultiUppercut(move) { return move?.behavior?.motion === "multi-uppercut" || /shoryu|rising (fist|dragon|fury)|multi.?upper|triple.?upper|upper.*rush/i.test(move?.name || ""); }
// Rising attacks are launcher-adjacent: they lift both fighters, but their
// defining reward is an early air-cancel rather than a long grounded recovery.
function isRisingAttack(move) { return isMultiUppercut(move) || /rising|uppercut|dragon|lift|sky|anti.?air/i.test(String(move?.name || "")); }
function isFlyIn(move) { return move?.behavior?.motion === "fly-in" || /fly.?in|soar|swoop|comet|rocket (rush|charge)|air ?rush/i.test(move?.name || ""); }
function isGroundPound(move) { return move?.behavior?.motion === "ground-pound" || /ground ?pound|earth ?shaker|seismic|meteor ?slam|body ?splash|shockwave slam/i.test(move?.name || ""); }
function isSlide(move) { return move?.behavior?.motion === "slide" || /\bslide\b|skid|low.?dash|ground.?rush|slide.?kick/i.test(move?.name || ""); }

// Every repeating-hit move funnels through one description so spins, rising
// uppercuts, fly-ins and jab barrages all share the same proven cadence code.
function multiHitProfile(move) {
  const behavior = move?.behavior || {};
  const explicit = Number(behavior.hits) > 1 ? Math.round(clampNumber(behavior.hits, 2, 10, 4)) : 0;
  const interval = clampNumber(behavior.hitInterval ?? behavior.rapidInterval, .04, .2, .07);
  if (isRapidJab(move)) return { hits: Math.round(clampNumber(behavior.rapidHits ?? behavior.hits, 2, 8, 5)), interval: clampNumber(behavior.rapidInterval ?? behavior.hitInterval, .045, .18, .075), kind: "rapid-jab" };
  if (isSpin(move)) return { hits: explicit || 5, interval, kind: "spin" };
  if (isMultiUppercut(move)) return { hits: explicit || 4, interval: Math.min(interval, .065), kind: "multi-uppercut" };
  if (isFlyIn(move)) return { hits: explicit || (Number(behavior.hits) === 1 ? 1 : 3), interval, kind: "fly-in" };
  if (explicit) return { hits: explicit, interval, kind: "multi" };
  return null;
}
function isDashAttack(move) { return move?.behavior?.motion === "dash-attack"; }
function isChargeMove(move) { return move?.behavior?.motion === "charge"; }
function isRanged(move) { return move?.type === "projectile" || move?.type === "trap" || move?.type === "freeze" || move?.type === "pillar" || isBomb(move) || isGun(move); }
function moveReach(move, variant = "ground") {
  const type = move?.type || "melee", custom = Number(move?.reach);
  const base = custom > 0 ? Math.min(520, Math.max(70, custom)) : type === "projectile" || type === "freeze" ? 520 : type === "bomb" ? 340 : type === "trap" || type === "pillar" ? 260 : type === "combo" ? 195 : type === "grapple" ? 142 : type === "teleport" ? 390 : 165;
  return Math.max(70, base + (variant === "air" ? 28 : variant === "crouch" ? -10 : 0));
}
function moveHitRange(move, variant = "ground") {
  // Keep the collision tip at the outer edge of the authored VFX. This makes
  // a contact that looks connected connect in the same frame.
  const authored = moveReach(move, variant) + 28, imageReach = 44 + (Number(move?.visual?.size) || 58) * 1.45;
  return Math.max(authored, imageReach) + (variant === "air" ? 10 : 0);
}
// The target is a body, not a point. AI range checks need to include most of
// that body width or they stop just outside attacks that would visibly connect.
// Leave a tiny safety inset so a moving opponent does not turn every opener
// into a whiff at the extreme edge.
function moveDecisionRange(move, variant = "ground") {
  if (isRanged(move)) return moveReach(move, variant);
  return moveHitRange(move, variant) + (variant === "air" ? 28 : 34);
}
function meleeHitboxConnects(me, foe, state) {
  if (state.hitMode === "shockwave") return false; // resolved on landing instead
  const horizontal = (foe.x - me.x) * me.dir;
  // The target is a body, not a point. Let the box reach the near edge of
  // the opponent's hurtbox when the effect touches them on screen.
  const targetHalfWidth = foe.grounded ? 42 : 36;
  const range = (state.hitRange || state.reach + 52 + (state.variant === "air" ? 16 : 0)) + targetHalfWidth;
  const vertical = Math.abs(foe.y - me.y);
  const verticalWindow = state.diveKick ? 260 : state.variant === "air" ? (foe.juggle > 0 ? 195 : 150) : state.variant === "crouch" ? 112 : 122;
  const diveIsCommitted = !state.diveKick || me.vy > -180 || state.t > state.startup / 60;
  if (state.hitMode === "omni") {
    // A spin has no front: it connects on either side of the attacker.
    return Math.abs(foe.x - me.x) <= range && vertical <= verticalWindow + 16;
  }
  const airOk = state.variant === "air" || state.flyIn || state.multiUppercut || foe.grounded;
  // A downed opponent is lying on the floor. Only something that actually hits
  // low - a crouching button, a sweep, a ground pound - can reach them, and
  // only once per knockdown so an OTG pickup is an extension, not a loop.
  if (foe.down && !canHitDowned(me, foe, state)) return false;
  return horizontal >= -38 && horizontal <= range && vertical <= verticalWindow && diveIsCommitted && airOk;
}
// Whether this attack can pick a downed opponent off the ground.
function canHitDowned(me, foe, state) {
  if (foe.otgUsed) return false;
  const move = state.move;
  return state.variant === "crouch" || isLowHit(move, state.variant) || state.groundPound || state.hitMode === "shockwave";
}

function scoreMove(move, context) {
  const { me, foe, distance, variant, intent, vertical } = context;
  const reach = moveDecisionRange(move, variant), frames = moveFrames(move, variant);
  const ranged = isRanged(move), gun = isGun(move);
  let score = Math.random() * 9 - frames.startup * .2;
  const moveKey = String(move.name || "").trim().toLowerCase();
  const aiProfile = me.ai?.profile || {};
  const category = moveCategory(move), weight = moveWeight(move);
  if (aiProfile.preferredMoves?.includes(moveKey)) score += 13;
  if (aiProfile.avoidMoves?.includes(moveKey)) score -= 22;

  // Spacing: the single biggest factor in whether a button is the right button.
  if (ranged) score += distance > 230 ? 16 : distance > 150 ? 2 : -14;
  else if (distance <= reach + 18) score += 11;
  else score -= Math.min(20, (distance - reach) * .04);

  // Whiff risk: slow moves are a liability when they can see them coming.
  const punishRisk = frames.startup * .35 + frames.endlag * .12;
  if (distance > reach + 40) score -= punishRisk * .5;
  if (foe.hurt > 0 || foe.down || foe.guardBroken > 0) score += frames.startup < 10 ? 8 : 2;

  // A move's type says what it is; intent says why it should be used now.
  // The old pilot mostly ignored that distinction, which made generated
  // fighters spend their signature tools like ordinary jabs. These small
  // bonuses make the same kit read as an opener, poke, punish, or finisher.
  if (intent === "pressure" || intent === "chain") {
    if (!ranged && frames.startup <= 8) score += 8;
    if (category === "normal") score += 5;
    if (frames.endlag <= 14) score += 4;
    if (weight >= 3 && intent === "pressure") score -= 5;
    // Generated fighters need to demonstrate the kit they were forged with,
    // not limp along on the universal normals while Kung Fu Man cashes out
    // with his authored specials. Fast signature buttons are now real opens.
    if (!me.fighter.example && category === "special" && frames.startup <= 15) score += 10;
  }
  if (intent === "special") {
    if (category === "special" || ranged || move.type === "combo") score += 14;
    if (frames.startup > 18 && !foe.hurt && !foe.down) score -= 7;
    if (me.ai?.archetype === "grappler" && isGrapple(move) && distance < 165) score += 20;
  }
  if (intent === "punish" || intent === "whiff-punish") {
    score += weight * 4 + Math.max(0, 15 - frames.startup) * .7;
    if (frames.endlag > 30 && !foe.hurt && !foe.down) score -= 6;
  }
  if (intent === "launcher" && (isLauncher(move) || isRisingAttack(move))) score += 8;

  // Move-type situational fit.
  if (gun) score += distance > 260 ? 20 : distance > 170 ? 6 : -16;
  if (isBomb(move)) score += distance > 180 && distance < 430 ? 10 : -12;
  if (isChargeMove(move)) score += distance > 210 ? 6 : -15;
  if (isDashAttack(move)) score += distance > 105 && distance < 330 ? 12 : -5;
  if (isDiveKick(move)) score += variant === "air" && foe.grounded && distance > 90 && distance < 360 ? 19 : -10;
  if (isGroundPound(move)) score += (!me.grounded || distance < 150) && foe.grounded ? 15 : -14;
  // Pick them up off the floor - but only with something that reaches down.
  if (foe.down && !foe.otgUsed) score += (variant === "crouch" || isLowHit(move, variant) || isGroundPound(move)) ? 30 : -30;
  if (isFlyIn(move)) score += distance > 220 && distance < 620 ? 18 : -12;
  if (isSpin(move)) score += distance < 170 ? 14 : -8;
  if (isMultiUppercut(move)) score += distance < 165 && foe.grounded ? 20 : -10;
  if (isWallSlam(move)) {
    // Worth the most when there is room to drive them into something, and worth
    // more still mid-combo: the rebound is a guaranteed extension.
    const room = Math.min(foe.x - RULES.wallLeft, RULES.wallRight - foe.x);
    score += distance < 170 ? (room > 260 ? 20 : 6) : -12;
    if (foe.hurt > 0 && foe.grounded && room > 240 && !foe.wallBounceUsed) score += 22;
  }
  if (isRapidJab(move)) score += variant !== "air" && distance < 220 ? 13 : -4;
  if (isGrapple(move)) score += (me.grappleLock > 0) ? -40 : distance < 130 ? (foe.blocking ? 26 : 8) : -16;

  // Anti-air: catch them out of the sky.
  if (!foe.grounded) {
    if (isLauncher(move) || isMultiUppercut(move)) score += 16 * (aiProfile.antiAir || 1);
    if (ranged && !gun) score -= 8;
    if (isGrapple(move)) score -= 30;
  }
  if (foe.down) score -= isGrapple(move) ? 30 : 0;

  // Guard-breaking: the half of the body they are not defending.
  if (foe.blocking) {
    if (isGrapple(move)) score += me.grappleLock > 0 ? -40 : 24;
    else if (foe.blockLow && isOverhead(move, variant)) score += 18;
    else if (!foe.blockLow && isLowHit(move, variant)) score += 18;
    else score -= 10;
  }

  // Intent overrides.
  if (intent === "launcher") score += isLauncher(move) ? 26 : isRisingAttack(move) ? 22 : -10;
  if (intent === "chain") score += isLauncher(move) ? 7 : 5;
  if (intent === "anti-guard") score += isGrapple(move) ? 30 : isOverhead(move, variant) || isLowHit(move, variant) ? 14 : -8;
  if (intent === "zone") score += ranged ? 18 : -12;
  if (intent === "air-combo" && isAirComboMove(move)) {
    score += 12;
    // As the target nears the floor, favour a decisive air ender rather than
    // another light tap that leaves both fighters falling past each other.
    if (foe.y > 430 && foe.vy > 80) score += isDiveKick(move) || move.variant === "heavy" || move.behavior?.knockback?.groundBounce === true ? 24 : -5;
  }

  if (vertical > 150 && !ranged && variant !== "air") score -= 12;
  if (me.ai?.lastMoveKey === `${move.type}:${move.name}`) score -= 9;
  return score;
}

function rankMoves(me, foe, variant = "ground", intent = "neutral") {
  const moves = combatMoves(me), distance = Math.abs(foe.x - me.x), vertical = Math.abs(foe.y - me.y);
  let pool = moves;
  if (variant === "air") pool = airComboMoves(moves);
  if (intent === "air-combo") {
    const comboMoves = airComboMoves(pool);
    if (comboMoves.length) pool = comboMoves;
  }
  if (!pool.length) pool = moves;
  const context = { me, foe, distance, variant, intent, vertical };
  return pool.map(move => ({ move, score: scoreMove(move, context) })).sort((a, b) => b.score - a.score);
}
function pickRankedMove(scored, fallback = null) {
  if (!scored.length) return fallback;
  // Keep variety between comparable tools, but do not randomly throw a move
  // that just scored far worse for the current spacing. This especially helps
  // bespoke kits whose individual moves are more specialised than Kung Fu
  // Man's all-purpose defaults.
  const best = scored[0].score;
  const shortlist = scored.filter(entry => entry.score >= best - 7).slice(0, 3);
  const total = shortlist.reduce((sum, entry) => sum + Math.max(1, entry.score - best + 8), 0);
  let roll = Math.random() * total;
  for (const entry of shortlist) { roll -= Math.max(1, entry.score - best + 8); if (roll <= 0) return entry.move; }
  return shortlist[0]?.move || fallback;
}
function chooseMove(me, foe, variant = "ground", intent = "neutral") {
  const moves = combatMoves(me);
  return pickRankedMove(rankMoves(me, foe, variant, intent), moves[0]);
}
function startJump(me, running=false, target=null) {
  if (!me.grounded || me.jumpCd > 0 || me.attackState || me.blocking) return false;
  me.grounded=false; me.blocking=false; me.crouch=0; me.runJump=running; me.running=false; me.airDash=0; me.airDashUsed=false;
  if (target) {
    me.dir = target.x >= me.x ? 1 : -1;
    // Match the launched opponent's vertical arc instead of using a fixed
    // jump. The small height correction makes the first air hit line up.
    me.vy = Math.max(-820, Math.min(-540, target.vy * .9 + (target.y - me.y) * 2.1));
    me.vx = me.dir * 340;
    me.airComboTarget = target; me.airComboTimer = Math.max(me.airComboTimer, 1.8);
  } else {
    me.vy=-655; me.vx=me.dir*(running ? 300 : 185);
  }
  me.jumpCd=.9; me.pose=running ? "run-jump" : "jump";
  playSfx(running ? "jumpRun" : "jumpHigh", { pan: panFromX(me.x), volume: .4, cooldown: .1 });
  return true;
}
function startAirDash(me, direction = me.dir) {
  if (me.grounded || me.airDashUsed || me.attackState || me.hurt > 0 || me.recovery || me.grappledBy || me.down) return false;
  const dashDir = Math.sign(direction) || me.dir || 1;
  me.airDashUsed = true; me.airDash = RULES.airDashDuration; me.airDashDir = dashDir;
  me.vx = dashDir * RULES.airDashSpeed; me.vy *= .32; me.running = false; me.pose = "air-dash";
  me.trail.push({ t:.24, x:me.x - dashDir * 26, y:me.y - 58 });
  playSfx(dashDir === me.dir ? "airDash" : "airBackdash", { pan: panFromX(me.x), volume: .48, cooldown: .12 });
  return true;
}
// Guard push. Spend meter mid-blockstun to blow the attacker back out of
// range: the blockstring ends, a little guard comes back, and whatever route
// they were running is dead. This is the counter to guard pressure, and the
// reason a defender is not simply waiting to be broken.
function tryPushblock(me, foe) {
  if (!me.blocking || me.guardBroken > 0 || me.pushblockCd > 0) return false;
  if (me.meter < RULES.pushblockCost) return false;
  me.meter -= RULES.pushblockCost;
  me.pushblockCd = RULES.pushblockCooldown;
  me.guard = Math.min(RULES.guardMax, me.guard + RULES.pushblockGuardRefund);
  me.guardStreak = 0;
  me.blockTimer = Math.min(me.blockTimer, .06);
  const away = foe.x >= me.x ? 1 : -1;
  foe.vx = away * RULES.pushblockPush;
  me.vx = -away * RULES.pushblockPush * .3;
  // Blown out of range mid-string: whatever they were running cannot continue.
  cancelComboPlan(foe);
  resetCombo(foe);
  if (foe.attackState && !foe.attackState.grappled) { foe.attackState.resolved = true; foe.attackState.t = Math.max(foe.attackState.t, foe.attackState.duration - .04); }
  if (foe.ai) foe.ai.blockedStreak = Math.min(6, foe.ai.blockedStreak + 1);
  me.effects.push({ kind: "impact", t: .34, x: me.x + away * 40, y: me.y, color: "#8fe4ff", size: 74 });
  addShake(.14); addHitstop(.05);
  showBanner("GUARD PUSH", .45, "tech");
  playSfx("guardCrush", { pan: panFromX(me.x), volume: .5, rate: 1.25 });
  return true;
}

function startBlock(me, duration = .5, low = false) {
  if (!me.grounded || me.attackState || me.hurt > 0 || me.recovery || me.down || me.guardBroken > 0) return;
  me.blocking = true; me.blockLow = low; me.blockTimer = Math.max(me.blockTimer, duration);
  me.running = false; me.vx = 0; me.crouch = low ? Math.max(me.crouch, duration) : 0; me.pose = low ? "block-low" : "block";
}
function startRecovery(me, foe) {
  if (me.recovery || me.recoveryCooldown > 0 || me.hurt <= 0 || me.grappledBy || me.down || me.guardBroken > 0 || me.wallSlam) return false;
  const airborne = !me.grounded;
  // Cannot tech out of the launcher itself — need to take at least one juggle
  // hit before air-recovery becomes available.
  if (airborne && (me.airComboHits || 0) < 1 && (me.juggle || 0) > 0) return false;
  // Base chance: 20% air / 26% ground. Scale down sharply as the combo deepens
  // so an attacker who lands 5+ hits doesn't face the same escape odds as one
  // who just started. Each hit halves the remaining chance past hit 2.
  const juggleDepth = me.airComboHits || 0;
  const depthPenalty = juggleDepth > 2 ? Math.pow(.62, juggleDepth - 2) : 1;
  const baseChance = airborne ? .30 : .34;
  // One roll per hit sequence. This must happen after the launcher gate above:
  // a victim who is not eligible yet should still get their chance later.
  me.recoveryAttempted = true;
  if (Math.random() > baseChance * depthPenalty) return false;
  me.recovery = { type: airborne ? "air-hop" : "backflip", t: 0, duration: airborne ? .32 : .46 };
  // A tech must actually end the combo. The former .12-second protection
  // expired in the middle of the recovery animation, which let an attacker
  // immediately re-stunlock the fighter before they could move or block.
  me.invuln = me.recovery.duration + .16;
  me.recoveryCooldown = airborne ? .8 : .95;
  me.hurt = 0; me.hitstunFrames = 0; me.attackState = null; me.attack = 0; me.blocking = false; me.blockTimer = 0; me.crouch = 0; me.running = false;
  me.juggle = 0; me.airComboHits = 0; me.airComboTarget = null; me.airComboTimer = 0; me.airComboJumpQueued = false; me.pendingKnockdown = 0; me.juggleGravity = 1; resetCombo(me);
  // Put a real gap on the screen as well as granting invulnerability. The
  // attacker must chase the tech instead of continuing from point-blank.
  me.dir = foe.x >= me.x ? 1 : -1; me.vx = -me.dir * (airborne ? 360 : 390);
  if (airborne) { me.vy = -285; me.y -= 8; me.pose = "recover-air"; }
  else { me.grounded = false; me.vy = -430; me.y = Math.max(410, me.y - 4); me.pose = "recover-ground"; }
  // The attacker's COMBO counter resets (victim escaped) but their positional
  // plan is kept — they were in range and can immediately re-pressure or
  // tech-chase. Wiping the full comboPlan rewarded the escape too much.
  const attacker = battle.fighters.find(fighter => fighter !== me);
  if (attacker) {
    attacker.airComboTarget = null; attacker.airComboTimer = 0; attacker.airComboJumpQueued = false;
    resetCombo(attacker);
    // Cancel plan but don't penalise with hesitation — attacker should chase.
    attacker.comboPlan = null; attacker.comboStep = 0;
  }
  playSfx("recover", { pan: panFromX(me.x), volume: .7 });
  me.techTimer = me.recovery.duration;
  me.effects.push({ kind: "tech", t: me.recovery.duration, x: me.x, y: me.y, color: me.fighter.config?.color || "#d8ff3e", size: airborne ? 42 : 54 });
  showBanner(airborne ? "AIR TECH" : "TECH", .42, "tech");
  return true;
}
// Pick the swing/cast sound that matches what this move physically is, so a
// sword-weight heavy and a quick jab never share the same whoosh.
function swingSoundFor(move, variant) {
  if (isGun(move)) return "electric";
  if (isBomb(move)) return "blaze";
  if (isFreeze(move)) return "freezeCast";
  if (isPillar(move)) return "quake";
  if (move?.type === "trap") return "magicCircle";
  if (isTeleport(move)) return "electric";
  if (isGrapple(move)) return "grappleSwing";
  if (isSpin(move)) return "spinSwing";
  if (isGroundPound(move)) return "quake";
  if (isWallSlam(move)) return "swingHeavy";
  if (isFlyIn(move)) return "airDash";
  if (isMultiUppercut(move)) return "swingMedium";
  if (isRapidJab(move)) return "swingLight";
  if (isRanged(move)) return "magicCircle";
  if (variant === "crouch" || isLowHit(move, variant)) return "swingLow";
  const element = String(move?.visual?.element || move?.behavior?.element || "");
  if (element === "lightning") return "electric";
  if (element === "fire") return "blaze";
  if (element === "ice") return "freezeCast";
  if (Number(move?.reach) > 260) return "swingReach";
  const gesture = String(move?.animation?.gesture || "");
  if (/thrust|stab|pierce|spear/i.test(gesture)) return "stab";
  const tier = String(move?.variant || "medium");
  return tier === "heavy" ? "swingHeavy" : tier === "light" ? "swingLight" : "swingMedium";
}
function startAttack(me, foe, forcedMove, comboStep = null, mods = {}) {
  if (me.blocking || me.grappledBy || me.down || me.guardBroken > 0) return;
  // A super is the same authored move spent through the meter: bigger, safer
  // on startup, and loud enough that the moment reads on screen.
  const superMove = Boolean(mods.super) && spendMeter(me, RULES.superCost);
  const exMove = !superMove && Boolean(mods.ex) && spendMeter(me, RULES.exCost);
  const moves = combatMoves(me);
  const rawMove = forcedMove || moves[Math.floor(Math.random()*moves.length)];
  const move = normalizeMove(rawMove || {name:"Quick Strike",type:"melee"}, me.fighter.config);
  if (me.ai) me.ai.lastMoveKey = `${move.type}:${move.name}`;
  const variant = !me.grounded ? "air" : me.crouch > 0 ? "crouch" : "ground";
  const chainStep = me.combo.timer > 0 && me.combo.target === foe ? me.combo.count : 0;
  const distance = Math.abs(foe.x-me.x), grapple = isGrapple(move), teleport = isTeleport(move), pillar = isPillar(move), freeze = isFreeze(move), bomb = isBomb(move), projectile = isRanged(move) && !bomb, charge = isChargeMove(move);
  const defaults = moveFrameDefaults(move.type), startup = Math.min(60, Math.max(1, Number(move.startup ?? move.startLag) || defaults.startup));
  // Spins, rising uppercuts, fly-ins and jab barrages all repeat their hitbox;
  // they only differ in how the attacker moves while it repeats.
  const multi = multiHitProfile(move);
  const rapidJab = Boolean(multi) && multi.hits > 1, rapidHits = rapidJab ? multi.hits : 1, rapidInterval = rapidJab ? multi.interval : 0;
  const multiKind = multi?.kind || "";
  const baseActive = Math.min(20, Math.max(1, Number(move.active) || defaults.active)), active = rapidJab ? Math.max(baseActive, Math.ceil((rapidHits - 1) * rapidInterval * 60) + 3) : baseActive;
  const baseEndlag = Math.min(90, Math.max(1, Number(move.endlag ?? move.endLag) || defaults.endlag)), baseHitstun = Math.min(60, Math.max(1, Number(move.hitstun ?? move.hitStun) || defaults.hitstun));
  const chargeFrames = charge ? Math.round(clampNumber(move.behavior?.charge, .12, 2.5, .5) * 60) : 0;
  // Agile fighters get their buttons out sooner and recover faster, which is
  // what actually makes their extra combo ceiling reachable.
  const agility = me.agility || 1;
  const variantStartup = Math.max(2, Math.round(((variant === "crouch" ? startup + 2 : variant === "air" ? Math.max(3, startup - 1) : startup) + chargeFrames) / agility));
  const variantEndlag = Math.max(3, Math.round((variant === "air" ? baseEndlag + 3 : variant === "crouch" ? baseEndlag + 2 : baseEndlag) / agility));
  const variantHitstun = Math.min(60, baseHitstun + (variant === "air" ? 2 : variant === "crouch" ? 1 : 0));
  const totalFrames = variantStartup + active + variantEndlag, duration = totalFrames / 60;
  const baseDamage = rapidJab ? 3.5 : grapple ? 4 : bomb ? 11 : freeze ? 5 : pillar ? 9 : move.type === "combo" ? 10 : projectile ? 8 : 6;
  const movePower = move.variant === "heavy" ? 3 : move.variant === "medium" ? 1 : 0;
  const variantBonus = variant === "air" ? 2 : variant === "crouch" ? 1 : 0;
  const name = move.name || (projectile ? "Spark Shot" : "Strike");
  const chainName = chainStep ? ` ${["II","III","IV","FINISH"][Math.min(chainStep-1,3)]}` : "";
  const label = `${superMove ? "SUPER " : exMove ? "EX " : ""}${variant === "air" ? "AIR " : variant === "crouch" ? "LOW " : ""}${name}${rapidJab ? ` ×${rapidHits}` : ""}${chainName}`.toUpperCase();
  const spin = isSpin(move), multiUppercut = isMultiUppercut(move), risingAttack = isRisingAttack(move), flyIn = isFlyIn(move), groundPound = isGroundPound(move), wallSlam = isWallSlam(move), gun = isGun(move), slide = isSlide(move);
  const launcher = (variant === "ground" || multiUppercut) && isLauncher(move);
  const diveKick = variant === "air" && isDiveKick(move);
  const powerMultiplier = superMove ? 2.35 : exMove ? 1.45 : 1;
  // Spin hits all around the attacker; a ground pound hits by shockwave radius.
  const hitMode = spin ? "omni" : groundPound ? "shockwave" : "normal";
  me.attackState = { foe, move, isFollowUp:Boolean(mods.followUp), airFinisher:Boolean(mods.airFinisher), visual:move.visual, superMove, exMove, powerMultiplier, multiKind, spin, multiUppercut, risingAttack, flyIn, groundPound, wallSlam, gun, slide, hitMode, flyTravelled:0, shockDone:false, behavior:move.behavior, animation:move.animation, variant, projectile, bomb, charge, grapple, teleport, pillar, freeze, launcher, diveKick, rapidJab, rapidHits, rapidInterval, rapidHitCount:0, nextRapidHitAt:0, dashAttack:isDashAttack(move), comboPlanId:me.comboPlan?.target === foe ? me.comboPlan.id : null, comboStep, linkRetryCount:0, hitConfirmed:false, duration, startup:variantStartup, active, endlag:variantEndlag, hitstun:variantHitstun, totalFrames, t:0, hitAt:variantStartup / 60, finishAt:(variantStartup + Math.max(5, Math.round(active * .62))) / 60, resolved:false, behaviorApplied:false, finished:false, grabbed:false, grapplePhase:"reach", reach:moveReach(move, variant) * (me.reachMult || 1), hitRange:moveHitRange(move, variant) * (me.reachMult || 1), damage:(baseDamage + movePower + variantBonus + Math.min(chainStep,3)*1.6) * (charge ? clampNumber(move.behavior?.chargePower, .7, 2.5, 1.35) : 1) * powerMultiplier, label };
  if (superMove) {
    // Freeze the screen on the flash so the announcement lands before the
    // move actually moves. Startup is invulnerable, which is the whole
    // reason a super is worth a full bar.
    me.superFlash = .55; me.invuln = Math.max(me.invuln, variantStartup / 60 + .06);
    addHitstop(.24); addShake(.3); camera.focus = me;
  } else if (exMove) { me.superFlash = .25; addShake(.1); }
  playSfx(swingSoundFor(move, variant), { pan: panFromX(me.x), volume: superMove ? .9 : .55, cooldown: rapidJab ? .06 : 0 });
  if (move.visual?.soundUrl) playUploadedSfx(move.visual.soundUrl, { pan: panFromX(me.x), volume: superMove ? .95 : .72, cooldown: rapidJab ? .06 : .02 });
  if (superMove) playSfx("superStart", { volume: .85 });
  else if (exMove) playSfx("exFlourish", { volume: .7 });
  showMoveCallout(me, me.attackState);
  // Attack duration already contains endlag. A second long cooldown here was
  // making valid links start after the defender had recovered.
  me.attack = duration; me.cd = chainStep ? .025 : .055; me.pose = "startup"; me.vx = 0;
  if (flyIn) {
    // Leave the floor and rocket at them; the multi-hit window does the damage.
    me.dir = foe.x >= me.x ? 1 : -1;
    me.grounded = false; me.runJump = true;
    me.vy = -clampNumber(move.behavior?.flyHeight, 0, 260, 96) * 3.4;
    me.vx = me.dir * clampNumber(move.behavior?.flySpeed, 320, 1100, 620);
  }
  if (groundPound) {
    // Ground pounds happen from the air. From the floor, hop first.
    if (me.grounded) { me.grounded = false; me.vy = -420; me.y -= 6; }
    me.vx = 0;
  }
  if (spin) me.vx = me.dir * 60;
  if (diveKick) {
    me.dir = foe.x >= me.x ? 1 : -1;
    me.vx = me.dir * clampNumber(move.behavior?.speed, 220, 520, 360);
    me.vy = Math.max(460, me.vy);
  }
  if (slide) {
    // Stay crouched for the entire move and shoot forward along the floor.
    me.crouch = state.duration + 0.08;
    me.vx = me.dir * clampNumber(move.behavior?.slideSpeed ?? move.behavior?.speed, 180, 560, 360);
  }
}
function updateAttack(me, foe, dt) {
  const state = me.attackState; if (!state) return;
  if (me.hurt > 0) { if (state.grappled) releaseGrapple(me, foe); cancelComboPlan(me); me.attackState=null; me.attack=0; me.pose="hurt"; return; }
  state.t += dt; me.attack = Math.max(0, state.duration - state.t);
  const activeNow = state.t >= state.startup / 60 && state.t <= (state.startup + state.active) / 60;
  if (state.flyIn && activeNow) {
    // Keep flying until we have covered the move's reach or run out of stage.
    const step = me.dir * clampNumber(state.behavior?.flySpeed, 320, 1100, 620) * dt;
    state.flyTravelled += Math.abs(step);
    me.vx = me.dir * clampNumber(state.behavior?.flySpeed, 320, 1100, 620);
    me.vy = Math.min(me.vy, 40);
  }
  if (state.slide && state.t < state.finishAt) {
    // Decelerate through the slide and keep crouching until it ends.
    const slideSpd = clampNumber(state.behavior?.slideSpeed ?? state.behavior?.speed, 180, 560, 360);
    me.vx = me.dir * slideSpd * Math.max(0.1, 1 - (state.t / state.duration) * 1.15);
    me.crouch = Math.max(me.crouch, (state.duration - state.t) + 0.06);
  }
  if (state.groundPound) {
    if (!me.grounded && state.t >= state.startup / 60) me.vy = Math.max(me.vy, clampNumber(state.behavior?.slamSpeed, 480, 1600, 980));
    if (me.grounded && !state.shockDone && state.t >= state.startup / 60) {
      // Landing is the hit: a shockwave that only catches grounded opponents.
      state.shockDone = true; state.resolved = true;
      const radius = clampNumber(state.behavior?.shockRadius, 90, 420, 210);
      if (foe.grounded && Math.abs(foe.x - me.x) <= radius) {
        hit(me, foe, state.damage, state.label, state.hitstun, false, "ground", state.visual);
      }
      me.effects.push({ kind: "impact", t: .45, x: me.x, y: me.y, color: state.visual?.color || "#ffd05d", size: radius * .5, vfxId: state.visual?.hitVfx });
      addShake(.34); addHitstop(.09);
    }
  }
  if (state.spin && activeNow) me.vx = me.dir * 70;
  const activeStart = state.startup / 60, activeEnd = (state.startup + state.active) / 60;
  if (state.t < activeStart) { state.grapplePhase="reach"; me.pose = "startup"; }
  else if (state.grapple && state.grabbed && state.t < state.finishAt) { state.grapplePhase="hold"; me.pose = "grapple-hold"; }
  else if (state.grapple && state.grabbed && !state.finished && state.t >= state.finishAt) { state.grapplePhase="finish"; me.pose = state.animation.finish === "throw" ? "grapple-throw" : "grapple-slam"; finishGrapple(me, foe, state); }
  else if (state.t < activeEnd) { state.grapplePhase=state.grapple ? "finish" : state.grapplePhase; me.pose = state.projectile || state.bomb || state.charge ? "cast" : state.variant === "air" ? "air-attack" : state.variant === "crouch" ? "crouch-attack" : "attack"; }
  else me.pose = "endlag";
  if (!state.behaviorApplied && state.t >= state.hitAt) {
    state.behaviorApplied = true;
    if (state.projectile || state.bomb || state.gun) { state.resolved = true; spawnProjectile(me, foe, state); }
    else applyMoveBehavior(me, foe, state);
  }
  // A melee hitbox stays live for the whole active window. Rapid jabs reuse
  // that window at a fixed cadence, creating a readable multi-hit flurry.
  const rapidReady = state.rapidJab && state.rapidHitCount < state.rapidHits && state.t >= (state.rapidHitCount ? state.nextRapidHitAt : activeStart);
  if (!state.projectile && !state.bomb && (!state.resolved || rapidReady) && state.t >= activeStart && state.t <= activeEnd) {
    // A dodge is an escape from neutral, never an escape from a combo: a
    // fighter already in hitstun cannot evade the next link.
    const evaded = foe.dodge > 0 && foe.hurt <= 0 && !foe.grappledBy && Math.random() < Math.min(.5, foe.dodge * .7);
    const juggleBlocked = state.variant === "air" && !foe.grounded && foe.juggle <= 0;
    if (meleeHitboxConnects(me, foe, state) && !evaded && !juggleBlocked && (!state.rapidJab || rapidReady)) {
      if (!state.rapidJab) state.resolved = true;
      if (state.grapple) state.hitConfirmed = attemptGrapple(me, foe, state) || state.hitConfirmed;
      else state.hitConfirmed = (hit(me, foe, state.damage, state.label, state.hitstun, state.launcher, state.variant, state.visual) !== false) || state.hitConfirmed;
      if (state.risingAttack && state.hitConfirmed) {
        // Every hit of a rising attack lifts both fighters. Unlike a hard
        // launcher, the attacker is released almost immediately so an air
        // normal can be canceled during the ascent instead of waiting through
        // the move's full endlag.
        const rise = clampNumber(state.behavior?.rise, 120, 620, 300);
        if (me.grounded) { me.grounded = false; me.y -= 4; }
        me.vy = Math.min(me.vy, -rise * .78);
        foe.grounded = false; foe.vy = Math.min(foe.vy, -rise);
        foe.juggle = Math.max(foe.juggle, 4);
        state.resolved = true;
        state.duration = Math.min(state.duration, state.t + .075);
        me.cd = 0;
      }
      if (state.rapidJab) {
        state.rapidHitCount += 1;
        state.nextRapidHitAt = state.t + state.rapidInterval;
        if (state.rapidHitCount >= state.rapidHits) state.resolved = true;
      }
      // A planned cancel has to remove the preceding move's endlag. Without
      // this, sparse forged kits technically planned two buttons but waited
      // until the defender had already recovered before throwing the second.
      const plannedNext = state.comboPlanId && me.comboPlan?.id === state.comboPlanId
        ? me.comboPlan.steps[(state.comboStep ?? -1) + 1] : null;
      if (state.hitConfirmed && plannedNext?.cancel) {
        state.duration = Math.min(state.duration, activeEnd + .018);
        me.cd = 0;
      }
      if (state.diveKick && state.hitConfirmed && !state.diveBounced) {
        state.diveBounced = true;
        me.vy = -Math.max(420, Math.abs(me.vy) * .62);
        me.vx = -me.dir * 135;
      }
      // A confirmed launcher should flow straight into the jump-in. Cutting
      // the launcher's recovery here lets the attacker start the pursuit on
      // the same tick instead of waiting through the entire endlag window.
      if (state.launcher && me.airComboTarget === foe && !foe.grounded && me.grounded) state.t = state.duration;
    }
  }
  if (!state.projectile && !state.bomb && !state.resolved && state.t > activeEnd) {
    state.resolved = true;
    if (me.combo.count && !(state.variant === "air" && me.airComboTarget === foe && !foe.grounded && me.airComboTimer > 0)) me.combo.timer = 0;
  }
  if (state.t >= state.duration) {
    const launchJump = state.launcher && me.airComboJumpQueued && me.grounded && !foe.grounded;
    if (state.comboPlanId && me.comboPlan?.id === state.comboPlanId && state.comboStep !== null) {
      if (state.hitConfirmed) { me.comboPlan.linkRetryCount = 0; me.comboStep = state.comboStep + 1; if (!me.comboPlan.steps[me.comboStep]) cancelComboPlan(me); }
      else if (state.blocked) {
        // They guarded it. Real players do not launch a blocking opponent, so
        // the route downgrades to a blockstring: keep the pressure, and skip
        // the launcher and air string that could never connect.
        me.comboPlan.blockstring = true; me.comboPlan.linkRetryCount = 0;
        me.comboStep = state.comboStep + 1;
        while (me.comboPlan.steps[me.comboStep] && (me.comboPlan.steps[me.comboStep].launcher || me.comboPlan.steps[me.comboStep].wallCarry || me.comboPlan.steps[me.comboStep].air)) me.comboStep++;
        if (!me.comboPlan.steps[me.comboStep]) cancelComboPlan(me);
      }
      else {
        const juggleAlive = !foe.grounded && foe.juggle > 0 && me.combo.count > 0;
        // The opening button of a route is thrown while still closing distance,
        // so a whiff there means "not yet", not "the route is dead". Give the
        // approach real patience; give a live juggle patience too.
        const opening = me.combo.count === 0;
        const nearLink = (opening || foe.hurt > 0 || juggleAlive) && !foe.recovery
          && Math.abs(foe.x - me.x) <= state.hitRange + (juggleAlive ? 190 : opening ? 240 : 52);
        const retryBudget = juggleAlive ? 5 : opening ? 5 : 2;
        if (nearLink && (me.comboPlan.linkRetryCount || 0) < retryBudget) {
          me.comboPlan.linkRetryCount = (me.comboPlan.linkRetryCount || 0) + 1;
          me.combo.timer = Math.max(me.combo.timer, .5); me.cd = .02;
        }
        else cancelComboPlan(me);
      }
    }
    // A move with a sequel opens its window the moment it confirms. The sequel
    // belongs to this move alone: it is not in the normal move pool and cannot
    // be thrown on its own.
    if (state.hitConfirmed && state.move?.followUp && !state.isFollowUp) {
      me.followUpWindow = { move: state.move.followUp, t: state.move.followUpWindow || .55, target: foe, name: state.move.name };
      me.cd = Math.min(me.cd, .04);
      showBanner("FOLLOW-UP", .4, "counter"); } else if (state.isFollowUp) me.followUpWindow = null;
    if (state.grappled) releaseGrapple(me, foe); me.attackState=null; me.attack=0; me.pose = me.grounded ? me.crouch > 0 ? "crouch" : "idle" : "jump";
    if (launchJump) { me.airComboJumpQueued=false; me.jumpCd=0; me.cd=0; startJump(me, true, foe); }
  }
}
function updateCombo(me, dt) {
  // An in-progress route holds its own combo window open; otherwise a long
  // string times out between stages and resets the counter mid-combo.
  if (me.comboPlan && me.combo.count > 0 && me.combo.target === me.comboPlan.target) me.combo.timer = Math.max(me.combo.timer, .6);
  // Carrying somebody into a wall, or waiting out a spike before it bounces,
  // is still the same combo - the counter should not time out mid-flight.
  const carried = me.combo.target;
  if (carried && me.combo.count > 0 && (carried.wallSlam || carried.groundBouncePending)) me.combo.timer = Math.max(me.combo.timer, .9);
  if (me.airComboTarget && me.airComboTimer > 0 && me.combo.target === me.airComboTarget) me.combo.timer = Math.max(me.combo.timer, .85);
  if (me.combo.timer > 0 && (me.combo.timer -= dt) <= 0) {
    if (me.airComboTarget && me.airComboTimer > 0 && me.combo.target === me.airComboTarget) me.combo.timer = .45;
    else resetCombo(me);
  }
}
function applyMoveBehavior(me, foe, state) {
  const behavior = state.behavior || {};
  if (behavior.motion === "dash" || behavior.motion === "dash-attack") {
    const distance = behavior.motion === "dash-attack" ? clampNumber(behavior.dashDistance, 30, 300, 110) : clampNumber(behavior.speed * .18, 28, 120, 72);
    me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, me.x + me.dir * distance));
    if (behavior.motion === "dash-attack") me.vx = me.dir * Math.min(120, distance * 1.4);
  }
  if (behavior.motion === "charge") { battle.shake = Math.max(battle.shake || 0, .08); me.effects.push({ kind:"charge", t:.22, x:me.x, y:me.y, color:state.visual?.color || "#d8ff3e", size:(state.visual?.size || 58) * 1.1 }); }
  if (behavior.motion === "pull") foe.vx = -me.dir * clampNumber(behavior.speed * .55, 70, 300, 150);
  if (behavior.motion === "teleport") { me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, foe.x + me.dir * clampNumber(behavior.offset, 40, 180, 92))); me.dir = foe.x >= me.x ? 1 : -1; me.vx = 0; me.trail.push({ t:.42, x:me.x, y:me.y }); }
}
function attemptGrapple(me, foe, state) {
  if (foe.invuln > 0 || foe.down || (foe.grappleLock || 0) > 0) return false;
  // Throw tech: a defender who is attacking, or who reads the grab in time,
  // breaks the clinch instead of eating a full command grab.
  const canTech = foe.guardBroken <= 0 && foe.hurt <= 0 && foe.techTimer === 0
    && ((foe.attackState && foe.attackState.t < foe.attackState.startup / 60) || Math.random() < .1 + (foe.ai?.skill || .6) * .18);
  if (canTech && !state.superMove) { foe.techTimer = .6; me.techTimer = .6;
    foe.vx = me.dir * 210; me.vx = -me.dir * 210;
    me.attackState.resolved = true; state.grapplePhase = "whiff";
    foe.effects.push({ kind: "impact", t: .3, x: (me.x + foe.x) / 2, y: me.y, color: "#ffffff", size: 56 });
    playSfx("throwWhiff", { volume: .7 });
    resetCombo(me); addHitstop(.06); addShake(.1); showBanner("TECH", .5, "tech");
    me.grappleLock = .5; foe.grappleLock = .35;
    return false;
  }
  if (foe.grappledBy || me.grappleTarget || !foe.grounded) {
    foe.hp = Math.max(0, foe.hp - Math.max(.5, state.damage * .12));
    foe.blockFlash = .2; resetCombo(me);
    state.grapplePhase = "whiff";
    me.grappleLock = .4;
    return false;
  }
  resetCombo(me);
  playSfx("throwCatch", { pan: panFromX(foe.x), volume: .8 });
  state.grabbed = true; state.grappled = true; state.grapplePhase = "hold";
  me.grappleTarget = foe; foe.grappledBy = me; foe.grappledState = state;
  foe.hurt = 0; foe.hitstunFrames = 0; foe.vx = 0; foe.vy = 0; foe.grounded = me.grounded;
  foe.blocking = false; foe.blockLow = false;
  foe.effects.push({ kind:"grapple-lock", t:.42, x:foe.x, y:foe.y, color:state.visual?.color || "#ff9f43", size:state.visual?.size || 68, vfxId:state.visual?.hitVfx });
  return true;
}
function releaseGrapple(me, foe = me.grappleTarget) {
  if (me.attackState?.foe === foe && me.attackState.grappled) me.attackState.grappled = false;
  if (me.grappleTarget === foe) me.grappleTarget = null;
  if (foe?.grappledBy === me) { foe.grappledBy = null; foe.grappledState = null; }
}
function finishGrapple(me, foe, state) {
  if (!state.grappled || state.finished) return;
  state.finished = true;
  const finisher = state.behavior?.finisher === "throw" || state.animation?.finish === "throw" ? "throw" : "slam";
  releaseGrapple(me, foe);
  // A throw is a clean reset, not a combo link: it never inherits an existing
  // scale (so it always hits for its full number) and it never leaves a combo
  // window open behind it, so it cannot chain into another throw.
  resetCombo(me);
  hit(me, foe, state.damage + (finisher === "throw" ? 5 : 7), state.label, state.hitstun, false, "ground", state.visual);
  resetCombo(me);
  // A short shared cooldown on both fighters keeps a throw from being thrown
  // right back out again the instant it recovers - the "locked in a loop" feel.
  playSfx("throwComeout", { pan: panFromX(foe.x), volume: .85 });
  me.grappleLock = .45; foe.grappleLock = .45;
  foe.grounded = false; foe.runJump = false; foe.y = Math.max(390, foe.y - (finisher === "throw" ? 10 : 28));
  if (!foe.vy) foe.vy = -(finisher === "throw" ? 560 : 470);
  if (!foe.vx) foe.vx = me.dir * (finisher === "throw" ? 410 : 260);
  foe.pendingKnockdown = RULES.softKnockdown;
  foe.effects.push({ kind:"throw-slam", t:.5, x:foe.x, y:foe.y, color:state.visual?.color || "#ff9f43", size:(state.visual?.size || 68) * 1.3, vfxId:state.visual?.hitVfx });
  addShake(finisher === "throw" ? .24 : .3); addHitstop(.09);
}
function spawnProjectile(me,foe,state) {
  const behavior = state.behavior || {}, visual = state.visual || moveVisualDefaults[state.move.type] || moveVisualDefaults.projectile;
  const shots = Math.round(clampNumber(behavior.shots, 1, 3, 1));
  for (let i = 0; i < shots; i++) {
    const bomb = state.bomb || state.move.type === "bomb" || behavior.motion === "bomb", trap = state.move.type === "trap" || behavior.motion === "trap", pillar = state.move.type === "pillar" || behavior.motion === "pillar";
    const freeze = state.freeze || behavior.status === "freeze";
    const hazard = trap || pillar || bomb;
    const offset = (i - (shots - 1) / 2) * 24;
    const pattern = ["straight", "arc", "fan", "boomerang", "orbit", "rain"].includes(behavior.pattern) ? behavior.pattern : "straight";
    const targetX = (trap || pillar) ? me.x + me.dir * Math.min(Math.abs(foe.x - me.x), state.reach * .72) : me.x + me.dir * 42;
    const spawnX = pattern === "rain" ? foe.x + offset * 1.4 : targetX, spawnY = pillar ? me.y - 5 : bomb ? me.y - 24 : pattern === "rain" ? me.y - 300 : me.y - 82 + offset;
    const targetY = foe.y - 88, aimAngle = pattern === "rain" ? Math.PI / 2 : Math.atan2(targetY - spawnY, foe.x - spawnX), shotAngle = pattern === "fan" ? aimAngle + (i - (shots - 1) / 2) * Number(behavior.spread || 22) * Math.PI / 180 : aimAngle;
    const angleOffsetRad = (Number(behavior.angleOffset) || 0) * Math.PI / 180;
    const finalAngle = behavior.angleMode === "fixed"
      ? (me.dir > 0 ? angleOffsetRad : Math.PI - angleOffsetRad)
      : shotAngle + angleOffsetRad;
    const gunShot = state.gun || state.move.type === "gun";
    const speed = gunShot ? clampNumber(behavior.speed, 700, 1600, 1150) : clampNumber(behavior.speed, 160, 700, 390), p = { x:spawnX, y:spawnY, originX:spawnX, originY:spawnY, phase:i * Math.PI / Math.max(1, shots), vx:(hazard && !bomb) || pattern === "rain" || pattern === "orbit" ? 0 : Math.cos(finalAngle) * speed, vy:(hazard && !bomb) ? 0 : pattern === "rain" ? speed : Math.sin(finalAngle) * speed, age:0, pattern, gravity:clampNumber(behavior.gravity, -1600, 1600, pattern === "arc" ? 520 : 0), homing:clampNumber(behavior.homing, 0, 1, 0), bounces:Math.round(clampNumber(behavior.bounces, 0, 3, 0)), orbitRadius:clampNumber(behavior.orbitRadius, 24, 220, 84), orbitSpeed:clampNumber(behavior.orbitSpeed, -12, 12, 3.5), returnDelay:clampNumber(behavior.returnDelay, .15, 1.5, .62), returning:false, owner:me, life:behavior.linger ? Math.max(1.5, Math.min(8, Number(behavior.linger))) : bomb ? behavior.fuse + .08 : hazard ? behavior.lifetime : gunShot ? 1.1 : 1.45, armed:bomb ? behavior.fuse : gunShot ? .04 : .18, radius:clampNumber(behavior.radius, 8, 140, pillar ? 76 : trap ? 68 : bomb ? 78 : gunShot ? 13 : 22), trap, pillar, bomb, gun:gunShot, exploding:false, fuse:behavior.fuse, element:behavior.element || visual.element || "energy", visual, target:foe, damage:state.damage, hitstun:state.hitstun, freezeTime:behavior.freeze, status:behavior.status, knockback:behavior.knockback, label:state.label, pierce:Boolean(behavior.pierce), hitImmunity:clampNumber(behavior.hitImmunity, .08, 1.5, .35), hitCooldown:0, wallBounce:Boolean(behavior.wallBounce) };
    if (gunShot) me.effects.push({ kind: "impact", t: .16, x: me.x + me.dir * 52, y: me.y, color: visual?.secondary || "#fff2c2", size: 30, vfxId: "hit_round_spark" });
    (battle.projectiles ||= []).push(p);
  }
}
function applyFreeze(foe, duration, visual) {
  playSfx("freezeCast", { pan: panFromX(foe.x), volume: .8 });
  foe.frozen = Math.max(foe.frozen || 0, duration || .95); foe.vx = 0; foe.vy = 0; foe.effects.push({ kind:"freeze", t:Math.min(.7, foe.frozen), x:foe.x, y:foe.y, color:visual?.color || "#73e7ff", size:visual?.size || 30 });
}
function hit(me, foe, damage, label, hitstun = 14, launcher = false, attackVariant = "ground", visual = null, knockbackOverride = null) {
  if (foe.invuln > 0 || foe.down) { foe.dodge = Math.max(foe.dodge, .12); return false; }
  const state = me.attackState, move = state?.move;
  const overhead = isOverhead(move, attackVariant), low = isLowHit(move, attackVariant);

  // ── Guard ────────────────────────────────────────────────────────────────
  // Blocking is a guess, not a shield. A low guard eats overheads and a high
  // guard eats sweeps, which is what makes a mixed-up offense worth building.
  if (foe.blocking && foe.guardBroken <= 0) {
    const wrongGuard = (overhead && foe.blockLow) || (low && !foe.blockLow);
    if (!wrongGuard) {
      const chip = Math.max(.5, damage * RULES.chipRatio);
      foe.hp = Math.max(0, foe.hp - chip);
      foe.guard = Math.max(0, foe.guard - (RULES.guardCostBase + damage * RULES.guardCostScale * (state?.superMove ? 2.4 : 1)));
      if (state) state.blocked = true;
      playSfx(isGrapple(move) ? "guardGrap" : "guardSlash", { pan: panFromX(foe.x), volume: .5 });
      foe.blockFlash = .18; foe.guardFlash = .2;
      foe.blockTimer = Math.max(foe.blockTimer, hitstun * RULES.blockstunRatio / 60);
      // Both fighters slide apart, so blocking actually resets the spacing.
      const push = RULES.blockPushback * (state?.superMove ? 1.6 : 1);
      foe.vx = me.dir * push; me.vx = -me.dir * push * .45;
      gainMeter(foe, damage * RULES.meterOnBlocked); gainMeter(me, damage * RULES.meterOnBlocked * .6);
      addHitstop(.02); addShake(.05);
      resetCombo(me);
      if (me.ai) me.ai.blockedStreak = Math.min(6, me.ai.blockedStreak + 1);
      foe.guardStreak = (foe.guardStreak || 0) + 1;
      if (foe.ai) foe.ai.respect = Math.max(.15, foe.ai.respect - .06);
      if (foe.guard <= 0 && !(foe.guardImmune > 0)) {
        // Guard crush: a long, fully punishable stun. The pay-off for grinding
        // somebody's defense down instead of just swinging.
        foe.guardBroken = RULES.guardBreakStun; foe.blocking = false; foe.blockTimer = 0;
        foe.hurt = 0; foe.vx = me.dir * 120;
        foe.effects.push({ kind: "impact", t: .5, x: foe.x, y: foe.y, color: "#ffe66d", size: 92 });
        playSfx("guardCrush", { volume: .95 });
        addShake(.3); addHitstop(.14); showBanner("GUARD BREAK", .9, "break");
      }
      return false;
    }
    // Guessed wrong — the guard drops and the hit lands clean.
    foe.blocking = false; foe.blockLow = false; foe.blockTimer = 0;
    if (foe.ai) foe.ai.respect = Math.min(1, foe.ai.respect + .12);
  }

  // ── Counter hit ──────────────────────────────────────────────────────────
  const counter = Boolean(foe.attackState) && foe.attackState.t < foe.attackState.startup / 60;
  const continuing = me.combo.timer > 0 && me.combo.target === foe;
  const wasGrounded = foe.grounded;
  // A clean hit interrupts whatever the defender was doing. Leaving the old
  // attack state alive made struck fighters keep animating and acting through
  // hitstun, which hid both the hit reaction and the tech window.
  if (foe.attackState && !foe.attackState.grappled) { foe.attackState = null; foe.attack = 0; }
  if (!continuing) { me.combo.scale = 1; me.combo.damage = 0; }
  me.combo.count = continuing ? me.combo.count + 1 : 1; me.combo.target = foe;
  me.combo.timer = .72 + (Number(me.fighter.config?.combo) || 2) * .055;

  // ── Damage: scales DOWN through a combo so long routes are style, not a kill.
  let finalDamage = damage * me.combo.scale;
  if (counter) finalDamage *= RULES.counterDamage;
  finalDamage = Math.max(.8, finalDamage);
  // After the first couple of dozen hits the scale is already at the floor,
  // so extra hits add spectacle and meter but almost no damage.
  me.combo.scale = me.combo.count >= RULES.scalingFloorHits
    ? RULES.minScale
    : Math.max(RULES.minScale, me.combo.scale * RULES.comboScaleStep);
  me.combo.damage += finalDamage;
  const appliedHitstun = Math.round(hitstun * (counter ? RULES.counterHitstun : 1));
  foe.hp = Math.max(0, foe.hp - finalDamage);
  foe.damageTaken = (foe.damageTaken || 0) + finalDamage;
  foe.hitstunFrames = appliedHitstun; foe.hurt = appliedHitstun / 60; foe.hitDirection = me.dir;
  // Only grant a fresh recovery window on the FIRST hit of a sequence. Once a
  // recovery attempt has been made or denied, the attacker has earned the
  // rest of the combo — resetting this flag on every hit lets a 12-hit string
  // offer 12 independent ~34% escape rolls (≈99% cumulative success rate).
  if (me.combo.count <= 1) foe.recoveryAttempted = false;
  foe.blocking = false; foe.blockLow = false; foe.guardStreak = 0; foe.lastAttacker = me; foe.followUpWindow = null;
  gainMeter(me, finalDamage * RULES.meterOnDealt);
  gainMeter(foe, finalDamage * RULES.meterOnTaken);
  if (me.ai) { me.ai.blockedStreak = 0; me.ai.hitStreak++; }
  if (foe.ai) foe.ai.respect = Math.min(1, foe.ai.respect + .09);

  // ── Knockback ────────────────────────────────────────────────────────────
  const knockback = knockbackOverride || state?.behavior?.knockback || {};
  const baseHorizontal = continuing ? 52 : me.combo.count > 1 ? 230 : 180;
  let horizontal = clampNumber(knockback.horizontal, 0, 900, baseHorizontal);
  let vertical = clampNumber(knockback.vertical, 0, 900, launcher ? 620 : attackVariant === "air" ? 225 : 0);
  const hasVector = Number.isFinite(Number(knockback.power)) && Number(knockback.power) > 0;
  const hasAngle = Number.isFinite(Number(knockback.angle)) && Number(knockback.angle) !== 0;
  if (hasVector) { const radians = Number(knockback.angle || 0) * Math.PI / 180; horizontal = Math.abs(Number(knockback.power)) * Math.cos(radians); vertical = Math.abs(Number(knockback.power)) * Math.sin(radians); }
  else if (hasAngle && Number(knockback.vertical) === 0) { const radians = Number(knockback.angle) * Math.PI / 180; horizontal *= Math.cos(radians); vertical = Math.abs(horizontal * Math.sin(radians)); }
  if (launcher && vertical < 420) vertical = 620;
  if (state?.superMove) { horizontal *= 1.5; vertical *= 1.35; }
  const direction = knockback.direction === "toward" ? -me.dir : knockback.direction === "up" || knockback.direction === "down" ? 0 : me.dir;
  foe.vx = direction * horizontal;
  if (knockback.direction === "down") vertical = -vertical;
  if (Math.abs(vertical) >= 80) { foe.grounded = false; foe.vy = -vertical; }
  // A heavy hit from the air spikes them into the floor. The bounce that comes
  // back up is the attacker's reward: a fresh juggle to keep the route going.
  const spikes = knockback.groundBounce === true || state?.diveKick || state?.groundPound || state?.airFinisher
    || (attackVariant === "air" && (String(move?.variant || "") === "heavy" || finalDamage > 12));
  if (spikes && !foe.bounceUsed) {
    // A ground bounce must travel into the floor before it rebounds. The old
    // path launched the victim upward first, so the banner said BOUNCE while
    // the body never visibly hit the ground.
    foe.grounded = false;
    foe.y = Math.min(RULES.floorY - 18, foe.y);
    foe.vy = Math.max(500, Math.abs(vertical) * .9, Math.abs(foe.vy));
    foe.groundBouncePending = 1;
    foe.pendingKnockdown = 0;
    foe.pose = "spiked";
  }

  // Picking a downed opponent up with a low: they pop back into the air and the
  // combo continues, once per knockdown.
  if (foe.down) {
    foe.down = null; foe.otgUsed = true; foe.pendingKnockdown = 0;
    foe.grounded = false; foe.vy = -Math.max(340, vertical || 380);
    foe.juggle = Math.max(foe.juggle, RULES.otgJuggle); foe.juggleGravity = Math.max(RULES.juggleStart, (foe.juggleGravity || 1) * .8);
    me.airComboTarget = foe; me.airComboTimer = Math.max(me.airComboTimer, 2.2); me.combo.timer = Math.max(me.combo.timer, 1.2);
    showBanner("O.T.G.", .5, "counter"); playSfx("boneCrack", { pan: panFromX(foe.x), volume: .55 });
  }

  // ── Wall slam ────────────────────────────────────────────────────────────
  // Punch them into the wall: they travel to the nearest wall under their own
  // momentum and detonate against it, rather than teleporting there.
  if (state?.wallSlam) {
    const toRight = foe.x >= me.x;
    horizontal = Math.max(horizontal, clampNumber(state.behavior?.carrySpeed, 420, 1500, 900));
    foe.wallSlam = { damage: finalDamage * .7, visual: state.visual || null, from: me };
    foe.vx = (toRight ? 1 : -1) * horizontal;
    // Keep them on the floor so they skid the whole way. Launching them into
    // the air just meant they landed, got knocked down, and never arrived.
    foe.grounded = true; foe.vy = 0;
    foe.hurt = Math.max(foe.hurt, .6); foe.hitstunFrames = Math.max(foe.hitstunFrames, 36);
    foe.pendingKnockdown = 0;
    addShake(.2);
  }

  // ── Corner ───────────────────────────────────────────────────────────────
  // Getting pinned against a wall should hurt: the body splats back into the
  // attacker with extra hitstun instead of quietly clipping to the boundary.
  const drivenIntoWall = (foe.x <= RULES.wallLeft + 6 && foe.vx < 0) || (foe.x >= RULES.wallRight - 6 && foe.vx > 0);
  if ((drivenIntoWall && horizontal > 240) || (knockback.wallBounce && inCorner(foe))) {
    // Peeled off the wall. The rebound is comboable - it hands the attacker a
    // fresh juggle instead of quietly ending the string in the corner.
    foe.vx = -Math.sign(foe.vx || me.dir) * Math.max(RULES.wallBounceSpeed * .6, Math.abs(foe.vx) * .6);
    foe.grounded = false; foe.vy = -Math.max(RULES.wallBounceHeight * .55, vertical * .9);
    foe.hurt += .16; foe.hitstunFrames += 10;
    foe.effects.push({ kind: "impact", t: .4, x: foe.x, y: foe.y, color: "#ffffff", size: 78 });
    if (!foe.wallBounceUsed) {
      foe.wallBounceUsed = true; foe.pendingKnockdown = 0;
      foe.juggle = Math.max(foe.juggle, RULES.bounceJuggle); foe.juggleGravity = RULES.juggleStart;
      me.airComboTarget = foe; me.airComboTimer = Math.max(me.airComboTimer, 2.4); me.combo.timer = Math.max(me.combo.timer, 1.3);
      showBanner("WALL BOUNCE", .55, "break"); playSfx("boneCrack", { pan: panFromX(foe.x), volume: .7 });
    }
    addShake(.26); addHitstop(.07);
  }

  if (continuing && knockback.carry !== false && !foe.grappledBy) me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, foe.x - me.dir * 96));

  // ── Presentation ─────────────────────────────────────────────────────────
  foe.trail.push({ t: .35, x: foe.x, y: foe.y });
  foe.effects.push({ kind: counter ? "counter" : "impact", t: .38, x: foe.x, y: foe.y, color: counter ? "#ffe66d" : (visual?.color || state?.visual?.color || me.fighter.config?.accent || "#ff6c61"), size: (visual?.size || state?.visual?.size || 48) * (counter ? 1.3 : 1), vfxId: visual?.hitVfx || state?.visual?.hitVfx });
  const grappleHit = Boolean(state?.grapple) || isGrapple(move);
  if (counter) {
    playSfx(grappleHit ? "counterGrap" : "counterSlash", { pan: panFromX(foe.x), volume: .9 });
    foe.counterFlash = .3; showBanner("COUNTER", .55, "counter");
  } else if (state?.superMove || finalDamage > 16) {
    playSfx(grappleHit ? "hitCleanGrap" : "hitCleanSlash", { pan: panFromX(foe.x), volume: .85 });
  } else {
    playSfx(grappleHit ? "hitGrap" : "hitSlash", { pan: panFromX(foe.x), volume: .45 + Math.min(.35, finalDamage / 40), cooldown: .035 });
  }
  // Hitstop scales with how much the hit actually mattered.
  const weight = Math.min(1, finalDamage / 18);
  addHitstop(clampNumber(knockback.hitstop, 0, .3, (state?.superMove ? .16 : .035 + weight * .07) * (counter ? 1.5 : 1)));
  addShake((state?.superMove ? .34 : launcher ? .2 : .09 + weight * .12) * (counter ? 1.35 : 1));
  if (!me.comboPlan && me.combo.count >= 1 && me.combo.count <= 2 && foe.hurt > 0 && !foe.down && me.ai) {
    // A hit landed with no route running: confirm it into one.
    buildComboPlan(me, foe);
  }
  showComboReadout(me, me.combo.count); // ── Juggle state ─────────────────────────────────────────────────────────
  if (launcher && wasGrounded) {
    foe.grounded = false; foe.runJump = false; foe.y = Math.max(420, foe.y - 54); foe.vy = -Math.max(RULES.launchHeight, vertical);
    foe.airComboHits = 0; foe.juggleGravity = RULES.juggleStart;
    foe.juggle = Math.max(RULES.juggleBudget, Math.min(72, (Number(move?.juggle) || 4) * 6));
    me.airComboTarget = foe; me.airComboTimer = 2.9; me.airComboJumpQueued = true; me.combo.timer = Math.max(me.combo.timer, 1.25);
    foe.pendingKnockdown = RULES.hardKnockdown;
  } else if (state?.risingAttack && wasGrounded) {
    // Soft launchers use a lower pop and no hard-knockdown flag. Their reward
    // is the air-cancel state established by the rising hit above.
    foe.grounded = false; foe.runJump = false; foe.airComboHits = 0;
    foe.juggle = Math.max(18, foe.juggle || 0); foe.juggleGravity = RULES.juggleStart;
    me.airComboTarget = foe; me.airComboTimer = Math.max(me.airComboTimer, 2.35); me.airComboJumpQueued = false; me.combo.timer = Math.max(me.combo.timer, 1.05);
    foe.pendingKnockdown = 0;
  } else if (attackVariant === "air" && !foe.grounded) {
    // Each air hit adds gravity, so juggles end on their own instead of
    // needing an arbitrary hit cap to stop them.
    foe.juggleGravity = Math.min(RULES.maxJuggleGravity, (foe.juggleGravity || 1) + RULES.juggleGravityStep);
    foe.juggle = Math.max(0, (foe.juggle || 0) - Math.max(1, Number(move?.juggleCost) || RULES.juggleCostDefault));
    foe.airComboHits = (foe.airComboHits || 0) + 1;
    // Re-float scales with how deep the combo already is, so the tail of a long
    // air string still has something to hit instead of watching them drop out.
    const floatBoost = 1 + Math.min(.5, me.combo.count * .02);
    foe.vy = -Math.max(300, (vertical || 300) * floatBoost) / Math.max(.9, foe.juggleGravity);
    foe.y = Math.max(330, foe.y - 10);
    me.airComboTarget = foe; me.airComboTimer = Math.max(me.airComboTimer, foe.juggle > 0 ? 2.6 : .7); me.combo.timer = Math.max(me.combo.timer, 1.3);
    // Air hits carry rather than blast away: a juggle that shoves the victim
    // out of range on every hit can never become a real string. Later hits in
    // a combo carry harder, and the attacker drifts along with them.
    const carryTightness = Math.min(.85, .35 + me.combo.count * .04);
    const airPush = Math.max(40, horizontal * (1 - carryTightness));
    foe.vx = (direction || me.dir) * airPush;
    if (me.airComboTarget === foe && foe.juggle > 0) {
      me.vx = me.vx * (1 - carryTightness) + foe.vx * carryTightness;
      me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, foe.x - me.dir * 78));
    }
    foe.pendingKnockdown = RULES.softKnockdown;
  } else if (!wasGrounded) {
    foe.pendingKnockdown = RULES.softKnockdown;
  } else if (state?.superMove || finalDamage > 16) {
    foe.pendingKnockdown = RULES.hardKnockdown;
  }
  return true;
}
function updatePhysics(me, dt) {
  if (me.grappledBy) {
    const holder = me.grappledBy;
    me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, holder.x + holder.dir * 62)); me.y = holder.y; me.vx = 0; me.vy = 0; me.grounded = holder.grounded; me.pose = "grappled";
    me.trail = me.trail.filter(t => (t.t -= dt) > 0); me.effects = me.effects.filter(effect => (effect.t -= dt) > 0);
    return;
  }
  if (me.frozen > 0) { me.vx = 0; me.vy = 0; me.pose = "frozen"; me.trail = me.trail.filter(t => (t.t -= dt) > 0); me.effects = me.effects.filter(effect => (effect.t -= dt) > 0); return; }
  me.x += me.vx * dt;
  if (me.wallSlam && (me.x <= RULES.wallLeft + 2 || me.x >= RULES.wallRight - 2)) {
    const slam = me.wallSlam; me.wallSlam = null;
    me.hp = Math.max(0, me.hp - slam.damage);
    me.hurt = Math.max(me.hurt, .42); me.hitstunFrames = Math.max(me.hitstunFrames, 25);
    // The whole point of driving someone into the wall is what happens next:
    // they rebound off it in a juggle state, guaranteed, so the attacker keeps
    // the combo instead of watching them slump to the floor.
    me.vx = -Math.sign(me.vx || 1) * RULES.wallBounceSpeed; me.vy = -RULES.wallBounceHeight; me.grounded = false;
    me.pendingKnockdown = 0;
    me.juggle = Math.max(me.juggle, RULES.bounceJuggle); me.juggleGravity = RULES.juggleStart;
    me.airComboHits = 0; me.wallBounceUsed = true;
    const slammer = slam.from;
    if (slammer && slammer.hp > 0) {
      slammer.airComboTarget = me; slammer.airComboTimer = Math.max(slammer.airComboTimer, 2.6);
      slammer.airComboJumpQueued = true; slammer.combo.timer = Math.max(slammer.combo.timer, 1.4);
      // Chase the rebound now - waiting for the next decision tick would let
      // them peel off the wall and land before anything could meet them.
      slammer.jumpCd = 0; slammer.cd = 0;
      if (!slammer.comboPlan && slammer.ai) buildComboPlan(slammer, me);
      if (slammer.grounded && !slammer.attackState && !slammer.down) startJump(slammer, true, me);
    }
    me.effects.push({ kind: "impact", t: .5, x: me.x, y: me.y, color: slam.visual?.color || "#ffffff", size: 96, vfxId: slam.visual?.hitVfx });
    playSfx("quake", { pan: panFromX(me.x), volume: .9 }); playSfx("boneCrack", { pan: panFromX(me.x), volume: .6 });
    addShake(.44); addHitstop(.13); showBanner("WALL SLAM", .7, "break"); }
  if (me.x <= RULES.wallLeft && me.vx < 0) me.vx *= .4;
  if (me.x >= RULES.wallRight && me.vx > 0) me.vx *= .4;
  me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, me.x));
  me.vx *= me.wallSlam ? .995 : me.blocking ? .55 : me.down ? .84 : .82;
  if (!me.grounded) {
    me.y += me.vy * dt;
    me.vy += RULES.gravity * (me.hurt > 0 ? (me.juggleGravity || 1) : 1) * dt;
    if (me.y >= RULES.floorY) {
      me.y = RULES.floorY; me.vy = 0; me.grounded = true; me.runJump = false; me.airDash = 0; me.airDashUsed = false;
      me.juggle = 0; me.airComboHits = 0; me.airComboTarget = null; me.airComboTimer = 0; me.airComboJumpQueued = false;
      const bouncing = me.groundBouncePending && me.hurt > 0 && !me.bounceUsed && me.guardBroken <= 0;
      if (!bouncing && (!me.pendingKnockdown || (me.hurt <= 0 && me.guardBroken <= 0))) playSfx("land", { pan: panFromX(me.x), volume: .3, cooldown: .08 });
      me.groundBouncePending = 0;
      if (bouncing) {
        // Spiked into the floor and popped back up. One per combo, so it reads
        // as a deliberate extender rather than an endless pinball.
        me.bounceUsed = true; me.pendingKnockdown = 0; me.bounceTimer = .48;
        me.grounded = false; me.y = RULES.floorY - 6; me.vy = -RULES.groundBounceHeight; me.vx *= .45;
        me.juggle = Math.max(me.juggle, RULES.bounceJuggle); me.juggleGravity = RULES.juggleStart; me.airComboHits = 0;
        me.hurt = Math.max(me.hurt, .5); me.hitstunFrames = Math.max(me.hitstunFrames, 30);
        me.pose = "ground-bounce";
        me.effects.push({ kind: "bounce", t: .48, x: me.x, y: RULES.floorY, color: "#ffffff", size: 92 });
        const bouncer = me.lastAttacker;
        if (bouncer && bouncer.hp > 0) {
          bouncer.airComboTarget = me; bouncer.airComboTimer = Math.max(bouncer.airComboTimer, 2.5);
          bouncer.airComboJumpQueued = bouncer.grounded; bouncer.combo.timer = Math.max(bouncer.combo.timer, 1.35);
          // The bounce is a free confirm - route the rest of it rather than
          // leaving the attacker to improvise one button at a time.
          if (!bouncer.comboPlan && bouncer.ai) buildComboPlan(bouncer, me);
        }
        addShake(.3); addHitstop(.09); showBanner("BOUNCE", .5, "break"); playSfx("quake", { pan: panFromX(me.x), volume: .75 });
      } else if (me.pendingKnockdown && (me.hurt > 0 || me.guardBroken > 0)) {
        // Landing out of hitstun is a knockdown, not an instant recovery. This
        // is the beat that gives the round its rhythm.
        me.wallSlam = null;
      me.down = { t: 0, duration: me.pendingKnockdown };
        me.hurt = 0; me.hitstunFrames = 0; me.attackState = null; me.attack = 0;
        me.juggleGravity = 1; me.pose = "down";
        me.effects.push({ kind: "impact", t: .34, x: me.x, y: me.y, color: "#cfd8e3", size: 54 });
        playSfx("knockdown", { pan: panFromX(me.x), volume: .7 });
        addShake(.12);
      } else me.pose = "idle";
      me.pendingKnockdown = 0; me.juggleGravity = 1;
    }
  }
  const foe = foeOf(me); if (foe && !me.down && !me.grappledBy) me.dir = foe.x >= me.x ? 1 : -1;
  me.trail = me.trail.filter(t => (t.t -= dt) > 0); me.effects = me.effects.filter(effect => (effect.t -= dt) > 0);
}
function pushBoxWidth(fighter) { return fighter.grounded ? 112 : 96; }
function resolvePushBoxes(a, b) {
  if (!a || !b || a.grappledBy === b || b.grappledBy === a || a.grappleTarget === b || b.grappleTarget === a) return;
  if (Math.abs(a.y - b.y) > 165) return;
  const gap = Math.abs(b.x - a.x), minimumGap = (pushBoxWidth(a) + pushBoxWidth(b)) * .5;
  if (gap >= minimumGap) return;
  const direction = b.x === a.x ? (a.dir || 1) : b.x > a.x ? 1 : -1, overlap = minimumGap - gap;
  const aLocked = Boolean(a.grappledBy), bLocked = Boolean(b.grappledBy);
  if (!aLocked && !bLocked) { a.x -= direction * overlap * .5; b.x += direction * overlap * .5; }
  else if (!aLocked) a.x -= direction * overlap;
  else if (!bLocked) b.x += direction * overlap;
  a.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, a.x)); b.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, b.x));
  // Remove only the velocity that is driving the bodies into one another so
  // jump arcs, knockback, and recovery movement keep their personality.
  if (a.vx * direction > 0) a.vx *= .35;
  if (b.vx * direction < 0) b.vx *= .35;
}
function projectileHitboxConnects(projectile, previousX) {
  const target = projectile.target;
  if (!target) return false;
  const horizontalPadding = projectile.radius + 30;
  const minX = Math.min(previousX, projectile.x) - horizontalPadding;
  const maxX = Math.max(previousX, projectile.x) + horizontalPadding;
  const verticalPadding = projectile.radius + (target.grounded ? 96 : 112);
  return target.x >= minX && target.x <= maxX && Math.abs(projectile.y - (target.y - 88)) <= verticalPadding;
}
function bombHitboxConnects(bomb) {
  const target = bomb.target;
  return Boolean(target) && Math.abs(target.x - bomb.x) <= bomb.radius + 56 && Math.abs(target.y - bomb.owner.y) <= 170;
}
function updateProjectilePath(projectile, dt) {
  projectile.age = (projectile.age || 0) + dt;
  if (projectile.pattern === "orbit") {
    const angle = projectile.phase + projectile.age * projectile.orbitSpeed;
    projectile.x = projectile.originX + Math.cos(angle) * projectile.orbitRadius;
    projectile.y = projectile.originY + Math.sin(angle) * projectile.orbitRadius;
    return;
  }
  if (projectile.pattern === "boomerang" && !projectile.returning && projectile.age >= projectile.returnDelay) projectile.returning = true;
  const steerTarget = projectile.returning ? { x:projectile.owner.x, y:projectile.owner.y - 82 } : projectile.target;
  if ((projectile.homing > 0 || projectile.returning) && steerTarget && (projectile.vx || projectile.vy)) {
    const currentSpeed = Math.max(160, Math.hypot(projectile.vx, projectile.vy)), currentAngle = Math.atan2(projectile.vy, projectile.vx), desiredAngle = Math.atan2(steerTarget.y - projectile.y, steerTarget.x - projectile.x);
    let difference = desiredAngle - currentAngle;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    const turn = Math.min(Math.PI, (projectile.returning ? 10 : projectile.homing * 8) * dt), nextAngle = currentAngle + Math.max(-turn, Math.min(turn, difference));
    projectile.vx = Math.cos(nextAngle) * currentSpeed; projectile.vy = Math.sin(nextAngle) * currentSpeed;
  }
  projectile.vy += (projectile.gravity || 0) * dt;
  projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt;
  const floorY = projectile.owner.y - 24;
  if (projectile.bounces > 0 && projectile.y >= floorY && projectile.vy > 0) { projectile.y = floorY; projectile.vy = -Math.abs(projectile.vy) * .72; projectile.bounces -= 1; }
  if (projectile.returning && Math.hypot(projectile.x - projectile.owner.x, projectile.y - (projectile.owner.y - 82)) < 28) projectile.life = 0;
}
function explodeBomb(bomb) {
  if (bomb.exploding) return;
  playSfx("explode", { pan: panFromX(bomb.x), volume: .9 });
  bomb.exploding = true; bomb.vx = 0; bomb.armed = -1; bomb.life = .36;
  if (bombHitboxConnects(bomb)) hit(bomb.owner, bomb.target, bomb.damage, bomb.label, bomb.hitstun, false, "ground", bomb.visual, bomb.knockback);
  battle.shake = Math.max(battle.shake || 0, .22);
}
function updateProjectiles(dt) {
  if (!battle?.projectiles) return;
  battle.projectiles = battle.projectiles.filter((p) => {
    if (p.exploding) { p.life -= dt; return p.life > 0; }
    p.armed = Math.max(0, p.armed - dt);
    const previousX = p.x; updateProjectilePath(p, dt); p.life -= dt;
    if (p.bomb) {
      if (bombHitboxConnects(p) || p.armed === 0) explodeBomb(p);
      return p.exploding || (p.life > 0 && p.x > 35 && p.x < 1245);
    }
    p.hitCooldown = Math.max(0, (p.hitCooldown || 0) - dt);
    const close = projectileHitboxConnects(p, previousX);
    if (p.armed === 0 && close && p.hitCooldown === 0) {
      const connected = hit(p.owner, p.target, p.damage, p.label, p.hitstun, false, "ground", p.visual, p.knockback);
      if (connected !== false && p.status === "freeze") applyFreeze(p.target, p.freezeTime, p.visual);
      if (!p.pierce) return false;
      p.hitCooldown = p.hitImmunity || .35;
    }
    const inBounds = p.x > 35 && p.x < 1245;
    if (p.wallBounce && !inBounds) { p.vx = -p.vx; p.x = Math.max(36, Math.min(1244, p.x)); }
    return p.life > 0 && (p.wallBounce || inBounds);
  });
}
function finishRound(winner, reason = "K.O.") {
  if (battle.phase === "ko" || battle.phase === "between" || battle.phase === "done") return;
  battle.phase = "ko"; battle.koTimer = reason === "TIME OVER" ? .5 : 1.45; battle.pendingWinner = winner; battle.result = reason;
  battle.hitstop = 0;
  const loser = winner === null ? null : battle.fighters[winner === 0 ? 1 : 0];
  camera.focus = loser;
  if (reason === "K.O.") { playSfx("ko", { volume: 1 }); addShake(.42); addHitstop(.22); }
  for (const f of battle.fighters) { cancelComboPlan(f); if (f.grappleTarget) releaseGrapple(f); }
}
function awardRound() {
  const winner = battle.pendingWinner;
  camera.focus = null; battle.phase = "between"; battle.elapsed = 0; battle.hitstop = 0;
  if (winner === null) { showBanner("DRAW", 2.4, "draw"); battle.wins[0] += .5; battle.wins[1] += .5; }
  else {
    battle.wins[winner]++;
    const champ = winner === 0 ? battle.left : battle.right, victor = battle.fighters[winner];
    const perfect = victor.hp >= RULES.maxHp - .001;
    showBanner(`${champ.name.toUpperCase()} — ${perfect ? "PERFECT" : battle.result}`, 2.4, perfect ? "perfect" : "ko");
  }
  updateHud();
}
function nextRound() {
  hideBanner(); hideComboReadout();
  if (battle.wins[0] >= RULES.roundsToWin || battle.wins[1] >= RULES.roundsToWin || battle.round >= 5) {
    battle.phase = "done";
    const champ = battle.wins[0] === battle.wins[1] ? null : battle.wins[0] > battle.wins[1] ? battle.left : battle.right;
    playSfx("matchWin", { volume: .9 });
    showBanner(champ ? `${champ.name.toUpperCase()} WINS` : "DOUBLE K.O.", 999, "win");
    $("#rematch").hidden = false;
    return;
  }
  battle.round++;
  battle.fighters = [makeCombatant(battle.left, FIGHT_START_LEFT, 1), makeCombatant(battle.right, FIGHT_START_RIGHT, -1)];
  battle.projectiles = [];
  $("#round-text").textContent = `ROUND ${battle.round}`;
  camera.x = camera.targetX = 640; camera.zoom = camera.targetZoom = 1; camera.focus = null;
  beginRoundProper();
}
function updateHud() {
  if (!battle) return;
  const [a,b] = battle.fighters;
  const set = (id, value) => { const el = $(id); if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`; };
  set("#left-hp", a.hp / RULES.maxHp * 100); set("#right-hp", b.hp / RULES.maxHp * 100);
  set("#left-meter", a.meter / RULES.meterMax * 100); set("#right-meter", b.meter / RULES.meterMax * 100);
  set("#left-guard", a.guardBroken > 0 ? 0 : a.guard / RULES.guardMax * 100); set("#right-guard", b.guardBroken > 0 ? 0 : b.guard / RULES.guardMax * 100);
  $("#left-wins").textContent = Math.floor(battle.wins[0]); $("#right-wins").textContent = Math.floor(battle.wins[1]);
  const nameLeft = $(".nameplate.left"), nameRight = $(".nameplate.right");
  if (nameLeft) nameLeft.classList.toggle("charged", a.meter >= RULES.superCost);
  if (nameRight) nameRight.classList.toggle("charged", b.meter >= RULES.superCost);
}
// ─────────────────────────────────────────────────────────────────────────────
// STAGES
// A battle background is an uploaded image saved to the same account roster as
// a fighter. Creating and deleting them is the stage workshop's job; the arena
// only reads the list, remembers which one is chosen, and draws it. A stage
// that fails to load simply falls back to the built-in arena.
// ─────────────────────────────────────────────────────────────────────────────
let stages = [];
let activeStage = null;
let stageImage = null;

const STAGE_PREF_KEY = "forge-stage-id";
function readStagePref() { try { return localStorage.getItem(STAGE_PREF_KEY) || ""; } catch { return ""; } }
function writeStagePref(id) { try { if (id) localStorage.setItem(STAGE_PREF_KEY, id); else localStorage.removeItem(STAGE_PREF_KEY); } catch { /* storage unavailable */ } }

async function loadStages() {
  try {
    const response = await fetch("/api/stages");
    const data = await response.json();
    stages = Array.isArray(data.stages) ? data.stages : [];
  } catch { stages = []; }
  const preferred = stages.find((stage) => stage.id === readStagePref());
  selectStage(preferred || null);
  renderStages();
}

function selectStage(stage) {
  activeStage = stage || null;
  writeStagePref(stage?.id || "");
  stageImage = null;
  if (stage?.image_url) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    // Only a fully decoded image is ever handed to the renderer, so a slow or
    // broken upload never blanks the arena mid-match.
    image.onload = () => { if (activeStage?.id === stage.id) stageImage = image; };
    image.onerror = () => { if (activeStage?.id === stage.id) { stageImage = null; setStageStatus("That stage image could not be loaded."); } };
    image.src = stage.image_url;
  }
  setStageStatus(stage ? stage.name : "Default arena");
}

function setStageStatus(text) { const el = $("#stage-status"); if (el) el.textContent = text; }

function renderStages() {
  const strip = $("#stage-strip"); if (!strip) return;
  const tiles = [`<button class="stage-tile${activeStage ? "" : " active"}" data-stage="">DEFAULT<br><small>Neon arena</small></button>`];
  for (const stage of stages) {
    tiles.push(`<button class="stage-tile${activeStage?.id === stage.id ? " active" : ""}" data-stage="${escapeHtml(stage.id)}" style="background-image:url('${escapeHtml(stage.image_url)}')"><span>${escapeHtml(stage.name)}</span></button>`);
  }
  strip.innerHTML = tiles.join("");
  strip.querySelectorAll(".stage-tile").forEach((tile) => {
    tile.onclick = () => {
      playSfx("menuSelect", { volume: .5 });
      selectStage(stages.find((stage) => stage.id === tile.dataset.stage) || null);
      renderStages();
    };
  });
}

function drawArenaBackdrop(w, h, time) {
  const horizon = Math.round(h * .68), floor = Math.round(h * .75), center = w / 2;
  if (stageImage) {
    // Cover, not stretch: the uploaded art keeps its aspect ratio and is
    // cropped to the arena instead of being squashed to fit it.
    const scale = Math.max(w / stageImage.naturalWidth, h / stageImage.naturalHeight);
    const drawWidth = stageImage.naturalWidth * scale, drawHeight = stageImage.naturalHeight * scale;
    ctx.drawImage(stageImage, (w - drawWidth) / 2, (h - drawHeight) / 2, drawWidth, drawHeight);
    // A soft floor shadow so the fighters still read as standing on something.
    const grounding = ctx.createLinearGradient(0, floor - 40, 0, h);
    grounding.addColorStop(0, "rgba(4,10,18,0)"); grounding.addColorStop(1, "rgba(4,10,18,.72)");
    ctx.fillStyle = grounding; ctx.fillRect(0, floor - 40, w, h - floor + 40);
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, "#07131f"); sky.addColorStop(.5, "#12384a"); sky.addColorStop(1, "#266b79"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#07131d"; ctx.fillRect(0, horizon - 86, w, 120);
  ctx.globalAlpha = .22;
  for (let x = -120; x < w + 120; x += 96) { ctx.fillStyle = x % 192 ? "#38b8bd" : "#f2c65d"; ctx.fillRect(x, 88, 2, horizon - 120); }
  ctx.globalAlpha = .42;
  for (let i = 0; i < 9; i++) { const x = i * w / 8; ctx.strokeStyle = i % 2 ? "#18758b" : "#0c516c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, horizon - 50); ctx.lineTo(center + (x - center) * .4, 160); ctx.stroke(); }
  ctx.globalAlpha = .32;
  const halo = ctx.createRadialGradient(center, horizon - 110, 20, center, horizon - 110, 310); halo.addColorStop(0, "#f8d76a"); halo.addColorStop(.25, "#ed8f54"); halo.addColorStop(1, "transparent"); ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(center, horizon - 110, 310, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = .75; ctx.strokeStyle = "#e9c75c"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(center, horizon - 110, 158 + Math.sin(time * 2) * 5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(center, horizon - 110, 190, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = .42; ctx.strokeStyle = "#56e0df"; ctx.lineWidth = 3;
  for (const side of [-1, 1]) { for (let i = 0; i < 5; i++) { const inset = 20 + i * 31; ctx.beginPath(); ctx.moveTo(center + side * (inset + 42), horizon - 265 + i * 20); ctx.lineTo(center + side * (300 + i * 88), horizon - 70 + i * 12); ctx.lineTo(center + side * (420 + i * 55), horizon - 25); ctx.stroke(); } }
  ctx.globalAlpha = .2; ctx.fillStyle = "#fff4be";
  for (const x of [w * .08, w * .2, w * .8, w * .92]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 85, horizon - 30); ctx.lineTo(x + 85, horizon - 30); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1;
  const floorGradient = ctx.createLinearGradient(0, floor, 0, h); floorGradient.addColorStop(0, "#153645"); floorGradient.addColorStop(1, "#040a12"); ctx.fillStyle = floorGradient; ctx.fillRect(0, floor, w, h - floor);
  ctx.strokeStyle = "#2e8092"; ctx.lineWidth = 2; for (let y = floor + 34; y < h; y += 34) { ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.globalAlpha = .65; for (let x = -w; x < w * 2; x += 74) { ctx.beginPath(); ctx.moveTo(center + (x - center) * .04, floor); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = "#07131c"; ctx.fillRect(0, floor - 11, w, 12); ctx.fillStyle = "#edc653"; for (let x = 0; x < w; x += 74) ctx.fillRect(x + 8, floor - 4, 38, 4);
  ctx.strokeStyle = "#e8bd4f"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(center, floor + 33, 300, 56, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "#1e91a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(center, floor + 33, 205, 38, 0, 0, Math.PI * 2); ctx.stroke();
  const vignette = ctx.createRadialGradient(center, h * .48, h * .18, center, h * .48, h * .8); vignette.addColorStop(.62, "transparent"); vignette.addColorStop(1, "#020509cc"); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
}
function draw() {
  const w = arena.width, h = arena.height;
  ctx.clearRect(0, 0, w, h);
  const shake = (battle?.shake || 0) * 30, time = battle?.elapsed || 0;
  const shakeX = Math.sin(time * 73) * shake, shakeY = Math.cos(time * 61) * shake * .55;
  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y + (h / 2 - 330));
  drawArenaBackdrop(w, h, time);
  if (battle) {
    for (const f of battle.fighters) drawFighter(f);
    for (const p of battle.projectiles || []) drawProjectileVisual(p);
  }
  ctx.restore();
  requestAnimationFrame(draw);
}
function drawCombatStateFx(f, blocking, running) {
  if (f.airDash > 0) {
    const localDir = (f.airDashDir || f.dir || 1) * (f.dir || 1);
    ctx.save(); ctx.globalAlpha = Math.min(.8, f.airDash * 4.5); ctx.strokeStyle = f.fighter.config?.accent || "#8fe4ff"; ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const y = -122 + i * 18, start = -localDir * (26 + i * 6), end = -localDir * (104 + i * 23); ctx.beginPath(); ctx.moveTo(start, y); ctx.lineTo(end, y - i * 4); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (running) { ctx.globalAlpha=.55; ctx.strokeStyle="#d8ff3e"; ctx.lineWidth=4; for (let i=0;i<2;i++) { ctx.beginPath(); ctx.moveTo(-55,-42+i*20); ctx.lineTo(-88,-42+i*20); ctx.stroke(); } ctx.globalAlpha=1; }
  if (blocking) {
    // The guard arc drains with the guard meter, so a fighter about to be
    // crushed visibly looks like it.
    const health = Math.max(.12, f.guard / RULES.guardMax);
    ctx.strokeStyle = f.guardFlash > 0 ? "#fff" : health < .35 ? "#ff6c61" : "#d8ff3e";
    ctx.lineWidth = 4 + health * 6;
    ctx.beginPath(); ctx.arc(38, f.blockLow ? -66 : -92, 43, -1.15 * health - .2, 1.15 * health + .2); ctx.stroke();
  }
  if (f.superFlash > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(.85, f.superFlash * 1.8); ctx.strokeStyle = f.fighter.config?.color || "#f2c447"; ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) { const r = 60 + i * 34 + (1 - f.superFlash) * 90; ctx.beginPath(); ctx.arc(0, -95, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (f.counterFlash > 0) {
    ctx.save(); ctx.globalAlpha = f.counterFlash * 2.4; ctx.fillStyle = "#ffe66d";
    ctx.beginPath(); ctx.arc(0, -95, 74, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (f.guardBroken > 0) {
    ctx.save(); ctx.globalAlpha = .8; ctx.strokeStyle = "#ffe66d"; ctx.lineWidth = 4; ctx.setLineDash([9, 6]);
    ctx.beginPath(); ctx.arc(0, -95, 66 + Math.sin(f.guardBroken * 26) * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (f.techTimer > 0) {
    const pulse = 1 + Math.sin((battle?.elapsed || 0) * 28) * .12;
    ctx.save(); ctx.globalAlpha = Math.min(1, f.techTimer * 3.2); ctx.strokeStyle = "#bdf6ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -92, 52 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = f.fighter.config?.color || "#d8ff3e";
    ctx.beginPath(); ctx.arc(0, -92, 68 / pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore(); ctx.globalAlpha = 1;
  }
}
function drawGrappleLink(f) {
  const target = f.grappleTarget;
  if (!target || !f.attackState?.grappled) return;
  const phase = f.attackState.grapplePhase, time = battle?.elapsed || 0, pulse = 1 + Math.sin(time * 22) * .08;
  const color = f.attackState.visual?.color || "#ff9f43", accent = f.attackState.visual?.secondary || "#fff2c2";
  const x1 = f.x + f.dir * 36, y1 = f.y - 112, x2 = target.x - f.dir * 29, y2 = target.y - 107;
  ctx.save();
  // A held clinch crackles with energy along the tether; a strike or finish
  // reads as a single hot line instead of a loose dashed rope.
  if (phase === "hold") {
    const segments = 5;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments, t1 = (i + 1) / segments;
      const jitter = Math.sin(time * 26 + i * 2.1) * 5;
      const ax = x1 + (x2 - x1) * t0, ay = y1 + (y2 - y1) * t0 + jitter;
      const bx = x1 + (x2 - x1) * t1, by = y1 + (y2 - y1) * t1 - jitter;
      glowStroke(() => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }, i % 2 ? accent : color, 4 * pulse, .85);
    }
    ctx.restore();
    glowFill(() => { ctx.beginPath(); ctx.arc(x2, y2, 15 * pulse, 0, Math.PI * 2); }, accent, .9, 20);
  } else {
    glowStroke(() => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }, color, 6, .55);
  }
  ctx.restore();
}
function animationTransform(f, state) {
  const a = state?.animation || {}, intensity = Number(a.intensity) || 1, phase = state?.grapplePhase;
  let rotation = 0, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0;
  if (f.down) {
    // Flat on the deck, then folding back upright through the get-up frames.
    const progress = Math.min(1, f.down.t / Math.max(.001, f.down.duration));
    const rising = Math.max(0, (progress - .68) / .32);
    const flat = 1 - rising;
    return { rotation: -f.dir * 1.42 * flat, offsetX: f.dir * -34 * flat, offsetY: 62 * flat, scaleX: 1 + .12 * flat, scaleY: 1 - .1 * flat, skewX: 0, skewY: 0 };
  }
  if (f.guardBroken > 0) {
    const wobble = Math.sin(f.guardBroken * 34);
    return { rotation: wobble * .17, offsetX: wobble * 9, offsetY: 0, scaleX: 1, scaleY: .97, skewX: wobble * .09, skewY: 0 };
  }
  if (f.recovery) {
    const progress = Math.min(1, Math.max(0, f.recovery.t / Math.max(.001, f.recovery.duration)));
    if (f.recovery.type === "backflip") {
      const turn = progress * Math.PI * 2, depth = Math.abs(Math.cos(turn));
      // Fake a 3D recovery with depth squash and skew while the sprite makes
      // one intentional flip. The effect stays bounded and returns upright.
      rotation = f.dir * turn; offsetY = -Math.sin(progress * Math.PI) * 18;
      scaleX = .76 + depth * .3; scaleY = 1.02 + (1 - depth) * .08; skewX = Math.sin(turn) * .24; skewY = Math.cos(turn) * .08;
    }
    else {
      const hop = progress * Math.PI, depth = Math.abs(Math.cos(hop));
      rotation = f.dir * Math.sin(hop) * .14; offsetY = -Math.sin(hop) * 10;
      scaleX = .86 + depth * .16; scaleY = 1.02 + (1 - depth) * .05; skewX = Math.sin(hop) * .14; skewY = -Math.sin(hop) * .06;
    }
  }
  else if (f.bounceTimer > 0) {
    const progress = 1 - Math.min(1, f.bounceTimer / .48);
    // The rebound folds the body into the floor, then opens it out as the
    // launch carries them back up. It is deliberately different from ordinary
    // air hitstun so a bounce is readable at a glance.
    rotation = f.hitDirection * (.46 - progress * .22);
    offsetY = 12 * (1 - progress);
    scaleX = 1.13 - progress * .08;
    scaleY = .82 + progress * .15;
    skewX = f.hitDirection * .18 * (1 - progress);
  }
  else if (f.hurt > 0) {
    const force = Math.min(1, f.hurt * 4.6);
    const hitDirection = Math.sign(f.hitDirection || f.vx || -f.dir) || 1;
    // Grounded hits recoil backward; airborne hits tumble and stretch along
    // their launch path. This is the actual hurt pose, not only a white flash.
    rotation = hitDirection * (f.grounded ? .16 : .31) * force;
    offsetX = hitDirection * (f.grounded ? 11 : 17) * force;
    offsetY = f.grounded ? 5 * force : -4 * force;
    scaleX = 1 + .12 * force;
    scaleY = 1 - .1 * force;
    skewX = hitDirection * .12 * force;
  }
  else if (f.grappledBy) { rotation = f.grappledBy.dir * -.12; offsetX = f.grappledBy.dir * 7; offsetY = phase === "finish" ? 6 : -1; scaleX = .94; scaleY = 1.03; }
  else if (state?.diveKick || /dive/.test(String(a.gesture || "").toLowerCase())) { const diveProgress = state ? Math.min(1, state.t / Math.max(.001, state.duration)) : 0; rotation = -f.dir * (.28 + Math.sin(diveProgress * Math.PI) * .18) * intensity; offsetX = f.dir * 9 * intensity; offsetY = 14 * intensity; scaleX = 1.08; scaleY = .94; }
  else if (a.style === "kick") { rotation = -f.dir * .12 * intensity; offsetX = f.dir * 5 * intensity; }
  else if (a.style === "spin") { rotation = Math.sin((state?.t || 0) * 18) * .17 * intensity; offsetY = -7 * intensity; scaleX = 1.03; }
  else if (a.style === "dash") { offsetX = f.dir * 11 * intensity; rotation = -f.dir * .1 * intensity; }
  else if (a.style === "grapple") {
    if (phase === "reach") { offsetX = f.dir * 8 * intensity; rotation = -f.dir * .08 * intensity; }
    if (phase === "hold") { offsetX = f.dir * 4; rotation = f.dir * .13 * intensity; scaleX = 1.04; }
    if (phase === "finish") { offsetX = -f.dir * 6; offsetY = -8 * intensity; rotation = -f.dir * .25 * intensity; }
  } else if (a.style === "slam") { offsetY = phase === "finish" ? -10 : 0; rotation = f.dir * .16 * intensity; }
  if (state && !f.grappledBy && state.t < state.startup / 60) {
    if (a.windup === "crouch") { offsetY += 8 * intensity; scaleY *= .92; }
    else if (a.windup === "reach") offsetX += f.dir * 9 * intensity;
    else if (a.windup === "hop") { offsetY -= 8 * intensity; rotation -= f.dir * .05; }
    else if (a.windup === "spin") rotation += f.dir * .18 * intensity;
    else if (a.windup === "coil") { rotation -= f.dir * .08 * intensity; scaleX *= .97; }
  }
  if (state && !f.grappledBy && state.t > (state.startup + state.active) / 60) {
    if (a.finish === "recoil" || a.finish === "snap") offsetX -= f.dir * 5 * intensity;
    else if (a.finish === "follow-through") { offsetX += f.dir * 7 * intensity; rotation += f.dir * .08 * intensity; }
    else if (a.finish === "throw") { offsetY -= 5 * intensity; rotation += f.dir * .1 * intensity; }
  }
  // Freeform transform recipe. Canvas is 2D, so X/Y rotations are projected
  // into squash, stretch, and skew while Z rotation remains a true spin.
  const transform = a.transform || {}, progress = state ? Math.min(1, Math.max(0, state.t / Math.max(.001, state.duration))) : 0;
  const pulse = state ? Math.sin(progress * Math.PI) : 0, time = battle?.elapsed || 0;
  const rotateX = Number(transform.rotateX) || 0, rotateY = Number(transform.rotateY) || 0;
  const rotateZ = Number(transform.rotateZ) || 0, spin = Number(transform.spin) || 0, spinSpeed = Number(transform.spinSpeed) || 0;
  const xRadians = rotateX * Math.PI / 180 * pulse, yRadians = rotateY * Math.PI / 180 * pulse;
  // Freeform values describe the move, but the fighter sprite itself needs a
  // safe projection. The old spinSpeed * time calculation accumulated a new
  // rotation every frame, while 2.4x scale could make the character engulf
  // the arena. Keep the silhouette readable and let VFX carry the excess.
  const bodyRotation = (rotateZ * pulse + spin * progress) * Math.PI / 180;
  rotation += Math.max(-.58, Math.min(.58, bodyRotation)) + Math.sin(time * spinSpeed * 2.4) * .16;
  scaleX *= Math.max(.72, Math.min(1.3, Math.max(.18, Math.abs(Math.cos(yRadians))) * (Number(transform.scaleX) || 1)));
  scaleY *= Math.max(.72, Math.min(1.3, Math.max(.18, Math.abs(Math.cos(xRadians))) * (Number(transform.scaleY) || 1)));
  skewX += Math.max(-.28, Math.min(.28, (Number(transform.skewX) || 0) * .55));
  skewY += Math.max(-.28, Math.min(.28, (Number(transform.skewY) || 0) * .55));
  skewX += Math.sin(xRadians) * .32;
  skewY += Math.sin(yRadians) * .32;
  offsetX += Math.max(-64, Math.min(64, (Number(transform.offsetX) || 0) * pulse)) + Math.sin(progress * Math.PI * 2) * Math.max(-18, Math.min(18, (Number(transform.orbit) || 0) * 34));
  offsetY += Math.max(-48, Math.min(48, (Number(transform.offsetY) || 0) * pulse)) + Math.cos(progress * Math.PI * 2) * Math.max(-12, Math.min(12, (Number(transform.orbit) || 0) * 12));
  if (transform.pulse) { const squash = 1 + Math.sin(progress * Math.PI * 2) * Number(transform.pulse) * .14; scaleX *= squash; scaleY *= 2 - squash; }
  scaleX = Math.max(.72, Math.min(1.35, scaleX)); scaleY = Math.max(.72, Math.min(1.35, scaleY));
  return { rotation, offsetX, offsetY, scaleX, scaleY, skewX, skewY };
}
const vfxImageCache = new Map();
function drawVfxAsset(id, frame, x, y, size, alpha = 1, rotation = 0) {
  if (!id || !VFX_IDS.has(id)) return;
  const path = framePath(id, frame); let image = vfxImageCache.get(path);
  if (!image) { image = new Image(); image.src = path; vfxImageCache.set(path, image); }
  if (!image.complete || !image.naturalWidth) return;
  const ratio = image.naturalWidth / image.naturalHeight, width = ratio >= 1 ? size : size * ratio, height = ratio >= 1 ? size / ratio : size;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha *= alpha; ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore();
}
const customSpriteCache = new Map();
function drawCustomSprite(url, x, y, size, alpha = 1, rotation = 0) {
  if (!url) return false;
  let image = customSpriteCache.get(url);
  if (!image) { image = new Image(); image.src = url; customSpriteCache.set(url, image); }
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const ratio = image.naturalWidth / image.naturalHeight, width = ratio >= 1 ? size : size * ratio, height = ratio >= 1 ? size / ratio : size;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha *= alpha; ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore();
  return true;
}
function drawAttackPersonality(state, x, y, size) {
  const animation = state.animation || {}, gesture = `${animation.gesture || ""} ${animation.style || ""} ${state.move?.type || ""}`.toLowerCase();
  const time = battle?.elapsed || 0, activeStart = state.startup / 60, activeEnd = (state.startup + state.active) / 60;
  const active = state.t >= activeStart && state.t <= activeEnd, pulse = 1 + Math.sin(time * 24) * .08;
  const intensity = Math.max(.45, Math.min(1.6, Number(animation.intensity) || 1));
  const localAlpha = (active ? .68 : .2) * intensity;
  const strokeColor = active ? (state.visual?.secondary || "#ffffff") : (state.visual?.color || "#ffffff");
  const strokeWidth = Math.max(2.5, size / 20) * (active ? 1.25 : .8);
  ctx.save(); ctx.translate(x, y); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const line = (x1, y1, x2, y2) => glowStroke(() => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }, strokeColor, strokeWidth, localAlpha);
  if (/rapid|ora|barrage|flurry/.test(gesture) || state.rapidJab) {
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * size * .14, reach = size * (.52 + (i % 2) * .18);
      line(-size * .3, spread, reach, spread - size * .08);
    }
    glowStroke(() => { ctx.beginPath(); ctx.arc(size * .28, 0, size * .54 * pulse, -1.2, 1.2); }, strokeColor, strokeWidth, localAlpha);
  } else if (/dive/.test(gesture) || state.diveKick) {
    line(-size * .24, -size * .3, size * .62, size * .46);
    line(size * .05, -size * .05, size * .82, size * .64);
    glowStroke(() => { ctx.beginPath(); ctx.arc(size * .5, size * .42, size * .42 * pulse, -2.4, .35); }, strokeColor, strokeWidth, localAlpha);
  } else if (/hook|elbow/.test(gesture)) {
    glowStroke(() => { ctx.beginPath(); ctx.arc(size * .08, 0, size * .74 * pulse, -1.72, .55); }, strokeColor, strokeWidth, localAlpha);
    line(size * .38, -size * .2, size * .7, size * .06);
  } else if (/knee|roundhouse|sweep/.test(gesture)) {
    glowStroke(() => { ctx.beginPath(); ctx.arc(size * .05, size * .1, size * .82 * pulse, -.65, .95); }, strokeColor, strokeWidth, localAlpha);
    line(size * .12, size * .48, size * .68, size * .26);
  } else if (/overhead|slam/.test(gesture)) {
    line(-size * .06, -size * .7, size * .14, size * .42);
    line(size * .14, size * .42, -size * .02, size * .2);
    line(size * .14, size * .42, size * .3, size * .2);
  } else if (/spin|whirl/.test(gesture)) {
    glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, size * .64 * pulse, -2.55, 1.2); }, strokeColor, strokeWidth, localAlpha);
    glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, size * .86, -.2, 2.1); }, strokeColor, strokeWidth * .7, localAlpha * .8);
  } else if (/cast|burst|charge|rune/.test(gesture)) {
    glowStroke(() => { ctx.beginPath(); ctx.arc(size * .12, 0, size * .42 * pulse, 0, Math.PI * 2); }, strokeColor, strokeWidth, localAlpha);
    for (let i = 0; i < 4; i++) { const a = time * 2.4 + i * Math.PI / 2; line(size * .46 + Math.cos(a) * 7, Math.sin(a) * 7, size * .72 + Math.cos(a) * 13, Math.sin(a) * 13); }
  } else {
    const reach = size * (.64 + (active ? .08 : 0));
    for (let i = 0; i < 3; i++) { const yy = (i - 1) * size * .13; line(-size * (.34 - i * .04), yy + size * .1, reach - i * size * .08, yy - size * .02); }
  }
  ctx.restore();
}
// ─────────────────────────────────────────────────────────────────────────────
// WEAPONS
// A move that names a weapon draws the real sprite in the fighter's hand and
// swings it along an arc chosen by its weapon motion, so a stab, an overhead
// chop and a spinning sweep all read differently even with the same sprite.
// ─────────────────────────────────────────────────────────────────────────────
const weaponImages = new Map();
function weaponImage(id) {
  if (!WEAPON_IDS.has(id)) return null;
  if (!weaponImages.has(id)) {
    const image = new Image();
    image.src = WEAPON_BASE + WEAPON_BY_ID.get(id).file;
    weaponImages.set(id, image);
  }
  const image = weaponImages.get(id);
  return image.complete && image.naturalWidth ? image : null;
}

// Where the weapon sits and how it is angled at this point in the swing.
// `phase` runs 0 (windup) -> 1 (end of recovery); `swing` runs 0 -> 1 across
// the active frames alone, which is where the real motion lives.
function weaponPose(motion, phase, swing, reach) {
  const ease = swing * swing * (3 - 2 * swing);
  switch (motion) {
    case "dive-stab":
      // Point-down thrust: the blade drops through the body of the swing, which
      // is what an air stomp-stab and a grounded downward stab both look like.
      return { x: reach * (.16 + ease * .38), y: -168 + ease * 172, rotation: 1.35 + ease * .3, scale: 1 };
    case "jump-spin":
      // Spun overhead while airborne, so the arc sits high and stays high.
      return { x: reach * .46 * Math.cos(ease * Math.PI * 2 - Math.PI / 2), y: -132 + reach * .34 * Math.sin(ease * Math.PI * 2 - Math.PI / 2), rotation: ease * Math.PI * 2.6, scale: 1 };
    case "spin-throw": {
      // Two beats in one move: spin it up through the active frames, then let
      // it go, so the release reads as the pay-off for the wind-up.
      const release = .62;
      if (ease < release) {
        const wind = ease / release;
        return { x: reach * .44 * Math.cos(wind * Math.PI * 3), y: -92 + reach * .3 * Math.sin(wind * Math.PI * 3), rotation: wind * Math.PI * 3, scale: 1 };
      }
      const flight = (ease - release) / (1 - release);
      return { x: reach * (.5 + flight * 2.1), y: -96 - Math.sin(flight * Math.PI) * 30, rotation: Math.PI * 3 + flight * Math.PI * 6, scale: 1 - flight * .25 };
    }
    case "stab":
      return { x: reach * (.12 + ease * .95), y: -74, rotation: -.08, scale: 1 };
    case "overhead":
      return { x: reach * (.28 + ease * .42), y: -150 + ease * 120, rotation: -2.05 + ease * 2.6, scale: 1.05 };
    case "arc":
      return { x: reach * (.18 + Math.sin(ease * Math.PI) * .78), y: -132 + Math.sin(ease * Math.PI) * 74, rotation: -1.5 + ease * 3.1, scale: 1 };
    case "sweep":
      return { x: reach * (.15 + ease * .8), y: -34 - Math.sin(ease * Math.PI) * 22, rotation: 1.35 - ease * 1.5, scale: 1 };
    case "spin":
      return { x: reach * .42 * Math.cos(ease * Math.PI * 2), y: -86 + reach * .3 * Math.sin(ease * Math.PI * 2), rotation: ease * Math.PI * 2, scale: 1 };
    case "throw":
      return { x: reach * (.1 + phase * 1.6), y: -96 - Math.sin(phase * Math.PI) * 44, rotation: phase * Math.PI * 4, scale: .9 };
    case "shoot":
      return { x: reach * .3, y: -92, rotation: -.05 - Math.sin(ease * Math.PI) * .22, scale: 1 };
    default: // swipe
      return { x: reach * (.1 + ease * .9), y: -118 + ease * 58, rotation: -1.05 + ease * 2.2, scale: 1 };
  }
}

// Draw one weapon at a pose. Split out so the main hand and the off hand of a
// dual-wielder go through exactly the same path with different timing.
function drawOneWeapon(state, id, pose, scale, opacity, live) {
  const image = weaponImage(id); if (!image) return false;
  const entry = WEAPON_BY_ID.get(id);
  // Weapons are drawn at a readable size next to a 148px-wide fighter, not at
  // their full nominal reach - a greatsword should still look like a sword the
  // character is holding rather than a wall of pixels.
  const length = Math.max(38, Math.min(180, entry.reach * .58)) * pose.scale * scale;
  const height = length * (image.naturalHeight / Math.max(1, image.naturalWidth));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rotation);
  ctx.imageSmoothingEnabled = true;
  // A weapon glows with the move's colour while it is live, which is what sells
  // the active frames without hiding the sprite behind an effect.
  if (live) { ctx.shadowColor = state.visual?.color || "#ffffff"; ctx.shadowBlur = 22; }
  ctx.drawImage(image, -length * .18, -height * .5, length, height);
  ctx.shadowBlur = 0;
  ctx.restore();
  return true;
}

function drawWeapon(state, opacity) {
  const id = state.visual?.weapon; if (!id) return false;
  const entry = WEAPON_BY_ID.get(id); if (!entry) return false;
  const activeStart = state.startup / 60, activeEnd = (state.startup + state.active) / 60;
  const phase = Math.min(1, Math.max(0, state.t / Math.max(.001, state.duration)));
  const swing = Math.min(1, Math.max(0, (state.t - activeStart) / Math.max(.001, activeEnd - activeStart)));
  const live = state.t >= activeStart && state.t <= activeEnd;
  let motion = state.behavior?.weaponMotion || WEAPON_DEFAULT_MOTION[entry.weaponClass] || "swipe";
  // An airborne swing that would otherwise be a flat spin reads better spun
  // overhead, and a downward air attack is a dive stab whatever it was called.
  if (state.variant === "air" && motion === "spin") motion = "jump-spin";
  if (state.variant === "air" && (state.diveKick || state.groundPound) && motion === "stab") motion = "dive-stab";
  const reach = (state.hitRange || entry.reach) / 1.28;
  const scale = clampNumber(state.visual?.weaponScale, .35, 1.8, 1);
  let drawn = drawOneWeapon(state, id, weaponPose(motion, phase, swing, reach), scale, opacity, live);

  // Dual wield: the off hand mirrors the main hand a beat behind and slightly
  // behind in depth, so the pair reads as two blades rather than one doubled.
  const offhandId = state.visual?.weaponOffhand;
  if (offhandId && WEAPON_BY_ID.has(offhandId)) {
    const lag = Math.max(0, Math.min(1, swing - .18));
    const offhandPose = weaponPose(state.behavior?.weaponMotionOffhand || motion, Math.max(0, phase - .1), lag, reach * .82);
    offhandPose.y += 26; offhandPose.x -= 16; offhandPose.rotation = -offhandPose.rotation * .82;
    drawn = drawOneWeapon(state, offhandId, offhandPose, scale * .88, opacity * .9, live) || drawn;
  }
  return drawn;
}
function drawMoveVisual(f, state) {
  if (!state?.visual) return;
  const v = state.visual, effect = v.effect, size = v.size, activeStart = state.startup / 60, activeEnd = (state.startup + state.active) / 60;
  const active = state.t >= activeStart && state.t <= activeEnd;
  const windup = Math.min(1, state.t / Math.max(.001, activeStart)), recovery = state.t > activeEnd ? Math.min(1, (state.t - activeEnd) / Math.max(.001, state.duration - activeEnd)) : 0;
  ctx.save(); ctx.globalAlpha = active ? .88 + Math.sin((battle?.elapsed || 0) * 28) * .08 : state.t < activeStart ? .08 + windup * .3 : Math.max(.06, .4 * (1 - recovery)); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const renderReach = (state.hitRange || state.reach || moveHitRange(state.move, state.variant)) / 1.28;
  const meleeVisual = !isRanged(state.move) && state.move?.type !== "teleport";
  const assetHalf = Math.max(36, size * 1.025), assetOffset = size * .45;
  const x = meleeVisual ? Math.max(44, renderReach - assetHalf - assetOffset) : state.variant === "air" ? 52 : 46;
  const y = state.animation?.contact === "foot" ? -58 : state.variant === "crouch" ? -64 : -88;
  const weaponDrawn = drawWeapon(state, active ? 1 : .55);
  if (runVisualScript(state, x, y, size, active, Math.min(1, Math.max(0, state.t / Math.max(.001, state.duration))))) { ctx.restore(); return; }
  // With a real weapon on screen the generic body flourish just clutters it.
  if (!weaponDrawn) drawAttackPersonality(state, x, y, size);
  drawVfxAsset(v.mainVfx, state.t * (Number(v.vfxFps) || 18), x + size * .45, y, Math.max(72, size * 2.05), active ? .96 : .48, state.animation?.style === "spin" ? Math.sin((battle?.elapsed || 0) * 17) * .22 : 0);
  if (state.charge && state.t < activeStart) {
    const chargePulse = 1 + Math.sin((battle?.elapsed || 0) * 18) * .08, chargeRadius = size * (.28 + windup * .55);
    ctx.strokeStyle = v.secondary; ctx.lineWidth = 4; ctx.globalAlpha = .3 + windup * .5; ctx.beginPath(); ctx.arc(x + size * .45, y, chargeRadius * chargePulse, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = v.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + size * .45, y, chargeRadius * .72, -Math.PI * .5, -Math.PI * .5 + Math.PI * 2 * windup); ctx.stroke();
  }
  if (state.animation?.style === "spin") { ctx.translate(x + 18, y); ctx.rotate(Math.sin((battle?.elapsed || 0) * 17) * .22); ctx.translate(-x - 18, -y); }
  if (state.animation?.style === "dash" && state.t < activeEnd) { ctx.strokeStyle=v.secondary; ctx.globalAlpha*=.42; ctx.lineWidth=5; for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-18-i*9,y+28+i*11);ctx.lineTo(x+size*.55-i*7,y+8+i*11);ctx.stroke();} }
  if (state.rapidJab) {
    ctx.strokeStyle = v.secondary; ctx.globalAlpha = active ? .72 : .24; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const yOffset = (i - 1.5) * size * .16; ctx.beginPath(); ctx.moveTo(x - size * .35, y + yOffset); ctx.lineTo(x + size * (.6 + (i % 2) * .14), y + yOffset - size * .08); ctx.stroke(); }
  }
  if (state.diveKick) {
    ctx.strokeStyle = v.secondary; ctx.globalAlpha = active ? .78 : .3; ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - size * (.18 + i * .18), y - size * (.65 + i * .08)); ctx.lineTo(x + size * (.55 - i * .08), y + size * (.72 - i * .12)); ctx.stroke(); }
  }
  if (effect === "arc" || effect === "beam") {
    ctx.strokeStyle = v.color; ctx.lineWidth = Math.max(5, size / 9); ctx.beginPath();
    if (effect === "arc") ctx.arc(x, y, size * .68, -1.12, .74);
    else { ctx.moveTo(x - 12, y); ctx.lineTo(x + size * 1.55, y); }
    ctx.stroke(); ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.stroke();
  } else if (effect === "slashes") {
    ctx.strokeStyle = v.color; ctx.lineWidth = Math.max(5, size / 12);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 12 + i * 7, y + 25 - i * 13); ctx.lineTo(x + size * .9, y - 24 + i * 13); ctx.stroke(); }
    ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x + size, y - 30); ctx.stroke();
  } else if (effect === "burst") {
    ctx.strokeStyle = v.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x + 18, y, size * .38, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + 18 + Math.cos(a) * 24, y + Math.sin(a) * 24); ctx.lineTo(x + 18 + Math.cos(a) * size * .7, y + Math.sin(a) * size * .7); ctx.stroke(); }
  } else if (effect === "rune") {
    ctx.strokeStyle = v.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y + 15, size * .45, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = v.secondary; ctx.beginPath(); ctx.moveTo(x, y - size * .22); ctx.lineTo(x + size * .22, y + 15); ctx.lineTo(x, y + size * .52); ctx.lineTo(x - size * .22, y + 15); ctx.closePath(); ctx.stroke();
  } else if (effect === "freeze") {
    const pulse = 1 + Math.sin((battle?.elapsed || 0) * 16) * .08;
    ctx.strokeStyle = v.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + 16, y, size * .62 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = v.secondary; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x + 16 + Math.cos(a) * 13, y + Math.sin(a) * 13); ctx.lineTo(x + 16 + Math.cos(a) * size * .72, y + Math.sin(a) * size * .72); ctx.stroke(); }
  } else if (effect === "teleport") {
    const pulse = 1 + Math.sin((battle?.elapsed || 0) * 18) * .12;
    ctx.strokeStyle = v.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x + 18, y + 10, size * .36 * pulse, size * .72, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x + 18, y + 10, size * .18, size * .62, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (effect === "pillar") {
    const height = size * (state.grapplePhase === "finish" ? 1.55 : 1.25); ctx.strokeStyle = v.color; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + 18, y + 24); ctx.lineTo(x + 18, y - height); ctx.stroke(); ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 18, y - height); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 18, y + 22, size * .35, 0, Math.PI * 2); ctx.stroke();
  } else if (effect === "grapple") {
    const phase = state.grapplePhase || "reach", reach = phase === "hold" ? size * .8 : phase === "finish" ? size * .55 : size * 1.05;
    const armTrace = () => { ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.bezierCurveTo(x + size * .18, y - 28, x + reach * .62, y + 28, x + reach, y - 4); };
    glowStroke(armTrace, v.color, Math.max(4, size / 15), active ? .9 : .3);
    glowFill(() => { ctx.beginPath(); ctx.arc(x + reach, y - 4, phase === "hold" ? 15 : 10, 0, Math.PI * 2); }, v.secondary, active ? .95 : .3, 18);
    if (phase === "hold") { const pulse = 24 + Math.sin((battle?.elapsed || 0) * 18) * 3; glowStroke(() => { ctx.beginPath(); ctx.arc(x + reach, y - 4, pulse, 0, Math.PI * 2); }, v.secondary, 3, .8); }
  } else {
    ctx.fillStyle = v.color; ctx.shadowColor = v.secondary; ctx.shadowBlur = size * .45; ctx.beginPath(); ctx.arc(x + 18, y, size * .34, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 18, y, size * .55, 0, Math.PI * 2); ctx.stroke();
  }
  const customSprite = drawCustomSprite(v.spriteUrl, x + size * .45, y, Math.max(72, size * 2.05), active ? .96 : .48, state.animation?.style === "spin" ? Math.sin((battle?.elapsed || 0) * 17) * .22 : 0);
  if (v.emoji && !customSprite) { ctx.font = `${Math.max(18, size * .42)}px serif`; ctx.fillStyle = v.secondary; ctx.fillText(v.emoji, x + size * .12, y + size * .18); }
  ctx.restore();
}
function drawProjectileVisual(p) {
  const v = p.visual || moveVisualDefaults.projectile, pulse = 1 + Math.sin((battle?.elapsed || 0) * 14) * .08, size = v.size * pulse;
  ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = p.trap ? Math.min(1, p.life * 2) : 1;
  if (!p.bomb || p.exploding) drawVfxAsset(v.mainVfx, (battle?.elapsed || 0) * (Number(v.vfxFps) || 18), 0, 0, Math.max(64, p.exploding ? size * 3.2 : size * 2.25), p.trap ? .7 : .9);
  if (!p.trap && !p.pillar && !p.bomb && (p.vx || p.vy)) { const velAngle=Math.atan2(p.vy||0,p.vx||0),spd=Math.hypot(p.vx||0,p.vy||0),trailLen=p.gun?Math.min(size*6,spd*.02+size*2.5):Math.min(size*3,spd*.010+size*1.5); ctx.strokeStyle=v.color;ctx.globalAlpha=p.gun?.38:.22;ctx.lineWidth=p.gun?Math.max(3,size*.32):Math.max(5,size*.55);ctx.beginPath();ctx.moveTo(-Math.cos(velAngle)*trailLen,-Math.sin(velAngle)*trailLen);ctx.lineTo(0,0);ctx.stroke(); if(p.gun){ctx.strokeStyle=v.secondary;ctx.globalAlpha=.65;ctx.lineWidth=Math.max(1,size*.14);ctx.beginPath();ctx.moveTo(-Math.cos(velAngle)*trailLen*.6,-Math.sin(velAngle)*trailLen*.6);ctx.lineTo(0,0);ctx.stroke();}ctx.globalAlpha=1; }
  if (!p.trap && !p.pillar && !p.bomb && p.pattern === "rain") { ctx.strokeStyle = v.secondary; ctx.globalAlpha = .34; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -size * 2.4); ctx.lineTo(0, -size * .45); ctx.stroke(); ctx.globalAlpha = 1; }
  if (!p.trap && !p.pillar && !p.bomb && p.pattern === "orbit") { ctx.strokeStyle = v.secondary; ctx.globalAlpha = .32; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, p.orbitRadius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  if (!p.trap && !p.pillar && !p.bomb && p.pattern === "boomerang" && p.returning) { ctx.strokeStyle = v.color; ctx.globalAlpha = .3; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, size * 1.25, -.8, .8); ctx.stroke(); ctx.globalAlpha = 1; }
  if (p.bomb) {
    const fusePulse = 1 + Math.sin((battle?.elapsed || 0) * (p.armed < .25 ? 28 : 10)) * .1;
    if (p.exploding) {
      const blast = size * (1.2 + (1 - Math.max(0, p.life / .36)) * 1.5); ctx.globalAlpha = Math.max(.05, p.life / .36);
      ctx.strokeStyle = v.secondary; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, blast, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = v.color; ctx.lineWidth = 4;
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * blast * .35, Math.sin(a) * blast * .35); ctx.lineTo(Math.cos(a) * blast * 1.45, Math.sin(a) * blast * 1.45); ctx.stroke(); }
    } else {
      ctx.fillStyle = "#20252b"; ctx.shadowColor = v.color; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, size * .42 * fusePulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, size * .52, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = v.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(size * .18, -size * .32); ctx.quadraticCurveTo(size * .44, -size * .65, size * .58, -size * .42); ctx.stroke();
      ctx.fillStyle = p.armed < .25 ? "#fff3a1" : v.color; ctx.beginPath(); ctx.arc(size * .62, -size * .43, p.armed < .25 ? 6 : 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (p.pillar || v.effect === "pillar") {
    const palette = { fire:["#ff7043","#ffd05d"], ice:["#73e7ff","#eefcff"], stone:["#9aa4ad","#e8edf2"], lightning:["#d8ff3e","#fff7a8"], shadow:["#a57cff","#4c2b83"], energy:[v.color,v.secondary] }[p.element] || [v.color,v.secondary];
    const height = 132 + Math.sin((battle?.elapsed || 0) * 9) * 10; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.shadowColor=palette[0]; ctx.shadowBlur=18; ctx.strokeStyle=palette[0]; ctx.lineWidth=17; ctx.beginPath(); ctx.moveTo(0,12); ctx.lineTo(0,-height); ctx.stroke(); ctx.shadowBlur=0; ctx.strokeStyle=palette[1]; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(0,-height); ctx.stroke(); ctx.beginPath(); ctx.arc(0,12,p.radius*.58,0,Math.PI*2); ctx.stroke();
    for(let i=-1;i<=1;i+=2){ctx.fillStyle=palette[0];ctx.beginPath();ctx.moveTo(i*10,0);ctx.lineTo(i*24,-38);ctx.lineTo(i*7,-27);ctx.closePath();ctx.fill();}
  } else if (p.trap || v.effect === "rune") { ctx.strokeStyle=v.color; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(0,0,p.radius,0,Math.PI*2); ctx.stroke(); ctx.strokeStyle=v.secondary; ctx.beginPath(); ctx.moveTo(-p.radius*.65,0);ctx.lineTo(0,-p.radius*.65);ctx.lineTo(p.radius*.65,0);ctx.lineTo(0,p.radius*.65);ctx.closePath();ctx.stroke(); if(p.status==="freeze"){ctx.strokeStyle="#eefcff";ctx.beginPath();ctx.arc(0,0,p.radius*.72,0,Math.PI*2);ctx.stroke();} }
  else if (p.freeze || v.effect === "freeze") { ctx.fillStyle=v.color;ctx.shadowColor=v.secondary;ctx.shadowBlur=size;ctx.beginPath();ctx.arc(0,0,size*.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=v.secondary;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,size*.78,0,Math.PI*2);ctx.stroke(); for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*7,Math.sin(a)*7);ctx.lineTo(Math.cos(a)*size*.7,Math.sin(a)*size*.7);ctx.stroke();} }
  else if (v.effect === "beam") { ctx.strokeStyle=v.color; ctx.lineWidth=Math.max(8,size*.38); ctx.globalAlpha=.3; ctx.beginPath();ctx.moveTo(-size*2,0);ctx.lineTo(size*2,0);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle=v.secondary;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-size*1.8,0);ctx.lineTo(size*1.8,0);ctx.stroke(); }
  else { ctx.fillStyle=v.color;ctx.shadowColor=v.secondary;ctx.shadowBlur=size;ctx.beginPath();ctx.arc(0,0,size*.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=v.secondary;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,size*.78,0,Math.PI*2);ctx.stroke(); }
  const customSprite = drawCustomSprite(v.spriteUrl, 0, 0, Math.max(64, p.exploding ? size * 3.2 : size * 2.25), p.exploding ? .68 : .92, p.vx ? Math.atan2(p.vy || 0, p.vx) : 0);
  if(v.emoji && !p.exploding && !customSprite){ctx.font=`${Math.max(17,size*.8)}px serif`;ctx.fillStyle=v.secondary;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(v.emoji,0,0);}
  ctx.restore();
}
function drawImpactFx(f) {
  for (const effect of f.effects || []) {
    const progress = effect.t / .38;
    ctx.save(); ctx.translate(effect.x, effect.y - 82); ctx.globalAlpha = progress;
    if (effect.vfxId) drawVfxAsset(effect.vfxId, (1 - progress) * 30, 0, 0, Math.max(58, effect.size * 2.05), 1);
    if (effect.kind === "grapple-lock") {
      ctx.setLineDash([9, 6]); glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * (1.1 - progress * .2), 0, Math.PI * 2); }, effect.color, 5, progress); ctx.setLineDash([]);
    } else if (effect.kind === "freeze") {
      glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * (1.3 - progress * .2), 0, Math.PI * 2); }, effect.color, 5, progress);
    } else if (effect.kind === "tech") {
      const pulse = 1 + Math.sin((battle?.elapsed || 0) * 32) * .1;
      ctx.setLineDash([7, 5]);
      glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * (1.2 - progress * .35) * pulse, 0, Math.PI * 2); }, "#bdf6ff", 4, Math.min(1, progress * 1.6));
      ctx.setLineDash([]);
      ctx.fillStyle = "#f4fbff"; ctx.font = "900 15px 'Barlow Condensed',sans-serif"; ctx.textAlign = "center"; ctx.fillText("TECH", 0, -effect.size * .95);
    } else if (effect.kind === "bounce") {
      const spread = effect.size * (1.35 - progress * .45);
      glowStroke(() => { ctx.beginPath(); ctx.ellipse(0, effect.size * .45, spread, effect.size * .28, 0, 0, Math.PI * 2); }, effect.color, 5, Math.min(1, progress * 1.8));
      for (let i = -2; i <= 2; i++) {
        glowStroke(() => { ctx.beginPath(); ctx.moveTo(i * 14, effect.size * .35); ctx.lineTo(i * 26, -effect.size * .45); }, "#d8ff3e", 3, progress * .9);
      }
    } else if (effect.kind === "recovery") {
      ctx.setLineDash([8, 6]); glowStroke(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * (1.05 - progress * .25), 0, Math.PI * 2); }, effect.color, 5, Math.min(1, progress * 1.8)); ctx.setLineDash([]);
    } else if (effect.kind === "throw-slam") {
      glowFill(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * .38 * (1.35 - progress * .4), 0, Math.PI * 2); }, effect.color, progress, effect.size * 1.1);
      glowStroke(() => { ctx.beginPath(); ctx.ellipse(0, effect.size * .28, effect.size * (1.3 - progress * .3), effect.size * .32, 0, 0, Math.PI * 2); }, effect.color, 5, progress * .85);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; glowStroke(() => { ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.lineTo(Math.cos(a) * effect.size * (1.2 - progress * .4), Math.sin(a) * effect.size * (1.2 - progress * .4)); }, "#ffffff", 3, progress * .8); }
    } else if (effect.kind === "counter") {
      // A sharper, hotter burst than an ordinary hit - it should read as a punish.
      glowFill(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * .3 * (1.3 - progress * .5), 0, Math.PI * 2); }, effect.color, progress, effect.size * .9);
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; glowStroke(() => { ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.lineTo(Math.cos(a) * effect.size * (1.3 - progress * .4), Math.sin(a) * effect.size * (1.3 - progress * .4)); }, "#ffe66d", 3, progress); }
    } else if (!effect.vfxId) {
      // A real hit spark: a hot core plus rays that shoot outward and fade.
      glowFill(() => { ctx.beginPath(); ctx.arc(0, 0, effect.size * .3 * (1.4 - progress * .3), 0, Math.PI * 2); }, effect.color, progress, effect.size * .8);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; glowStroke(() => { ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * effect.size * (1.1 - progress * .35), Math.sin(a) * effect.size * (1.1 - progress * .35)); }, effect.color, 4, progress); }
    }
    ctx.restore();
  }
}
function drawFreezeFx(f) { if (f.frozen <= 0) return; const pulse = 1 + Math.sin((battle?.elapsed || 0) * 12) * .05; ctx.save(); ctx.translate(f.x, f.y - 92); ctx.globalAlpha = .78; ctx.strokeStyle = "#bdf6ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, Math.PI * 2); ctx.stroke(); for (let i=0;i<8;i++) { const a=i*Math.PI/4; const r=48 + (i%2)*15; ctx.beginPath(); ctx.moveTo(Math.cos(a)*20,Math.sin(a)*20); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke(); } ctx.fillStyle="#eefcff"; ctx.font="25px serif"; ctx.textAlign="center"; ctx.fillText("❄",0,-70); ctx.restore(); }
function drawFighter(f) { const c=f.fighter.config||{}, crouching=f.crouch>0 || f.attackState?.variant==="crouch", attacking=f.pose.includes("attack") || f.pose==="cast" || f.pose.includes("grapple"), blocking=f.blocking || f.blockFlash>0, running=f.pose==="run"; drawImpactFx(f); drawFreezeFx(f); drawGrappleLink(f); const at=animationTransform(f,f.attackState), portrait=portraitSprite(f.fighter);
  // Turn squash: when the fighter flips direction, briefly squash to zero and
  // expand in the new direction — a 2-D projection of a 3-D pivot.
  const tp = Math.min(1, (f.turnTimer || 0) / 0.11);
  const facingScale = tp > 0.01 ? f.dir * Math.cos(tp * Math.PI) : f.dir;
  ctx.save();ctx.translate(f.x + at.offsetX, f.y + at.offsetY);ctx.scale(facingScale,1);ctx.scale(1.28,1.28);ctx.rotate(at.rotation);ctx.transform(1,at.skewY,at.skewX,1,0,0);ctx.scale(at.scaleX,at.scaleY);ctx.scale(1,crouching ? .76 : 1); if(portrait || spriteSheet){ const crop=f.fighter.example ? SPRITE_CROPS.kung : SPRITE_CROPS.cyber; ctx.imageSmoothingEnabled=true; ctx.globalAlpha=f.hurt > 0 ? .7 + Math.sin((battle?.elapsed||0)*70)*.18 : f.invuln > 0 ? .68 + Math.sin((battle?.elapsed||0)*46)*.16 : 1;
  // The two source crops are drawn facing opposite ways. Everything else in
  // this transform already works in "forward is +x" space, so only the image
  // itself is mirrored back to match - otherwise the forged sprite fights
  // with its back to its opponent.
  ctx.save(); if (portrait) { const ratio=portrait.naturalWidth/Math.max(1,portrait.naturalHeight), height=190, width=Math.min(190,Math.max(92,height*ratio)); ctx.drawImage(portrait,-width/2,-height,width,height); } else { if(crop.facing<0) ctx.scale(-1,1); ctx.drawImage(spriteSheet,crop.x,crop.y,crop.w,crop.h,-74,-190,148,190); } ctx.restore(); ctx.globalAlpha=1; if(attacking){ctx.font="26px serif";ctx.fillText((c.emojis||["👊"])[f.attackState?.variant==="air"?2:0]||"👊",45,-95);} drawMoveVisual(f,f.attackState); drawCombatStateFx(f,blocking,running); ctx.restore(); return; } if(f.hurt>0){ctx.globalAlpha=.32;ctx.fillStyle="#fff";ctx.fillRect(-50,-155,100,145);ctx.globalAlpha=1;} for(const t of f.trail){ctx.globalAlpha=t.t*2;ctx.fillStyle=c.accent||"#ff5b52";ctx.beginPath();ctx.arc(t.x-f.x,t.y-f.y-75,18,0,7);ctx.fill();}ctx.globalAlpha=f.invuln > 0 ? .68 + Math.sin((battle?.elapsed||0)*46)*.16 : 1;
  ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.ellipse(0,4,45,10,0,0,7);ctx.fill();ctx.fillStyle=c.color||"#f2c447";ctx.fillRect(-23,-105,46,73);ctx.fillStyle=c.accent||"#bd293a";ctx.fillRect(-29,-92,58,16);ctx.fillStyle="#f6c59c";ctx.beginPath();ctx.arc(0,-126,27,0,7);ctx.fill();ctx.fillStyle="#18212d";ctx.fillRect(-23,-144,46,12);ctx.fillStyle="#111";ctx.fillRect(7,-128,4,4);
  const animation=f.attackState?.animation||{}, gesture=String(animation.gesture||"").toLowerCase(), phase=f.attackState?.grapplePhase, limbColor=c.color||"#f2c447";ctx.strokeStyle=limbColor;ctx.lineWidth=18;ctx.lineCap="round";
  if(animation.style==="kick" || animation.contact==="foot" || /roundhouse|sweep|knee/.test(gesture)) { ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(18,-66);ctx.stroke();ctx.strokeStyle="#213248";ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(14,-34);ctx.lineTo(attacking && /dive/.test(gesture)?72:attacking?(gesture.includes("sweep")?68:58):25,attacking && /dive/.test(gesture)?18:attacking?(gesture.includes("sweep")?-18:-76):0);ctx.stroke();ctx.moveTo(-14,-34);ctx.lineTo(-25,0);ctx.stroke(); }
  else if(/overhead|slam/.test(gesture)) { ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(-34,-132);ctx.lineTo(attacking?42:-5,attacking?-64:-112);ctx.stroke();ctx.beginPath();ctx.moveTo(17,-92);ctx.lineTo(34,-132);ctx.lineTo(attacking?48:7,attacking?-60:-112);ctx.stroke(); }
  else if(/hook|elbow/.test(gesture)) { const hook=attacking?48:24;ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(10,-108);ctx.lineTo(hook,-82);ctx.stroke();ctx.beginPath();ctx.moveTo(17,-92);ctx.lineTo(30,-62);ctx.stroke(); }
  else if(animation.style==="grapple" || f.grappledBy) { const grabX=f.grappledBy?-42:phase==="finish"?34:attacking?62:26, grabY=phase==="finish"?-112:-98;ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(grabX,grabY);ctx.stroke();ctx.beginPath();ctx.moveTo(17,-92);ctx.lineTo(grabX-(f.grappledBy?10:-8),grabY+12);ctx.stroke(); }
  else if(animation.style==="spin" || /spin|whirl/.test(gesture)) { ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(attacking?48:23,-78);ctx.stroke();ctx.beginPath();ctx.moveTo(17,-92);ctx.lineTo(attacking?-48:28,-58);ctx.stroke();ctx.strokeStyle="#213248";ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(-14,-34);ctx.lineTo(-40,attacking?-72:0);ctx.moveTo(14,-34);ctx.lineTo(40,attacking?-72:0);ctx.stroke(); }
  else { const punch=attacking?(/thrust|palm|cross/.test(gesture)?68:54):23, handY=crouching?-63:-78;ctx.beginPath();ctx.moveTo(-18,-92);ctx.lineTo(punch,handY);ctx.stroke();ctx.beginPath();ctx.moveTo(17,-92);ctx.lineTo(28,-58);ctx.stroke();ctx.strokeStyle="#213248";ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(-14,-34);ctx.lineTo(-25,0);ctx.moveTo(14,-34);ctx.lineTo(25,0);ctx.stroke(); }
  ctx.font="25px serif";ctx.fillText((c.emojis||["👊"])[f.attackState?.variant==="air"?2:0]||"👊",(animation.style==="kick"?40:animation.style==="grapple"?36:attacking?42:11),crouching?-49:-63);drawMoveVisual(f,f.attackState);drawCombatStateFx(f,blocking,running);ctx.restore(); }
async function loadSprites() {
  const image = new Image(); image.src = "assets/fighter-sprites-source.png";
  try { await image.decode(); } catch { return; }
  const off = document.createElement("canvas"); off.width=image.naturalWidth; off.height=image.naturalHeight;
  const octx = off.getContext("2d"); octx.drawImage(image,0,0); const pixels=octx.getImageData(0,0,off.width,off.height); const d=pixels.data;
  for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; const green=g>145 && g>r*1.35 && g>b*1.18; if(green){ d[i+3]=0; } else if(g>r*1.15 && g>b*1.08){ d[i+3]=Math.max(0,Math.min(255,255-(g-Math.max(r,b))*2)); } }
  octx.putImageData(pixels,0,0); spriteSheet=off;
  // Portraits are normalised to face right too, so a roster of mixed sprites
  // does not have half its cards looking off the edge of the screen.
  const cropToData = ({ x, y, w, h, facing }) => {
    const crop=document.createElement("canvas"); crop.width=w; crop.height=h;
    const cctx=crop.getContext("2d");
    if (facing < 0) { cctx.translate(w, 0); cctx.scale(-1, 1); }
    cctx.drawImage(off,x,y,w,h,0,0,w,h); return crop.toDataURL("image/png");
  };
  spriteThumbs.kung=cropToData(SPRITE_CROPS.kung); spriteThumbs.cyber=cropToData(SPRITE_CROPS.cyber); renderRoster();
}
function loop(t){const dt=Math.min(.05,(t-lastFrame)/1000||0);lastFrame=t;fightTick(dt);requestAnimationFrame(loop);} requestAnimationFrame(loop);requestAnimationFrame(draw); loadRoster();loadSprites();loadStages();
