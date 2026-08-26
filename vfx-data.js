const range = (count) => Array.from({ length: count }, (_, index) => index + 1);
const files = (prefix, count, suffix = ".png") => range(count).map((number) => `uploads/${prefix}${number}${suffix}`);
const namedFiles = (names) => names.map((name) => `uploads/${name}`);

const sequence = (id, name, role, prefix, count, tags, options = {}) => ({
  id,
  name,
  role,
  kind: "sequence",
  frames: files(prefix, count, options.suffix || ".png"),
  fps: options.fps || 18,
  tags,
  note: options.note || "Animated transparent sequence"
});

const single = (id, name, role, file, tags, note = "Layer-ready transparent asset") => ({
  id,
  name,
  role,
  kind: "single",
  frames: [`uploads/${file.endsWith(".png") ? file : `${file}.png`}`],
  fps: 1,
  tags,
  note
});

export const VFX_GROUPS = [
  {
    id: "hit-sparks",
    label: "Hit sparks",
    kicker: "CONTACT / IMPACT",
    description: "Fast reads for the exact frame a move connects.",
    accent: "lime",
    entries: [
      sequence("hit_round_spark", "Round Spark", "hit-spark", "roundsparkleburst__", 14, ["universal", "burst", "light"] , { suffix: "_.png", note: "Clean all-purpose contact burst" }),
      sequence("hit_firework", "Firework Hit", "hit-spark", "roundfireworkburst__", 18, ["universal", "burst", "heavy"], { suffix: "_.png", note: "Expanding radial impact" }),
      sequence("hit_directional", "Directional Hit", "hit-spark", "directionalimpact1__", 7, ["side", "slash", "light"], { suffix: "_.png", note: "Pushes the eye in one direction" }),
      sequence("hit_middle_directional", "Middle Directional", "hit-spark", "middledirectionalimpact__", 5, ["center", "clean", "medium"], { suffix: "_.png", note: "Compact center-line impact" }),
      sequence("hit_bottom_directional", "Bottom Directional", "hit-spark", "bottomdirectionalimpact__", 7, ["launcher", "ground", "heavy"], { suffix: "_.png", note: "Low rising hit read" }),
      sequence("hit_symmetrical_1", "Symmetrical Impact A", "hit-spark", "symmetricalimpact1__", 7, ["center", "burst", "medium"], { suffix: "_.png", note: "Balanced symmetrical impact" }),
      sequence("hit_symmetrical_2", "Symmetrical Impact B", "hit-spark", "symmetricalimpact2__", 10, ["center", "burst", "heavy"], { suffix: "_.png", note: "Longer, louder contact burst" }),
      sequence("hit_symmetrical_3", "Symmetrical Impact C", "hit-spark", "symmetricalmipact3__", 7, ["center", "burst", "sharp"], { suffix: "_.png", note: "Sharp star-shaped contact" }),
      sequence("hit_stylized_explosion", "Stylized Explosion", "hit-spark", "stylizedexplosion__", 14, ["explosion", "heavy", "finisher"], { suffix: "_.png", note: "Large finisher impact" }),
      sequence("hit_vfx_pack", "VFX Hit Pack", "hit-spark", "VFX_1_Hit", 8, ["pack", "burst", "medium"], { note: "General purpose hit sequence" }),
      sequence("hit_wood", "Wood Hit", "hit-spark", "Wood_VFX_01_Hit", 7, ["wood", "ground", "heavy"], { note: "Earthy impact for slams and body blows" })
    ]
  },
  {
    id: "move-effects",
    label: "Main effects",
    kicker: "MOVE / ACTION",
    description: "Sequences that sell the move itself before and through contact.",
    accent: "cyan",
    entries: [
      sequence("main_slash_color1", "Slash / Gold", "main-effect", "Slash_color1_frame", 9, ["slash", "melee", "arc"], { note: "Short horizontal slash" }),
      sequence("main_slash2_color1", "Slash 2 / Gold", "main-effect", "Slash2_color1_frame", 7, ["slash", "melee", "follow-through"], { note: "Tighter secondary slash" }),
      sequence("main_slash3_color2", "Slash 3 / Red", "main-effect", "Slash3_color2_frame", 9, ["slash", "combo", "red"], { note: "Aggressive combo slash" }),
      sequence("main_slash3_color3", "Slash 3 / Blue", "main-effect", "Slash3_color3_frame", 9, ["slash", "combo", "blue"], { note: "Cool-toned combo slash" }),
      sequence("main_vfx_start", "VFX Start", "main-effect", "VFX_1_Start", 3, ["startup", "cast", "telegraph"], { note: "Very short windup accent" }),
      sequence("main_vfx_repeatable", "VFX Repeatable", "main-effect", "VFX_1_Repeatable", 10, ["loop", "cast", "projectile"], { note: "Repeatable casting or held effect" }),
      sequence("main_wood_repeatable", "Wood Repeatable", "main-effect", "Wood_VFX_01_Repeatable", 8, ["wood", "loop", "ground"], { note: "Repeatable earthy move layer" }),
      sequence("main_firework", "Round Firework", "main-effect", "roundfireworkburst__", 18, ["burst", "special", "finisher"], { suffix: "_.png", note: "Big radial special effect" }),
      sequence("main_musicburst", "Directional Music Burst", "main-effect", "diriectionalmusicburst1__", 18, ["directional", "burst", "special"], { suffix: "_.png", note: "Directional energy release" }),
      sequence("main_stylized_explosion", "Stylized Explosion", "main-effect", "stylizedexplosion__", 14, ["explosion", "special", "finisher"], { suffix: "_.png", note: "Large stylized move climax" })
    ]
  },
  {
    id: "modular-layers",
    label: "Modular layers",
    kicker: "LAYER / BUILD",
    description: "Small pieces for stacking fire, smoke, magic, trails, and hit texture.",
    accent: "coral",
    entries: [
      ...["smoke_06_a", "smoke_07_a", "smoke_07_strong_a", "smoke_08_a", "smoke_09_a", "smoke_10_a", "smoke_01_a", "smoke_02_a", "smoke_03_a", "smoke_04_a", "smoke_05_a"].map((file, index) => single(`layer_${file}`, `Smoke ${String(index + 1).padStart(2, "0")}`, "layer", file, ["smoke", "impact", "ground"])),
      ...["spark_01_a", "spark_02_a", "spark_03_a", "spark_04_a", "spark_05_a", "spark_06_a", "spark_07_a"].map((file, index) => single(`layer_${file}`, `Spark ${String(index + 1).padStart(2, "0")}`, "layer", file, ["spark", "hit", "accent"])),
      ...["spotlight_01_a", "spotlight_02_a", "spotlight_03_a", "spotlight_04_a", "spotlight_05_a", "spotlight_06_a", "spotlight_07_a", "spotlight_08_a"].map((file, index) => single(`layer_${file}`, `Spotlight ${String(index + 1).padStart(2, "0")}`, "layer", file, ["light", "stage", "cast"])),
      ...["star_01_a", "star_02_a", "star_03_a", "star_04_a", "star_05_a", "star_06_a", "star_07_a", "star_08_a", "star_09_a"].map((file, index) => single(`layer_${file}`, `Star ${String(index + 1).padStart(2, "0")}`, "layer", file, ["star", "hit", "accent"])),
      ...["symbol_01_a", "symbol_02_a"].map((file, index) => single(`layer_${file}`, `Symbol ${String(index + 1).padStart(2, "0")}`, "layer", file, ["symbol", "magic", "cast"])),
      ...["trace_01_a", "trace_02_a", "trace_03_a", "trace_04_a", "trace_05_a", "trace_06_a", "trace_07_a"].map((file, index) => single(`layer_${file}`, `Trace ${String(index + 1).padStart(2, "0")}`, "layer", file, ["trace", "trail", "slash"])),
      ...["twirl_01_a", "twirl_02_a", "twirl_03_a", "twirl_04_a"].map((file, index) => single(`layer_${file}`, `Twirl ${String(index + 1).padStart(2, "0")}`, "layer", file, ["twirl", "spin", "trail"])),
      ...["window_01_a", "window_02_a", "window_03_a", "window_04_a"].map((file, index) => single(`layer_${file}`, `Window ${String(index + 1).padStart(2, "0")}`, "layer", file, ["window", "teleport", "cast"])),
      ...["circle_01_a", "circle_02_a", "circle_03_a", "circle_04_a", "circle_05_a"].map((file, index) => single(`layer_${file}`, `Circle ${String(index + 1).padStart(2, "0")}`, "layer", file, ["circle", "rune", "trap"])),
      ...["dirt_01_a", "dirt_02_a", "dirt_03_a"].map((file, index) => single(`layer_${file}`, `Dirt ${String(index + 1).padStart(2, "0")}`, "layer", file, ["dirt", "ground", "slam"])),
      ...["effect_01_a", "effect_02_a", "effect_03_a"].map((file, index) => single(`layer_${file}`, `Effect ${String(index + 1).padStart(2, "0")}`, "layer", file, ["energy", "accent", "special"])),
      ...["fire_01_a", "fire_02_a"].map((file, index) => single(`layer_${file}`, `Fire ${String(index + 1).padStart(2, "0")}`, "layer", file, ["fire", "pillar", "ground"])),
      ...["flame_01_a", "flame_02_a", "flame_03_a", "flame_04_a", "flame_05_a", "flame_06_a"].map((file, index) => single(`layer_${file}`, `Flame ${String(index + 1).padStart(2, "0")}`, "layer", file, ["fire", "flame", "trail"])),
      single("layer_flare_01_a", "Flare", "layer", "flare_01_a.png", ["flare", "light", "hit"]),
      ...["light_01_a", "light_02_a", "light_03_a"].map((file, index) => single(`layer_${file}`, `Light ${String(index + 1).padStart(2, "0")}`, "layer", file, ["light", "energy", "accent"])),
      ...["magic_01_a", "magic_02_a", "magic_03_a", "magic_04_a", "magic_05_a"].map((file, index) => single(`layer_${file}`, `Magic ${String(index + 1).padStart(2, "0")}`, "layer", file, ["magic", "rune", "cast"])),
      ...["muzzle_01_a", "muzzle_02_a", "muzzle_03_a", "muzzle_04_a", "muzzle_05_a"].map((file, index) => single(`layer_${file}`, `Muzzle ${String(index + 1).padStart(2, "0")}`, "layer", file, ["muzzle", "projectile", "burst"])),
      ...["scorch_01_a", "scorch_02_a", "scorch_03_a"].map((file, index) => single(`layer_${file}`, `Scorch ${String(index + 1).padStart(2, "0")}`, "layer", file, ["scorch", "ground", "hit"])),
      single("layer_scratch_01_a", "Scratch", "layer", "scratch_01_a.png", ["scratch", "slash", "hit"]),
      ...["slash_01_a", "slash_02_a", "slash_03_a", "slash_04_a"].map((file, index) => single(`layer_${file}`, `Slash Layer ${String(index + 1).padStart(2, "0")}`, "layer", file, ["slash", "trail", "melee"]))
    ]
  }
];

export const VFX_ENTRIES = VFX_GROUPS.flatMap((group) => group.entries.map((entry) => ({ ...entry, groupId: group.id, groupLabel: group.label, groupAccent: group.accent })));
export const VFX_BY_ID = Object.fromEntries(VFX_ENTRIES.map((entry) => [entry.id, entry]));
export const VFX_IDS = new Set(VFX_ENTRIES.map((entry) => entry.id));
export const HIT_VFX_ENTRIES = VFX_ENTRIES.filter((entry) => entry.role === "hit-spark");
export const MAIN_VFX_ENTRIES = VFX_ENTRIES.filter((entry) => entry.role === "main-effect");
export const LAYER_VFX_ENTRIES = VFX_ENTRIES.filter((entry) => entry.role === "layer");
export const VFX_FRAME_COUNT = new Set(VFX_ENTRIES.flatMap((entry) => entry.frames)).size;

export const VFX_DEFAULTS = {
  melee: { mainVfx: "main_slash_color1", hitVfx: "hit_round_spark" },
  projectile: { mainVfx: "main_vfx_repeatable", hitVfx: "hit_firework" },
  combo: { mainVfx: "main_slash3_color2", hitVfx: "hit_directional" },
  trap: { mainVfx: "layer_magic_01_a", hitVfx: "hit_middle_directional" },
  grapple: { mainVfx: "main_wood_repeatable", hitVfx: "hit_wood" },
  freeze: { mainVfx: "layer_magic_03_a", hitVfx: "hit_symmetrical_3" },
  teleport: { mainVfx: "layer_window_01_a", hitVfx: "hit_stylized_explosion" },
  pillar: { mainVfx: "layer_fire_01_a", hitVfx: "hit_bottom_directional" },
  bomb: { mainVfx: "main_stylized_explosion", hitVfx: "hit_stylized_explosion" }
};

export function getVfx(id) {
  return VFX_BY_ID[id] || VFX_BY_ID.hit_round_spark;
}

export function framePath(id, frame = 0) {
  const entry = getVfx(id);
  return entry.frames[Math.abs(Math.floor(frame)) % entry.frames.length];
}
