// Rico (Beatcats) — SS-tier air-combo dealer. Every hit is small, nothing is
// ever the last hit, and the BEAT meter means the combo gets EASIER the longer
// it runs. Damage per hit is deliberately tiny; damageScale is low so a 60-hit
// route lands around 520 instead of deleting a health bar.
const RY = "#ffd93d", RW = "#fffbe6", RO = "#ff9f1c", RP = "#ff5fa2", RC = "#4fe3ff";

const ricoVisual = (effect, color = RY, secondary = RW, size = 58, emoji = "♪", spriteUrl = null, vfx = "main_slash_color1") => ({
  effect, color, secondary, size, emoji, spriteUrl, mainVfx: vfx, hitVfx: "hit_round_spark", vfxFps: 24
});
const ricoAnim = (style = "kick", gesture = "dance") => ({
  style,
  windup: style === "kick" ? "hop" : style === "spin" ? "coil" : "coil",
  contact: style === "kick" ? "foot" : style === "cast" ? "energy" : "body",
  finish: style === "slam" ? "slam" : "follow-through",
  gesture, intensity: 1.35, puppet: true, puppetAmount: .94
});

// ── Visual scripts ──────────────────────────────────────────────────────────
// Rico's effects all use fake-Z: things orbit her on tilted ellipses and scale
// with depth, so kicks read as rotating through the screen rather than across it.

const TAIL_SPIN_SCRIPT = "for(let i=0;i<7;i++){const a=p*Math.PI*7+i*Math.PI*2/7;const d=(Math.sin(a)+1)*.5;const r=size*(.34+d*.5);api.slash(Math.cos(a)*r*.42,Math.sin(a)*r*.16-size*.1,size*(.26+d*.4),a,1.5+d,i%2?color:secondary,3+d*7,(active?.85:.26)*(.3+d*.7));}if(active){api.ring(0,-size*.1,size*.72,secondary,4,.5);api.glow(color,size*.5);}";

const DANCE_CHAIN_SCRIPT = "const step=Math.floor(p*4);for(let i=0;i<4;i++){const ph=p*4-i;if(ph<0||ph>1.4)continue;const d=1-Math.min(1,ph/1.4);const x=size*(.18+i*.26),y=-size*.1+Math.sin(i*2.1)*size*.22;api.slash(x,y,size*(.3+d*.26),(i%2?-.5:.5)+p*2,1.3,i%2?color:secondary,4+d*6,(active?.9:.3)*d);}if(active){api.spark(size*.5,-size*.1,size*.6,secondary,.7,0);}";

const BEAT_POP_SCRIPT = "const lift=Math.max(0,p*2-.05)*size*1.25;for(let i=0;i<3;i++){const a=p*Math.PI*8+i*2.1;const d=(Math.cos(a)+1)*.5;api.slash(Math.cos(a)*size*.2,-lift+i*size*.16,size*(.42-i*.07)*(.6+d*.7),a,1.5,i%2?color:secondary,4+d*6,(active?.9:.3)*(1-i*.24));}if(active){api.spark(0,-lift,size*.8,secondary,.85,-Math.PI/2);api.ring(0,-lift,size*.4,color,5,.66);api.glow(color,size*.5);}";

const RHYTHM_KICK_SCRIPT = "const beats=8;for(let i=0;i<beats;i++){const ph=p*beats-i;if(ph<0||ph>1)continue;const d=1-ph;const a=-.9+i*.42;const r=size*(.5+Math.sin(i*1.3)*.2);api.line(0,-size*.12,Math.cos(a)*r,Math.sin(a)*r-size*.12,i%2?color:secondary,3+d*7,(active?.95:.3)*d);api.flash(Math.cos(a)*r,Math.sin(a)*r-size*.12,size*.3*d,secondary,.5*d);}if(active){api.ring(0,-size*.12,size*.6,color,4,.5);}";

const AIR_RELAUNCH_SCRIPT = "if(active){api.wedge(0,-size*.2,size*1.1,size*.34,color,.42);api.streak(0,-size*.3,size*2.6,4,secondary,size*.16,.95);api.flash(0,size*.2,size*.8,secondary,.7);api.ring(0,size*.2,size*.5,color,6,.7);}else{const w=(p-.25)/.75;if(w>0){api.ring(0,size*.2,size*w*2,color,6,(1-w)*.7);api.ring(0,size*.2,size*w*1.05,secondary,3,(1-w)*.5);}}";

const HIGH_TENSION_SCRIPT = "for(let i=0;i<10;i++){const a=p*Math.PI*6+i*Math.PI*2/10;const d=(Math.sin(a*.8+p*4)+1)*.5;const r=size*(.3+d*.62);api.slash(Math.cos(a)*r*.5,Math.sin(a)*r*.2-size*.16,size*(.2+d*.46),a,1.7,i%3?color:secondary,3+d*8,(active?.9:.3)*(.25+d*.75));}if(active){api.ring(0,-size*.16,size*.85,secondary,5,.62);api.ring(0,-size*.16,size*1.25,color,3,.4);api.glow(color,size*.7);api.flash(0,-size*.16,size*.6,RW,.5);}";

export const rico = {
  id: "rico-beatcats",
  name: "Rico",
  author: "Beatcats",
  from: "Beatcats",
  portrait_url: "uploads/Rico.png",
  example: false,
  prompt: "Rico of Beatcats. SS-tier air-combo dealer whose BEAT meter unlocks new combo privileges every ten hits, turning any stray touch into a 70-hit dance routine.",
  config: {
    name: "Rico",
    author: "Beatcats",
    from: "Beatcats",
    style: "hyper-rushdown / air-combo specialist / combo dealer",
    personality: "boundlessly energetic, high-tension, and visibly delighted the longer the combo goes — a performer first, a fighter second",
    backstory: "Beatcats' main dancer. She turned choreography into a fighting style, and the beat does not stop for anyone.",
    levelletter: "SS",
    health: 900,
    power: 74,
    damageScale: .58,
    mechanic: "beat",
    buttons: 6,
    combo: 5,
    smartness: 5,
    aggression: 5,
    defense: 4,
    speed: 5,
    range: 3,
    ai: {
      archetype: "rushdown",
      idealGap: 138,
      aggression: 1.48,
      blockBias: 1.02,
      jumpBias: 1.72,
      zoneBias: .18,
      punish: 1.46,
      patience: .42,
      antiAir: 1.34,
      comboCommit: 1.62,
      preferredMoves: ["freestyle chain", "beat rush", "tail mixer", "sky mixer", "beat pop", "shooting tail", "rhythm kick", "encore relaunch", "paw dive", "tail bounce"],
      avoidMoves: []
    },
    color: RY,
    accent: "#c9891f",
    emojis: ["♪", "🐾", "✨", "🎤"],
    banter: [],
    specials: [
      // ── Ground normals: the Freestyle Chain ──────────────────────────────
      {
        name: "Paw Jab", category: "normal", role: "light-punch", variant: "light",
        startup: 4, active: 3, endlag: 7, hitstun: 11, reach: 132,
        combosInto: ["Shin Beat", "Turning Claw"],
        behavior: { motion: "none", knockback: { horizontal: 40, vertical: 0, hitstop: .014 } },
        visual: ricoVisual("arc", RY, RW, 40, "✦"),
        animation: ricoAnim("strike", "paw jab")
      },
      {
        name: "Shin Beat", category: "normal", role: "light-kick", variant: "light",
        startup: 3, active: 3, endlag: 7, hitstun: 11, reach: 142,
        combosInto: ["Turning Claw", "Step Kick"],
        behavior: { motion: "none", knockback: { horizontal: 44, vertical: 0, hitstop: .014 } },
        visual: ricoVisual("arc", RO, RW, 44, "·"),
        animation: ricoAnim("kick", "shin beat")
      },
      {
        name: "Turning Claw", category: "normal", role: "medium-punch", variant: "light",
        startup: 5, active: 3, endlag: 8, hitstun: 14, reach: 158,
        combosInto: ["Step Kick", "Freestyle Chain", "Beat Rush"],
        behavior: { motion: "none", knockback: { horizontal: 56, vertical: 0, hitstop: .018 } },
        visual: ricoVisual("slashes", RY, RW, 52, "✧"),
        animation: ricoAnim("spin", "turning claw")
      },
      {
        name: "Step Kick", category: "normal", role: "medium-kick", variant: "light",
        startup: 6, active: 3, endlag: 9, hitstun: 15, reach: 172,
        combosInto: ["Spinning Back Claw", "Tail Mixer"],
        behavior: { motion: "none", knockback: { horizontal: 62, vertical: 0, hitstop: .02 } },
        visual: ricoVisual("arc", RO, RW, 56, "♪"),
        animation: ricoAnim("kick", "step kick")
      },
      {
        name: "Spinning Back Claw", category: "normal", role: "heavy-punch", variant: "medium",
        startup: 9, active: 4, endlag: 12, hitstun: 20, reach: 196, juggle: 5,
        combosInto: ["Lion Tail Kick", "Beat Rush"],
        behavior: {
          motion: "dash-attack", dashDistance: 64,
          // Floats rather than knocks away — this is a relaunch normal.
          knockback: { horizontal: 58, vertical: 232, hitstop: .034, carry: true }
        },
        visual: ricoVisual("slashes", RY, RW, 68, "✹"),
        animation: ricoAnim("spin", "spinning back claw")
      },
      {
        name: "Lion Tail Kick", category: "normal", role: "launcher", variant: "medium",
        launcher: true, startup: 10, active: 5, endlag: 14, hitstun: 26, reach: 238, juggle: 10,
        combosInto: ["Beat Pop", "Sky Mixer"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 340,
          // Deliberately low launch angle so Rico can chase horizontally.
          knockback: { horizontal: 138, vertical: 402, hitstop: .05, carry: true }
        },
        visual: { ...ricoVisual("burst", RY, RW, 82, "↗"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "lion tail kick")
      },
      {
        name: "Split Step", category: "normal", role: "light-crouch-kick", variant: "light",
        crouch: true, low: true, startup: 6, active: 3, endlag: 11, hitstun: 16, reach: 208,
        combosInto: ["Paw Jab", "Turning Claw", "Beat Rush"],
        behavior: {
          motion: "slide", slideSpeed: 380,
          knockback: { horizontal: 48, vertical: 0, hitstop: .022 }
        },
        visual: ricoVisual("slashes", RO, RW, 60, "⌁"),
        animation: ricoAnim("kick", "split step")
      },
      {
        name: "Tail Sweep", category: "normal", role: "heavy-crouch-kick", variant: "medium",
        crouch: true, low: true, startup: 12, active: 4, endlag: 17, hitstun: 22, reach: 248,
        knockdown: "hard", combosInto: ["Beat Pop"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .06, knockdown: "hard",
          knockback: { horizontal: 96, vertical: 118, groundBounce: true, hitstop: .04 }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 72, "◡"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "tail sweep")
      },
      {
        name: "Rising Tail", category: "normal", role: "launcher", variant: "medium",
        launcher: true, crouch: true, startup: 7, active: 5, endlag: 16, hitstun: 30, reach: 186, juggle: 11,
        combosInto: ["Sky Mixer", "Freestyle Air Chain"],
        behavior: {
          motion: "multi-uppercut", hits: 2, rise: 520, counterWindow: .1,
          knockback: { horizontal: 44, vertical: 618, hitstop: .06 }
        },
        visual: { ...ricoVisual("burst", RY, RW, 80, "⬆"), script: BEAT_POP_SCRIPT },
        animation: ricoAnim("spin", "rising tail")
      },
      {
        name: "Dancing Paw", category: "normal", role: "medium-punch", variant: "medium",
        startup: 14, active: 4, endlag: 13, hitstun: 18, reach: 190, overhead: true,
        combosInto: ["Turning Claw", "Beat Rush"],
        behavior: { motion: "dash-attack", dashDistance: 72, knockback: { horizontal: 72, vertical: 96, hitstop: .03 } },
        visual: ricoVisual("arc", RP, RW, 62, "↘"),
        animation: ricoAnim("kick", "dancing paw")
      },
      {
        name: "Back Beat", category: "normal", role: "heavy-kick", variant: "medium",
        startup: 8, active: 4, endlag: 13, hitstun: 19, reach: 214,
        combosInto: ["Beat Rush", "Rhythm Kick"],
        behavior: {
          motion: "none",
          // The "pull" property: almost no pushback, so she keeps her prey close.
          knockback: { horizontal: 12, vertical: 128, hitstop: .03, carry: true }
        },
        visual: ricoVisual("arc", RO, RW, 62, "↩"),
        animation: ricoAnim("kick", "back beat")
      },
      // ── The chains ───────────────────────────────────────────────────────
      {
        name: "Freestyle Chain", type: "melee", role: "special", variant: "light",
        startup: 4, active: 18, endlag: 12, hitstun: 15, reach: 178,
        combosInto: ["Beat Rush", "Lion Tail Kick", "Tail Mixer"],
        behavior: {
          motion: "rapid-jab", rapidHits: 6, hitInterval: .052,
          knockback: { horizontal: 26, vertical: 42, hitstop: .012, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 62, "♬"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("strike", "freestyle chain")
      },
      {
        name: "Freestyle Air Chain", type: "combo", role: "air-special", variant: "light",
        air: true, startup: 3, active: 20, endlag: 10, hitstun: 16, reach: 168, juggle: 3,
        combosInto: ["Sky Mixer", "Tail Bounce", "Heel Beat"],
        behavior: {
          motion: "rapid-jab", rapidHits: 6, hitInterval: .048,
          knockback: { horizontal: 18, vertical: 128, hitstop: .012, carry: true }
        },
        visual: { ...ricoVisual("slashes", RO, RW, 60, "♫"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("strike", "air freestyle")
      },
      // ── Specials ─────────────────────────────────────────────────────────
      {
        name: "Beat Rush", type: "melee", role: "special", variant: "medium",
        startup: 7, active: 22, endlag: 14, hitstun: 18, reach: 232,
        combosInto: ["Lion Tail Kick", "Beat Pop", "Tail Mixer"],
        behavior: {
          motion: "rapid-jab", rapidHits: 6, hitInterval: .05, dashDistance: 96,
          knockback: { horizontal: 34, vertical: 96, hitstop: .016, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 72, "≫"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("strike", "beat rush")
      },
      {
        name: "Cat Scratch Fever", type: "melee", role: "special", variant: "medium",
        startup: 8, active: 24, endlag: 16, hitstun: 17, reach: 198,
        combosInto: ["Beat Pop", "Rhythm Kick"],
        behavior: {
          motion: "rapid-jab", rapidHits: 7, hitInterval: .044,
          knockback: { horizontal: 30, vertical: 68, hitstop: .014, carry: true }
        },
        visual: { ...ricoVisual("slashes", RP, RW, 68, "⩘"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("strike", "cat scratch fever")
      },
      {
        name: "Tail Mixer", type: "melee", role: "special", variant: "medium",
        startup: 9, active: 22, endlag: 15, hitstun: 20, reach: 246,
        combosInto: ["Beat Pop", "Sky Mixer", "Rhythm Kick"],
        behavior: {
          motion: "spin", hits: 8, hitInterval: .05,
          knockback: { horizontal: 44, vertical: 178, hitstop: .022, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 88, "✺"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "tail mixer")
      },
      {
        name: "Sky Mixer", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 5, active: 22, endlag: 12, hitstun: 22, reach: 238, juggle: 4,
        combosInto: ["Tail Bounce", "Freestyle Air Chain", "Shooting Tail"],
        behavior: {
          motion: "spin", hits: 8, hitInterval: .048,
          // Holds them up rather than sending them away — the routing tool.
          knockback: { horizontal: 30, vertical: 268, hitstop: .022, carry: true }
        },
        visual: { ...ricoVisual("slashes", RO, RW, 86, "✵"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "sky mixer")
      },
      {
        name: "Beat Pop", type: "melee", role: "launcher", variant: "medium",
        launcher: true, startup: 5, active: 8, endlag: 18, hitstun: 30, reach: 192, juggle: 11,
        combosInto: ["Freestyle Air Chain", "Sky Mixer"],
        behavior: {
          motion: "multi-uppercut", hits: 5, rise: 545, invuln: .12,
          knockback: { horizontal: 52, vertical: 632, hitstop: .052 }
        },
        visual: { ...ricoVisual("burst", RY, RW, 88, "⇑"), script: BEAT_POP_SCRIPT },
        animation: ricoAnim("spin", "beat pop")
      },
      {
        name: "Rhythm Kick", type: "melee", role: "special", variant: "medium",
        startup: 8, active: 26, endlag: 18, hitstun: 24, reach: 252,
        combosInto: ["Beat Pop", "Tail Mixer"],
        behavior: {
          // Eight timed strikes: the "PERFECT BEAT" version of the move.
          motion: "rapid-jab", rapidHits: 8, hitInterval: .056,
          knockback: { horizontal: 40, vertical: 168, hitstop: .02, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 78, "♩"), script: RHYTHM_KICK_SCRIPT },
        animation: ricoAnim("kick", "rhythm kick")
      },
      {
        name: "Beat Claw", type: "melee", role: "special", variant: "light",
        startup: 6, active: 4, endlag: 12, hitstun: 18, reach: 210,
        combosInto: ["Beat Rush", "Tail Mixer"],
        behavior: {
          motion: "teleport", offset: 74,
          knockback: { horizontal: 62, vertical: 88, hitstop: .026, carry: true }
        },
        visual: ricoVisual("teleport", RC, RW, 66, "⇄"),
        animation: ricoAnim("dash", "beat claw")
      },
      {
        name: "Dance Break", type: "melee", role: "special", variant: "light",
        startup: 4, active: 3, endlag: 8, hitstun: 12, reach: 168,
        combosInto: ["Turning Claw", "Beat Rush", "Split Step", "Freestyle Chain"],
        behavior: {
          motion: "dash", dashDistance: 128,
          knockback: { horizontal: 30, vertical: 0, hitstop: .014 }
        },
        visual: ricoVisual("teleport", RY, RW, 58, "➜"),
        animation: ricoAnim("dash", "dance break")
      },
      // ── Air normals & air specials ───────────────────────────────────────
      {
        name: "Falling Paw", type: "combo", role: "air-light-punch", variant: "light",
        air: true, startup: 3, active: 4, endlag: 8, hitstun: 14, reach: 152, juggle: 2,
        combosInto: ["Double Swipe", "Freestyle Air Chain"],
        behavior: { motion: "none", knockback: { horizontal: 20, vertical: 138, hitstop: .012, carry: true } },
        visual: ricoVisual("arc", RY, RW, 46, "✦"),
        animation: ricoAnim("strike", "falling paw")
      },
      {
        name: "Double Swipe", type: "combo", role: "air-medium-punch", variant: "light",
        air: true, startup: 4, active: 6, endlag: 9, hitstun: 16, reach: 164, juggle: 3,
        combosInto: ["Sky Mixer", "Shooting Tail"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .06,
          knockback: { horizontal: 24, vertical: 168, hitstop: .014, carry: true }
        },
        visual: ricoVisual("slashes", RO, RW, 56, "✧"),
        animation: ricoAnim("strike", "double swipe")
      },
      {
        name: "Heel Beat", type: "combo", role: "air-medium-kick", variant: "light",
        air: true, startup: 4, active: 5, endlag: 9, hitstun: 18, reach: 158, juggle: 2,
        combosInto: ["Freestyle Air Chain", "Sky Mixer"],
        behavior: {
          motion: "none",
          // Stalls them vertically instead of spiking — this is what makes the
          // enormous air strings physically possible.
          knockback: { horizontal: 8, vertical: 208, hitstop: .014, carry: true }
        },
        visual: ricoVisual("arc", RY, RW, 54, "▽"),
        animation: ricoAnim("kick", "heel beat")
      },
      {
        name: "Shooting Tail", type: "combo", role: "air-heavy-kick", variant: "medium",
        air: true, startup: 6, active: 6, endlag: 11, hitstun: 22, reach: 224, juggle: 4,
        combosInto: ["Sky Mixer", "Tail Bounce"],
        behavior: {
          motion: "spin", hits: 3, hitInterval: .052,
          knockback: { horizontal: 138, vertical: 258, hitstop: .03, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 78, "⤴"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "shooting tail")
      },
      {
        name: "Wall Dance", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 5, active: 8, endlag: 12, hitstun: 24, reach: 232, juggle: 5,
        combosInto: ["Freestyle Air Chain", "Sky Mixer"],
        behavior: {
          motion: "fly-in", flySpeed: 780, flyHeight: 120, hits: 3, hitInterval: .05,
          knockback: { horizontal: 118, vertical: 238, wallBounce: true, hitstop: .034, carry: true }
        },
        visual: { ...ricoVisual("slashes", RC, RW, 82, "⌁"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("kick", "wall dance")
      },
      {
        name: "Tail Bounce", type: "combo", role: "air-special", variant: "medium",
        air: true, startup: 4, active: 6, endlag: 10, hitstun: 22, reach: 196, juggle: 4,
        combosInto: ["Freestyle Air Chain", "Sky Mixer"],
        behavior: {
          motion: "spin", hits: 2, hitInterval: .05,
          // She bounces up, they sag down — a free vertical reset mid-string.
          knockback: { horizontal: 16, vertical: 148, groundBounce: true, hitstop: .026, carry: true }
        },
        visual: { ...ricoVisual("burst", RY, RW, 70, "⇕"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "tail bounce")
      },
      {
        name: "Paw Dive", type: "combo", role: "air-heavy-kick", variant: "medium",
        air: true, startup: 4, active: 9, endlag: 14, hitstun: 24, reach: 208, juggle: 5,
        behavior: {
          motion: "dive-kick", speed: 425,
          knockback: { horizontal: 148, vertical: 168, groundBounce: true, hitstop: .05 }
        },
        visual: { ...ricoVisual("burst", RO, RW, 82, "▼"), script: AIR_RELAUNCH_SCRIPT },
        animation: ricoAnim("slam", "paw dive")
      },
      {
        name: "Encore Relaunch", type: "combo", role: "air-special", variant: "heavy",
        air: true, startup: 5, active: 12, endlag: 14, hitstun: 32, reach: 236, juggle: 12,
        combosInto: ["Freestyle Air Chain", "Sky Mixer"],
        behavior: {
          // Spikes them, dives after them, kicks them back up. Almost no damage —
          // this exists purely to turn a 50-hit combo into a 70-hit one.
          motion: "multi-uppercut", hits: 3, rise: 600,
          knockback: { horizontal: 42, vertical: 690, groundBounce: true, hitstop: .07 }
        },
        visual: { ...ricoVisual("burst", RP, RW, 96, "⇅"), script: AIR_RELAUNCH_SCRIPT },
        animation: ricoAnim("slam", "encore relaunch")
      }
    ],
    supers: [
      {
        name: "Hyper Beat Rush", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 30, endlag: 18, hitstun: 30, reach: 288,
        behavior: {
          motion: "rapid-jab", rapidHits: 8, hitInterval: .042,
          // Preserves juggle state: she can keep going after the super ends.
          knockback: { horizontal: 62, vertical: 328, hitstop: .05, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 118, "♬", null, "main_musicburst"), script: DANCE_CHAIN_SCRIPT },
        animation: ricoAnim("strike", "hyper beat rush")
      },
      {
        name: "Beat Drop", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 24, endlag: 18, hitstun: 32, reach: 262,
        behavior: {
          motion: "multi-uppercut", hits: 6, rise: 640,
          knockback: { horizontal: 88, vertical: 668, groundBounce: true, hitstop: .08 }
        },
        visual: { ...ricoVisual("burst", RO, RW, 116, "⇵", null, "main_stylized_explosion"), script: AIR_RELAUNCH_SCRIPT },
        animation: ricoAnim("slam", "beat drop")
      },
      {
        name: "Nonstop Beat", type: "combo", role: "super", variant: "heavy",
        startup: 5, active: 30, endlag: 16, hitstun: 32, reach: 296,
        behavior: {
          motion: "spin", hits: 8, hitInterval: .04,
          knockback: { horizontal: 96, vertical: 448, hitstop: .06, carry: true }
        },
        visual: { ...ricoVisual("slashes", RY, RW, 122, "✺", null, "main_rebound_spiral"), script: TAIL_SPIN_SCRIPT },
        animation: ricoAnim("spin", "nonstop beat")
      },
      {
        name: "High Tension", type: "combo", role: "super", variant: "heavy",
        startup: 6, active: 32, endlag: 22, hitstun: 34, reach: 332,
        behavior: {
          motion: "spin", hits: 8, hitInterval: .038,
          knockback: { horizontal: 388, vertical: 618, wallBounce: true, hitstop: .13 }
        },
        visual: { ...ricoVisual("burst", RY, "#fffdf0", 138, "★", null, "main_firework"), script: HIGH_TENSION_SCRIPT },
        animation: ricoAnim("spin", "high tension")
      }
    ]
  }
};
