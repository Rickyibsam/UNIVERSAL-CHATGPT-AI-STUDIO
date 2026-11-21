import assert from "node:assert/strict";
import { decodeLitematicRoot } from "../public/litematic-schematic.js";

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
  { Name: "minecraft:oak_planks", Properties: { axis: "y" } }
];
const count = 48;
const indexes = Array.from({ length: count }, (_, i) => i % 3);
const root = {
  Regions: {
    "main": {
      Position: { x: -4, y: 2, z: 10 },
      Size: { x: 4, y: 3, z: 4 },
      BlockStatePalette: palette,
      BlockStates: packCompact(indexes, 2)
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
assert.ok(result.blocks.every(b => b.x >= 0 && b.y >= 0 && b.z >= 0), "negative source coordinates are normalized");
assert.throws(() => decodeLitematicRoot({ Regions: { bad: { Size: { x: 129, y: 1, z: 1 }, BlockStatePalette: palette, BlockStates: [0n] } } }), /dimension/);
assert.throws(() => decodeLitematicRoot({ Regions: {} }), /between 1 and 128/);
console.log("Litematic import tests passed.");
