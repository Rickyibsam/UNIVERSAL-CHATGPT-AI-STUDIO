import assert from "node:assert/strict";
import { decodeLegacySchematic } from "../public/legacy-schematic.js";

class Writer {
  constructor(){this.bytes=[];}
  u8(v){this.bytes.push(v&255);}
  i16(v){this.u8(v>>8);this.u8(v);}
  i32(v){this.u8(v>>>24);this.u8(v>>>16);this.u8(v>>>8);this.u8(v);}
  string(v){const b=new TextEncoder().encode(v);this.i16(b.length);for(const x of b)this.u8(x);}
  short(name,v){this.u8(2);this.string(name);this.i16(v);}
  byteArray(name,values){this.u8(7);this.string(name);this.i32(values.length);for(const x of values)this.u8(x);}
  finish(){return Uint8Array.from(this.bytes);}
}
function fixture(){
  const w=new Writer();w.u8(10);w.string("");
  w.short("Width",4);w.short("Height",1);w.short("Length",1);
  w.u8(8);w.string("Materials");w.string("Alpha");
  w.byteArray("Blocks",[1,35,17,1]);
  w.byteArray("Data",[0,14,4,0]);
  w.byteArray("AddBlocks",[0,0x01]);
  w.u8(0);return w.finish();
}
const raw=fixture();
const parsed=await decodeLegacySchematic(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
assert.equal(parsed.width,4);
assert.equal(parsed.height,1);
assert.equal(parsed.length,1);
assert.equal(parsed.blocks.length,4);
assert.equal(parsed.blocks[0].state,"minecraft:stone");
assert.equal(parsed.blocks[1].state,"minecraft:red_wool");
assert.equal(parsed.blocks[2].state,"minecraft:oak_log[axis=x]");
assert.equal(parsed.blocks[3].state,"minecraft:legacy_block_257");
console.log("PASS: legacy MCEdit .schematic NBT, metadata, AddBlocks high-id nibbles and safe dimensions");
