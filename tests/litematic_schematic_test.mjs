import assert from "node:assert/strict";
import { buildLitematicNbt, decodeLitematic, decodeLitematicRoot, encodeLitematic } from "../public/litematic-schematic.js";
import { parseNbt } from "../public/world-schematic.js";

function packCompact(values, bits) {
  const longs = Array(Math.ceil(values.length * bits / 64)).fill(0n);
  const mask = (1n << BigInt(bits)) - 1n;
  values.forEach((value, i) => {
    const offset = i * bits, index = Math.floor(offset / 64), shift = offset % 64;
    longs[index] |= (BigInt(value) & mask) << BigInt(shift);
    if (shift + bits > 64) longs[index + 1] |= (BigInt(value) & mask) >> BigInt(64 - shift);
  });
  return longs;
}

const palette = [
  { Name: "minecraft:air" },
  { Name: "minecraft:stone" },
  { Name: "minecraft:oak_planks", Properties: { axis: "y" } },
  { Name: "minecraft:dirt" },
  { Name: "minecraft:glass" }
];
const count = 48;
const indexes = Array.from({ length: count }, (_, i) => i % 5);
const root = {
  Regions: {
    "main": {
      Position: { x: -4, y: 2, z: 10 },
      Size: { x: 4, y: 3, z: 4 },
      BlockStatePalette: palette,
      BlockStates: packCompact(indexes, 3)
    },
    "annex": {
      Position: { x: 0, y: 2, z: 10 },
      Size: { x: 2, y: 1, z: 2 },
      BlockStatePalette: [{ Name: "minecraft:air" }, { Name: "minecraft:glass" }],
      BlockStates: packCompact([1, 0, 1, 1], 2)
    }
  }
};
const result = decodeLitematicRoot(root);
assert.equal(result.regionCount, 2, "multiple regions are merged");
assert.equal(result.width, 6, "negative and positive region coordinates create correct bounds");
assert.equal(result.height, 3);
assert.equal(result.length, 4);
assert.ok(result.blocks.some(b => b.state === "minecraft:stone"), "palette states are decoded");
assert.ok(result.blocks.some(b => b.state === "minecraft:oak_planks[axis=y]"), "block properties are preserved");
assert.ok(result.blocks.some(b => b.state === "minecraft:glass"), "second region is included");
assert.ok(result.blocks.some(b => b.state === "minecraft:dirt"), "compact packed values crossing a 64-bit boundary are decoded");
assert.ok(result.blocks.every(b => b.x >= 0 && b.y >= 0 && b.z >= 0), "negative source coordinates are normalized");
assert.throws(() => decodeLitematicRoot({ Regions: { bad: { Size: { x: 129, y: 1, z: 1 }, BlockStatePalette: palette, BlockStates: [0n] } } }), /dimension/);
assert.throws(() => decodeLitematicRoot({ Regions: {} }), /between 1 and 128/);
const exportObjects = [
  { type: "Minecraft custom block", blockState: "minecraft:stone", x: -2, y: 4, z: 7 },
  { type: "Minecraft custom block", blockState: "minecraft:oak_planks[axis=y]", x: -1, y: 4, z: 7 },
  { type: "Minecraft custom block", blockState: "minecraft:glass", x: -2, y: 5, z: 7 }
];
const exportedNbt = buildLitematicNbt(exportObjects);
const roundTrip = decodeLitematicRoot(parseNbt(exportedNbt.buffer.slice(exportedNbt.byteOffset, exportedNbt.byteOffset + exportedNbt.byteLength)));
assert.equal(roundTrip.width, 2, "export preserves region width");
assert.equal(roundTrip.height, 2, "export preserves region height");
assert.equal(roundTrip.length, 1, "export preserves region length");
assert.equal(roundTrip.blocks.length, 3, "exported blocks round-trip");
assert.ok(roundTrip.blocks.some(b => b.state === "minecraft:oak_planks[axis=y]"), "export preserves block properties");
assert.throws(() => buildLitematicNbt([]), /Add Minecraft blocks/);
assert.throws(() => buildLitematicNbt([
  { type: "Minecraft custom block", blockState: "minecraft:stone", x: 0, y: 0, z: 0 },
  { type: "Minecraft custom block", blockState: "minecraft:stone", x: 128, y: 0, z: 0 }
]), /128/);
const compressedFile = await encodeLitematic(exportObjects);
const compressedRoundTrip = await decodeLitematic(compressedFile);
assert.equal(compressedRoundTrip.blocks.length, 3, "GZIP .litematic export can be decoded again");
assert.ok(compressedRoundTrip.blocks.some(b => b.state === "minecraft:oak_planks[axis=y]"), "GZIP round-trip preserves block properties");
console.log("Litematic import/export round-trip tests passed.");
