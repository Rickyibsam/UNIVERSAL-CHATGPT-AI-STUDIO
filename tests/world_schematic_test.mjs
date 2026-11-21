import assert from "node:assert/strict";
import { buildSchematicNbt, encodeSchematic, decodeSchematic } from "../public/world-schematic.js";

const objects=[
 {type:"Minecraft grass block",x:0,y:0,z:0},
 {type:"Minecraft stone block",x:1,y:0,z:0},
 {type:"Minecraft wood block",x:0,y:1,z:0},
 {type:"Minecraft custom block",blockState:"minecraft:glass",x:1,y:1,z:0},
];
const raw=buildSchematicNbt(objects);
const parsedRaw=await decodeSchematic(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
assert.equal(parsedRaw.width,2);
assert.equal(parsedRaw.height,2);
assert.equal(parsedRaw.length,1);
assert.equal(parsedRaw.blocks.length,4);
assert.ok(parsedRaw.blocks.some(b=>b.state==="minecraft:glass"));
const compressed=await encodeSchematic(objects);
const parsedGzip=await decodeSchematic(compressed);
assert.equal(parsedGzip.blocks.length,4);
assert.ok(parsedGzip.blocks.some(b=>b.state==="minecraft:grass_block"));
const house=await decodeSchematic(buildSchematicNbt([{type:"Minecraft house",x:0,y:0,z:0}]));
assert.ok(house.blocks.length>20);
console.log("PASS: Sponge .schem v2 NBT encode/decode, gzip, palette, block data and house voxelization");
