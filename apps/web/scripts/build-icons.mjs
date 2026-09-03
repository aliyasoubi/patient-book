/**
 * Rasterises the Dentixo vector sources in `public/brand` into the PNG/ICO set
 * browsers and mobile platforms need. The SVGs are the source of truth; this
 * only ever regenerates what falls out of them.
 *
 *   cd apps/web && npm i --no-save sharp && node scripts/build-icons.mjs public
 *
 * `sharp` is installed on demand rather than kept as a devDependency: it drags
 * in native binaries, and this runs about as often as the logo changes.
 *
 * macOS's built-in `qlmanage` is not a substitute — it pastes the SVG at its
 * intrinsic size into a canvas of the requested size instead of scaling it,
 * which silently produces a speck in the corner of an otherwise empty icon.
 */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC = process.argv[2];

/** SVG rasterises at `density` DPI; scale it so the render is native, not upsampled. */
async function render(svgPath, size) {
  const svg = await readFile(svgPath);
  const intrinsic = Number(/width="(\d+)"/.exec(svg.toString())?.[1] ?? 48);
  return sharp(svg, { density: Math.ceil((72 * size) / intrinsic) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * An ICO wrapping PNG-compressed entries — every browser that still asks for
 * /favicon.ico reads them, and it keeps the file at a couple of KB.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colours
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const favicon = join(PUBLIC, 'favicon.svg');
const icon = join(PUBLIC, 'brand/dentixo-icon.svg');
const maskable = join(PUBLIC, 'brand/dentixo-icon-maskable.svg');

await mkdir(join(PUBLIC, 'icons'), { recursive: true });

// favicon.ico carries 16/32/48: browsers read the first two, Windows uses 48
// for desktop shortcuts and the taskbar.
const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) icoImages.push({ size, data: await render(favicon, size) });
await writeFile(join(PUBLIC, 'favicon.ico'), buildIco(icoImages));

const targets = [
  [icon, 180, 'apple-touch-icon.png'],
  [icon, 192, 'icons/icon-192.png'],
  [icon, 512, 'icons/icon-512.png'],
  [maskable, 512, 'icons/icon-maskable-512.png'],
];
for (const [src, size, out] of targets) {
  await writeFile(join(PUBLIC, out), await render(src, size));
}

console.log('favicon.ico  ', icoSizes.map((s, i) => `${s}px=${icoImages[i].data.length}B`).join('  '));
for (const [, size, out] of targets) console.log(`${out.padEnd(30)} ${size}px`);
