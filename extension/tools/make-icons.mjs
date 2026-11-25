// Generates the shield icons (PNG) with no dependencies.  node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../src/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// shape tests in unit coordinates (0..1)
const inRoundRect = (x, y, r = 0.22) => {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inShield = (x, y) => {
  // flat-ish top, sides, curving to a point at the bottom
  if (y < 0.2 || y > 0.84) return false;
  const half = y < 0.5 ? 0.3 : 0.3 * Math.sqrt(Math.max(0, 1 - ((y - 0.5) / 0.34) ** 2));
  const dip = 0.035 * Math.cos(((x - 0.5) / 0.3) * Math.PI); // gentle notch on top edge
  return Math.abs(x - 0.5) <= half && y >= 0.2 + dip + 0.035;
};
const inCheck = (x, y) => {
  const seg = (ax, ay, bx, by, w) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= w * w;
  };
  return seg(0.38, 0.5, 0.47, 0.6, 0.045) || seg(0.47, 0.6, 0.64, 0.4, 0.045);
};

function render(size) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
          if (!inRoundRect(x, y)) continue;
          let c;
          if (inCheck(x, y) && inShield(x, y)) c = [22, 163, 74];
          else if (inShield(x, y)) c = [255, 255, 255];
          else c = [15 + 20 * y, 23 + 60 * (1 - y), 42 + 40 * (1 - y)]; // dark navy gradient
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      const n = SS * SS, i = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255 || 1;
      raw[i] = r / cov; raw[i + 1] = g / cov; raw[i + 2] = b / cov; raw[i + 3] = a / n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(`${outDir}icon${s}.png`, render(s));
console.log("icons written to", outDir);
