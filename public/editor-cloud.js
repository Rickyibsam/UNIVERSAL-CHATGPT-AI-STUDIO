(() => {
const $=id=>document.getElementById(id),defs=[["Editor Video","video"],["Editor Overlay","video"],["Editor Audio","audio"],["Editor SFX","sfx"],["Editor Subtitles","subtitle"]];
let timer=null,busy=false,again=false,quiet=false;
const pid=()=>typeof currentPlan!=="undefined"?currentPlan?.project_id:null;
const say=m=>{if($("proEditorStatus"))$("proEditorStatus").textContent=m;};
const track=t=>({video:"Editor Video",overlay:"Editor Overlay",audio:"Editor Audio",sfx:"Editor SFX",subtitles:"Editor Subtitles"})[t]||"Editor Video";
async function save(){
 const p=pid(),api=window.__studioEditor;if(!p||!api)return false;
 if(busy){again=true;return false;}busy=true;
 try{
  const auth=await sb.auth.getUser();if(!auth.data.user)throw Error("Sign in to save the editor timeline.");
  const tids={};
  for(let i=0;i<defs.length;i++){const [name,type]=defs[i];let q=await sb.from("timeline_tracks").select("id").eq("project_id",p).eq("name",name).limit(1);if(q.error)throw q.error;let id=q.data?.[0]?.id;if(!id){q=await sb.from("timeline_tracks").insert({project_id:p,name,track_type:type,sort_order:i}).select("id").single();if(q.error)throw q.error;id=q.data.id;}tids[name]=id;}
  const rows=[];
  for(let i=0;i<api.state.clips.length;i++){
   const c=api.state.clips[i];let aid=c.assetId;
   if(!aid){if(!c.file)throw Error("Re-add source media before saving this clip.");if(c.file.size>100*1024*1024)throw Error("Maximum source file size is 100 MB.");aid=crypto.randomUUID();const key=p+"/editor/"+aid+"-"+String(c.file.name).replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);let u=await sb.storage.from("studio-media").upload(key,c.file,{contentType:c.file.type||"application/octet-stream"});if(u.error)throw u.error;let a=await sb.from("assets").insert({id:aid,project_id:p,asset_type:c.kind==="image"?"image":c.kind==="audio"?"audio":"video",storage_key:key,mime_type:c.file.type,size_bytes:c.file.size,source_provider:"user_upload",license_metadata:{source:"user_upload",filename:c.file.name}});if(a.error)throw a.error;c.assetId=aid;}
   const id=c.dbId||crypto.randomUUID();c.dbId=id;
   rows.push({id,project_id:p,track_id:tids[track(c.track)],asset_id:aid,title:c.name,start_seconds:Math.max(0,Number(c.start)||0),duration_seconds:Math.max(.05,Number(c.trimOut)-Number(c.trimIn)),trim_in_seconds:Math.max(0,Number(c.trimIn)||0),volume:Math.max(0,Math.min(2,Number(c.volume)||0)),sort_order:i,properties:{editor_clip:true,kind:c.kind,original_name:c.name,trim_out_seconds:c.trimOut,speed:c.speed,filter:c.filter,transition:c.transition,fade:c.fade,fit:c.fit,rotate:c.rotate,scale:c.scale,animation:c.animation,text:c.text,text_size:c.textSize,text_position:c.textPosition,sticker:c.sticker,frame_rate:c.frameRate||api.manifest().canvas.frame_rate||30,keyframes:c.keyframes||[],opacity:Number(c.opacity??1),chroma_key:c.chromaKey||"off",chroma_similarity:c.chromaSimilarity||.25,chroma_blend:c.chromaBlend||.1}});
  }
  if(rows.length){const r=await sb.from("timeline_clips").upsert(rows,{onConflict:"id"});if(r.error)throw r.error;}
  const existing=await sb.from("timeline_clips").select("id").eq("project_id",p).in("track_id",Object.values(tids));if(existing.error)throw existing.error;
  const keep=new Set(rows.map(x=>x.id));for(const row of existing.data||[])if(!keep.has(row.id)){const del=await sb.from("timeline_clips").delete().eq("id",row.id).eq("project_id",p);if(del.error)throw del.error;}
  say("Cloud timeline saved · "+rows.length+" clips and media stored in your private project.");
 }catch(e){say("Cloud save failed: "+(e.message||e));return false;}
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
 clips.push({id:"cloud-"+r.id,dbId:r.id,assetId:a.id,name:v.original_name||r.title,kind:v.kind||(a.asset_type==="image"?"image":a.asset_type==="audio"?"audio":"video"),url:u.data.signedUrl,file:null,mime:a.mime_type||"",track:t.name==="Editor Overlay"?"overlay":t.name==="Editor Audio"?"audio":t.name==="Editor SFX"?"sfx":t.name==="Editor Subtitles"?"subtitles":"video",start:Number(r.start_seconds)||0,trimIn:ti,trimOut:Number(v.trim_out_seconds)||ti+Number(r.duration_seconds),speed:Number(v.speed)||1,volume:Number(r.volume)||0,filter:v.filter||"none",transition:v.transition||"None",fade:Number(v.fade)||0,fit:v.fit||"contain",rotate:v.rotate||0,scale:v.scale||100,animation:v.animation||"none",text:v.text||"",textSize:v.text_size||34,textPosition:v.text_position||"top",sticker:v.sticker||"",frameRate:v.frame_rate||30,keyframes:v.keyframes||[],opacity:Number(v.opacity??1),chromaKey:v.chroma_key||"off",chromaSimilarity:v.chroma_similarity||.25,chromaBlend:v.chroma_blend||.1});}
 quiet=true;api.load(clips);setTimeout(()=>quiet=false,0);say("Cloud timeline restored · "+clips.length+" clips.");
}
window.__studioCloudSchedule=queue;window.__studioCloudSave=save;
async function renderMp4(){
 const button=$("editorRender");if(button)button.disabled=true;
 try{
  if(!pid())throw Error("Save this production to a cloud project before rendering.");
  const ok=await save();if(!ok)throw Error("Cloud timeline save did not finish. Resolve the save message and retry.");
  const api=window.__studioEditor,manifest=api.manifest(),clips=manifest.clips||[];
  if(!clips.length||clips.some(c=>!c.asset_id))throw Error("Every timeline clip must have uploaded cloud media before rendering.");
  const ratio=String(manifest.canvas.aspect_ratio||"16 / 9").split("/").map(x=>Number(x.trim()));
  const resolution=Number($("renderResolution")?.value||1080),fps=30;
  const w0=ratio[0]||16,h0=ratio[1]||9,scale=resolution/Math.max(w0,h0);
  const width=Math.max(320,Math.round(w0*scale/2)*2),height=Math.max(240,Math.round(h0*scale/2)*2);
  const renderClips=clips.map(c=>({asset_id:c.asset_id,track_type:c.kind==="image"?"image":c.track==="overlay"?"overlay":c.track==="audio"||c.track==="sfx"?"audio":c.track==="subtitles"?"subtitle":"video",start_seconds:Number(c.start)||0,trim_in_seconds:Number(c.trimIn)||0,duration_seconds:Math.max(.05,Number(c.trimOut)-Number(c.trimIn)),speed:Number(c.speed)||1,volume:Number(c.volume)||0,filter:c.filter||"none",transition:c.transition||"None",fade:Number(c.fade)||0,fit:c.fit||"contain",rotation:Number(c.rotate)||0,scale:Number(c.scale)||100,keyframes:c.keyframes||[],opacity:Number(c.opacity??1),chroma_key:c.chromaKey||"off",chroma_similarity:Number(c.chromaSimilarity)||.25,chroma_blend:Number(c.chromaBlend)||.1,text:c.text||"",text_size:Number(c.textSize)||34,text_position:c.textPosition||"center"}));
  const {data:{session}}=await sb.auth.getSession();if(!session)throw Error("Sign in before rendering.");
  const response=await fetch(SUPABASE_URL+"/functions/v1/studio-gateway",{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+session.access_token},body:JSON.stringify({action:"render-video",project_id:pid(),timeline:{width,height,fps,clips:renderClips}})});
  const queued=await response.json();if(!response.ok)throw Error(queued.message||queued.error||"Could not queue MP4 render.");
  const renderer="https://universal-studio-renderer.onrender.com";
  const start=await fetch(renderer+"/jobs/"+queued.job_id+"/run",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({project_id:pid()})});
  const started=await start.json();if(!start.ok)throw Error(started.detail||"Cloud renderer could not accept the job.");
  say("Render accepted by cloud renderer · "+queued.job_id);
  let job=null;
  for(let i=0;i<450;i++){
   await new Promise(r=>setTimeout(r,2000));
   const q=await fetch(renderer+"/jobs/"+queued.job_id+"?project_id="+encodeURIComponent(pid()),{headers:{"Authorization":"Bearer "+session.access_token}});
   if(!q.ok)throw Error("Cloud renderer status unavailable ("+q.status+").");
   job=await q.json();say("Cloud render · "+job.status+" · "+Number(job.progress_percent||0)+"% · "+queued.job_id);
   if(job.status==="succeeded")break;
   if(job.status==="failed"||job.status==="cancelled")throw Error(job.error_message||"Render "+job.status);
  }
  if(!job||job.status!=="succeeded")throw Error("Render is still queued/running. It has not been marked complete.");
  const ids=job.result_payload?.output_asset_ids||job.output_asset_ids||[];
  let assetIds=ids;
  if(!assetIds.length){const j=await sb.from("generation_jobs").select("output_asset_ids").eq("id",queued.job_id).single();assetIds=j.data?.output_asset_ids||[];}
  if(!assetIds.length)throw Error("Render completed without an output asset reference.");
  const ar=await sb.from("assets").select("*").eq("project_id",pid()).in("id",assetIds);if(ar.error)throw ar.error;
  const video=ar.data.find(a=>a.asset_type==="video"&&a.mime_type==="video/mp4");if(!video)throw Error("Rendered MP4 asset was not found.");
  const signed=await sb.storage.from("studio-media").createSignedUrl(video.storage_key,3600);if(signed.error)throw signed.error;
  const a=document.createElement("a");a.href=signed.data.signedUrl;a.download="universal-studio-final.mp4";a.target="_blank";a.rel="noopener";a.click();
  say("MP4 render complete · "+video.width+"×"+video.height+" · "+Number(video.duration_seconds||0).toFixed(1)+" sec. Download opened.");
 }catch(e){say("MP4 render not completed: "+(e.message||e));}
 finally{if(button)button.disabled=false;}
}
document.addEventListener("DOMContentLoaded",()=>{ $("editorSave")?.addEventListener("click",save);$("editorRender")?.addEventListener("click",renderMp4);window.addEventListener("studio-cloud-project-opened",e=>load(e.detail.projectId));});
})();