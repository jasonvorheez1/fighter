// Layla (Beatcats) — A-tier footsies / rhythm pressure / counter-poke. Cool,
// restrained, always listening. Her FLOW meter (engine mechanic "flow") tracks
// hits landed on a fixed metronome: a Clean Hit tightens the next window, and
// four in a row buys five seconds of Perfect Verse — a small universal edge,
// not a payoff move. Her damage output is honest; the reward is in spacing.
const LP = "#b98bff", LW = "#f3ecff", LC = "#7d5fd6", LY = "#ffe066", LM = "#8fe4ff";

const laylaVisual = (effect, color = LP, secondary = LW, size = 58, emoji = "✦", vfx = "main_slash_color1") => ({
  effect, color, secondary, size, emoji, spriteUrl: null, mainVfx: vfx, hitVfx: "hit_round_spark", vfxFps: 20
});
const laylaAnim = (style = "strike", gesture = "claw") => ({
  style,
  windup: style === "kick" ? "hop" : "coil",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "slam" ? "slam" : "follow-through",
  gesture, intensity: 1.05, puppet: true, puppetAmount: .8
});

// ── Visual scripts ──────────────────────────────────────────────────────────
// Restrained by default: short, precise claw arcs and a mic-line, not big
// bursts. They only widen and brighten on the Clean-Hit / super variants.

const CLAW_SCRIPT = "for(let i=0;i<2;i++){const ph=p*2-i;if(ph<0||ph>1.1)continue;const d=1-Math.min(1,ph/1.1);api.slash(size*.2,-size*.1+i*size*.14,size*(.3+d*.16),(i%2?.4:-.4),1.3,i%2?color:secondary,3+d*5,(active?.85:.28)*d);}if(active){api.spark(size*.4,-size*.1,size*.4,secondary,.5,0);}";

const MIC_STRIKE_SCRIPT = "const sw=active?Math.sin(p*Math.PI):Math.max(0,p*2-1);const a=-1.7+sw*2.6;const hx=Math.cos(a)*size*.68,hy=Math.sin(a)*size*.46-size*.1;api.line(0,-size*.1,hx,hy,color,6,active?.8:.28);api.line(0,-size*.1,hx,hy,secondary,3,active?.62:.22);api.flash(hx,hy,size*.28,secondary,active?.55:.18);";

const VERSE_STRIKE_SCRIPT = "for(let i=0;i<4;i++){const ph=p*4-i;if(ph<0||ph>1.1)continue;const d=1-Math.min(1,ph/1.1);const x=size*(.14+i*.18);api.slash(x,-size*.1+Math.sin(i*1.7)*size*.14,size*(.24+d*.18),(i%2?.5:-.5),1.3,i%2?color:secondary,3+d*5,(active?.9:.28)*d);}if(active){api.spark(size*.5,-size*.1,size*.45,secondary,.55,0);}";

const RAP_BURST_SCRIPT = "for(let i=0;i<3;i++){const ph=p*1.5-i*.14;if(ph<0)continue;const g=Math.min(1,ph);const x=size*g*.9;api.ring(x,-size*.14,size*(.14+g*.3),i%2?color:secondary,3-i*.4,(active?.85:.28)*(1-g*.7));}if(active)api.flash(size*.16,-size*.14,size*.32,secondary,.42);";

const FLOW_BREAK_SCRIPT = "const lift=Math.max(0,p*2-.05)*size*1.05;api.line(0,0,0,-lift,color,5,active?.65:.22);for(let i=0;i<2;i++){const g=(p*1.2-i*.22);if(g<0)continue;api.ring(0,-lift+i*size*.1,size*(.16+g*.28),i%2?secondary:color,3,(active?.8:.26)*Math.max(0,1-g));}if(active)api.spark(0,-lift,size*.6,secondary,.68,-Math.PI/2);";

const FINAL_VERSE_SCRIPT = "for(let i=0;i<8;i++){const a=p*Math.PI*5+i*Math.PI*2/8;const d=(Math.sin(a*.9+p*3)+1)*.5;const r=size*(.26+d*.56);api.slash(Math.cos(a)*r*.46,Math.sin(a)*r*.18-size*.14,size*(.18+d*.4),a,1.6,i%3?color:secondary,3+d*7,(active?.88:.28)*(.25+d*.75));}if(active){api.ring(0,-size*.14,size*.78,secondary,4,.58);api.glow(color,size*.6);}";

export const layla = {
  id: "layla-beatcats",
  name: "Layla",
  author: "Beatcats",
  from: "Beatcats",
  portrait_url: "uploads/Layla.png",
  example: false,
  prompt: "Layla of Beatcats. A-tier footsies and counter-poke specialist who is always listening: her Flow meter rewards hitting the beat, tightening the window with every Clean Hit until Perfect Verse rewards four in a row.",
  config: {
    name: "Layla",
    author: "Beatcats",
    from: "Beatcats",
    style: "footsies / rhythm pressure / counter-poke specialist",
    personality: "cool, restrained, and quietly attentive — she looks aloof with her headphones on, but she is listening properly, and she is going to make you regret standing where you're standing",
    backstory: "Beatcats' rapper. She stays composed until the beat drops, then she gets assertive fast.",
    levelletter: "A",
    health: 1000,
    power: 80,
    damageScale: 1,
    mechanic: "flow",
    buttons: 6,
    combo: 3,
    smartness: 5,
    aggression: 3,
    defense: 4,
    speed: 4,
    range: 4,
    ai: {
      archetype: "balanced",
      idealGap: 190,
      aggression: .92,
      blockBias: 1.32,
      jumpBias: .82,
      zoneBias: .58,
      punish: 1.5,
      patience: 1.28,
      antiAir: 1.3,
      comboCommit: .7,
      preferredMoves: ["turning claw", "low slide", "verse strike", "rap burst", "flow break", "backtrack", "four bar verse"],
      avoidMoves: ["offbeat"]
    },
    color: LP,
    accent: "#5c3fa0",
    emojis: ["🎧", "♪", "✦", "🎤"],
    banter: [],
    specials: [
      // ── Normals ──────────────────────────────────────────────────────────
      {
        name: "Claw Jab", category: "normal", role: "light-punch", variant: "light",
        startup: 4, active: 3, endlag: 8, hitstun: 12, reach: 136,
        combosInto: ["Turning Claw", "Toe Kick"],
        behavior: { motion: "none", knockback: { horizontal: 44, vertical: 0, hitstop: .014 } },
        visual: { ...laylaVisual("arc", LC, LW, 42, "✦"), script: CLAW_SCRIPT },
        animation: laylaAnim("strike", "claw jab")
      },
      {
        name: "Turning Claw", category: "normal", role: "medium-punch", variant: "light",
        startup: 7, active: 4, endlag: 10, hitstun: 15, reach: 178,
        combosInto: ["Verse Strike", "Rhythm Step"],
        behavior: { motion: "none", knockback: { horizontal: 58, vertical: 0, hitstop: .02 } },
        visual: { ...laylaVisual("slashes", LP, LW, 56, "✧"), script: CLAW_SCRIPT },
        animation: laylaAnim("strike", "turning claw")
      },
      {
        name: "Mic Swing", category: "normal", role: "heavy-punch", variant: "medium",
        startup: 11, active: 4, endlag: 15, hitstun: 20, reach: 228,
        combosInto: ["Rap Burst"],
        behavior: { motion: "none", knockback: { horizontal: 96, vertical: 48, hitstop: .036 } },
        visual: { ...laylaVisual("arc", LP, LY, 74, "🎤"), script: MIC_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "mic swing")
      },
      {
        name: "Toe Kick", category: "normal", role: "light-kick", variant: "light",
        startup: 5, active: 3, endlag: 8, hitstun: 12, reach: 148,
        combosInto: ["Turning Claw", "Low Slide"],
        behavior: { motion: "none", knockback: { horizontal: 46, vertical: 0, hitstop: .014 } },
        visual: laylaVisual("arc", LC, LW, 44, "·"),
        animation: laylaAnim("kick", "toe kick")
      },
      {
        name: "Side Kick", category: "normal", role: "medium-kick", variant: "medium",
        startup: 8, active: 4, endlag: 11, hitstun: 17, reach: 202,
        combosInto: ["Verse Strike", "Rap Burst"],
        behavior: { motion: "none", knockback: { horizontal: 74, vertical: 0, hitstop: .026 } },
        visual: laylaVisual("arc", LP, LW, 60, "♪"),
        animation: laylaAnim("kick", "side kick")
      },
      {
        name: "Spinning Heel Kick", category: "normal", role: "heavy-kick", variant: "medium",
        startup: 14, active: 5, endlag: 17, hitstun: 22, reach: 236,
        combosInto: ["Flow Break"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .07,
          knockback: { horizontal: 158, vertical: 168, wallBounce: true, hitstop: .05 }
        },
        visual: laylaVisual("slashes", LP, LW, 78, "✺"),
        animation: laylaAnim("spin", "spinning heel kick")
      },
      {
        name: "Low Kick", category: "normal", role: "light-crouch-kick", variant: "light",
        crouch: true, low: true, startup: 5, active: 3, endlag: 9, hitstun: 13, reach: 158,
        combosInto: ["Claw Jab", "Low Slide"],
        behavior: { motion: "none", knockback: { horizontal: 44, vertical: 0, hitstop: .016 } },
        visual: laylaVisual("arc", LC, LW, 46, "⌁"),
        animation: laylaAnim("kick", "low kick")
      },
      {
        name: "Low Slide", category: "normal", role: "medium-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 8, active: 4, endlag: 12, hitstun: 17, reach: 218,
        combosInto: ["Verse Strike", "Flow Break", "Rap Burst"],
        behavior: {
          motion: "slide", slideSpeed: 350,
          knockback: { horizontal: 62, vertical: 0, hitstop: .024 }
        },
        visual: laylaVisual("slashes", LP, LW, 62, "⌁"),
        animation: laylaAnim("kick", "low slide")
      },
      {
        name: "Mic Uppercut", category: "normal", role: "launcher", variant: "medium",
        launcher: true, crouch: true, startup: 9, active: 5, endlag: 15, hitstun: 26, reach: 196, juggle: 8,
        combosInto: ["Downbeat"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 460,
          knockback: { horizontal: 62, vertical: 570, hitstop: .062 }
        },
        visual: { ...laylaVisual("burst", LP, LY, 76, "⬆"), script: FLOW_BREAK_SCRIPT },
        animation: laylaAnim("strike", "mic uppercut")
      },
      {
        name: "Low Spin Sweep", category: "normal", role: "heavy-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 12, active: 5, endlag: 18, hitstun: 21, reach: 232,
        knockdown: "hard",
        behavior: {
          motion: "spin", hits: 2, hitInterval: .07, knockdown: "hard",
          knockback: { horizontal: 118, vertical: 0, hitstop: .044 }
        },
        visual: laylaVisual("slashes", LC, LW, 68, "◡"),
        animation: laylaAnim("spin", "low spin sweep")
      },
      {
        name: "Offbeat", category: "normal", role: "medium-punch", variant: "medium",
        startup: 21, active: 4, endlag: 13, hitstun: 19, reach: 186, overhead: true,
        combosInto: ["Turning Claw", "Verse Strike"],
        // A deliberately awkward, hitching wind-up — meant to break rhythm.
        behavior: { motion: "charge", charge: .2, knockback: { horizontal: 60, vertical: 78, hitstop: .03 } },
        visual: laylaVisual("arc", LM, LW, 66, "↘"),
        animation: laylaAnim("cast", "offbeat")
      },
      {
        name: "Bass Kick", category: "normal", role: "heavy-kick", variant: "heavy",
        startup: 12, active: 5, endlag: 18, hitstun: 20, reach: 214,
        behavior: {
          motion: "dash-attack", dashDistance: 96,
          knockback: { horizontal: 148, vertical: 68, hitstop: .046 }
        },
        visual: laylaVisual("arc", LP, LW, 76, "»"),
        animation: laylaAnim("kick", "bass kick")
      },
      {
        name: "Backtrack", category: "normal", role: "medium-kick", variant: "light",
        startup: 7, active: 4, endlag: 8, hitstun: 15, reach: 196,
        // A long, low-committal poke with unusually quick recovery for its
        // range — the whiff-punish tool, even without a literal retreat step.
        behavior: { motion: "none", knockback: { horizontal: 58, vertical: 0, hitstop: .022 } },
        visual: laylaVisual("arc", LC, LW, 56, "↩"),
        animation: laylaAnim("kick", "backtrack")
      },
      {
        name: "Mic Check", category: "normal", role: "heavy-punch", variant: "medium",
        startup: 16, active: 4, endlag: 15, hitstun: 19, reach: 244,
        behavior: { motion: "none", knockback: { horizontal: 108, vertical: 52, hitstop: .034 } },
        visual: { ...laylaVisual("arc", LP, LY, 70, "🎤"), script: MIC_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "mic check")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "Verse Strike", type: "melee", role: "special", variant: "medium",
        startup: 8, active: 18, endlag: 14, hitstun: 18, reach: 210,
        combosInto: ["Rap Burst", "Flow Break"],
        behavior: {
          motion: "rapid-jab", rapidHits: 4, hitInterval: .06,
          knockback: { horizontal: 40, vertical: 88, hitstop: .018, carry: true }
        },
        visual: { ...laylaVisual("slashes", LP, LW, 68, "⩘"), script: VERSE_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "verse strike")
      },
      {
        name: "Rhythm Step", type: "melee", role: "special", variant: "light",
        startup: 5, active: 4, endlag: 10, hitstun: 13, reach: 172,
        combosInto: ["Claw Jab", "Turning Claw", "Verse Strike"],
        behavior: {
          motion: "dash", dashDistance: 116,
          knockback: { horizontal: 36, vertical: 0, hitstop: .016 }
        },
        visual: laylaVisual("teleport", LC, LW, 56, "➜"),
        animation: laylaAnim("dash", "rhythm step")
      },
      {
        name: "Rap Burst", type: "projectile", role: "special", variant: "medium",
        startup: 10, active: 4, endlag: 15, hitstun: 17, reach: 380,
        combosInto: ["Cable Trip"],
        behavior: {
          // Roughly a third of the stage, not fullscreen.
          motion: "projectile", speed: 500, radius: 24, range: 380,
          knockback: { horizontal: 110, vertical: 0, hitstop: .03 }
        },
        visual: { ...laylaVisual("burst", LP, LW, 64, "♩", "main_musicburst"), script: RAP_BURST_SCRIPT },
        animation: laylaAnim("cast", "rap burst")
      },
      {
        name: "Drop the Beat", type: "melee", role: "special", variant: "light",
        startup: 6, active: 20, endlag: 10, hitstun: 20, reach: 160,
        // Reads the incoming timing rather than blocking outright.
        behavior: { motion: "charge", charge: .3, counterWindow: .3, knockback: { horizontal: 82, vertical: 0, hitstop: .028 } },
        visual: laylaVisual("teleport", LM, LW, 60, "◦"),
        animation: laylaAnim("cast", "drop the beat")
      },
      {
        name: "Headphone Slip", type: "melee", role: "special", variant: "light",
        startup: 7, active: 5, endlag: 12, hitstun: 15, reach: 182,
        combosInto: ["Verse Strike"],
        behavior: {
          motion: "charge", charge: .16, invuln: .12,
          knockback: { horizontal: 68, vertical: 0, hitstop: .024 }
        },
        visual: laylaVisual("teleport", LC, LW, 58, "⇄"),
        animation: laylaAnim("dash", "headphone slip")
      },
      {
        name: "Cable Trip", type: "melee", role: "special", variant: "medium",
        crouch: true, low: true, startup: 20, active: 4, endlag: 24, hitstun: 22, reach: 176,
        knockdown: "hard",
        behavior: {
          motion: "slide", slideSpeed: 260, knockdown: "hard",
          knockback: { horizontal: 68, vertical: 0, hitstop: .034 }
        },
        visual: laylaVisual("slashes", LC, LW, 60, "⌁"),
        animation: laylaAnim("kick", "cable trip")
      },
      {
        name: "Flow Break", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 6, active: 6, endlag: 18, hitstun: 28, reach: 194, juggle: 8,
        combosInto: ["Downbeat"],
        behavior: {
          motion: "multi-uppercut", hits: 3, rise: 500,
          knockback: { horizontal: 58, vertical: 590, hitstop: .06 }
        },
        visual: { ...laylaVisual("burst", LP, LY, 84, "⇑"), script: FLOW_BREAK_SCRIPT },
        animation: laylaAnim("strike", "flow break")
      },
      {
        name: "Verse Loop", type: "melee", role: "special", variant: "medium",
        startup: 4, active: 16, endlag: 14, hitstun: 18, reach: 200,
        behavior: {
          motion: "rapid-jab", rapidHits: 3, hitInterval: .075,
          knockback: { horizontal: 46, vertical: 78, hitstop: .02, carry: true }
        },
        visual: { ...laylaVisual("slashes", LP, LW, 66, "♬"), script: VERSE_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "verse loop")
      },
      // ── Air ──────────────────────────────────────────────────────────────
      {
        name: "Downward Claw", type: "combo", role: "air-medium-punch", variant: "light",
        air: true, startup: 5, active: 5, endlag: 9, hitstun: 16, reach: 158, juggle: 3,
        combosInto: ["Air-to-Air Kick", "Downbeat"],
        behavior: { motion: "none", knockback: { horizontal: 30, vertical: 138, hitstop: .018, carry: true } },
        visual: { ...laylaVisual("arc", LC, LW, 50, "✦"), script: CLAW_SCRIPT },
        animation: laylaAnim("strike", "downward claw")
      },
      {
        name: "Air-to-Air Kick", type: "combo", role: "air-medium-kick", variant: "light",
        air: true, startup: 5, active: 5, endlag: 9, hitstun: 17, reach: 180, juggle: 3,
        combosInto: ["Downbeat", "Rhythm Drift"],
        behavior: { motion: "none", knockback: { horizontal: 78, vertical: 128, hitstop: .022, carry: true } },
        visual: laylaVisual("arc", LP, LW, 58, "♪"),
        animation: laylaAnim("kick", "air-to-air kick")
      },
      {
        name: "Mic Drop", type: "combo", role: "air-heavy-punch", variant: "medium",
        air: true, startup: 8, active: 6, endlag: 13, hitstun: 21, reach: 206, juggle: 3,
        behavior: {
          motion: "dive-kick", speed: 380,
          knockback: { horizontal: 108, vertical: 168, groundBounce: true, hitstop: .04 }
        },
        visual: { ...laylaVisual("burst", LP, LY, 74, "▼"), script: MIC_STRIKE_SCRIPT },
        animation: laylaAnim("slam", "mic drop")
      },
      {
        name: "Cross Kick", type: "combo", role: "air-heavy-kick", variant: "medium",
        air: true, startup: 7, active: 6, endlag: 11, hitstun: 20, reach: 196, juggle: 3,
        behavior: { motion: "spin", hits: 2, hitInterval: .06, knockback: { horizontal: 118, vertical: 178, hitstop: .03, carry: true } },
        visual: laylaVisual("slashes", LP, LW, 70, "✺"),
        animation: laylaAnim("spin", "cross kick")
      },
      {
        name: "Downbeat", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 5, active: 7, endlag: 12, hitstun: 22, reach: 190, juggle: 3,
        behavior: {
          motion: "dive-kick", speed: 400,
          knockback: { horizontal: 82, vertical: 148, groundBounce: true, hitstop: .034 }
        },
        visual: { ...laylaVisual("burst", LM, LW, 68, "⇓"), script: RAP_BURST_SCRIPT },
        animation: laylaAnim("kick", "downbeat")
      },
      {
        name: "Rhythm Drift", type: "melee", role: "special", variant: "light",
        air: true, startup: 4, active: 3, endlag: 9, hitstun: 10, reach: 140,
        combosInto: ["Air-to-Air Kick"],
        behavior: { motion: "charge", charge: .14, knockback: { horizontal: 24, vertical: 48, hitstop: .014 } },
        visual: laylaVisual("teleport", LC, LW, 50, "◦"),
        animation: laylaAnim("dash", "rhythm drift")
      },
      {
        name: "Spoken Word", type: "projectile", role: "special", variant: "light",
        air: true, startup: 8, active: 4, endlag: 12, hitstun: 20, reach: 220,
        behavior: {
          motion: "projectile", speed: 460, radius: 20, arc: .55, range: 220,
          knockback: { horizontal: 70, vertical: 32, hitstop: .026 }
        },
        visual: { ...laylaVisual("burst", LM, LW, 58, "♫", "main_musicburst"), script: RAP_BURST_SCRIPT },
        animation: laylaAnim("cast", "spoken word")
      }
    ],
    supers: [
      {
        name: "Four Bar Verse", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 26, endlag: 18, hitstun: 30, reach: 288,
        behavior: {
          motion: "rapid-jab", rapidHits: 8, hitInterval: .05,
          knockback: { horizontal: 208, vertical: 288, hitstop: .07, carry: true }
        },
        visual: { ...laylaVisual("slashes", LP, LW, 116, "♬", "main_musicburst"), script: VERSE_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "four bar verse")
      },
      {
        name: "Beat Reversal", type: "melee", role: "super", variant: "heavy",
        startup: 3, active: 10, endlag: 16, hitstun: 28, reach: 236, invuln: .2,
        behavior: {
          motion: "dash-attack", dashDistance: 40, invuln: .2,
          knockback: { horizontal: 168, vertical: 138, hitstop: .06 }
        },
        visual: { ...laylaVisual("teleport", LM, LW, 100, "⇚", "main_stylized_explosion"), script: MIC_STRIKE_SCRIPT },
        animation: laylaAnim("strike", "beat reversal")
      },
      {
        name: "Perfect Flow", type: "melee", role: "super", variant: "heavy",
        startup: 5, active: 22, endlag: 16, hitstun: 28, reach: 260,
        behavior: {
          motion: "spin", hits: 6, hitInterval: .05,
          knockback: { horizontal: 158, vertical: 208, hitstop: .06, carry: true }
        },
        visual: { ...laylaVisual("burst", LP, LY, 110, "★", "main_rebound_spiral"), script: FLOW_BREAK_SCRIPT },
        animation: laylaAnim("spin", "perfect flow")
      },
      {
        name: "Final Verse", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 30, endlag: 20, hitstun: 32, reach: 322,
        behavior: {
          motion: "spin", hits: 8, hitInterval: .045,
          knockback: { horizontal: 358, vertical: 468, wallBounce: true, hitstop: .12 }
        },
        visual: { ...laylaVisual("burst", LP, "#fdf6ff", 132, "🎤", "main_firework"), script: FINAL_VERSE_SCRIPT },
        animation: laylaAnim("slam", "final verse")
      }
    ]
  }
};
