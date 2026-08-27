// ─────────────────────────────────────────────────────────────────────────────
// FIGHTER FORGE SOUND MANAGER
// A small polyphonic sample player built on the Web Audio API. Every sample is
// decoded once and cached; each call to play() spins up its own source node so
// overlapping hits (a jab into a counter, two fighters landing hits the same
// frame) never cut each other off the way a shared <audio> element would.
// ─────────────────────────────────────────────────────────────────────────────
const BASE = "uploads/Sounds/";

// Semantic key -> pool of interchangeable takes. play() picks one at random so
// the same move doesn't sound identical on every repeat.
const REGISTRY = {
  // Movement
  jumpHigh: ["002_highjump_0.wav", "002_highjump_1.wav", "002_highjump_2.wav"],
  jumpRun: ["204_runjump_normal_0.wav", "204_runjump_normal_1.wav", "204_runjump_normal_2.wav"],
  airDash: ["000_airdash_0.wav", "000_airdash_1.wav", "000_airdash_2.wav"],
  airBackdash: ["001_airbackdash_0.wav", "001_airbackdash_1.wav", "001_airbackdash_2.wav"],
  evade: ["208_brake_normal.wav"],
  land: ["213_bound_0.wav", "213_bound_1.wav"],
  knockdown: ["209_down_normal_0.wav", "209_down_normal_1.wav"],
  recover: ["302_ukemi.wav"],

  // Swings by weight/character, keyed off a move's variant or motion
  swingLight: ["009_swing_rapier_0.wav", "009_swing_rapier_1.wav", "009_swing_rapier_2.wav"],
  swingMedium: ["006_swing_blade_0.wav", "006_swing_blade_1.wav", "006_swing_blade_2.wav"],
  swingHeavy: ["010_swing_sword_0.wav", "010_swing_sword_1.wav", "010_swing_sword_2.wav"],
  swingLow: ["007_swing_knife_0.wav", "007_swing_knife_1.wav", "007_swing_knife_2.wav"],
  swingReach: ["008_swing_pole_0.wav", "008_swing_pole_1.wav", "008_swing_pole_2.wav"],
  stab: ["012_stab_fast.wav", "012_stab_middle.wav", "012_stab_deep.wav"],
  spinSwing: ["011_spin_0.wav", "011_spin_1.wav", "011_spin_2.wav"],
  grappleSwing: ["003_swing_grap_0_0.wav", "004_swing_grap_1_0.wav", "005_swing_grap_2_0.wav"],
  throwComeout: ["107_throw_comeout.wav"],
  throwCatch: ["107_throw_catch.wav"],
  throwWhiff: ["108_attack_offset.wav"],

  // Elemental casts
  thunder: ["013_thunder_0.wav", "013_thunder_1.wav"],
  electric: ["014_electric_s.wav", "014_electric_sl.wav", "014_electric_m.wav"],
  electricBig: ["014_electric_l.wav", "014_electric_ll.wav"],
  blaze: ["015_blaze_0.wav", "015_blaze_1.wav", "015_blaze_2.wav"],
  explode: ["016_explode_0.wav", "016_explode_1.wav", "016_explode_2.wav"],
  freezeCast: ["017_freeze_0.wav", "017_freeze_1.wav"],
  iceBreak: ["018_ice_break_0.wav", "018_ice_break_1.wav"],
  quake: ["019_quake_0.wav", "019_quake_1.wav"],
  boneCrack: ["021_bonecleak_0.wav", "021_bonecleak_1.wav"],
  magicCircle: ["022_magiccircle_a.wav", "022_magiccircle_b.wav", "022_magiccircle_c.wav", "022_magiccircle_d.wav"],
  cloth: ["019_cloth_a.wav", "019_cloth_b.wav", "019_cloth_c.wav"],

  // Contact resolution
  hitSlash: ["101_hit_slash_0.wav", "101_hit_slash_1.wav", "101_hit_slash_2.wav", "101_hit_slash_3.wav"],
  hitGrap: ["100_hit_grap_0.wav", "100_hit_grap_1.wav", "100_hit_grap_2.wav", "100_hit_grap_3.wav"],
  hitCleanSlash: ["025_cleanhit_slash.wav"],
  hitCleanGrap: ["025_cleanhit_grap.wav"],
  counterSlash: ["103_hit_counter_slash_0.wav", "103_hit_counter_slash_1.wav", "103_hit_counter_slash_2.wav"],
  counterGrap: ["102_hit_counter_grap_0.wav", "102_hit_counter_grap_1.wav", "102_hit_counter_grap_2.wav"],
  guardSlash: ["105_guard_slash_0.wav", "105_guard_slash_1.wav", "105_guard_slash_2.wav"],
  guardGrap: ["104_guard_grap_0.wav", "104_guard_grap_1.wav", "104_guard_grap_2.wav"],
  guardCrush: ["106_guard_crush.wav"],
  blood: ["020_blood_0.wav", "020_blood_1.wav"],

  // Round / match flow
  getSet: ["024_getset_a.wav", "024_getset_b.wav"],
  ko: ["300_ko_normal.wav"],
  roundResult: ["403_result_get.wav"],
  matchWin: ["403_bonus_get.wav"],

  // Meter / super
  superStart: ["301_overdrive_start.wav"],
  superBurst: ["302_spsys_burst.wav"],
  exFlourish: ["302_spsys_rapid.wav"],
  meterReady: ["301_overdrive_ready.wav"],

  // UI
  menuCursor: ["400_menu_cursor_a.wav", "400_menu_cursor_b.wav"],
  menuSelect: ["400_menu_select.wav"],
  menuOk: ["400_menu_ok.wav"],
  menuStart: ["400_menu_start.wav"],
  menuCancel: ["400_menu_cancel.wav"],
  menuError: ["400_menu_error.wav"]
};

let ctx = null;
function getCtx() {
  if (!ctx) { const Ctor = window.AudioContext || window.webkitAudioContext; ctx = Ctor ? new Ctor() : null; }
  return ctx;
}
let masterGain = null;
function getMaster() {
  const context = getCtx(); if (!context) return null;
  if (!masterGain) { masterGain = context.createGain(); masterGain.gain.value = volume; masterGain.connect(context.destination); }
  return masterGain;
}

let volume = readStoredNumber("forge-sfx-volume", .8);
let muted = readStoredFlag("forge-sfx-muted", false);
function readStoredNumber(key, fallback) { try { const raw = Number(localStorage.getItem(key)); return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : fallback; } catch { return fallback; } }
function readStoredFlag(key, fallback) { try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw === "1"; } catch { return fallback; } }
function writeStored(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable - in-memory only */ } }

const bufferCache = new Map();
function loadBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  const context = getCtx();
  const promise = context
    ? fetch(url).then((response) => response.arrayBuffer()).then((data) => context.decodeAudioData(data)).catch(() => null)
    : Promise.resolve(null);
  bufferCache.set(url, promise);
  return promise;
}

// Unlock playback on the first user gesture - browsers suspend a fresh
// AudioContext until one occurs. Any click on the page satisfies it.
let unlocked = false;
function unlock() {
  if (unlocked) return;
  const context = getCtx(); if (!context) return;
  unlocked = true;
  if (context.state === "suspended") context.resume().catch(() => {});
}
["pointerdown", "keydown"].forEach((event) => document.addEventListener(event, unlock, { once: true, capture: true }));

const lastPlayed = new Map();
// Play one random take from a named pool. cooldown throttles spammy sources
// (rapid-jab hits, footstep-style triggers) so they don't stack into noise.
export function playSfx(key, { volume: gainLevel = 1, rate = 1, rateJitter = .05, cooldown = 0, pan = 0 } = {}) {
  if (muted) return;
  const pool = REGISTRY[key];
  if (!pool || !pool.length) return;
  const context = getCtx(); if (!context) return;
  if (cooldown > 0) {
    const now = context.currentTime, last = lastPlayed.get(key) || -Infinity;
    if (now - last < cooldown) return;
    lastPlayed.set(key, now);
  }
  const file = pool[Math.floor(Math.random() * pool.length)];
  loadBuffer(BASE + file).then((buffer) => {
    if (!buffer) return;
    if (context.state === "suspended") context.resume().catch(() => {});
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(.25, rate * (1 + (Math.random() * 2 - 1) * rateJitter));
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, gainLevel));
    const master = getMaster(); if (!master) return;
    if (pan && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(gain); gain.connect(panner); panner.connect(master);
    } else {
      source.connect(gain); gain.connect(master);
    }
    source.start(0);
  });
}

export function setSfxVolume(value) {
  volume = Math.max(0, Math.min(1, value));
  writeStored("forge-sfx-volume", String(volume));
  if (masterGain) masterGain.gain.value = volume;
}
export function getSfxVolume() { return volume; }
export function setSfxMuted(value) { muted = Boolean(value); writeStored("forge-sfx-muted", muted ? "1" : "0"); }
export function isSfxMuted() { return muted; }
export function toggleSfxMuted() { setSfxMuted(!muted); return muted; }

// A screen position in arena pixels (0..1280), converted to a soft left/right
// pan so the sound has a sense of where on screen it happened.
export function panFromX(x, width = 1280) { return Math.max(-1, Math.min(1, ((x / width) - .5) * 1.4)); }
