(() => {
  const panel = document.getElementById("youtubeAutomation");
  if (!panel || !window.supabase) return;
  const $v = (id) => document.getElementById(id);
  const status = (message, bad=false) => {
    const el=$v("vpStatus"); if(el){el.textContent=message;el.style.color=bad?"#ff9b9b":"#9aa9c3";}
  };
  const esc = (s) => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const getProject = () => (typeof currentPlan!=="undefined" ? currentPlan : null);
  const fmtDate = (s) => s ? new Date(s).toLocaleString() : "";
  const templateGroups = [
    ["ABC & Phonics",["A is for Apple","B is for Ball","C is for Cat","D is for Dog","E is for Elephant","F is for Fish","G is for Grapes","H is for House","I is for Ice Cream","J is for Jellyfish","K is for Kite","L is for Lion","M is for Mango","N is for Nest","O is for Orange","P is for Parrot","Q is for Queen","R is for Rabbit","S is for Sun","T is for Tiger","U is for Umbrella","V is for Violin","W is for Whale","X is for Xylophone","Y is for Yacht","Z is for Zebra"]],
    ["Numbers & Colors",["Count 1 to 10","Count 1 to 20","Learn Shapes","Rainbow Colors","Primary Colors","Big and Small","Opposites","Days of the Week","Months of the Year","Seasons for Kids"]],
    ["Nursery Rhymes",["Twinkle Star Adventure","Old MacDonald Farm","Wheels on the Bus","Rain Rain Go Away","Five Little Ducks","Itsy Bitsy Spider","Humpty Dumpty","Baa Baa Black Sheep","Row Row Your Boat","If You Are Happy"]],
    ["3D Cartoon Stories",["Friendly Robot","Lost Baby Dinosaur","Magic Toy Train","Jungle Friends","Underwater Rescue","Space Explorer","Talking Animals","Little Superhero","Enchanted Forest","Kindness Story"]],
    ["Science & Nature",["Solar System","Water Cycle","Plant Life Cycle","Ocean Animals","Weather for Kids","Dinosaur Discovery","Human Body Basics","Butterfly Metamorphosis","Save the Earth","Volcanoes Explained"]],
    ["Learning & Life Skills",["Good Manners","Brush Your Teeth","Healthy Food","Road Safety","Sharing is Caring","Clean Your Room","First Day at School","Helping Parents","Friendship","Emotions for Kids"]],
    ["Creative Learning",["Alphabet Animals","Phonics Sound Hunt","Letter Matching Game","Find the Missing Letter","Number Train","Counting Dinosaurs","Shape Detective","Color Mixing Lab","Build a Rainbow","Pattern Puzzle","Farm Animal Sounds","Baby Animal Names","Wildlife Rescue","Ocean Explorer","Space Planet Tour","Rocket Launch Science","Little Chef Recipe","Fruit Salad Lesson","Vegetable Garden","Recycling Heroes","Traffic Light Lesson","Community Helpers","Musical Instruments","Feelings and Faces","Bedtime Calm Story","Magic Word Adventure","Treasure Map Directions","Opposite Day Challenge","Healthy Habits Song","Kindness Superhero"]]
  ];
  const allTemplates = templateGroups.flatMap(([group,items])=>items.map((name)=>({group,name})));
  function addTemplateCards(){
    const grid=$v("templateGrid"); if(!grid || grid.dataset.extended==="1")return;
    grid.dataset.extended="1";
    const extra=allTemplates.map((t,i)=>'<article class="toolcard"><div class="template-preview '+(i%2===0?'vertical':'')+'">'+(i%2===0?'✦':'▶')+'</div><h3>'+esc(t.name)+'</h3><p>'+esc(t.group)+' · Starter prompt</p><button class="btn secondary vp-template" data-template="'+i+'">Use template</button></article>').join("");
    grid.insertAdjacentHTML("beforeend",extra);
    const note=document.createElement("p");note.className="hint";note.textContent="100+ learning/story starter templates are available below the platform presets. Templates provide prompts; they do not themselves generate finished video.";grid.after(note);
    grid.addEventListener("click",e=>{
      const b=e.target.closest(".vp-template");if(!b)return;
      const t=allTemplates[Number(b.dataset.template)];if(!t)return;
      const prompt="Create an original, child-friendly "+t.group.toLowerCase()+" video titled '"+t.name+"'. Use a colorful polished 3D cartoon style, clear visual storytelling, expressive characters, simple age-appropriate language, scene-by-scene progression, cheerful lighting and an uplifting ending. Include detailed visual directions for each scene.";
      $v("vpPrompt").value=prompt;
      if(typeof currentPlan!=="undefined" && currentPlan){$v("prompt").value=prompt;$v("prompt").dispatchEvent(new Event("input",{bubbles:true}));}
      status("Template selected: "+t.name+". Save the production before generating.");
    });
  }
  async function sessionOrThrow(){const {data:{session},error}=await sb.auth.getSession();if(error)throw error;if(!session)throw Error("Sign in to your Studio account first.");return session;}
  async function loadJobs(){
    try{
      const p=getProject();if(!p?.project_id){$v("vpJobs").textContent="Save or open a cloud project to view its generation history.";return;}
      const {data,error}=await sb.from("generation_jobs").select("id,job_type,status,progress_percent,input_parameters,output_asset_ids,error_message,created_at,result_payload").eq("project_id",p.project_id).order("created_at",{ascending:false}).limit(30);
      if(error)throw error;
      if(!data?.length){$v("vpJobs").textContent="No generation jobs for this project yet.";return;}
      const rows=[];
      for(const job of data){
        let downloads="";
        if(job.status==="succeeded" && (job.output_asset_ids||[]).length){
          const {data:assets,error:assetError}=await sb.from("assets").select("id,storage_key,mime_type,asset_type,width,height,duration_seconds").eq("project_id",p.project_id).in("id",job.output_asset_ids);
          if(!assetError)for(const a of assets||[]){const {data:signed}=await sb.storage.from("studio-media").createSignedUrl(a.storage_key,3600);if(signed?.signedUrl)downloads+='<a class="btn secondary" style="display:inline-block;margin:4px" target="_blank" rel="noopener" download href="'+esc(signed.signedUrl)+'">Download '+esc(a.asset_type||"asset")+'</a>';}
        }
        rows.push('<div class="scene"><div class="sceneNo">▶</div><div><h3>'+esc(job.job_type)+' · '+esc(job.status)+' · '+Number(job.progress_percent||0)+'%</h3><p>'+esc(fmtDate(job.created_at))+' · '+esc(job.id)+'</p>'+(job.error_message?'<p>'+esc(job.error_message)+'</p>':'')+downloads+(job.status==="failed"?'<button class="btn secondary vp-retry" data-job="'+esc(job.id)+'">Retry</button>':'')+'</div></div>');
      }
      $v("vpJobs").innerHTML=rows.join("");
    }catch(e){$v("vpJobs").textContent="Could not load jobs: "+e.message;}
  }
  async function queueVideo(){
    const p=getProject();
    if(!p?.project_id){status("First create and save a cloud production from New Production.",true);return;}
    const prompt=$v("vpPrompt").value.trim() || p.prompt || "";
    if(!prompt){status("Enter a video idea or prompt first.",true);return;}
    try{
      await sessionOrThrow();
      $v("vpGenerate").disabled=true;status("Adding a real video-generation job to your private cloud queue…");
      const id=crypto.randomUUID();
      const format=$v("vpFormat").value;
      const input={
        prompt,
        settings:{
          format, aspect_ratio:format==="short"?"9:16":"16:9",
          category:$v("vpCategory").value, language:$v("vpLanguage").value,
          style:p.style||"3D Animation", target_resolution:Number($v("vpResolution").value),
          duration_target:p.duration_seconds||60,
          characters:Array.isArray(p.characters)?p.characters:[],
          scenes:Array.isArray(p.scenes)?p.scenes.map(s=>({title:s.title,visual_prompt:s.description})):[],
          negative_prompt:"low quality, blurry, flicker, distorted anatomy, duplicate subjects, text, watermark",
          guidance_scale:5,num_inference_steps:20
        }
      };
      const {data,error}=await sb.from("generation_jobs").insert({
        id,project_id:p.project_id,job_type:"video",provider_key:"wan21_zero_gpu",
        status:"queued",progress_percent:0,input_parameters:input,output_asset_ids:[],
        idempotency_key:"video-production-"+id,max_attempts:3,retryable:true
      }).select("id").single();
      if(error)throw error;
      status("Video job queued: "+id+". It will only complete if a model worker is configured and online; no fake completion is shown.");
      await loadJobs();
      pollJob(id);
    }catch(e){status("Could not queue video: "+e.message,true);}
    finally{$v("vpGenerate").disabled=false;}
  }
  async function pollJob(id){
    const p=getProject();if(!p?.project_id)return;
    for(let i=0;i<180;i++){
      await new Promise(r=>setTimeout(r,3000));
      const {data,error}=await sb.from("generation_jobs").select("status,progress_percent,error_message").eq("id",id).eq("project_id",p.project_id).single();
      if(error){status("Job status check failed: "+error.message,true);return;}
      status("Video generation · "+data.status+" · "+Number(data.progress_percent||0)+"% · "+id);
      if(["succeeded","failed","cancelled"].includes(data.status)){if(data.status==="succeeded")status("Video clip generated. Download it from Generation History.");else status("Generation "+data.status+": "+(data.error_message||"No further details."),true);await loadJobs();return;}
    }
    status("Job is still processing. Refresh Generation History later; it has not been marked complete.");
  }
  async function retryJob(id){
    const p=getProject();if(!p?.project_id)return;
    const {data:old,error}=await sb.from("generation_jobs").select("job_type,provider_key,input_parameters").eq("id",id).eq("project_id",p.project_id).single();
    if(error)throw error;
    const newId=crypto.randomUUID();
    const {error:insertError}=await sb.from("generation_jobs").insert({id:newId,project_id:p.project_id,job_type:old.job_type,provider_key:old.provider_key,status:"queued",progress_percent:0,input_parameters:old.input_parameters,output_asset_ids:[],idempotency_key:"retry-"+newId,max_attempts:3,retryable:true});
    if(insertError)throw insertError;
    status("Retry queued: "+newId);await loadJobs();pollJob(newId);
  }
  function metadata(){
    const p=getProject()||{};
    return {
      title:$v("vpTitle").value.trim()||p.title||"Untitled video",
      description:$v("vpDescription").value.trim()||p.prompt||"",
      tags:$v("vpTags").value.split(",").map(x=>x.trim()).filter(Boolean),
      format:$v("vpFormat").value==="short"?"YouTube Shorts (9:16)":"YouTube Video (16:9)",
      category:$v("vpCategory").value,language:$v("vpLanguage").value,
      upload_mode:"manual_user_upload_only",youtube_auto_upload:false,
      disclosure_reminder:"Review child-directed audience and synthetic/altered-content disclosures before uploading."
    };
  }
  function downloadJson(filename,obj){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $v("vpGenerate").addEventListener("click",queueVideo);
  $v("vpRefresh").addEventListener("click",loadJobs);
  $v("vpJobs").addEventListener("click",async e=>{const b=e.target.closest(".vp-retry");if(b){try{b.disabled=true;await retryJob(b.dataset.job);}catch(err){status("Retry failed: "+err.message,true);}finally{b.disabled=false;}}});
  $v("vpSaveSchedule").addEventListener("click",()=>{
    const prefs={daily_count:Number($v("vpDailyCount").value),preferred_time:$v("vpTime").value,format:$v("vpFormat").value,category:$v("vpCategory").value,language:$v("vpLanguage").value,timezone:"Asia/Karachi",auto_youtube_upload:false};
    localStorage.setItem("ucas-video-production-preferences",JSON.stringify(prefs));
    status("Daily production preferences saved in this browser. Automatic background scheduling is not active yet.");
  });
  $v("vpDownloadPackage").addEventListener("click",()=>downloadJson("video-upload-package.json",metadata()));
  $v("vpCopyMetadata").addEventListener("click",()=>navigator.clipboard.writeText(JSON.stringify(metadata(),null,2)).then(()=>status("Metadata copied.")).catch(()=>status("Clipboard permission unavailable.",true)));
  sb.auth.onAuthStateChange(()=>loadJobs());
  window.addEventListener("hashchange",()=>{if(location.hash==="#youtubeAutomation")loadJobs();});
  document.addEventListener("click",e=>{if(e.target.closest(".load-cloud"))setTimeout(loadJobs,500);});
  addTemplateCards();
  if(location.hash==="#youtubeAutomation")loadJobs();
  setTimeout(()=>{const saved=localStorage.getItem("ucas-video-production-preferences");if(saved){try{const s=JSON.parse(saved);if(s.daily_count)$v("vpDailyCount").value=String(s.daily_count);if(s.preferred_time)$v("vpTime").value=s.preferred_time;}catch{}}},0);
})();