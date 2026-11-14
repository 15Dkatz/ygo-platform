// Resolving-card effects drawn on two canvases around the card: BACK (behind the card's face) and FRONT
// (accents over it; never most of the card). Each style is a small particle system with depth: things
// orbit or drift between the two layers, so the card sits inside the effect rather than under a sticker.
//
// Coordinates: origin at the card's centre; the card is (cw x ch); the canvases are SCALE times bigger.

export const FX_SCALE = 2.6;
export type FxStyle = "frost" | "powerup" | "holy" | "void" | "electric" | "circle" | "sparkle" | "fireworks" | "rings" | "aura";
export const CANVAS_STYLES = new Set<string>(["frost", "powerup", "holy", "void", "electric", "circle", "sparkle", "fireworks", "rings", "aura"]);

type RGB = [number, number, number];
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A CSS colour (hex or rgb()) -> RGB. */
export function parseColor(c: string, fallback: RGB = [120, 160, 255]): RGB {
  const s = c.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
  m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  return fallback;
}

interface Ctx { back: CanvasRenderingContext2D; front: CanvasRenderingContext2D; W: number; H: number; cw: number; ch: number; c: RGB; t: number; dt: number }
interface System { step(x: Ctx): void }

/** A point on the card's outline (t in 0..1, clockwise from the top-left) and the outward normal. */
function perimeter(t: number, hw: number, hh: number): { x: number; y: number; nx: number; ny: number } {
  const p = 2 * (hw + hh) * 2, d = ((t % 1) + 1) % 1 * p, w2 = hw * 2, h2 = hh * 2;
  if (d < w2) return { x: -hw + d, y: -hh, nx: 0, ny: -1 };
  if (d < w2 + h2) return { x: hw, y: -hh + (d - w2), nx: 1, ny: 0 };
  if (d < 2 * w2 + h2) return { x: hw - (d - w2 - h2), y: hh, nx: 0, ny: 1 };
  return { x: -hw, y: hh - (d - 2 * w2 - h2), nx: -1, ny: 0 };
}

function glowRect(g: CanvasRenderingContext2D, hw: number, hh: number, c: RGB, a: number, blur: number, pad = 0) {
  g.save();
  g.shadowColor = rgba(c, a); g.shadowBlur = blur;
  g.strokeStyle = rgba(mix(c, WHITE, 0.4), a); g.lineWidth = 2.5;
  const r = Math.min(hw, hh) * 0.12;
  g.beginPath(); g.roundRect(-hw - pad, -hh - pad, (hw + pad) * 2, (hh + pad) * 2, r); g.stroke();
  g.restore();
}

/** A jagged bolt from (x1,y1) to (x2,y2), midpoint-displaced, with a branch or two. */
function bolt(x1: number, y1: number, x2: number, y2: number, jag: number, depth = 5): [number, number][] {
  let pts: [number, number][] = [[x1, y1], [x2, y2]];
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
      const off = rnd(-1, 1) * jag * len * 0.35;
      next.push([(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off], [bx, by]);
    }
    pts = next;
  }
  return pts;
}
function drawBolt(g: CanvasRenderingContext2D, pts: [number, number][], c: RGB, a: number, w: number) {
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineJoin = "round"; g.lineCap = "round";
  for (const [lw, col, al, blur] of [[w * 4, c, a * 0.35, 18], [w * 1.6, mix(c, WHITE, 0.5), a * 0.8, 8], [w * 0.7, WHITE, a, 0]] as const) {
    g.shadowColor = rgba(c, al); g.shadowBlur = blur; g.strokeStyle = rgba(col as RGB, al); g.lineWidth = lw;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// Frost: faceted crystals growing from the edges in waves, drifting mist, snow at three depths, glints

function frost(): System {
  interface Shard { t: number; len: number; wid: number; tilt: number; delay: number; front: boolean }
  const shards: Shard[] = [];
  const N = 18;
  for (let i = 0; i < N; i++) shards.push({ t: i / N + rnd(-0.02, 0.02), len: rnd(0.22, 0.55), wid: rnd(0.16, 0.26), tilt: rnd(-0.45, 0.45), delay: rnd(0, 1.2), front: i % 5 === 0 });
  interface Flake { x: number; y: number; z: number; vy: number; ph: number; s: number }
  const flakes: Flake[] = [];
  const mist = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, r: rnd(0.55, 0.85), s: rnd(0.5, 0.9), sp: rnd(0.05, 0.12) }));
  const CYCLE = 3.6;
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t } = x, hw = cw / 2, hh = ch / 2;
      const ice = mix(c, [200, 245, 255], 0.5);
      // cold glow + mist
      B.save(); B.globalCompositeOperation = "lighter";
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
      const gr = B.createRadialGradient(0, 0, Math.min(hw, hh) * 0.6, 0, 0, Math.min(x.W, x.H) * 0.49);
      gr.addColorStop(0, rgba(ice, 0.45 * pulse)); gr.addColorStop(0.5, rgba(c, 0.18 * pulse)); gr.addColorStop(1, rgba(c, 0));
      B.fillStyle = gr; B.fillRect(-x.W / 2, -x.H / 2, x.W, x.H);
      for (const m of mist) {
        const a = m.a + t * m.sp, rr = Math.max(hw, hh) * (1.1 + m.r * 0.5);
        const mx = Math.cos(a) * rr, my = Math.sin(a) * rr * 0.8, size = Math.max(hw, hh) * m.s;
        const mg = B.createRadialGradient(mx, my, 0, mx, my, size);
        mg.addColorStop(0, rgba(WHITE, 0.16)); mg.addColorStop(1, rgba(ice, 0));
        B.fillStyle = mg; B.beginPath(); B.arc(mx, my, size, 0, Math.PI * 2); B.fill();
      }
      B.restore();
      // crystals: grow in a wave, hold, crack away, regrow
      for (const s of shards) {
        const local = ((t - s.delay) % CYCLE + CYCLE) % CYCLE;
        const grow = ease(local / 0.7), fade = local > CYCLE - 0.5 ? 1 - (local - (CYCLE - 0.5)) / 0.5 : 1;
        if (grow <= 0.01 || fade <= 0) continue;
        const p = perimeter(s.t, hw, hh);
        const ang = Math.atan2(p.ny, p.nx) + s.tilt;
        const L = Math.min(cw, ch) * s.len * grow * (s.front ? 0.55 : 1), Wd = L * s.wid;
        const g = s.front ? F : B;
        g.save();
        g.translate(p.x - p.nx * 4, p.y - p.ny * 4); g.rotate(ang);
        g.globalAlpha = fade;
        // two faces + a gleaming ridge: a hexagonal prism seen from the side
        const tip = L, mid = L * 0.72;
        const light = g.createLinearGradient(0, -Wd, mid, 0); light.addColorStop(0, rgba(WHITE, 0.95)); light.addColorStop(1, rgba(ice, 0.75));
        const dark = g.createLinearGradient(0, Wd, mid, 0); dark.addColorStop(0, rgba(mix(c, [10, 40, 90], 0.55), 0.92)); dark.addColorStop(1, rgba(c, 0.8));
        g.shadowColor = rgba(ice, 0.9); g.shadowBlur = 12;
        g.fillStyle = light; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -Wd); g.lineTo(mid, -Wd * 0.6); g.lineTo(tip, 0); g.closePath(); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = dark; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, Wd); g.lineTo(mid, Wd * 0.6); g.lineTo(tip, 0); g.closePath(); g.fill();
        // ridge and a highlight travelling along it
        g.strokeStyle = rgba(WHITE, 0.95); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(tip, 0); g.stroke();
        const hl = ((t * 0.9 + s.delay) % 1.4) / 1.4;
        if (hl < 1) {
          const hx = hl * tip;
          const hg = g.createRadialGradient(hx, 0, 0, hx, 0, Wd * 1.2);
          hg.addColorStop(0, rgba(WHITE, 0.9)); hg.addColorStop(1, rgba(WHITE, 0));
          g.globalCompositeOperation = "lighter"; g.fillStyle = hg; g.beginPath(); g.arc(hx, 0, Wd * 1.2, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
      // snow at three depths: far (behind, small, slow), mid, near (in front, big, quick, with glints)
      if (flakes.length < 70 && Math.random() < 0.9) {
        const z = Math.random();
        flakes.push({ x: rnd(-hw * 2.2, hw * 2.2), y: -hh * 2.4, z, vy: (14 + z * 40), ph: rnd(0, 6), s: 0.8 + z * 2.4 });
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.y += f.vy * x.dt; f.x += Math.sin(t * 1.3 + f.ph) * 10 * x.dt;
        if (f.y > hh * 2.4) { flakes.splice(i, 1); continue; }
        const g = f.z > 0.72 ? F : B;
        g.save(); g.globalCompositeOperation = "lighter";
        g.fillStyle = rgba(WHITE, 0.35 + f.z * 0.6); g.shadowColor = rgba(ice, 1); g.shadowBlur = 6 + f.z * 6;
        g.beginPath(); g.arc(f.x, f.y, f.s, 0, Math.PI * 2); g.fill();
        // glint: a four-point star now and then
        const tw = Math.sin(t * 6 + f.ph * 3);
        if (f.z > 0.55 && tw > 0.85) {
          const k = (tw - 0.85) / 0.15 * f.s * 4;
          g.strokeStyle = rgba(WHITE, 0.9); g.lineWidth = 1;
          g.beginPath(); g.moveTo(f.x - k, f.y); g.lineTo(f.x + k, f.y); g.moveTo(f.x, f.y - k); g.lineTo(f.x, f.y + k); g.stroke();
        }
        g.restore();
      }
      glowRect(B, hw, hh, ice, 0.9 * pulse, 22, 2);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Power-up: flames rising off the card's outline, a card-shaped core glow, branching lightning, sparks

function powerup(): System {
  interface Fl { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number }
  const flames: Fl[] = [], sparks: Fl[] = [];
  let boltT = 0, bolts: { pts: [number, number][]; life: number }[] = [];
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2;
      const hot = mix(c, WHITE, 0.55);
      for (let i = 0; i < 20; i++) {
        const p = perimeter(Math.random(), hw, hh);
        const up = p.ny < 0 ? 1.8 : 1;
        flames.push({ x: p.x + p.nx * 4, y: p.y + p.ny * 4, vx: p.nx * rnd(14, 40) + rnd(-10, 10), vy: -rnd(80, 190) * up + p.ny * 20, life: 0, max: rnd(0.5, 1.05), s: rnd(10, 22) });
      }
      B.save(); B.globalCompositeOperation = "lighter";
      for (let i = flames.length - 1; i >= 0; i--) {
        const f = flames[i]; f.life += dt;
        if (f.life > f.max) { flames.splice(i, 1); continue; }
        f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.vy -= 40 * dt;
        const k = f.life / f.max, s = f.s * (1 - k * 0.7);
        const g = B.createRadialGradient(f.x, f.y, 0, f.x, f.y, s);
        g.addColorStop(0, rgba(k < 0.25 ? WHITE : hot, (1 - k) * 0.7)); g.addColorStop(0.45, rgba(c, (1 - k) * 0.45)); g.addColorStop(1, rgba(c, 0));
        B.fillStyle = g; B.beginPath(); B.arc(f.x, f.y, s, 0, Math.PI * 2); B.fill();
      }
      B.restore();
      glowRect(B, hw, hh, c, 1, 28, 3);
      glowRect(B, hw, hh, WHITE, 0.8, 10, 1);
      // lightning
      boltT -= dt;
      if (boltT <= 0) {
        boltT = rnd(0.25, 0.7);
        const side = Math.random() < 0.5 ? -1 : 1;
        const sx = side * hw * rnd(1.0, 1.15), sy = rnd(-hh, hh);
        bolts.push({ pts: bolt(sx, sy, side * hw * rnd(1.5, 2.1), sy + rnd(-hh, hh) * 0.8, 1.1), life: 0.16 });
      }
      bolts = bolts.filter((b) => (b.life -= dt) > 0);
      for (const b of bolts) drawBolt(F, b.pts, [140, 220, 255], b.life / 0.16, 1.4);
      // sparks shooting up
      if (Math.random() < 0.6) { const p = perimeter(Math.random(), hw, hh); sparks.push({ x: p.x, y: p.y, vx: rnd(-40, 40), vy: -rnd(140, 260), life: 0, max: rnd(0.4, 0.8), s: rnd(1, 2.2) }); }
      F.save(); F.globalCompositeOperation = "lighter"; F.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life += dt;
        if (s.life > s.max) { sparks.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt;
        F.strokeStyle = rgba(hot, 1 - s.life / s.max); F.lineWidth = s.s; F.shadowColor = rgba(c, 1); F.shadowBlur = 8;
        F.beginPath(); F.moveTo(s.x, s.y); F.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04); F.stroke();
      }
      F.restore();
      void t;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Holy light: turning god-rays, a pillar from above, a halo, motes rising

function holy(): System {
  const motes = Array.from({ length: 40 }, () => ({ x: rnd(-1.4, 1.4), y: rnd(-2, 1.2), z: Math.random(), sp: rnd(0.15, 0.4), ph: rnd(0, 6) }));
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t } = x, hw = cw / 2, hh = ch / 2;
      const gold = mix(c, [255, 240, 200], 0.4);
      B.save(); B.globalCompositeOperation = "lighter";
      // god-rays from just above the card
      const cy = -hh * 0.4, R = Math.max(hw, hh) * 2.3;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.25, w = 0.07 + 0.04 * Math.sin(t * 1.5 + i);
        const gr = B.createRadialGradient(0, cy, 0, 0, cy, R);
        gr.addColorStop(0, rgba(WHITE, 0.35)); gr.addColorStop(0.4, rgba(gold, 0.16)); gr.addColorStop(1, rgba(gold, 0));
        B.fillStyle = gr; B.beginPath(); B.moveTo(0, cy); B.arc(0, cy, R, a - w, a + w); B.closePath(); B.fill();
      }
      // pillar
      const pg = B.createLinearGradient(0, -x.H / 2, 0, hh);
      pg.addColorStop(0, rgba(gold, 0)); pg.addColorStop(0.5, rgba(WHITE, 0.4 + 0.15 * Math.sin(t * 2))); pg.addColorStop(1, rgba(gold, 0.1));
      B.fillStyle = pg; B.fillRect(-hw * 0.9, -x.H / 2, hw * 1.8, x.H / 2 + hh);
      B.restore();
      glowRect(B, hw, hh, gold, 0.95, 26, 2);
      // halo above the card (in front: it doesn't cover the face)
      F.save(); F.globalCompositeOperation = "lighter";
      F.translate(0, -hh - ch * 0.16 + Math.sin(t * 2) * 3);
      F.shadowColor = rgba(gold, 1); F.shadowBlur = 16; F.strokeStyle = rgba(mix(gold, WHITE, 0.5), 0.95); F.lineWidth = 3;
      F.beginPath(); F.ellipse(0, 0, hw * 0.75, hh * 0.13, 0, 0, Math.PI * 2); F.stroke();
      F.restore();
      // motes rising, near ones in front
      for (const m of motes) {
        m.y -= m.sp * x.dt * (0.5 + m.z);
        if (m.y < -2.2) { m.y = 1.3; m.x = rnd(-1.4, 1.4); }
        const g = m.z > 0.7 ? F : B, px = m.x * hw + Math.sin(t + m.ph) * 6, py = m.y * hh;
        g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = rgba(WHITE, 0.4 + m.z * 0.5); g.shadowColor = rgba(gold, 1); g.shadowBlur = 8;
        g.beginPath(); g.arc(px, py, 0.8 + m.z * 2, 0, Math.PI * 2); g.fill(); g.restore();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Dark vortex: particles spiralling inward along arms, a dark core, an accretion ring

function vortex(): System {
  const ps = Array.from({ length: 460 }, () => ({ r: rnd(0.3, 1), a: rnd(0, Math.PI * 2), arm: Math.floor(rnd(0, 4)), z: Math.random() }));
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2, R = Math.max(hw, hh) * 2.2;
      const deep = mix(c, [10, 0, 25], 0.6), bright = mix(c, WHITE, 0.35);
      B.save();
      const core = B.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
      core.addColorStop(0, rgba([8, 0, 18], 0.95)); core.addColorStop(0.4, rgba(deep, 0.6)); core.addColorStop(1, rgba(deep, 0));
      B.fillStyle = core; B.beginPath(); B.arc(0, 0, R * 0.8, 0, Math.PI * 2); B.fill();
      B.globalCompositeOperation = "lighter";
      const neb = B.createRadialGradient(0, 0, R * 0.2, 0, 0, Math.min(x.W, x.H) * 0.49);
      neb.addColorStop(0, rgba(c, 0)); neb.addColorStop(0.45, rgba(c, 0.32)); neb.addColorStop(1, rgba(c, 0));
      B.fillStyle = neb; B.fillRect(-x.W / 2, -x.H / 2, x.W, x.H);
      for (const p of ps) {
        p.r -= dt * 0.12 * (1.4 - p.r); p.a += dt * (1.6 / Math.max(0.2, p.r));
        if (p.r < 0.18) { p.r = 1; p.a = rnd(0, Math.PI * 2); }
        const a = p.a + p.arm * (Math.PI / 2) + p.r * 3;
        const px = Math.cos(a) * p.r * R, py = Math.sin(a) * p.r * R * 0.62;
        const front = Math.sin(a) > 0.35 && p.z > 0.6;   // the near side of the swirl passes in front
        const g = front ? F : B;
        if (front) { g.save(); g.globalCompositeOperation = "lighter"; }
        g.fillStyle = rgba(p.r < 0.4 ? WHITE : bright, 0.45 + (1 - p.r) * 0.55);
        g.beginPath(); g.arc(px, py, 1.1 + (1 - p.r) * 2.8, 0, Math.PI * 2); g.fill();
        if (front) g.restore();
      }
      // accretion ring
      B.strokeStyle = rgba(bright, 0.85); B.lineWidth = 3.5; B.shadowColor = rgba(c, 1); B.shadowBlur = 22;
      B.beginPath(); B.ellipse(0, 0, R * 0.62, R * 0.62 * 0.62, t * 0.3, 0, Math.PI * 2); B.stroke();
      B.restore();
      glowRect(B, hw, hh, bright, 0.9, 24, 2);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Electric: arcs crawling around the outline, some jumping out

function electric(): System {
  let arcs: { pts: [number, number][]; life: number; max: number }[] = [];
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2;
      B.save(); B.globalCompositeOperation = "lighter";
      const gr = B.createRadialGradient(0, 0, Math.min(hw, hh), 0, 0, Math.min(x.W, x.H) * 0.49);
      gr.addColorStop(0, rgba(c, 0.25)); gr.addColorStop(1, rgba(c, 0));
      B.fillStyle = gr; B.fillRect(-x.W / 2, -x.H / 2, x.W, x.H); B.restore();
      glowRect(B, hw, hh, c, 0.9, 20, 3);
      // crawlers: a few heads racing around the outline, each trailing a jagged arc
      for (let k = 0; k < 3; k++) {
        const head = (t * (0.35 + k * 0.12) + k / 3) % 1, tail = head - 0.08;
        const a = perimeter(tail, hw + 3, hh + 3), b = perimeter(head, hw + 3, hh + 3);
        drawBolt(F, bolt(a.x, a.y, b.x, b.y, 0.6, 4), c, 0.9, 1.2);
      }
      if (Math.random() < dt * 5) {
        const p = perimeter(Math.random(), hw, hh), L = Math.min(cw, ch) * rnd(0.3, 0.6);
        arcs.push({ pts: bolt(p.x, p.y, p.x + p.nx * L + rnd(-L, L) * 0.4, p.y + p.ny * L + rnd(-L, L) * 0.4, 1.1), life: 0.12, max: 0.12 });
      }
      arcs = arcs.filter((a) => (a.life -= dt) > 0);
      for (const a of arcs) drawBolt(F, a.pts, c, a.life / a.max, 1.1);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Summoning circle: rotating rings of runes and a counter-turning star beneath the card, light rising

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
function circle(): System {
  const rising = Array.from({ length: 30 }, () => ({ a: rnd(0, Math.PI * 2), r: rnd(0.4, 1), y: rnd(0, 1), sp: rnd(0.3, 0.7) }));
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2, R = Math.max(hw, hh) * 1.75;
      const bright = mix(c, WHITE, 0.4);
      B.save(); B.globalCompositeOperation = "lighter"; B.shadowColor = rgba(c, 1); B.shadowBlur = 14;
      B.strokeStyle = rgba(bright, 0.9);
      for (const [rr, lw] of [[1, 2.5], [0.93, 1.2], [0.7, 2], [0.64, 1]] as const) { B.lineWidth = lw; B.beginPath(); B.arc(0, 0, R * rr, 0, Math.PI * 2); B.stroke(); }
      // runes in the outer band, turning
      B.fillStyle = rgba(WHITE, 0.95); B.font = `${Math.max(9, R * 0.09) | 0}px serif`; B.textAlign = "center"; B.textBaseline = "middle";
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.35;
        B.save(); B.translate(Math.cos(a) * R * 0.965, Math.sin(a) * R * 0.965); B.rotate(a + Math.PI / 2);
        B.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i); B.fillText(RUNES[i % RUNES.length], 0, 0); B.restore();
      }
      // a star, turning the other way
      B.save(); B.rotate(-t * 0.5); B.lineWidth = 1.6; B.beginPath();
      for (let i = 0; i <= 5; i++) { const a = (i * 2 * (Math.PI * 2)) / 5 - Math.PI / 2; const px = Math.cos(a) * R * 0.64, py = Math.sin(a) * R * 0.64; i ? B.lineTo(px, py) : B.moveTo(px, py); }
      B.stroke(); B.restore();
      B.restore();
      glowRect(B, hw, hh, bright, 0.9, 20, 2);
      // columns of light rising from the circle
      F.save(); F.globalCompositeOperation = "lighter";
      for (const p of rising) {
        p.y += dt * p.sp; if (p.y > 1) { p.y = 0; p.a = rnd(0, Math.PI * 2); }
        const px = Math.cos(p.a + t * 0.35) * R * p.r, py = Math.sin(p.a + t * 0.35) * R * p.r - p.y * hh * 1.6;
        F.fillStyle = rgba(bright, (1 - p.y) * 0.8); F.shadowColor = rgba(c, 1); F.shadowBlur = 8;
        F.fillRect(px - 1, py - 6, 2, 12);
      }
      F.restore();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Sparkles: glitter orbiting the card in 3D (behind on the far side, in front on the near side)

function sparkle(): System {
  const ps = Array.from({ length: 70 }, () => ({ a: rnd(0, Math.PI * 2), r: rnd(1.05, 1.6), h: rnd(-1.1, 1.1), sp: rnd(0.6, 1.4), tilt: rnd(-0.4, 0.4), ph: rnd(0, 6) }));
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t } = x, hw = cw / 2, hh = ch / 2;
      glowRect(B, hw, hh, mix(c, WHITE, 0.3), 0.8, 18, 2);
      for (const p of ps) {
        const a = p.a + t * p.sp, z = Math.sin(a);
        const px = Math.cos(a) * hw * p.r, py = p.h * hh + z * p.tilt * hh * 0.5;
        const g = z > 0 ? F : B, k = 0.55 + 0.45 * z, tw = 0.5 + 0.5 * Math.sin(t * 7 + p.ph);
        g.save(); g.globalCompositeOperation = "lighter"; g.translate(px, py);
        const s = (1.2 + k * 2.6) * (0.6 + tw * 0.6);
        g.fillStyle = rgba(WHITE, 0.4 + 0.6 * k); g.shadowColor = rgba(c, 1); g.shadowBlur = 10;
        g.beginPath(); g.moveTo(0, -s * 2.4); g.lineTo(s * 0.5, -s * 0.5); g.lineTo(s * 2.4, 0); g.lineTo(s * 0.5, s * 0.5); g.lineTo(0, s * 2.4); g.lineTo(-s * 0.5, s * 0.5); g.lineTo(-s * 2.4, 0); g.lineTo(-s * 0.5, -s * 0.5); g.closePath(); g.fill();
        g.restore();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Fireworks: rockets from the card bursting into falling, trailing embers

function fireworks(): System {
  interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; c: RGB; rocket?: boolean; tx?: number; ty?: number }
  const ps: P[] = [];
  let next = 0;
  const palette: RGB[] = [[255, 90, 120], [255, 200, 80], [120, 220, 255], [160, 255, 160], [200, 140, 255]];
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, dt } = x, hw = cw / 2, hh = ch / 2;
      glowRect(B, hw, hh, c, 0.8, 18, 2);
      next -= dt;
      if (next <= 0) {
        next = rnd(0.22, 0.45);
        const tx = rnd(-hw * 1.8, hw * 1.8), ty = rnd(-hh * 2.2, -hh * 0.6);
        ps.push({ x: rnd(-hw * 0.5, hw * 0.5), y: -hh, vx: 0, vy: 0, life: 0, max: 0.45, c: Math.random() < 0.5 ? c : palette[(Math.random() * palette.length) | 0], rocket: true, tx, ty });
      }
      F.save(); F.globalCompositeOperation = "lighter"; F.lineCap = "round";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.life += dt;
        if (p.rocket) {
          const k = ease(p.life / p.max), x0 = p.x, y0 = p.y;
          const nx = x0 + (p.tx! - x0) * k * 0.35, ny = y0 + (p.ty! - y0) * k * 0.35;
          F.strokeStyle = rgba(WHITE, 0.9); F.lineWidth = 2; F.shadowColor = rgba(p.c, 1); F.shadowBlur = 10;
          F.beginPath(); F.moveTo(x0, y0); F.lineTo(nx, ny); F.stroke(); p.x = nx; p.y = ny;
          if (p.life >= p.max) {
            ps.splice(i, 1);
            const n = 72;
            for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2 + rnd(-0.05, 0.05), sp = rnd(110, 220); ps.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.9, 1.5), c: p.c }); }
          }
          continue;
        }
        if (p.life > p.max) { ps.splice(i, 1); continue; }
        p.vy += 90 * dt; p.vx *= 0.985; p.vy *= 0.985;
        const ox = p.x, oy = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        F.strokeStyle = rgba(k > 0.7 ? WHITE : p.c, k); F.lineWidth = 2.4; F.shadowColor = rgba(p.c, k); F.shadowBlur = 10;
        F.beginPath(); F.moveTo(ox - p.vx * 0.03, oy - p.vy * 0.03); F.lineTo(p.x, p.y); F.stroke();
      }
      F.restore();
      void B;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Shockwave rings: card-shaped shock rings expanding out, turning rays behind, debris flung on each pulse

function rings(): System {
  const waves: number[] = [];
  let next = 0;
  interface D { x: number; y: number; vx: number; vy: number; life: number; max: number }
  const debris: D[] = [];
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2;
      const bright = mix(c, WHITE, 0.4);
      // rays
      B.save(); B.globalCompositeOperation = "lighter";
      const R = Math.min(x.W, x.H) * 0.49;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + t * 0.4, w = 0.05;
        const gr = B.createRadialGradient(0, 0, Math.min(hw, hh) * 0.6, 0, 0, R);
        gr.addColorStop(0, rgba(c, 0.32)); gr.addColorStop(1, rgba(c, 0));
        B.fillStyle = gr; B.beginPath(); B.moveTo(0, 0); B.arc(0, 0, R, a - w, a + w); B.closePath(); B.fill();
      }
      B.restore();
      // a new wave every 0.55 s, with a burst of debris
      next -= dt;
      if (next <= 0) {
        next = 0.55; waves.push(0);
        for (let i = 0; i < 14; i++) { const p = perimeter(Math.random(), hw, hh), sp = rnd(90, 180); debris.push({ x: p.x, y: p.y, vx: p.nx * sp + rnd(-30, 30), vy: p.ny * sp + rnd(-30, 30), life: 0, max: rnd(0.4, 0.7) }); }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i] += dt / 1.1;
        const k = waves[i];
        if (k >= 1) { waves.splice(i, 1); continue; }
        const pad = ease(k) * Math.min(hw, hh) * 1.1, a = 1 - k;
        for (const [g, lw, al] of [[B, 6, a * 0.5], [F, 2.2, a]] as const) {
          g.save(); g.globalCompositeOperation = "lighter"; g.shadowColor = rgba(c, al); g.shadowBlur = 16;
          g.strokeStyle = rgba(g === F ? bright : c, al); g.lineWidth = lw * (1 - k * 0.6);
          g.beginPath(); g.roundRect(-hw - pad, -hh - pad, (hw + pad) * 2, (hh + pad) * 2, 8 + pad * 0.3); g.stroke(); g.restore();
        }
      }
      glowRect(B, hw, hh, bright, 0.95, 20, 2);
      F.save(); F.globalCompositeOperation = "lighter"; F.lineCap = "round";
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.life += dt;
        if (d.life > d.max) { debris.splice(i, 1); continue; }
        d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.94; d.vy *= 0.94;
        F.strokeStyle = rgba(bright, 1 - d.life / d.max); F.lineWidth = 1.6;
        F.beginPath(); F.moveTo(d.x, d.y); F.lineTo(d.x - d.vx * 0.05, d.y - d.vy * 0.05); F.stroke();
      }
      F.restore();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Flame aura: a blaze rising from below the card, embers, heat shimmer

function flameAura(): System {
  interface Fl { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number }
  const fl: Fl[] = [], embers: Fl[] = [];
  const fire: RGB = [255, 120, 40], core: RGB = [255, 230, 150];
  return {
    step(x) {
      const { back: B, front: F, cw, ch, c, t, dt } = x, hw = cw / 2, hh = ch / 2;
      const tint = mix(fire, c, 0.35);
      // base of the fire: under and around the bottom half of the card, licking upward
      for (let i = 0; i < 22; i++) {
        const side = Math.random();
        const px = side < 0.5 ? rnd(-hw * 1.15, hw * 1.15) : (Math.random() < 0.5 ? -1 : 1) * hw * rnd(0.95, 1.15);
        const py = side < 0.5 ? hh * rnd(0.6, 1.05) : rnd(-hh * 0.2, hh);
        fl.push({ x: px, y: py, vx: rnd(-12, 12), vy: -rnd(70, 170), life: 0, max: rnd(0.5, 1.0), s: rnd(10, 22) });
      }
      B.save(); B.globalCompositeOperation = "lighter";
      for (let i = fl.length - 1; i >= 0; i--) {
        const f = fl[i]; f.life += dt;
        if (f.life > f.max) { fl.splice(i, 1); continue; }
        f.x += (f.vx + Math.sin(t * 6 + f.y * 0.05) * 18) * dt; f.y += f.vy * dt;
        const k = f.life / f.max, s = f.s * (1 - k * 0.75);
        const g = B.createRadialGradient(f.x, f.y, 0, f.x, f.y, s);
        g.addColorStop(0, rgba(k < 0.3 ? core : tint, (1 - k) * 0.7)); g.addColorStop(0.55, rgba(mix(tint, [180, 30, 10], k), (1 - k) * 0.4)); g.addColorStop(1, rgba(tint, 0));
        B.fillStyle = g; B.beginPath(); B.arc(f.x, f.y, s, 0, Math.PI * 2); B.fill();
      }
      B.restore();
      glowRect(B, hw, hh, tint, 0.9, 24, 2);
      // embers rising in front
      if (Math.random() < 0.7) embers.push({ x: rnd(-hw * 1.2, hw * 1.2), y: hh * rnd(0.3, 1), vx: rnd(-20, 20), vy: -rnd(60, 130), life: 0, max: rnd(0.8, 1.6), s: rnd(1, 2.2) });
      F.save(); F.globalCompositeOperation = "lighter";
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.life += dt;
        if (e.life > e.max) { embers.splice(i, 1); continue; }
        e.x += (e.vx + Math.sin(t * 4 + i) * 20) * dt; e.y += e.vy * dt;
        F.fillStyle = rgba(core, 1 - e.life / e.max); F.shadowColor = rgba(tint, 1); F.shadowBlur = 8;
        F.beginPath(); F.arc(e.x, e.y, e.s, 0, Math.PI * 2); F.fill();
      }
      F.restore();
    },
  };
}

const MAKERS: Record<FxStyle, () => System> = { frost, powerup, holy, void: vortex, electric, circle, sparkle, fireworks, rings, aura: flameAura };

/** Run a style on two canvases (same size, centred on the card). Returns a stop function. */
export function runResolveFx(back: HTMLCanvasElement, front: HTMLCanvasElement, style: FxStyle, color: () => RGB, cardSize: () => { w: number; h: number }, still = false): () => void {
  const sys = MAKERS[style]();
  let raf = 0, last = performance.now(), t = 0, stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // nothing to draw while the page is hidden (another tab, minimised): wait for it to come back
    if (document.hidden) { raf = requestAnimationFrame(frame); return; }
    t += dt;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = back.clientWidth, H = back.clientHeight;
    if (W && H) {
      for (const cv of [back, front]) {
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      }
      const b = back.getContext("2d")!, f = front.getContext("2d")!;
      for (const g of [b, f]) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.translate(W / 2, H / 2); }
      const { w, h } = cardSize();
      sys.step({ back: b, front: f, W, H, cw: w, ch: h, c: color(), t, dt });
    }
    if (!still) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
