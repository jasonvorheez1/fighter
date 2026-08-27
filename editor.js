import { VFX_ENTRIES, VFX_IDS, VFX_DEFAULTS, MAIN_VFX_ENTRIES, HIT_VFX_ENTRIES } from "./vfx-data.js";
import { parseAiJson, sanitizeFighter, buildFighterModule } from "./fighter-code.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let editingId = params.get("id");
let currentFighter = null;
let portraitUrl = null;
let activeAssetRequest = null;

const types = ["melee", "projectile", "combo", "trap", "grapple", "freeze", "teleport", "pillar", "bomb", "gun"];
const effects = ["arc", "orb", "slashes", "rune", "beam", "burst", "grapple", "freeze", "teleport", "pillar"];
const elements = ["fire", "ice", "stone", "lightning", "shadow", "energy"];
const motions = ["none", "projectile", "trap", "dash", "dash-attack", "dive-kick", "rapid-jab", "charge", "bomb", "pull", "grapple", "teleport", "pillar", "gun", "wall-slam", "spin", "multi-uppercut", "fly-in", "ground-pound"];
const patterns = ["straight", "arc", "fan", "boomerang", "orbit", "rain"];
const styles = ["strike", "kick", "spin", "grapple", "slam", "dash", "cast"];
const windups = ["none", "coil", "crouch", "reach", "hop", "spin"];
const contacts = ["fist", "foot", "grab", "hook", "body", "energy", "slash"];
const finishes = ["recoil", "follow-through", "throw", "slam", "spin", "snap", "hold"];
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
// Older saved fighters have no move.category. A normal is a fast, close-range,
// no-frills button; anything ranged, a grab, a launcher, or slow is a special.
function inferCategory(move) {
  if (move.category === "normal" || move.category === "special") return move.category;
  const type = String(move.type || "melee");
  const rangedType = ["projectile", "trap", "freeze", "pillar", "bomb", "gun"].includes(type);
  const startup = Number(move.startup) || 0;
  if (rangedType || type === "grapple" || move.launcher === true || startup > 10) return "special";
  return "normal";
}
const CATEGORY_CAP = { normal: 3, special: 4 };
const CATEGORY_LABEL = { normal: "NORMAL", special: "SPECIAL" };
const vfxLabels = Object.fromEntries(VFX_ENTRIES.map((entry) => [entry.id, `${entry.name} · ${entry.frames.length}F`]));
const mainVfxIds = MAIN_VFX_ENTRIES.map((entry) => entry.id);
const hitVfxIds = HIT_VFX_ENTRIES.map((entry) => entry.id);
const moveVfxDefaults = Object.fromEntries(Object.entries(VFX_DEFAULTS).map(([type, value]) => [type, value]));

function normalizeMove(move = {}, fighterConfig = {}) {
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
  const vfxDefault = moveVfxDefaults[type] || VFX_DEFAULTS.melee;
  visual.mainVfx = VFX_IDS.has(visual.mainVfx) ? visual.mainVfx : vfxDefault.mainVfx;
  visual.hitVfx = VFX_IDS.has(visual.hitVfx) ? visual.hitVfx : vfxDefault.hitVfx;
  visual.vfxFps = number(visual.vfxFps, 6, 30, 18);
  behavior.motion = motions.includes(behavior.motion) ? behavior.motion : behaviorDefaults[type].motion;
  behavior.speed = number(behavior.speed, 0, 700, behaviorDefaults[type].speed);
  behavior.radius = number(behavior.radius, 0, 140, behaviorDefaults[type].radius);
  behavior.shots = Math.round(number(behavior.shots, 1, 3, behaviorDefaults[type].shots));
  behavior.lifetime = number(behavior.lifetime, .35, 3, behaviorDefaults[type].lifetime || 1.2);
  behavior.hold = number(behavior.hold, .08, 1.2, behaviorDefaults[type].hold || .2);
  behavior.freeze = number(behavior.freeze, .25, 2.5, behaviorDefaults[type].freeze || .95);
  behavior.offset = number(behavior.offset, 40, 180, behaviorDefaults[type].offset || 92);
  behavior.charge = number(behavior.charge, .12, 2.5, behaviorDefaults[type].charge || .5);
  behavior.chargePower = number(behavior.chargePower, .7, 2.5, behaviorDefaults[type].chargePower || 1.35);
  behavior.dashDistance = number(behavior.dashDistance, 30, 300, behaviorDefaults[type].dashDistance || 110);
  behavior.fuse = number(behavior.fuse, .18, 2.5, behaviorDefaults[type].fuse || .62);
  behavior.pattern = patterns.includes(behavior.pattern) ? behavior.pattern : (behaviorDefaults[type].pattern || "straight");
  behavior.gravity = number(behavior.gravity, -1600, 1600, 0);
  behavior.homing = number(behavior.homing, 0, 1, 0);
  behavior.spread = number(behavior.spread, -75, 75, behavior.pattern === "fan" ? 22 : 0);
  behavior.bounces = Math.round(number(behavior.bounces, 0, 3, 0));
  behavior.orbitRadius = number(behavior.orbitRadius, 24, 220, 84);
  behavior.orbitSpeed = number(behavior.orbitSpeed, -12, 12, 3.5);
  behavior.returnDelay = number(behavior.returnDelay, .15, 1.5, .62);
  const moveName = String(move.name || "").toLowerCase();
  const rapidJab = behavior.motion === "rapid-jab" || Number(behavior.rapidHits) > 1 || /rapid|ora|barrage|flurry|rush/.test(moveName) && /jab|punch|fist|barrage|rush/.test(moveName);
  const diveKick = behavior.motion === "dive-kick" || /dive.?kick|meteor kick|stomp kick/.test(moveName);
  if (rapidJab) behavior.motion = "rapid-jab";
  if (diveKick) behavior.motion = "dive-kick";
  if (/gun|pistol|revolver|rifle|blaster|magnum|bullet|shotgun/.test(moveName)) behavior.motion = "gun";
  if (/wall ?slam|wall ?punch|into the wall/.test(moveName)) behavior.motion = "wall-slam";
  if (/spin|whirl|cyclone|tornado|twister/.test(moveName)) behavior.motion = "spin";
  if (/shoryu|rising (fist|dragon|fury)|multi.?upper|triple.?upper/.test(moveName)) behavior.motion = "multi-uppercut";
  if (/fly.?in|soar|swoop|comet|air ?rush/.test(moveName)) behavior.motion = "fly-in";
  if (/ground ?pound|earth ?shaker|seismic|meteor ?slam/.test(moveName)) behavior.motion = "ground-pound";
  behavior.rapidHits = rapidJab ? Math.round(number(behavior.rapidHits, 2, 8, 5)) : 1;
  behavior.rapidInterval = number(behavior.rapidInterval, .045, .18, .075);
  behavior.status = ["none", "freeze"].includes(behavior.status) ? behavior.status : (type === "freeze" ? "freeze" : "none");
  behavior.element = elements.includes(behavior.element) ? behavior.element : visual.element;
  behavior.knockback = knockback(behavior.knockback, type, move);
  animation.style = styles.includes(animation.style) ? animation.style : animationDefaults[type].style;
  animation.windup = windups.includes(animation.windup) ? animation.windup : animationDefaults[type].windup;
  animation.contact = contacts.includes(animation.contact) ? animation.contact : animationDefaults[type].contact;
  animation.finish = finishes.includes(animation.finish) ? animation.finish : animationDefaults[type].finish;
  animation.intensity = number(animation.intensity, .45, 1.6, animationDefaults[type].intensity);
  animation.gesture = String(animation.gesture || ({ melee:"palm", projectile:"cast", combo:"spin", grapple:"clinch", freeze:"cast", teleport:"blink", pillar:"slam", trap:"rune", bomb:"bomb" }[type] || "strike")).toLowerCase().slice(0, 24);
  animation.transform = freeTransform(animation.transform);
  return {
    ...move, name: String(move.name || "Unnamed Move").slice(0, 28), type,
    role: roles.includes(move.role) ? move.role : "auto", variant: ["light", "medium", "heavy", "all"].includes(move.variant) ? move.variant : "medium",
    launcher: move.launcher === true || move.role === "launcher", crouch: move.crouch === true, air: move.air === true || diveKick, startup: number(move.startup, 1, 60, frames[0]), active: number(move.active, 1, 20, frames[1]),
    endlag: number(move.endlag, 1, 90, frames[2]), hitstun: number(move.hitstun, 1, 60, frames[3]), juggle: Math.round(number(move.juggle, 1, 15, type === "combo" ? 3 : 4)),
    reach: Number(move.reach) > 0 ? number(move.reach, 70, 520, 165) : undefined, visual, behavior, animation
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
function refreshCustomSpriteStatus(row) {
  const status = row.querySelector(".custom-sprite-status"), input = row.querySelector('[data-field="visual.spriteUrl"]');
  if (!status) return;
  status.textContent = input?.value ? "CUSTOM SPRITE ATTACHED · EMOJI FALLBACK REPLACED" : "NO CUSTOM SPRITE · EMOJI FALLBACK READY";
  status.classList.toggle("attached", Boolean(input?.value));
}

function listFor(category) { return $(category === "normal" ? "#normal-list" : "#special-list"); }
function buildMoveRow(move, category) {
  const normalized = normalizeMove(move, currentFighter?.config || {}), visual = normalized.visual, behavior = normalized.behavior, animation = normalized.animation;
  const row = document.createElement("article"); row.className = "special-editor"; row.dataset.category = category;
  row.innerHTML = `<div class="move-card-heading"><div class="move-heading-copy"><strong>${CATEGORY_LABEL[category]} <span class="move-number">1</span></strong><span class="move-summary"></span></div><div class="move-card-actions"><button type="button" class="generate-move" title="Generate this move with AI">✦</button><button type="button" class="remove-move" title="Remove move">×</button></div></div>
    <div class="move-quick">${field("Name", "name", normalized.name)}${selectField("Type", "type", types, normalized.type)}</div>
    <div class="move-advanced advanced-only">
    <div class="move-core">${selectField("Combo role", "role", roles, normalized.role)}${selectField("Variant", "variant", ["light", "medium", "heavy", "all"], normalized.variant)}<label class="check-field">Launcher<input data-field="launcher" type="checkbox" ${normalized.launcher ? "checked" : ""}></label><label class="check-field">Crouching<input data-field="crouch" type="checkbox" ${normalized.crouch ? "checked" : ""}></label><label class="check-field">Air ready<input data-field="air" type="checkbox" ${normalized.air ? "checked" : ""}></label></div>
    <div class="move-frame-grid">${field("Startup", "startup", normalized.startup, "number", "min=1 max=60")}${field("Active", "active", normalized.active, "number", "min=1 max=20")}${field("Endlag", "endlag", normalized.endlag, "number", "min=1 max=90")}${field("Hitstun", "hitstun", normalized.hitstun, "number", "min=1 max=60")}${field("Reach", "reach", normalized.reach || "", "number", "min=70 max=520 placeholder=auto")}${field("Juggle cost", "juggle", normalized.juggle, "number", "min=1 max=15")}</div>
    <details class="move-recipe"><summary>Visual recipe <span>+</span></summary><div class="recipe-grid">${selectField("Main effect asset", "visual.mainVfx", mainVfxIds, visual.mainVfx, "", vfxLabels)}${selectField("Hit spark asset", "visual.hitVfx", hitVfxIds, visual.hitVfx, "", vfxLabels)}${field("VFX FPS", "visual.vfxFps", visual.vfxFps, "number", "min=6 max=30")}${selectField("Effect", "visual.effect", effects, visual.effect)}${selectField("Element", "visual.element", elements, visual.element)}${field("Primary", "visual.color", visual.color, "color")}${field("Secondary", "visual.secondary", visual.secondary, "color")}${field("Size", "visual.size", visual.size, "number", "min=12 max=130")}${field("Emoji", "visual.emoji", visual.emoji)}<label class="script-field">JavaScript visual program<textarea data-field="visual.script" rows="5">${escapeHtml(visual.script || "")}</textarea><small>AI-authored canvas code. It runs through the arena drawing API.</small></label></div><a class="recipe-library-link" href="vfx.html">BROWSE ALL 270 PNG ASSETS ↗</a><div class="custom-sprite-status" aria-live="polite"></div></details>
    <details class="move-recipe"><summary>Behavior recipe <span>+</span></summary><div class="recipe-grid">${selectField("Motion", "behavior.motion", motions, behavior.motion)}${selectField("Projectile path", "behavior.pattern", patterns, behavior.pattern)}${field("Rapid hits", "behavior.rapidHits", behavior.rapidHits, "number", "min=2 max=8")}${field("Hit interval", "behavior.rapidInterval", behavior.rapidInterval, "number", "min=.045 max=.18 step=.005")}${field("Speed", "behavior.speed", behavior.speed, "number", "min=0 max=700")}${field("Gravity", "behavior.gravity", behavior.gravity, "number", "min=-1600 max=1600")}${field("Homing", "behavior.homing", behavior.homing, "number", "min=0 max=1 step=.05")}${field("Spread degrees", "behavior.spread", behavior.spread, "number", "min=-75 max=75")}${field("Bounces", "behavior.bounces", behavior.bounces, "number", "min=0 max=3")}${field("Orbit radius", "behavior.orbitRadius", behavior.orbitRadius, "number", "min=24 max=220")}${field("Orbit speed", "behavior.orbitSpeed", behavior.orbitSpeed, "number", "min=-12 max=12 step=.1")}${field("Return delay", "behavior.returnDelay", behavior.returnDelay, "number", "min=.15 max=1.5 step=.05")}${field("Dash distance", "behavior.dashDistance", behavior.dashDistance, "number", "min=30 max=300")}${field("Charge seconds", "behavior.charge", behavior.charge, "number", "min=.12 max=2.5 step=.05")}${field("Charge power", "behavior.chargePower", behavior.chargePower, "number", "min=.7 max=2.5 step=.05")}${field("Bomb fuse", "behavior.fuse", behavior.fuse, "number", "min=.18 max=2.5 step=.05")}${field("Radius", "behavior.radius", behavior.radius, "number", "min=0 max=140")}${field("Shots", "behavior.shots", behavior.shots, "number", "min=1 max=3")}${field("Lifetime", "behavior.lifetime", behavior.lifetime, "number", "min=.35 max=3 step=.05")}${field("Hold", "behavior.hold", behavior.hold, "number", "min=.08 max=1.2 step=.05")}${field("Freeze", "behavior.freeze", behavior.freeze, "number", "min=.25 max=2.5 step=.05")}${field("Offset", "behavior.offset", behavior.offset, "number", "min=40 max=180")}${selectField("Status", "behavior.status", ["none", "freeze"], behavior.status)}${selectField("Element", "behavior.element", elements, behavior.element)}${selectField("Finisher", "behavior.finisher", ["slam", "throw"], behavior.finisher || "slam")}${field("KB power", "behavior.knockback.power", behavior.knockback.power, "number", "min=0 max=900")}${field("KB horizontal", "behavior.knockback.horizontal", behavior.knockback.horizontal, "number", "min=0 max=900")}${field("KB vertical", "behavior.knockback.vertical", behavior.knockback.vertical, "number", "min=0 max=900")}${field("KB angle", "behavior.knockback.angle", behavior.knockback.angle, "number", "min=-80 max=80")}${selectField("KB direction", "behavior.knockback.direction", ["away", "toward", "up", "down"], behavior.knockback.direction)}${field("Hitstop", "behavior.knockback.hitstop", behavior.knockback.hitstop, "number", "min=0 max=.2 step=.01")}</div></details>
    <details class="move-recipe"><summary>Animation recipe <span>+</span></summary><div class="recipe-grid">${selectField("Style", "animation.style", styles, animation.style)}${field("Gesture", "animation.gesture", animation.gesture)}${selectField("Windup", "animation.windup", windups, animation.windup)}${selectField("Contact", "animation.contact", contacts, animation.contact)}${selectField("Finish", "animation.finish", finishes, animation.finish)}${field("Intensity", "animation.intensity", animation.intensity, "number", "min=.45 max=1.6 step=.05")}${field("Rotate X", "animation.transform.rotateX", animation.transform.rotateX, "number", "min=-360 max=360")}${field("Rotate Y", "animation.transform.rotateY", animation.transform.rotateY, "number", "min=-360 max=360")}${field("Rotate Z", "animation.transform.rotateZ", animation.transform.rotateZ, "number", "min=-360 max=360")}${field("Spin", "animation.transform.spin", animation.transform.spin, "number", "min=-720 max=720")}${field("Spin speed", "animation.transform.spinSpeed", animation.transform.spinSpeed, "number", "min=-12 max=12 step=.1")}${field("Scale X", "animation.transform.scaleX", animation.transform.scaleX, "number", "min=.35 max=2.4 step=.05")}${field("Scale Y", "animation.transform.scaleY", animation.transform.scaleY, "number", "min=.35 max=2.4 step=.05")}${field("Skew X", "animation.transform.skewX", animation.transform.skewX, "number", "min=-.95 max=.95 step=.05")}${field("Skew Y", "animation.transform.skewY", animation.transform.skewY, "number", "min=-.95 max=.95 step=.05")}${field("Offset X", "animation.transform.offsetX", animation.transform.offsetX, "number", "min=-180 max=180")}${field("Offset Y", "animation.transform.offsetY", animation.transform.offsetY, "number", "min=-180 max=180")}${field("Orbit", "animation.transform.orbit", animation.transform.orbit, "number", "min=-1 max=1 step=.05")}${field("Pulse", "animation.transform.pulse", animation.transform.pulse, "number", "min=0 max=1 step=.05")}</div></details>
    </div>`;
  row.querySelector("[data-field=type]").onchange = (event) => {
    const defaults = frameDefaults[event.target.value];
    ["startup", "active", "endlag", "hitstun"].forEach((key, index) => { row.querySelector(`[data-field=${key}]`).value = defaults[index]; });
    refreshMoveCard(row);
  };
  row.querySelector(".remove-move").onclick = () => { row.remove(); renumberMoves(); markDirty(); refreshCodePreview(); };
  row.querySelector(".generate-move").onclick = () => regenerateSingleMove(row);
  row.addEventListener("input", () => { refreshMoveCard(row); markDirty(); });
  row.addEventListener("change", () => { refreshMoveCard(row); markDirty(); });
  row.insertAdjacentHTML("beforeend", `<input type="hidden" data-field="visual.spriteUrl" value="${escapeHtml(visual.spriteUrl || "")}">`);
  refreshMoveCard(row); refreshCustomSpriteStatus(row);
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
    $(`#${category}-count`).textContent = `${rows.length} / ${CATEGORY_CAP[category]}${category === "normal" ? " · QUICK, LOW-COMMITMENT BUTTONS" : " · THE FIGHTER'S SIGNATURE TOOLS"}`;
  }
}

function readValue(row, key) { const input = row.querySelector(`[data-field="${key}"]`); return input?.type === "checkbox" ? input.checked : input?.value; }
function setNested(target, path, value) { const parts = path.split("."); let cursor = target; parts.slice(0, -1).forEach(part => cursor = cursor[part] ||= {}); cursor[parts.at(-1)] = value; }
function readMove(row, category) {
  const move = { name: String(readValue(row, "name") || "").trim(), type: readValue(row, "type"), role: readValue(row, "role"), variant: readValue(row, "variant"), launcher: readValue(row, "launcher"), crouch: readValue(row, "crouch"), air: readValue(row, "air"), category };
  ["startup", "active", "endlag", "hitstun", "reach", "juggle"].forEach(key => { const value = readValue(row, key); if (value !== "" && value != null) move[key] = Number(value); });
  row.querySelectorAll("[data-field^='visual.'], [data-field^='behavior.'], [data-field^='animation.']").forEach(input => { const key = input.dataset.field; setNested(move, key, input.type === "number" ? Number(input.value) : input.value); });
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
  return { ...existing, name: $("#character-name").value.trim(), author: $("#character-author").value.trim() || "Forge Author", style: existing.style || "Original arcade fighter", personality: $("#character-personality").value.trim() || "determined", backstory: $("#character-backstory").value.trim() || "A new challenger steps into the arena.", emojis: safeEmojis($("#character-emojis").value), buttons: Number($("#character-buttons").value), combo: Number($("#character-combo").value), specials: collectMoves() };
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
  $("#character-prompt").value = fighter?.prompt || config.style || ""; $("#character-buttons").value = String(config.buttons || 4); $("#character-combo").value = String(config.combo || 3); $("#combo-value").textContent = comboLabel($("#character-combo").value);
  $("#character-emojis").value = (config.emojis || ["👊", "⚡", "🦵", "💥"]).join(" ");
  $("#normal-list").innerHTML = ""; $("#special-list").innerHTML = "";
  const moves = Array.isArray(config.specials) && config.specials.length ? config.specials : [
    { name:"Quick Jab", type:"melee", variant:"light", category:"normal", startup:4, active:2, endlag:10, hitstun:10 },
    { name:"Rising Launcher", type:"melee", variant:"heavy", launcher:true, category:"special" },
    { name:"Flash Arc", type:"projectile", variant:"light", category:"special" }
  ];
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
$("#portrait-upload").onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  $("#portrait-status").textContent = "Uploading portrait…";
  try { portraitUrl = await window.websim.upload(file); $("#portrait-status").textContent = "Portrait attached."; } catch { $("#portrait-status").textContent = "Portrait upload failed; the existing image will be kept."; }
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

const MOVE_SCHEMA_NOTE = `Each move needs name, category ("normal" or "special"), type (melee, projectile, combo, trap, grapple, freeze, teleport, pillar, bomb, or gun), role, variant, launcher, crouch, air, startup, active, endlag, hitstun, reach, juggle, visual, behavior, and animation. A "normal" move is a fast, low-commitment poke: melee, startup under 10, no exotic behavior - a jab, a kick, a low sweep. A "special" move is the character's signature tool and can use any type, motion, or behavior. Use the Fighter Forge VFX bank: mainVfx controls the move sequence and hitVfx is the exact contact spark. Keep frame data usable for real links. Juggle is the air-combo cost from 1-15; launchers should spend the opponent's finite juggle budget. Give every move a distinct animation.gesture such as jab, cross, hook, elbow, palm, knee, roundhouse, sweep, overhead, thrust, slam, spin, burst, cast, or a short custom label. Behavior motion may be none, projectile, trap, dash, dash-attack, dive-kick, rapid-jab, charge, bomb, pull, grapple, teleport, pillar, gun, wall-slam, spin, multi-uppercut, fly-in, or ground-pound. Rapid-jab uses behavior.rapidHits and behavior.rapidInterval; dive-kick moves are air:true and accelerate toward the floor. Charge moves use behavior.charge seconds and chargePower; dash-attack moves use behavior.dashDistance; bomb moves use behavior.fuse and radius for a timed area explosion. Gun moves use type gun and motion gun for a fast flat bullet. Wall-slam moves use motion wall-slam to send the victim skidding into the nearest wall. Spin and multi-uppercut moves use motion spin or multi-uppercut with hits and hitInterval for a rotating or rising multi-hit; multi-uppercut is always a launcher. Fly-in moves use motion fly-in to rocket the attacker across the screen. Ground-pound moves use motion ground-pound to slam down from the air with a landing shockwave. Add behavior.knockback {horizontal:0-900, vertical:0-900, power:0-900, angle:-80-80, direction:"away|toward|up|down", hitstop:0-0.2, carry:true|false, wallBounce:true|false, groundBounce:true|false} whenever the move needs custom impact. Add animation.transform {rotateX:-360-360, rotateY:-360-360, rotateZ:-360-360, spin:-720-720, spinSpeed:-12-12, scaleX:0.35-2.4, scaleY:0.35-2.4, skewX:-0.95-0.95, skewY:-0.95-0.95, offsetX:-180-180, offsetY:-180-180, orbit:-1-1, pulse:0-1} for any expressive motion. These are declarative controls for the body; each move MUST also include visual.script containing literal JavaScript code for its unique canvas visual. Return only the code body, no markdown or function wrapper. The restricted API is api.line, api.arc, api.ring, api.circle, api.spark, api.slash, api.streak, api.shock, api.wedge, api.flash, api.glow, and api.asset(vfxId,x,y,size,alpha,rotation). The script receives t, p, active, size, color, secondary, move, and Math. Use loops and trigonometry to make every attack visually distinct. Never use window, document, network, storage, timers, imports, constructors, or globals.`;
const MOVE_BEHAVIOR_GUIDE = `Expand the move design beyond basic straight attacks. Behavior may include pattern straight, arc, fan, boomerang, orbit, or rain; gravity, homing, spread, bounces, orbitRadius, orbitSpeed, and returnDelay are supported path controls. Combine them with charge, dash-attack, bomb, teleport, pillar, freeze, grapple, knockback, and expressive animation.transform values. Keep combat behavior declarative data, but write each move's visual.script as literal JavaScript drawing code using only the restricted visual API.`;

$("#generate-fighter").onclick = async () => {
  const prompt = $("#character-prompt").value.trim() || "Original arcade fighter";
  if (prompt.length < 8) { setStatus("Give the forge a little more to work with.", true); return; }
  const button = $("#generate-fighter"); button.disabled = true; setStatus("AI is designing the fighter\u2026");
  try {
    if (!window.websim?.chat?.completions?.create) throw new Error("AI is unavailable; edit the moves manually.");
    const system = `Design an original arcade fighting-game character. Return only JSON with name, author, style, personality, backstory, emojis, buttons (3-6), combo (1-5), and specials: up to 3 quick "normal" attacks plus up to 4 flashier "special" moves (7 max total). ${MOVE_SCHEMA_NOTE}`;
    const identityNote = `Creator-controlled fields are locked during this edit. Do not change the character name (${$("#character-name").value.trim() || currentFighter?.name || "blank"}), author (${$("#character-author").value.trim() || currentFighter?.author || "Forge Author"}), or portrait. Return only the moveset and any non-identity blueprint fields.`;
    const assetRequestGuide = `If a move truly needs a custom uploaded sprite or portrait, add an assetRequests entry with kind, moveIndex, moveName, title, prompt, and reason. This is a request for the creator, not a URL. Do not request an image for ordinary punches, kicks, projectiles, or effects that can read with the existing VFX bank and visual.emoji. If no custom image is needed, return assetRequests as an empty array.`;
    const completion = await window.websim.chat.completions.create({ messages: [{ role:"system", content:`${system} ${MOVE_BEHAVIOR_GUIDE} ${assetRequestGuide}` }, { role:"user", content:`${prompt}\n\n${identityNote}` }], json:true });
    const lockedName = $("#character-name").value.trim() || currentFighter?.name || "";
    const lockedAuthor = $("#character-author").value.trim() || currentFighter?.author || "Forge Author";
    const lockedPortrait = portraitUrl || currentFighter?.portrait_url || null;
    const raw = parseAiJson(completion.content);
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
    $("#character-name").value = made.name; $("#character-author").value = made.author; $("#character-personality").value = made.personality; $("#character-backstory").value = made.backstory; $("#character-buttons").value = String(made.buttons); $("#character-combo").value = String(made.combo); $("#combo-value").textContent = comboLabel($("#character-combo").value); $("#character-emojis").value = made.emojis.join(" ");
    $("#normal-list").innerHTML = ""; $("#special-list").innerHTML = "";
    // The model tags each move's category; fall back to a heuristic for moves
    // that skip it so the split always makes sense even if the model forgets.
    const normals = made.specials.filter((move) => inferCategory(move) === "normal").slice(0, CATEGORY_CAP.normal);
    const specials = made.specials.filter((move) => inferCategory(move) === "special").slice(0, CATEGORY_CAP.special);
    for (const move of normals) addMove(move, "normal");
    for (const move of specials) addMove(move, "special");
    renumberMoves(); refreshCodePreview(); markDirty(); updatePortraitPreview();
    if (assetRequests.length) { setStatus("The forge has a few optional visual ideas. Choose an upload or keep the emoji fallback."); await resolveAssetRequests(assetRequests); refreshCodePreview(); }
    setStatus(assetRequests.length ? "Fighter generated. Custom visuals were handled; ready to save." : "Fighter generated and ready to save.");
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
  if (!window.websim?.chat?.completions?.create) { setStatus("AI is unavailable; edit this move manually.", true); return; }
  button.disabled = true; button.textContent = "\u2026";
  try {
    const data = collectData();
    const siblingNames = [...$("#normal-list").children, ...$("#special-list").children]
      .filter((sibling) => sibling !== row)
      .map((sibling) => String(readValue(sibling, "name") || "").trim())
      .filter(Boolean);
    const system = `Design a single ${category} move for an original arcade fighting-game character. Return only JSON with one key, "move", holding the move object. ${MOVE_SCHEMA_NOTE} ${MOVE_BEHAVIOR_GUIDE}`;
    const context = [
      `Character: ${data.name || "unnamed fighter"}.`,
      data.style ? `Concept: ${data.style}.` : "",
      data.personality ? `Personality: ${data.personality}.` : "",
      `This move's category is fixed as "${category}".`,
      existingName ? `Keep the move named "${existingName}" and design around that name.` : "Invent a fitting name.",
      siblingNames.length ? `Avoid repeating or closely resembling these other moves this fighter already has: ${siblingNames.join(", ")}.` : ""
    ].filter(Boolean).join(" ");
    const completion = await window.websim.chat.completions.create({ messages: [{ role:"system", content:system }, { role:"user", content:context }], json:true });
    const raw = parseAiJson(completion.content);
    const moveData = raw && typeof raw === "object" && raw.move ? raw.move : raw;
    if (existingName) moveData.name = existingName;
    moveData.category = category;
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
