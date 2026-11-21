const encoder = new TextEncoder();
const decoder = new TextDecoder();

class NbtWriter {
  constructor(){this.bytes=[];}
  u8(v){this.bytes.push(Number(v)&255);}
  i16(v){this.u8((v>>8)&255);this.u8(v&255);}
  i32(v){this.u8((v>>>24)&255);this.u8((v>>>16)&255);this.u8((v>>>8)&255);this.u8(v&255);}
  string(v){const b=encoder.encode(String(v));if(b.length>65535)throw new Error("NBT string too long");this.i16(b.length);for(const x of b)this.u8(x);}
  tagInt(name,value){this.u8(3);this.string(name);this.i32(value);}
  tagShort(name,value){this.u8(2);this.string(name);this.i16(value);}
  tagIntArray(name,values){this.u8(11);this.string(name);this.i32(values.length);for(const v of values)this.i32(v);}
  tagByteArray(name,values){this.u8(7);this.string(name);this.i32(values.length);for(const v of values)this.u8(v);}
  tagList(name,type,count){this.u8(9);this.string(name);this.u8(type);this.i32(count);}
  compound(name){this.u8(10);this.string(name);}
  end(){this.u8(0);}
  finish(){return Uint8Array.from(this.bytes);}
}
function rotateXZ(x,z,turns){
  const t=((turns%4)+4)%4;
  if(t===1)return [-z,x];
  if(t===2)return [-x,-z];
  if(t===3)return [z,-x];
  return [x,z];
}
function objectBlocks(item){
  const type=String(item.type||"").toLowerCase(),out=[];
  const push=(x,y,z,state)=>out.push({x,y,z,state});
  if(item.blockState){push(0,0,0,String(item.blockState));}
  else if(type.includes("minecraft grass block"))push(0,0,0,"minecraft:grass_block");
  else if(type.includes("minecraft stone block"))push(0,0,0,"minecraft:stone");
  else if(type.includes("minecraft wood block"))push(0,0,0,"minecraft:oak_planks");
  else if(type.includes("minecraft house")){
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=0;y<3;y++){
      if(y===2&&Math.abs(x)===1&&Math.abs(z)===1)continue;
      push(x,y,z,x===-1&&z===-1?"minecraft:stone":"minecraft:oak_planks");
    }
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)push(x,3,z,"minecraft:red_wool");
    push(0,0,2,"minecraft:oak_planks");push(0,1,2,"minecraft:oak_planks");
    push(-1,1,2,"minecraft:glass");push(1,1,2,"minecraft:glass");
  }else if(type.includes("minecraft mob")){
    for(let x=-1;x<=1;x++)for(let z=0;z<=1;z++)for(let y=0;y<=2;y++)push(x,y,z,"minecraft:green_wool");
  }
  const turns=Math.round((Number(item.rotation)||0)/(Math.PI/2));
  return out.map(b=>{const [rx,rz]=rotateXZ(b.x,b.z,turns);return {x:Math.round(Number(item.x)||0)+rx,y:Math.round(Number(item.y)||0)+b.y,z:Math.round(Number(item.z)||0)+rz,state:b.state};});
}
export function buildSchematicNbt(objects){
  const cells=new Map();
  for(const item of Array.isArray(objects)?objects:[])for(const b of objectBlocks(item))cells.set(b.x+","+b.y+","+b.z,b);
  if(!cells.size)throw new Error("Add Minecraft blocks or a Minecraft house/mob before exporting a schematic.");
  const blocks=[...cells.values()];
  const minX=Math.min(...blocks.map(b=>b.x)),minY=Math.min(...blocks.map(b=>b.y)),minZ=Math.min(...blocks.map(b=>b.z));
  const maxX=Math.max(...blocks.map(b=>b.x)),maxY=Math.max(...blocks.map(b=>b.y)),maxZ=Math.max(...blocks.map(b=>b.z));
  const width=maxX-minX+1,height=maxY-minY+1,length=maxZ-minZ+1;
  if(width>128||height>128||length>128||width*height*length>1000000)throw new Error("Schematic exceeds the safe 128×128×128 export limit.");
  const states=[...new Set(["minecraft:air",...blocks.map(b=>b.state)])].sort();
  const palette=new Map(states.map((state,index)=>[state,index]));
  const indexes=new Uint32Array(width*height*length);
  for(const b of blocks){const x=b.x-minX,y=b.y-minY,z=b.z-minZ;indexes[(y*length+z)*width+x]=palette.get(b.state);}
  const data=[];
  for(const value of indexes){let n=value>>>0;while(n&~0x7f){data.push((n&0x7f)|0x80);n>>>=7;}data.push(n);}
  const w=new NbtWriter();
  w.u8(10);w.string("");
  w.tagInt("Version",2);w.tagInt("DataVersion",0);
  w.tagShort("Width",width);w.tagShort("Height",height);w.tagShort("Length",length);
  w.tagIntArray("Offset",[minX,minY,minZ]);
  w.compound("Palette");
  for(const [state,index] of palette){w.u8(3);w.string(state);w.i32(index);}
  w.end();w.tagInt("PaletteMax",palette.size);w.tagByteArray("BlockData",data);
  w.tagList("BlockEntities",10,0);w.tagList("Entities",10,0);w.end();
  return w.finish();
}
function parseNbt(buffer){
  const view=new DataView(buffer);let p=0;
  const need=n=>{if(p+n>view.byteLength)throw new Error("Schematic NBT is truncated.");};
  const u8=()=>{need(1);return view.getUint8(p++);};
  const i16=()=>{need(2);const v=view.getInt16(p);p+=2;return v;};
  const u16=()=>{need(2);const v=view.getUint16(p);p+=2;return v;};
  const i32=()=>{need(4);const v=view.getInt32(p);p+=4;return v;};
  const str=()=>{const n=u16();need(n);const v=decoder.decode(new Uint8Array(buffer,p,n));p+=n;return v;};
  function payload(type){
    if(type===1)return view.getInt8(p++);
    if(type===2)return i16();
    if(type===3)return i32();
    if(type===4){need(8);const v=view.getBigInt64(p);p+=8;return v;}
    if(type===5){need(4);const v=view.getFloat32(p);p+=4;return v;}
    if(type===6){need(8);const v=view.getFloat64(p);p+=8;return v;}
    if(type===7){const n=i32();if(n<0||n>20000000)throw new Error("Schematic byte array is too large.");need(n);const v=new Uint8Array(buffer.slice(p,p+n));p+=n;return v;}
    if(type===8)return str();
    if(type===9){const subtype=u8(),n=i32();if(n<0||n>2000000)throw new Error("Schematic list is too large.");const out=[];for(let i=0;i<n;i++)out.push(payload(subtype));return out;}
    if(type===10){const out={};while(true){const t=u8();if(t===0)break;const name=str();out[name]=payload(t);}return out;}
    if(type===11){const n=i32();if(n<0||n>2000000)throw new Error("Schematic int array is too large.");const out=[];for(let i=0;i<n;i++)out.push(i32());return out;}
    if(type===12){const n=i32();if(n<0||n>2000000)throw new Error("Schematic long array is too large.");const out=[];for(let i=0;i<n;i++){need(8);out.push(view.getBigInt64(p));p+=8;}return out;}
    throw new Error("Unsupported NBT tag type: "+type);
  }
  const rootType=u8();if(rootType!==10)throw new Error("Schematic root must be an NBT compound.");
  str();return payload(rootType);
}
export async function encodeSchematic(objects){
  if(typeof CompressionStream==="undefined")throw new Error("This browser does not support GZIP compression for .schem export.");
  const raw=buildSchematicNbt(objects);
  const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).blob();
}
export async function decodeSchematic(input){
  let buffer=input instanceof ArrayBuffer?input:await input.arrayBuffer();
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream==="undefined")throw new Error("This browser does not support GZIP decompression for .schem import.");
    const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    buffer=await new Response(stream).arrayBuffer();
  }
  const root=parseNbt(buffer),width=Number(root.Width),height=Number(root.Height),length=Number(root.Length);
  const total=width*height*length;
  if(!width||!height||!length||width>128||height>128||length>128||total>1000000)throw new Error("Unsupported or oversized Sponge schematic dimensions.");
  const palette=root.Palette||{},reverse=new Map(Object.entries(palette).map(([state,index])=>[Number(index),state]));
  const data=root.BlockData;if(!(data instanceof Uint8Array))throw new Error("Sponge schematic is missing BlockData.");
  const blocks=[];let cursor=0;
  for(let i=0;i<total;i++){
    let value=0,shift=0,byte;
    do{if(cursor>=data.length||shift>28)throw new Error("Invalid schematic block palette data.");byte=data[cursor++];value|=(byte&0x7f)<<shift;shift+=7;}while(byte&0x80);
    const state=reverse.get(value);if(!state||state==="minecraft:air")continue;
    const x=i%width,z=Math.floor(i/width)%length,y=Math.floor(i/(width*length));
    blocks.push({x,y,z,state});
  }
  return {width,height,length,offset:Array.isArray(root.Offset)?root.Offset:[0,0,0],blocks};
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
if(typeof window!=="undefined"&&typeof document!=="undefined"){
  const status=document.getElementById("worldSchematicStatus");
  const bridge=window.__worldStudio;
  const file=document.getElementById("importWorldSchem");
  document.getElementById("exportWorldSchem")?.addEventListener("click",async()=>{
    try{const blob=await encodeSchematic(bridge?.objects||[]);download(blob,"studio-world.schem");if(status)status.textContent="Sponge .schem v2 exported · blocks and supported Minecraft structures included.";}
    catch(e){if(status)status.textContent="Schematic export failed: "+e.message;}
  });
  file?.addEventListener("change",async()=>{
    try{
      const selected=file.files?.[0];if(!selected)return;
      const parsed=await decodeSchematic(selected);
      if(parsed.blocks.length>500){throw new Error("This scene contains "+parsed.blocks.length+" blocks. Import is limited to 500 blocks for stable free-tier browser rendering.");}
      if(!confirm("Replace the current scene with "+parsed.blocks.length+" blocks from this Sponge schematic?"))return;
      const objects=parsed.blocks.map(b=>({id:crypto.randomUUID(),type:"Minecraft custom block",blockState:b.state,world:"Minecraft voxel world",location:"Imported schematic",weather:"Sunny · Day",x:b.x,y:b.y,z:b.z,scale:1,rotation:0}));
      bridge.setScene({world_type:"Minecraft voxel world",location:"Imported schematic",weather:"Sunny · Day",objects});
      window.dispatchEvent(new Event("studio-world-changed"));
      if(status)status.textContent="Sponge .schem v2 imported · "+objects.length+" blocks. Save the cloud project to keep this world.";
    }catch(e){if(status)status.textContent="Schematic import failed: "+e.message;}
    finally{file.value="";}
  });
}
