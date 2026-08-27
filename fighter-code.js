const cleanText = (value, fallback, max) => {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
};

const clampInt = (value, min, max, fallback) => Math.min(max, Math.max(min, Math.round(Number(value) || fallback)));
const clampNumber = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;

function sanitizeAiProfile(value, fallback = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const archetypes = ["rushdown", "zoner", "grappler", "balanced"];
  const list = (candidate, backup) => (Array.isArray(candidate) ? candidate : Array.isArray(backup) ? backup : [])
    .map((item) => String(item || "").trim().slice(0, 32)).filter(Boolean).slice(0, 6);
  return {
    archetype: archetypes.includes(String(raw.archetype || base.archetype)) ? String(raw.archetype || base.archetype) : "balanced",
    aggression: clampNumber(raw.aggression, 0, 1.2, clampNumber(base.aggression, 0, 1.2, .74)),
    idealGap: clampNumber(raw.idealGap, 80, 500, clampNumber(base.idealGap, 80, 500, 205)),
    blockBias: clampNumber(raw.blockBias, .25, 1.8, clampNumber(base.blockBias, .25, 1.8, 1)),
    jumpBias: clampNumber(raw.jumpBias, 0, 1.8, clampNumber(base.jumpBias, 0, 1.8, .85)),
    zoneBias: clampNumber(raw.zoneBias, 0, 2.2, clampNumber(base.zoneBias, 0, 2.2, .75)),
    punish: clampNumber(raw.punish, .25, 1.8, clampNumber(base.punish, .25, 1.8, 1)),
    patience: clampNumber(raw.patience, .15, 1.5, clampNumber(base.patience, .15, 1.5, .6)),
    antiAir: clampNumber(raw.antiAir, 0, 1.5, clampNumber(base.antiAir, 0, 1.5, .72)),
    comboCommit: clampNumber(raw.comboCommit, .25, 1.2, clampNumber(base.comboCommit, .25, 1.2, .72)),
    preferredMoves: list(raw.preferredMoves, base.preferredMoves),
    avoidMoves: list(raw.avoidMoves, base.avoidMoves)
  };
}

export function parseAiJson(content) {
  const source = String(content || "").trim().replace(/^```(?:json|javascript)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI returned an invalid fighter object.");
    return parsed;
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(source.slice(start, end + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch { /* Fall through to a useful user-facing error. */ }
    }
    throw new Error("AI returned malformed fighter JSON. Try forging again.");
  }
}

export function extractEmojis(value, fallback = ["👊", "⚡", "💥"]) {
  const source = Array.isArray(value) ? value.join(" ") : String(value || "");
  const found = source.match(/\p{Extended_Pictographic}/gu) || [];
  return (found.length ? found : fallback).slice(0, 6);
}

export function sanitizeFighter(raw = {}, normalizeMove, fallback = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const config = {
    ...fallback,
    name: cleanText(source.name, cleanText(fallback.name, "Neon Fighter", 24), 24),
    author: cleanText(source.author, cleanText(fallback.author, "Forge Author", 24), 24),
    style: cleanText(source.style, cleanText(fallback.style, "Original arcade fighter", 60), 60),
    personality: cleanText(source.personality, cleanText(fallback.personality, "determined", 80), 80),
    backstory: cleanText(source.backstory, cleanText(fallback.backstory, "A new challenger steps into the arena.", 240), 240),
    // The arena uses a universal six-button layout for every fighter.
    buttons: 6,
    combo: clampInt(source.combo, 1, 5, Number(fallback.combo) || 3),
    color: color(source.color, color(fallback.color, "#53d8ff")),
    accent: color(source.accent, color(fallback.accent, "#ff5b52")),
    ai: sanitizeAiProfile(source.ai, fallback.ai),
    emojis: extractEmojis(source.emojis, extractEmojis(fallback.emojis)),
    banter: Array.isArray(source.banter) ? source.banter.slice(0, 2).map((line, index) => cleanText(line, fallback.banter?.[index] || "The arena is ready.", 120)) : (fallback.banter || ["The arena is ready.", "Show me what you forged."])
  };
  const moves = Array.isArray(source.specials) && source.specials.length ? source.specials : (Array.isArray(fallback.specials) ? fallback.specials : []);
  const seen = new Set();
  // Six universal buttons plus up to 4 flashier specials - see editor.js for how the
  // two are split back apart for editing.
  config.specials = moves.slice(0, 10).map((move) => normalizeMove(move, config)).filter((move) => {
    const key = move.name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return config;
}

function serializableMove(move) {
  const output = {
    name: move.name,
    type: move.type,
    role: move.role,
    variant: move.variant,
    launcher: move.launcher === true,
    crouch: move.crouch === true,
    air: move.air === true,
    startup: move.startup,
    active: move.active,
    endlag: move.endlag,
    hitstun: move.hitstun,
    juggle: move.juggle,
    visual: move.visual,
    behavior: move.behavior,
    animation: move.animation
  };
  if (Number(move.reach) > 0) output.reach = move.reach;
  // Inert to the fight engine - only used by the editor to redraw a saved
  // fighter's moves into the right "normal" or "special" list.
  if (move.category === "normal" || move.category === "special") output.category = move.category;
  // A follow-up is a whole move in its own right, so it round-trips through the
  // same serializer - one level deep, which is all the engine allows.
  if (move.followUp) {
    output.followUp = serializableMove(move.followUp);
    output.followUpWindow = move.followUpWindow;
  }
  return output;
}

export function buildFighterModule(data, normalizeMove) {
  const fighter = sanitizeFighter(data, normalizeMove, data);
  const source = {
    name: fighter.name,
    author: fighter.author,
    style: fighter.style,
    personality: fighter.personality,
    backstory: fighter.backstory,
    buttons: fighter.buttons,
    comboAptitude: fighter.combo,
    attacks: fighter.emojis,
    color: fighter.color,
    accent: fighter.accent,
    ai: fighter.ai,
    banter: fighter.banter,
    specials: fighter.specials.map(serializableMove)
  };
  return `// Fighter Forge combat module\n// Generated from a validated moveset blueprint.\n// Frame data is authored at 60 FPS; VFX hooks point to local transparent PNG assets.\nexport const fighter = ${JSON.stringify(source, null, 2)};\nexport default fighter;`;
}
