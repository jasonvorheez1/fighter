import { getVfx, framePath, VFX_DEFAULTS, VFX_IDS } from "./vfx-data.js";
import { parseAiJson, sanitizeFighter, buildFighterModule, extractEmojis } from "./fighter-code.js";

const $ = (s) => document.querySelector(s);
const arena = $("#arena"), ctx = arena.getContext("2d");

const kungFuMan = {
  id: "kung-fu-man", name: "Kung Fu Man", author: "Elecbyte", prompt: "The simple baseline fighter.",
  config: { style: "classic balanced martial artist", emojis: ["👊", "🦵", "💢"], buttons: 3, combo: 1, specials: [{ name: "Palm Strike", type: "melee", variant: "light", visual: { effect: "arc", mainVfx: "main_slash_color1", hitVfx: "hit_round_spark", vfxFps: 18, color: "#f2c447", secondary: "#ffffff", size: 55, emoji: "✦" }, behavior: { motion: "none", radius: 0 } }], color: "#f2c447", accent: "#bd293a", banter: ["You have entered the dojo.", "A simple fist is enough."] },
  script: `// Kung Fu Man — baseline fighter\nexport const fighter = {\n  name: "Kung Fu Man", buttons: 3, comboAptitude: 1,\n  specials: [{ name: "Palm Strike", type: "melee", visual: { effect: "arc", color: "#f2c447", secondary: "#ffffff", size: 55, emoji: "✦" }, behavior: { motion: "none" } }]\n};`, portrait_url: null, example: true
};

let fighters = [kungFuMan], selected = [kungFuMan.id, kungFuMan.id], activeSlot = 0, uploadedPortrait = null, editingId = null;
let spriteSheet = null, spriteThumbs = {};
let battle = null, lastFrame = 0, comboReadoutTimer = 0, moveCalloutTimer = 0;
const FIGHT_START_LEFT = 480, FIGHT_START_RIGHT = 800;
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function fighterById(id) { return fighters.find(f => f.id === id) || kungFuMan; }
function parseConfig(value) { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return {}; } }
function normalizeFighter(row) { return { ...row, config: parseConfig(row.config) }; }
function avatar(f) { const em = f.config?.emojis?.[0] || "👊"; const sprite = f.example ? spriteThumbs.kung : null; return f.portrait_url ? `<img src="${escapeHtml(f.portrait_url)}" alt="" />` : sprite ? `<img src="${sprite}" alt="" />` : em; }

async function loadRoster() {
  try {
    const res = await fetch("/api/fighters");
    const data = await res.json();
    fighters = [kungFuMan, ...(data.fighters || []).map(normalizeFighter)];
  } catch { fighters = [kungFuMan]; }
  renderRoster();
}

function renderRoster() {
  if (!fighters.some(f => f.id === selected[0])) selected[0] = fighters[0].id;
  if (!fighters.some(f => f.id === selected[1])) selected[1] = fighters[0].id;
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
    $("#left-hp").style.width = "100%";
    $("#right-hp").style.width = "100%";
  }
  $("#roster").innerHTML = fighters.map(f => {
    const p1 = selected[0] === f.id, cpu = selected[1] === f.id;
    const label = p1 && cpu ? "P1 / CPU" : p1 ? "P1 SELECTED" : cpu ? "CPU SELECTED" : "SELECT";
    const editAction = f.example ? "" : `<a class="edit-fighter" href="editor.html?id=${encodeURIComponent(f.id)}">EDIT <span>↗</span></a>`;
    return `<article class="fighter-card ${p1 || cpu ? "selected" : ""} ${activeSlot === 0 && p1 || activeSlot === 1 && cpu ? "focused" : ""}"><button class="fighter-pick" data-fighter="${escapeHtml(f.id)}"><span class="portrait">${avatar(f)}</span><span class="fighter-info"><strong>${escapeHtml(f.name)}</strong><span>BY ${escapeHtml(f.author)} · ${f.config?.buttons || 3} BTN</span></span><em>${label}</em></button>${editAction}</article>`;
  }).join("");
  document.querySelectorAll("[data-fighter]").forEach((node) => node.onclick = () => {
    selected[activeSlot] = node.dataset.fighter;
    activeSlot = activeSlot === 0 ? 1 : 0;
    renderRoster();
  });
}

document.querySelectorAll(".select-slot").forEach(slot => slot.onclick = () => {
  activeSlot = Number(slot.dataset.slot);
  renderRoster();
});

function moveFrameDefaults(type = "melee") { return type === "projectile" ? { startup:18, active:3, endlag:30, hitstun:10 } : type === "combo" ? { startup:5, active:3, endlag:24, hitstun:18 } : type === "trap" ? { startup:10, active:3, endlag:22, hitstun:16 } : type === "grapple" ? { startup:9, active:12, endlag:28, hitstun:24 } : type === "freeze" ? { startup:14, active:3, endlag:28, hitstun:16 } : type === "teleport" ? { startup:5, active:3, endlag:24, hitstun:18 } : type === "pillar" ? { startup:16, active:4, endlag:30, hitstun:20 } : type === "bomb" ? { startup:14, active:3, endlag:32, hitstun:18 } : { startup:7, active:2, endlag:18, hitstun:14 }; }
const moveVisualDefaults = {
  melee: { effect: "arc", color: "#f7d35b", secondary: "#ffffff", size: 58, emoji: "✦" },
  projectile: { effect: "orb", color: "#56d9ff", secondary: "#d8ff3e", size: 22, emoji: "✦" },
  combo: { effect: "slashes", color: "#ff6c61", secondary: "#ffd05d", size: 62, emoji: "✧" },
  trap: { effect: "rune", color: "#bd8cff", secondary: "#56d9ff", size: 72, emoji: "◇" },
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
  bomb: { style: "cast", windup: "crouch", contact: "energy", finish: "slam", intensity: 1.1 }
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
const visualScriptVfx = ["main_slash_color1", "main_slash2_color1", "main_slash3_color2", "main_slash3_color3", "main_musicburst", "main_firework"];
function visualScriptFallback(rawMove = {}, type = "melee") {
  const key = `${String(rawMove.name || "unnamed")}::${type}`;
  let seed = 0; for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const variant = seed % 4, spin = ((seed % 17) - 8) * .12, rays = 4 + (seed % 5), asset = visualScriptVfx[seed % visualScriptVfx.length];
  if (variant === 0) return `const pulse = .75 + Math.sin(t * ${12 + seed % 9}) * .18;
api.glow(color, size * .32); api.asset("${asset}", size * .32 * pulse, 0, size * 2.1, active ? .9 : .25, ${spin} + p * .5);
for (let i = 0; i < ${rays}; i++) { const a = i * Math.PI * 2 / ${rays} + p * ${2 + seed % 4}; api.line(0, 0, Math.cos(a) * size * .88, Math.sin(a) * size * .88, i % 2 ? secondary : color, 3 + i % 3, active ? .82 : .22); }`;
  if (variant === 1) return `const pulse = .5 + p * .9;
api.ring(0, 0, size * pulse, color, 4, active ? .85 : .2); api.ring(0, 0, size * (.35 + pulse * .42), secondary, 2, active ? .9 : .18);
for (let i = 0; i < ${rays}; i++) { const a = i * Math.PI * 2 / ${rays} - t * ${2 + seed % 3}; api.spark(Math.cos(a) * size * .6, Math.sin(a) * size * .6, size * .22, secondary, 3 + i % 3, a); }`;
  if (variant === 2) return `const sweep = p * Math.PI * ${1.2 + (seed % 7) / 5} - .7;
api.arc(0, 0, size * (.5 + p * .45), sweep, sweep + ${1.3 + (seed % 5) / 6}, color, 7, active ? .9 : .25); api.arc(0, 0, size * .74, sweep + .35, sweep + 1.05, secondary, 2, active ? .85 : .2);
api.asset("${asset}", Math.cos(sweep) * size * .55, Math.sin(sweep) * size * .55, size * 1.5, active ? .75 : .18, sweep);`;
  return `const pulse = 1 + Math.sin(t * ${10 + seed % 8}) * .12;
api.circle(0, 0, size * .28 * pulse, color, secondary, 3, active ? .9 : .2); api.glow(secondary, size * .55);
for (let i = 0; i < ${rays}; i++) { const a = i * Math.PI * 2 / ${rays} + p * ${3 + seed % 5}; const inner = size * .25, outer = size * (.75 + (i % 2) * .28); api.line(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * outer, Math.sin(a) * outer, i % 2 ? color : secondary, 4, active ? .8 : .18); }`;
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
    line: (x1, y1, x2, y2, stroke = v.color, width = 4, opacity = 1) => { ctx.globalAlpha = alpha(opacity); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, Number(width) || 1); ctx.beginPath(); ctx.moveTo(baseX + x1, baseY + y1); ctx.lineTo(baseX + x2, baseY + y2); ctx.stroke(); },
    arc: (cx, cy, radius, start, end, stroke = v.color, width = 4, opacity = 1) => { ctx.globalAlpha = alpha(opacity); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, Number(width) || 1); ctx.beginPath(); ctx.arc(baseX + cx, baseY + cy, Math.max(0, radius), start, end); ctx.stroke(); },
    ring: (cx, cy, radius, stroke = v.color, width = 4, opacity = 1) => { api.arc(cx, cy, radius, 0, Math.PI * 2, stroke, width, opacity); },
    circle: (cx, cy, radius, fill = v.color, stroke = "", width = 0, opacity = 1) => { ctx.globalAlpha = alpha(opacity); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(baseX + cx, baseY + cy, Math.max(0, radius), 0, Math.PI * 2); ctx.fill(); if (stroke && width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); } },
    spark: (cx, cy, radius, stroke = v.secondary, count = 6, rotation = 0) => { for (let i = 0; i < Math.max(2, Math.min(18, count)); i++) { const a = rotation + i * Math.PI * 2 / count; api.line(cx + Math.cos(a) * radius * .25, cy + Math.sin(a) * radius * .25, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, stroke, 2 + radius * .035, active ? .85 : .18); } },
    glow: (stroke = v.color, blur = size * .4) => { ctx.shadowColor = stroke; ctx.shadowBlur = Math.max(0, Math.min(80, Number(blur) || 0)); },
    asset: (id, ox = 0, oy = 0, drawSize = size * 2, opacity = 1, rotation = 0) => { if (VFX_IDS.has(id)) drawVfxAsset(id, state.t * (Number(v.vfxFps) || 18), baseX + ox, baseY + oy, Math.max(20, Math.min(280, Number(drawSize) || size)), alpha(opacity), rotation); }
  };
  const fn = compileVisualScript(script); if (!fn) return false;
  try { ctx.save(); ctx.shadowBlur = 0; fn(api, state.t, progress, active, size, v.color, v.secondary, move, Math); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore(); return true; }
  catch { ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore(); return false; }
}
function normalizeMove(move, fighterConfig = {}) {
  const raw = typeof move === "string" ? { name: move, type: "melee" } : (move || {});
  const type = ["melee", "projectile", "combo", "trap", "grapple", "freeze", "teleport", "pillar", "bomb"].includes(raw.type) ? raw.type : "melee";
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
  const vfxDefault = VFX_DEFAULTS[type] || VFX_DEFAULTS.melee;
  visual.mainVfx = VFX_IDS.has(visual.mainVfx) ? visual.mainVfx : vfxDefault.mainVfx;
  visual.hitVfx = VFX_IDS.has(visual.hitVfx) ? visual.hitVfx : vfxDefault.hitVfx;
  visual.vfxFps = clampNumber(visual.vfxFps, 6, 30, 18);
  visual.script = sanitizeVisualScript(visual.script, raw, type);
  const allowedMotion = ["none", "projectile", "trap", "dash", "dash-attack", "dive-kick", "rapid-jab", "charge", "bomb", "pull", "grapple", "teleport", "pillar"];
  behavior.motion = String(behavior.motion || moveBehaviorDefaults[type].motion).toLowerCase();
  if (!allowedMotion.includes(behavior.motion)) behavior.motion = moveBehaviorDefaults[type].motion;
  behavior.speed = clampNumber(behavior.speed, 0, 700, moveBehaviorDefaults[type].speed);
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
  behavior.homing = clampNumber(behavior.homing, 0, 1, 0);
  behavior.spread = clampNumber(behavior.spread, -75, 75, behavior.pattern === "fan" ? 22 : 0);
  behavior.bounces = Math.round(clampNumber(behavior.bounces, 0, 3, 0));
  behavior.orbitRadius = clampNumber(behavior.orbitRadius, 24, 220, 84);
  behavior.orbitSpeed = clampNumber(behavior.orbitSpeed, -12, 12, 3.5);
  behavior.returnDelay = clampNumber(behavior.returnDelay, .15, 1.5, .62);
  const moveName = String(raw.name || "").toLowerCase();
  const rapidJab = behavior.motion === "rapid-jab" || Number(behavior.rapidHits) > 1 || /rapid|ora|barrage|flurry|rush/.test(moveName) && /jab|punch|fist|barrage|rush/.test(moveName);
  const diveKick = behavior.motion === "dive-kick" || /dive.?kick|meteor kick|stomp kick/.test(moveName);
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
  return { ...raw, type, name: String(raw.name || "Unnamed Move").slice(0, 28), role: String(raw.role || "auto"), launcher: raw.launcher === true || raw.role === "launcher", air: raw.air === true || diveKick, juggle: Math.round(clampNumber(raw.juggle, 1, 15, raw.type === "combo" ? 3 : 4)), visual, behavior, animation };
}
const rebuiltKungFuConfig = {
  name: "Kung Fu Man",
  author: "Fighter Forge",
  style: "classic pressure fighter / disciplined rushdown",
  personality: "calm, focused, and impossible to keep down",
  backstory: "A traveling martial artist who turns every exchange into a lesson and every lesson into another hit.",
  buttons: 4,
  combo: 4,
  emojis: ["👊", "🦵", "🐉", "💥"],
  color: "#f2c447",
  accent: "#e65342",
  banter: ["Hands up. Breathe. Begin.", "Your opening is already gone."],
  specials: [
    { name:"Iron Palm", type:"melee", role:"light-punch", variant:"light", startup:5, active:3, endlag:10, hitstun:15, reach:138, visual:{ effect:"arc", mainVfx:"main_slash2_color1", hitVfx:"hit_round_spark", vfxFps:20, color:"#f2c447", secondary:"#fff8d2", size:56, emoji:"✦" }, behavior:{ motion:"none", radius:0, knockback:{ horizontal:150, vertical:0, hitstop:.035, carry:true } }, animation:{ style:"strike", windup:"none", contact:"fist", finish:"follow-through", intensity:.78, transform:{ rotateY:-18, scaleX:1.08 } } },
    { name:"Ora Barrage", type:"combo", role:"light-punch", variant:"light", startup:4, active:15, endlag:8, hitstun:28, reach:174, visual:{ effect:"slashes", mainVfx:"main_slash3_color2", hitVfx:"hit_middle_directional", vfxFps:24, color:"#ff6c61", secondary:"#fff0b4", size:68, emoji:"ORA" }, behavior:{ motion:"rapid-jab", rapidHits:5, rapidInterval:.075, radius:0, knockback:{ horizontal:70, vertical:0, hitstop:.025, carry:true } }, animation:{ style:"strike", windup:"none", contact:"fist", finish:"follow-through", gesture:"ora barrage", intensity:1.08, transform:{ scaleX:1.12, skewY:.12 } } },
    { name:"Rising Palm", type:"melee", role:"launcher", variant:"heavy", launcher:true, juggle:8, startup:8, active:4, endlag:12, hitstun:32, reach:148, visual:{ effect:"burst", mainVfx:"main_slash3_color2", hitVfx:"hit_bottom_directional", vfxFps:20, color:"#ff7043", secondary:"#ffe48a", size:78, emoji:"▲" }, behavior:{ motion:"dash", speed:90, radius:0, knockback:{ horizontal:100, vertical:680, angle:62, hitstop:.1, carry:true } }, animation:{ style:"strike", windup:"crouch", contact:"fist", finish:"follow-through", intensity:1.08, transform:{ rotateX:-28, rotateZ:18, offsetY:-10, scaleY:1.08 } } },
    { name:"Meteor Dive Kick", type:"combo", role:"air-heavy-kick", variant:"heavy", air:true, juggle:3, startup:4, active:8, endlag:14, hitstun:24, reach:178, visual:{ effect:"slashes", mainVfx:"main_slash3_color3", hitVfx:"hit_bottom_directional", vfxFps:22, color:"#56d9ff", secondary:"#eefcff", size:76, emoji:"↘" }, behavior:{ motion:"dive-kick", speed:360, radius:0, knockback:{ horizontal:270, vertical:115, angle:18, hitstop:.075, carry:false, groundBounce:true } }, animation:{ style:"kick", windup:"hop", contact:"foot", finish:"follow-through", gesture:"dive kick", intensity:1.18, transform:{ rotateX:22, rotateZ:-28, offsetX:18, offsetY:14, scaleX:1.14, scaleY:1.08 } } },
    { name:"Dragon Breath", type:"projectile", role:"special", variant:"heavy", startup:16, active:4, endlag:26, hitstun:16, reach:520, visual:{ effect:"beam", mainVfx:"main_vfx_repeatable", hitVfx:"hit_firework", vfxFps:18, color:"#ff7043", secondary:"#ffe48a", size:30, emoji:"🐉" }, behavior:{ motion:"projectile", speed:470, radius:28, shots:1, knockback:{ horizontal:300, vertical:20, hitstop:.05, carry:false } }, animation:{ style:"cast", windup:"coil", contact:"energy", finish:"recoil", intensity:1.1, transform:{ rotateX:12, rotateY:-20, scaleY:1.12, orbit:.15 } } }
  ]
};
kungFuMan.config = sanitizeFighter(rebuiltKungFuConfig, normalizeMove, rebuiltKungFuConfig);
kungFuMan.script = buildFighterModule(kungFuMan.config, normalizeMove);
if ($("#forge-button")) {
function safeEmojiArray(value) {
  return extractEmojis(value, ["👊", "⚡", "💥"]);
}
function buildScript(data) {
  return buildFighterModule(data, normalizeMove);
}
function fallbackForge(prompt, settings = {}) {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const name = settings.name || (words.slice(0, 2).map(x => x.replace(/[^a-z0-9]/gi, "")).join(" ") || "Neon Fighter").replace(/\b\w/g, x => x.toUpperCase()).slice(0,24);
  const emojis = safeEmojiArray(prompt); const buttons = Number(settings.buttons || 4), combo = Number(settings.combo || 3);
  const specials = settings.specials?.length ? settings.specials : [
    { name: "Pulse Strike", type: "melee", variant: "medium", visual: { effect: "arc", color: "#f7d35b", secondary: "#ffffff", size: 62, emoji: "✦" }, behavior: { motion: "none", radius: 0 }, animation: { style: "strike", windup: "coil", contact: "fist", finish: "recoil", intensity: .9 } },
    { name: "Clinch Driver", type: "grapple", variant: "heavy", startup: 9, active: 12, endlag: 28, hitstun: 24, reach: 142, visual: { effect: "grapple", color: "#ff9f43", secondary: "#fff2c2", size: 68, emoji: "⛓" }, behavior: { motion: "grapple", speed: 300, hold: .2, finisher: "slam" }, animation: { style: "grapple", windup: "reach", contact: "grab", finish: "slam", intensity: 1.15 } },
    { name: "Frost Lock", type: "freeze", variant: "medium", visual: { effect: "freeze", element: "ice", color: "#73e7ff", secondary: "#eefcff", size: 30, emoji: "❄" }, behavior: { motion: "projectile", speed: 360, radius: 28, freeze: .95, status: "freeze", element: "ice" }, animation: { style: "cast", windup: "coil", contact: "energy", finish: "recoil", intensity: .9 } },
    { name: "Blink Break", type: "teleport", variant: "heavy", visual: { effect: "teleport", element: "shadow", color: "#d28cff", secondary: "#56d9ff", size: 74, emoji: "◇" }, behavior: { motion: "teleport", offset: 92 }, animation: { style: "dash", windup: "hop", contact: "body", finish: "snap", intensity: 1.1 } },
    { name: "Element Pillar", type: "pillar", variant: "heavy", visual: { effect: "pillar", element: "fire", color: "#ff7043", secondary: "#ffd05d", size: 86, emoji: "▲" }, behavior: { motion: "pillar", radius: 76, lifetime: 1.45, element: "fire" }, animation: { style: "cast", windup: "crouch", contact: "energy", finish: "slam", intensity: 1 } },
    { name: "Rune Snare", type: "trap", variant: "medium", visual: { effect: "rune", element: "ice", color: "#bd8cff", secondary: "#56d9ff", size: 72, emoji: "◇" }, behavior: { motion: "trap", radius: 68, lifetime: 1.7, status: "freeze", freeze: .65, element: "ice" }, animation: { style: "cast", windup: "crouch", contact: "energy", finish: "recoil", intensity: .8 } },
    { name: "Flash Arc", type: "projectile", variant: "light", visual: { effect: "orb", color: "#56d9ff", secondary: "#d8ff3e", size: 23, emoji: "⚡" }, behavior: { motion: "projectile", speed: 440, radius: 23, shots: 1 }, animation: { style: "cast", windup: "coil", contact: "energy", finish: "recoil", intensity: .9 } }
  ];
  const colors = { color: "#53d8ff", accent: "#ff5b52" };
  return { name, author: settings.author || "Unknown Author", style: settings.style || prompt.slice(0, 60), personality: settings.personality || "determined", backstory: settings.backstory || "A new challenger steps into the arena.", emojis, buttons, combo, specials: specials.map(move => normalizeMove(move, colors)), color: colors.color, accent: colors.accent, banter: ["The forge has chosen its weapon.", "Let the code speak through combat."] };
}

async function aiForge(prompt, settings = {}) {
  const seed = fallbackForge(prompt, settings);
  if (!window.websim?.chat?.completions?.create) return seed;
  const specialHint = settings.specials?.map(m => `${m.name} (${m.type}, ${m.startup || "?"}/${m.active || "?"}/${m.endlag || "?"}f, ${m.hitstun || "?"}f stun, ${m.reach || "auto"}px)`).join(", ") || "invent up to 5 suitable specials";
  const system = `You design original, non-infringing arcade fighting game characters. Return only valid JSON. Schema: {"name":"max 24 chars","author":"max 24 chars","style":"max 60 chars","personality":"max 80 chars","backstory":"max 240 chars","emojis":["emoji"],"buttons":3-6,"combo":1-5,"specials":[{"name":"max 28 chars","type":"melee|projectile|combo|trap|grapple|freeze|teleport|pillar|bomb","variant":"light|medium|heavy|all","launcher":true,"startup":1-60,"active":1-20,"endlag":1-90,"hitstun":1-60,"reach":70-520,"visual":{"effect":"arc|orb|slashes|rune|beam|burst|grapple|freeze|teleport|pillar","element":"fire|ice|stone|lightning|shadow|energy","color":"#RRGGBB","secondary":"#RRGGBB","size":12-130,"emoji":"one symbol","mainVfx":"main asset ID","hitVfx":"hit spark asset ID","vfxFps":6-30,"script":"JavaScript drawing program body"},"behavior":{"motion":"none|projectile|trap|dash|dash-attack|dive-kick|rapid-jab|charge|bomb|pull|grapple|teleport|pillar","pattern":"straight|arc|fan|boomerang|orbit|rain","rapidHits":2-8,"rapidInterval":0.045-0.18,"status":"none|freeze","element":"fire|ice|stone|lightning|shadow|energy","speed":0-700,"gravity":-1600-1600,"homing":0-1,"spread":-75-75,"bounces":0-3,"orbitRadius":24-220,"orbitSpeed":-12-12,"returnDelay":0.15-1.5,"radius":0-140,"shots":1-3,"lifetime":0.35-3,"hold":0.08-1.2,"freeze":0.25-2.5,"offset":40-180,"charge":0.12-2.5,"chargePower":0.7-2.5,"dashDistance":30-300,"fuse":0.18-2.5,"finisher":"slam|throw"},"animation":{"style":"strike|kick|spin|grapple|slam|dash|cast","gesture":"jab|cross|hook|elbow|palm|knee|roundhouse|sweep|overhead|thrust|slam|spin|burst|cast|dive kick|ora barrage|custom","windup":"none|coil|crouch|reach|hop|spin","contact":"fist|foot|grab|hook|body|energy|slash","finish":"recoil|follow-through|throw|slam|spin|snap|hold","intensity":0.45-1.6,"transform":"optional freeform rotation/scale/skew/offset object"}}],"color":"#RRGGBB","accent":"#RRGGBB","banter":["short pre-fight line","short reply"]}. Use the uploaded Fighter Forge VFX bank when choosing move visuals. For mainVfx choose from main_slash_color1, main_slash2_color1, main_slash3_color2, main_slash3_color3, main_vfx_start, main_vfx_repeatable, main_wood_repeatable, main_firework, main_musicburst, main_stylized_explosion. For hitVfx choose from hit_round_spark, hit_firework, hit_directional, hit_middle_directional, hit_bottom_directional, hit_symmetrical_1, hit_symmetrical_2, hit_symmetrical_3, hit_stylized_explosion, hit_vfx_pack, hit_wood. Match hit sparks to the move: directional for launches or side hits, round/symmetrical for clean contact, wood for slams, and stylized explosion/firework for finishers. Every special MUST have a visual, visual.script, behavior, animation recipe, mainVfx, and hitVfx. visual.script is literal JavaScript code executed by a restricted canvas API; return only the function body, no markdown and no function wrapper. The API is api.line(x1,y1,x2,y2,color,width,alpha), api.arc(x,y,r,start,end,color,width,alpha), api.ring(x,y,r,color,width,alpha), api.circle(x,y,r,fill,stroke,width,alpha), api.spark(x,y,r,color,count,rotation), api.glow(color,blur), and api.asset(vfxId,x,y,size,alpha,rotation). The script receives t seconds, p normalized progress, active boolean, size, color, secondary, move, and Math. Use loops, trigonometry, p, and t to make every move's geometry and timing unique. Do not use window, document, DOM, network, storage, timers, imports, constructors, or globals. Make visuals and animation clearly different between moves: punches can snap, kicks can extend, spins can rotate, projectiles can cast, grapples must reach, lock, pull, then throw or slam. Projectiles may combine path patterns: arc uses gravity, fan uses spread, boomerang returns after returnDelay, orbit circles its spawn point, rain drops from above, and homing bends toward the victim. Rapid-jab moves must land 2-8 fast fist contacts across their active window, using rapidHits and rapidInterval; name them with a jab/barrage/flurry/ora/rush cue and use a punch gesture. Dive-kick moves must be air:true, use motion dive-kick, angle the attacker downward, accelerate toward the floor, and bounce or recoil after contact. Chain at least one rapid jab into a launcher/uppercut when the fighter is a rushdown type. Charge moves must visibly hold power during startup, then release with chargePower. Dash-attack moves must travel dashDistance during their active strike. Bomb moves must throw a timed explosive with fuse, radius, knockback, and a burst VFX; use fire or energy. Freeze moves must stop the opponent briefly and use frost/ice visuals. Teleports must blink the attacker to a new position before their hit. Pillars must spawn a tall elemental hazard from the floor; choose fire, ice, stone, lightning, shadow, or energy. Traps must remain on the floor and can optionally freeze a victim. Include at least one grapple, freeze, teleport, pillar, trap, charge, dash-attack, or bomb special when it fits the fighter; use all requested concepts when the prompt asks for them. Use arc or beam for melee, orb or beam for projectiles, slashes or burst for combos and bombs, rune for traps, grapple for grapples, freeze for freeze moves, teleport for teleports, and pillar for pillars. Use behavior to explain how the move moves, spawns, or affects the opponent. Make at least one close-range melee special a launcher when it fits the fighter. Startup, active, endlag, and hitstun are frame counts at 60fps; reach is pixels and may be omitted for automatic type-based reach. Do not use copyrighted character names. Keep specials 1-5 and usable in an aggressive AI-versus-AI match.`;
  const freeformMotionGuide = `Each attack may include juggle cost 1-15; launchers start the opponent with a finite juggle budget so air strings cannot loop forever. Give every move a distinct animation.gesture such as jab, cross, hook, elbow, palm, knee, roundhouse, sweep, overhead, thrust, slam, spin, burst, cast, or any short custom label so the fighter's silhouette and VFX read differently. Combine behavior.motion with behavior.pattern and its path controls to create unusual attacks rather than forcing every special into a straight projectile. For expressive combat motion, every move may also include behavior.knockback {horizontal:0-900, vertical:0-900, power:0-900, angle:-80-80, direction:"away|toward|up|down", hitstop:0-0.2, carry:true|false, wallBounce:true|false, groundBounce:true|false}. The animation may include a freeform transform object {rotateX:-360-360, rotateY:-360-360, rotateZ:-360-360, spin:-720-720, spinSpeed:-12-12, scaleX:0.35-2.4, scaleY:0.35-2.4, skewX:-0.95-0.95, skewY:-0.95-0.95, offsetX:-180-180, offsetY:-180-180, orbit:-1-1, pulse:0-1}. Use any combination of these values: rotateZ is a real spin, rotateX/rotateY become squash and skew for a 3D-style turn, and offsets/scales can make each move feel radically different. These are declarative motion controls interpreted by the arena, so do not return executable JavaScript.`;
  const expandedSystem = `${system} ${freeformMotionGuide}`;
  const userText = `Prompt: ${prompt}\nIdentity lock: keep the provided character name exactly as written (${settings.name || "invent only if blank"}) and keep the provided author exactly as written (${settings.author || "Forge Author"}). Never invent or replace a locked identity field. Requested buttons: ${settings.buttons || "any"}; combo: ${settings.combo || "any"}; personality: ${settings.personality || "invent"}; backstory: ${settings.backstory || "invent"}; desired moves: ${specialHint}.`;
  try {
    const completion = await window.websim.chat.completions.create({ messages: [{ role: "system", content: expandedSystem }, { role: "user", content: userText }], json: true });
    const made = parseAiJson(completion.content);
    const normalized = sanitizeFighter(made, normalizeMove, seed);
    // Identity belongs to the creator, not the model. The AI can design the
    // combatant around these fields, but it must never replace them.
    if (settings.name?.trim()) normalized.name = settings.name.trim().slice(0, 24);
    if (settings.author?.trim()) normalized.author = settings.author.trim().slice(0, 24);
    return normalized;
  } catch { return seed; }
}

async function saveFighter(data, prompt, portraitUrl) {
  const script = buildScript(data);
  const payload = { name: data.name, author: data.author, prompt, config: data, script, portraitUrl };
  const res = await fetch("/api/fighters", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Save failed");
  const row = normalizeFighter(result.fighter); fighters.splice(1, 0, row); selected = [row.id, kungFuMan.id]; activeSlot = 1; renderRoster(); return row;
}

async function updateFighter(id, data, prompt, portraitUrl) {
  const script = buildScript(data);
  const payload = { name: data.name, author: data.author, prompt, config: data, script, portraitUrl };
  const res = await fetch(`/api/fighters/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Update failed");
  const row = normalizeFighter(result.fighter), index = fighters.findIndex(f => f.id === id);
  if (index >= 0) fighters[index] = row;
  renderRoster();
  return row;
}

$("#forge-button").onclick = async () => {
  const prompt = $("#prompt").value.trim(), status = $("#forge-status");
  if (prompt.length < 8) { status.textContent = "Give the forge a little more to work with."; return; }
  $("#forge-button").disabled = true;
  const simpleSettings = { buttons: $("#simple-buttons").value, combo: $("#simple-combo").value, author: $("#simple-author").value.trim() || "Forge Author", name: $("#simple-name").value.trim(), personality: $("#simple-personality").value.trim(), backstory: $("#simple-backstory").value.trim() };
  if (editingId) {
    const current = fighterById(editingId), data = { ...(current.config || {}), name: simpleSettings.name || current.name, author: simpleSettings.author, personality: simpleSettings.personality, backstory: simpleSettings.backstory, buttons: Number(simpleSettings.buttons), combo: Number(simpleSettings.combo) };
    status.textContent = "Saving fighter changes…";
    try { const fighter = await updateFighter(editingId, data, prompt, uploadedPortrait || current.portrait_url || null); status.textContent = `${fighter.name} updated.`; resetEditorMode(); showView("roster"); }
    catch (e) { status.textContent = e.message; }
    $("#forge-button").disabled = false;
    return;
  }
  status.textContent = "AI is writing the combat profile…";
  const made = await aiForge(prompt, simpleSettings);
  if (simpleSettings.name) made.name = simpleSettings.name;
  if (simpleSettings.author) made.author = simpleSettings.author;
  if (simpleSettings.personality) made.personality = simpleSettings.personality;
  if (simpleSettings.backstory) made.backstory = simpleSettings.backstory;
  try { const fighter = await saveFighter(made, prompt, uploadedPortrait); status.textContent = `${fighter.name} is ready to select.`; showView("roster"); }
  catch (e) { status.textContent = e.message; }
  $("#forge-button").disabled = false;
};

$("#cancel-edit").onclick = () => { resetEditorMode(); $("#forge-status").textContent = ""; showView("roster"); };

function advancedSettings() {
  const specials = [...document.querySelectorAll("#special-list .special")].map(row => {
    const type = row.querySelector("select").value, defaults = moveFrameDefaults(type);
    const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
    return { name: row.querySelector("input").value.trim(), type, variant: "all", startup: clamp(row.querySelector(".move-startup").value, 1, 60, defaults.startup), active: clamp(row.querySelector(".move-active").value, 1, 20, defaults.active), endlag: clamp(row.querySelector(".move-endlag").value, 1, 90, defaults.endlag), hitstun: clamp(row.querySelector(".move-hitstun").value, 1, 60, defaults.hitstun) };
  }).filter(x => x.name).slice(0,5);
  return { name: $("#adv-name").value.trim(), author: $("#adv-author").value.trim() || "Forge Author", style: $("#adv-style").value.trim(), buttons: $("#adv-buttons").value, combo: $("#adv-combo").value, specials };
}
$("#advanced-forge").onclick = async () => {
  const settings = advancedSettings(), status = $("#advanced-status");
  const prompt = `${settings.style || "Original arcade fighter"}. Attacks: ${$("#adv-attacks").value}.`;
  status.textContent = "Compiling fighter JavaScript…"; $("#advanced-forge").disabled = true;
  const made = await aiForge(prompt, settings); made.emojis = safeEmojiArray($("#adv-attacks").value); made.author = settings.author; if (settings.name) made.name = settings.name;
  $("#code-preview").textContent = buildScript(made);
  try { const fighter = await saveFighter(made, prompt, uploadedPortrait); status.textContent = `${fighter.name} is ready to select.`; showView("roster"); }
  catch (e) { status.textContent = e.message; }
  $("#advanced-forge").disabled = false;
};
}


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
  guardBreakStun: 1.05, chipRatio: .12, blockPushback: 190, blockstunRatio: .74,
  comboScaleStep: .87, minScale: .3,
  juggleGravityStep: .17, maxJuggleGravity: 2.2,
  techWindow: .16, hardKnockdown: .92, softKnockdown: .58, wakeupInvuln: .3,
  counterDamage: 1.35, counterHitstun: 1.45,
  gravity: 1700, koSlowmo: .26
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
function resetCombo(f) { f.combo.timer = 0; f.combo.count = 0; f.combo.target = null; f.combo.scale = 1; f.combo.damage = 0; }

function fighterArchetype(me) {
  const moves = combatMoves(me), total = moves.length || 1;
  const ranged = moves.filter(isRanged).length / total;
  const grapples = moves.filter(isGrapple).length / total;
  const fast = moves.filter(move => moveFrames(move).startup <= 8).length / total;
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
  if (remaining < -.03) return 0;
  const distance = Math.abs(foe.x - me.x), range = (state.hitRange || 180) + 46;
  if (distance > range) return 0;
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
  battle = { left, right, fighters:[makeCombatant(left, FIGHT_START_LEFT, 1), makeCombatant(right, FIGHT_START_RIGHT, -1)], projectiles:[], phase:"banter", elapsed:0, shake:0, hitstop:0, round:1, wins:[0,0], maxRounds:3, messageIndex:0, result:"", clock:RULES.roundTime, koTimer:0, pendingWinner:null, bannerTimer:0 };
  camera.x = camera.targetX = 640; camera.y = camera.targetY = 330; camera.zoom = camera.targetZoom = 1; camera.focus = null;
  $("#left-name").textContent = left.name.toUpperCase(); $("#right-name").textContent = right.name.toUpperCase(); $("#left-wins").textContent = 0; $("#right-wins").textContent = 0; $("#result").classList.remove("show"); $("#rematch").hidden = true;
  $("#mode-label").textContent = "WATCH MODE"; $("#round-text").textContent = "ROUND 1"; $("#timer").textContent = RULES.roundTime; hideComboReadout(); hideMoveCallout(); updateHud();
  setBanter(left.config?.banter?.[0] || "The arena is ready.");
}
function showBanner(text, duration = 1.1, tone = "") {
  const el = $("#result"); el.textContent = text; el.dataset.tone = tone; el.classList.add("show");
  if (battle) battle.bannerTimer = duration;
}
function hideBanner() { const el = $("#result"); el.classList.remove("show"); el.removeAttribute("data-tone"); if (battle) battle.bannerTimer = 0; }
function beginRoundProper() {
  battle.phase = "fight"; battle.elapsed = 0; battle.clock = RULES.roundTime; clearBanter();
  showBanner("FIGHT!", .75, "go");
}
function makeCombatant(fighter,x,dir) {
  const aptitude = Number(fighter.config?.combo) || 2;
  // Combo aptitude describes a fighter's style, not perfect execution. Keep a
  // separate, slightly noisy skill value so a strong blueprint can still make
  // believable reads, hesitations, and dropped links.
  const examplePenalty = fighter.example ? .08 : 0, skill = Math.min(.9, Math.max(.48, .6 + (aptitude - 2) * .05 - examplePenalty + (Math.random() - .5) * .07));
  const c = { fighter, x, y:RULES.floorY, vy:0, vx:0, grounded:true, hp:RULES.maxHp, dir, hurt:0, frozen:0, invuln:0, hitstunFrames:0, recovery:null, recoveryAttempted:false, recoveryCooldown:0, attack:0, attackState:null, pose:"idle", cd:0, jumpCd:.2, crouch:0, running:false, runJump:false, blocking:false, blockTimer:0, blockFlash:0, trail:[], effects:[], dodge:0, airComboTarget:null, airComboTimer:0, airComboJumpQueued:false, airComboHits:0, juggle:0, juggleGravity:1, comboPlan:null, comboStep:0, comboPlanSerial:0, grappleTarget:null, grappledBy:null, grappledState:null,
    meter:0, guard:RULES.guardMax, guardBroken:0, guardImmune:0, blockLow:false, guardFlash:0, down:null, techTimer:0, counterFlash:0, superFlash:0, backdash:0, damageTaken:0,
    combo:{ count:0, timer:0, target:null, scale:1, damage:0, max:Math.min(6, 2 + Math.ceil(aptitude / 2)) } };
  const archetype = fighterArchetype(c);
  c.ai = { skill, archetype, profile:{ ...ARCHETYPES[archetype] }, lastMoveKey:"", hesitation:0,
    intent:"neutral", intentTimer:0, think:Math.random() * .1, reaction:Math.max(.075, .27 - skill * .21),
    blockedStreak:0, hitStreak:0, pressure:0, respect:.5 };
  return c;
}
function setBanter(text) { const el = $("#banter"); el.textContent = text; el.classList.add("show"); }
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
$("#start-match").onclick = startBattle; $("#rematch").onclick = () => { activeSlot = 0; renderRoster(); startBattle(); };

function fightTick(dt) {
  if (!battle) return;
  if (battle.bannerTimer > 0 && (battle.bannerTimer -= dt) <= 0 && battle.phase !== "between" && battle.phase !== "done") hideBanner();
  const [a,b] = battle.fighters;
  if (battle.phase === "banter") {
    battle.elapsed += dt; updateCamera(dt, .95);
    if (battle.elapsed > 1.9 && battle.messageIndex === 0) { setBanter(b.fighter.config?.banter?.[1] || "Show me what you forged."); battle.messageIndex++; battle.elapsed=0; }
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
function combatMoves(me) {
  const configured = Array.isArray(me.fighter.config?.specials) ? me.fighter.config.specials : [];
  return (configured.length ? configured : [{ name:"Quick Strike", type:"melee", variant:"light" }]).map(move => normalizeMove(move, me.fighter.config));
}
function isLauncher(move) {
  return move?.launcher === true || move?.role === "launcher" || /launch|uppercut|rising|breaker|lift|sky|anti.?air|dragon/i.test(move?.name || "");
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
function canLink(previous, next, previousVariant = "ground", nextVariant = "ground") {
  if (!previous || !next) return true;
  const from = moveFrames(previous, previousVariant), into = moveFrames(next, nextVariant);
  const reach = Number(previous?.reach) > 0 && Number(next?.reach) > 0 ? Number(next.reach) + 18 >= Number(previous.reach) * .58 : true;
  const rapidBuffer = isRapidJab(previous) ? 8 : 0;
  return reach && from.hitstun + rapidBuffer >= from.endlag + into.startup + 1;
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
function buildComboPlan(me, foe) {
  const moves = combatMoves(me), groundedMoves = moves.filter(move => !isRanged(move) && !isGrapple(move) && !isDiveKick(move));
  if (groundedMoves.length < 2) return null;
  const launcher = groundedMoves.find(isLauncher);
  let ground = launcher ? findGroundRoute(moves, launcher) : null;
  const rapidJab = groundedMoves.find(isRapidJab);
  // Give pressure fighters a real branching route: a short barrage can
  // cash out into an uppercut, while normal routes still appear often enough
  // that the AI does not look like it is repeating a canned sequence.
  if (rapidJab && launcher && canLink(rapidJab, launcher) && Math.random() < .7) {
    ground = [{ move:rapidJab, crouch:false }];
  }
  // A visually useful ground chain should still exist for characters whose
  // generated moveset has no explicitly named launcher.
  if (!ground || !ground.length) {
    const candidates = groundedMoves.filter(move => move !== launcher && !isLauncher(move)).sort((a, b) => moveFrames(a).startup - moveFrames(b).startup);
    ground = candidates.slice(0, Math.min(2, candidates.length)).map(move => ({ move, crouch: move.crouch === true || moveRole(move).includes("crouch") }));
    if (ground.length < 2 && launcher) ground = groundedMoves.filter(move => move !== launcher).slice(0, 2).map(move => ({ move, crouch:false }));
  }
  if (!ground.length) return null;
  const groundLimit = me.ai?.skill > .72 ? 3 : 2;
  ground = ground.slice(0, groundLimit);
  const used = new Set([...(launcher ? [launcher] : []), ...ground.map(step => step.move)]), air = [];
  let previous = launcher || ground.at(-1)?.move;
  if (launcher) {
    const airCandidates = comboCandidates(moves, "air", used).sort((a, b) => {
      const roleA = moveRole(a), roleB = moveRole(b), rank = role => ({"air-light-punch":1,"air-medium-punch":2,"air-medium-kick":3,"air-special":4}[role] || 5);
      return rank(roleA) - rank(roleB) || moveFrames(a).startup - moveFrames(b).startup || (Math.random() - .5);
    });
    for (const move of airCandidates) {
      if (!canLink(previous, move, previous === launcher ? "ground" : "air", "air")) continue;
      air.push({ move, air:true }); used.add(move); previous = move;
      if (air.length >= 2) break;
    }
  }
  me.comboPlanSerial += 1;
  me.comboPlan = { id:me.comboPlanSerial, target:foe, dashTimer:.12, reliability:Math.min(.86, Math.max(.5, me.ai?.skill || .64)), steps:[{ action:"dash" }, ...ground, ...(launcher ? [{ move:launcher }, ...air] : [])] };
  me.comboStep = 0;
  return me.comboPlan;
}
function cancelComboPlan(me) { me.comboPlan = null; me.comboStep = 0; }
function airComboApproach(me, foe, move) {
  const chaseDir = foe.x >= me.x ? 1 : -1;
  me.dir = chaseDir;
  const reach = moveHitRange(move, "air"), idealGap = Math.min(118, Math.max(48, reach * .52));
  const desiredX = foe.x - chaseDir * idealGap, error = desiredX - me.x;
  me.vx = Math.max(-340, Math.min(340, error * 6.4));
  if (Math.abs(error) < 22) me.vx *= .45;
  // Keep the attacker on the same vertical slice as the launched target;
  // horizontal chase alone was making the next air button pass underneath.
  const verticalError = foe.y - me.y;
  if (Math.abs(verticalError) > 24) me.vy = Math.max(-760, Math.min(560, me.vy + verticalError * 2.8));
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
  if (foe.attackState && me.cd === 0 && distance < incomingRange + 34 && Math.random() < dt * (.55 + (me.ai?.skill || .62) * .65)) {
    cancelComboPlan(me); if (me.ai) me.ai.hesitation = .1 + Math.random() * .12; return false;
  }
  if (step.action === "dash") {
    plan.dashTimer -= dt; me.running = true; me.vx = me.dir * (330 + (Number(me.fighter.config?.combo) || 2) * 12); me.pose = "run";
    if (plan.dashTimer <= 0 || distance < 275) me.comboStep++;
    return true;
  }
  // Test each link once, at the moment it is about to be attempted. This
  // keeps combo routes intentional without making the AI look scripted or
  // allowing Kung Fu Man's fast normals to become an automatic perfect loop.
  if (!step.linkChecked && me.comboStep > 1) {
    step.linkChecked = true;
    if (Math.random() > (plan.reliability || .64)) { cancelComboPlan(me); me.ai.hesitation = .12 + Math.random() * .12; return false; }
  }
  if (step.air && me.grounded) { me.jumpCd=0; startJump(me, true, foe); return true; }
  if (!step.air && !me.grounded) return true;
  const reach = moveReach(step.move, step.air ? "air" : me.crouch > 0 ? "crouch" : "ground");
  if (me.cd > 0) { me.vx = 0; me.pose = me.grounded ? "idle" : "jump"; return true; }
  if (step.crouch) me.crouch = .24; else if (me.grounded) me.crouch = 0;
  const airSpacing = step.air ? airComboApproach(me, foe, step.move) : null;
  const inRange = (airSpacing?.distance ?? distance) <= moveHitRange(step.move, step.air ? "air" : me.crouch > 0 ? "crouch" : "ground"), verticalDistance = airSpacing?.vertical ?? Math.abs(foe.y - me.y);
  if (inRange && (!step.air || verticalDistance < 190)) { startAttack(me, foe, step.move, me.comboStep); return true; }
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
  const projectile = incomingProjectile(me);
  const openings = foe.guardBroken > 0 || (foe.down && foe.down.t > foe.down.duration - .28) || foe.frozen > 0;
  const superReady = me.meter >= RULES.superCost && combatMoves(me).length > 0;
  let intent = "neutral", timer = ai.reaction * (1.4 + Math.random());

  if (openings && distance < 420) intent = "punish";
  else if (superReady && distance < 320 && (desperate || openings || foe.hurt > 0 || Math.random() < .18 + ai.skill * .3)) intent = "super";
  else if (foeIsWhiffing(me, foe) && distance < 330) intent = "whiff-punish";
  else if (!foe.grounded && foe.vy > -180 && distance < 260 && Math.random() < .45 + ai.skill * .45) intent = "antiair";
  else if (projectile) intent = distance > 290 && Math.random() < .35 + profile.jumpBias * .25 ? "leap" : "block";
  else if (inCorner(me) && !inCorner(foe) && distance < 300 && Math.random() < .55 + ai.skill * .3) intent = "escape";
  else if (foe.hurt > 0 && distance < 300) intent = "pressure";
  else if (foe.attackState && distance < (foe.attackState.hitRange || 180) + 60) {
    // Respect grows when we keep eating the same attack and shrinks when we
    // block so much that we are just feeding the opponent free pressure.
    const guardBias = profile.blockBias * (ai.respect + .35) * (me.guard / RULES.guardMax);
    intent = Math.random() < guardBias * .6 ? "block" : Math.random() < .55 ? "evade" : "whiff-punish";
  }
  else if (profile.zoneBias > 1 && distance > 250 && Math.random() < profile.zoneBias * .4) intent = "zone";
  else if (distance > profile.idealGap * 1.35) intent = Math.random() < profile.jumpBias * .22 ? "leap" : "approach";
  else if (distance < profile.idealGap * .5 && !desperate && Math.random() < .32 * profile.patience) intent = "space";
  else if (Math.random() < profile.aggression * (desperate ? 1.15 : winning ? .88 : 1)) intent = "pressure";
  else intent = "neutral";

  ai.intent = intent; ai.intentTimer = timer;
}

function aiWalk(me, target, speed, pose) {
  const delta = target - me.x;
  if (Math.abs(delta) < 18) { me.vx *= .8; me.running = false; me.pose = "idle"; return true; }
  me.vx = Math.sign(delta) * speed; me.running = speed > 240; me.pose = pose || (me.running ? "run" : "walk");
  return false;
}

function aiTryAttack(me, foe, variant, intent, chance = 1) {
  if (me.cd > 0 || me.ai.hesitation > 0) return false;
  const move = chooseMove(me, foe, variant, intent);
  if (!move) return false;
  const distance = Math.abs(foe.x - me.x);
  const inRange = isRanged(move) ? distance <= moveReach(move, variant) : distance <= moveHitRange(move, variant);
  if (!inRange || Math.random() > chance) return false;
  startAttack(me, foe, move);
  return true;
}

function updateAI(me, foe, dt) {
  me.cd = Math.max(0,me.cd-dt); me.hurt=Math.max(0,me.hurt-dt); me.hitstunFrames=me.hurt>0 ? Math.ceil(me.hurt*60) : 0; me.frozen=Math.max(0,me.frozen-dt); me.invuln=Math.max(0,me.invuln-dt); me.recoveryCooldown=Math.max(0,me.recoveryCooldown-dt); me.dodge=Math.max(0,me.dodge-dt); me.jumpCd=Math.max(0,me.jumpCd-dt); me.crouch=Math.max(0,me.crouch-dt); me.blockFlash=Math.max(0,me.blockFlash-dt); me.airComboTimer=Math.max(0,me.airComboTimer-dt);
  me.counterFlash=Math.max(0,me.counterFlash-dt); me.superFlash=Math.max(0,me.superFlash-dt); me.techTimer=Math.max(0,me.techTimer-dt); me.backdash=Math.max(0,me.backdash-dt);
  const distance = Math.abs(foe.x-me.x), profile = me.ai.profile, skill = me.ai?.skill || .62;
  if (me.ai) me.ai.hesitation = Math.max(0, me.ai.hesitation - dt);
  if (me.airComboTarget && (me.airComboTimer === 0 || foe.grounded || foe.juggle <= 0)) me.airComboTarget = null;
  if (me.airComboTimer === 0 || foe.grounded) me.airComboJumpQueued = false;

  // ── Locked states ────────────────────────────────────────────────────────
  if (me.down) {
    // Knocked down. Getting up is a real, punishable moment: the last stretch
    // grants invulnerability so wake-up is a read rather than a free kill.
    me.down.t += dt; me.vx *= .82; me.blocking = false; me.attackState = null; me.attack = 0;
    me.pose = me.down.t > me.down.duration - .3 ? "getup" : "down";
    if (me.down.t > me.down.duration - RULES.wakeupInvuln) me.invuln = Math.max(me.invuln, .06);
    if (me.down.t >= me.down.duration) {
      me.down = null; me.juggle = 0; me.juggleGravity = 1; me.cd = .05; me.pose = "idle";
      // Wake-up option: reversal, block, or just stand up.
      const roll = Math.random();
      if (roll < .18 + skill * .22 && distance < 190) aiTryAttack(me, foe, "ground", "launcher", 1);
      else if (roll < .6) startBlock(me, .3 + Math.random() * .2);
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
  if (me.attackState) return;
  if (me.grappledBy) { me.vx=0; me.pose="grappled"; return; }
  if (me.hurt > 0) {
    cancelComboPlan(me); me.vx *= .88; me.pose="hurt";
    const lateHitstun = me.hurt <= .16;
    if (lateHitstun && !me.recoveryAttempted) { me.recoveryAttempted = true; if (startRecovery(me, foe)) return; }
    return;
  }
  if (me.blocking) {
    me.blockTimer -= dt; me.vx *= .7; me.pose = me.blockLow ? "block-low" : "block";
    if (me.blockTimer <= 0) { me.blocking = false; me.blockLow = false; }
    else return;
  }

  // ── Reflex layer: runs every frame so blocking still feels reactive ──────
  const threat = threatLevel(me, foe);
  if (threat > .5 && me.cd === 0 && !me.attackState) {
    const guardBias = profile.blockBias * (me.ai.respect + .3) * (me.guard / RULES.guardMax) * skill;
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
  if (me.ai.think <= 0 || me.ai.intentTimer <= 0) { me.ai.think = me.ai.reaction; aiThink(me, foe); }
  executeIntent(me, foe, dt, distance, chainReady);
}

function updateAirAI(me, foe, dt, distance, skill) {
  const chasing = me.airComboTarget === foe && !foe.grounded && foe.juggle > 0;
  const airMove = chooseMove(me, foe, "air", chasing ? "air-combo" : "air");
  const approach = chasing ? airComboApproach(me, foe, airMove) : null;
  if (!chasing) me.vx = me.dir * (me.runJump ? 240 : 155);
  const verticalWindow = chasing ? 142 : 170;
  const reachWindow = chasing ? moveHitRange(airMove, "air") + 12 : moveHitRange(airMove, "air");
  const aligned = (approach?.distance ?? distance) <= reachWindow && (approach?.vertical ?? Math.abs(foe.y - me.y)) < verticalWindow;
  const goodMoment = !chasing || Math.abs(me.vy - foe.vy) < 520 || me.vy > foe.vy - 260;
  if (me.cd === 0 && aligned && goodMoment && (chasing || Math.random() < dt * (2.8 + skill * 2.6))) startAttack(me, foe, airMove);
  else me.pose = me.runJump ? "run-jump" : "jump";
}

function executeIntent(me, foe, dt, distance, chainReady) {
  const ai = me.ai, profile = ai.profile, skill = ai.skill;
  switch (ai.intent) {
    case "super": {
      const move = pickSuperMove(me);
      if (!move) { ai.intent = "pressure"; return; }
      const range = isRanged(move) ? moveReach(move) : moveHitRange(move);
      if (distance <= range && me.cd === 0) { startAttack(me, foe, move, null, { super: true }); ai.intent = "neutral"; return; }
      aiWalk(me, foe.x - me.dir * range * .7, 300);
      return;
    }
    case "punish":
    case "whiff-punish": {
      // Free damage. Walk in and take the biggest thing that reaches.
      if (me.cd === 0 && !me.comboPlan && distance < 300 && buildComboPlan(me, foe)) { updatePlannedCombo(me, foe, dt); return; }
      if (aiTryAttack(me, foe, "ground", "launcher", .9)) return;
      if (aiTryAttack(me, foe, "ground", "special", 1)) return;
      aiWalk(me, foe.x - me.dir * 110, 320);
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
      if (me.backdash === 0) { me.backdash = .5; me.dodge = .34; me.vx = -me.dir * (330 + skill * 90); me.pose = "evade"; }
      else me.vx *= .9;
      return;
    }
    case "escape": {
      // Out of the corner: jump over the pressure, or barge through it.
      if (me.jumpCd === 0) { startJump(me, true); me.vx = me.dir * 380; return; }
      if (me.cd === 0 && distance < 150 && aiTryAttack(me, foe, "ground", "launcher", .8)) return;
      me.vx = me.dir * 300; me.running = true; me.pose = "run";
      return;
    }
    case "leap": {
      if (me.jumpCd === 0) startJump(me, true);
      else aiWalk(me, foe.x - me.dir * profile.idealGap, 260);
      return;
    }
    case "zone": {
      const ranged = combatMoves(me).filter(isRanged);
      if (ranged.length && me.cd === 0 && Math.random() < dt * (2.4 + skill * 1.6)) { startAttack(me, foe, ranged[Math.floor(Math.random() * ranged.length)]); return; }
      aiWalk(me, foe.x - me.dir * profile.idealGap, 180);
      return;
    }
    case "space": {
      // Hold the range where my move reaches and theirs does not.
      const wanted = foe.x - me.dir * profile.idealGap;
      if (aiWalk(me, wanted, 220) && me.cd === 0 && Math.random() < dt * 1.4) me.crouch = .28;
      return;
    }
    case "pressure": {
      if (chainReady && me.cd === 0 && aiTryAttack(me, foe, me.crouch > 0 ? "crouch" : "ground", "chain", 1)) return;
      if (!me.comboPlan && me.cd === 0 && ai.hesitation === 0 && distance < 330 && Math.random() < dt * (1.1 + skill * 1.3)) {
        if (buildComboPlan(me, foe)) { updatePlannedCombo(me, foe, dt); return; }
      }
      const wantLauncher = distance < 215 && Math.random() < .1 + skill * .18;
      if (aiTryAttack(me, foe, me.crouch > 0 ? "crouch" : "ground", wantLauncher ? "launcher" : "special", Math.min(1, dt * (2.6 + skill * 2.2) * 12))) return;
      // Mix in a low so blocking high is not free.
      if (me.cd === 0 && distance < 200 && Math.random() < dt * 1.6) { me.crouch = .3; return; }
      aiWalk(me, foe.x - me.dir * 118, 300);
      return;
    }
    default: {
      const wanted = foe.x - me.dir * profile.idealGap;
      if (Math.abs(me.x - wanted) > 40) aiWalk(me, wanted, 190);
      else { me.running = false; me.vx *= .84; me.pose = Math.random() < dt * .8 ? "crouch" : "idle"; if (me.pose === "crouch") me.crouch = .25; }
      if (me.cd === 0 && distance < 240 && Math.random() < dt * (.7 + skill * .8)) aiTryAttack(me, foe, "ground", "special", 1);
    }
  }
}
function isBomb(move) { return move?.type === "bomb" || move?.behavior?.motion === "bomb"; }
function isDashAttack(move) { return move?.behavior?.motion === "dash-attack"; }
function isChargeMove(move) { return move?.behavior?.motion === "charge"; }
function isRanged(move) { return move?.type === "projectile" || move?.type === "trap" || move?.type === "freeze" || move?.type === "pillar" || isBomb(move); }
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
function meleeHitboxConnects(me, foe, state) {
  const horizontal = (foe.x - me.x) * me.dir;
  // The target is a body, not a point. Let the box reach the near edge of
  // the opponent's hurtbox when the effect touches them on screen.
  const targetHalfWidth = foe.grounded ? 42 : 36;
  const range = (state.hitRange || state.reach + 52 + (state.variant === "air" ? 16 : 0)) + targetHalfWidth;
  const vertical = Math.abs(foe.y - me.y);
  const verticalWindow = state.diveKick ? 260 : state.variant === "air" ? 150 : state.variant === "crouch" ? 112 : 122;
  const diveIsCommitted = !state.diveKick || me.vy > -180 || state.t > state.startup / 60;
  return horizontal >= -38 && horizontal <= range && vertical <= verticalWindow && diveIsCommitted && (state.variant === "air" || foe.grounded);
}
function chooseMove(me, foe, variant = "ground", intent = "neutral") {
  const moves = combatMoves(me), distance = Math.abs(foe.x-me.x), ranged = moves.filter(isRanged), grounded = moves.filter(move => !isRanged(move)), grapples = grounded.filter(isGrapple);
  let pool = moves;
  if (variant === "air") pool = airComboMoves(moves);
  else if (intent === "launcher") {
    const launchers = grounded.filter(isLauncher);
    pool = launchers.length ? launchers : grounded;
  } else if (distance < 142 && grapples.length && Math.random() < .62) {
    pool = grapples;
  } else if (distance > 250 && ranged.length) pool = ranged;
  else if (distance <= 230 && grounded.length) pool = grounded;
  if (intent === "air-combo") {
    const comboMoves = airComboMoves(pool);
    if (comboMoves.length) pool = comboMoves;
  }
  const reachable = pool.filter(move => isRanged(move) || distance <= moveHitRange(move, variant) + 25);
  if (reachable.length) pool = reachable;
  const safeFallback = variant === "air" ? moves.find(move => !isRanged(move) && !isGrapple(move) && !isLauncher(move)) : null;
  if (!pool.length) return safeFallback || moves[0];
  // Choose from a small noisy shortlist. The AI considers spacing and move
  // purpose first, then adds enough variance that both fighters do not repeat
  // the same optimal button every exchange.
  const scored = pool.map(move => {
    const reach = moveHitRange(move, variant), startup = moveFrames(move, variant).startup;
    let score = Math.random() * 11 - startup * .18;
    if (distance <= reach + 18) score += 9;
    else score -= Math.min(18, (distance - reach) * .035);
    if (isRanged(move)) score += distance > 220 ? 15 : -8;
    if (isBomb(move)) score += distance > 180 ? 8 : -12;
    if (isChargeMove(move)) score += distance > 210 ? 6 : -15;
    if (isDashAttack(move)) score += distance > 105 && distance < 330 ? 12 : -5;
    if (isDiveKick(move)) score += variant === "air" && foe.grounded && distance > 90 && distance < 360 ? 17 : -8;
    if (isRapidJab(move)) score += variant !== "air" && distance < 220 ? 12 : -3;
    if (intent === "launcher") score += isLauncher(move) ? 26 : -10;
    if (intent === "chain") score += isLauncher(move) ? 7 : 5;
    if (foe.hurt > 0) score += startup < 9 ? 6 : -3;
    if (me.ai?.lastMoveKey === `${move.type}:${move.name}`) score -= 8;
    return { move, score };
  }).sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, Math.min(3, scored.length));
  return shortlist[Math.floor(Math.random() * shortlist.length)]?.move || safeFallback || moves[0];
}
function startJump(me, running=false, target=null) {
  if (!me.grounded || me.jumpCd > 0 || me.attackState || me.blocking) return false;
  me.grounded=false; me.blocking=false; me.crouch=0; me.runJump=running; me.running=false;
  if (target) {
    me.dir = target.x >= me.x ? 1 : -1;
    // Match the launched opponent's vertical arc instead of using a fixed
    // jump. The small height correction makes the first air hit line up.
    me.vy = Math.max(-780, Math.min(-520, target.vy + (target.y - me.y) * 2.6));
    me.vx = me.dir * 285;
    me.airComboTarget = target; me.airComboTimer = Math.max(me.airComboTimer, 1.8);
  } else {
    me.vy=-655; me.vx=me.dir*(running ? 300 : 185);
  }
  me.jumpCd=.9; me.pose=running ? "run-jump" : "jump";
  return true;
}
function startBlock(me, duration = .5, low = false) {
  if (!me.grounded || me.attackState || me.hurt > 0 || me.recovery || me.down || me.guardBroken > 0) return;
  me.blocking = true; me.blockLow = low; me.blockTimer = Math.max(me.blockTimer, duration);
  me.running = false; me.vx = 0; me.crouch = low ? Math.max(me.crouch, duration) : 0; me.pose = low ? "block-low" : "block";
}
function startRecovery(me, foe) {
  if (me.recovery || me.recoveryCooldown > 0 || me.hurt <= 0 || me.grappledBy || me.down || me.guardBroken > 0) return false;
  const airborne = !me.grounded, recoveryChance = airborne ? .5 : .4;
  if (Math.random() > recoveryChance) return false;
  me.recoveryAttempted = true; me.recovery = { type: airborne ? "air-hop" : "backflip", t: 0, duration: airborne ? .34 : .48 };
  me.invuln = airborne ? .14 : .16; me.recoveryCooldown = airborne ? .7 : .82; me.hurt = 0; me.hitstunFrames = 0; me.attackState = null; me.attack = 0; me.blocking = false; me.blockTimer = 0; me.crouch = 0; me.running = false;
  me.juggle = 0; me.airComboHits = 0; me.airComboTarget = null; me.airComboTimer = 0; me.airComboJumpQueued = false; me.pendingKnockdown = 0; me.juggleGravity = 1; resetCombo(me);
  me.dir = foe.x >= me.x ? 1 : -1; me.vx = -me.dir * (airborne ? 145 : 245);
  if (airborne) { me.vy = -300; me.y -= 4; me.pose = "recover-air"; }
  else { me.grounded = false; me.vy = -475; me.y = Math.max(420, me.y - 2); me.pose = "recover-ground"; }
  const attacker = battle.fighters.find(fighter => fighter !== me);
  if (attacker) { attacker.airComboTarget = null; attacker.airComboTimer = 0; attacker.airComboJumpQueued = false; resetCombo(attacker); attacker.comboPlan = null; attacker.comboStep = 0; }
  me.effects.push({ kind: "recovery", t: me.recovery.duration, x: me.x, y: me.y, color: me.fighter.config?.color || "#d8ff3e", size: airborne ? 44 : 58 });
  return true;
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
  const rapidJab = isRapidJab(move), rapidHits = rapidJab ? Math.round(clampNumber(move.behavior?.rapidHits, 2, 8, 5)) : 1, rapidInterval = rapidJab ? clampNumber(move.behavior?.rapidInterval, .045, .18, .075) : 0;
  const baseActive = Math.min(20, Math.max(1, Number(move.active) || defaults.active)), active = rapidJab ? Math.max(baseActive, Math.ceil((rapidHits - 1) * rapidInterval * 60) + 3) : baseActive;
  const baseEndlag = Math.min(90, Math.max(1, Number(move.endlag ?? move.endLag) || defaults.endlag)), baseHitstun = Math.min(60, Math.max(1, Number(move.hitstun ?? move.hitStun) || defaults.hitstun));
  const chargeFrames = charge ? Math.round(clampNumber(move.behavior?.charge, .12, 2.5, .5) * 60) : 0;
  const variantStartup = (variant === "crouch" ? startup + 2 : variant === "air" ? Math.max(3, startup - 1) : startup) + chargeFrames;
  const variantEndlag = variant === "air" ? baseEndlag + 3 : variant === "crouch" ? baseEndlag + 2 : baseEndlag;
  const variantHitstun = Math.min(60, baseHitstun + (variant === "air" ? 2 : variant === "crouch" ? 1 : 0));
  const totalFrames = variantStartup + active + variantEndlag, duration = totalFrames / 60;
  const baseDamage = rapidJab ? 3.5 : grapple ? 4 : bomb ? 11 : freeze ? 5 : pillar ? 9 : move.type === "combo" ? 10 : projectile ? 8 : 6;
  const movePower = move.variant === "heavy" ? 3 : move.variant === "medium" ? 1 : 0;
  const variantBonus = variant === "air" ? 2 : variant === "crouch" ? 1 : 0;
  const name = move.name || (projectile ? "Spark Shot" : "Strike");
  const chainName = chainStep ? ` ${["II","III","IV","FINISH"][Math.min(chainStep-1,3)]}` : "";
  const label = `${superMove ? "SUPER " : exMove ? "EX " : ""}${variant === "air" ? "AIR " : variant === "crouch" ? "LOW " : ""}${name}${rapidJab ? ` ×${rapidHits}` : ""}${chainName}`.toUpperCase();
  const launcher = variant === "ground" && isLauncher(move);
  const diveKick = variant === "air" && isDiveKick(move);
  const powerMultiplier = superMove ? 2.35 : exMove ? 1.45 : 1;
  me.attackState = { foe, move, visual:move.visual, superMove, exMove, powerMultiplier, behavior:move.behavior, animation:move.animation, variant, projectile, bomb, charge, grapple, teleport, pillar, freeze, launcher, diveKick, rapidJab, rapidHits, rapidInterval, rapidHitCount:0, nextRapidHitAt:0, dashAttack:isDashAttack(move), comboPlanId:me.comboPlan?.target === foe ? me.comboPlan.id : null, comboStep, linkRetryCount:0, hitConfirmed:false, duration, startup:variantStartup, active, endlag:variantEndlag, hitstun:variantHitstun, totalFrames, t:0, hitAt:variantStartup / 60, finishAt:(variantStartup + Math.max(5, Math.round(active * .62))) / 60, resolved:false, behaviorApplied:false, finished:false, grabbed:false, grapplePhase:"reach", reach:moveReach(move, variant), hitRange:moveHitRange(move, variant), damage:(baseDamage + movePower + variantBonus + Math.min(chainStep,3)*1.6) * (charge ? clampNumber(move.behavior?.chargePower, .7, 2.5, 1.35) : 1) * powerMultiplier, label };
  if (superMove) {
    // Freeze the screen on the flash so the announcement lands before the
    // move actually moves. Startup is invulnerable, which is the whole
    // reason a super is worth a full bar.
    me.superFlash = .55; me.invuln = Math.max(me.invuln, variantStartup / 60 + .06);
    addHitstop(.24); addShake(.3); camera.focus = me;
  } else if (exMove) { me.superFlash = .25; addShake(.1); }
  showMoveCallout(me, me.attackState);
  // Attack duration already contains endlag. A second long cooldown here was
  // making valid links start after the defender had recovered.
  me.attack = duration; me.cd = chainStep ? .025 : .055; me.pose = "startup"; me.vx = 0;
  if (diveKick) {
    me.dir = foe.x >= me.x ? 1 : -1;
    me.vx = me.dir * clampNumber(move.behavior?.speed, 220, 520, 360);
    me.vy = Math.max(460, me.vy);
  }
}
function updateAttack(me, foe, dt) {
  const state = me.attackState; if (!state) return;
  if (me.hurt > 0) { if (state.grappled) releaseGrapple(me, foe); cancelComboPlan(me); me.attackState=null; me.attack=0; me.pose="hurt"; return; }
  state.t += dt; me.attack = Math.max(0, state.duration - state.t);
  const activeStart = state.startup / 60, activeEnd = (state.startup + state.active) / 60;
  if (state.t < activeStart) { state.grapplePhase="reach"; me.pose = "startup"; }
  else if (state.grapple && state.grabbed && state.t < state.finishAt) { state.grapplePhase="hold"; me.pose = "grapple-hold"; }
  else if (state.grapple && state.grabbed && !state.finished && state.t >= state.finishAt) { state.grapplePhase="finish"; me.pose = state.animation.finish === "throw" ? "grapple-throw" : "grapple-slam"; finishGrapple(me, foe, state); }
  else if (state.t < activeEnd) { state.grapplePhase=state.grapple ? "finish" : state.grapplePhase; me.pose = state.projectile || state.bomb || state.charge ? "cast" : state.variant === "air" ? "air-attack" : state.variant === "crouch" ? "crouch-attack" : "attack"; }
  else me.pose = "endlag";
  if (!state.behaviorApplied && state.t >= state.hitAt) {
    state.behaviorApplied = true;
    if (state.projectile || state.bomb) { state.resolved = true; spawnProjectile(me, foe, state); }
    else applyMoveBehavior(me, foe, state);
  }
  // A melee hitbox stays live for the whole active window. Rapid jabs reuse
  // that window at a fixed cadence, creating a readable multi-hit flurry.
  const rapidReady = state.rapidJab && state.rapidHitCount < state.rapidHits && state.t >= (state.rapidHitCount ? state.nextRapidHitAt : activeStart);
  if (!state.projectile && !state.bomb && (!state.resolved || rapidReady) && state.t >= activeStart && state.t <= activeEnd) {
    const evaded = foe.dodge > 0 && Math.random() < Math.min(.65, foe.dodge*.7);
    const juggleBlocked = state.variant === "air" && !foe.grounded && foe.juggle <= 0;
    if (meleeHitboxConnects(me, foe, state) && !evaded && !juggleBlocked && (!state.rapidJab || rapidReady)) {
      if (!state.rapidJab) state.resolved = true;
      if (state.grapple) state.hitConfirmed = attemptGrapple(me, foe, state) || state.hitConfirmed;
      else state.hitConfirmed = (hit(me, foe, state.damage, state.label, state.hitstun, state.launcher, state.variant, state.visual) !== false) || state.hitConfirmed;
      if (state.rapidJab) {
        state.rapidHitCount += 1;
        state.nextRapidHitAt = state.t + state.rapidInterval;
        if (state.rapidHitCount >= state.rapidHits) state.resolved = true;
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
      else {
        const nearLink = foe.hurt > 0 && !foe.recovery && Math.abs(foe.x - me.x) <= state.hitRange + 52;
        if (nearLink && (me.comboPlan.linkRetryCount || 0) < 1) { me.comboPlan.linkRetryCount = 1; me.combo.timer = Math.max(me.combo.timer, .45); me.cd = .02; }
        else cancelComboPlan(me);
      }
    }
    if (state.grappled) releaseGrapple(me, foe); me.attackState=null; me.attack=0; me.pose = me.grounded ? me.crouch > 0 ? "crouch" : "idle" : "jump";
    if (launchJump) { me.airComboJumpQueued=false; me.jumpCd=0; me.cd=0; startJump(me, true, foe); }
  }
}
function updateCombo(me, dt) {
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
  if (foe.invuln > 0 || foe.down) return false;
  // Throw tech: a defender who is attacking, or who reads the grab in time,
  // breaks the clinch instead of eating a full command grab.
  const canTech = foe.guardBroken <= 0 && foe.hurt <= 0 && foe.techTimer === 0
    && (Boolean(foe.attackState) || Math.random() < .18 + (foe.ai?.skill || .6) * .3);
  if (canTech && !state.superMove) {
    foe.techTimer = .6; me.techTimer = .6;
    foe.vx = me.dir * 210; me.vx = -me.dir * 210;
    me.attackState.resolved = true; state.grapplePhase = "whiff";
    foe.effects.push({ kind: "impact", t: .3, x: (me.x + foe.x) / 2, y: me.y, color: "#ffffff", size: 56 });
    resetCombo(me); addHitstop(.06); addShake(.1); showBanner("TECH", .5, "tech");
    return false;
  }
  if (foe.blocking || foe.grappledBy || me.grappleTarget) {
    foe.hp = Math.max(0, foe.hp - Math.max(.5, state.damage * .12));
    foe.blockFlash = .2; resetCombo(me);
    state.grapplePhase = "whiff";
    return false;
  }
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
  hit(me, foe, state.damage + (finisher === "throw" ? 5 : 7), state.label, state.hitstun, false, "ground", state.visual);
  foe.grounded = false; foe.runJump = false; foe.y = Math.max(390, foe.y - (finisher === "throw" ? 10 : 28));
  if (!foe.vy) foe.vy = -(finisher === "throw" ? 560 : 470);
  if (!foe.vx) foe.vx = me.dir * (finisher === "throw" ? 410 : 260);
  foe.effects.push({ kind:"impact", t:.46, x:foe.x, y:foe.y, color:state.visual?.secondary || "#fff2c2", size:(state.visual?.size || 68) * 1.25, vfxId:state.visual?.hitVfx });
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
    const speed = clampNumber(behavior.speed, 160, 700, 390), p = { x:spawnX, y:spawnY, originX:spawnX, originY:spawnY, phase:i * Math.PI / Math.max(1, shots), vx:(hazard && !bomb) || pattern === "rain" || pattern === "orbit" ? 0 : Math.cos(shotAngle) * speed, vy:(hazard && !bomb) ? 0 : pattern === "rain" ? speed : Math.sin(shotAngle) * speed, age:0, pattern, gravity:clampNumber(behavior.gravity, -1600, 1600, pattern === "arc" ? 520 : 0), homing:clampNumber(behavior.homing, 0, 1, 0), bounces:Math.round(clampNumber(behavior.bounces, 0, 3, 0)), orbitRadius:clampNumber(behavior.orbitRadius, 24, 220, 84), orbitSpeed:clampNumber(behavior.orbitSpeed, -12, 12, 3.5), returnDelay:clampNumber(behavior.returnDelay, .15, 1.5, .62), returning:false, owner:me, life:bomb ? behavior.fuse + .08 : hazard ? behavior.lifetime : 1.45, armed:bomb ? behavior.fuse : .18, radius:clampNumber(behavior.radius, 12, 140, pillar ? 76 : trap ? 68 : bomb ? 78 : 22), trap, pillar, bomb, exploding:false, fuse:behavior.fuse, element:behavior.element || visual.element || "energy", visual, target:foe, damage:state.damage, hitstun:state.hitstun, freezeTime:behavior.freeze, status:behavior.status, knockback:behavior.knockback, label:state.label };
    (battle.projectiles ||= []).push(p);
  }
}
function applyFreeze(foe, duration, visual) {
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
      foe.blockFlash = .18; foe.guardFlash = .2;
      foe.blockTimer = Math.max(foe.blockTimer, hitstun * RULES.blockstunRatio / 60);
      // Both fighters slide apart, so blocking actually resets the spacing.
      const push = RULES.blockPushback * (state?.superMove ? 1.6 : 1);
      foe.vx = me.dir * push; me.vx = -me.dir * push * .45;
      gainMeter(foe, damage * RULES.meterOnBlocked); gainMeter(me, damage * RULES.meterOnBlocked * .6);
      addHitstop(.02); addShake(.05);
      resetCombo(me);
      if (me.ai) me.ai.blockedStreak++;
      if (foe.ai) foe.ai.respect = Math.max(.15, foe.ai.respect - .06);
      if (foe.guard <= 0 && !(foe.guardImmune > 0)) {
        // Guard crush: a long, fully punishable stun. The pay-off for grinding
        // somebody's defense down instead of just swinging.
        foe.guardBroken = RULES.guardBreakStun; foe.blocking = false; foe.blockTimer = 0;
        foe.hurt = 0; foe.vx = me.dir * 120;
        foe.effects.push({ kind: "impact", t: .5, x: foe.x, y: foe.y, color: "#ffe66d", size: 92 });
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
  if (!continuing) { me.combo.scale = 1; me.combo.damage = 0; }
  me.combo.count = continuing ? me.combo.count + 1 : 1; me.combo.target = foe;
  me.combo.timer = .72 + (Number(me.fighter.config?.combo) || 2) * .055;

  // ── Damage: scales DOWN through a combo so long routes are style, not a kill.
  let finalDamage = damage * me.combo.scale;
  if (counter) finalDamage *= RULES.counterDamage;
  finalDamage = Math.max(.8, finalDamage);
  me.combo.scale = Math.max(RULES.minScale, me.combo.scale * RULES.comboScaleStep);
  me.combo.damage += finalDamage;

  const appliedHitstun = Math.round(hitstun * (counter ? RULES.counterHitstun : 1));
  foe.hp = Math.max(0, foe.hp - finalDamage);
  foe.damageTaken = (foe.damageTaken || 0) + finalDamage;
  foe.hitstunFrames = appliedHitstun; foe.hurt = appliedHitstun / 60; foe.recoveryAttempted = false;
  foe.blocking = false; foe.blockLow = false;
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
  if (knockback.groundBounce && wasGrounded) { foe.grounded = false; foe.vy = -Math.max(360, vertical); }

  // ── Corner ───────────────────────────────────────────────────────────────
  // Getting pinned against a wall should hurt: the body splats back into the
  // attacker with extra hitstun instead of quietly clipping to the boundary.
  const drivenIntoWall = (foe.x <= RULES.wallLeft + 6 && foe.vx < 0) || (foe.x >= RULES.wallRight - 6 && foe.vx > 0);
  if (drivenIntoWall && horizontal > 240) {
    foe.vx = -foe.vx * .55; foe.grounded = false; foe.vy = Math.min(foe.vy, -Math.max(300, vertical * .8));
    foe.hurt += .16; foe.hitstunFrames += 10;
    foe.effects.push({ kind: "impact", t: .4, x: foe.x, y: foe.y, color: "#ffffff", size: 78 });
    addShake(.26); addHitstop(.07);
  } else if (knockback.wallBounce && inCorner(foe)) {
    foe.vx = -foe.vx * .82; foe.grounded = false; foe.vy = -Math.max(260, vertical);
  }

  if (continuing && knockback.carry !== false && !foe.grappledBy) me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, foe.x - me.dir * 96));

  // ── Presentation ─────────────────────────────────────────────────────────
  foe.trail.push({ t: .35, x: foe.x, y: foe.y });
  foe.effects.push({ kind: counter ? "counter" : "impact", t: .38, x: foe.x, y: foe.y, color: counter ? "#ffe66d" : (visual?.color || state?.visual?.color || me.fighter.config?.accent || "#ff6c61"), size: (visual?.size || state?.visual?.size || 48) * (counter ? 1.3 : 1), vfxId: visual?.hitVfx || state?.visual?.hitVfx });
  if (counter) { foe.counterFlash = .3; showBanner("COUNTER", .55, "counter"); }
  // Hitstop scales with how much the hit actually mattered.
  const weight = Math.min(1, finalDamage / 18);
  addHitstop(clampNumber(knockback.hitstop, 0, .3, (state?.superMove ? .16 : .035 + weight * .07) * (counter ? 1.5 : 1)));
  addShake((state?.superMove ? .34 : launcher ? .2 : .09 + weight * .12) * (counter ? 1.35 : 1));
  showComboReadout(me, me.combo.count);

  // ── Juggle state ─────────────────────────────────────────────────────────
  if (launcher && wasGrounded) {
    foe.grounded = false; foe.runJump = false; foe.y = Math.max(420, foe.y - 54); foe.vy = -Math.max(620, vertical);
    foe.airComboHits = 0; foe.juggleGravity = 1;
    foe.juggle = Math.max(6, Math.min(15, move?.juggle || 8));
    me.airComboTarget = foe; me.airComboTimer = 2.25; me.airComboJumpQueued = true; me.combo.timer = Math.max(me.combo.timer, 1.25);
    foe.pendingKnockdown = RULES.hardKnockdown;
  } else if (attackVariant === "air" && !foe.grounded) {
    // Each air hit adds gravity, so juggles end on their own instead of
    // needing an arbitrary hit cap to stop them.
    foe.juggleGravity = Math.min(RULES.maxJuggleGravity, (foe.juggleGravity || 1) + RULES.juggleGravityStep);
    foe.juggle = Math.max(0, (foe.juggle || 0) - Math.max(1, Number(move?.juggle) || 3));
    foe.airComboHits = (foe.airComboHits || 0) + 1;
    foe.vy = -Math.max(180, vertical || 225) / foe.juggleGravity;
    foe.y = Math.max(350, foe.y - 8);
    me.airComboTarget = foe; me.airComboTimer = Math.max(me.airComboTimer, foe.juggle > 0 ? 1.45 : .6); me.combo.timer = Math.max(me.combo.timer, .9);
    const airPush = Math.max(95, horizontal * .72);
    foe.vx = direction ? direction * airPush : me.dir * airPush;
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
  if (me.x <= RULES.wallLeft && me.vx < 0) me.vx *= .4;
  if (me.x >= RULES.wallRight && me.vx > 0) me.vx *= .4;
  me.x = Math.max(RULES.wallLeft, Math.min(RULES.wallRight, me.x));
  me.vx *= me.blocking ? .55 : me.down ? .84 : .82;
  if (!me.grounded) {
    me.y += me.vy * dt;
    me.vy += RULES.gravity * (me.hurt > 0 ? (me.juggleGravity || 1) : 1) * dt;
    if (me.y >= RULES.floorY) {
      me.y = RULES.floorY; me.vy = 0; me.grounded = true; me.runJump = false;
      me.juggle = 0; me.airComboHits = 0; me.airComboTarget = null; me.airComboTimer = 0; me.airComboJumpQueued = false;
      if (me.pendingKnockdown && (me.hurt > 0 || me.guardBroken > 0)) {
        // Landing out of hitstun is a knockdown, not an instant recovery. This
        // is the beat that gives the round its rhythm.
        me.down = { t: 0, duration: me.pendingKnockdown };
        me.hurt = 0; me.hitstunFrames = 0; me.attackState = null; me.attack = 0;
        me.juggleGravity = 1; me.pose = "down";
        me.effects.push({ kind: "impact", t: .34, x: me.x, y: me.y, color: "#cfd8e3", size: 54 });
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
    const close = projectileHitboxConnects(p, previousX);
    if (p.armed === 0 && close) {
      const connected = hit(p.owner, p.target, p.damage, p.label, p.hitstun, false, "ground", p.visual, p.knockback);
      if (connected !== false && p.status === "freeze") applyFreeze(p.target, p.freezeTime, p.visual);
      return false;
    }
    return p.life > 0 && p.x > 35 && p.x < 1245;
  });
}
function finishRound(winner, reason = "K.O.") {
  if (battle.phase === "ko" || battle.phase === "between" || battle.phase === "done") return;
  battle.phase = "ko"; battle.koTimer = reason === "TIME OVER" ? .5 : 1.45; battle.pendingWinner = winner; battle.result = reason;
  battle.hitstop = 0;
  const loser = winner === null ? null : battle.fighters[winner === 0 ? 1 : 0];
  camera.focus = loser;
  if (reason === "K.O.") { addShake(.42); addHitstop(.22); }
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
function drawArenaBackdrop(w, h, time) {
  const horizon = Math.round(h * .68), floor = Math.round(h * .75), center = w / 2;
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
}
function drawGrappleLink(f) {
  const target = f.grappleTarget;
  if (!target || !f.attackState?.grappled) return;
  const phase = f.attackState.grapplePhase, pulse = 1 + Math.sin((battle?.elapsed || 0) * 22) * .08;
  ctx.save(); ctx.globalAlpha = phase === "hold" ? .95 : .7; ctx.lineCap="round";
  ctx.strokeStyle = f.attackState.visual?.color || "#ff9f43"; ctx.lineWidth = 7 * pulse; ctx.setLineDash([12, 7]);
  ctx.beginPath(); ctx.moveTo(f.x + f.dir * 36, f.y - 112); ctx.lineTo(target.x - f.dir * 29, target.y - 107); ctx.stroke();
  ctx.setLineDash([]); ctx.strokeStyle = f.attackState.visual?.secondary || "#fff2c2"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(f.x + f.dir * 36, f.y - 112); ctx.lineTo(target.x - f.dir * 29, target.y - 107); ctx.stroke();
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
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= (active ? .68 : .2) * intensity; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = active ? (state.visual?.secondary || "#ffffff") : (state.visual?.color || "#ffffff");
  ctx.lineWidth = Math.max(2.5, size / 20) * (active ? 1.25 : .8);
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  if (/rapid|ora|barrage|flurry/.test(gesture) || state.rapidJab) {
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * size * .14, reach = size * (.52 + (i % 2) * .18);
      line(-size * .3, spread, reach, spread - size * .08);
    }
    ctx.beginPath(); ctx.arc(size * .28, 0, size * .54 * pulse, -1.2, 1.2); ctx.stroke();
  } else if (/dive/.test(gesture) || state.diveKick) {
    line(-size * .24, -size * .3, size * .62, size * .46);
    line(size * .05, -size * .05, size * .82, size * .64);
    ctx.beginPath(); ctx.arc(size * .5, size * .42, size * .42 * pulse, -2.4, .35); ctx.stroke();
  } else if (/hook|elbow/.test(gesture)) {
    ctx.beginPath(); ctx.arc(size * .08, 0, size * .74 * pulse, -1.72, .55); ctx.stroke();
    line(size * .38, -size * .2, size * .7, size * .06);
  } else if (/knee|roundhouse|sweep/.test(gesture)) {
    ctx.beginPath(); ctx.arc(size * .05, size * .1, size * .82 * pulse, -.65, .95); ctx.stroke();
    line(size * .12, size * .48, size * .68, size * .26);
  } else if (/overhead|slam/.test(gesture)) {
    line(-size * .06, -size * .7, size * .14, size * .42);
    line(size * .14, size * .42, -size * .02, size * .2);
    line(size * .14, size * .42, size * .3, size * .2);
  } else if (/spin|whirl/.test(gesture)) {
    ctx.beginPath(); ctx.arc(0, 0, size * .64 * pulse, -2.55, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, size * .86, -.2, 2.1); ctx.stroke();
  } else if (/cast|burst|charge|rune/.test(gesture)) {
    ctx.beginPath(); ctx.arc(size * .12, 0, size * .42 * pulse, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = time * 2.4 + i * Math.PI / 2; line(size * .46 + Math.cos(a) * 7, Math.sin(a) * 7, size * .72 + Math.cos(a) * 13, Math.sin(a) * 13); }
  } else {
    const reach = size * (.64 + (active ? .08 : 0));
    for (let i = 0; i < 3; i++) { const yy = (i - 1) * size * .13; line(-size * (.34 - i * .04), yy + size * .1, reach - i * size * .08, yy - size * .02); }
  }
  ctx.restore();
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
  if (runVisualScript(state, x, y, size, active, Math.min(1, Math.max(0, state.t / Math.max(.001, state.duration))))) { ctx.restore(); return; }
  drawAttackPersonality(state, x, y, size);
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
    ctx.strokeStyle = v.color; ctx.lineWidth = Math.max(4, size / 15); ctx.setLineDash(phase === "hold" ? [9, 5] : []);
    ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.bezierCurveTo(x + size * .18, y - 28, x + reach * .62, y + 28, x + reach, y - 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = v.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + reach, y - 4, phase === "hold" ? 15 : 10, 0, Math.PI * 2); ctx.stroke();
    if (phase === "hold") { ctx.beginPath(); ctx.arc(x + reach, y - 4, 24 + Math.sin((battle?.elapsed || 0) * 18) * 3, 0, Math.PI * 2); ctx.stroke(); }
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
  if (!p.trap && !p.pillar && !p.bomb && p.vx) { ctx.strokeStyle=v.color; ctx.globalAlpha=.22; ctx.lineWidth=Math.max(5,size*.55); ctx.beginPath();ctx.moveTo(p.vx>0?-size*2:size*2,0);ctx.lineTo(0,0);ctx.stroke();ctx.globalAlpha=1; }
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
function drawImpactFx(f) { for (const effect of f.effects || []) { const progress = effect.t / .38; ctx.save(); ctx.translate(effect.x, effect.y - 82); ctx.globalAlpha = progress; if (effect.vfxId) drawVfxAsset(effect.vfxId, (1 - progress) * 30, 0, 0, Math.max(58, effect.size * 2.05), 1); ctx.strokeStyle = effect.color; ctx.lineWidth = 5; if (effect.kind === "grapple-lock") { ctx.setLineDash([8,5]); ctx.beginPath();ctx.arc(0,0,effect.size*(1.1-progress*.2),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); } else if (effect.kind === "freeze") { ctx.beginPath();ctx.arc(0,0,effect.size*(1.3-progress*.2),0,Math.PI*2);ctx.stroke(); } else if (effect.kind === "recovery") { ctx.globalAlpha = Math.min(1, progress * 1.8); ctx.setLineDash([8, 6]); ctx.strokeStyle = effect.color; ctx.beginPath(); ctx.arc(0, 0, effect.size * (1.05 - progress * .25), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); } else if (!effect.vfxId) { for (let i=0;i<8;i++) { const a=i*Math.PI/4; ctx.beginPath();ctx.moveTo(Math.cos(a)*12,Math.sin(a)*12);ctx.lineTo(Math.cos(a)*effect.size*(1.1-progress*.35),Math.sin(a)*effect.size*(1.1-progress*.35));ctx.stroke(); } ctx.beginPath();ctx.arc(0,0,effect.size*.34*(1.4-progress*.3),0,Math.PI*2);ctx.stroke(); } ctx.restore(); } }
function drawFreezeFx(f) { if (f.frozen <= 0) return; const pulse = 1 + Math.sin((battle?.elapsed || 0) * 12) * .05; ctx.save(); ctx.translate(f.x, f.y - 92); ctx.globalAlpha = .78; ctx.strokeStyle = "#bdf6ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, Math.PI * 2); ctx.stroke(); for (let i=0;i<8;i++) { const a=i*Math.PI/4; const r=48 + (i%2)*15; ctx.beginPath(); ctx.moveTo(Math.cos(a)*20,Math.sin(a)*20); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke(); } ctx.fillStyle="#eefcff"; ctx.font="25px serif"; ctx.textAlign="center"; ctx.fillText("❄",0,-70); ctx.restore(); }
function drawFighter(f) { const c=f.fighter.config||{}, flip=f.dir, crouching=f.crouch>0 || f.attackState?.variant==="crouch", attacking=f.pose.includes("attack") || f.pose==="cast" || f.pose.includes("grapple"), blocking=f.blocking || f.blockFlash>0, running=f.pose==="run"; drawImpactFx(f); drawFreezeFx(f); drawGrappleLink(f); const at=animationTransform(f,f.attackState); ctx.save();ctx.translate(f.x + at.offsetX, f.y + at.offsetY);ctx.scale(flip,1);ctx.scale(1.28,1.28);ctx.rotate(at.rotation);ctx.transform(1,at.skewY,at.skewX,1,0,0);ctx.scale(at.scaleX,at.scaleY);ctx.scale(1,crouching ? .76 : 1); if(spriteSheet){ const crop=f.fighter.example ? {x:225,y:0,w:300,h:415} : {x:905,y:0,w:375,h:415}; ctx.imageSmoothingEnabled=true; ctx.globalAlpha=f.hurt > 0 ? .45 : f.invuln > 0 ? .68 + Math.sin((battle?.elapsed||0)*46)*.16 : 1; ctx.drawImage(spriteSheet,crop.x,crop.y,crop.w,crop.h,-74,-190,148,190); ctx.globalAlpha=1; if(attacking){ctx.font="26px serif";ctx.fillText((c.emojis||["👊"])[f.attackState?.variant==="air"?2:0]||"👊",45,-95);} drawMoveVisual(f,f.attackState); drawCombatStateFx(f,blocking,running); ctx.restore(); return; } if(f.hurt>0){ctx.globalAlpha=.32;ctx.fillStyle="#fff";ctx.fillRect(-50,-155,100,145);ctx.globalAlpha=1;} for(const t of f.trail){ctx.globalAlpha=t.t*2;ctx.fillStyle=c.accent||"#ff5b52";ctx.beginPath();ctx.arc(t.x-f.x,t.y-f.y-75,18,0,7);ctx.fill();}ctx.globalAlpha=f.invuln > 0 ? .68 + Math.sin((battle?.elapsed||0)*46)*.16 : 1;
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
  const cropToData = (x,y,w,h) => { const crop=document.createElement("canvas"); crop.width=w; crop.height=h; crop.getContext("2d").drawImage(off,x,y,w,h,0,0,w,h); return crop.toDataURL("image/png"); };
  spriteThumbs.kung=cropToData(225,0,300,415); spriteThumbs.cyber=cropToData(905,0,375,415); renderRoster();
}
function loop(t){const dt=Math.min(.05,(t-lastFrame)/1000||0);lastFrame=t;fightTick(dt);requestAnimationFrame(loop);} requestAnimationFrame(loop);requestAnimationFrame(draw); loadRoster();loadSprites();

// dev inspection hook
window.__sim = (seconds, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) fightTick(dt); };
window.__forge = () => battle && ({ phase: battle.phase, clock: battle.clock, hitstop: battle.hitstop, banner: battle.bannerTimer, f: battle.fighters.map(f => ({ hp: +f.hp.toFixed(1), pose: f.pose, cd: +f.cd.toFixed(2), hurt: +f.hurt.toFixed(2), down: f.down && +f.down.t.toFixed(2), gb: +f.guardBroken.toFixed(2), guard: +f.guard.toFixed(0), meter: +f.meter.toFixed(0), blocking: f.blocking, bt: +f.blockTimer.toFixed(2), atk: f.attackState?.label, x: +f.x.toFixed(0), invuln: +f.invuln.toFixed(2), intent: f.ai.intent, arche: f.ai.archetype })) });
