import sharp from "sharp";
import path from "path";
import fs from "fs";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Blue background circle -->
  <circle cx="50" cy="50" r="50" fill="#2563eb"/>
  <!-- Steeple vertical bar -->
  <rect x="47" y="8" width="6" height="18" fill="white" rx="1"/>
  <!-- Steeple cross bar -->
  <rect x="41" y="14" width="18" height="5" fill="white" rx="1"/>
  <!-- Roof / triangle -->
  <polygon points="50,26 24,50 76,50" fill="white"/>
  <!-- Church body -->
  <rect x="28" y="50" width="44" height="34" fill="white" rx="1"/>
  <!-- Door -->
  <rect x="43" y="64" width="14" height="20" fill="#2563eb" rx="3"/>
  <!-- Windows -->
  <rect x="33" y="56" width="10" height="10" fill="#2563eb" rx="2"/>
  <rect x="57" y="56" width="10" height="10" fill="#2563eb" rx="2"/>
</svg>`;

const outputDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outputDir, { recursive: true });

const sizes = [192, 512];

async function generate() {
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${outputPath}`);
  }
}

generate().catch(console.error);
