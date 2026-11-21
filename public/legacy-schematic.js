import { parseNbt } from "./world-schematic.js";

const decoder = new TextDecoder();

const DYES = ["white","orange","magenta","light_blue","yellow","lime","pink","gray","light_gray","cyan","purple","blue","brown","green","red","black"];
const WOODS = ["oak","spruce","birch","jungle","acacia","dark_oak"];
const SIMPLE = {
  1:["stone","granite","polished_granite","diorite","polished_diorite","andesite","polished_andesite"],
  2:"grass_block",3:["dirt","coarse_dirt","podzol"],4:"cobblestone",
  5:WOODS.map(x=>x+"_planks"),6:WOODS.map(x=>x+"_sapling"),7:"bedrock",
  8:"water",9:"water",10:"lava",11:"lava",12:["sand","red_sand"],13:"gravel",
  14:"gold_ore",15:"iron_ore",16:"coal_ore",19:["sponge","wet_sponge"],20:"glass",
  21:"lapis_ore",22:"lapis_block",23:"dispenser",24:["sandstone","chiseled_sandstone","cut_sandstone"],
  25:"note_block",26:"red_bed",27:"powered_rail",28:"detector_rail",29:"sticky_piston",
  30:"cobweb",31:["dead_bush","short_grass","fern"],32:"dead_bush",33:"piston",34:"piston_head",
  35:DYES.map(x=>x+"_wool"),36:"air",37:"dandelion",
  38:["poppy","blue_orchid","allium","azure_bluet","red_tulip","orange_tulip","white_tulip","pink_tulip","oxeye_daisy"],
  39:"brown_mushroom",40:"red_mushroom",41:"gold_block",42:"iron_block",45:"bricks",46:"tnt",
  47:"bookshelf",48:"mossy_cobblestone",49:"obsidian",50:"torch",51:"fire",52:"spawner",
  54:"chest",55:"redstone_wire",56:"diamond_ore",57:"diamond_block",58:"crafting_table",
  59:"wheat",60:"farmland",61:"furnace",62:"furnace",63:"oak_sign",64:"oak_door",
  65:"ladder",66:"rail",68:"oak_wall_sign",69:"lever",70:"stone_pressure_plate",
  71:"iron_door",72:"oak_pressure_plate",73:"redstone_ore",74:"redstone_ore",
  75:"redstone_torch",76:"redstone_torch",77:"stone_button",78:"snow",79:"ice",
  80:"snow_block",81:"cactus",82:"clay",83:"sugar_cane",84:"jukebox",85:"oak_fence",
  86:"carved_pumpkin",87:"netherrack",88:"soul_sand",89:"glowstone",90:"nether_portal",
  91:"jack_o_lantern",92:"cake",93:"repeater",94:"repeater",95:DYES.map(x=>x+"_stained_glass"),
  96:"oak_trapdoor",97:"infested_stone",98:["stone_bricks","mossy_stone_bricks","cracked_stone_bricks","chiseled_stone_bricks"],
  99:"brown_mushroom_block",100:"red_mushroom_block",101:"iron_bars",102:"glass_pane",
  103:"melon",104:"pumpkin_stem",105:"melon_stem",106:"vine",107:"oak_fence_gate",
  108:"brick_stairs",109:"stone_brick_stairs",110:"mycelium",111:"lily_pad",
  112:"nether_bricks",113:"nether_brick_fence",114:"nether_brick_stairs",115:"nether_wart",
  116:"enchanting_table",117:"brewing_stand",118:"cauldron",119:"end_portal",120:"end_portal_frame",
  121:"end_stone",122:"dragon_egg",123:"redstone_lamp",124:"redstone_lamp",127:"cocoa",
  128:"sandstone_stairs",129:"emerald_ore",130:"ender_chest",131:"tripwire_hook",132:"tripwire",
  133:"emerald_block",134:"spruce_stairs",135:"birch_stairs",136:"jungle_stairs",137:"command_block",
  138:"beacon",139:["cobblestone_wall","mossy_cobblestone_wall"],140:"flower_pot",141:"carrots",
  142:"potatoes",143:"oak_button",144:"skeleton_skull",145:"anvil",146:"trapped_chest",
  147:"light_weighted_pressure_plate",148:"heavy_weighted_pressure_plate",149:"comparator",150:"comparator",
  151:"daylight_detector",152:"redstone_block",153:"nether_quartz_ore",154:"hopper",
  155:["quartz_block","chiseled_quartz_block","quartz_pillar"],156:"quartz_stairs",157:"activator_rail",
  158:"dropper",159:DYES.map(x=>x+"_terracotta"),160:DYES.map(x=>x+"_stained_glass_pane"),
  161:["acacia_leaves","dark_oak_leaves"],162:["acacia_log","dark_oak_log"],163:"acacia_stairs",
  164:"dark_oak_stairs",165:"slime_block",166:"barrier",167:"iron_trapdoor",
  168:["prismarine","prismarine_bricks","dark_prismarine"],169:"sea_lantern",170:"hay_block",
  171:DYES.map(x=>x+"_carpet"),172:"terracotta",173:"coal_block",174:"packed_ice",
  175:["sunflower","lilac","tall_grass","large_fern","rose_bush","peony"],176:"white_banner",
  177:"white_wall_banner",178:"daylight_detector",179:["red_sandstone","chiseled_red_sandstone","cut_red_sandstone"],
  180:"red_sandstone_stairs",183:"spruce_fence_gate",184:"birch_fence_gate",185:"jungle_fence_gate",
  186:"dark_oak_fence_gate",187:"acacia_fence_gate",188:"spruce_fence",189:"birch_fence",
  190:"jungle_fence",191:"dark_oak_fence",192:"acacia_fence",193:"spruce_door",194:"birch_door",
  195:"jungle_door",196:"acacia_door",197:"dark_oak_door",198:"end_rod",199:"chorus_plant",
  200:"chorus_flower",201:"purpur_block",202:"purpur_pillar",203:"purpur_stairs",
  206:"end_stone_bricks",207:"beetroots",208:"dirt_path",209:"end_gateway",
  210:"repeating_command_block",211:"chain_command_block",212:"frosted_ice",213:"magma_block",
  214:"nether_wart_block",215:"red_nether_bricks",216:"bone_block",217:"structure_void",
  218:"observer",255:"structure_block"
};
const STAIRS = new Set([53,67,108,109,114,128,134,135,136,156,163,164,180,203]);
const STAIR_NAMES = {53:"oak",67:"cobblestone",108:"brick",109:"stone_brick",114:"nether_brick",128:"sandstone",134:"spruce",135:"birch",136:"jungle",156:"quartz",163:"acacia",164:"dark_oak",180:"red_sandstone",203:"purpur"};
const SLABS = {43:["smooth_stone","sandstone","oak_planks","cobblestone","bricks","stone_bricks","nether_bricks","quartz_block"],44:["smooth_stone","sandstone","oak_planks","cobblestone","bricks","stone_bricks","nether_bricks","quartz_block"],125:WOODS.map(x=>x+"_planks"),126:WOODS.map(x=>x+"_planks"),181:["red_sandstone"],182:["red_sandstone"],204:["purpur_block"],205:["purpur_block"]};
function legacyState(id,meta){
  let name;
  if(id===17||id===162){const woods=id===17?WOODS.slice(0,4):["acacia","dark_oak"];const wood=woods[meta&3]||woods[0];const axis=["y","x","z"][(meta>>2)&3];name=(meta>>2&3)===3?wood+"_wood":wood+"_log";return "minecraft:"+name+((meta>>2&3)===3?"":"[axis="+axis+"]");}
  if(id===18||id===161){const woods=id===18?WOODS.slice(0,4):["acacia","dark_oak"];return "minecraft:"+(woods[meta&3]||woods[0])+"_leaves[persistent="+((meta&4)?"true":"false")+"]";}
  if(STAIRS.has(id))return "minecraft:"+STAIR_NAMES[id]+"_stairs[facing="+["east","west","south","north"][meta&3]+",half="+((meta&4)?"top":"bottom")+",shape=straight]";
  if(SLABS[id]){const material=SLABS[id][meta&7]||SLABS[id][0];let slab=material.endsWith("_planks")?material.replace("_planks","_slab"):material==="smooth_stone"?"smooth_stone_slab":material==="bricks"?"brick_slab":material==="nether_bricks"?"nether_brick_slab":material==="stone_bricks"?"stone_brick_slab":material==="quartz_block"?"quartz_slab":material==="purpur_block"?"purpur_slab":material+"_slab";return "minecraft:"+slab+"[type="+(id===43||id===125||id===181||id===204?"double":(meta&8)?"top":"bottom")+"]";}
  if(id>=219&&id<=234)return "minecraft:"+DYES[id-219]+"_shulker_box";
  if(id>=235&&id<=250)return "minecraft:"+DYES[id-235]+"_glazed_terracotta";
  if(id===251)return "minecraft:"+DYES[meta&15]+"_concrete";
  if(id===252)return "minecraft:"+DYES[meta&15]+"_concrete_powder";
  const entry=SIMPLE[id];
  if(entry!==undefined){name=Array.isArray(entry)?(entry[meta]||entry[0]):entry;return "minecraft:"+name;}
  return "minecraft:legacy_block_"+id;
}

export async function decodeLegacySchematic(input){
  let buffer=input instanceof ArrayBuffer?input:ArrayBuffer.isView(input)?input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength):await input.arrayBuffer();
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream==="undefined")throw new Error("This browser does not support GZIP decompression for .schematic import.");
    buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const root=parseNbt(buffer);
  const width=Number(root.Width),height=Number(root.Height),length=Number(root.Length),total=width*height*length;
  if(!Number.isInteger(width)||!Number.isInteger(height)||!Number.isInteger(length)||width<1||height<1||length<1||width>128||height>128||length>128||total>1000000)throw new Error("Unsupported or oversized legacy schematic dimensions.");
  const blocks=root.Blocks,data=root.Data instanceof Uint8Array?root.Data:new Uint8Array(total),addNibbles=root.AddBlocks instanceof Uint8Array?root.AddBlocks:null,addBytes=root.Add instanceof Uint8Array?root.Add:null;
  if(!(blocks instanceof Uint8Array)||blocks.length<total)throw new Error("Legacy schematic is missing a complete Blocks array.");
  const result=[];
  for(let i=0;i<total;i++){
    let id=blocks[i];
    if(addNibbles){const packed=addNibbles[i>>1]||0;id|=((i&1)===0?(packed>>4)&15:packed&15)<<8;}
    else if(addBytes&&i<addBytes.length)id|=addBytes[i]<<8;
    if(id===0)continue;
    const meta=data[i]&15;
    const x=i%width,z=Math.floor(i/width)%length,y=Math.floor(i/(width*length));
    result.push({x,y,z,state:legacyState(id,meta)});
  }
  return {width,height,length,offset:[0,0,0],blocks:result,format:"legacy-mcedit-schematic"};
}
