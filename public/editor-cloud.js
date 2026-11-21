(() => {
const $=id=>document.getElementById(id),defs=[["Editor Video","video"],["Editor Overlay","video"],["Editor Audio","audio"],["Editor SFX","sfx"],["Editor Subtitles","subtitle"]];
let timer=null,busy=false,again=false,quiet=false;
const pid=()=>typeof currentPlan!=="undefined"?currentPlan?.project_id:null;
const say=m=>{if($("proEditorStatus"))$("proEditorStatus").textContent=m;};
const track=t=>({video:"Editor Video",overlay:"Editor Overlay",audio:"Editor Audio",sfx:"Editor SFX",subtitles:"Editor Subtitles"})[t]||"Editor Video";
async function save(){
 const p=pid(),api=window.__studioEditor;if(!p||!api)return;
 if(busy){again=true;return;}busy=true;
 try{
  const auth=await sb.auth.getUser();if(!auth.data.user)throw Error("Sign in to save the editor timeline.");
  const tids={};
  for(let i=0;i<defs.length;i++){const [name,type]=defs[i];let q=await sb.from("timeline_tracks").select("id").eq("project_id",p).eq("name",name).limit(1);if(q.error)throw q.error;let id=q.data?.[0]?.id;if(!id){q=await sb.from("timeline_tracks").insert({project_id:p,name,track_type:type,sort_order:i}).select("id").single();if(q.error)throw q.error;id=q.data.id;}tids[name]=id;}
  const rows=[];
  for(let i=0;i<api.state.clips.length;i++){
   const c=api.state.clips[i];let aid=c.assetId;
   if(!aid){if(!c.file)throw Error("Re-add source media before saving this clip.");if(c.file.size>100*1024*1024)throw Error("Maximum source file size is 100 MB.");aid=crypto.randomUUID();const key=p+"/editor/"+aid+"-"+String(c.file.name).replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);let u=await sb.storage.from("studio-media").upload(key,c.file,{contentType:c.file.type||"application/octet-stream"});if(u.error)throw u.error;let a=await sb.from("assets").insert({id:aid,project_id:p,asset_type:c.kind==="image"?"image":c.kind==="audio"?"audio":"video",storage_key:key,mime_type:c.file.type,size_bytes:c.file.size,source_provider:"user_upload",license_metadata:{source:"user_upload",filename:c.file.name}});if(a.error)throw a.error;c.assetId=aid;}
   const id=c.dbId||crypto.randomUUID();c.dbId=id;
   rows.push({id,project_id:p,track_id:tids[track(c.track)],asset_id:aid,title:c.name,start_seconds:Math.max(0,Number(c.start)||0),duration_seconds:Math.max(.05,Number(c.trimOut)-Number(c.trimIn)),trim_in_seconds:Math.max(0,Number(c.trimIn)||0),volume:Math.max(0,Math.min(2,Number(c.volume)||0)),sort_order:i,properties:{editor_clip:true,kind:c.kind,original_name:c.name,trim_out_seconds:c.trimOut,speed:c.speed,filter:c.filter,transition:c.transition,fade:c.fade,fit:c.fit,rotate:c.rotate,scale:c.scale,animation:c.animation,text:c.text,text_size:c.textSize,text_position:c.textPosition,sticker:c.sticker,frame_rate:c.frameRate||30,keyframes:c.keyframes||[]}});
  }
  if(rows.length){const r=await sb.from("timeline_clips").upsert(rows,{onConflict:"id"});if(r.error)throw r.error;}
  say("Cloud timeline saved · "+rows.length+" clips and media stored in your private project.");
 }catch(e){say("Cloud save failed: "+(e.message||e));}
 finally{busy=false;if(again){again=false;queue();}}
}
function queue(){if(quiet||!pid())return;clearTimeout(timer);timer=setTimeout(save,1800);}
async function load(p){
 const api=window.__studioEditor;if(!api)return;
 const tr=await sb.from("timeline_tracks").select("*").eq("project_id",p).in("name",defs.map(x=>x[0]));if(tr.error||!tr.data?.length)return;
 const rs=await sb.from("timeline_clips").select("*").eq("project_id",p).in("track_id",tr.data.map(x=>x.id)).order("sort_order");if(rs.error)return;
 const ids=[...new Set(rs.data.map(x=>x.asset_id).filter(Boolean))],ar=ids.length?await sb.from("assets").select("*").eq("project_id",p).in("id",ids):{data:[]};if(ar.error)return;
 const am=new Map((ar.data||[]).map(x=>[x.id,x])),tm=new Map(tr.data.map(x=>[x.id,x])),clips=[];
 for(const r of rs.data){const a=am.get(r.asset_id),t=tm.get(r.track_id),v=r.properties||{};if(!a||!t)continue;const u=await sb.storage.from("studio-media").createSignedUrl(a.storage_key,3600);if(u.error)continue;const ti=Number(r.trim_in_seconds)||0;
 clips.push({id:"cloud-"+r.id,dbId:r.id,assetId:a.id,name:v.original_name||r.title,kind:v.kind||(a.asset_type==="image"?"image":a.asset_type==="audio"?"audio":"video"),url:u.data.signedUrl,file:null,mime:a.mime_type||"",track:t.name==="Editor Overlay"?"overlay":t.name==="Editor Audio"?"audio":t.name==="Editor SFX"?"sfx":t.name==="Editor Subtitles"?"subtitles":"video",start:Number(r.start_seconds)||0,trimIn:ti,trimOut:Number(v.trim_out_seconds)||ti+Number(r.duration_seconds),speed:Number(v.speed)||1,volume:Number(r.volume)||0,filter:v.filter||"none",transition:v.transition||"None",fade:Number(v.fade)||0,fit:v.fit||"contain",rotate:v.rotate||0,scale:v.scale||100,animation:v.animation||"none",text:v.text||"",textSize:v.text_size||34,textPosition:v.text_position||"top",sticker:v.sticker||"",frameRate:v.frame_rate||30,keyframes:v.keyframes||[]});}
 quiet=true;api.load(clips);setTimeout(()=>quiet=false,0);say("Cloud timeline restored · "+clips.length+" clips.");
}
window.__studioCloudSchedule=queue;window.__studioCloudSave=save;
document.addEventListener("DOMContentLoaded",()=>{ $("editorSave")?.addEventListener("click",save);window.addEventListener("studio-cloud-project-opened",e=>load(e.detail.projectId));});
})();