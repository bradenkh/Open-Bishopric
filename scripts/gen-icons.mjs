/**
 * Generates public/icons/icon-192.png and icon-512.png from an inline SVG
 * using the `sharp` package (already in package.json).
 *
 * Run: node scripts/gen-icons.mjs
 */
import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, "../public/icons");

// ── Brand colour ────────────────────────────────────────────────────────────
const BLUE = "#2563eb";

/**
 * Build the SVG at `size × size` with a blue rounded-square background
 * and white bishopric figures.
 *
 * All coordinates are expressed in a 100×100 internal viewBox so they
 * scale cleanly to any output resolution via the width/height attributes.
 */
function buildSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg"
     width="${size}" height="${size}" viewBox="0 0 100 100">

  <!-- Blue rounded-square background -->
  <rect width="100" height="100" rx="22" fill="${BLUE}"/>

  <!-- Figures — white stroke, no fill -->
  <g fill="none" stroke="white" stroke-width="3"
     stroke-linecap="round" stroke-linejoin="round">

    <!-- ── Left counselor ── -->
    <!-- Head -->
    <circle cx="24" cy="40" r="9"/>
    <!-- Hair arc -->
    <path d="M15.5 36.5 Q24 29.5 32.5 36.5"/>
    <!-- Left shoulder -->
    <path d="M13.5 66 Q13.5 52 24 49.5"/>
    <!-- Right shoulder -->
    <path d="M34.5 66 Q34.5 52 24 49.5"/>
    <!-- Left lapel -->
    <path d="M24 49.5 L20.5 57"/>
    <!-- Right lapel -->
    <path d="M24 49.5 L27.5 57"/>
    <!-- Tie -->
    <path d="M22 57 L24 65.5 L26 57"/>

    <!-- ── Right counselor ── -->
    <!-- Head -->
    <circle cx="76" cy="40" r="9"/>
    <!-- Hair arc -->
    <path d="M67.5 36.5 Q76 29.5 84.5 36.5"/>
    <!-- Left shoulder -->
    <path d="M65.5 66 Q65.5 52 76 49.5"/>
    <!-- Right shoulder -->
    <path d="M86.5 66 Q86.5 52 76 49.5"/>
    <!-- Left lapel -->
    <path d="M76 49.5 L72.5 57"/>
    <!-- Right lapel -->
    <path d="M76 49.5 L79.5 57"/>
    <!-- Tie -->
    <path d="M74 57 L76 65.5 L78 57"/>

    <!-- ── Bishop (center, taller) ── -->
    <!-- Head -->
    <circle cx="50" cy="34" r="11"/>
    <!-- Hair arc -->
    <path d="M39.5 29.5 Q50 21 60.5 29.5"/>
    <!-- Left shoulder -->
    <path d="M34.5 66 Q34.5 46 50 43"/>
    <!-- Right shoulder -->
    <path d="M65.5 66 Q65.5 46 50 43"/>
    <!-- Left lapel -->
    <path d="M50 43 L43.5 55"/>
    <!-- Right lapel -->
    <path d="M50 43 L56.5 55"/>
    <!-- Tie -->
    <path d="M46.5 55 L50 66 L53.5 55"/>

    <!-- ── Desk / sacrament table ── -->
    <rect x="2" y="66" width="96" height="22" rx="5"/>
  </g>
</svg>`;
}

for (const size of [192, 512]) {
  const svg = buildSVG(size);
  const outPath = resolve(iconsDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`✓ Written ${outPath}`);
}
