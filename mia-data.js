// Mia (Beatcats) — A-tier vocal pressure. Deliberately the *conventional*
// Beatcat: strong neutral, strong pressure, honest 8-18 hit conversions. Her
// TEMPO meter builds by varying attack category and cashes out on one High Note
// move, so she loops a resource instead of snowballing like Rico.
const MP = "#ff5fa2", MW = "#fff2f9", MC = "#ffa8d4", MG = "#c88bff", MY = "#ffe066";

const miaVisual = (effect, color = MP, secondary = MW, size = 60, emoji = "♪", vfx = "main_slash_color1") => ({
  effect, color, secondary, size, emoji, spriteUrl: null, mainVfx: vfx, hitVfx: "hit_round_spark", vfxFps: 20
});
const miaAnim = (style = "strike", gesture = "sing") => ({
  style,
  windup: style === "kick" ? "hop" : "coil",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "slam" ? "slam" : "follow-through",
  gesture, intensity: 1.15, puppet: true, puppetAmount: .86
});

// ── Visual scripts ──────────────────────────────────────────────────────────
// Her voice is the hitbox, so vocals render as concentric pressure rings that
// squash into ellipses as they travel — depth without a projectile sprite.

const HIGH_NOTE_SCRIPT = "for(let i=0;i<4;i++){const ph=p*1.4-i*.16;if(ph<0)continue;const g=Math.min(1,ph);const x=size*g*1.15;api.ring(x,-size*.14,size*(.16+g*.4),i%2?color:secondary,4-i*.6,(active?.9:.3)*(1-g*.8));}if(active){api.flash(size*.2,-size*.14,size*.42,secondary,.55);api.glow(color,size*.4);}";

const MIC_SWING_SCRIPT = "const sw=active?Math.sin(p*Math.PI):Math.max(0,p*2-1);const a=-2.2+sw*3.4;const hx=Math.cos(a)*size*.72,hy=Math.sin(a)*size*.5-size*.1;api.line(0,-size*.1,hx,hy,color,7,active?.85:.32);api.line(0,-size*.1,hx,hy,secondary,3,active?.7:.26);api.flash(hx,hy,size*.34,secondary,active?.6:.2);if(active){api.ring(hx,hy,size*.3,color,4,.6);}";

const MELODY_CLAW_SCRIPT = "for(let i=0;i<3;i++){const ph=p*3-i;if(ph<0||ph>1.2)continue;const d=1-Math.min(1,ph/1.2);const y=-size*.3+i*size*.26;api.slash(size*.28,y,size*(.36+d*.2),(i%2?.6:-.6),1.4,i%2?color:secondary,4+d*6,(active?.9:.3)*d);}if(active){api.spark(size*.5,-size*.1,size*.5,secondary,.62,0);}";

const RISING_NOTE_SCRIPT = "const lift=Math.max(0,p*2-.05)*size*1.15;api.line(0,0,0,-lift,color,6,active?.7:.24);for(let i=0;i<3;i++){const g=(p*1.3-i*.2);if(g<0)continue;api.ring(0,-lift+i*size*.1,size*(.2+g*.34),i%2?secondary:color,4,(active?.85:.28)*Math.max(0,1-g));}if(active){api.spark(0,-lift,size*.72,secondary,.8,-Math.PI/2);api.glow(color,size*.45);}";

const PULSE_SCRIPT = "const w=p;api.ring(0,-size*.2,size*w*1.5,color,5,(1-w)*.7);api.ring(0,-size*.2,size*w*.95,secondary,3,(1-w)*.5);api.ring(0,-size*.2,size*w*.5,color,2,(1-w)*.35);if(active)api.glow(color,size*.5);";

const DOKIDOKI_SCRIPT = "for(let i=0;i<7;i++){const ph=p*1.6-i*.11;if(ph<0)continue;const g=Math.min(1,ph);api.ring(0,-size*.2,size*(.14+g*.85),i%2?color:secondary,5-i*.5,(active?.95:.3)*(1-g*.75));}for(let i=0;i<5;i++){const a=p*Math.PI*4+i*Math.PI*2/5;const d=(Math.sin(a)+1)*.5;api.slash(Math.cos(a)*size*.4,Math.sin(a)*size*.16-size*.2,size*(.2+d*.4),a,1.6,secondary,3+d*6,(active?.8:.26)*(.3+d*.7));}if(active){api.flash(0,-size*.2,size*.7,MW,.6);api.glow(color,size*.7);}";

export const mia = {
  id: "mia-beatcats",
  name: "Mia",
  author: "Beatcats",
  from: "Beatcats",
  portrait_url: "uploads/Mia.png",
  example: false,
  prompt: "Mia of Beatcats. A-tier vocal pressure fighter who sings her hitboxes into existence, controls tempo, and punishes habits she has spent the round watching you build.",
  config: {
    name: "Mia",
    author: "Beatcats",
    from: "Beatcats",
    style: "vocal pressure / balanced rushdown / tempo control",
    personality: "curious, observant, and quietly imaginative — she watches you closely, gets a little too invested, and then punishes the habit she caught you forming",
    backstory: "Beatcats' main vocalist. She reads a room the way she reads a crowd, and her voice carries further than anyone expects.",
    levelletter: "A",
    health: 1000,
    power: 82,
    damageScale: 1.02,
    mechanic: "tempo",
    buttons: 6,
    combo: 4,
    smartness: 5,
    aggression: 4,
    defense: 3,
    speed: 4,
    range: 4,
    ai: {
      archetype: "balanced",
      idealGap: 198,
      aggression: 1.06,
      blockBias: 1.24,
      jumpBias: 1.05,
      zoneBias: .74,
      punish: 1.34,
      patience: 1.05,
      antiAir: 1.28,
      comboCommit: .96,
      preferredMoves: ["high note", "melody claw", "mic swing", "rising note", "sharp note", "chorus step", "high tone rush"],
      avoidMoves: ["mic tap"]
    },
    color: MP,
    accent: "#b02a68",
    emojis: ["🎤", "♪", "💗", "🐾"],
    banter: [],
    specials: [
      // ── Normals ──────────────────────────────────────────────────────────
      {
        name: "Claw Swipe", category: "normal", role: "light-punch", variant: "light",
        startup: 4, active: 3, endlag: 8, hitstun: 12, reach: 138,
        combosInto: ["Double Paw", "Stage Kick"],
        behavior: { motion: "none", knockback: { horizontal: 48, vertical: 0, hitstop: .016 } },
        visual: miaVisual("arc", MC, MW, 44, "✦"),
        animation: miaAnim("strike", "claw swipe")
      },
      {
        name: "Double Paw", category: "normal", role: "medium-punch", variant: "light",
        startup: 6, active: 4, endlag: 9, hitstun: 15, reach: 168,
        combosInto: ["Mic Sweep", "Melody Claw", "High Note"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .06,
          knockback: { horizontal: 62, vertical: 0, hitstop: .02 }
        },
        visual: miaVisual("slashes", MP, MW, 54, "✧"),
        animation: miaAnim("strike", "double paw")
      },
      {
        name: "Mic Sweep", category: "normal", role: "heavy-punch", variant: "medium",
        startup: 9, active: 4, endlag: 14, hitstun: 20, reach: 232,
        combosInto: ["Mic Swing", "High Note"],
        behavior: {
          motion: "none",
          knockback: { horizontal: 118, vertical: 62, hitstop: .042 }
        },
        visual: { ...miaVisual("arc", MP, MY, 78, "🎤"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("strike", "mic sweep")
      },
      {
        name: "Quick Kick", category: "normal", role: "light-kick", variant: "light",
        startup: 4, active: 3, endlag: 8, hitstun: 12, reach: 148,
        combosInto: ["Double Paw", "Chorus Step"],
        behavior: { motion: "none", knockback: { horizontal: 50, vertical: 0, hitstop: .016 } },
        visual: miaVisual("arc", MC, MW, 46, "·"),
        animation: miaAnim("kick", "quick kick")
      },
      {
        name: "Stage Kick", category: "normal", role: "medium-kick", variant: "medium",
        startup: 8, active: 4, endlag: 11, hitstun: 17, reach: 196,
        combosInto: ["Mic Swing", "Melody Claw"],
        behavior: { motion: "none", knockback: { horizontal: 88, vertical: 42, hitstop: .028 } },
        visual: miaVisual("arc", MP, MW, 62, "♪"),
        animation: miaAnim("kick", "stage kick")
      },
      {
        name: "Turning Stage Kick", category: "normal", role: "heavy-kick", variant: "medium",
        startup: 13, active: 5, endlag: 16, hitstun: 24, reach: 244,
        combosInto: ["Rising Note"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .07,
          knockback: { horizontal: 208, vertical: 158, wallBounce: true, hitstop: .062 }
        },
        visual: miaVisual("slashes", MP, MW, 82, "✺"),
        animation: miaAnim("spin", "turning stage kick")
      },
      {
        name: "Low Slide Kick", category: "normal", role: "medium-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 7, active: 4, endlag: 12, hitstun: 17, reach: 216,
        combosInto: ["Double Paw", "Melody Claw", "High Note"],
        behavior: {
          motion: "slide", slideSpeed: 355,
          knockback: { horizontal: 62, vertical: 0, hitstop: .024 }
        },
        visual: miaVisual("slashes", MC, MW, 62, "⌁"),
        animation: miaAnim("kick", "low slide")
      },
      {
        name: "Tail Sweep", category: "normal", role: "heavy-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 12, active: 5, endlag: 19, hitstun: 22, reach: 238,
        knockdown: "hard",
        behavior: {
          motion: "slide", slideSpeed: 330, knockdown: "hard",
          knockback: { horizontal: 148, vertical: 0, hitstop: .048 }
        },
        visual: miaVisual("slashes", MP, MW, 70, "◡"),
        animation: miaAnim("kick", "tail sweep")
      },
      {
        name: "Mic Uppercut", category: "normal", role: "launcher", variant: "medium",
        launcher: true, crouch: true, startup: 9, active: 5, endlag: 15, hitstun: 28, reach: 208, juggle: 8,
        combosInto: ["Mic Spiral", "Rising Note"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 470,
          knockback: { horizontal: 68, vertical: 588, hitstop: .07 }
        },
        visual: { ...miaVisual("burst", MP, MY, 80, "⬆"), script: RISING_NOTE_SCRIPT },
        animation: miaAnim("strike", "mic uppercut")
      },
      {
        name: "Sharp Note", category: "normal", role: "medium-punch", variant: "medium",
        startup: 20, active: 4, endlag: 12, hitstun: 20, reach: 182, overhead: true,
        combosInto: ["Double Paw", "High Note", "Melody Claw"],
        behavior: {
          motion: "none",
          // Her voice is the hitbox — no travel, just a burst in front of her.
          knockback: { horizontal: 44, vertical: 78, hitstop: .03 }
        },
        visual: { ...miaVisual("burst", MG, MW, 64, "♬"), script: HIGH_NOTE_SCRIPT },
        animation: miaAnim("cast", "sharp note")
      },
      {
        name: "Mic Tap", category: "normal", role: "heavy-punch", variant: "heavy",
        startup: 18, active: 4, endlag: 20, hitstun: 26, reach: 288,
        combosInto: ["High Tone Rush"],
        behavior: {
          motion: "dash-attack", dashDistance: 68,
          knockback: { horizontal: 178, vertical: 88, hitstop: .075 }
        },
        visual: { ...miaVisual("arc", MP, MY, 88, "🎤"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("strike", "mic tap")
      },
      {
        name: "Backbeat Kick", category: "normal", role: "medium-kick", variant: "medium",
        startup: 9, active: 4, endlag: 13, hitstun: 18, reach: 212,
        combosInto: ["High Note"],
        behavior: { motion: "none", knockback: { horizontal: 132, vertical: 48, hitstop: .032 } },
        visual: miaVisual("arc", MC, MW, 62, "↩"),
        animation: miaAnim("kick", "backbeat kick")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "High Note", type: "projectile", role: "special", variant: "medium",
        startup: 11, active: 4, endlag: 15, hitstun: 18, reach: 430,
        combosInto: ["Chorus Step", "Melody Claw"],
        behavior: {
          // Short-lived sound pulse: fast, but it dies around 60% of the stage,
          // which keeps her midrange pressure rather than a zoner.
          motion: "projectile", speed: 520, radius: 26, range: 430,
          knockback: { horizontal: 128, vertical: 0, hitstop: .034 }
        },
        visual: { ...miaVisual("burst", MG, MW, 70, "♩", "main_musicburst"), script: HIGH_NOTE_SCRIPT },
        animation: miaAnim("cast", "high note")
      },
      {
        name: "Perfect High Note", type: "projectile", role: "launcher", variant: "heavy",
        launcher: true, tempoCost: 3, startup: 9, active: 5, endlag: 16, hitstun: 28, reach: 460, juggle: 8,
        combosInto: ["Mic Uppercut", "Mic Spiral"],
        behavior: {
          motion: "projectile", speed: 585, radius: 32, range: 460, pierce: true, hits: 3, hitInterval: .05,
          knockback: { horizontal: 96, vertical: 512, hitstop: .07 }
        },
        visual: { ...miaVisual("burst", MY, MW, 92, "★", "main_stylized_explosion"), script: HIGH_NOTE_SCRIPT },
        animation: miaAnim("cast", "perfect high note")
      },
      {
        name: "High Note Cancel", type: "melee", role: "special", variant: "light",
        startup: 9, active: 2, endlag: 8, hitstun: 6, reach: 190,
        combosInto: ["Claw Swipe", "Low Slide Kick", "Chorus Step"],
        behavior: {
          // The feint: she starts the note, then just... doesn't. Bait tool.
          motion: "charge", charge: .12, knockback: { horizontal: 0, vertical: 0 }
        },
        visual: { ...miaVisual("burst", MG, MW, 56, "…"), script: PULSE_SCRIPT },
        animation: miaAnim("cast", "note cancel")
      },
      {
        name: "Rising Note", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 7, active: 6, endlag: 20, hitstun: 30, reach: 196, juggle: 9,
        combosInto: ["Mic Spiral"],
        behavior: {
          motion: "multi-uppercut", hits: 3, rise: 520, invuln: .14,
          knockback: { horizontal: 72, vertical: 618, hitstop: .075 }
        },
        visual: { ...miaVisual("burst", MP, MY, 86, "⇑"), script: RISING_NOTE_SCRIPT },
        animation: miaAnim("strike", "rising note")
      },
      {
        name: "Chorus Step", type: "melee", role: "special", variant: "light",
        startup: 5, active: 3, endlag: 10, hitstun: 13, reach: 172,
        combosInto: ["Double Paw", "Melody Claw", "Low Slide Kick"],
        behavior: {
          motion: "dash", dashDistance: 118,
          knockback: { horizontal: 42, vertical: 0, hitstop: .018 }
        },
        visual: miaVisual("teleport", MC, MW, 58, "➜"),
        animation: miaAnim("dash", "chorus step")
      },
      {
        name: "Mic Swing", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 11, active: 6, endlag: 16, hitstun: 26, reach: 268, juggle: 7,
        combosInto: ["Mic Recall", "Mic Spiral"],
        behavior: {
          motion: "spin", hits: 3, hitInterval: .06,
          knockback: { horizontal: 96, vertical: 462, hitstop: .056 }
        },
        visual: { ...miaVisual("arc", MP, MY, 92, "🎤"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("spin", "mic swing")
      },
      {
        name: "Mic Recall", type: "projectile", role: "special", variant: "light",
        startup: 6, active: 4, endlag: 10, hitstun: 14, reach: 340,
        combosInto: ["Double Paw", "Chorus Step"],
        behavior: {
          // Snapping the cable back. Almost no damage, but it buys her the turn.
          motion: "projectile", speed: 620, pattern: "boomerang", returnDelay: .12, recall: true, radius: 14,
          knockback: { horizontal: 34, vertical: 0, hitstop: .018 }
        },
        visual: miaVisual("teleport", MC, MW, 54, "↩"),
        animation: miaAnim("cast", "mic recall")
      },
      {
        name: "Melody Claw", type: "melee", role: "special", variant: "medium",
        startup: 6, active: 16, endlag: 14, hitstun: 19, reach: 208,
        combosInto: ["High Note", "Mic Swing", "Chorus Step"],
        behavior: {
          motion: "rapid-jab", rapidHits: 3, hitInterval: .075,
          knockback: { horizontal: 78, vertical: 62, hitstop: .03, carry: true }
        },
        visual: { ...miaVisual("slashes", MP, MW, 70, "⩘"), script: MELODY_CLAW_SCRIPT },
        animation: miaAnim("strike", "melody claw")
      },
      {
        name: "Melody Finisher", type: "melee", role: "special", variant: "medium",
        startup: 10, active: 5, endlag: 16, hitstun: 24, reach: 236, overhead: true,
        behavior: {
          motion: "dash-attack", dashDistance: 58,
          knockback: { horizontal: 168, vertical: 138, groundBounce: true, hitstop: .06 }
        },
        visual: { ...miaVisual("arc", MY, MW, 78, "⤓"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("slam", "melody finisher")
      },
      {
        name: "Heartbeat Pulse", type: "melee", role: "special", variant: "light",
        startup: 8, active: 6, endlag: 14, hitstun: 8, reach: 158,
        combosInto: ["Chorus Step", "High Note"],
        behavior: {
          // Zero damage on purpose. It reads passive defense and pays her in Tempo.
          motion: "spin", hits: 1, knockback: { horizontal: 18, vertical: 0, hitstop: .012 }
        },
        visual: { ...miaVisual("burst", MP, MW, 76, "💗"), script: PULSE_SCRIPT },
        animation: miaAnim("cast", "heartbeat pulse")
      },
      // ── Air ──────────────────────────────────────────────────────────────
      {
        name: "Drop Claw", type: "combo", role: "air-medium-punch", variant: "light",
        air: true, startup: 5, active: 5, endlag: 9, hitstun: 16, reach: 162, juggle: 3,
        combosInto: ["Spotlight Kick", "Mic Spiral"],
        behavior: { motion: "none", knockback: { horizontal: 42, vertical: 158, hitstop: .02, carry: true } },
        visual: miaVisual("arc", MC, MW, 52, "✦"),
        animation: miaAnim("strike", "drop claw")
      },
      {
        name: "Spotlight Kick", type: "combo", role: "air-heavy-kick", variant: "medium",
        air: true, startup: 6, active: 6, endlag: 11, hitstun: 21, reach: 204, juggle: 4,
        combosInto: ["Mic Spiral", "Falling Note"],
        behavior: { motion: "none", knockback: { horizontal: 118, vertical: 208, hitstop: .036, carry: true } },
        visual: miaVisual("arc", MP, MW, 68, "♪"),
        animation: miaAnim("kick", "spotlight kick")
      },
      {
        name: "Falling Note", type: "projectile", role: "special", variant: "medium",
        air: true, startup: 8, active: 4, endlag: 14, hitstun: 16, reach: 380,
        behavior: {
          motion: "projectile", speed: 480, radius: 24, arc: .5, range: 380,
          knockback: { horizontal: 88, vertical: 42, hitstop: .03 }
        },
        visual: { ...miaVisual("burst", MG, MW, 64, "♫", "main_musicburst"), script: HIGH_NOTE_SCRIPT },
        animation: miaAnim("cast", "falling note")
      },
      {
        name: "Mic Spiral", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 5, active: 14, endlag: 13, hitstun: 24, reach: 232, juggle: 5,
        behavior: {
          motion: "spin", hits: 3, hitInterval: .058, knockdown: "hard",
          knockback: { horizontal: 198, vertical: 178, hitstop: .05 }
        },
        visual: { ...miaVisual("slashes", MP, MY, 84, "✺"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("spin", "mic spiral")
      },
      {
        name: "Vocal Float", type: "melee", role: "special", variant: "light",
        air: true, startup: 6, active: 3, endlag: 9, hitstun: 8, reach: 148,
        combosInto: ["Spotlight Kick", "Falling Note"],
        behavior: {
          // Not flight — just a held note that stalls the fall for a beat.
          motion: "charge", charge: .16, knockback: { horizontal: 24, vertical: 62, hitstop: .014 }
        },
        visual: { ...miaVisual("burst", MG, MW, 58, "◦"), script: PULSE_SCRIPT },
        animation: miaAnim("cast", "vocal float")
      }
    ],
    supers: [
      {
        name: "High Tone Rush", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 26, endlag: 20, hitstun: 32, reach: 322,
        behavior: {
          motion: "rapid-jab", rapidHits: 8, hitInterval: .05, dashDistance: 108, knockdown: "hard",
          knockback: { horizontal: 268, vertical: 468, hitstop: .095 }
        },
        visual: { ...miaVisual("burst", MG, MW, 122, "♬", "main_musicburst"), script: HIGH_NOTE_SCRIPT },
        animation: miaAnim("cast", "high tone rush")
      },
      {
        name: "Mic Check", type: "melee", role: "super", variant: "heavy",
        startup: 7, active: 22, endlag: 20, hitstun: 32, reach: 296,
        behavior: {
          motion: "spin", hits: 8, hitInterval: .052,
          knockback: { horizontal: 358, vertical: 248, wallBounce: true, hitstop: .11 }
        },
        visual: { ...miaVisual("arc", MP, MY, 126, "🎤", "main_stylized_explosion"), script: MIC_SWING_SCRIPT },
        animation: miaAnim("spin", "mic check")
      },
      {
        name: "Perfect Chorus", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 28, endlag: 18, hitstun: 33, reach: 302,
        behavior: {
          motion: "multi-uppercut", hits: 6, rise: 612,
          knockback: { horizontal: 218, vertical: 638, hitstop: .1 }
        },
        visual: { ...miaVisual("burst", MP, MW, 124, "⇑", "main_rebound_spiral"), script: RISING_NOTE_SCRIPT },
        animation: miaAnim("spin", "perfect chorus")
      },
      {
        name: "Dokidoki High Note", type: "combo", role: "super", variant: "heavy",
        startup: 7, active: 30, endlag: 22, hitstun: 34, reach: 348,
        behavior: {
          motion: "multi-uppercut", hits: 8, rise: 655,
          knockback: { horizontal: 428, vertical: 692, wallBounce: true, hitstop: .14 }
        },
        visual: { ...miaVisual("burst", MP, "#fffdf4", 142, "💗", "main_firework"), script: DOKIDOKI_SCRIPT },
        animation: miaAnim("slam", "dokidoki high note")
      }
    ]
  }
};
