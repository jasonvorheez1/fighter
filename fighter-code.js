const cleanText = (value, fallback, max) => {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
};

const clampInt = (value, min, max, fallback) => Math.min(max, Math.max(min, Math.round(Number(value) || fallback)));
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;

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
    buttons: clampInt(source.buttons, 3, 6, Number(fallback.buttons) || 4),
    combo: clampInt(source.combo, 1, 5, Number(fallback.combo) || 3),
    color: color(source.color, color(fallback.color, "#53d8ff")),
    accent: color(source.accent, color(fallback.accent, "#ff5b52")),
    emojis: extractEmojis(source.emojis, extractEmojis(fallback.emojis)),
    banter: Array.isArray(source.banter) ? source.banter.slice(0, 2).map((line, index) => cleanText(line, fallback.banter?.[index] || "The arena is ready.", 120)) : (fallback.banter || ["The arena is ready.", "Show me what you forged."])
  };
  const moves = Array.isArray(source.specials) && source.specials.length ? source.specials : (Array.isArray(fallback.specials) ? fallback.specials : []);
  const seen = new Set();
  config.specials = moves.slice(0, 5).map((move) => normalizeMove(move, config)).filter((move) => {
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
    banter: fighter.banter,
    specials: fighter.specials.map(serializableMove)
  };
  return `// Fighter Forge combat module\n// Generated from a validated moveset blueprint.\n// Frame data is authored at 60 FPS; VFX hooks point to local transparent PNG assets.\nexport const fighter = ${JSON.stringify(source, null, 2)};\nexport default fighter;`;
}
