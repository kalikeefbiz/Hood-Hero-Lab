// Keep material-specific roughness after the shared character compressor.
// Repack only the JSON chunk so meshopt and KTX2 data stay byte-for-byte.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [sourcePath, outputPath] = process.argv.slice(2);
const [source, output] = await Promise.all([readFile(sourcePath), readFile(outputPath)]);
const jsonEnd = file => 20 + file.readUInt32LE(12);
const parse = file => JSON.parse(file.toString('utf8', 20, jsonEnd(file)));
const raw = parse(source);
const compressed = parse(output);
for (const material of compressed.materials) {
  const original = raw.materials.find(item => item.name === material.name);
  assert(original, `No source material for ${material.name}`);
  material.pbrMetallicRoughness.roughnessFactor = original.pbrMetallicRoughness?.roughnessFactor ?? 1;
  assert(!original.pbrMetallicRoughness?.metallicRoughnessTexture,
    'Round 5 wardrobe materials must use scalar roughness');
}
const encoded = Buffer.from(JSON.stringify(compressed));
const chunk = Buffer.alloc(4 * Math.ceil(encoded.length / 4), 0x20);
encoded.copy(chunk);
const header = Buffer.from(output.subarray(0, 20));
header.writeUInt32LE(chunk.length, 12);
header.writeUInt32LE(header.length + chunk.length + output.length - jsonEnd(output), 8);
await writeFile(outputPath, Buffer.concat([header, chunk, output.subarray(jsonEnd(output))]));
