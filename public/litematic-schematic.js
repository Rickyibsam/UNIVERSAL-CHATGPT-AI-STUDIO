import { parseNbt, objectBlocks } from "./world-schematic.js";

const MAX_DIMENSION = 128;
const MAX_CELLS = 1000000;

function positiveDimension(value, label) {
  const n = Math.abs(Number(value));
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_DIMENSION) {
    throw new Error("Litematic region has an invalid or oversized " + label + " dimension.");
  }
  return n;
}

function blockState(entry) {
  if (!entry || typeof entry.Name !== "string" || !entry.Name.includes(":")) {
    throw new Error("Litematic palette contains an invalid block state.");
  }
  const props = entry.Properties && typeof entry.Properties === "object"
    ? Object.entries(entry.Properties).sort(([a],[b]) => a.localeCompare(b))
    : [];
  return entry.Name + (props.length ? "[" + props.map(([k,v]) => k + "=" + v).join(",") + "]" : "");
}

function unpackStates(packed, count, paletteSize) {
  if (!Array.isArray(packed) || !packed.length) {
    if (count === 0) return [];
    throw new Error("Litematic region is missing packed BlockStates.");
  }
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, paletteSize))));
  if (bits > 32) throw new Error("Litematic palette is too large.");
  const mask = (1n << BigInt(bits)) - 1n;
  const values = packed.map(v => BigInt.asUintN(64, BigInt(v)));
  const compactLength = Math.ceil(count * bits / 64);
  const perLong = Math.floor(64 / bits);
  const paddedLength = Math.ceil(count / perLong);
  const padded = values.length === paddedLength && values.length !== compactLength;
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    let value;
    if (padded) {
      const slot = i % perLong;
      value = (values[Math.floor(i / perLong)] >> BigInt(slot * bits)) & mask;
    } else {
      const bitIndex = i * bits;
      const longIndex = Math.floor(bitIndex / 64);
      const offset = bitIndex % 64;
      if (longIndex >= values.length) throw new Error("Litematic packed BlockStates array is truncated.");
      value = values[longIndex] >> BigInt(offset);
      if (offset + bits > 64) {
        if (longIndex + 1 >= values.length) throw new Error("Litematic packed BlockStates array is truncated.");
        value |= values[longIndex + 1] << BigInt(64 - offset);
      }
      value &= mask;
    }
    const paletteIndex = Number(value);
    if (paletteIndex >= paletteSize) throw new Error("Litematic block palette index is out of range.");
    out[i] = paletteIndex;
  }
  return out;
}

export function decodeLitematicRoot(root) {
  const regions = root?.Regions;
  if (!regions || typeof regions !== "object" || Array.isArray(regions)) {
    throw new Error("This .litematic file has no valid Regions compound.");
  }
  const entries = Object.entries(regions);
  if (!entries.length || entries.length > 128) throw new Error("Litematic must contain between 1 and 128 regions.");
  const decoded = [];
  let totalCells = 0;
  for (const [name, region] of entries) {
    const sx = positiveDimension(region?.Size?.x, "X");
    const sy = positiveDimension(region?.Size?.y, "Y");
    const sz = positiveDimension(region?.Size?.z, "Z");
    const volume = sx * sy * sz;
    totalCells += volume;
    if (totalCells > MAX_CELLS) throw new Error("Litematic exceeds the safe 1,000,000-cell import limit.");
    const palette = region.BlockStatePalette;
    if (!Array.isArray(palette) || !palette.length || palette.length > 4096) {
      throw new Error("Litematic region has an invalid block palette.");
    }
    const states = palette.map(blockState);
    const indices = unpackStates(region.BlockStates, volume, states.length);
    const pos = region.Position || {};
    const ox = Number(pos.x || 0), oy = Number(pos.y || 0), oz = Number(pos.z || 0);
    if (![ox, oy, oz].every(Number.isSafeInteger)) throw new Error("Litematic region position is invalid.");
    const regionBlocks = [];
    for (let i = 0; i < volume; i++) {
      const state = states[indices[i]];
      if (state === "minecraft:air" || state === "minecraft:cave_air" || state === "minecraft:void_air") continue;
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / (sx * sz));
      regionBlocks.push({
        x: ox + (Number(region.Size.x) < 0 ? sx - 1 - x : x),
        y: oy + (Number(region.Size.y) < 0 ? sy - 1 - y : y),
        z: oz + (Number(region.Size.z) < 0 ? sz - 1 - z : z),
        state
      });
    }
    decoded.push({ name, blocks: regionBlocks });
  }
  const all = decoded.flatMap(region => region.blocks);
  if (!all.length) throw new Error("This litematic contains no non-air blocks to import.");
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of all) {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); minZ = Math.min(minZ, b.z);
    maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); maxZ = Math.max(maxZ, b.z);
  }
  const width = maxX - minX + 1, height = maxY - minY + 1, length = maxZ - minZ + 1;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || length > MAX_DIMENSION || width * height * length > MAX_CELLS) {
    throw new Error("Combined litematic regions exceed the safe 128×128×128 import bounds.");
  }
  return {
    width, height, length,
    blocks: all.map(b => ({ x: b.x - minX, y: b.y - minY, z: b.z - minZ, state: b.state })),
    regionCount: entries.length
  };
}

export async function decodeLitematic(input) {
  let buffer = input instanceof ArrayBuffer
    ? input
    : ArrayBuffer.isView(input)
      ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
      : await input.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress GZIP .litematic files.");
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  } else if (bytes[0] === 0x78 && (bytes[1] === 0x01 || bytes[1] === 0x5e || bytes[1] === 0x9c || bytes[1] === 0xda)) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress zlib .litematic files.");
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
  }
  return decodeLitematicRoot(parseNbt(buffer));
}

class LitematicWriter {
  constructor(){ this.bytes=[]; }
  u8(v){ this.bytes.push(Number(v)&255); }
  i16(v){ this.u8((v>>8)&255); this.u8(v&255); }
  i32(v){ this.u8((v>>>24)&255); this.u8((v>>>16)&255); this.u8((v>>>8)&255); this.u8(v&255); }
  i64(v){ const n=BigInt.asUintN(64,BigInt(v)); for(let s=56n;s>=0n;s-=8n)this.u8(Number((n>>s)&255n)); }
  string(v){ const data=new TextEncoder().encode(String(v)); if(data.length>65535)throw new Error("Litematic NBT string is too long."); this.i16(data.length); for(const b of data)this.u8(b); }
  named(type,name,write){ this.u8(type); this.string(name); write(); }
  int(name,v){ this.named(3,name,()=>this.i32(v)); }
  long(name,v){ this.named(4,name,()=>this.i64(v)); }
  stringTag(name,v){ this.named(8,name,()=>this.string(v)); }
  compound(name){ this.u8(10); this.string(name); }
  list(name,type,values){ this.u8(9); this.string(name); this.u8(type); this.i32(values.length); }
  longArray(name,values){ this.u8(12); this.string(name); this.i32(values.length); for(const v of values)this.i64(v); }
  end(){ this.u8(0); }
  finish(){ return Uint8Array.from(this.bytes); }
}

function paletteParts(state){
  const value=String(state),open=value.indexOf("[");
  const name=open<0?value:value.slice(0,open);
  if(!name.includes(":")||(open>=0&&!value.endsWith("]")))throw new Error("Unsupported Minecraft block state: "+state);
  const properties={};
  const body=open<0?"":value.slice(open+1,-1);
  if(body)for(const part of body.split(",")){
    const at=part.indexOf("=");
    if(at<1)throw new Error("Invalid Minecraft block-state property: "+part);
    properties[part.slice(0,at)]=part.slice(at+1);
  }
  return {name,properties};
}

function packedLongs(indexes,paletteSize){
  const bits=Math.max(2,Math.ceil(Math.log2(Math.max(2,paletteSize))));
  const mask=(1n<<BigInt(bits))-1n;
  const longs=Array(Math.ceil(indexes.length*bits/64)).fill(0n);
  indexes.forEach((value,i)=>{
    const bit=i*bits,index=Math.floor(bit/64),shift=bit%64,n=BigInt(value)&mask;
    longs[index]|=n<<BigInt(shift);
    if(shift+bits>64)longs[index+1]|=n>>BigInt(64-shift);
  });
  return longs.map(v=>BigInt.asIntN(64,v));
}

export function buildLitematicNbt(objects){
  const cells=new Map();
  for(const item of Array.isArray(objects)?objects:[])for(const b of objectBlocks(item))cells.set(b.x+","+b.y+","+b.z,b);
  if(!cells.size)throw new Error("Add Minecraft blocks or a Minecraft house/mob before exporting a .litematic.");
  const blocks=[...cells.values()];
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const b of blocks){minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);minZ=Math.min(minZ,b.z);maxX=Math.max(maxX,b.x);maxY=Math.max(maxY,b.y);maxZ=Math.max(maxZ,b.z);}
  const width=maxX-minX+1,height=maxY-minY+1,length=maxZ-minZ+1,volume=width*height*length;
  if(![width,height,length].every(Number.isSafeInteger)||width>128||height>128||length>128||volume>1000000)throw new Error("Litematic exceeds the safe 128×128×128 export limit.");
  const states=[...new Set(["minecraft:air",...blocks.map(b=>String(b.state))])].sort();
  const palette=new Map(states.map((state,index)=>[state,index]));
  const indexes=new Uint32Array(volume);
  for(const b of blocks){const x=b.x-minX,y=b.y-minY,z=b.z-minZ;indexes[(y*length+z)*width+x]=palette.get(String(b.state));}
  const packed=packedLongs(indexes,states.length);
  const writer=new LitematicWriter();
  writer.u8(10);writer.string("");
  writer.int("Version",6);writer.int("SubVersion",1);writer.int("MinecraftDataVersion",0);
  writer.compound("Metadata");
  writer.stringTag("Name","Universal Studio World");
  writer.stringTag("Author","Universal ChatGPT AI Studio");
  writer.stringTag("Description","Exported from Universal ChatGPT AI Studio");
  writer.int("RegionCount",1);writer.int("TotalBlocks",blocks.length);writer.int("TotalVolume",volume);
  writer.long("TimeCreated",BigInt(Date.now()));writer.long("TimeModified",BigInt(Date.now()));
  writer.compound("EnclosingSize");writer.int("x",width);writer.int("y",height);writer.int("z",length);writer.end();
  writer.end();
  writer.compound("Regions");
  writer.compound("Universal Studio");
  writer.int("DataVersion",0);
  writer.compound("Position");writer.int("x",minX);writer.int("y",minY);writer.int("z",minZ);writer.end();
  writer.compound("Size");writer.int("x",width);writer.int("y",height);writer.int("z",length);writer.end();
  writer.list("BlockStatePalette",10,states);
  for(const state of states){
    const parts=paletteParts(state);
    writer.stringTag("Name",parts.name);
    const entries=Object.entries(parts.properties);
    if(entries.length){writer.compound("Properties");for(const [key,value] of entries)writer.stringTag(key,value);writer.end();}
    writer.end();
  }
  writer.longArray("BlockStates",packed);
  writer.list("TileEntities",10,[]);writer.list("Entities",10,[]);
  writer.end();writer.end();writer.end();
  return writer.finish();
}

export async function encodeLitematic(objects){
  if(typeof CompressionStream==="undefined")throw new Error("This browser does not support GZIP compression for .litematic export.");
  const raw=buildLitematicNbt(objects);
  const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).blob();
}
