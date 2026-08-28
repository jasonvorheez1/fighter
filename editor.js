import { VFX_ENTRIES, VFX_IDS, VFX_DEFAULTS, MAIN_VFX_ENTRIES, HIT_VFX_ENTRIES } from "./vfx-data.js";
import { parseAiJson, sanitizeFighter, buildFighterModule } from "./fighter-code.js";
import { WEAPON_ENTRIES, WEAPON_IDS, WEAPON_BY_ID, WEAPON_MOTIONS, WEAPON_DEFAULT_MOTION, findWeapon } from "./weapon-data.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let editingId = params.get("id");
let currentFighter = null;
let portraitUrl = null;
let activeAssetRequest = null;

const types = ["melee", "projectile", "combo", "trap", "grapple", "freeze", "teleport", "pillar", "bomb", "gun"];
const effects = ["arc", "orb", "slashes", "rune", "beam", "burst", "grapple", "freeze", "teleport", "pillar"];
const elements = ["fire", "ice", "stone", "lightning", "shadow", "energy"];
const motions = ["none", "projectile", "trap", "barrier", "dash", "dash-attack", "slide", "dive-kick", "rapid-jab", "charge", "bomb", "pull", "grapple", "teleport", "pillar", "gun", "wall-slam", "spin", "multi-uppercut", "fly-in", "ground-pound"];
const barrierShapes = ["wall", "tree", "shield", "ice", "rock", "crystal"];
const patterns = ["straight", "arc", "fan", "boomerang", "orbit", "rain"];
const styles = ["strike", "kick", "spin", "grapple", "slam", "dash", "cast", "backflip", "frontflip", "tackle"];
const windups = ["none", "coil", "crouch", "reach", "hop", "spin"];
const contacts = ["fist", "foot", "grab", "hook", "body", "energy", "slash"];
const finishes = ["recoil", "follow-through", "throw", "slam", "spin", "snap", "hold"];
// The weapon library, as a picker. "" means the fighter is unarmed for this
// move, which is the default for a punch or a kick.
const weaponIds = ["", ...WEAPON_ENTRIES.map((weapon) => weapon.id)];
const weaponLabels = Object.fromEntries([["", "None (unarmed)"], ...WEAPON_ENTRIES.map((weapon) => [weapon.id, `${weapon.label} \u00b7 ${weapon.weaponClass} \u00b7 ${weapon.grip}`])]);
const weaponMotionIds = ["", ...WEAPON_MOTIONS];
const weaponMotionLabels = { "": "Auto (by weapon class)" };
const weaponMotionOffhandLabels = { "": "Mirror the main hand" };
const roles = ["auto", "light-punch", "medium-punch", "heavy-punch", "light-kick", "medium-kick", "heavy-kick", "light-crouch-kick", "heavy-crouch-kick", "launcher", "air-light-punch", "air-medium-punch", "air-heavy-punch", "air-light-kick", "air-medium-kick", "air-heavy-kick", "air-special", "special"];

const frameDefaults = {
  melee: [7, 2, 18, 14], projectile: [18, 3, 30, 10], combo: [5, 3, 24, 18], trap: [10, 3, 22, 16],
  grapple: [9, 12, 28, 24], freeze: [14, 3, 28, 16], teleport: [5, 3, 24, 18], pillar: [16, 4, 30, 20], bomb: [14, 3, 32, 18], gun: [10, 2, 26, 11]
};
const visualDefaults = {
  melee: { effect:"arc", color:"#f7d35b", secondary:"#ffffff", size:58, emoji:"✦" }, projectile: { effect:"orb", color:"#56d9ff", secondary:"#d8ff3e", size:22, emoji:"✦" },
  combo: { effect:"slashes", color:"#ff6c61", secondary:"#ffd05d", size:62, emoji:"✧" }, trap: { effect:"rune", color:"#bd8cff", secondary:"#56d9ff", size:72, emoji:"◇" },
  grapple: { effect:"grapple", color:"#ff9f43", secondary:"#fff2c2", size:68, emoji:"⛓", element:"energy" }, freeze: { effect:"freeze", color:"#73e7ff", secondary:"#eefcff", size:30, emoji:"❄", element:"ice" },
  teleport: { effect:"teleport", color:"#d28cff", secondary:"#56d9ff", size:74, emoji:"◇", element:"shadow" }, pillar: { effect:"pillar", color:"#ff7043", secondary:"#ffd05d", size:86, emoji:"▲", element:"fire" }, bomb: { effect:"burst", color:"#ff7043", secondary:"#ffd05d", size:62, emoji:"💣", element:"fire" }, gun: { effect:"orb", color:"#ffe66d", secondary:"#ffffff", size:16, emoji:"•", element:"energy" }
};
const behaviorDefaults = {
  melee: { motion:"none", speed:0, radius:0, shots:1 }, projectile: { motion:"projectile", pattern:"straight", speed:390, radius:22, shots:1 }, combo: { motion:"none", speed:0, radius:0, shots:1 },
  trap: { motion:"trap", speed:0, radius:68, shots:1, lifetime:1.7 }, grapple: { motion:"grapple", speed:300, radius:0, shots:1, hold:.2, finisher:"slam" },
  freeze: { motion:"projectile", pattern:"straight", speed:360, radius:28, shots:1, freeze:.95, status:"freeze" }, teleport: { motion:"teleport", speed:0, radius:0, shots:1, offset:92 },
  pillar: { motion:"pillar", speed:0, radius:76, shots:1, lifetime:1.45, status:"none", element:"fire" }, bomb: { motion:"bomb", pattern:"straight", speed:330, radius:78, shots:1, fuse:.62, dashDistance:96, status:"none", element:"fire" }, gun: { motion:"gun", pattern:"straight", speed:1150, radius:13, shots:1 }
};
const animationDefaults = {
  melee: { style:"strike", windup:"coil", contact:"snap", finish:"recoil", intensity:.9 }, projectile: { style:"cast", windup:"coil", contact:"energy", finish:"recoil", intensity:.9 },
  combo: { style:"spin", windup:"coil", contact:"slash", finish:"spin", intensity:1 }, trap: { style:"cast", windup:"crouch", contact:"energy", finish:"recoil", intensity:.8 },
  grapple: { style:"grapple", windup:"reach", contact:"grab", finish:"slam", intensity:1.15 }, freeze: { style:"cast", windup:"coil", contact:"energy", finish:"recoil", intensity:.9 },
  teleport: { style:"dash", windup:"hop", contact:"body", finish:"snap", intensity:1.1 }, pillar: { style:"cast", windup:"crouch", contact:"energy", finish:"slam", intensity:1 }, bomb: { style:"cast", windup:"crouch", contact:"energy", finish:"slam", intensity:1.1 }, gun: { style:"cast", windup:"reach", contact:"energy", finish:"snap", intensity:.8 }
};

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;"}[c])); }
function number(value, min, max, fallback) { return Math.min(max, Math.max(min, Number(value) || fallback)); }
function freeTransform(input = {}) {
  const raw = input && typeof input === "object" ? input : {}, rotation = raw.rotation && typeof raw.rotation === "object" ? raw.rotation : {};
  return { rotateX:number(raw.rotateX ?? raw.rotationX ?? rotation.x, -360, 360, 0), rotateY:number(raw.rotateY ?? raw.rotationY ?? rotation.y, -360, 360, 0), rotateZ:number(raw.rotateZ ?? raw.rotationZ ?? rotation.z, -360, 360, 0), spin:number(raw.spin, -720, 720, 0), spinSpeed:number(raw.spinSpeed, -12, 12, 0), scaleX:number(raw.scaleX, .35, 2.4, 1), scaleY:number(raw.scaleY, .35, 2.4, 1), skewX:number(raw.skewX, -.95, .95, 0), skewY:number(raw.skewY, -.95, .95, 0), offsetX:number(raw.offsetX, -180, 180, 0), offsetY:number(raw.offsetY, -180, 180, 0), orbit:number(raw.orbit, -1, 1, 0), pulse:number(raw.pulse, 0, 1, 0) };
}
function knockback(input, type, move = {}) {
  const raw = input && typeof input === "object" ? input : {}, defaults = { horizontal:type === "combo" ? 150 : 180, vertical:0, angle:0, direction:"away", hitstop:.045 };
  const likelyLauncher = move.launcher === true || move.role === "launcher" || /launch|uppercut|rising|breaker|lift|anti.?air/i.test(String(move.name || ""));
  return { horizontal:number(raw.horizontal, 0, 900, defaults.horizontal), vertical:number(raw.vertical, 0, 900, likelyLauncher ? 620 : defaults.vertical), power:number(raw.power, 0, 900, 0), angle:number(raw.angle, -80, 80, defaults.angle), direction:["away", "toward", "up", "down"].includes(String(raw.direction || "").toLowerCase()) ? String(raw.direction).toLowerCase() : "away", hitstop:number(raw.hitstop, 0, .2, defaults.hitstop), carry:raw.carry !== false, wallBounce:raw.wallBounce === true, groundBounce:raw.groundBounce === true };
}
function optionList(values, selected, labels = {}) { return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labels[value] || value)}</option>`).join(""); }
function parseConfig(value) { try { return typeof value === "string" ? JSON.parse(value) : (value || {}); } catch { return {}; } }
function safeEmojis(value) { const found = String(value || "").match(/\p{Extended_Pictographic}/gu) || []; return (found.length ? found : ["👊", "⚡", "💥"]).slice(0, 6); }
function comboLabel(value) { return ["LOW", "MODEST", "BALANCED", "STRONG", "WILD"][Number(value) - 1] || "BALANCED"; }
function smartnessLabel(v) { return ["SLOW", "NOVICE", "AVERAGE", "SHARP", "ELITE"][Number(v) - 1] || "AVERAGE"; }
function aggressionLabel(v) { return ["PASSIVE", "CAUTIOUS", "NEUTRAL", "FORWARD", "RELENTLESS"][Number(v) - 1] || "NEUTRAL"; }
function defenseLabel(v) { return ["FRAGILE", "LIGHT", "BALANCED", "TOUGH", "IRONCLAD"][Number(v) - 1] || "BALANCED"; }
function speedLabel(v) { return ["SLUGGISH", "SLOW", "AVERAGE", "SWIFT", "BLAZING"][Number(v) - 1] || "AVERAGE"; }
function rangeLabel(v) { return ["CLOSE", "SHORT", "NORMAL", "LONG", "HUGE"][Number(v) - 1] || "NORMAL"; }
// Older saved fighters have no move.category. A normal is a fast, close-range,
// no-frills button; anything ranged, a grab, a launcher, or slow is a special.
function inferCategory(move) {
  if (move.category === "normal" || move.category === "special") return move.category;
  const type = String(move.type || "melee");
  const rangedType = ["projectile", "trap", "freeze", "pillar", "bomb", "gun"].includes(type);
  const startup = Number(move.startup) || 0;
  if (rangedType || type === "grapple" || move.behavior?.motion === "barrier" || move.launcher === true || startup > 10) return "special";
  return "normal";
}
const CATEGORY_CAP = { normal: 6, special: 4 };
const BASIC_BUTTONS = ["Light Punch", "Medium Punch", "Heavy Punch", "Light Kick", "Medium Kick", "Heavy Kick"];
const CATEGORY_LABEL = { normal: "NORMAL", special: "SPECIAL" };
const vfxLabels = Object.fromEntries(VFX_ENTRIES.map((entry) => [entry.id, `${entry.name} · ${entry.frames.length}F`]));
const mainVfxIds = MAIN_VFX_ENTRIES.map((entry) => entry.id);
const hitVfxIds = HIT_VFX_ENTRIES.map((entry) => entry.id);
const moveVfxDefaults = Object.fromEntries(Object.entries(VFX_DEFAULTS).map(([type, value]) => [type, value]));

function normalizeMove(move = {}, fighterConfig = {}, depth = 0) {
  const type = types.includes(move.type) ? move.type : "melee";
  const visual = { ...visualDefaults[type], ...(move.visual || {}) };
  const behavior = { ...behaviorDefaults[type], ...(move.behavior || {}) };
  const animation = { ...animationDefaults[type], ...(move.animation || {}) };
  const frames = frameDefaults[type];
  visual.effect = effects.includes(visual.effect) ? visual.effect : visualDefaults[type].effect;
  visual.element = elements.includes(visual.element) ? visual.element : (behavior.element || visualDefaults[type].element || "energy");
  visual.color = /^#[0-9a-f]{6}$/i.test(visual.color) ? visual.color : (fighterConfig.accent || visualDefaults[type].color);
  visual.secondary = /^#[0-9a-f]{6}$/i.test(visual.secondary) ? visual.secondary : (fighterConfig.color || visualDefaults[type].secondary);
  visual.size = number(visual.size, 12, 130, visualDefaults[type].size);
  visual.spriteUrl = /^https?:\/\/[^\s"'<>]+$/i.test(String(visual.spriteUrl || "")) ? String(visual.spriteUrl).slice(0, 600) : "";
  visual.soundUrl = /^https?:\/\/[^\s"'<>]+$/i.test(String(visual.soundUrl || "")) ? String(visual.soundUrl).slice(0, 600) : "";
  const vfxDefault = moveVfxDefaults[type] || VFX_DEFAULTS.melee;
  visual.mainVfx = VFX_IDS.has(visual.mainVfx) ? visual.mainVfx : vfxDefault.mainVfx;
  visual.hitVfx = VFX_IDS.has(visual.hitVfx) ? visual.hitVfx : vfxDefault.hitVfx;
  visual.vfxFps = number(visual.vfxFps, 6, 30, 18);
  behavior.motion = motions.includes(behavior.motion) ? behavior.motion : behaviorDefaults[type].motion;
  behavior.speed = number(behavior.speed, 0, 700, behaviorDefaults[type].speed);
  behavior.radius = number(behavior.radius, 0, 140, behaviorDefaults[type].radius);
  behavior.shots = Math.round(number(behavior.shots, 1, 3, behaviorDefaults[type].shots));
  behavior.lifetime = number(behavior.lifetime, .35, 3, behaviorDefaults[type].lifetime || 1.2);
  behavior.barrierShape = barrierShapes.includes(String(behavior.barrierShape || behavior.shape || "").toLowerCase()) ? String(behavior.barrierShape || behavior.shape).toLowerCase() : "wall";
  behavior.barrierWidth = number(behavior.barrierWidth ?? behavior.width, 36, 260, 132);
  behavior.barrierHeight = number(behavior.barrierHeight ?? behavior.height, 70, 310, 214);
  behavior.barrierLifetime = number(behavior.barrierLifetime ?? behavior.duration, .5, 6, 2.8);
  behavior.barrierHits = Math.round(number(behavior.barrierHits ?? behavior.durability, 1, 8, 3));
  behavior.barrierOffset = number(behavior.barrierOffset, 40, 260, 118);
  behavior.hold = number(behavior.hold, .08, 1.2, behaviorDefaults[type].hold || .2);
  behavior.freeze = number(behavior.freeze, .25, 2.5, behaviorDefaults[type].freeze || .95);
  behavior.offset = number(behavior.offset, 40, 180, behaviorDefaults[type].offset || 92);
  behavior.charge = number(behavior.charge, .12, 2.5, behaviorDefaults[type].charge || .5);
  behavior.chargePower = number(behavior.chargePower, .7, 2.5, behaviorDefaults[type].chargePower || 1.35);
  behavior.dashDistance = number(behavior.dashDistance, 30, 300, behaviorDefaults[type].dashDistance || 110);
  behavior.fuse = number(behavior.fuse, .18, 2.5, behaviorDefaults[type].fuse || .62);
  if (Number(behavior.hits) > 1) behavior.hits = Math.round(number(behavior.hits, 2, 10, 4));
  if (behavior.hitInterval != null) behavior.hitInterval = number(behavior.hitInterval, .04, .2, .07);
  behavior.pattern = patterns.includes(behavior.pattern) ? behavior.pattern : (behaviorDefaults[type].pattern || "straight");
  behavior.gravity = number(behavior.gravity, -1600, 1600, 0);
  behavior.homing = number(behavior.homing, 0, 1, 0);
  behavior.spread = number(behavior.spread, -75, 75, behavior.pattern === "fan" ? 22 : 0);
  behavior.bounces = Math.round(number(behavior.bounces, 0, 3, 0));
  behavior.orbitRadius = number(behavior.orbitRadius, 24, 220, 84);
  behavior.orbitSpeed = number(behavior.orbitSpeed, -12, 12, 3.5);
  behavior.returnDelay = number(behavior.returnDelay, .15, 1.5, .62);
  const moveName = String(move.name || "").toLowerCase();
  // Name heuristics only fill in for a move that never declared a motion. They
  // must not overrule an explicit one, and they match on whole words - otherwise
  // "Wall Crusher" reads as a "rush" and silently becomes a rapid jab.
  const declaredMotion = motions.includes(String(move.behavior?.motion || "").toLowerCase()) && move.behavior.motion !== "none" ? String(move.behavior.motion).toLowerCase() : null;
  const rapidJab = behavior.motion === "rapid-jab" || Number(behavior.rapidHits) > 1
    || (!declaredMotion && /\b(?:rapid|ora|barrage|flurry|rush)\b/.test(moveName) && /\b(?:jab|jabs|punch|punches|fist|fists|barrage|rush)\b/.test(moveName));
  const diveKick = behavior.motion === "dive-kick" || (!declaredMotion && /\bdive.?kick\b|\bmeteor kick\b|\bstomp kick\b/.test(moveName));
  if (rapidJab) behavior.motion = "rapid-jab";
  if (diveKick) behavior.motion = "dive-kick";
  if (!declaredMotion) {
    if (/\b(?:gun|pistol|revolver|rifle|blaster|magnum|bullet|shotgun)\b/.test(moveName)) behavior.motion = "gun";
    else if (/\b(?:barrier|barricade|force field|shield wall|shield dome|ice wall|stone wall|wooden wall|summon(?:ed)? tree|tree wall|tree)\b/.test(moveName)) behavior.motion = "barrier";
    else if (/wall ?slam|wall ?punch|into the wall/.test(moveName)) behavior.motion = "wall-slam";
    else if (/\b(?:spin|whirl|cyclone|tornado|twister)\b/.test(moveName)) behavior.motion = "spin";
    else if (/shoryu|rising (?:fist|dragon|fury)|multi.?upper|triple.?upper/.test(moveName)) behavior.motion = "multi-uppercut";
    else if (/fly.?in|\b(?:soar|swoop|comet)\b|air ?rush/.test(moveName)) behavior.motion = "fly-in";
    else if (/ground ?pound|earth ?shaker|\bseismic\b|meteor ?slam/.test(moveName)) behavior.motion = "ground-pound";
    else if (/\bslide\b|skid|low.?dash|ground.?rush/.test(moveName)) behavior.motion = "slide";
  }
  behavior.rapidHits = rapidJab ? Math.round(number(behavior.rapidHits, 2, 8, 5)) : 1;
  behavior.rapidInterval = number(behavior.rapidInterval, .045, .18, .075);
  behavior.status = ["none", "freeze"].includes(behavior.status) ? behavior.status : (type === "freeze" ? "freeze" : "none");
  behavior.element = elements.includes(behavior.element) ? behavior.element : visual.element;
  // A move may equip a weapon from the library. An unknown id is dropped
  // rather than left to render as a broken image.
  visual.weapon = WEAPON_IDS.has(String(visual.weapon || "")) ? String(visual.weapon) : "";
  // A second weapon in the off hand only means something next to a main hand.
  visual.weaponOffhand = visual.weapon && WEAPON_IDS.has(String(visual.weaponOffhand || "")) ? String(visual.weaponOffhand) : "";
  visual.weaponScale = number(visual.weaponScale, .35, 1.8, 1);
  behavior.weaponMotionOffhand = WEAPON_MOTIONS.includes(String(behavior.weaponMotionOffhand || "").toLowerCase()) ? String(behavior.weaponMotionOffhand).toLowerCase() : "";
  behavior.weaponMotion = WEAPON_MOTIONS.includes(String(behavior.weaponMotion || "").toLowerCase())
    ? String(behavior.weaponMotion).toLowerCase()
    : (visual.weapon ? WEAPON_DEFAULT_MOTION[WEAPON_BY_ID.get(visual.weapon).weaponClass] || "swipe" : "");
  behavior.knockback = knockback(behavior.knockback, type, move);
  animation.style = styles.includes(animation.style) ? animation.style : animationDefaults[type].style;
  animation.windup = windups.includes(animation.windup) ? animation.windup : animationDefaults[type].windup;
  animation.contact = contacts.includes(animation.contact) ? animation.contact : animationDefaults[type].contact;
  animation.finish = finishes.includes(animation.finish) ? animation.finish : animationDefaults[type].finish;
  animation.intensity = number(animation.intensity, .45, 1.6, animationDefaults[type].intensity);
  animation.puppet = animation.puppet !== false;
  const puppetAmount = Number(animation.puppetAmount);
  animation.puppetAmount = Number.isFinite(puppetAmount) ? Math.min(1, Math.max(0, puppetAmount)) : .72;
  animation.gesture = String(animation.gesture || ({ melee:"palm", projectile:"cast", combo:"spin", grapple:"clinch", freeze:"cast", teleport:"blink", pillar:"slam", trap:"rune", bomb:"bomb" }[type] || "strike")).toLowerCase().slice(0, 24);
  animation.transform = freeTransform(animation.transform);
  const combosInto = move.variant === "heavy" ? [] : (Array.isArray(move.combosInto) ? move.combosInto : String(move.combosInto || "").split(","))
    .map(name => String(name || "").trim().slice(0, 28)).filter(Boolean).slice(0, 4);
  return {
    ...move, name: String(move.name || "Unnamed Move").slice(0, 28), type,
    role: roles.includes(move.role) ? move.role : "auto", variant: ["light", "medium", "heavy", "all"].includes(move.variant) ? move.variant : "medium",
    launcher: move.launcher === true || move.role === "launcher", crouch: move.crouch === true, air: move.air === true || diveKick, startup: number(move.startup, 1, 60, frames[0]), active: number(move.active, 1, 20, frames[1]),
    endlag: number(move.endlag, 1, 90, frames[2]), hitstun: number(move.hitstun, 1, 60, frames[3]), juggle: Math.round(number(move.juggle, 1, 15, type === "combo" ? 3 : 4)),
    reach: Number(move.reach) > 0 ? number(move.reach, 70, 520, 165) : (visual.weapon ? WEAPON_BY_ID.get(visual.weapon).reach : undefined),
    // A follow-up is a full move that only exists as this move's sequel. It is
    // normalized the same way, one level deep, so it can never recurse.
    followUp: String(move.variant || "").toLowerCase() !== "heavy" && move.followUp && depth < 1 ? normalizeMove({ ...move.followUp, followUp: null }, fighterConfig, depth + 1) : null,
    followUpWindow: move.followUp && depth < 1 ? number(move.followUpWindow, .18, 1.2, .55) : 0,
    combosInto,
    visual, behavior, animation
  };
}

function field(label, key, value, type = "text", extra = "") {
  const input = type === "checkbox" ? `<input data-field="${key}" type="checkbox" ${value ? "checked" : ""} ${extra}>` : `<input data-field="${key}" type="${type}" value="${escapeHtml(value)}" ${extra}>`;
  return `<label>${label}${input}</label>`;
}
function selectField(label, key, values, value, extra = "", labels = {}) { return `<label>${label}<select data-field="${key}" ${extra}>${optionList(values, value, labels)}</select></label>`; }

function moveSummary(row) {
  const value = (key) => row.querySelector(`[data-field="${key}"]`)?.value || "";
  const type = value("type");
  const motion = value("behavior.motion");
  const pattern = value("behavior.pattern");
  const frames = `${value("startup")} / ${value("active")} / ${value("endlag")}F`;
  const behavior = motion && motion !== "none" ? motion : (pattern && pattern !== "straight" ? pattern : "close-range");
  return `${type || "melee"} · ${behavior} · ${frames}`;
}
function refreshMoveCard(row) {
  const summary = row.querySelector(".move-summary");
  if (summary) summary.textContent = moveSummary(row);
}
// Compile the move's canvas program right here in the editor so a broken
// script says so, instead of silently disappearing behind the fallback in a
// match hours later.
function refreshScriptStatus(row) {
  const status = row.querySelector(".script-status"), input = row.querySelector('[data-field="visual.script"]');
  if (!status || !input) return;
  if (!String(input.value).trim()) { status.textContent = "NO CUSTOM PROGRAM · GENERATED EFFECT WILL BE USED"; status.dataset.state = "empty"; return; }
  const check = validateVisualScript(input.value);
  status.textContent = check.ok ? "PROGRAM COMPILES · READY" : `PROGRAM REJECTED · ${check.reason.toUpperCase()}`;
  status.dataset.state = check.ok ? "ok" : "bad";
}
function refreshCustomSpriteStatus(row) {
  const status = row.querySelector(".custom-sprite-status"), input = row.querySelector('[data-field="visual.spriteUrl"]');
  if (!status) return;
  status.textContent = input?.value ? "CUSTOM SPRITE ATTACHED · EMOJI FALLBACK REPLACED" : "NO CUSTOM SPRITE · EMOJI FALLBACK READY";
  status.classList.toggle("attached", Boolean(input?.value));
}
function refreshMoveSoundStatus(row) {
  const status = row.querySelector(".move-sfx-status"), clear = row.querySelector(".clear-move-sfx"), input = row.querySelector('[data-field="visual.soundUrl"]');
  if (!status) return;
  const attached = Boolean(input?.value);
  status.textContent = attached ? "CUSTOM SFX ATTACHED · COMPACT 16 KHZ MONO" : "NO CUSTOM SFX · ARENA SOUND BANK WILL PLAY";
  status.classList.toggle("attached", attached);
  if (clear) clear.hidden = !attached;
}

// The source clip is reduced in-browser to a short mono WAV (~60 KB). Only
// the public blob URL joins the fighter blueprint; audio bytes never touch D1.
const SFX_SAMPLE_RATE = 16000;
const SFX_MAX_SECONDS = 1.85;
const SFX_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
function wavFromMonoBuffer(buffer) {
  const samples = buffer.getChannelData(0), bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); writeText(8, "WAVE"); writeText(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, SFX_SAMPLE_RATE, true);
  view.setUint32(28, SFX_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeText(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, samples[index])) * 0x7fff), true);
  return bytes;
}
async function compressMoveSfx(file) {
  if (!file?.type?.startsWith("audio/")) throw new Error("Choose an audio file for the move effect.");
  if (file.size > SFX_MAX_UPLOAD_BYTES) throw new Error("That sound is too large to process (12 MB maximum before compression).");
  const Decoder = window.AudioContext || window.webkitAudioContext;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Decoder || !Offline) throw new Error("This browser cannot compress audio effects.");
  let decoder;
  try {
    decoder = new Decoder();
    const decoded = await decoder.decodeAudioData(await file.arrayBuffer());
    const frames = Math.max(1, Math.floor(Math.min(decoded.duration, SFX_MAX_SECONDS) * SFX_SAMPLE_RATE));
    const offline = new Offline(1, frames, SFX_SAMPLE_RATE);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(0, 0, Math.min(decoded.duration, SFX_MAX_SECONDS));
    return new Blob([wavFromMonoBuffer(await offline.startRendering())], { type: "audio/wav" });
  } finally { decoder?.close?.().catch?.(() => {}); }
}
async function attachMoveSfx(row, file) {
  const picker = row.querySelector(".move-sfx-upload"), status = row.querySelector(".move-sfx-status"), urlInput = row.querySelector('[data-field="visual.soundUrl"]');
  if (!file || !picker || !status || !urlInput) return;
  picker.disabled = true; status.textContent = "COMPRESSING EFFECT…";
  try {
    const compact = await compressMoveSfx(file);
    status.textContent = `UPLOADING ${(compact.size / 1024).toFixed(0)} KB EFFECT…`;
    const response = await fetch("/api/fighter-sfx", { method: "POST", headers: { "content-type": "audio/wav" }, body: compact });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) throw new Error(body.error || "Could not upload the compressed sound effect.");
    urlInput.value = body.url;
    refreshMoveSoundStatus(row); markDirty(); refreshCodePreview();
  } catch (error) {
    status.textContent = error.message || "Could not attach that sound effect.";
    status.classList.remove("attached");
  } finally { picker.disabled = false; picker.value = ""; }
}

// A follow-up is edited in place on its parent's card. Only the fields that
// change how it plays are exposed; everything else (its visual script, its
// transform) rides along untouched from whatever authored it.
function followUpSection(normalized) {
  const followUp = normalized.followUp || null, on = Boolean(followUp);
  const fu = followUp || normalizeMove({ name: "", type: "melee", variant: "medium" }, currentFighter?.config || {});
  return `<details class="move-recipe follow-up-recipe" ${on ? "open" : ""}><summary>Follow-up attack <span>+</span></summary>
    <p class="hint">An exclusive sequel. Land the parent move and a short window opens where only this attack is available - a dash attack that cashes out into its own rising uppercut, for example.</p>
    <label class="check-field">Has a follow-up<input data-field="followUp.enabled" type="checkbox" ${on ? "checked" : ""}></label>
    <div class="recipe-grid">${field("Follow-up name", "followUp.name", fu.name === "Unnamed Move" ? "" : fu.name)}${selectField("Type", "followUp.type", types, fu.type)}${selectField("Variant", "followUp.variant", ["light", "medium", "heavy", "all"], fu.variant)}${selectField("Motion", "followUp.behavior.motion", motions, fu.behavior.motion)}${field("Window (s)", "followUpWindow", normalized.followUpWindow || .55, "number", "min=.18 max=1.2 step=.05")}${field("Startup", "followUp.startup", fu.startup, "number", "min=1 max=60")}${field("Active", "followUp.active", fu.active, "number", "min=1 max=20")}${field("Endlag", "followUp.endlag", fu.endlag, "number", "min=1 max=90")}${field("Hitstun", "followUp.hitstun", fu.hitstun, "number", "min=1 max=60")}${field("Reach", "followUp.reach", fu.reach || "", "number", "min=70 max=520 placeholder=auto")}${field("Primary", "followUp.visual.color", fu.visual.color, "color")}<label class="check-field">Launcher<input data-field="followUp.launcher" type="checkbox" ${fu.launcher ? "checked" : ""}></label></div>
  </details>`;
}

function listFor(category) { return $(category === "normal" ? "#normal-list" : "#special-list"); }
function buildMoveRow(move, category) {
  const normalized = normalizeMove(move, currentFighter?.config || {}), visual = normalized.visual, behavior = normalized.behavior, animation = normalized.animation;
  const row = document.createElement("article"); row.className = "special-editor"; row.dataset.category = category;
  row.innerHTML = `<div class="move-card-heading"><div class="move-heading-copy"><strong>${CATEGORY_LABEL[category]} <span class="move-number">1</span></strong><span class="move-summary"></span></div><div class="move-card-actions"><button type="button" class="generate-move" title="Generate this move with AI">✦</button><button type="button" class="remove-move" title="Remove move">×</button></div></div>
    <div class="move-quick">${field("Name", "name", normalized.name)}${selectField("Type", "type", types, normalized.type)}</div>
    <div class="move-advanced advanced-only">
    <div class="move-core">${selectField("Combo role", "role", roles, normalized.role)}${selectField("Variant", "variant", ["light", "medium", "heavy", "all"], normalized.variant)}${field("Combos into", "combosInto", (normalized.combosInto || []).join(", "))}<label class="check-field">Launcher<input data-field="launcher" type="checkbox" ${normalized.launcher ? "checked" : ""}></label><label class="check-field">Crouching<input data-field="crouch" type="checkbox" ${normalized.crouch ? "checked" : ""}></label><label class="check-field">Air ready<input data-field="air" type="checkbox" ${normalized.air ? "checked" : ""}></label></div>
    <div class="move-frame-grid">${field("Startup", "startup", normalized.startup, "number", "min=1 max=60")}${field("Active", "active", normalized.active, "number", "min=1 max=20")}${field("Endlag", "endlag", normalized.endlag, "number", "min=1 max=90")}${field("Hitstun", "hitstun", normalized.hitstun, "number", "min=1 max=60")}${field("Reach", "reach", normalized.reach || "", "number", "min=70 max=520 placeholder=auto")}${field("Juggle cost", "juggle", normalized.juggle, "number", "min=1 max=15")}</div>
    <details class="move-recipe"><summary>Visual recipe <span>+</span></summary><div class="recipe-grid">${selectField("Main effect asset", "visual.mainVfx", mainVfxIds, visual.mainVfx, "", vfxLabels)}${selectField("Hit spark asset", "visual.hitVfx", hitVfxIds, visual.hitVfx, "", vfxLabels)}${field("VFX FPS", "visual.vfxFps", visual.vfxFps, "number", "min=6 max=30")}${selectField("Effect", "visual.effect", effects, visual.effect)}${selectField("Element", "visual.element", elements, visual.element)}${field("Primary", "visual.color", visual.color, "color")}${field("Secondary", "visual.secondary", visual.secondary, "color")}${field("Size", "visual.size", visual.size, "number", "min=12 max=130")}${field("Emoji", "visual.emoji", visual.emoji)}${selectField("Weapon", "visual.weapon", weaponIds, visual.weapon || "", "", weaponLabels)}${selectField("Weapon motion", "behavior.weaponMotion", weaponMotionIds, behavior.weaponMotion || "", "", weaponMotionLabels)}${selectField("Off hand (dual wield)", "visual.weaponOffhand", weaponIds, visual.weaponOffhand || "", "", weaponLabels)}${selectField("Off-hand motion", "behavior.weaponMotionOffhand", weaponMotionIds, behavior.weaponMotionOffhand || "", "", weaponMotionOffhandLabels)}${field("Weapon size", "visual.weaponScale", visual.weaponScale, "number", "min=.35 max=1.8 step=.05")}<label class="script-field">JavaScript visual program<textarea data-field="visual.script" rows="5">${escapeHtml(visual.script || "")}</textarea><small>AI-authored canvas code. It runs through the arena drawing API.</small><small class="script-status" aria-live="polite"></small></label></div><div class="move-sfx-tools"><label class="move-sfx-upload-label">CUSTOM MOVE SFX <input class="move-sfx-upload" type="file" accept="audio/*"><small>UPLOAD · AUTO-COMPRESSES TO 16 KHZ MONO</small></label><span class="move-sfx-status" aria-live="polite"></span><button type="button" class="clear-move-sfx">REMOVE</button></div><div class="custom-sprite-status" aria-live="polite"></div></details>
    <details class="move-recipe"><summary>Behavior recipe <span>+</span></summary><div class="recipe-grid">${selectField("Motion", "behavior.motion", motions, behavior.motion)}${selectField("Projectile path", "behavior.pattern", patterns, behavior.pattern)}${field("Hit count", "behavior.hits", behavior.hits > 1 ? behavior.hits : "", "number", "min=2 max=10")}${field("Hit interval", "behavior.hitInterval", behavior.hitInterval || "", "number", "min=.04 max=.2 step=.005")}${field("Rapid hits", "behavior.rapidHits", behavior.rapidHits, "number", "min=2 max=8")}${field("Rapid interval", "behavior.rapidInterval", behavior.rapidInterval, "number", "min=.045 max=.18 step=.005")}${field("Speed", "behavior.speed", behavior.speed, "number", "min=0 max=700")}${field("Gravity", "behavior.gravity", behavior.gravity, "number", "min=-1600 max=1600")}${field("Homing", "behavior.homing", behavior.homing, "number", "min=0 max=1 step=.05")}${field("Spread degrees", "behavior.spread", behavior.spread, "number", "min=-75 max=75")}${field("Bounces", "behavior.bounces", behavior.bounces, "number", "min=0 max=3")}${field("Orbit radius", "behavior.orbitRadius", behavior.orbitRadius, "number", "min=24 max=220")}${field("Orbit speed", "behavior.orbitSpeed", behavior.orbitSpeed, "number", "min=-12 max=12 step=.1")}${field("Return delay", "behavior.returnDelay", behavior.returnDelay, "number", "min=.15 max=1.5 step=.05")}${field("Dash distance", "behavior.dashDistance", behavior.dashDistance, "number", "min=30 max=300")}${field("Charge seconds", "behavior.charge", behavior.charge, "number", "min=.12 max=2.5 step=.05")}${field("Charge power", "behavior.chargePower", behavior.chargePower, "number", "min=.7 max=2.5 step=.05")}${field("Bomb fuse", "behavior.fuse", behavior.fuse, "number", "min=.18 max=2.5 step=.05")}${field("Radius", "behavior.radius", behavior.radius, "number", "min=0 max=140")}${field("Shots", "behavior.shots", behavior.shots, "number", "min=1 max=3")}${field("Lifetime", "behavior.lifetime", behavior.lifetime, "number", "min=.35 max=3 step=.05")}${selectField("Barrier shape", "behavior.barrierShape", barrierShapes, behavior.barrierShape)}${field("Barrier width", "behavior.barrierWidth", behavior.barrierWidth, "number", "min=36 max=260")}${field("Barrier height", "behavior.barrierHeight", behavior.barrierHeight, "number", "min=70 max=310")}${field("Barrier lifetime", "behavior.barrierLifetime", behavior.barrierLifetime, "number", "min=.5 max=6 step=.1")}${field("Barrier hits", "behavior.barrierHits", behavior.barrierHits, "number", "min=1 max=8")}${field("Barrier offset", "behavior.barrierOffset", behavior.barrierOffset, "number", "min=40 max=260")}${field("Hold", "behavior.hold", behavior.hold, "number", "min=.08 max=1.2 step=.05")}${field("Freeze", "behavior.freeze", behavior.freeze, "number", "min=.25 max=2.5 step=.05")}${field("Offset", "behavior.offset", behavior.offset, "number", "min=40 max=180")}${selectField("Status", "behavior.status", ["none", "freeze"], behavior.status)}${selectField("Element", "behavior.element", elements, behavior.element)}${selectField("Finisher", "behavior.finisher", ["slam", "throw"], behavior.finisher || "slam")}${field("KB power", "behavior.knockback.power", behavior.knockback.power, "number", "min=0 max=900")}${field("KB horizontal", "behavior.knockback.horizontal", behavior.knockback.horizontal, "number", "min=0 max=900")}${field("KB vertical", "behavior.knockback.vertical", behavior.knockback.vertical, "number", "min=0 max=900")}${field("KB angle", "behavior.knockback.angle", behavior.knockback.angle, "number", "min=-80 max=80")}${selectField("KB direction", "behavior.knockback.direction", ["away", "toward", "up", "down"], behavior.knockback.direction)}${field("Hitstop", "behavior.knockback.hitstop", behavior.knockback.hitstop, "number", "min=0 max=.2 step=.01")}</div></details>
    <details class="move-recipe"><summary>Animation recipe <span>+</span></summary><div class="recipe-grid">${selectField("Style", "animation.style", styles, animation.style)}${field("Gesture", "animation.gesture", animation.gesture)}${selectField("Windup", "animation.windup", windups, animation.windup)}${selectField("Contact", "animation.contact", contacts, animation.contact)}${selectField("Finish", "animation.finish", finishes, animation.finish)}${field("Intensity", "animation.intensity", animation.intensity, "number", "min=.45 max=1.6 step=.05")}${field("Portrait puppetry", "animation.puppet", animation.puppet, "checkbox")}${field("Puppet amount", "animation.puppetAmount", animation.puppetAmount, "number", "min=0 max=1 step=.05")}${field("Rotate X", "animation.transform.rotateX", animation.transform.rotateX, "number", "min=-360 max=360")}${field("Rotate Y", "animation.transform.rotateY", animation.transform.rotateY, "number", "min=-360 max=360")}${field("Rotate Z", "animation.transform.rotateZ", animation.transform.rotateZ, "number", "min=-360 max=360")}${field("Spin", "animation.transform.spin", animation.transform.spin, "number", "min=-720 max=720")}${field("Spin speed", "animation.transform.spinSpeed", animation.transform.spinSpeed, "number", "min=-12 max=12 step=.1")}${field("Scale X", "animation.transform.scaleX", animation.transform.scaleX, "number", "min=.35 max=2.4 step=.05")}${field("Scale Y", "animation.transform.scaleY", animation.transform.scaleY, "number", "min=.35 max=2.4 step=.05")}${field("Skew X", "animation.transform.skewX", animation.transform.skewX, "number", "min=-.95 max=.95 step=.05")}${field("Skew Y", "animation.transform.skewY", animation.transform.skewY, "number", "min=-.95 max=.95 step=.05")}${field("Offset X", "animation.transform.offsetX", animation.transform.offsetX, "number", "min=-180 max=180")}${field("Offset Y", "animation.transform.offsetY", animation.transform.offsetY, "number", "min=-180 max=180")}${field("Orbit", "animation.transform.orbit", animation.transform.orbit, "number", "min=-1 max=1 step=.05")}${field("Pulse", "animation.transform.pulse", animation.transform.pulse, "number", "min=0 max=1 step=.05")}</div></details>
    ${followUpSection(normalized)}
    </div>`;
  row._followUp = normalized.followUp || null;
  row.querySelector("[data-field=type]").onchange = (event) => {
    const defaults = frameDefaults[event.target.value];
    ["startup", "active", "endlag", "hitstun"].forEach((key, index) => { row.querySelector(`[data-field=${key}]`).value = defaults[index]; });
    refreshMoveCard(row);
  };
  row.querySelector(".remove-move").onclick = () => { row.remove(); renumberMoves(); markDirty(); refreshCodePreview(); };
  row.querySelector(".generate-move").onclick = () => regenerateSingleMove(row);
  row.addEventListener("input", (event) => { refreshMoveCard(row); if (event.target.dataset.field === "visual.script") refreshScriptStatus(row); markDirty(); });
  row.addEventListener("change", () => { refreshMoveCard(row); markDirty(); });
  row.insertAdjacentHTML("beforeend", `<input type="hidden" data-field="visual.spriteUrl" value="${escapeHtml(visual.spriteUrl || "")}"><input type="hidden" data-field="visual.soundUrl" value="${escapeHtml(visual.soundUrl || "")}">`);
  row.querySelector(".move-sfx-upload").onchange = (event) => attachMoveSfx(row, event.target.files?.[0]);
  row.querySelector(".clear-move-sfx").onclick = () => { const input = row.querySelector('[data-field="visual.soundUrl"]'); if (input) input.value = ""; refreshMoveSoundStatus(row); markDirty(); refreshCodePreview(); };
  refreshMoveCard(row); refreshCustomSpriteStatus(row); refreshMoveSoundStatus(row); refreshScriptStatus(row);
  return row;
}
function addMove(move = {}, category = "special") {
  const list = listFor(category);
  if (list.children.length >= CATEGORY_CAP[category]) { setStatus(`${category === "normal" ? "Normal attacks" : "Special moves"} are full. Remove one before adding another.`, true); return null; }
  const row = buildMoveRow(move, category);
  list.append(row); renumberMoves();
  return row;
}
function renumberMoves() {
  for (const category of ["normal", "special"]) {
    const rows = [...listFor(category).children];
    rows.forEach((row, index) => row.querySelector(".move-number").textContent = index + 1);
    $(`#${category}-count`).textContent = `${rows.length} / ${CATEGORY_CAP[category]}${category === "normal" ? " · SIX-BUTTON BASICS" : " · THE FIGHTER'S SIGNATURE TOOLS"}`;
  }
}

function readValue(row, key) { const input = row.querySelector(`[data-field="${key}"]`); return input?.type === "checkbox" ? input.checked : input?.value; }
function setNested(target, path, value) { const parts = path.split("."); let cursor = target; parts.slice(0, -1).forEach(part => cursor = cursor[part] ||= {}); cursor[parts.at(-1)] = value; }
function readMove(row, category) {
  const move = { name: String(readValue(row, "name") || "").trim(), type: readValue(row, "type"), role: readValue(row, "role"), variant: readValue(row, "variant"), launcher: readValue(row, "launcher"), crouch: readValue(row, "crouch"), air: readValue(row, "air"), category };
  move.combosInto = String(readValue(row, "combosInto") || "").split(",").map(name => name.trim()).filter(Boolean).slice(0, 4);
  ["startup", "active", "endlag", "hitstun", "reach", "juggle"].forEach(key => { const value = readValue(row, key); if (value !== "" && value != null) move[key] = Number(value); });
  row.querySelectorAll("[data-field^='visual.'], [data-field^='behavior.'], [data-field^='animation.']").forEach(input => { const key = input.dataset.field; setNested(move, key, input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value); });
  // Merge the edited follow-up fields over whatever the card was built from, so
  // an AI-authored visual script on the sequel survives a round trip.
  if (readValue(row, "followUp.enabled")) {
    const followUp = structuredClone(row._followUp || {});
    row.querySelectorAll("[data-field^='followUp.']").forEach(input => {
      const key = input.dataset.field.slice("followUp.".length);
      if (key === "enabled") return;
      const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
      if (input.type === "number" && input.value === "") return;
      setNested(followUp, key, value);
    });
    if (String(followUp.name || "").trim()) { move.followUp = followUp; move.followUpWindow = Number(readValue(row, "followUpWindow")) || .55; }
  }
  const normalized = normalizeMove(move, currentFighter?.config || {});
  normalized.category = category;
  return normalized;
}
function collectMoves() {
  const normals = [...$("#normal-list").children].map(row => readMove(row, "normal")).filter(move => move.name).slice(0, CATEGORY_CAP.normal);
  const specials = [...$("#special-list").children].map(row => readMove(row, "special")).filter(move => move.name).slice(0, CATEGORY_CAP.special);
  return [...normals, ...specials];
}
function collectData() {
  const existing = currentFighter?.config || {};
  return { ...existing, name: $("#character-name").value.trim(), author: $("#character-author").value.trim() || "Forge Author", style: existing.style || "Original arcade fighter", personality: $("#character-personality").value.trim() || "determined", backstory: $("#character-backstory").value.trim() || "A new challenger steps into the arena.", emojis: safeEmojis($("#character-emojis").value), buttons: 6, combo: Number($("#character-combo").value), smartness: Number($("#character-smartness").value), aggression: Number($("#character-aggression").value), defense: Number($("#character-defense").value), speed: Number($("#character-speed").value), range: Number($("#character-range").value), specials: collectMoves() };
}
function buildScript(data) { return buildFighterModule(data, normalizeMove); }
function refreshCodePreview() { $("#code-preview").textContent = buildScript(collectData()); }
function markDirty() {
  const indicator = $("#editor-dirty");
  if (indicator) indicator.textContent = "UNSAVED CHANGES";
}
function clearDirty(message = "All changes saved") {
  const indicator = $("#editor-dirty");
  if (indicator) indicator.textContent = message;
}

function normalizeAssetRequests(raw, fighter) {
  const source = Array.isArray(raw?.assetRequests) ? raw.assetRequests : raw?.assetRequest ? [raw.assetRequest] : [];
  return source.slice(0, 4).map((request, index) => {
    const item = request && typeof request === "object" ? request : {};
    const requestedIndex = Number.isFinite(Number(item.moveIndex)) ? Number(item.moveIndex) : index;
    const moveIndex = Math.max(0, Math.min(Math.max(0, (fighter.specials?.length || 1) - 1), requestedIndex));
    const move = fighter.specials?.[moveIndex];
    const kind = String(item.kind || "move").toLowerCase() === "portrait" ? "portrait" : "move";
    return { kind, moveIndex, moveName: String(item.moveName || move?.name || "this move").slice(0, 40), title: String(item.title || "Custom visual requested").slice(0, 80), prompt: String(item.prompt || item.description || "A custom transparent sprite for this attack.").slice(0, 220), reason: String(item.reason || "The AI thinks a custom image would make this idea read more clearly.").slice(0, 180), fallbackEmoji: move?.visual?.emoji || "✦" };
  });
}
function refreshAssetDialogCopy(request) {
  $("#asset-request-title").textContent = request.kind === "portrait" ? "Give this fighter a custom portrait?" : `Give ${request.moveName} a custom sprite?`;
  $("#asset-request-copy").textContent = `${request.prompt} ${request.reason} Upload an image, or choose ${request.fallbackEmoji} to keep the emoji fallback.`;
  $("#asset-request-upload").value = "";
  $("#asset-request-status").textContent = "";
}
function finishAssetRequest(result) {
  const active = activeAssetRequest;
  if (!active) return;
  activeAssetRequest = null;
  const dialog = $("#asset-request-dialog");
  if (dialog?.open) dialog.close();
  active.resolve(result);
}
function applyAssetUrl(request, url, filename) {
  if (request.kind === "portrait") {
    portraitUrl = url;
    $("#portrait-status").textContent = `Portrait attached · ${filename}`;
    return;
  }
  const rows = [...$("#normal-list").children, ...$("#special-list").children];
  const exact = rows.find((row) => String(readValue(row, "name") || "").trim().toLowerCase() === request.moveName.toLowerCase());
  const row = exact || rows[request.moveIndex];
  const input = row?.querySelector('[data-field="visual.spriteUrl"]');
  if (!input) return;
  input.value = url;
  refreshCustomSpriteStatus(row);
  row.dispatchEvent(new Event("input", { bubbles: true }));
}
function promptForAsset(request) {
  return new Promise((resolve) => {
    activeAssetRequest = { request, resolve };
    refreshAssetDialogCopy(request);
    const dialog = $("#asset-request-dialog");
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
  });
}
async function resolveAssetRequests(requests) {
  for (const request of requests) await promptForAsset(request);
}

function fillForm(fighter = null) {
  const config = fighter?.config || {};
  $("#character-name").value = fighter?.name || ""; $("#character-author").value = fighter?.author || "";
  $("#character-personality").value = config.personality || ""; $("#character-backstory").value = config.backstory || "";
  $("#character-prompt").value = fighter?.prompt || config.style || ""; $("#character-buttons").value = "6"; $("#character-combo").value = String(config.combo || 3); $("#combo-value").textContent = comboLabel($("#character-combo").value); $("#character-smartness").value = String(config.smartness || 3); $("#smartness-value").textContent = smartnessLabel($("#character-smartness").value); $("#character-aggression").value = String(config.aggression || 3); $("#aggression-value").textContent = aggressionLabel($("#character-aggression").value); $("#character-defense").value = String(config.defense || 3); $("#defense-value").textContent = defenseLabel($("#character-defense").value); $("#character-speed").value = String(config.speed || 3); $("#speed-value").textContent = speedLabel($("#character-speed").value); $("#character-range").value = String(config.range || 3); $("#range-value").textContent = rangeLabel($("#character-range").value);
  $("#character-emojis").value = (config.emojis || ["👊", "⚡", "🦵", "💥"]).join(" ");
  $("#normal-list").innerHTML = ""; $("#special-list").innerHTML = "";
  const sourceMoves = Array.isArray(config.specials) && config.specials.length ? config.specials : [
    { name:"Light Punch", type:"melee", role:"light-punch", variant:"light", category:"normal", startup:4, active:2, endlag:10, hitstun:10 },
    { name:"Medium Punch", type:"melee", role:"medium-punch", variant:"medium", category:"normal", startup:6, active:2, endlag:12, hitstun:12 },
    { name:"Heavy Punch", type:"melee", role:"heavy-punch", variant:"heavy", category:"normal", startup:9, active:3, endlag:18, hitstun:16 },
    { name:"Light Kick", type:"melee", role:"light-kick", variant:"light", category:"normal", startup:5, active:3, endlag:11, hitstun:11 },
    { name:"Medium Kick", type:"melee", role:"medium-kick", variant:"medium", category:"normal", startup:7, active:3, endlag:15, hitstun:13 },
    { name:"Heavy Kick", type:"melee", role:"heavy-kick", variant:"heavy", category:"normal", startup:10, active:4, endlag:20, hitstun:17 },
    { name:"Rising Launcher", type:"melee", variant:"heavy", launcher:true, category:"special" },
    { name:"Flash Arc", type:"projectile", variant:"light", category:"special" }
  ];
  const basicDefaults = BASIC_BUTTONS.map((name, index) => ({ name, type:"melee", role:name.toLowerCase().replace(" ", "-"), variant:index % 3 === 0 ? "light" : index % 3 === 1 ? "medium" : "heavy", category:"normal", startup:4 + Math.floor(index / 3) * 2 + index % 3, active:2 + (index % 2), endlag:10 + index * 2, hitstun:10 + index }));
  const moves = BASIC_BUTTONS.map((name, index) => sourceMoves.find((move) => {
    const category = String(move?.category || "").toLowerCase();
    const exactName = String(move?.name || "").trim().toLowerCase() === name.toLowerCase();
    return category !== "special" && (exactName || (category === "normal" && String(move?.role || "").toLowerCase() === basicDefaults[index].role));
  }) || basicDefaults[index]);
  moves.push(...sourceMoves.filter((move) => !moves.includes(move)));
  for (const move of moves) addMove(move, inferCategory(move));
  renumberMoves();
  updatePortraitPreview();
  clearDirty(fighter ? "All changes saved" : "Draft ready — save when you’re ready");
}

function setStatus(message, error = false) { const status = $("#editor-status"); status.textContent = message; status.classList.toggle("error", error); }
async function loadFighter() {
  if (!editingId) { fillForm(); return; }
  setStatus("Loading fighter blueprint…");
  try {
    const response = await fetch("/api/fighters"), body = await response.json();
    currentFighter = (body.fighters || []).map(row => ({ ...row, config: parseConfig(row.config) })).find(row => row.id === editingId);
    if (!currentFighter) { setStatus("Fighter not found or unavailable.", true); fillForm(); return; }
    portraitUrl = currentFighter.portrait_url || null; $("#editor-mode").textContent = "EDIT FIGHTER"; $("#editor-overline").textContent = "CHARACTER EDITOR"; $("#editor-heading").textContent = `Edit ${currentFighter.name}`; fillForm(currentFighter); setStatus("Moveset loaded. Tune the blueprint, then save it.");
  } catch { setStatus("Could not load the fighter blueprint.", true); fillForm(); }
}

$("#character-combo").oninput = (event) => $("#combo-value").textContent = comboLabel(event.target.value);
$("#character-smartness").oninput = (event) => $("#smartness-value").textContent = smartnessLabel(event.target.value);
$("#character-aggression").oninput = (event) => $("#aggression-value").textContent = aggressionLabel(event.target.value);
$("#character-defense").oninput = (event) => $("#defense-value").textContent = defenseLabel(event.target.value);
$("#character-speed").oninput = (event) => $("#speed-value").textContent = speedLabel(event.target.value);
$("#character-range").oninput = (event) => $("#range-value").textContent = rangeLabel(event.target.value);
$("#add-normal").onclick = () => { if (addMove({}, "normal")) { markDirty(); refreshCodePreview(); } };
$("#add-special").onclick = () => { if (addMove({}, "special")) { markDirty(); refreshCodePreview(); } };
const presetMoves = {
  charge: { name:"Charged Breaker", type:"projectile", role:"special", variant:"heavy", behavior:{ motion:"charge", pattern:"arc", charge:.62, chargePower:1.45, speed:410, radius:28 }, animation:{ style:"cast", gesture:"power cast", windup:"coil", contact:"energy", finish:"recoil", intensity:1.2 } },
  "dash-attack": { name:"Flash Step", type:"melee", role:"special", variant:"medium", reach:205, behavior:{ motion:"dash-attack", dashDistance:138, speed:520 }, animation:{ style:"dash", gesture:"driving knee", windup:"hop", contact:"body", finish:"follow-through", intensity:1.05 } },
  bomb: { name:"Delayed Payload", type:"bomb", role:"special", variant:"heavy", behavior:{ motion:"bomb", fuse:.7, radius:86, speed:320, pattern:"arc" }, animation:{ style:"cast", gesture:"toss", windup:"crouch", contact:"energy", finish:"slam", intensity:1.05 } }
};
document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
  const move = presetMoves[button.dataset.preset];
  if (!move || !addMove(move, "special")) return;
  markDirty(); refreshCodePreview();
}));
const presetNormals = {
  jab: { name:"Quick Jab", type:"melee", variant:"light", startup:4, active:2, endlag:10, hitstun:10, animation:{ style:"strike", gesture:"jab", windup:"none", contact:"fist", finish:"recoil", intensity:.7 } },
  kick: { name:"Snap Kick", type:"melee", variant:"medium", startup:6, active:3, endlag:14, hitstun:12, animation:{ style:"kick", gesture:"roundhouse", windup:"none", contact:"foot", finish:"recoil", intensity:.85 } },
  sweep: { name:"Low Sweep", type:"melee", variant:"medium", crouch:true, startup:7, active:3, endlag:16, hitstun:14, animation:{ style:"kick", gesture:"sweep", windup:"crouch", contact:"foot", finish:"recoil", intensity:.9 } }
};
document.querySelectorAll("[data-normal-preset]").forEach((button) => button.addEventListener("click", () => {
  const move = presetNormals[button.dataset.normalPreset];
  if (!move || !addMove(move, "normal")) return;
  markDirty(); refreshCodePreview();
}));
$("#expand-recipes").onclick = () => document.querySelectorAll("#normal-list details, #special-list details").forEach((details) => { details.open = true; });
$("#collapse-recipes").onclick = () => document.querySelectorAll("#normal-list details, #special-list details").forEach((details) => { details.open = false; });
document.querySelector(".standalone-editor")?.addEventListener("input", () => { markDirty(); refreshCodePreview(); });
document.querySelector(".standalone-editor")?.addEventListener("change", () => { markDirty(); refreshCodePreview(); });
$("#asset-use-emoji").onclick = () => finishAssetRequest({ attached: false });
$("#asset-attach").onclick = async () => {
  const file = $("#asset-request-upload").files[0];
  if (!file || !activeAssetRequest) { $("#asset-request-status").textContent = "Choose an image first, or use the emoji fallback."; return; }
  const button = $("#asset-attach"); button.disabled = true; $("#asset-request-status").textContent = "Uploading visual…";
  try {
    if (!window.websim?.upload) throw new Error("Image upload is unavailable right now.");
    const url = await window.websim.upload(file);
    applyAssetUrl(activeAssetRequest.request, url, file.name);
    finishAssetRequest({ attached: true });
  } catch (error) { $("#asset-request-status").textContent = error.message || "Upload failed. Try another image or use the emoji fallback."; }
  button.disabled = false;
};
$("#asset-request-dialog").addEventListener("cancel", (event) => { event.preventDefault(); finishAssetRequest({ attached: false }); });
async function uploadPortrait(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose an image file for the portrait.");
  let platformError = null;
  if (window.websim?.upload) {
    try {
      const url = await window.websim.upload(file);
      if (url) return url;
    } catch (error) { platformError = error; }
  }
  // The project route gives the editor a second path when the platform upload
  // surface is missing or rejects the file. Send raw bytes, never base64.
  const response = await fetch("/api/fighter-image", { method: "POST", headers: { "content-type": file.type }, body: file });
  let body = {};
  try { body = await response.json(); } catch { /* use the platform error below */ }
  if (!response.ok || !body.url) throw new Error(body.error || platformError?.message || "Portrait upload failed. Try another image.");
  return body.url;
}
$("#portrait-upload").onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  $("#portrait-status").textContent = "Uploading portrait…";
  try { portraitUrl = await uploadPortrait(file); $("#portrait-status").textContent = "Portrait attached."; }
  catch (error) { console.error("Portrait upload failed", error); $("#portrait-status").textContent = error.message || "Portrait upload failed; try another image."; }
  updatePortraitPreview();
};

$("#save-fighter").onclick = async () => {
  const data = collectData();
  if (!data.name) { setStatus("Give this fighter a name first.", true); return; }
  if (!data.specials.length) { setStatus("Add at least one named move.", true); return; }
  const button = $("#save-fighter"); button.disabled = true; setStatus(editingId ? "Saving fighter and moveset…" : "Saving fighter blueprint…");
  const script = buildScript(data), payload = { name:data.name, author:data.author, prompt:$("#character-prompt").value.trim() || data.style, config:data, script, portraitUrl };
  try {
    const response = await fetch(editingId ? `/api/fighters/${encodeURIComponent(editingId)}` : "/api/fighters", { method: editingId ? "PUT" : "POST", headers: { "content-type":"application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Save failed.");
    const saved = { ...body.fighter, config: parseConfig(body.fighter.config) }; currentFighter = saved; editingId = saved.id; history.replaceState({}, "", `editor.html?id=${encodeURIComponent(editingId)}`); $("#editor-mode").textContent = "EDIT FIGHTER"; $("#editor-overline").textContent = "CHARACTER EDITOR"; $("#editor-heading").textContent = `Edit ${saved.name}`; $("#code-preview").textContent = script; clearDirty(); setStatus(`${saved.name} and its moveset are saved.`);
  } catch (error) { setStatus(error.message, true); }
  button.disabled = false;
};

const MOVE_SCHEMA_NOTE = `Each move needs name, category ("normal" or "special"), type (melee, projectile, combo, trap, grapple, freeze, teleport, pillar, bomb, or gun), role, variant, launcher, crouch, air, startup, active, endlag, hitstun, reach, juggle, visual, behavior, and animation. A "normal" move is a fast, low-commitment poke: melee, startup under 10, no exotic behavior - a jab, a kick, a low sweep. A "special" move is the character's signature tool and can use any type, motion, or behavior. Use animation.style "backflip" for a retreating acrobatic flip, "frontflip" for a forward rotation, or "tackle" for a low shoulder/body-drive animation; tackle also gives the fighter a short forward lunge. Use the Fighter Forge VFX bank: mainVfx controls the move sequence and hitVfx is the exact contact spark. Keep frame data usable for real links. Juggle is the air-combo cost from 1-15; launchers should spend the opponent's finite juggle budget. Give every move a distinct animation.gesture such as jab, cross, hook, elbow, palm, knee, roundhouse, sweep, overhead, thrust, slam, spin, burst, cast, backflip, frontflip, tackle, or a short custom label. Behavior motion may be none, projectile, trap, barrier, dash, dash-attack, slide, dive-kick, rapid-jab, charge, bomb, pull, grapple, teleport, pillar, gun, wall-slam, spin, multi-uppercut, fly-in, or ground-pound. A barrier is a special defensive move: use type:"trap" with behavior.motion:"barrier" to summon a temporary physical object that blocks incoming projectiles but does not damage or trap fighters. Set behavior.barrierShape to "wall", "tree", "shield", "ice", "rock", or "crystal", and optionally set barrierWidth (36-260), barrierHeight (70-310), barrierLifetime (0.5-6 seconds), barrierHits (1-8 projectiles), and barrierOffset (40-260). Give it a visual and animation that match the summoned object. Rapid-jab uses behavior.rapidHits and behavior.rapidInterval — ideal for claw flurries, rapid scratches, or machine-gun jabs. Slide uses motion slide with behavior.slideSpeed (180-560) for a crouching low-dash along the floor that hits low and low-profiles projectiles — perfect for cat lunges, slide tackles, or skating attacks. Dive-kick moves are air:true and accelerate toward the floor. Fly-in with behavior.flyHeight:0-30 creates a ground-level pounce that rockets across the screen close to the floor. Charge moves use behavior.charge seconds and chargePower; dash-attack moves use behavior.dashDistance; bomb moves use behavior.fuse and radius for a timed area explosion. Gun moves use type gun and motion gun for a fast bullet; add behavior.angleOffset (positive = down, negative = up) for a diagonal shot (e.g. -20 for an anti-air beam, +18 for a low-skimmer), and behavior.angleMode:"fixed" to fire at that angle regardless of the foe's position. Use behavior.linger with behavior.speed:80-150 for a slow lingering bullet that stays on screen. Use behavior.pierce:true for a round that passes through on hit. behavior.wallBounce:true makes a projectile reflect off stage walls. Wall-slam moves use motion wall-slam to send the victim skidding into the nearest wall. Spin and multi-uppercut moves use motion spin or multi-uppercut with hits and hitInterval for a rotating or rising multi-hit; multi-uppercut is always a launcher. Fly-in moves use motion fly-in to rocket the attacker across the screen with behavior.flyHeight (0-260). Ground-pound moves use motion ground-pound to slam down from the air with a landing shockwave. Add behavior.knockback {horizontal:0-900, vertical:0-900, power:0-900, angle:-80-80, direction:"away|toward|up|down", hitstop:0-0.2, carry:true|false, wallBounce:true|false, groundBounce:true|false} whenever the move needs custom impact. Add animation.transform {rotateX:-360-360, rotateY:-360-360, rotateZ:-360-360, spin:-720-720, spinSpeed:-12-12, scaleX:0.35-2.4, scaleY:0.35-2.4, skewX:-0.95-0.95, skewY:-0.95-0.95, offsetX:-180-180, offsetY:-180-180, orbit:-1-1, pulse:0-1} for any expressive motion. These are declarative controls for the body; each move MUST also include visual.script containing literal JavaScript code for its unique canvas visual. Return only the code body, no markdown or function wrapper. The restricted API is api.line, api.arc, api.ring, api.circle, api.spark, api.slash, api.streak, api.shock, api.wedge, api.flash, api.glow, and api.asset(vfxId,x,y,size,alpha,rotation). The script receives t, p, active, size, color, secondary, move, and Math. Use loops and trigonometry to make every attack visually distinct. Never use window, document, network, storage, timers, imports, constructors, or globals.`;
const MOVE_BEHAVIOR_GUIDE = `Design every move to express the character's identity, not just fill a slot. Push beyond basic straight attacks — use unusual combinations of motions, patterns, and physics to make each move feel like it belongs to this specific fighter. Behavior patterns: straight, arc, fan, boomerang, orbit, rain; path controls: gravity, homing, spread, bounces, orbitRadius, orbitSpeed, returnDelay. A defensive barrier uses type:"trap" and behavior.motion:"barrier" to summon a temporary projectile-blocking object. Choose behavior.barrierShape:"tree" for a summoned tree, "wall" for a barricade, "shield" for an energy guard, "ice" for an ice slab, "rock" for a boulder, or "crystal" for a magical prism; barrierWidth, barrierHeight, barrierLifetime, barrierHits, and barrierOffset tune its size, duration, durability, and placement. Barriers block projectiles only, so they are useful against zoners without becoming an unbeatable fighter wall. For cat-like fighters: rapid-jab for claw flurries (behavior.rapidHits:4-6 for a raking scratch), slide for low crouching dashes that skim the floor and low-profile projectiles (behavior.slideSpeed:280-450), fly-in with behavior.flyHeight:0-20 for a ground-level pounce. For gun/zoner fighters: behavior.angleOffset (positive=down, negative=up) for angled shots, behavior.angleMode:"fixed" for programmed angles, behavior.linger:2-5 for zone-denial slow bullets, behavior.pierce:true for pass-through shots, behavior.wallBounce:true for ricochets. Mixing: a dive-kick that wall-slams, a rapid-jab with gravity-arc projectiles at the end, a slide into a launcher. behavior.knockback supports wallBounce:true and groundBounce:true for extended combos. Every move needs a visual.script — make the canvas program express the move's personality: a slide should show skid sparks and a low dust trail, a claw should spray diagonal slashes, a pounce should have a forward-pointing streak, and a barrier should draw a strong silhouette around the summoned object. Keep combat behavior declarative, write visual.script as literal JavaScript using only the restricted canvas API.`;

// ─────────────────────────────────────────────────────────────────────────────
// THE FORGE STUDIO
// Generating a fighter the way a real team would build one, rather than asking
// one model to do every job at once. Three specialists work in sequence, each
// seeing only what its own job needs:
//
//   VISIONARY  - who is this character, what is their gameplan, what does the
//                kit need to contain. Concept only: no numbers, no code.
//   COMBAT     - turns that brief into real frame data, behavior and knockback.
//   VFX ARTIST - takes the finished mechanics and writes the canvas program for
//                each move, so the look is designed around what the move does.
//   CPU DESIGNER - reads the finished fighter and teaches the computer pilot
//                  which tools to prefer, space, and avoid.
//
// Every stage degrades gracefully: if a later specialist fails, the work the
// earlier ones already did is kept.
// ─────────────────────────────────────────────────────────────────────────────

// The mechanics brief stops exactly where the drawing brief begins, so the
// combat designer never writes canvas code and the artist never touches frames.
const SCRIPT_BRIEF_SPLIT = "These are declarative controls for the body;";
const MOVE_MECHANICS_NOTE = MOVE_SCHEMA_NOTE.slice(0, MOVE_SCHEMA_NOTE.indexOf(SCRIPT_BRIEF_SPLIT)).trim();
const VFX_API_NOTE = MOVE_SCHEMA_NOTE.slice(MOVE_SCHEMA_NOTE.indexOf(SCRIPT_BRIEF_SPLIT)).trim();

const WEAPON_NOTE = `If a move is performed with a weapon rather than bare hands, add "weaponRequest": a short plain-language description of the weapon, such as "heavy two-handed steel axe", "bronze dagger", "long iron spear", "steel rapier", or "wooden staff". Do NOT invent a filename or a URL - a librarian matches your description against a real sprite library of daggers, swords, blades, katanas, rapiers, axes, hammers, maces, spears, halberds, scythes, hooks, staves and claws in wood, stone, bronze, iron and steel tiers. Only ask for a weapon when the character actually fights with one; punches, kicks and energy attacks stay unarmed. For a dual wielder, add "offhandRequest" describing the second weapon the same way. Set "weaponMotion" to one of swipe, arc, overhead, stab, dive-stab, spin, jump-spin, sweep, throw, spin-throw or shoot: dive-stab is a point-down thrust that works grounded or falling out of the air, jump-spin is spun overhead in mid-air, and spin-throw winds the weapon up in a spin and then releases it. Set "weaponScale" between 0.35 and 1.8 to size the weapon - prefer values under 1 for compact, readable weapons rather than oversized ones.`;
const PUPPET_NOTE = `If the fighter has an uploaded portrait, you may set animation.puppet to true (the default) and animation.puppetAmount from 0 to 1. This lightly splits that provided image into overlapping head, torso, and lower-body slices during attacks so the portrait can anticipate, reach, and recoil like a simple puppet. Use a smaller amount such as 0.35-0.7 for subtle motion, 0.8-1 for expressive signature attacks, and set puppet:false only when a move should keep the portrait completely flat.`;
const FOLLOW_UP_NOTE = `Every non-heavy offensive attack must declare "combosInto": ["Exact Move Name"] with at least one valid follow-up from this kit. Use light or medium attacks to build the route and optionally name a heavy as the final cash-out. Heavy attacks (variant:"heavy") MUST declare combosInto:[] and MUST NEVER create an automatic sequel. The engine validates the named links and supplies a safe same-kit fallback for older kits. A move may also carry a "followUp": a full exclusive sequel with "followUpWindow" in seconds (0.18-1.2), but follow-ups never nest and a heavy parent never opens one. Weapon-normal rule: if the character canonically or conceptually fights with a weapon, any of the six normal buttons may be weapon-assisted while remaining category:"normal", type:"melee", grounded, and fast. Add weaponRequest (and optionally offhandRequest), weaponMotion, and a short weapon-specific attack definition such as "Light Punch = hilt jab", "Medium Punch = cross-cut", "Heavy Punch = overhead cleave", "Light Kick = pommel knee", "Medium Kick = low blade sweep", or "Heavy Kick = weapon-assisted roundhouse". Do not force unarmed fists or kicks onto a weapon fighter; the weapon librarian will map the request to a real sprite.`;
const NORMAL_WEAPON_DEFINITION = `Normal-attack definition: the six universal buttons are input labels, not a promise that every fighter uses bare hands. For a sword, spear, axe, staff, claw, or other weapon fighter, describe how each needed normal button uses that weapon, keep the exact button name, and mark the move's purpose and visual fantasy accordingly. Weapon normals stay quick grounded melee attacks and remain valid combo starters or links.`;
const COMBO_NOTE = `The engine rewards real routes: light normals gatling into heavier normals, heavier normals cancel into specials, a launcher starts a juggle, and air buttons continue it. Ground bounces, wall bounces and OTG pickups with low attacks all extend a combo. So the kit needs fast low-commitment normals with short startup and short endlag, at least one launcher, at least one air-capable button, and specials worth cancelling into. A high combo stat means a fast, agile fighter whose buttons come out and recover quickly. Defensive characters may also have one signature barrier tool that creates a temporary tree, wall, shield, ice slab, rock, or crystal to block incoming projectiles without becoming a full invulnerable wall.`;

async function studioClient(timeout = 700) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const create = window.websim?.chat?.completions?.create;
    if (typeof create === "function") return create;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}
async function askStudio(system, user) {
  // The page runtime is quickest, but the editor can open before its AI
  // surface mounts. Wait briefly, then use the hosted project model instead
  // of leaving an editor with a dead "AI unavailable" action.
  const create = await studioClient();
  if (create) {
    const completion = await create({ messages: [{ role: "system", content: system }, { role: "user", content: user }], json: true });
    return parseAiJson(completion.content);
  }
  const response = await fetch("/api/forge-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system, user })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.content) throw new Error(body.error || "AI is unavailable right now. Please try again.");
  return parseAiJson(body.content);
}

// AI outputs are treated as drafts, never as a finished fighter by default.
// These checks keep a partial response or a grab-bag of unrelated attacks from
// quietly reaching the editor as a supposedly complete moveset.
function conceptKitIssues(kit) {
  if (!Array.isArray(kit)) return ["kit is missing"];
  const issues = [], names = new Set();
  if (kit.length < 9 || kit.length > 10) issues.push("kit must contain 9-10 moves");
  let normals = 0, specials = 0;
  for (const entry of kit) {
    const name = String(entry?.name || "").trim().toLowerCase();
    const category = String(entry?.category || "").toLowerCase();
    if (!name) issues.push("every move needs a name");
    else if (names.has(name)) issues.push("move names must be unique");
    names.add(name);
    if (category === "normal") normals++; else if (category === "special") specials++; else issues.push("every move needs a normal or special category");
    if (!String(entry?.intent || "").trim()) issues.push("every move needs a match purpose");
  }
  BASIC_BUTTONS.forEach((button, index) => {
    if (String(kit[index]?.category || "") !== "normal" || String(kit[index]?.name || "").trim().toLowerCase() !== button.toLowerCase()) issues.push(`basic move ${index + 1} must be ${button}`);
  });
  if (normals !== 6) issues.push("kit needs exactly 6 basic normals");
  if (specials < 3 || specials > 4) issues.push("kit needs 3-4 specials");
  return [...new Set(issues)];
}
function combatKitIssues(moves, kit) {
  if (!Array.isArray(moves)) return ["combat moves are missing"];
  const issues = [];
  if (moves.length !== kit.length) issues.push(`expected ${kit.length} combat moves, received ${moves.length}`);
  for (let index = 0; index < kit.length; index++) {
    const move = moves[index];
    if (!move || typeof move !== "object" || Array.isArray(move)) { issues.push(`move ${index + 1} is not an object`); continue; }
    const expectedName = String(kit[index]?.name || "").trim().toLowerCase();
    if (String(move.name || "").trim().toLowerCase() !== expectedName) issues.push(`move ${index + 1} must keep the concept name`);
    if (String(move.category || "") !== String(kit[index]?.category || "")) issues.push(`move ${index + 1} must keep its concept category`);
    // normalizeMove fills safe frame, variant, visual, behavior, and animation
    // defaults. Rejecting a draft merely because it omitted one of those
    // optional details turned a recoverable AI shorthand into a failed forge.
    // This gate is for actual kit damage: missing, malformed, renamed, or
    // reordered moves only.
  }
  return [...new Set(issues)];
}
function conceptKitText(kit) {
  return kit.map((entry, index) => `${index + 1}. [${entry.category}] ${entry.name} — purpose: ${entry.intent || ""}; look: ${entry.fantasy || ""}${entry.followUp ? `; follow-up: ${entry.followUp}` : ""}`).join("\n");
}

// ── JavaScript handling ─────────────────────────────────────────────────────
// AI-authored canvas code is never trusted on sight. It is scanned for the
// globals the sandbox forbids and then actually compiled, so a syntax error
// surfaces here as a message instead of silently becoming a blank effect.
const BLOCKED_SCRIPT_GLOBALS = /\b(?:window|document|globalThis|fetch|XMLHttpRequest|WebSocket|location|navigator|localStorage|sessionStorage|eval|Function|constructor|prototype|__proto__|setTimeout|setInterval|import|require)\b/;
function validateVisualScript(script) {
  const code = String(script || "").trim().replace(/^```(?:javascript|js)?\s*/i, "").replace(/\s*```$/i, "");
  if (!code) return { ok: false, code: "", reason: "empty script" };
  if (code.length > 4200) return { ok: false, code, reason: `too long (${code.length} chars, limit 4200)` };
  const blocked = code.match(BLOCKED_SCRIPT_GLOBALS);
  if (blocked) return { ok: false, code, reason: `uses the forbidden identifier "${blocked[0]}"` };
  try { new Function("api", "t", "p", "active", "size", "color", "secondary", "move", "Math", `"use strict";\n${code}`); }
  catch (error) { return { ok: false, code, reason: `does not compile: ${error.message}` }; }
  return { ok: true, code, reason: "" };
}

// ── Stage 1: the visionary ──────────────────────────────────────────────────
async function runVisionary(prompt, locked) {
  const system = `You are the concept designer for an arcade fighting game. You design characters, not numbers: never output frame data, behavior objects, or code. Named characters from games, shows, comics, and other source material are valid inputs, as are inspired-by characters. If the premise names one, recognize its well-known public-facing identity and preserve its signature silhouette, personality, movement, weapon, powers, and motifs; do not replace it with a generic original fighter. Treat the supplied character premise and source cues as a binding character bible. If a source detail is uncertain or absent, stay conservative and use the stated premise instead of inventing an unrelated elemental power, weapon, or lore. Do not write fake quotes or claim an action is canon. Return only JSON with name, author, style, personality, backstory, emojis (3-5), buttons (always 6), combo (1-5), gameplan (one paragraph on how this fighter is meant to win a round), and kit: an array of 9-10 entries, each { name, category ("normal" or "special"), intent (one sentence on what the move is for in a match), fantasy (one sentence on what it looks like), followUp (a sentence describing an exclusive sequel attack, or null) }. The first six entries MUST be exactly these basic buttons in this order: Light Punch, Medium Punch, Heavy Punch, Light Kick, Medium Kick, Heavy Kick. Make them fast, grounded, low-commitment normals with matching punch/kick identity. Add exactly 3-4 specials after them. The kit also needs a launcher, an air option, and 1-2 signature specials. Every move must serve the same character fantasy and use iconic source traits when supplied. ${COMBO_NOTE}`;
  let brief = await askStudio(system, `${prompt}\n\n${locked}\n\n${NORMAL_WEAPON_DEFINITION}`);
  let issues = conceptKitIssues(brief?.kit);
  if (issues.length) {
    const repairSystem = `You are the lead fighting-game designer repairing an incomplete or incoherent concept kit. Return only a complete replacement JSON object in the original schema. Keep the user's character premise, return 9-10 moves with exactly 6 normals followed by 3-4 specials, and make the first six names exactly Light Punch, Medium Punch, Heavy Punch, Light Kick, Medium Kick, Heavy Kick. Make every move fit one clear fighting style and satisfy every listed validation rule exactly.`;
    brief = await askStudio(repairSystem, `User premise: ${prompt}\n\nLocked fields: ${locked}\n\nFaulty draft:\n${JSON.stringify(brief)}\n\nValidation failures:\n- ${issues.join("\n- ")}\n\n${NORMAL_WEAPON_DEFINITION}`);
    issues = conceptKitIssues(brief?.kit);
  }
  if (issues.length) throw new Error(`The concept pass is incomplete: ${issues[0]}. Try Generate again.`);
  return brief;
}

// A short editorial pass gives the downstream combat and VFX helpers a
// concrete read on the character. It is deliberately notes-only: it cannot
// rename moves or alter creator-owned identity fields, so a flaky AI response
// never destroys an otherwise valid concept draft.
async function runAiDesigner(brief, source) {
  const system = `You are the AI designer and character-fidelity editor for a fighting game. Read the supplied fighter concept and source material, then distill what makes this character unmistakable. Named game/show characters and inspired-by fighters are allowed: identify their recognizable public signature tools and mannerisms so the finished CPU and moveset feel like that character. Return only JSON with: characterRead (one paragraph), fightingIdentity (one paragraph describing how they actually fight), signatureCues (3-6 short concrete actions, props, powers, or motifs), visualMotifs (3-5 short visual cues), voiceGuide (one sentence describing how they speak), and guardrails (3-5 rules that prevent generic or out-of-character moves). Never invent canon facts, quotes, or unrelated abilities. Preserve the user's premise and be specific rather than flattering.`;
  try {
    const notes = await askStudio(system, `Source material and locked identity:\n${source}\n\nDraft concept:\nCharacter: ${brief.name}\nStyle: ${brief.style}\nPersonality: ${brief.personality}\nBackstory: ${brief.backstory}\nGameplan: ${brief.gameplan || ""}\nMoves:\n${conceptKitText(brief.kit)}`);
    if (!notes || typeof notes !== "object") return brief;
    const list = (value, max) => Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max) : [];
    brief.designerNotes = {
      characterRead: String(notes.characterRead || "").trim().slice(0, 700),
      fightingIdentity: String(notes.fightingIdentity || "").trim().slice(0, 700),
      signatureCues: list(notes.signatureCues, 6), visualMotifs: list(notes.visualMotifs, 5),
      voiceGuide: String(notes.voiceGuide || "").trim().slice(0, 260), guardrails: list(notes.guardrails, 5)
    };
  } catch {
    // The concept and combat passes remain useful if this optional helper is
    // unavailable, including when the page falls back to /api/forge-chat.
    brief.designerNotes = { characterRead: "Stay faithful to the supplied premise.", fightingIdentity: brief.style || "Use the stated fighting style.", signatureCues: [], visualMotifs: [], voiceGuide: brief.personality || "", guardrails: ["Do not add unrelated powers or weapons."] };
  }
  return brief;
}

// ── Stage 2: the combat designer ────────────────────────────────────────────
async function runCombatDesigner(brief) {
  const system = `You are the combat designer for an arcade fighting game. Turn EVERY concept entry into one complete move object. Return only JSON: { "specials": [ ...move objects... ] }. The array must have the exact same count, order, names, and categories as the supplied kit. The first six entries are universal six-button basics (Light Punch, Medium Punch, Heavy Punch, Light Kick, Medium Kick, Heavy Kick): they must be grounded unarmed melee normals with matching light/medium/heavy roles, short startup, and no projectile, grapple, launcher, or exotic motion. Each move requires type, category, role, variant, startup, active, endlag, hitstun, visual object, behavior object, and animation object. Do NOT include visual.script - an artist writes that afterwards. Keep mechanics faithful to the character bible and concept brief: each motion, weapon choice, effect, and animation gesture must be recognizable for this fighter, not a generic fighting-game filler. Never bolt on unrelated powers just to vary the list. ${MOVE_MECHANICS_NOTE} ${MOVE_BEHAVIOR_GUIDE} ${WEAPON_NOTE} ${PUPPET_NOTE} ${FOLLOW_UP_NOTE} ${COMBO_NOTE}`;
  const weaponCompatibleSystem = system.replace("they must be grounded unarmed melee normals", "they must be grounded melee normals; weapon-dependent fighters may use their defining weapon in these six attacks");
  const kit = conceptKitText(brief.kit);
  const notes = brief.designerNotes || {};
  const user = `Character bible:\n${brief.sourceAnchor || `${brief.name}: ${brief.style}.`}\n\nAI designer notes:\nCharacter read: ${notes.characterRead || "Stay faithful to the premise."}\nFighting identity: ${notes.fightingIdentity || brief.style || "Use the stated style."}\nSignature cues: ${(notes.signatureCues || []).join(", ")}\nVisual motifs: ${(notes.visualMotifs || []).join(", ")}\nGuardrails: ${(notes.guardrails || []).join("; ")}\n\nCharacter: ${brief.name}. Style: ${brief.style}. Personality: ${brief.personality}.\nGameplan: ${brief.gameplan || "pressure and convert"}.\nCombo stat: ${brief.combo} of 5.\n\nKit to build in this exact order:\n${kit}`;
  let built = await askStudio(weaponCompatibleSystem, user);
  let moves = Array.isArray(built?.specials) ? built.specials : Array.isArray(built) ? built : [];
  let issues = combatKitIssues(moves, brief.kit);
  if (issues.length) {
    const repairSystem = `You are a meticulous combat-data editor. Return only JSON: { "specials": [ ...move objects... ] }. Repair the combat pass so it has one complete move for every concept entry, in the exact supplied order, preserving each name and category. Do not simplify, omit, rename, or add moves. Every move needs valid frame data plus visual, behavior, and animation objects.`;
    built = await askStudio(repairSystem, `Character: ${brief.name}.\n\nRequired kit:\n${kit}\n\nFaulty combat output:\n${JSON.stringify(built)}\n\nValidation failures:\n- ${issues.join("\n- ")}`);
    moves = Array.isArray(built?.specials) ? built.specials : Array.isArray(built) ? built : [];
    issues = combatKitIssues(moves, brief.kit);
  }
  if (issues.length) throw new Error(`The combat pass is incomplete: ${issues[0]}. Try Generate again.`);
  return moves;
}

// ── The weapon librarian ────────────────────────────────────────────────────
// The combat designer says what a move is fought with in plain language; the
// librarian is the one who walks the rack and comes back with an actual sprite.
// It is deliberately not an AI step - matching a description to a catalogue is
// a lookup, and doing it in code means it cannot invent a weapon that does not
// exist.
const WEAPON_MOTION_BY_GESTURE = [
  [/thrust|stab|pierce|lunge|impale|skewer/, "stab"],
  [/overhead|chop|cleave|axe|hammer|smash|slam/, "overhead"],
  [/spin|whirl|cyclone|twirl|pirouette/, "spin"],
  [/sweep|low|shin|ankle|trip/, "sweep"],
  [/throw|toss|hurl|launch/, "throw"],
  [/shoot|fire|blast|snipe|volley/, "shoot"],
  [/arc|crescent|reap|scythe|hook|swing/, "arc"]
];
function weaponMotionFor(move) {
  const text = `${move.animation?.gesture || ""} ${move.name || ""} ${move.behavior?.motion || ""}`.toLowerCase();
  for (const [pattern, motion] of WEAPON_MOTION_BY_GESTURE) if (pattern.test(text)) return motion;
  const entry = WEAPON_BY_ID.get(move.visual?.weapon);
  return entry ? WEAPON_DEFAULT_MOTION[entry.weaponClass] || "swipe" : "swipe";
}

// The combat pass is AI-authored data. A model will occasionally abbreviate a
// nested object as a string (for example, `behavior: "swing"`). Repair those
// shorthands before the librarian writes any nested weapon fields.
function ensureMoveParts(move) {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(move.visual)) {
    const shorthand = String(move.visual || "").trim();
    move.visual = WEAPON_IDS.has(shorthand) ? { weapon: shorthand } : {};
  }
  if (!isObject(move.behavior)) {
    const shorthand = String(move.behavior || "").trim().toLowerCase();
    move.behavior = {};
    if (motions.includes(shorthand)) move.behavior.motion = shorthand;
    else if (WEAPON_MOTIONS.includes(shorthand)) move.behavior.weaponMotion = shorthand;
    else if (/swing|slash/.test(shorthand)) move.behavior.weaponMotion = "swipe";
  }
  return move;
}

function runWeaponLibrarian(moves, report) {
  for (const move of moves) {
    if (!move || typeof move !== "object" || Array.isArray(move)) {
      report.unarmed.push("Ignored a malformed move from the combat pass.");
      continue;
    }
    ensureMoveParts(move);
    const request = String(move.weaponRequest || move.weapon || move.visual?.weaponRequest || "").trim();
    delete move.weaponRequest;
    if (move.visual) delete move.visual.weaponRequest;
    if (!request) continue;
    const picked = findWeapon(request);
    if (!picked) { report.unarmed.push(`${move.name}: nothing in the rack matches "${request}"`); continue; }
    move.visual = move.visual || {};
    move.visual.weapon = picked.id;
    // Dual wield: a second trip to the rack for the off hand.
    const offhandRequest = String(move.offhandRequest || move.visual.offhandRequest || "").trim();
    delete move.offhandRequest; delete move.visual.offhandRequest;
    if (offhandRequest) {
      const offhand = findWeapon(offhandRequest);
      if (offhand) { move.visual.weaponOffhand = offhand.id; report.armed.push(`${move.name} off hand: ${offhand.label}`); }
    }
    move.behavior.weaponMotion = weaponMotionFor(move);
    if (!(Number(move.reach) > 0)) move.reach = picked.reach;
    report.armed.push(`${move.name}: ${picked.label} (${picked.weaponClass}, ${move.behavior.weaponMotion})`);
  }
  return moves;
}

// ── Stage 3: the VFX artist ─────────────────────────────────────────────────
// The artist sees what each move mechanically does, so the visual is designed
// around the real motion. Anything that fails to compile goes back once with
// the exact error before the move falls back to its generated template.
async function runVfxArtist(brief, moves, report) {
  const system = `You are the VFX artist for an arcade fighting game. The combat designer has finished the mechanics; your job is only how each move looks. Return only JSON: { "visuals": [ { "index": <0-based move index>, "color": "#rrggbb", "secondary": "#rrggbb", "mainVfx": "<id>", "hitVfx": "<id>", "size": <12-130>, "emoji": "<one emoji>", "script": "<javascript>" } ] } with one entry per move. ${VFX_API_NOTE}`;
  const digest = moves.map((move, index) => {
    const weapon = WEAPON_BY_ID.get(move.visual?.weapon);
    const armed = weapon ? `, ARMED with a ${weapon.label} (${weapon.weaponClass}, ${weapon.grip}) swung ${move.behavior?.weaponMotion || "swipe"}` : "";
    return `${index}. ${move.name} - type ${move.type}, motion ${move.behavior?.motion || "none"}, ${move.startup}/${move.active}/${move.endlag}F, ${move.launcher ? "launcher, " : ""}${move.air ? "air, " : ""}gesture ${move.animation?.gesture || "strike"}, element ${move.behavior?.element || "energy"}${armed}`;
  }).join("\n");
  const notes = brief.designerNotes || {};
  const user = `Character: ${brief.name} - ${brief.style}. ${brief.personality}.\nAI designer visual motifs: ${(notes.visualMotifs || []).join(", ")}. Signature cues: ${(notes.signatureCues || []).join(", ")}.\n\nMoves to visualize:\n${digest}\n\nGive each move a look that reads as its own attack at a glance and reinforces the character's visual motifs. For a move marked ARMED, the weapon sprite is drawn for you - build the effect around the blade path (trails, sparks along the edge, an impact at the tip) rather than covering it. You may also place the weapon yourself with api.weapon(offsetX, offsetY, rotationRadians, lengthPx, opacity) if the program wants to choreograph the swing.`;
  const art = await askStudio(system, user);
  const visuals = Array.isArray(art?.visuals) ? art.visuals : [];
  for (const entry of visuals) {
    const index = Number(entry?.index);
    const move = moves[index]; if (!move) continue;
    move.visual = move.visual || {};
    if (/^#[0-9a-f]{6}$/i.test(entry.color)) move.visual.color = entry.color;
    if (/^#[0-9a-f]{6}$/i.test(entry.secondary)) move.visual.secondary = entry.secondary;
    if (VFX_IDS.has(entry.mainVfx)) move.visual.mainVfx = entry.mainVfx;
    if (VFX_IDS.has(entry.hitVfx)) move.visual.hitVfx = entry.hitVfx;
    if (Number(entry.size) > 0) move.visual.size = Number(entry.size);
    if (entry.emoji) move.visual.emoji = String(entry.emoji).slice(0, 4);

    let check = validateVisualScript(entry.script);
    if (!check.ok && check.code) {
      // One repair round trip, with the actual compiler message.
      report.repaired.push(`${move.name}: ${check.reason}`);
      try {
        const fixSystem = `You are the VFX artist. The canvas program you wrote for one move ${check.reason}. Rewrite it so it compiles and obeys the sandbox. Return only JSON: { "script": "<javascript>" }. ${VFX_API_NOTE}`;
        const fixed = await askStudio(fixSystem, `Move: ${move.name} (${move.type}, ${move.behavior?.motion || "none"}).\n\nThe rejected program:\n${check.code}`);
        check = validateVisualScript(fixed?.script);
      } catch { /* the fallback template below is a perfectly good result */ }
    }
    if (check.ok) move.visual.script = check.code;
    else { delete move.visual.script; report.failed.push(`${move.name}: ${check.reason}`); }
  }
  return moves;
}

// Final helper: once mechanics and visuals are fixed, a CPU designer authors
// how this specific fighter should pilot them. The result is declarative and
// references exact move names, so the arena can make deliberate choices rather
// than guessing from broad archetype heuristics alone.
async function runComputerAiDesigner(brief, moves) {
  const system = `You are the final computer-AI designer for an arcade fighting game. The moveset is finished; design a believable CPU pilot for this exact fighter. Return only JSON with archetype (rushdown, zoner, grappler, or balanced), aggression (0-1.2), idealGap (80-500 pixels), blockBias (0.25-1.8), jumpBias (0-1.8), zoneBias (0-2.2), punish (0.25-1.8), patience (0.15-1.5), antiAir (0-1.5), comboCommit (0.25-1.2), preferredMoves (up to 6 exact move names), and avoidMoves (up to 6 exact move names). Pick preferred moves for the fighter's real gameplan: opener, poke, launcher, air ender, punish, or signature tool. Avoid moves that are unsafe or out of character in neutral. Do not invent names, mechanics, or abilities; every name in the two lists must exactly match the finished moveset. Tune the CPU to express personality and source style, with readable choices and occasional mistakes rather than perfect reactions.`;
  const digest = moves.map((move, index) => `${index}. ${move.name} [${move.category || "auto"}] type=${move.type}, role=${move.role}, startup=${move.startup}F, reach=${move.reach || "auto"}, motion=${move.behavior?.motion || "none"}, air=${move.air ? "yes" : "no"}, launcher=${move.launcher ? "yes" : "no"}`).join("\n");
  const user = `Character bible: ${brief.sourceAnchor || brief.prompt || brief.style}\nCharacter: ${brief.name}. Style: ${brief.style}. Personality: ${brief.personality}. Gameplan: ${brief.gameplan || ""}\n\nFinished moveset:\n${digest}`;
  const fallback = { archetype: fighterArchetypeHint(moves), aggression: .74, idealGap: 205, blockBias: 1, jumpBias: .85, zoneBias: .75, punish: 1, patience: .6, antiAir: .72, comboCommit: .72, preferredMoves: [], avoidMoves: [] };
  try {
    const raw = await askStudio(system, user);
    const names = new Set(moves.map((move) => String(move.name || "").trim().toLowerCase()));
    const pickNames = (value) => Array.isArray(value) ? value.map((name) => String(name || "").trim()).filter((name) => names.has(name.toLowerCase())).slice(0, 6) : [];
    return { ...fallback, ...raw, preferredMoves: pickNames(raw?.preferredMoves), avoidMoves: pickNames(raw?.avoidMoves) };
  } catch { return fallback; }
}
function fighterArchetypeHint(moves) {
  const signature = moves.filter((move) => !/^(?:light|medium|heavy) (?:punch|kick)$/i.test(String(move.name || ""))), total = signature.length || moves.length || 1;
  const ranged = signature.filter((move) => ["projectile", "trap", "freeze", "pillar", "bomb", "gun"].includes(move.type)).length / total, grapples = signature.filter((move) => move.type === "grapple").length / total, fast = signature.filter((move) => Number(move.startup) <= 8).length / total;
  return ranged >= .5 ? "zoner" : grapples >= .34 ? "grappler" : fast >= .5 ? "rushdown" : "balanced";
}
function enforceBasicButtons(moves) {
  return moves.map((move, index) => {
    const name = BASIC_BUTTONS[index];
    if (!name || String(move?.name || "").trim().toLowerCase() !== name.toLowerCase()) return move;
    const punch = index < 3, tier = index % 3, role = `${["light", "medium", "heavy"][tier]}-${punch ? "punch" : "kick"}`;
    move.name = name; move.category = "normal"; move.type = "melee"; move.role = role; move.variant = ["light", "medium", "heavy"][tier]; move.launcher = false; move.air = false; move.crouch = false;
    move.startup = [4, 6, 9, 5, 7, 10][index]; move.active = Math.max(2, Number(move.active) || 3); move.endlag = [10, 12, 18, 11, 15, 20][index]; move.hitstun = Math.max(10, Number(move.hitstun) || 12);
    move.behavior = { ...(move.behavior || {}), motion: "none", speed: 0, radius: 0, shots: 1 };
    // A weapon fighter may use the universal button names for weapon normals.
    // Keep those librarian-resolved sprites instead of silently stripping the
    // character's defining weapon from every basic attack.
    move.visual = { ...(move.visual || {}) };
    return move;
  });
}

$("#generate-fighter").onclick = async () => {
  const prompt = $("#character-prompt").value.trim() || currentFighter?.prompt || "Original arcade fighter";
  if (prompt.length < 8) { setStatus("Give the forge a little more to work with.", true); return; }
  const button = $("#generate-fighter"); button.disabled = true;
  const report = { repaired: [], failed: [] };
  try {
    const currentKit = collectMoves().map((move) => `${move.name} (${move.type}${move.air ? ", air" : ""}${move.launcher ? ", launcher" : ""})`).join("; ");
    const livePersonality = $("#character-personality").value.trim() || currentFighter?.config?.personality || "not yet specified";
    const liveBackstory = $("#character-backstory").value.trim() || currentFighter?.config?.backstory || "not yet specified";
    const identityNote = `Creator-controlled fields are locked during this edit. Do not change the character name (${$("#character-name").value.trim() || currentFighter?.name || "blank"}), author (${$("#character-author").value.trim() || currentFighter?.author || "Forge Author"}), or portrait.\n\nCharacter bible: the user premise is the source of truth: "${prompt}". Existing style: "${currentFighter?.config?.style || "not yet specified"}". Personality: "${livePersonality}". Backstory: "${liveBackstory}". Existing moves, if any: ${currentKit || "none"}. Preserve recognisable signature tools and combat personality; only add a move when it directly follows from this bible.`;
    const assetRequestGuide = `If a move truly needs a custom uploaded sprite, add an assetRequests entry with kind, moveIndex, moveName, title, prompt, and reason. This is a request for the creator, not a URL. Do not request an image for ordinary punches, kicks, projectiles, or effects that read fine with the existing VFX bank and visual.emoji.`;

    setStatus("Concept designer is sketching the fighter\u2026");
    const brief = await runVisionary(prompt, identityNote);
    brief.sourceAnchor = identityNote;

    setStatus("AI designer is locking the character's identity\u2026");
    await runAiDesigner(brief, identityNote);

    setStatus(`Combat designer is building ${brief.kit.length} moves\u2026`);
    const built = await runCombatDesigner(brief);

    const armedReport = { armed: [], unarmed: [] };
    runWeaponLibrarian(built, armedReport);
    enforceBasicButtons(built);
    if (armedReport.armed.length) setStatus(`Armourer fitted ${armedReport.armed.length} move${armedReport.armed.length > 1 ? "s" : ""} from the weapon rack\u2026`);

    setStatus("VFX artist is drawing the effects\u2026");
    await runVfxArtist(brief, built, report).catch((error) => { report.failed.push(`visual pass: ${error.message}`); });

    setStatus("AI designer is teaching the computer pilot\u2026");
    const computerAi = await runComputerAiDesigner(brief, built);

    const lockedName = $("#character-name").value.trim() || currentFighter?.name || "";
    const lockedAuthor = $("#character-author").value.trim() || currentFighter?.author || "Forge Author";
    const lockedPortrait = portraitUrl || currentFighter?.portrait_url || null;
    const raw = { ...brief, specials: built, ai: computerAi, assetRequests: [] };
    void assetRequestGuide;
    const made = sanitizeFighter(raw, normalizeMove, collectData());
    // Model-provided URLs are never trusted as uploads. A request is only a
    // prompt for the creator; until they attach an image, the move uses emoji.
    made.specials.forEach((move) => { move.visual.spriteUrl = ""; });
    const assetRequests = normalizeAssetRequests(raw, made);
    // AI is only allowed to rewrite the combat blueprint. Creator identity and
    // the existing portrait stay exactly as entered or previously saved.
    made.name = lockedName || made.name;
    made.author = lockedAuthor || made.author;
    portraitUrl = lockedPortrait;
    $("#character-name").value = made.name; $("#character-author").value = made.author; $("#character-personality").value = made.personality; $("#character-backstory").value = made.backstory; $("#character-buttons").value = String(made.buttons); $("#character-combo").value = String(made.combo); $("#combo-value").textContent = comboLabel($("#character-combo").value); if (made.smartness) { $("#character-smartness").value = String(made.smartness); $("#smartness-value").textContent = smartnessLabel(made.smartness); } if (made.aggression) { $("#character-aggression").value = String(made.aggression); $("#aggression-value").textContent = aggressionLabel(made.aggression); } if (made.defense) { $("#character-defense").value = String(made.defense); $("#defense-value").textContent = defenseLabel(made.defense); } if (made.speed) { $("#character-speed").value = String(made.speed); $("#speed-value").textContent = speedLabel(made.speed); } $("#character-emojis").value = made.emojis.join(" ");
    $("#normal-list").innerHTML = ""; $("#special-list").innerHTML = "";
    // The model tags each move's category; fall back to a heuristic for moves
    // that skip it so the split always makes sense even if the model forgets.
    const normals = made.specials.filter((move) => inferCategory(move) === "normal").slice(0, CATEGORY_CAP.normal);
    const specials = made.specials.filter((move) => inferCategory(move) === "special").slice(0, CATEGORY_CAP.special);
    for (const move of normals) addMove(move, "normal");
    for (const move of specials) addMove(move, "special");
    renumberMoves(); refreshCodePreview(); markDirty(); updatePortraitPreview();
    if (assetRequests.length) { setStatus("The forge has a few optional visual ideas. Choose an upload or keep the emoji fallback."); await resolveAssetRequests(assetRequests); refreshCodePreview(); }
    // Say plainly what the artist's code did, rather than quietly swapping in a
    // fallback and calling it a success.
    const notes = [];
    if (computerAi?.preferredMoves?.length) notes.push(`CPU pilot tuned around ${computerAi.preferredMoves[0]}`);
    if (armedReport.armed.length) notes.push(`armed ${armedReport.armed.length} move${armedReport.armed.length > 1 ? "s" : ""} (${armedReport.armed[0]})`);
    if (report.repaired.length) notes.push(`repaired ${report.repaired.length} visual program${report.repaired.length > 1 ? "s" : ""}`);
    if (report.failed.length) notes.push(`${report.failed.length} fell back to a generated effect (${report.failed[0]})`);
    setStatus(notes.length ? `Fighter generated - ${notes.join("; ")}.` : "Fighter generated and ready to save.");
  } catch (error) { setStatus(error.message || "AI could not generate a fighter.", true); }
  button.disabled = false;
};

// ─────────────────────────────────────────────────────────────────────────────
// PER-MOVE AI GENERATION
// Regenerates a single move in place - the identity and the rest of the
// moveset stay exactly as they are, so this is safe to use move by move.
// ─────────────────────────────────────────────────────────────────────────────
async function regenerateSingleMove(row) {
  const category = row.dataset.category === "normal" ? "normal" : "special";
  const button = row.querySelector(".generate-move");
  const existingName = String(readValue(row, "name") || "").trim();
  button.disabled = true; button.textContent = "\u2026";
  try {
    const data = collectData();
    const siblingNames = [...$("#normal-list").children, ...$("#special-list").children]
      .filter((sibling) => sibling !== row)
      .map((sibling) => String(readValue(sibling, "name") || "").trim())
      .filter(Boolean);
    const system = `Design a single ${category} move for an arcade fighting-game character, including a character adapted from a named game or show. The supplied character bible is binding: make the move read as this fighter specifically, using their recognizable signature gear or movement when supplied, and do not substitute a generic genre archetype. Return only JSON with one key, "move", holding the move object. ${MOVE_SCHEMA_NOTE} ${MOVE_BEHAVIOR_GUIDE} ${WEAPON_NOTE} ${PUPPET_NOTE} ${FOLLOW_UP_NOTE}`;
    const context = [
      `Character: ${data.name || "unnamed fighter"}.`,
      `Character bible: ${$("#character-prompt").value.trim() || currentFighter?.prompt || data.style || "Use only the stated fighter identity."}`,
      data.style ? `Concept: ${data.style}.` : "",
      data.personality ? `Personality: ${data.personality}.` : "",
      `This move's category is fixed as "${category}".`,
      existingName ? `Keep the move named "${existingName}" and design around that name.` : "Invent a fitting name.",
      siblingNames.length ? `Avoid repeating or closely resembling these other moves this fighter already has: ${siblingNames.join(", ")}.` : "",
      "Use a motion, weapon, visual effect, and gesture that follow the character bible. Do not add generic unrelated powers just to make the move flashy."
    ].filter(Boolean).join(" ");
    const raw = await askStudio(system, context);
    const moveData = raw && typeof raw === "object" && raw.move ? raw.move : raw;
    if (existingName) moveData.name = existingName;
    moveData.category = category;
    // A single regenerated move gets the same trip past the weapon rack.
    runWeaponLibrarian([moveData], { armed: [], unarmed: [] });
    // Same gate as the studio pass: a program that will not compile never
    // reaches the move, and the creator is told why.
    if (moveData.visual?.script) {
      const check = validateVisualScript(moveData.visual.script);
      if (check.ok) moveData.visual.script = check.code;
      else { delete moveData.visual.script; setStatus(`Visual program rejected (${check.reason}); using a generated effect.`, true); }
    }
    const replacement = buildMoveRow(moveData, category);
    row.replaceWith(replacement);
    renumberMoves(); refreshCodePreview(); markDirty();
    setStatus(`${readValue(replacement, "name") || "Move"} generated.`);
  } catch (error) { setStatus(error.message || "AI could not generate this move.", true); }
  finally { const liveButton = row.isConnected ? row.querySelector(".generate-move") : null; if (liveButton) { liveButton.disabled = false; liveButton.textContent = "\u2726"; } }
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTRAIT PREVIEW
// Every forged fighter fights with the same in-battle sprite crop, so that
// crop - not a blank placeholder - is what a fighter looks like by default in
// the editor too. A custom portrait upload replaces it once one is attached.
// ─────────────────────────────────────────────────────────────────────────────
let defaultSpriteUrl = null;
async function loadDefaultSprite() {
  if (defaultSpriteUrl) return defaultSpriteUrl;
  try {
    const image = new Image(); image.src = "assets/fighter-sprites-source.png";
    await image.decode();
    const off = document.createElement("canvas"); off.width = image.naturalWidth; off.height = image.naturalHeight;
    const octx = off.getContext("2d"); octx.drawImage(image, 0, 0);
    const pixels = octx.getImageData(0, 0, off.width, off.height), d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const green = g > 145 && g > r * 1.35 && g > b * 1.18;
      if (green) d[i + 3] = 0;
      else if (g > r * 1.15 && g > b * 1.08) d[i + 3] = Math.max(0, Math.min(255, 255 - (g - Math.max(r, b)) * 2));
    }
    octx.putImageData(pixels, 0, 0);
    const crop = document.createElement("canvas"); crop.width = 375; crop.height = 415;
    crop.getContext("2d").drawImage(off, 905, 0, 375, 415, 0, 0, 375, 415);
    defaultSpriteUrl = crop.toDataURL("image/png");
  } catch { defaultSpriteUrl = null; }
  return defaultSpriteUrl;
}
async function updatePortraitPreview() {
  const host = $("#portrait-preview"); if (!host) return;
  if (portraitUrl) { host.innerHTML = `<img src="${escapeHtml(portraitUrl)}" alt="" />`; return; }
  const sprite = await loadDefaultSprite();
  host.innerHTML = sprite ? `<img src="${sprite}" alt="" />` : ($("#character-emojis").value.trim().split(/\s+/)[0] || "\U0001f94a");
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE / ADVANCED
// New fighters start simple - name/type per move plus one Generate button.
// Editing an existing fighter opens in Advanced so its tuned values are
// visible immediately.
// ─────────────────────────────────────────────────────────────────────────────
const advancedToggle = $("#advanced-toggle");
function applyAdvancedMode() { document.querySelector(".standalone-editor")?.classList.toggle("advanced-mode", advancedToggle.checked); }
advancedToggle.checked = Boolean(editingId);
applyAdvancedMode();
advancedToggle.onchange = applyAdvancedMode;

loadFighter();
