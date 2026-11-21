const $=id=>document.getElementById(id);
const status=m=>{if($("worldStatus"))$("worldStatus").textContent=m;};
const bridge=window.__worldStudio;
if(!bridge){status("3D editor could not connect to the scene workspace.");}
else{
  let THREE,OrbitControls,GLTFExporter,renderer,scene,camera,controls,ground,selectedId=null,loading=false,saveTimer=null;
  const objectNodes=new Map();
  const canvas=$("worldCanvas");
  const palette={grass:0x5c9a55,stone:0x89939d,wood:0x9b6b42,roof:0x9a4c38,leaf:0x3d8c4d,skin:0xe4b38e,blue:0x4c8ed9,white:0xe8eef7,black:0x202833,gold:0xd7b05b};
  const material=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
  const mesh=(geometry,color)=>new THREE.Mesh(geometry,material(color));
  const box=(w,h,d,color)=>mesh(new THREE.BoxGeometry(w,h,d),color);
  const sphere=(r,color)=>mesh(new THREE.SphereGeometry(r,16,12),color);
  const cylinder=(rt,rb,h,color,segments=12)=>mesh(new THREE.CylinderGeometry(rt,rb,h,segments),color);
  const cone=(r,h,color)=>mesh(new THREE.ConeGeometry(r,h,8),color);
  const group=()=>new THREE.Group();
  function addPart(g,m,x,y,z){m.position.set(x,y,z);g.add(m);return m;}
  function voxelHouse(g){
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=0;y<3;y++){
      if(y===2&&Math.abs(x)===1&&Math.abs(z)===1)continue;
      const c=(x===0&&z===1&&y===0)?palette.wood:(x===-1&&z===-1)?palette.stone:palette.grass;
      addPart(g,box(.96,.96,.96,c),x,y+.48,z);
    }
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)addPart(g,box(.96,.96,.96,palette.roof),x,3.45,z);
    addPart(g,box(.55,1.8,.08,palette.wood),0,.9,1.52);
    addPart(g,box(.5,.5,.08,0x8dd3ed),-1,1.5,1.52);
    addPart(g,box(.5,.5,.08,0x8dd3ed),1,1.5,1.52);
  }
  function createObject(item){
    const g=group(),type=String(item.type||"").toLowerCase();
    if(type.includes("minecraft house"))voxelHouse(g);
    else if(type.includes("minecraft mob")){
      addPart(g,box(1.3,1.3,.9,0x58a66b),0,1.15,0);
      addPart(g,box(.95,.9,.9,0x73bd7f),0,2.25,0);
      addPart(g,box(.18,.18,.08,0xffffff),-.25,2.35,.48);
      addPart(g,box(.18,.18,.08,0xffffff),.25,2.35,.48);
      addPart(g,box(.09,.09,.04,0x111111),-.25,2.35,.54);
      addPart(g,box(.09,.09,.04,0x111111),.25,2.35,.54);
      for(const x of [-.4,.4])addPart(g,box(.28,.8,.28,0x397e50),x,.4,0);
    }else if(type.includes("tree")||type.includes("nature")){
      addPart(g,cylinder(.28,.38,2,palette.wood),0,1,0);
      addPart(g,cone(1.35,2.5,palette.leaf),0,3,0);
      addPart(g,sphere(.65,0x4d9b59),0,3.4,0);
    }else if(type.includes("building")||type.includes("house")){
      addPart(g,box(3,2.8,2.6,0xd7c7a4),0,1.4,0);
      addPart(g,cone(2.2,1.5,palette.roof),0,3.55,0);
      addPart(g,box(.75,1.35,.08,palette.wood),0,.68,1.34);
      for(const x of [-.9,.9])addPart(g,box(.55,.65,.08,0x86cce5),x,1.8,1.34);
    }else if(type.includes("vehicle")){
      addPart(g,box(3.1,.75,1.45,0xd84e43),0,.85,0);
      addPart(g,box(1.6,.8,1.2,0x6db5d9),-.2,1.55,0);
      for(const x of [-1,1])for(const z of [-.78,.78])addPart(g,cylinder(.42,.42,.22,palette.black,16),x,.43,z).rotation.x=Math.PI/2;
    }else if(type.includes("animal")){
      addPart(g,sphere(.85,0xb98752),0,.95,0).scale.set(1.4,.8,.75);
      addPart(g,sphere(.48,0xb98752),1,1.35,0);
      for(const x of [-.65,.65])for(const z of [-.4,.4])addPart(g,cylinder(.13,.16,.7,0x785337),x,.35,z);
      addPart(g,sphere(.09,0x171717),1.35,1.48,.32);
      addPart(g,sphere(.09,0x171717),1.35,1.48,-.32);
    }else if(type.includes("camera")){
      addPart(g,box(1.5,.9,.8,0x303c4e),0,1.4,0);
      addPart(g,cylinder(.38,.38,.35,0x151a22,20),0,1.4,.55).rotation.x=Math.PI/2;
      addPart(g,box(.55,.25,.4,0x64758a),0,2,0);
    }else{
      addPart(g,cylinder(.48,.58,1.5,palette.blue),0,.85,0);
      addPart(g,sphere(.43,palette.skin),0,1.9,0);
      addPart(g,box(.22,.9,.25,palette.blue),-.62,.95,0);
      addPart(g,box(.22,.9,.25,palette.blue),.62,.95,0);
      addPart(g,box(.28,.8,.32,palette.black),-.23,.1,0);
      addPart(g,box(.28,.8,.32,palette.black),.23,.1,0);
    }
    g.position.set(Number(item.x)||0,Number(item.y)||0,Number(item.z)||0);
    g.rotation.y=Number(item.rotation)||0;
    g.scale.setScalar(Math.max(.2,Math.min(5,Number(item.scale)||1)));
    g.userData.objectId=item.id;
    return g;
  }
  function setSelected(id){
    selectedId=id||null;bridge.select(selectedId);
    for(const [key,node] of objectNodes){
      node.traverse(child=>{
        if(child.isMesh&&child.material&&"emissive" in child.material){
          child.material.emissive.setHex(key===selectedId?0x244d7a:0x000000);
          child.material.emissiveIntensity=key===selectedId?.55:0;
        }
      });
    }
  }
  function buildEnvironment(){
    scene.clear();objectNodes.clear();
    const mode=$("worldMode").value,weather=$("worldWeather").value;
    const minecraft=mode.toLowerCase().includes("minecraft");
    let sky=weather.includes("Night")?0x101b34:weather.includes("Sunset")?0xe99a68:weather.includes("Rain")?0x647d91:weather.includes("Snow")?0xb8c9d7:weather.includes("Fog")?0x9aa9b1:0x8bc6e7;
    scene.background=new THREE.Color(sky);
    scene.fog=new THREE.Fog(sky,35,95);
    const hemi=new THREE.HemisphereLight(0xffffff,0x53644c,weather.includes("Night")?.55:1.5);scene.add(hemi);
    const sun=new THREE.DirectionalLight(weather.includes("Night")?0x9db7ff:0xffedcf,weather.includes("Night")?.7:2.2);
    sun.position.set(12,22,10);sun.castShadow=true;scene.add(sun);
    if(minecraft){
      const geo=new THREE.BoxGeometry(1,1,1),mat=material(palette.grass);
      const blocks=new THREE.InstancedMesh(geo,mat,20*20);let n=0;const dummy=new THREE.Object3D();
      for(let x=-10;x<10;x++)for(let z=-10;z<10;z++){dummy.position.set(x,-.5,z);dummy.updateMatrix();blocks.setMatrixAt(n++,dummy.matrix);}
      blocks.count=n;scene.add(blocks);
      const dirt=new THREE.Mesh(new THREE.BoxGeometry(20,1,20),material(0x79583c));dirt.position.y=-1.05;scene.add(dirt);
    }else{
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(80,80),material(mode.includes("Cartoon")?0x67a96a:0x718b69));plane.rotation.x=-Math.PI/2;plane.position.y=-.12;plane.receiveShadow=true;scene.add(plane);
      const grid=new THREE.GridHelper(40,40,0x526b62,0x789087);grid.position.y=-.1;scene.add(grid);
      const hill1=cone(7,5,mode.includes("Fantasy")?0x5e7a68:0x4f815c);hill1.position.set(-12,1,-10);scene.add(hill1);
      const hill2=cone(9,6,0x416d52);hill2.position.set(13,1,-14);scene.add(hill2);
    }
    const objects=bridge.objects||[];
    for(const item of objects){const node=createObject(item);node.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(node);objectNodes.set(item.id,node);}
    setSelected(selectedId);
  }
  function resize(){
    if(!renderer||!canvas)return;
    const rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  async function exportGlb(){
    try{
      const exporter=new GLTFExporter();
      exporter.parse(scene,result=>{download(new Blob([result],{type:"model/gltf-binary"}),"studio-world.glb");status("3D world exported as GLB. Import it into a compatible 3D editor or game pipeline.");},error=>{status("GLB export failed: "+error.message);},{binary:true,onlyVisible:true});
    }catch(e){status("GLB export failed: "+e.message);}
  }
  async function saveWorld(){
    const projectId=bridge.projectId;if(!projectId)return false;
    const db=bridge.supabase;if(!db)return false;
    const state=bridge.manifest();
    const {error}=await db.from("world_scenes").upsert({
      project_id:projectId,world_type:state.world_type,location:state.location,weather:state.weather,
      scene_data:{objects:state.objects,format:"studio-world-scene-v2"},updated_at:new Date().toISOString()
    },{onConflict:"project_id"});
    if(error){status("3D world cloud save failed: "+error.message);return false;}
    status("3D world autosaved to your private cloud project · "+state.objects.length+" object(s).");
    return true;
  }
  function scheduleSave(){if(loading)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorld(),1400);}
  async function loadWorld(projectId){
    if(!projectId)return;
    const db=bridge.supabase;if(!db)return;
    const {data,error}=await db.from("world_scenes").select("*").eq("project_id",projectId).maybeSingle();
    if(error){status("3D world could not load: "+error.message);return;}
    if(!data)return;
    loading=true;
    bridge.setScene({world_type:data.world_type,location:data.location,weather:data.weather,...(data.scene_data||{})});
    buildEnvironment();loading=false;
    status("3D world restored from private cloud storage · "+bridge.objects.length+" object(s).");
  }
  async function init(){
    if(!canvas)return;
    try{
      const [three,controlsModule,exporterModule]=await Promise.all([
        import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js"),
        import("https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js"),
        import("https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/exporters/GLTFExporter.js")
      ]);
      THREE=three;OrbitControls=controlsModule.OrbitControls;GLTFExporter=exporterModule.GLTFExporter;
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(50,1,.1,200);camera.position.set(14,12,18);
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,1,0);controls.update();
      buildEnvironment();resize();new ResizeObserver(resize).observe(canvas);
      const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
      canvas.addEventListener("pointerdown",event=>{
        const rect=canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
        raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects([...objectNodes.values()],true);
        if(hits.length){let node=hits[0].object;while(node&&!node.userData.objectId)node=node.parent;if(node)setSelected(node.userData.objectId);}
      });
      $("exportWorldGlb")?.addEventListener("click",exportGlb);
      $("removeWorldObject")?.addEventListener("click",()=>{selectedId=null;buildEnvironment();});
      $("clearWorldScene")?.addEventListener("click",()=>{selectedId=null;buildEnvironment();});
      window.addEventListener("studio-world-changed",()=>{buildEnvironment();scheduleSave();});
      window.addEventListener("studio-cloud-project-opened",e=>loadWorld(e.detail?.projectId));
      window.__worldStudioSave=saveWorld;
      window.__worldStudioRestore=data=>{if(!data)return;loading=true;bridge.setScene(data);buildEnvironment();loading=false;scheduleSave();};
      window.addEventListener("resize",resize);
      function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}
      animate();
      status("Interactive WebGL 3D editor ready · orbit, zoom, select objects and export GLB.");
    }catch(error){
      status("3D editor could not start WebGL/Three.js: "+error.message+". The JSON scene planner remains available.");
    }
  }
  init();
}
