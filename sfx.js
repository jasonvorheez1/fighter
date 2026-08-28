// ─────────────────────────────────────────────────────────────────────────────
// FIGHTER FORGE SOUND MANAGER
// A small polyphonic sample player built on the Web Audio API. Every sample is
// decoded once and cached; each call to play() spins up its own source node so
// overlapping hits (a jab into a counter, two fighters landing hits the same
// frame) never cut each other off the way a shared <audio> element would.
//
// Some hosts (embedded iframes, restrictive sandboxes) block AudioContext or
// never let it leave "suspended" no matter how it is unlocked. Rather than go
// silent in that case, every play falls back to a plain <audio> element, which
// browsers gate on user-activation the same way but support far more widely.
// ─────────────────────────────────────────────────────────────────────────────
const BASE = "uploads/Sounds/";
const MAX_SFX_SECONDS = 1.9;

// Semantic key -> pool of interchangeable takes. play() picks one at random so
// the same move doesn't sound identical on every repeat.
const REGISTRY = {
  // Movement — each slot is one consistent sound; no genre-mixing fallbacks
  jumpHigh:     ["002_highjump_0.wav", "002_highjump_1.wav"],
  jumpRun:      ["204_runjump_normal_0.wav", "204_runjump_normal_1.wav"],
  airDash:      ["000_airdash_0.wav", "000_airdash_1.wav"],
  airBackdash:  ["001_airbackdash_0.wav", "001_airbackdash_1.wav"],
  evade:        ["208_brake_normal.wav"],
  frontstep:    ["uploads/frontstep.wav"],
  backstep:     ["uploads/backstep.wav"],
  slide:        ["uploads/sliding.wav"],
  roll:         ["uploads/total_roll.wav"],
  land:         ["213_bound_0.wav", "213_bound_1.wav"],
  knockdown:    ["209_down_normal_0.wav", "209_down_normal_1.wav"],
  recover:      ["302_ukemi.wav"],

  // Swings — pools kept tight; 2 takes of the same sample family only
  swingLight:       ["009_swing_rapier_0.wav", "009_swing_rapier_1.wav"],
  swingMedium:      ["006_swing_blade_0.wav", "006_swing_blade_1.wav"],
  swingHeavy:       ["010_swing_sword_0.wav", "010_swing_sword_1.wav"],
  swingLow:         ["007_swing_knife_0.wav", "007_swing_knife_1.wav"],
  swingReach:       ["008_swing_pole_0.wav", "008_swing_pole_1.wav"],
  swingPunchLight:  ["uploads/swing_punch_l.wav"],
  swingPunchMedium: ["uploads/swing_punch_m.wav"],
  swingPunchHeavy:  ["uploads/swing_punch_h.wav"],
  swingKickLight:   ["uploads/swing_kick_l.wav"],
  swingKickMedium:  ["uploads/swing_kick_m.wav"],
  swingKickHeavy:   ["uploads/swing_kick_h.wav"],
  swingHammerHeavy: ["uploads/uc_hatsudou_f.wav", "uploads/uc_hatsudou_r.wav"],
  swingHammerSpin:  ["uploads/akebono_shun_sp_f.wav", "uploads/akebono_shun_sp_r.wav"],
  swingCharge:      ["uploads/akebono_f.wav", "uploads/akebono_r.wav"],
  stab:             ["012_stab_fast.wav", "012_stab_middle.wav"],
  spinSwing:        ["011_spin_0.wav", "011_spin_1.wav"],
  lightPunchSnap:   ["sfx/light_punch_snap.wav"],
  mediumStrikeThump:["sfx/medium_strike_thump.wav"],
  heavyWeaponCrush: ["sfx/heavy_weapon_crush.wav"],
  guardPushBlast:   ["sfx/guard_push_blast.wav"],
  bounceRebound:    ["sfx/bounce_rebound.wav"],
  grappleSwing:     ["003_swing_grap_0_0.wav", "004_swing_grap_1_0.wav"],
  throwComeout:     ["107_throw_comeout.wav"],
  throwCatch:       ["107_throw_catch.wav", "uploads/hit_grip.wav"],
  throwWhiff:       ["006_swing_blade_0.wav", "006_swing_blade_1.wav"],
  throwImpact:      ["uploads/throwhit_norm.wav", "uploads/throwhit_big.wav"],

  // Elemental casts
  thunder:      ["014_electric_sl.wav", "014_electric_m.wav"],
  electric:     ["014_electric_s.wav", "014_electric_sl.wav"],
  electricBig:  ["014_electric_l.wav", "014_electric_ll.wav"],
  blaze:        ["015_blaze_0.wav", "015_blaze_1.wav"],
  explode:      ["016_explode_0.wav", "016_explode_1.wav"],
  freezeCast:   ["017_freeze_0.wav", "017_freeze_1.wav"],
  iceBreak:     ["018_ice_break_0.wav", "018_ice_break_1.wav"],
  quake:        ["019_quake_0.wav", "019_quake_1.wav"],
  boneCrack:    ["021_bonecleak_0.wav", "021_bonecleak_1.wav"],
  magicCircle:  ["022_magiccircle_a.wav", "022_magiccircle_c.wav"],
  specialCast:  ["uploads/efx_elec.wav", "uploads/efx_out.wav"],
  specialExplode:["uploads/efx_expl.wav", "016_explode_0.wav"],
  cloth:        ["019_cloth_a.wav", "019_cloth_b.wav"],

  // Contact resolution — each weight class stays within its own family
  hitSlash:       ["101_hit_slash_1.wav", "101_hit_slash_2.wav"],
  hitGrap:        ["100_hit_grap_1.wav", "100_hit_grap_2.wav"],
  hitCleanSlash:  ["103_hit_counter_slash_2.wav"],
  hitCleanGrap:   ["102_hit_counter_grap_0.wav"],
  hitPunchLight:  ["uploads/hit_punch_l.wav"],
  hitPunchMedium: ["uploads/hit_punch_m.wav"],
  hitPunchHeavy:  ["uploads/hit_punch_h.wav"],
  hitKickLight:   ["uploads/hit_kick_l.wav"],
  hitKickMedium:  ["uploads/hit_kick_m.wav"],
  hitKickHeavy:   ["uploads/hit_kick_h.wav"],
  hitBone:        ["uploads/hit_bone.wav"],
  hitGround:      ["uploads/hit_ground.wav"],
  hitSting:       ["uploads/hit_sting.wav"],
  counterSlash:   ["103_hit_counter_slash_1.wav", "103_hit_counter_slash_2.wav"],
  counterGrap:    ["102_hit_counter_grap_0.wav", "102_hit_counter_grap_1.wav"],
  guardSlash:     ["105_guard_slash_0.wav", "105_guard_slash_1.wav"],
  guardGrap:      ["104_guard_grap_0.wav", "104_guard_grap_1.wav"],
  guardCrush:     ["uploads/hit_maximum.wav", "019_quake_0.wav"],
  blood:          ["020_blood_0.wav", "020_blood_1.wav"],

  // Round / match flow
  getSet:       ["024_getset_a.wav", "024_getset_b.wav"],
  koImpact:     ["ko_impact_new.wav"],
  koCollapse:   ["ko_collapse_new.wav"],
  koSting:      ["ko_sting_new.wav"],
  roundResult:  ["403_result_get.wav"],
  matchWin:     ["match_victory_new.wav"],

  // Meter / super
  superStart:   ["302_spsys_c_assault.wav"],
  superBurst:   ["302_spsys_c_assault.wav"],
  exFlourish:   ["302_spsys_rapid.wav"],
  meterReady:   ["302_spsys_rapid.wav"],
  meterCharge:  ["uploads/gauge_sc_f.wav", "uploads/gauge_sc_r.wav"],
  superCharge:  ["uploads/gauge_uc2_f.wav", "uploads/gauge_uc2_r.wav"],

  // UI
  menuCursor:   ["400_menu_cursor_a.wav", "400_menu_cursor_b.wav"],
  menuSelect:   ["400_menu_select.wav"],
  menuOk:       ["400_menu_ok.wav"],
  menuStart:    ["400_menu_start.wav"],
  menuCancel:   ["400_menu_cancel.wav"],
  menuError:    ["400_menu_error.wav"]
};

let volume = readStoredNumber("forge-sfx-volume", .8);
let muted = readStoredFlag("forge-sfx-muted", false);
// localStorage returns null for a missing key, and Number(null) is 0. Check
// for that absence explicitly so a first-time visitor gets the intended .8
// volume instead of every sound being silently multiplied to zero.
function readStoredNumber(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null || stored.trim() === "") return fallback;
    const raw = Number(stored);
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : fallback;
  } catch { return fallback; }
}
function readStoredFlag(key, fallback) { try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw === "1"; } catch { return fallback; } }
function writeStored(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable - in-memory only */ } }

// ── Web Audio path ──────────────────────────────────────────────────────────
let ctx = null, ctxFailed = false;
function getCtx() {
  if (ctxFailed) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { ctxFailed = true; return null; }
    try { ctx = new Ctor(); } catch { ctxFailed = true; return null; }
  }
  return ctx;
}
let masterGain = null;
function getMaster() {
  const context = getCtx(); if (!context) return null;
  if (!masterGain) { masterGain = context.createGain(); masterGain.gain.value = volume; masterGain.connect(context.destination); }
  return masterGain;
}

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

function playViaWebAudio(url, { volume: gainLevel, rate, rateJitter, pan }) {
  const context = getCtx(); if (!context) return false;
  loadBuffer(url).then((buffer) => {
    if (!buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const playbackRate = Math.max(.25, rate * (1 + (Math.random() * 2 - 1) * rateJitter));
    source.playbackRate.value = playbackRate;
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
    // Keep the audible result under two seconds even if a future registry edit
    // accidentally points at a long asset. The buffer duration is scaled by
    // playback rate so slow-motion sounds remain within the same real-time cap.
    source.start(0, 0, Math.min(buffer.duration, MAX_SFX_SECONDS * playbackRate));
  });
  return true;
}

// ── <audio> element fallback ────────────────────────────────────────────────
// Used whenever Web Audio is unavailable, or its context refuses to leave
// "suspended" (some embedded/sandboxed hosts block AudioContext outright but
// still honor a plain media element's play() after a real user gesture).
const elementPool = new Map(); // url -> array of idle <audio> elements
function playViaElement(url, { volume: gainLevel, rate }) {
  let pool = elementPool.get(url);
  if (!pool) { pool = []; elementPool.set(url, pool); }
  let el = pool.find((candidate) => candidate.paused || candidate.ended);
  if (!el) {
    el = new Audio(url);
    el.preload = "auto";
    if (pool.length < 4) pool.push(el); // cap concurrent overlaps per sound
  }
  el.currentTime = 0;
  el.volume = Math.max(0, Math.min(1, gainLevel * volume));
  el.playbackRate = Math.max(.25, rate);
  const clipToken = Symbol("sfx-clip");
  el._sfxClipToken = clipToken;
  el.play().catch(() => { /* still blocked - nothing more to try */ });
  window.setTimeout(() => {
    if (el._sfxClipToken === clipToken && !el.paused) { el.pause(); el.currentTime = 0; }
  }, Math.ceil(MAX_SFX_SECONDS * 1000));
}

// ── Unlock: keep trying on every early gesture until audio actually plays ──
// once:true on a single event type is not reliable enough across hosts - some
// browsers need the resume() call on the exact gesture that later triggers
// sound, not an earlier unrelated one. So this keeps listening (cheaply) until
// the context reports "running", rather than assuming the first try worked.
let webAudioUnlocked = false;
function attemptUnlock() {
  if (webAudioUnlocked) return;
  const context = getCtx();
  if (!context) return; // Web Audio unavailable - the element fallback needs no unlocking step
  if (context.state === "running") { webAudioUnlocked = true; detachUnlockListeners(); return; }
  context.resume().then(() => {
    if (context.state === "running") { webAudioUnlocked = true; detachUnlockListeners(); }
  }).catch(() => {});
}
const unlockEvents = ["pointerdown", "keydown", "touchstart", "click"];
function detachUnlockListeners() { unlockEvents.forEach((event) => document.removeEventListener(event, attemptUnlock, true)); }
unlockEvents.forEach((event) => document.addEventListener(event, attemptUnlock, { capture: true }));

// Called directly from the buttons that start play (start match, rematch,
// the sound toggle) so unlocking happens synchronously inside that exact
// click's call stack, rather than only hoping a separate global listener won.
export function primeSfx() { attemptUnlock(); }

const lastPlayed = new Map();
// Play one random take from a named pool. cooldown throttles spammy sources
// (rapid-jab hits, footstep-style triggers) so they don't stack into noise.
export function playSfx(key, { volume: gainLevel = 1, rate = 1, rateJitter = .015, cooldown = 0, pan = 0 } = {}) {
  if (muted) return;
  const pool = REGISTRY[key];
  if (!pool || !pool.length) return;
  if (cooldown > 0) {
    const now = (getCtx()?.currentTime) ?? performance.now() / 1000;
    const last = lastPlayed.get(key) || -Infinity;
    if (now - last < cooldown) return;
    lastPlayed.set(key, now);
  }
  const file = pool[Math.floor(Math.random() * pool.length)];
  const url = file.startsWith("sfx/") || file.startsWith("uploads/") || file.startsWith("/") || /^https?:\/\//i.test(file) ? file : BASE + file;
  attemptUnlock();
  const context = getCtx();
  // Web Audio only actually produces sound once its context is running; if it
  // is stuck suspended (or unavailable at all) go straight to the fallback so
  // a blocked AudioContext never means total silence.
  const usedWebAudio = context && context.state === "running" && playViaWebAudio(url, { volume: gainLevel, rate, rateJitter, pan });
  if (!usedWebAudio) playViaElement(url, { volume: gainLevel, rate });
}

// Creator-uploaded move sounds take the same decoded/pool-backed route as the
// built-in bank. The URL is validated again at the edge of playback so a
// malformed fighter config cannot turn into a media request.
export function playUploadedSfx(url, { volume: gainLevel = 1, rate = 1, rateJitter = .03, cooldown = 0, pan = 0 } = {}) {
  if (muted || !/^https?:\/\/[^\s"'<>]+$/i.test(String(url || ""))) return;
  const key = `uploaded:${url}`;
  if (cooldown > 0) {
    const now = (getCtx()?.currentTime) ?? performance.now() / 1000;
    const last = lastPlayed.get(key) || -Infinity;
    if (now - last < cooldown) return;
    lastPlayed.set(key, now);
  }
  attemptUnlock();
  const context = getCtx();
  const usedWebAudio = context && context.state === "running" && playViaWebAudio(url, { volume: gainLevel, rate, rateJitter, pan });
  if (!usedWebAudio) playViaElement(url, { volume: gainLevel, rate });
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
