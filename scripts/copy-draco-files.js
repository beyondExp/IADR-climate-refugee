import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create public/draco directory if it doesn't exist
const dracoDir = path.join(__dirname, '../public/draco');
if (!fs.existsSync(dracoDir)) {
  fs.mkdirSync(dracoDir, { recursive: true });
}

// Copy Draco files
const filesToCopy = [
  'draco_decoder_gltf.wasm',
  'draco_encoder.wasm',
  'draco_decoder_gltf_nodejs.js',
  'draco_encoder_gltf_nodejs.js'
];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, '../node_modules/draco3dgltf', file);
  const dest = path.join(dracoDir, file);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${file} to public/draco/`);
  } else {
    console.warn(`⚠️ ${file} not found in node_modules/draco3dgltf/`);
  }
});

console.log('\n✨ Draco files copied successfully!');


