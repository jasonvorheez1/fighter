// Sonic's kit is designed to reward momentum and stylish hit-and-run play.
// Frame data is tight so routes link even at D-tier, but the pilot still drops
// complex extensions — that is the tier's cost, not the move's.
const S = "#1ac5ff", S2 = "#e8faff", SD = "#0060ff", SG = "#a9ecff";

const sv = (effect, color = S, secondary = S2, size = 60, emoji = "⚡", vfx = "main_slash3_color3") => ({
  effect, color, secondary, size, emoji,
  mainVfx: vfx, hitVfx: "hit_directional", vfxFps: 22
});

const sa = (style = "dash", gesture = "spin") => ({
  style,
  windup: style === "kick" ? "hop" : style === "cast" ? "coil" : "spin",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "cast" ? "recoil" : "follow-through",
  gesture, intensity: 1.16, puppet: true, puppetAmount: .85
});

// ── Visual scripts for signature moves ──────────────────────────────────────
const SPINDASH_SCRIPT = "const spin=p*Math.PI*16;const r=size*(.3+(active?Math.sin(p*Math.PI*7)*.05:0));api.circle(0,0,r,color,active?.92:.42);for(let i=0;i<8;i++){const a=spin+i*Math.PI*.25;api.line(Math.cos(a)*r*.48,Math.sin(a)*r*.48,Math.cos(a)*r,Math.sin(a)*r,secondary,3,active?.68:.26);}if(active){api.ring(0,0,r*1.45,secondary,4,.52);api.flash(0,0,r*.85,secondary,.4);}";

const BOOST_SCRIPT = "for(let i=0;i<6;i++){const off=-size*(.3+i*.4),fade=(1-i/6)*(active?.9:.28),w=size*(.12-i*.016);api.streak(off,0,size*(.58-i*.07),4,i%2?color:secondary,w,fade);}if(active){api.flash(size*.2,0,size*.6,secondary,.54);api.glow(secondary,size*.42);}";

const HOMING_SCRIPT = "const pulse=active?1+Math.sin(p*Math.PI*12)*.1:1;api.ring(0,0,size*.38*pulse,secondary,6,active?.9:.34);api.ring(0,0,size*.56*pulse,color,3,active?.52:.2);for(let i=0;i<4;i++){const a=i*Math.PI*.5+p*Math.PI*8;const r=size*.44*pulse;api.line(Math.cos(a)*r*.56,Math.sin(a)*r*.56,Math.cos(a)*r,Math.sin(a)*r,secondary,5,active?.74:.28);}if(active){api.flash(0,0,size*.48,secondary,.5);}";

const STOMP_SCRIPT = "if(active){api.wedge(0,0,size*1.1,size*.28,color,.38);api.streak(0,-size*.15,size*2.2,4,secondary,size*.16,.9);api.flash(0,size*.22,size*.68,secondary,.58);}else{const wave=(p-.35)/.65;if(wave>0){api.ring(0,size*.22,size*wave*1.6,color,6,(1-wave)*.7);api.ring(0,size*.22,size*wave*.85,secondary,3,(1-wave)*.55);}}";

const BOOM_SCRIPT = "for(let i=0;i<2;i++){const off=i*size*.22;api.slash(off,0,size*(.52-i*.1),-0.12,1.6,i%2?color:secondary,7,(active?.85:.3)*(1-i*.3));}if(active){api.flash(size*.35,0,size*.5,secondary,.44);api.streak(-size*.1,0,size*1.8,3,color,size*.08,.6);}";

const WILDSTEP_SCRIPT = "const fade=active?.88:.32;api.ring(0,0,size*.32,secondary,5,fade);api.circle(0,0,size*.18,color,fade*.9);for(let i=0;i<6;i++){const a=p*Math.PI*10+i*Math.PI/3;api.line(Math.cos(a)*size*.22,Math.sin(a)*size*.22,Math.cos(a)*size*.44,Math.sin(a)*size*.44,secondary,3,fade*.7);}if(active){api.flash(0,0,size*.55,secondary,.5);}";

export const sonic = {
  id: "sonic-the-hedgehog",
  name: "Sonic the Hedgehog",
  author: "Sonic the Hedgehog",
  from: "Sonic the Hedgehog",
  portrait_url: "uploads/SRCSonic.png",
  example: false,
  prompt: "Sonic the Hedgehog. A high-speed hit-and-run fighter who is flashy, fragile, and constantly moving.",
  config: {
    name: "Sonic the Hedgehog",
    author: "Sonic the Hedgehog",
    from: "Sonic the Hedgehog",
    style: "hit-and-run / momentum rushdown",
    personality: "cocky, restless, and always moving",
    backstory: "A blue speedster who turns movement into momentum and momentum into impossible-looking routes.",
    levelletter: "D",
    health: 900,
    power: 31,
    damageScale: .64,
    mechanic: "momentum",
    buttons: 6,
    combo: 5,
    smartness: 5,
    aggression: 5,
    defense: 1,
    speed: 5,
    range: 4,
    ai: {
      archetype: "rushdown",
      idealGap: 128,
      aggression: 1.22,
      blockBias: .44,
      jumpBias: 1.42,
      zoneBias: .12,
      punish: .82,
      patience: .22,
      antiAir: .62,
      comboCommit: 1.08,
      preferredMoves: ["spin dash", "boost", "homing attack", "stomp", "sonic boom"],
      avoidMoves: ["sonic boom ×3", "cross slash"]
    },
    color: S,
    accent: "#0a55d8",
    emojis: ["💨", "⚡", "🌀", "⭐"],
    banter: [],
    specials: [
      // ── Normals ──────────────────────────────────────────────────────────
      {
        name: "Sonic Kick", category: "normal", role: "medium-kick", variant: "medium",
        startup: 6, active: 4, endlag: 10, hitstun: 14, reach: 185, overhead: true,
        combosInto: ["Spin Dash", "Boost"],
        behavior: { motion: "dash-attack", dashDistance: 62, knockback: { horizontal: 85, vertical: 0, hitstop: .032 } },
        visual: sv("arc", S, "#ffffff", 55, "↗", "main_slash_color1"),
        animation: sa("kick", "side kick")
      },
      {
        name: "Skid Attack", category: "normal", role: "low-kick", variant: "medium",
        startup: 16, active: 5, endlag: 17, hitstun: 20, reach: 180, low: true,
        combosInto: ["Sonic Boom", "Boost"],
        behavior: { motion: "slide", slideSpeed: 380, knockback: { horizontal: 160, vertical: 0, hitstop: .055 } },
        visual: { ...sv("slashes", "#1a8ff2", "#c7f4ff", 62, "〰", "main_slash3_color3"), script: "for(let i=0;i<5;i++){const sx=-size*(1.1+i*.52),sy=size*(.28+i*.04),fade=(1-i/5)*(active?.9:.26);api.line(sx,sy,sx-size*.2,sy-size*.18,color,5*fade,fade);api.line(sx-size*.08,sy+size*.07,sx-size*.26,sy-size*.1,secondary,3*fade,fade*.7);}if(active){api.flash(size*.18,size*.2,size*.52,secondary,.45);api.streak(-size*.12,size*.18,size*2.0,4,secondary,size*.13,.85);}" },
        animation: sa("kick", "skid")
      },
      {
        name: "Somersault", category: "normal", role: "launcher", variant: "medium",
        launcher: true, startup: 7, active: 5, endlag: 18, hitstun: 27, reach: 152, juggle: 8,
        combosInto: ["Homing Attack"],
        behavior: { motion: "multi-uppercut", hits: 2, rise: 340, knockback: { horizontal: 75, vertical: 570, hitstop: .07 } },
        visual: sv("burst", "#238cff", S2, 68, "⤴", "main_slash3_color3"),
        animation: sa("spin", "somersault")
      },
      {
        name: "Shoulder Check", category: "normal", role: "medium-punch", variant: "light",
        startup: 4, active: 3, endlag: 9, hitstun: 12, reach: 148,
        combosInto: ["Sonic Kick", "Spin Dash"],
        behavior: { motion: "none", knockback: { horizontal: 70, vertical: 0, hitstop: .025 } },
        visual: sv("arc", SG, S2, 48, "✦", "main_slash_color1"),
        animation: sa("dash", "shoulder")
      },
      {
        name: "Low Kick", category: "normal", role: "low-kick", variant: "light",
        startup: 5, active: 3, endlag: 9, hitstun: 11, reach: 155, low: true,
        combosInto: ["Shoulder Check", "Sonic Kick"],
        behavior: { motion: "none", knockback: { horizontal: 60, vertical: 0, hitstop: .022 } },
        visual: sv("arc", "#1888e8", S2, 46, "⌁", "main_slash_color1"),
        animation: sa("kick", "low kick")
      },
      {
        name: "Spin Sweep", category: "normal", role: "heavy-kick", variant: "heavy",
        startup: 14, active: 6, endlag: 20, hitstun: 24, reach: 198, low: true,
        knockdown: "hard",
        behavior: { motion: "spin", hits: 2, hitInterval: .09, knockback: { horizontal: 220, vertical: 60, hitstop: .065 } },
        visual: sv("slashes", SD, SG, 70, "◌", "main_slash3_color3"),
        animation: sa("spin", "spin sweep")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "Spin Dash", type: "melee", role: "special", variant: "light",
        startup: 10, active: 6, endlag: 13, hitstun: 20, reach: 218,
        combosInto: ["Boost", "Homing Attack"],
        behavior: {
          motion: "dash-attack", dashDistance: 188, charge: .24, chargePower: 1.18,
          knockback: { horizontal: 148, vertical: 105, hitstop: .052, carry: true }
        },
        visual: { ...sv("orb", SD, SG, 74, "🌀", "main_slash3_color3"), script: SPINDASH_SCRIPT },
        animation: sa("spin", "spin dash")
      },
      {
        name: "Boost", type: "melee", role: "special", variant: "medium",
        startup: 5, active: 5, endlag: 11, hitstun: 18, reach: 242,
        combosInto: ["Boost Attack", "Homing Attack"],
        behavior: {
          motion: "dash", speed: 720, dashDistance: 232,
          knockback: { horizontal: 112, vertical: 0, hitstop: .042, carry: true }
        },
        visual: { ...sv("slashes", S, S2, 70, "➜", "main_slash3_color3"), script: BOOST_SCRIPT },
        animation: sa("dash", "boost")
      },
      {
        name: "Boost Attack", type: "combo", role: "special", variant: "medium",
        startup: 4, active: 8, endlag: 12, hitstun: 22, reach: 208,
        combosInto: ["Somersault", "Sonic Boom"],
        behavior: {
          motion: "dash-attack", dashDistance: 160,
          knockback: { horizontal: 88, vertical: 155, hitstop: .048, carry: true }
        },
        visual: sv("arc", "#43d7ff", S2, 68, "✦", "main_slash3_color3"),
        animation: sa("tackle", "shoulder rush")
      },
      {
        name: "Homing Attack", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 7, active: 7, endlag: 13, hitstun: 23, reach: 272, juggle: 6,
        combosInto: ["Stomp", "Cross Slash"],
        behavior: {
          motion: "fly-in", flySpeed: 740, flyHeight: 88, homing: .86,
          knockback: { horizontal: 80, vertical: 235, hitstop: .048, carry: true }
        },
        visual: { ...sv("orb", "#0b8cf2", "#d9f8ff", 72, "🎯", "main_slash3_color3"), script: HOMING_SCRIPT },
        animation: sa("dash", "homing lock")
      },
      {
        name: "Stomp", type: "combo", role: "air-heavy", variant: "heavy",
        air: true, startup: 4, active: 8, endlag: 12, hitstun: 25, reach: 188, juggle: 5,
        behavior: {
          motion: "ground-pound", slamSpeed: 1060, shockRadius: 220,
          knockback: { horizontal: 175, vertical: 175, groundBounce: true, hitstop: .072 }
        },
        visual: { ...sv("burst", SD, S2, 70, "▼", "main_firework"), script: STOMP_SCRIPT },
        animation: sa("slam", "stomp")
      },
      {
        name: "Sonic Boom", type: "projectile", role: "special", variant: "light",
        startup: 10, active: 4, endlag: 15, hitstun: 14, reach: 520,
        combosInto: ["Boost"],
        behavior: {
          motion: "projectile", speed: 555, shots: 1, radius: 21,
          knockback: { horizontal: 165, vertical: 0, hitstop: .033 }
        },
        visual: { ...sv("slashes", "#20b8ff", "#effdff", 40, "◒", "main_slash3_color3"), script: BOOM_SCRIPT },
        animation: sa("cast", "sonic boom")
      },
      {
        name: "Sonic Boom ×3", type: "projectile", role: "special", variant: "heavy",
        startup: 16, active: 4, endlag: 26, hitstun: 15, reach: 520,
        behavior: {
          motion: "projectile", speed: 490, shots: 3, radius: 19, pattern: "fan", spread: 14,
          knockback: { horizontal: 118, vertical: 0, hitstop: .028 }
        },
        visual: sv("slashes", "#1798ed", S2, 38, "≋", "main_slash3_color3"),
        animation: sa("cast", "triple wave")
      },
      {
        name: "Wild Rush", type: "melee", role: "special", variant: "medium",
        startup: 10, active: 5, endlag: 19, hitstun: 20, reach: 232,
        combosInto: ["Spin Dash"],
        behavior: {
          motion: "teleport", offset: 90,
          knockback: { horizontal: 205, vertical: 0, hitstop: .052 }
        },
        visual: { ...sv("teleport", "#0b7ee5", "#e8fbff", 66, "↝", "main_slash3_color3"), script: WILDSTEP_SCRIPT },
        animation: sa("dash", "zigzag")
      },
      {
        name: "Spin Slash", type: "melee", role: "special", variant: "medium",
        startup: 6, active: 12, endlag: 20, hitstun: 21, reach: 185,
        combosInto: ["Sonic Boom"],
        behavior: {
          motion: "spin", hits: 5, hitInterval: .065,
          knockback: { horizontal: 60, vertical: 115, hitstop: .033, carry: true }
        },
        visual: sv("slashes", S, S2, 74, "✧", "main_slash3_color3"),
        animation: sa("spin", "spin slash")
      },
      {
        name: "Cross Slash", type: "projectile", role: "special", variant: "medium",
        air: true, startup: 12, active: 4, endlag: 20, hitstun: 19, reach: 475,
        behavior: {
          motion: "projectile", speed: 440, shots: 2, pattern: "fan", spread: 20,
          knockback: { horizontal: 175, vertical: 115, hitstop: .058 }
        },
        visual: sv("slashes", "#2cc6ff", S2, 52, "✕", "main_slash3_color3"),
        animation: sa("cast", "cross slash")
      },
      {
        name: "Light Speed Attack", type: "combo", role: "super", variant: "heavy",
        startup: 7, active: 16, endlag: 20, hitstun: 29, reach: 370,
        behavior: {
          motion: "fly-in", flySpeed: 940, flyHeight: 65, hits: 6,
          knockback: { horizontal: 178, vertical: 188, hitstop: .078 }
        },
        visual: sv("slashes", "#d7fbff", S2, 90, "✦", "main_firework"),
        animation: sa("dash", "light speed")
      }
    ],
    supers: [
      {
        name: "Super Sonic Rush", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 18, endlag: 18, hitstun: 30, reach: 420,
        behavior: {
          motion: "fly-in", flySpeed: 1060, flyHeight: 36, hits: 8,
          knockback: { horizontal: 255, vertical: 265, hitstop: .11 }
        },
        visual: sv("slashes", "#fff08a", S2, 112, "★", "main_firework"),
        animation: sa("dash", "super rush")
      }
    ]
  }
};
