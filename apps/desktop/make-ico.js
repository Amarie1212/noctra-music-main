const fs = require('fs');
const path = require('path');

// Use sharp to resize + save multiple sizes, then manually create ICO
// We'll use a simple approach with the 'png-to-ico' package if available,
// otherwise fallback to copying png as ico (electron-builder may handle it)

async function main() {
  const buildDir = path.join(__dirname, 'build');
  const pngPath = path.join(buildDir, 'icon.png');
  const icoPath = path.join(buildDir, 'icon.ico');

  if (!fs.existsSync(pngPath)) {
    console.error('icon.png not found in build/');
    process.exit(1);
  }

  try {
    const pngToIco = require('png-to-ico');
    const rawPngToIco = require('png-to-ico');
    const pngToIco = typeof rawPngToIco === 'function' ? rawPngToIco : (rawPngToIco.default || rawPngToIco.imagesToIco);
    const buf = await pngToIco([pngPath]);
    fs.writeFileSync(icoPath, buf);
    console.log('✅ icon.ico created successfully!');
  } catch (e) {
    // Fallback: just copy the png as ico - electron-builder might handle it
    console.log('png-to-ico not available, copying png as fallback...');
    fs.copyFileSync(pngPath, icoPath);
    console.log('✅ icon.ico (fallback) created.');
  }
}

main().catch(console.error);
