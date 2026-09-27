/**
 * Draws the app icon once, in one place, and emits every size and format the
 * web needs from it.
 *
 *   node scripts/generate-icons.mjs
 *
 * Why a script instead of five hand-drawn files: the previous setup had a
 * favicon left over from a template and a manifest pointing at two PNGs that
 * were never created, so Android installed the app with a blank square. Five
 * separate files also drift — someone nudges the SVG and the PNGs still show
 * last month's mark. Here the geometry is declared once, below, and both the
 * vector and the raster output are generated from it.
 *
 * The mark is a mortarboard: a rhombus board with a tassel. It has to survive
 * being 16 pixels wide in a browser tab, so there is no fine detail, no thin
 * stroke and no text in it.
 *
 * No dependencies. The PNG writer is ~60 lines of zlib and CRC32, and the
 * rasteriser is a scanline fill with 4x4 supersampling, which is enough
 * anti-aliasing at these sizes and avoids pulling a canvas library into a
 * project that has no other use for one.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/* ── the mark ───────────────────────────────────────────────────────────────
   All geometry is in a 0..1 square, so it scales to any output size. The
   glyph deliberately sits inside the middle ~62% for the maskable icon, where
   Android may crop everything outside a centred circle.
*/
const BRAND_TOP = [0x2f, 0x74, 0xbd];
const BRAND_BOTTOM = [0x18, 0x4c, 0x88];
const INK = [0xff, 0xff, 0xff];

// Board: a wide, shallow rhombus. Shallow reads as "seen from slightly above",
// which is what stops it looking like a plain diamond.
const BOARD = [[0.50, 0.255], [0.955, 0.435], [0.50, 0.615], [0.045, 0.435]];

// The cap under the board. Narrowing towards the bottom keeps the silhouette
// from turning into a rectangle when the two shapes merge at small sizes.
const CAP = [[0.315, 0.525], [0.685, 0.525], [0.632, 0.775], [0.368, 0.775]];

// Tassel: hangs off the right corner. One straight run plus a weight at the
// end, because a curve would disappear below about 32px anyway.
const TASSEL = [[0.828, 0.455], [0.888, 0.478], [0.888, 0.735], [0.828, 0.735]];
const TASSEL_KNOT = { cx: 0.858, cy: 0.762, r: 0.062 };

// Knocked back out of the board in the background colour, so the board reads
// as a surface rather than a flat lozenge.
const BUTTON = { cx: 0.50, cy: 0.435, r: 0.052 };

const CORNER = 0.225; // rounded-square radius, as a fraction of the side

/* ── geometry helpers ─────────────────────────────────────────────────────── */

const insidePolygon = (pts, x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const insideCircle = ({ cx, cy, r }, x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Rounded square covering the whole 0..1 box. */
const insideRoundedSquare = (x, y, r) => {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-12;
};

const insideGlyph = (x, y) => {
  if (insideCircle(BUTTON, x, y)) return false;      // punched out of the board
  return insidePolygon(BOARD, x, y)
      || insidePolygon(CAP, x, y)
      || insidePolygon(TASSEL, x, y)
      || insideCircle(TASSEL_KNOT, x, y);
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* ── rasteriser ─────────────────────────────────────────────────────────────
   4x4 samples per pixel. Coverage is averaged per layer, so the glyph edge is
   composited over the background rather than over transparency, which is what
   keeps it from fringing dark on a light home screen.
*/
function render(size, { rounded, inset }) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 1 / (SS * size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) * scale;
          const y = (py * SS + sy + 0.5) * scale;
          if (rounded ? insideRoundedSquare(x, y, CORNER) : true) bg++;
          // `inset` shrinks the glyph towards the centre for the maskable
          // icon, whose outer ring Android is free to crop away.
          const gx = 0.5 + (x - 0.5) / inset;
          const gy = 0.5 + (y - 0.5) / inset;
          if (insideGlyph(gx, gy)) fg++;
        }
      }
      const total = SS * SS;
      const bgA = bg / total;
      const fgA = (fg / total) * bgA; // the glyph never spills past the plate

      const base = mix(BRAND_TOP, BRAND_BOTTOM, py / (size - 1));
      const colour = mix(base, INK, fgA === 0 ? 0 : fgA / Math.max(bgA, 1e-6));

      const o = (py * size + px) * 4;
      rgba[o] = colour[0];
      rgba[o + 1] = colour[1];
      rgba[o + 2] = colour[2];
      rgba[o + 3] = Math.round(bgA * 255);
    }
  }
  return rgba;
}

/* ── minimal PNG writer ─────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // truecolour with alpha
  // Every scanline gets filter 0. Filtering would shrink the file; at these
  // sizes it is not worth the code.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── SVG, from the same numbers ─────────────────────────────────────────── */

const pts = (poly) => poly.map(([x, y]) => `${(x * 64).toFixed(2)},${(y * 64).toFixed(2)}`).join(' ');

function svg() {
  const r = (CORNER * 64).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="UniHelper">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#${BRAND_TOP.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>
      <stop offset="1" stop-color="#${BRAND_BOTTOM.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>
    </linearGradient>
    <mask id="cut">
      <rect width="64" height="64" fill="#000"/>
      <polygon points="${pts(BOARD)}" fill="#fff"/>
      <polygon points="${pts(CAP)}" fill="#fff"/>
      <polygon points="${pts(TASSEL)}" fill="#fff"/>
      <circle cx="${(TASSEL_KNOT.cx * 64).toFixed(2)}" cy="${(TASSEL_KNOT.cy * 64).toFixed(2)}" r="${(TASSEL_KNOT.r * 64).toFixed(2)}" fill="#fff"/>
      <circle cx="${(BUTTON.cx * 64).toFixed(2)}" cy="${(BUTTON.cy * 64).toFixed(2)}" r="${(BUTTON.r * 64).toFixed(2)}" fill="#000"/>
    </mask>
  </defs>
  <rect width="64" height="64" rx="${r}" ry="${r}" fill="url(#plate)"/>
  <rect width="64" height="64" fill="#fff" mask="url(#cut)"/>
</svg>
`;
}

/* ── emit ───────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });

const FILES = [
  // name,                    size, rounded, glyph inset
  ['favicon-32.png',            32, true,  0.94],
  ['apple-touch-icon.png',     180, false, 0.80], // iOS rounds it itself, and
                                                  // a transparent corner there
                                                  // renders as black
  ['icon-192.png',             192, true,  0.94],
  ['icon-512.png',             512, true,  0.94],
  ['icon-512-maskable.png',    512, false, 0.62], // safe zone is the middle 80%
];

for (const [name, size, rounded, inset] of FILES) {
  writeFileSync(join(OUT, name), png(size, render(size, { rounded, inset })));
  console.log(`wrote public/${name} (${size}x${size})`);
}

writeFileSync(join(OUT, 'favicon.svg'), svg());
console.log('wrote public/favicon.svg');
