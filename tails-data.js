// Miles "Tails" Prower — S-tier technical zoner / air-control / trap specialist.
// Gadget mechanic: three slots (bomb, missile, booster) each have ~6s cooldown
// after use. Tails' air superiority and screen management are his defining tools.
// He is clearly S but clearly below Amy — she converts faster and harder.

const TY = "#f5a800", TY2 = "#fff5cc", TW = "#e0e8ff", TT = "#5ec8f5", TR = "#cc1a1a";
const WRENCH  = "uploads/tailswrench.png";
const BOMB    = "uploads/tailsbomb.png";
const CYCLONE = "uploads/tailscyclone.png";
const TAILS   = "uploads/tailssprite.png";

const tv = (effect, color = TY, secondary = TY2, size = 62, emoji = "✈", vfx = "main_slash3_color3", spriteUrl = TAILS) => ({
  effect, color, secondary, size, emoji, spriteUrl, mainVfx: vfx, hitVfx: "hit_directional", vfxFps: 20
});
const ta = (style = "strike", gesture = "tail") => ({
  style,
  windup: style === "kick" ? "hop" : style === "cast" ? "coil" : "coil",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "slam" ? "slam" : "follow-through",
  gesture, intensity: 1.12, puppet: true, puppetAmount: .82
});

// ── Visual scripts for signature moves ──────────────────────────────────────
const TAIL_ROTOR_SCRIPT = "const spin=p*Math.PI*14;const r=size*(.3+(active?Math.sin(p*Math.PI*8)*.05:0));api.circle(0,0,r,color,active?.88:.38);for(let i=0;i<6;i++){const a=spin+i*Math.PI/3;api.line(Math.cos(a)*r*.48,Math.sin(a)*r*.48,Math.cos(a)*r,Math.sin(a)*r,secondary,4,active?.65:.26);}if(active){api.ring(0,0,r*1.42,secondary,4,.5);api.flash(0,0,r*.82,secondary,.38);}";

const PROPELLER_SCRIPT = "for(let i=0;i<5;i++){const off=-size*(.26+i*.38),fade=(1-i/5)*(active?.88:.26),w=size*(.11-i*.015);api.streak(off,0,size*(.55-i*.07),4,i%2?color:secondary,w,fade);}if(active){api.flash(size*.18,0,size*.55,secondary,.5);api.glow(secondary,size*.38);}";

const BOMB_SCRIPT = "const pulse=active?1+Math.sin(p*Math.PI*10)*.08:1;api.circle(0,0,size*.28*pulse,'#222',.88);api.ring(0,0,size*.3*pulse,color,4,active?.82:.35);for(let i=0;i<6;i++){const a=p*Math.PI*6+i*Math.PI/3;api.line(Math.cos(a)*size*.32,Math.sin(a)*size*.32,Math.cos(a)*size*.48,Math.sin(a)*size*.48,secondary,3,active?.65:.28);}if(active){api.flash(0,0,size*.68,TR,.72);api.shock(0,0,size*.55,secondary,.58);}";

const MISSILE_SCRIPT = "const len=size*(active?.75:.45);api.wedge(0,0,len,size*.2,color,active?.85:.35);api.line(len*.5,0,len*.85,0,secondary,5,active?.7:.28);if(active){api.flash(len*.6,0,size*.42,secondary,.5);api.streak(-size*.12,0,size*1.6,4,secondary,size*.1,.7);}";

const FLIGHT_SCRIPT = "const spin=p*Math.PI*18;for(let i=0;i<2;i++){const a=spin+i*Math.PI;const r=size*(.48-i*.06);api.slash(Math.cos(a)*r*.28,Math.sin(a)*r*.28,size*(.38-i*.04),a,1.5,i%2?color:secondary,6,active?.8:.3);}if(active){api.ring(0,0,size*.52,secondary,4,.48);api.glow(secondary,size*.36);}";

const ROTOR_AA_SCRIPT = "for(let i=0;i<3;i++){const a=p*Math.PI*10+i*Math.PI*2/3;api.slash(Math.cos(a)*size*.22,Math.sin(a)*size*.22-size*.06,size*(.44-i*.06),a,1.7,i%2?color:secondary,7,(active?.85:.3)*(1-i*.25));}if(active){api.spark(0,-size*.06,size*.72,secondary,.8,-Math.PI/2);api.ring(0,-size*.06,size*.38,color,5,.6);}";

const TORNADO_SCRIPT = "for(let i=0;i<5;i++){const a=p*Math.PI*12+i*Math.PI*.4;const r=size*(.22+i*.07);api.slash(Math.cos(a)*r*.3,Math.sin(a)*r*.3,size*(.32+i*.04),a,1.6,i%2?color:secondary,5,(active?.78:.22)*(1-i*.18));}if(active){api.ring(0,0,size*.72,secondary,4,.42);}";

export const tails = {
  id: "miles-tails-prower",
  name: "Miles \"Tails\" Prower",
  author: "Sonic the Hedgehog",
  from: "Sonic the Hedgehog",
  portrait_url: "uploads/SRCTails.png",
  example: false,
  prompt: "Miles Tails Prower. An S-tier technical zoner who uses flight, bombs, missiles, and gadget management to dominate air and screen space. He is terrifying because you cannot stand where you want to stand.",
  config: {
    name: "Miles \"Tails\" Prower",
    author: "Sonic the Hedgehog",
    from: "Sonic the Hedgehog",
    style: "technical zoner / air-control / trap specialist",
    personality: "modest, brilliant, endlessly curious, and genuinely excited to see if his build works",
    backstory: "A twin-tailed engineering genius who turns flight, explosives, and missiles into one of the most suffocating neutral games in the roster. Where Amy terrorizes with one touch turning into 400 damage, Tails terrorizes by ensuring you never stand where you want to stand.",
    levelletter: "S",
    health: 925,
    power: 74,
    damageScale: 1.08,
    mechanic: "gadget",
    buttons: 6,
    combo: 4,
    smartness: 5,
    aggression: 3,
    defense: 3,
    speed: 5,
    range: 5,
    ai: {
      archetype: "zoner",
      idealGap: 265,
      aggression: .85,
      blockBias: .88,
      jumpBias: 1.78,
      zoneBias: 1.28,
      punish: 1.12,
      patience: 1.38,
      antiAir: 1.68,
      comboCommit: .85,
      preferredMoves: ["rotor anti-air", "homing missile", "remote bomb", "air missile", "tail rotor", "propeller dash", "rotor upper", "air drill", "tail deflector"],
      avoidMoves: ["wrench toss", "wrench crush"]
    },
    color: TY,
    accent: "#c07800",
    emojis: ["🦊", "✈", "💣", "🚀"],
    banter: [],
    specials: [
      // ── Normals ──────────────────────────────────────────────────────────
      {
        name: "Wrench Jab", category: "normal", role: "light-punch", variant: "light",
        startup: 5, active: 3, endlag: 8, hitstun: 10, reach: 148,
        combosInto: ["Wrench Swing", "Tail Slap"],
        behavior: { motion: "none", knockback: { horizontal: 55, vertical: 0, hitstop: .018 } },
        visual: tv("arc", TW, TY2, 46, "🔧", "main_slash_color1", WRENCH),
        animation: ta("strike", "wrench jab")
      },
      {
        name: "Wrench Swing", category: "normal", role: "medium-punch", variant: "medium",
        startup: 7, active: 4, endlag: 11, hitstun: 14, reach: 192,
        combosInto: ["Tail Slap", "Tail Rotor", "Remote Bomb"],
        behavior: { motion: "none", knockback: { horizontal: 88, vertical: 0, hitstop: .028 } },
        visual: tv("arc", TW, TY2, 62, "🔧", "main_slash_color1", WRENCH),
        animation: ta("strike", "wrench swing")
      },
      {
        name: "Wrench Crush", category: "normal", role: "heavy-punch", variant: "heavy",
        startup: 18, active: 5, endlag: 24, hitstun: 28, reach: 214,
        combosInto: [],
        behavior: { motion: "none", knockback: { horizontal: 225, vertical: 85, hitstop: .07 } },
        visual: tv("arc", TW, TY, 76, "🔧", "main_slash_color1", WRENCH),
        animation: ta("strike", "wrench crush")
      },
      {
        name: "Tail Slap", category: "normal", role: "light-kick", variant: "light",
        startup: 4, active: 3, endlag: 7, hitstun: 10, reach: 162,
        combosInto: ["Wrench Swing", "Rotor Upper"],
        behavior: { motion: "none", knockback: { horizontal: 60, vertical: 0, hitstop: .016 } },
        visual: tv("arc", TY, TY2, 48, "〰", "main_slash_color1"),
        animation: ta("kick", "tail slap")
      },
      {
        name: "Twin Tail Poke", category: "normal", role: "medium-kick", variant: "medium",
        startup: 8, active: 4, endlag: 12, hitstun: 15, reach: 218,
        combosInto: ["Tail Rotor", "Homing Missile"],
        behavior: { motion: "none", knockback: { horizontal: 95, vertical: 0, hitstop: .03 } },
        visual: { ...tv("slashes", TY, TY2, 60, "≋"), script: "for(let i=0;i<2;i++){const off=i*size*.22;api.line(-size*.1+off*me?.dir,0,size*(.44+off*.05),size*(.08-i*.05),color,6,active?.82:.3);api.line(-size*.1+off*me?.dir,0,size*(.44+off*.05),size*(.08-i*.05),secondary,3,active?.58:.2);}if(active){api.flash(size*.38,0,size*.45,secondary,.42);}" },
        animation: ta("kick", "twin tail poke")
      },
      {
        name: "Twin Tail Sweep", category: "normal", role: "heavy-kick", variant: "heavy",
        startup: 14, active: 6, endlag: 22, hitstun: 22, reach: 235,
        combosInto: [],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .08,
          knockback: { horizontal: 195, vertical: 55, hitstop: .062 }
        },
        visual: { ...tv("slashes", TY, TY2, 74, "🌀"), script: TAIL_ROTOR_SCRIPT },
        animation: ta("spin", "twin tail sweep")
      },
      {
        name: "Rotor Anti-Air", category: "normal", role: "launcher", variant: "medium",
        launcher: true, startup: 6, active: 8, endlag: 16, hitstun: 26, reach: 148, juggle: 8,
        combosInto: ["Tail Rotor", "Propeller Dash"],
        behavior: {
          motion: "multi-uppercut", hits: 3, rise: 380,
          knockback: { horizontal: 68, vertical: 520, hitstop: .08 }
        },
        visual: { ...tv("burst", TY, TY2, 78, "⬆"), script: ROTOR_AA_SCRIPT },
        animation: ta("spin", "rotor anti-air")
      },
      {
        name: "Tail Sweep Low", category: "normal", role: "low-kick", variant: "heavy",
        low: true, startup: 16, active: 5, endlag: 24, hitstun: 22, reach: 248,
        knockdown: "hard",
        combosInto: ["Homing Missile"],
        behavior: {
          motion: "slide", slideSpeed: 310, knockdown: "hard",
          knockback: { horizontal: 145, vertical: 0, hitstop: .058 }
        },
        visual: tv("slashes", "#e07800", TY2, 68, "⌁"),
        animation: ta("kick", "tail sweep low")
      },
      {
        name: "Rotor Upper", category: "normal", role: "launcher", variant: "medium",
        launcher: true, startup: 8, active: 5, endlag: 20, hitstun: 28, reach: 178, juggle: 9,
        combosInto: ["Propeller Dash", "Air Drill"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 460,
          knockback: { horizontal: 72, vertical: 600, groundBounce: true, hitstop: .085 }
        },
        visual: { ...tv("burst", TY, TY2, 82, "↑"), script: ROTOR_AA_SCRIPT },
        animation: ta("spin", "rotor upper")
      },
      {
        name: "Reverse Tail", category: "normal", role: "medium-kick", variant: "light",
        startup: 6, active: 4, endlag: 10, hitstun: 13, reach: 185,
        combosInto: ["Tail Rotor"],
        behavior: { motion: "none", knockback: { horizontal: 78, vertical: 0, hitstop: .025 } },
        visual: tv("arc", TY, TY2, 52, "↩"),
        animation: ta("kick", "reverse tail")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "Tail Rotor", type: "melee", role: "special", variant: "medium",
        startup: 8, active: 12, endlag: 14, hitstun: 20, reach: 220,
        combosInto: ["Propeller Dash", "Rotor Upper"],
        behavior: {
          motion: "dash-attack", dashDistance: 195, charge: .22, chargePower: 1.28,
          knockback: { horizontal: 122, vertical: 95, hitstop: .05, carry: true }
        },
        visual: { ...tv("slashes", TY, TY2, 78, "🌀"), script: TAIL_ROTOR_SCRIPT },
        animation: ta("spin", "tail rotor")
      },
      {
        name: "Tail Rotor Heavy", type: "melee", role: "special", variant: "heavy",
        startup: 14, active: 14, endlag: 20, hitstun: 26, reach: 238,
        launcher: true, juggle: 7,
        combosInto: [],
        behavior: {
          motion: "spin", hits: 4, hitInterval: .075, dashDistance: 175,
          knockback: { horizontal: 88, vertical: 320, hitstop: .065, carry: true }
        },
        visual: { ...tv("slashes", "#ffc822", TY2, 88, "🌀"), script: TAIL_ROTOR_SCRIPT },
        animation: ta("spin", "tail rotor heavy")
      },
      {
        name: "Propeller Dash", type: "melee", role: "special", variant: "light",
        startup: 5, active: 4, endlag: 12, hitstun: 16, reach: 255,
        combosInto: ["Tail Rotor", "Homing Missile"],
        behavior: {
          motion: "dash", speed: 620, dashDistance: 248,
          knockback: { horizontal: 98, vertical: 0, hitstop: .035, carry: true }
        },
        visual: { ...tv("slashes", TT, TY2, 68, "➜"), script: PROPELLER_SCRIPT },
        animation: ta("dash", "propeller dash")
      },
      {
        name: "Remote Bomb", type: "trap", role: "special", variant: "light",
        startup: 14, active: 4, endlag: 18, hitstun: 22, reach: 220,
        combosInto: ["Homing Missile"],
        behavior: {
          motion: "trap", lifetime: 3.2, radius: 72, gadgetSlot: "bomb",
          knockback: { horizontal: 62, vertical: 388, hitstop: .072 }
        },
        visual: { ...tv("orb", TR, TY, 58, "💣", "main_firework", BOMB), script: BOMB_SCRIPT },
        animation: { ...ta("cast", "remote bomb"), contact: "energy" }
      },
      {
        name: "Napalm Bomb", type: "bomb", role: "special", variant: "heavy",
        startup: 18, active: 4, endlag: 22, hitstun: 24, reach: 240,
        combosInto: [],
        behavior: {
          motion: "bomb", radius: 92, burnDuration: 2.1, gadgetSlot: "bomb",
          knockback: { horizontal: 135, vertical: 285, hitstop: .065 }
        },
        visual: { ...tv("burst", TR, "#ff9955", 72, "🔥", "main_stylized_explosion", BOMB), script: BOMB_SCRIPT },
        animation: { ...ta("cast", "napalm bomb"), contact: "energy" }
      },
      {
        name: "Homing Missile", type: "projectile", role: "special", variant: "medium",
        startup: 14, active: 4, endlag: 18, hitstun: 18, reach: 620,
        combosInto: [],
        behavior: {
          motion: "projectile", speed: 445, radius: 18, homing: .72,
          gadgetSlot: "missile",
          knockback: { horizontal: 185, vertical: 118, hitstop: .048 }
        },
        visual: { ...tv("arc", TR, "#ffddcc", 44, "🚀", "main_slash3_color3"), script: MISSILE_SCRIPT },
        animation: { ...ta("cast", "homing missile"), contact: "energy" }
      },
      {
        name: "Homing Missile Heavy", type: "projectile", role: "special", variant: "heavy",
        startup: 22, active: 4, endlag: 24, hitstun: 22, reach: 640,
        combosInto: [],
        behavior: {
          motion: "projectile", speed: 330, radius: 22, homing: .92,
          gadgetSlot: "missile", linger: 4.5,
          knockback: { horizontal: 228, vertical: 165, hitstop: .065 }
        },
        visual: { ...tv("arc", TR, "#ffddcc", 52, "🚀", "main_stylized_explosion"), script: MISSILE_SCRIPT },
        animation: { ...ta("cast", "homing missile lock"), contact: "energy" }
      },
      {
        name: "Wrench Toss", type: "projectile", role: "special", variant: "medium",
        startup: 16, active: 4, endlag: 22, hitstun: 18, reach: 480,
        combosInto: [],
        behavior: {
          motion: "projectile", speed: 380, radius: 20, pattern: "arc",
          knockback: { horizontal: 148, vertical: 88, hitstop: .042 }
        },
        visual: tv("arc", TW, TY, 52, "🔧", "main_slash_color1", WRENCH),
        animation: { ...ta("cast", "wrench toss"), contact: "energy" }
      },
      {
        name: "Mechanical Guard", type: "trap", role: "special", variant: "light",
        startup: 8, active: 4, endlag: 14, hitstun: 12, reach: 185,
        combosInto: [],
        behavior: {
          motion: "barrier",
          knockback: { horizontal: 48, vertical: 0, hitstop: .022 }
        },
        visual: tv("teleport", TT, TY2, 58, "🛡", "main_vfx_start"),
        animation: ta("cast", "mechanical guard")
      },
      {
        name: "Tail Deflector", type: "melee", role: "special", variant: "medium",
        startup: 7, active: 8, endlag: 18, hitstun: 20, reach: 168,
        combosInto: ["Rotor Upper"],
        behavior: {
          motion: "spin", hits: 4, hitInterval: .055,
          knockback: { horizontal: 82, vertical: 155, hitstop: .045 }
        },
        visual: { ...tv("slashes", TY, TY2, 70, "⟲"), script: FLIGHT_SCRIPT },
        animation: ta("spin", "tail deflector")
      },
      {
        name: "Emergency Booster", type: "melee", role: "special", variant: "heavy",
        startup: 4, active: 6, endlag: 26, hitstun: 24, reach: 188,
        launcher: true, juggle: 8,
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 520, invuln: .18,
          knockback: { horizontal: 75, vertical: 640, hitstop: .085 }
        },
        visual: { ...tv("burst", TT, TY2, 82, "⚡", "main_stylized_explosion"), script: FLIGHT_SCRIPT },
        animation: ta("spin", "emergency booster")
      },
      {
        name: "Air Drill", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 7, active: 10, endlag: 16, hitstun: 22, reach: 248, juggle: 7,
        combosInto: ["Homing Missile"],
        behavior: {
          motion: "fly-in", flySpeed: 680, flyHeight: 65, hits: 4, hitInterval: .065,
          knockback: { horizontal: 88, vertical: 165, hitstop: .048, carry: true }
        },
        visual: { ...tv("slashes", TY, TY2, 76, "✦"), script: FLIGHT_SCRIPT },
        animation: ta("spin", "air drill")
      },
      {
        name: "Air Missile", type: "projectile", role: "air-special", variant: "light",
        air: true, startup: 12, active: 4, endlag: 14, hitstun: 16, reach: 580,
        combosInto: [],
        behavior: {
          motion: "projectile", speed: 462, radius: 16, homing: .62,
          angleOffset: -18, gadgetSlot: "missile",
          knockback: { horizontal: 155, vertical: 88, hitstop: .038 }
        },
        visual: { ...tv("arc", TR, TY2, 42, "🚀"), script: MISSILE_SCRIPT },
        animation: { ...ta("cast", "air missile"), contact: "energy" }
      },
      {
        name: "Tornado Tail", type: "trap", role: "special", variant: "medium",
        startup: 10, active: 14, endlag: 22, hitstun: 14, reach: 230,
        combosInto: [],
        behavior: {
          motion: "spin", hits: 6, hitInterval: .075,
          knockback: { horizontal: 38, vertical: 65, hitstop: .028, carry: true }
        },
        visual: { ...tv("slashes", TY, TY2, 86, "🌪", "main_rebound_spiral"), script: TORNADO_SCRIPT },
        animation: ta("spin", "tornado tail")
      },
      {
        name: "Booster Burst", type: "melee", role: "special", variant: "light",
        startup: 4, active: 3, endlag: 11, hitstun: 15, reach: 195,
        combosInto: ["Air Drill", "Homing Missile"],
        behavior: {
          motion: "teleport", offset: 82, gadgetSlot: "booster",
          knockback: { horizontal: 85, vertical: 0, hitstop: .028 }
        },
        visual: { ...tv("teleport", TT, TY2, 60, "💨"), script: PROPELLER_SCRIPT },
        animation: ta("dash", "booster burst")
      }
    ],
    supers: [
      {
        name: "Missile Barrage", type: "projectile", role: "super", variant: "heavy",
        startup: 10, active: 4, endlag: 22, hitstun: 28, reach: 620,
        behavior: {
          motion: "projectile", shots: 5, speed: 420, radius: 18, homing: .78, pattern: "fan", spread: 22,
          knockback: { horizontal: 185, vertical: 195, hitstop: .098 }
        },
        visual: { ...tv("arc", TR, TY, 88, "🚀", "main_firework"), script: MISSILE_SCRIPT },
        animation: { ...ta("cast", "missile barrage"), contact: "energy" }
      },
      {
        name: "Rotor Overdrive", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 20, endlag: 20, hitstun: 32, reach: 355,
        behavior: {
          motion: "dash-attack", dashDistance: 280, hits: 7, hitInterval: .055, invuln: .18,
          knockback: { horizontal: 355, vertical: 255, wallBounce: true, hitstop: .11 }
        },
        visual: { ...tv("slashes", TY, TY2, 118, "★", "main_rebound_spiral"), script: TAIL_ROTOR_SCRIPT },
        animation: ta("spin", "rotor overdrive")
      },
      {
        name: "Cyclone Mode", type: "combo", role: "super", variant: "heavy",
        startup: 8, active: 18, endlag: 22, hitstun: 34, reach: 380,
        behavior: {
          motion: "multi-uppercut", hits: 6, rise: 520,
          knockback: { horizontal: 388, vertical: 305, wallBounce: true, hitstop: .12 }
        },
        visual: { ...tv("burst", TT, TY, 128, "🤖", "main_stylized_explosion", CYCLONE), script: ROTOR_AA_SCRIPT },
        animation: ta("slam", "cyclone mode")
      },
      {
        name: "Mechanical Genius", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 20, endlag: 24, hitstun: 36, reach: 400,
        behavior: {
          motion: "fly-in", flySpeed: 880, flyHeight: 55, hits: 8, hitInterval: .048,
          knockback: { horizontal: 425, vertical: 388, wallBounce: true, hitstop: .14 }
        },
        visual: { ...tv("slashes", TY, "#ffffff", 132, "✦", "main_firework", CYCLONE), script: FLIGHT_SCRIPT },
        animation: ta("spin", "mechanical genius")
      }
    ]
  }
};
