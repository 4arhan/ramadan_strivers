#!/usr/bin/env node
/* =====================================================================================================
   build-badge.js — writes icons/badge-96.png, the monochrome notification badge (sw.js showNotification
   `badge`). Android draws a badge as an alpha mask in the status bar, so a full-colour icon becomes a solid
   white square: the badge is the app icon's crescent in white on a transparent background.

   Usage:  node scripts/build-badge.js            (no dependencies: rasterised here, PNG written with zlib)

   The crescent is the one in the app icon (icons/icon.svg): a circle of radius 150 minus a circle of radius
   128 whose centre is 70 away at -42 degrees (towards the upper right). It is fitted into the 80 px live area
   of the 96 px canvas (Material small-icon keyline: 8 px padding), its bounding box centred, with 16 x 16
   supersampling for smooth edges. (The app icon centres it optically, nearer its centroid; at badge size there is
   no room for that without touching the edge of the canvas.)
   ===================================================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons', 'badge-96.png');
const SIZE = 96, LIVE = 80, SS = 16;
const R = 150, D = 70, r = 128, THETA = -42 * Math.PI / 180;
const cx2 = D * Math.cos(THETA), cy2 = D * Math.sin(THETA);
const inside = (x, y) => x * x + y * y <= R * R && (x - cx2) * (x - cx2) + (y - cy2) * (y - cy2) > r * r;

// bounding box of the crescent (sampled on a 0.25-unit grid)
let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
for (let x = -R; x <= R; x += 0.25) for (let y = -R; y <= R; y += 0.25) {
  if (!inside(x, y)) continue;
  minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
}
const k = LIVE / Math.max(maxx - minx, maxy - miny);                     // crescent units → pixels
const mx = (minx + maxx) / 2, my = (miny + maxy) / 2;

// RGBA scanlines, each prefixed with filter type 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let py = 0; py < SIZE; py++) {
  const row = py * (SIZE * 4 + 1);
  for (let px = 0; px < SIZE; px++) {
    let hits = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const x = mx + (px + (i + 0.5) / SS - SIZE / 2) / k, y = my + (py + (j + 0.5) / SS - SIZE / 2) / k;
      if (inside(x, y)) hits++;
    }
    const o = row + 1 + px * 4;
    raw[o] = raw[o + 1] = raw[o + 2] = 255;
    raw[o + 3] = Math.round(255 * hits / (SS * SS));
  }
}

const CRC = new Int32Array(256).map((_, c) => { for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;         // 8-bit RGBA, no interlace
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(OUT, png);
console.log('wrote icons/badge-96.png:', png.length, 'bytes');
