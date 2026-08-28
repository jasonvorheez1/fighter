// Amy Rose — S-tier hammer bruiser. S means the AI executes every combo route
// and confirms every counter. Frame data is designed for clean, readable links
// so players and the AI both feel the combos clearly.
const HAMMER = "uploads/pikopikohamemr.png";
const CARD   = "uploads/tarotcards.png";
const AP = "#ff2d82", AS = "#fff0f8", AA = "#ff8dbf", AG = "#d97aff", AH = "#ffe566";

const amyVisual = (effect, color = AP, secondary = AS, size = 68, emoji = "❤", spriteUrl = HAMMER, vfx = "main_slash3_color2") => ({
  effect, color, secondary, size, emoji, spriteUrl, mainVfx: vfx, hitVfx: "hit_prismatic_impact", vfxFps: 20
});
const cardVisual = (color = AG, emoji = "✦") => ({
  effect: "rune", color, secondary: "#fff8df", size: 50, emoji, spriteUrl: CARD,
  mainVfx: "main_musicburst", hitVfx: "hit_round_spark", vfxFps: 18
});
const amyAnim = (style = "strike", gesture = "hammer") => ({
  style, windup: style === "kick" ? "hop" : style === "cast" ? "coil" : "coil",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "slam" ? "slam" : "follow-through",
  gesture, intensity: 1.2, puppet: true, puppetAmount: .88
});

// ── Visual scripts for signature moves ──────────────────────────────────────
const PPH_SCRIPT = "const sw=active?Math.sin(p*Math.PI):Math.max(0,p*2-1);const hx=size*.52*sw,hy=-size*.62*sw;api.line(-size*.08,0,hx,hy,color,18,active?.9:.38);api.line(-size*.08,0,hx,hy,secondary,7,active?.72:.26);if(active){api.flash(hx,hy,size*.78,secondary,.6);api.ring(hx,hy,size*.44,color,5,.68);api.glow(color,size*.55);}";

const HAMMER_JUMP_SCRIPT = "const rise=p*size*1.3;for(let i=0;i<3;i++){const a=p*Math.PI*9+i*Math.PI*2/3;api.slash(0,-rise+i*size*.28,size*(.52-i*.09),a,1.9,i%2?color:secondary,7,(active?.85:.28)*(1-i*.26));}if(active){api.spark(0,-rise,size*.72,secondary,.78,-Math.PI/2);api.ring(0,-rise,size*.42,color,5,.58);}";

const FORTUNE_CARD_SCRIPT = "const rot=p*Math.PI*6;for(let i=0;i<4;i++){const a=rot+i*Math.PI*.5;api.line(0,0,Math.cos(a)*size*.54,Math.sin(a)*size*.54,i%2?color:secondary,4,active?.74:.3);}api.ring(0,0,size*.36,color,4,active?.88:.36);if(active){api.flash(0,0,size*.52,secondary,.48);api.glow(secondary,size*.4);}";

const PIKO_UPPER_SCRIPT = "const lift=Math.max(0,p*2-0.05)*size*1.1;for(let i=0;i<2;i++){const off=i*size*.24;api.slash(off,-lift+size*.18,size*(.48-i*.06),-1.45+i*.22,1.4,i%2?color:secondary,8,(active?.88:.3)*(1-i*.3));}if(active){api.spark(0,-lift,size*.7,secondary,.82,-Math.PI/2);api.ring(0,-lift,size*.36,color,5,.64);}";

const ROSE_TORNADO_SCRIPT = "for(let i=0;i<4;i++){const a=p*Math.PI*10+i*Math.PI*.5;const r=size*(.38+i*.06);api.slash(Math.cos(a)*r*.25,Math.sin(a)*r*.25-size*.12,size*(.36+i*.04),a,1.6,i%2?color:secondary,6,(active?.8:.26)*(1-i*.2));}if(active){api.ring(0,-size*.12,size*.65,secondary,4,.52);}";

const HAMMER_DROP_SCRIPT = "if(active){api.wedge(0,0,size*1.2,size*.3,color,.4);api.streak(0,-size*.18,size*2.4,4,secondary,size*.18,.95);api.flash(0,size*.25,size*.75,secondary,.62);}else{const wave=(p-.3)/.7;if(wave>0){api.ring(0,size*.25,size*wave*1.8,color,6,(1-wave)*.72);api.ring(0,size*.25,size*wave*.9,secondary,3,(1-wave)*.54);}}";

const PIKO_COUNTER_SCRIPT = "if(active){api.flash(0,0,size*.95,secondary,.68);api.ring(0,0,size*.52,color,6,.78);api.shock(0,0,size*.65,secondary,.55);api.glow(secondary,size*.7);}else{api.ring(0,0,size*.42*(1-p),color,5,(1-p)*.55);}";

export const amy = {
  id: "amy-rose",
  name: "Amy Rose",
  author: "Sonic the Hedgehog",
  from: "Sonic the Hedgehog",
  portrait_url: "uploads/SRCAmy-4.png",
  example: false,
  prompt: "Amy Rose. An S-tier hammer bruiser who turns one touch into oppressive setplay, cards, and huge corner carry.",
  config: {
    name: "Amy Rose",
    author: "Sonic the Hedgehog",
    from: "Sonic the Hedgehog",
    style: "hammer bruiser / oppressive setplay / midrange rushdown",
    personality: "bright, confident, stubborn, and absolutely delighted to swing first",
    backstory: "A fortune-reading hammer bruiser who makes every prediction hurt twice.",
    levelletter: "S",
    health: 1050,
    power: 92,
    damageScale: 1.28,
    mechanic: "heartbeat",
    buttons: 6,
    combo: 5,
    smartness: 5,
    aggression: 5,
    defense: 5,
    speed: 4,
    range: 5,
    ai: {
      archetype: "rushdown",
      idealGap: 175,
      aggression: 1.28,
      blockBias: 1.44,
      jumpBias: .88,
      zoneBias: .52,
      punish: 1.38,
      patience: .64,
      antiAir: 1.4,
      comboCommit: 1.16,
      preferredMoves: ["rose step", "piko piko hammer", "piko upper", "fortune card", "hammer toss", "piko counter"],
      avoidMoves: []
    },
    color: AP,
    accent: "#bd1460",
    emojis: ["💗", "🔨", "🃏", "⭐"],
    banter: [],
    specials: [
      // ── Normals ──────────────────────────────────────────────────────────
      {
        name: "Jab", category: "normal", role: "light-punch", variant: "light",
        startup: 4, active: 3, endlag: 8, hitstun: 10, reach: 145,
        combosInto: ["Shoulder Poke", "Piko Upper"],
        behavior: { motion: "none", knockback: { horizontal: 52, vertical: 0, hitstop: .018 } },
        visual: amyVisual("arc", AA, AS, 46, "✦", HAMMER, "main_slash_color2"),
        animation: amyAnim("strike", "jab")
      },
      {
        name: "Shoulder Poke", category: "normal", role: "medium-punch", variant: "light",
        startup: 5, active: 3, endlag: 9, hitstun: 12, reach: 165,
        combosInto: ["Hammer Vault", "Rose Step"],
        behavior: { motion: "none", knockback: { horizontal: 68, vertical: 0, hitstop: .022 } },
        visual: amyVisual("arc", "#ff4e9b", AS, 52, "•", HAMMER, "main_slash_color2"),
        animation: amyAnim("strike", "shoulder poke")
      },
      {
        name: "Piko Upper", category: "normal", role: "launcher", variant: "medium",
        launcher: true, startup: 8, active: 5, endlag: 13, hitstun: 28, reach: 232, juggle: 9,
        combosInto: ["Hammer Jump", "Rose Tornado"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 430,
          knockback: { horizontal: 88, vertical: 635, groundBounce: true, hitstop: .088 }
        },
        visual: { ...amyVisual("burst", AP, AS, 82, "↗"), script: PIKO_UPPER_SCRIPT },
        animation: amyAnim("spin", "piko upper")
      },
      {
        name: "Hammer Vault", category: "normal", role: "medium-kick", variant: "medium",
        startup: 9, active: 4, endlag: 12, hitstun: 19, reach: 218, overhead: true,
        combosInto: ["Hammer Spin", "Piko Piko Hammer"],
        behavior: {
          motion: "dash-attack", dashDistance: 82,
          knockback: { horizontal: 115, vertical: 215, hitstop: .058 }
        },
        visual: amyVisual("arc", "#ff6aa9", "#ffffff", 76, "↗"),
        animation: amyAnim("kick", "hammer vault")
      },
      {
        name: "Low Sweep", category: "normal", role: "light-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 15, active: 5, endlag: 19, hitstun: 21, reach: 244,
        knockdown: "hard", combosInto: ["Fortune Card", "Rose Step"],
        behavior: {
          motion: "slide", slideSpeed: 345,
          knockdown: "hard",
          knockback: { horizontal: 162, vertical: 0, hitstop: .052 }
        },
        visual: amyVisual("slashes", "#e02870", "#ffe6f2", 70, "⌁"),
        animation: amyAnim("kick", "low sweep")
      },
      {
        name: "Hammer Feint", category: "normal", role: "medium-punch", variant: "light",
        startup: 8, active: 2, endlag: 10, hitstun: 8, reach: 228,
        combosInto: ["Low Sweep", "Piko Upper"],
        behavior: { motion: "charge", charge: .16, knockback: { horizontal: 0, vertical: 0 } },
        visual: amyVisual("arc", "#ff7eb6", "#fff6fb", 74, "…"),
        animation: amyAnim("strike", "hammer feint")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "Piko Piko Hammer", type: "melee", role: "special", variant: "heavy",
        startup: 12, active: 6, endlag: 16, hitstun: 26, reach: 290,
        combosInto: ["Hammer Jump"],
        behavior: {
          motion: "dash-attack", dashDistance: 105, charge: .38, chargePower: 1.45,
          knockback: { horizontal: 278, vertical: 118, wallBounce: true, hitstop: .098 }
        },
        visual: { ...amyVisual("arc", AP, AH, 102, "❤", HAMMER, "main_slash3_color2"), script: PPH_SCRIPT },
        animation: amyAnim("strike", "piko piko hammer")
      },
      {
        name: "Passionate Piko Hammer", type: "melee", role: "special", variant: "medium",
        startup: 10, active: 6, endlag: 14, hitstun: 27, reach: 310,
        heartbeatCost: 1, combosInto: ["Hammer Jump"],
        behavior: {
          motion: "dash-attack", dashDistance: 132, chargePower: 1.32, wallBounce: true,
          knockback: { horizontal: 318, vertical: 208, wallBounce: true, hitstop: .088 }
        },
        visual: { ...amyVisual("arc", "#ff3f9a", "#ffffff", 104, "♥", HAMMER, "main_stylized_explosion"), script: PPH_SCRIPT },
        animation: amyAnim("strike", "passionate hammer")
      },
      {
        name: "Hammer Jump", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 5, active: 6, endlag: 18, hitstun: 28, reach: 192, juggle: 9,
        combosInto: ["Hammer Drop", "Rose Tornado"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 510, heartbeatGain: 1,
          knockback: { horizontal: 78, vertical: 655, hitstop: .078 }
        },
        visual: { ...amyVisual("burst", "#ff6bb0", "#fff5fb", 86, "⬆", HAMMER, "main_slash3_color2"), script: HAMMER_JUMP_SCRIPT },
        animation: amyAnim("spin", "hammer jump")
      },
      {
        name: "Passionate Hammer Jump", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 3, active: 7, endlag: 16, hitstun: 30, reach: 202, juggle: 10,
        heartbeatCost: 1,
        behavior: {
          motion: "multi-uppercut", hits: 3, rise: 570, invuln: .18,
          knockback: { horizontal: 72, vertical: 728, groundBounce: true, hitstop: .098 }
        },
        visual: { ...amyVisual("burst", "#ffb5d7", "#ffffff", 92, "✦", HAMMER, "main_stylized_explosion"), script: HAMMER_JUMP_SCRIPT },
        animation: amyAnim("spin", "passionate jump")
      },
      {
        name: "Hammer Spin", type: "melee", role: "special", variant: "medium",
        startup: 9, active: 16, endlag: 16, hitstun: 22, reach: 212,
        combosInto: ["Rose Step", "Piko Piko Hammer"],
        behavior: {
          motion: "spin", hits: 5, hitInterval: .072,
          knockback: { horizontal: 70, vertical: 98, hitstop: .044, carry: true }
        },
        visual: amyVisual("slashes", AP, AS, 90, "✧"),
        animation: amyAnim("spin", "hammer spin")
      },
      {
        name: "Passionate Hammer Spin", type: "melee", role: "special", variant: "medium",
        startup: 7, active: 17, endlag: 14, hitstun: 26, reach: 228,
        heartbeatCost: 1, combosInto: ["Passionate Piko Hammer"],
        behavior: {
          motion: "spin", hits: 6, hitInterval: .058,
          knockback: { horizontal: 82, vertical: 178, groundBounce: true, hitstop: .053 }
        },
        visual: amyVisual("slashes", "#ff9cc7", "#ffffff", 100, "✦", HAMMER, "main_stylized_explosion"),
        animation: amyAnim("spin", "passionate spin")
      },
      {
        name: "Hammer Toss", type: "projectile", role: "special", variant: "medium",
        startup: 12, active: 4, endlag: 18, hitstun: 19, reach: 520,
        combosInto: ["Fortune Card"],
        behavior: {
          motion: "projectile", speed: 478, pattern: "boomerang", returnDelay: .55,
          pierce: true, hitImmunity: .36, cardToss: true,
          knockback: { horizontal: 218, vertical: 168, hitstop: .068 }
        },
        visual: amyVisual("arc", AP, AH, 76, "🔨"),
        animation: { ...amyAnim("cast", "hammer toss"), contact: "energy" }
      },
      {
        name: "Passionate Hammer Toss", type: "projectile", role: "special", variant: "medium",
        startup: 10, active: 4, endlag: 16, hitstun: 22, reach: 520,
        heartbeatCost: 1,
        behavior: {
          motion: "projectile", speed: 538, pattern: "boomerang", returnDelay: .44,
          pierce: true, hitImmunity: .26, wallBounce: true, cardToss: true,
          knockback: { horizontal: 248, vertical: 218, hitstop: .073 }
        },
        visual: amyVisual("arc", "#ff83bd", "#ffffff", 82, "✹", HAMMER, "main_stylized_explosion"),
        animation: { ...amyAnim("cast", "ricochet toss"), contact: "energy" }
      },
      {
        name: "Hammer Recall", type: "projectile", role: "special", variant: "light",
        startup: 7, active: 4, endlag: 13, hitstun: 18, reach: 520,
        behavior: {
          motion: "projectile", speed: 645, pattern: "boomerang", returnDelay: .11,
          pierce: true, hitImmunity: .2, recall: true,
          knockback: { horizontal: 128, vertical: 76, hitstop: .038 }
        },
        visual: amyVisual("teleport", "#ffb4d5", "#ffffff", 62, "↩"),
        animation: { ...amyAnim("cast", "hammer recall"), contact: "energy" }
      },
      {
        name: "Fortune Card", type: "trap", role: "special", variant: "light",
        startup: 11, active: 4, endlag: 14, hitstun: 12, reach: 255,
        combosInto: ["Card Toss", "Rose Step"],
        behavior: {
          motion: "trap", cardSelect: true, lifetime: 1.3, radius: 66, heartbeatGain: 1,
          knockback: { horizontal: 48, vertical: 118, hitstop: .03 }
        },
        visual: { ...cardVisual(AG, "🃏"), script: FORTUNE_CARD_SCRIPT },
        animation: amyAnim("cast", "card draw")
      },
      {
        name: "Card Toss", type: "projectile", role: "special", variant: "light",
        startup: 7, active: 4, endlag: 13, hitstun: 15, reach: 435,
        combosInto: ["Rose Step"],
        behavior: {
          motion: "projectile", speed: 565, radius: 14, cardToss: true,
          knockback: { horizontal: 108, vertical: 0, hitstop: .03 }
        },
        visual: cardVisual("#e3b3ff", "✦"),
        animation: { ...amyAnim("cast", "card toss"), contact: "energy" }
      },
      {
        name: "Rose Step", type: "melee", role: "special", variant: "light",
        startup: 4, active: 3, endlag: 11, hitstun: 16, reach: 188,
        combosInto: ["Piko Piko Hammer", "Hammer Vault"],
        behavior: {
          motion: "dash", dashDistance: 122,
          knockback: { horizontal: 102, vertical: 0, hitstop: .032 }
        },
        visual: amyVisual("teleport", "#ff75b3", "#ffffff", 66, "➜"),
        animation: amyAnim("dash", "rose step")
      },
      {
        name: "Hammer Drop", type: "combo", role: "air-heavy-kick", variant: "heavy",
        air: true, startup: 4, active: 9, endlag: 13, hitstun: 25, reach: 218, juggle: 6,
        behavior: {
          motion: "dive-kick", speed: 395, knockdown: "hard",
          knockback: { horizontal: 242, vertical: 178, groundBounce: true, hitstop: .088 }
        },
        visual: { ...amyVisual("burst", AP, AH, 90, "▼"), script: HAMMER_DROP_SCRIPT },
        animation: amyAnim("slam", "hammer drop")
      },
      {
        name: "Passionate Hammer Drop", type: "combo", role: "air-heavy-kick", variant: "medium",
        air: true, startup: 3, active: 10, endlag: 12, hitstun: 28, reach: 228, juggle: 7,
        heartbeatCost: 1,
        behavior: {
          motion: "ground-pound", slamSpeed: 1115, shockRadius: 235,
          knockback: { horizontal: 278, vertical: 218, groundBounce: true, hitstop: .098 }
        },
        visual: { ...amyVisual("burst", "#ffb7d7", "#ffffff", 96, "✦", HAMMER, "main_stylized_explosion"), script: HAMMER_DROP_SCRIPT },
        animation: amyAnim("slam", "passionate drop")
      },
      {
        name: "Rose Tornado", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 5, active: 10, endlag: 15, hitstun: 23, reach: 224, juggle: 6,
        combosInto: ["Hammer Drop"],
        behavior: {
          motion: "spin", hits: 4, hitInterval: .062,
          knockback: { horizontal: 98, vertical: 178, hitstop: .048, carry: true }
        },
        visual: { ...amyVisual("slashes", "#ff72b2", "#ffffff", 84, "✧"), script: ROSE_TORNADO_SCRIPT },
        animation: amyAnim("spin", "rose tornado")
      },
      {
        name: "Piko Counter", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 6, active: 6, endlag: 22, hitstun: 30, reach: 178, juggle: 8,
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 440, counterWindow: .15,
          knockback: { horizontal: 78, vertical: 645, hitstop: .098 }
        },
        visual: { ...amyVisual("burst", "#ffd1e6", "#ffffff", 88, "✋"), script: PIKO_COUNTER_SCRIPT },
        animation: amyAnim("strike", "piko counter")
      },
      {
        name: "Passionate Piko Counter", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 3, active: 7, endlag: 20, hitstun: 32, reach: 186, juggle: 9,
        heartbeatCost: 1,
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 528, invuln: .2, counterWindow: .26,
          knockback: { horizontal: 98, vertical: 728, groundBounce: true, hitstop: .12 }
        },
        visual: { ...amyVisual("burst", "#fff0f8", "#ff5aa4", 94, "♥", HAMMER, "main_stylized_explosion"), script: PIKO_COUNTER_SCRIPT },
        animation: amyAnim("strike", "passionate counter")
      },
      {
        name: "Perfect Prediction", type: "trap", role: "special", variant: "medium",
        startup: 14, active: 4, endlag: 20, hitstun: 24, reach: 245,
        behavior: {
          motion: "trap", prediction: true, lifetime: 5, radius: 76,
          knockback: { horizontal: 238, vertical: 178, hitstop: .088 }
        },
        visual: cardVisual(AH, "👁"),
        animation: amyAnim("cast", "perfect prediction")
      }
    ],
    supers: [
      {
        name: "Piko Piko Grand Slam", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 20, endlag: 22, hitstun: 34, reach: 338,
        behavior: {
          motion: "multi-uppercut", hits: 7, rise: 658,
          knockback: { horizontal: 418, vertical: 682, wallBounce: true, hitstop: .14 }
        },
        visual: { ...amyVisual("burst", AP, AH, 126, "★", HAMMER, "main_firework"), script: HAMMER_JUMP_SCRIPT },
        animation: amyAnim("slam", "grand slam")
      },
      {
        name: "Giant Hammer", type: "melee", role: "super", variant: "heavy",
        startup: 8, active: 8, endlag: 20, hitstun: 32, reach: 388,
        behavior: {
          motion: "dash-attack", dashDistance: 148,
          knockback: { horizontal: 542, vertical: 278, wallBounce: true, hitstop: .14 }
        },
        visual: { ...amyVisual("arc", "#ff1f64", AH, 132, "🔨", HAMMER, "main_stylized_explosion"), script: PPH_SCRIPT },
        animation: amyAnim("strike", "giant hammer")
      },
      {
        name: "Hammer Cyclone", type: "melee", role: "super", variant: "heavy",
        startup: 5, active: 18, endlag: 17, hitstun: 32, reach: 298,
        behavior: {
          motion: "spin", hits: 8, hitInterval: .053,
          knockback: { horizontal: 358, vertical: 298, wallBounce: true, hitstop: .098 }
        },
        visual: { ...amyVisual("slashes", "#ff79b7", "#ffffff", 120, "✦", HAMMER, "main_rebound_spiral"), script: ROSE_TORNADO_SCRIPT },
        animation: amyAnim("spin", "hammer cyclone")
      },
      {
        name: "Fortune Foretold", type: "trap", role: "super", variant: "heavy",
        startup: 10, active: 4, endlag: 21, hitstun: 28, reach: 415,
        behavior: {
          motion: "trap", shots: 3, lifetime: 8, radius: 72, prediction: true,
          knockback: { horizontal: 298, vertical: 358, hitstop: .098 }
        },
        visual: { ...cardVisual(AH, "☀"), script: FORTUNE_CARD_SCRIPT },
        animation: amyAnim("cast", "fortune foretold")
      }
    ]
  }
};
