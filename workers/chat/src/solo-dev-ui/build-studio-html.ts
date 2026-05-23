/**
 * Operator Studio — HTML/CSS/JS (serwowane z workera czatu).
 */
import {
  buildSoloDevAgentSelectHtml,
  buildSoloDevModelSelectHtml,
  soloDevAgentDefaultsJson,
  soloDevAgentModelMapJson,
  soloDevAgentUiHintsJson,
  soloDevModelUiHintsJson,
} from '../solo-dev-agent-presets';
import { operatorProfileDefaultsJson } from './operator-profile';
import { buildOperatorWorkflowSelectHtml, operatorWorkflowPresetsJson } from './workflow-presets';

export type StudioHtmlOptions = {
  readonly pageTitle: string;
  readonly heading: string;
};

function buildStudioHtml(opts: StudioHtmlOptions): string {
  const agentOptions = buildSoloDevAgentSelectHtml();
  const modelOptions = buildSoloDevModelSelectHtml();
  const workflowOptions = buildOperatorWorkflowSelectHtml();
  const agentModelMapJson = soloDevAgentModelMapJson();
  const agentDefaultsJson = soloDevAgentDefaultsJson();
  const agentHintsJson = soloDevAgentUiHintsJson();
  const modelHintsJson = soloDevModelUiHintsJson();
  const workflowJson = operatorWorkflowPresetsJson();
  const profileDefaultsJson = operatorProfileDefaultsJson();

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.pageTitle}</title>
  <style>
    :root { --bg:#0b1220; --card:#151d2e; --b:#243044; --tx:#e8eef8; --m:#94a3b8; --a:#38bdf8; --user:#1e3a5f; --asst:#1a2838; --side:280px; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--tx); min-height:100vh; }
    .studio { display:grid; grid-template-columns:var(--side) 1fr 220px; grid-template-rows:auto 1fr auto; min-height:100vh; gap:0; }
    @media (max-width:960px) { .studio { grid-template-columns:1fr; grid-template-rows:auto auto auto auto auto; } .side-left,.side-right { max-height:none; } }
    header.top { grid-column:1/-1; padding:14px 18px; border-bottom:1px solid var(--b); background:#0f1729; }
    header.top h1 { margin:0 0 4px; font-size:1.1rem; font-weight:600; }
    header.top p { margin:0; color:var(--m); font-size:.82rem; line-height:1.4; }
    .side-left { grid-row:2; border-right:1px solid var(--b); padding:14px; overflow-y:auto; background:var(--card); }
    .main { grid-row:2; display:flex; flex-direction:column; min-height:0; padding:12px 14px; }
    .side-right { grid-row:2; border-left:1px solid var(--b); padding:14px; overflow-y:auto; background:#0f1729; font-size:.78rem; color:var(--m); }
    .composer-wrap { grid-column:1/-1; border-top:1px solid var(--b); padding:12px 14px; background:var(--card); }
    label { font-size:.75rem; color:var(--m); display:block; margin-bottom:4px; }
    input, select, textarea, button {
      background:var(--bg); border:1px solid var(--b); color:var(--tx); border-radius:8px; padding:8px 10px; font-size:.85rem; width:100%;
    }
    button { width:auto; cursor:pointer; }
    button.primary { background:var(--a); color:#042; font-weight:600; border:none; }
    button.primary:disabled { opacity:.45; cursor:not-allowed; }
    button.ghost { background:transparent; }
    .field { margin-bottom:12px; }
    .row-btns { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .mode-banner {
      font-size:.8rem; padding:8px 12px; border-radius:8px; background:#1a2e44; border:1px solid var(--b);
      margin-bottom:10px; color:var(--tx);
    }
    #thread {
      flex:1; min-height:180px; overflow-y:auto; border:1px solid var(--b); border-radius:10px; background:var(--bg); padding:12px;
    }
    .msg { margin-bottom:12px; padding:10px 12px; border-radius:10px; font-size:.88rem; line-height:1.5; max-width:92%; }
    .msg.user { background:var(--user); margin-left:auto; white-space:pre-wrap; }
    .msg.assistant { background:var(--asst); margin-right:auto; white-space:pre-wrap; }
    .msg.err { background:#3f1d1d; color:#f87171; max-width:100%; }
    .img-block { margin-bottom:8px; }
    .msg img.attach { max-width:100%; max-height:240px; border-radius:6px; display:block; }
    .img-actions { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; }
    .img-actions button { font-size:.75rem; padding:4px 8px; }
    #sessionGallery { margin-top:10px; }
    #sessionGallery img { max-height:48px; border-radius:4px; margin:2px; border:1px solid var(--b); cursor:pointer; }
    textarea#msg { min-height:72px; resize:vertical; }
    .pick-hint { font-size:.72rem; color:var(--m); line-height:1.4; margin-top:4px; padding:6px 8px; border-radius:6px; background:var(--bg); border:1px solid var(--b); }
    .hint { font-size:.72rem; color:var(--m); }
    #attachPreview img { max-height:100px; border-radius:6px; margin-top:6px; }
    #status { font-size:.78rem; color:var(--m); }
  </style>
</head>
<body>
  <div class="studio">
    <header class="top">
      <h1>${opts.heading}</h1>
      <p>Project B — Operator Studio. <strong>Enter</strong> wyślij · <strong>Shift+Enter</strong> nowa linia · max 4 MB załącznik.</p>
    </header>
    <aside class="side-left">
      <div class="field">
        <label for="key">X-Admin-Key</label>
        <input id="key" type="password" autocomplete="off" placeholder="sekret operatora" />
        <div class="row-btns">
          <button type="button" id="saveKey" class="ghost">Zapisz</button>
          <button type="button" id="newChat" class="ghost">Nowa rozmowa</button>
        </div>
      </div>
      <div class="field">
        <label for="workflow">Tryb pracy</label>
        <select id="workflow">${workflowOptions}</select>
      </div>
      <div class="field">
        <label for="agent">Agent</label>
        <select id="agent">${agentOptions}</select>
        <p id="agentHint" class="pick-hint" aria-live="polite"></p>
      </div>
      <div class="field">
        <label for="model">Model</label>
        <select id="model">${modelOptions}</select>
        <p id="modelHint" class="pick-hint" aria-live="polite"></p>
      </div>
      <div class="field" id="gworkspaceField" hidden>
        <label for="gfileId">ID pliku Google</label>
        <input id="gfileId" type="text" autocomplete="off" placeholder="ID z URL Docs/Sheets/Drive" />
        <p class="hint">Odczyt przez MCP <code>epir-gworkspace</code> w Cursorze — nie skanuj całego Dysku.</p>
      </div>
    </aside>
    <main class="main">
      <div id="modeBanner" class="mode-banner" aria-live="polite"></div>
      <div id="thread" aria-live="polite"></div>
    </main>
    <aside class="side-right">
      <p><strong>Źródła</strong></p>
      <p id="sourcesHint">—</p>
      <p style="margin-top:14px;"><strong>Eksport D1</strong></p>
      <button type="button" id="exportWarehouse" class="ghost" style="width:100%;">Eksport (~2500)</button>
      <p id="exportStatus" class="hint" style="margin-top:6px;"></p>
      <p style="margin-top:14px;"><strong>Galeria sesji</strong></p>
      <div id="sessionGallery"></div>
      <p style="margin-top:14px;"><strong>Ostatni raport</strong></p>
      <pre id="latestReport" class="hint" style="max-height:160px;overflow:auto;white-space:pre-wrap;font-size:11px;">—</pre>
      <p style="margin-top:14px;"><strong>Profil operatora</strong> <span class="hint">(D1 + cache)</span></p>
      <textarea id="profileNotes" rows="4" placeholder="Notatki o marce, priorytety kampanii…"></textarea>
      <button type="button" id="saveProfile" class="ghost" style="margin-top:6px;width:100%;">Zapisz profil (D1)</button>
    </aside>
    <div class="composer-wrap">
      <label for="msg">Wiadomość</label>
      <textarea id="msg" placeholder="Brief lub pytanie…"></textarea>
      <div id="attachPreview"></div>
      <div class="row-btns" style="margin-top:8px;align-items:center;">
        <label class="hint" style="margin:0;display:flex;align-items:center;gap:6px;">
          <input type="file" id="attach" accept="image/*" style="width:auto;" /> Załącznik
        </label>
        <button type="button" id="clearAttach" class="ghost">Usuń</button>
        <button type="button" id="send" class="primary">Wyślij</button>
        <span id="status"></span>
      </div>
    </div>
  </div>
  <script>
(function(){
  var K='epir_solo_dev_chat_admin_key';
  var KS='epir_solo_dev_chat_session_id';
  var KA='epir_solo_dev_chat_agent';
  var KM='epir_solo_dev_chat_model';
  var KW='epir_operator_studio_workflow';
  var KGF='epir_operator_studio_gfile_id';
  var KPROF='epir_operator_studio_profile';
  var MAX_BYTES=4*1024*1024;
  var IMG_PLACEHOLDER='(załącznik obrazu)';
  var AGENT_MODELS=${agentModelMapJson};
  var AGENT_DEFAULTS=${agentDefaultsJson};
  var AGENT_HINTS=${agentHintsJson};
  var MODEL_HINTS=${modelHintsJson};
  var WORKFLOWS=${workflowJson};
  var PROFILE_DEFAULTS=${profileDefaultsJson};
  var RECRAFT_HINT='Recraft: obraz w czacie (nie plik .svg). *_vector = pod trace.';
  var keyEl=document.getElementById('key');
  var workflowEl=document.getElementById('workflow');
  var agentEl=document.getElementById('agent');
  var modelEl=document.getElementById('model');
  var agentHintEl=document.getElementById('agentHint');
  var modelHintEl=document.getElementById('modelHint');
  var modeBannerEl=document.getElementById('modeBanner');
  var sourcesHintEl=document.getElementById('sourcesHint');
  var msgEl=document.getElementById('msg');
  var threadEl=document.getElementById('thread');
  var stEl=document.getElementById('status');
  var exportStatusEl=document.getElementById('exportStatus');
  var sendBtn=document.getElementById('send');
  var exportBtn=document.getElementById('exportWarehouse');
  var attachEl=document.getElementById('attach');
  var attachPreviewEl=document.getElementById('attachPreview');
  var clearAttachBtn=document.getElementById('clearAttach');
  var newChatBtn=document.getElementById('newChat');
  var galleryEl=document.getElementById('sessionGallery');
  var profileNotesEl=document.getElementById('profileNotes');
  var saveProfileBtn=document.getElementById('saveProfile');
  var latestReportEl=document.getElementById('latestReport');
  var gworkspaceFieldEl=document.getElementById('gworkspaceField');
  var gfileIdEl=document.getElementById('gfileId');
  var pendingImageDataUri=null;
  var sessionImages=[];

  function scrollThread(){ threadEl.scrollTop=threadEl.scrollHeight; }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

  function renderGallery(){
    if(!sessionImages.length){ galleryEl.innerHTML='<span class="hint">Brak obrazów w tej sesji.</span>'; return; }
    var h='';
    for(var i=0;i<sessionImages.length;i++){
      h+='<img src="'+escapeAttr(sessionImages[i])+'" alt="g'+i+'" title="Kliknij: pobierz" data-ix="'+i+'" />';
    }
    galleryEl.innerHTML=h;
  }

  function addSessionImage(url){
    if(!url || sessionImages.indexOf(url)>=0) return;
    sessionImages.push(url);
    renderGallery();
  }

  function downloadImage(url, idx){
    var name='epir-generated-'+(idx!=null?idx:Date.now())+'.png';
    function trigger(href){
      var a=document.createElement('a');
      a.href=href; a.download=name; a.rel='noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    if(url.indexOf('data:')===0){ trigger(url); return; }
    fetch(url).then(function(r){ return r.blob(); }).then(function(blob){
      trigger(URL.createObjectURL(blob));
    }).catch(function(){ window.open(url,'_blank'); });
  }

  function imageBlockHtml(url, idx){
    return '<div class="img-block"><img class="attach" src="'+escapeAttr(url)+'" alt="obraz" />'+
      '<div class="img-actions"><button type="button" class="ghost btn-dl" data-url="'+escapeAttr(url)+'" data-ix="'+idx+'">Pobierz</button></div></div>';
  }

  threadEl.addEventListener('click', function(e){
    var t=e.target;
    if(t.classList && t.classList.contains('btn-dl')){
      var u=t.getAttribute('data-url');
      var ix=t.getAttribute('data-ix');
      if(u) downloadImage(u, ix);
    }
    if(t.tagName==='IMG' && t.parentElement && galleryEl.contains(t)){
      var ix2=t.getAttribute('data-ix');
      if(ix2!=null && sessionImages[parseInt(ix2,10)]) downloadImage(sessionImages[parseInt(ix2,10)], ix2);
    }
  });
  galleryEl.addEventListener('click', function(e){
    if(e.target.tagName==='IMG'){
      var ix=e.target.getAttribute('data-ix');
      if(ix!=null) downloadImage(sessionImages[parseInt(ix,10)], ix);
    }
  });

  function appendBubble(role, html){
    var div=document.createElement('div');
    div.className='msg '+role;
    div.innerHTML=html;
    threadEl.appendChild(div);
    scrollThread();
    return div;
  }

  function applyWorkflow(wid, skipStore){
    var w=WORKFLOWS[wid];
    if(!w) return;
    if(w.agentId) agentEl.value=w.agentId;
    filterModelsForAgent(agentEl.value);
    if(w.modelVariant!==undefined){
      for(var m=0;m<modelEl.options.length;m++){
        if(modelEl.options[m].value===w.modelVariant && !modelEl.options[m].hidden){
          modelEl.selectedIndex=m; break;
        }
      }
    }
    modeBannerEl.textContent=w.outcomeBanner||'';
    sourcesHintEl.textContent=w.sourcesHint||'—';
    updatePickHints();
    if(!skipStore){ try{ sessionStorage.setItem(KW,wid); }catch(e){} }
  }

  function renderHistoryItem(entry){
    var role=entry.role==='user'?'user':'assistant';
    var text=entry.content||'';
    var html='';
    if(text===IMG_PLACEHOLDER) html='<em>'+escapeHtml(IMG_PLACEHOLDER)+'</em>';
    else html=escapeHtml(text);
    appendBubble(role, html);
  }

  function loadHistory(){
    var secret=keyEl.value.trim();
    if(!secret) return Promise.resolve();
    var sid=null;
    try{ sid=sessionStorage.getItem(KS); }catch(e){}
    if(!sid) return Promise.resolve();
    return fetch('/internal/solo-dev-chat/api/history',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Admin-Key':secret},
      body:JSON.stringify({session_id:sid}),
      credentials:'same-origin'
    })
    .then(function(res){ return res.json().then(function(j){ if(!res.ok) throw new Error(j.error||('HTTP '+res.status)); return j; }); })
    .then(function(j){
      threadEl.innerHTML='';
      sessionImages=[];
      renderGallery();
      var list=j.history||[];
      for(var i=0;i<list.length;i++) renderHistoryItem(list[i]);
    })
    .catch(function(e){ appendBubble('err', escapeHtml('Historia: '+String(e.message||e))); });
  }

  function clearAttachment(){
    pendingImageDataUri=null;
    attachEl.value='';
    attachPreviewEl.innerHTML='';
  }
  function setAttachmentFromFile(file){
    if(!file) return;
    if(file.size>MAX_BYTES){
      appendBubble('err', escapeHtml('Plik za duży (max 4 MB).'));
      attachEl.value='';
      return;
    }
    var reader=new FileReader();
    reader.onload=function(){
      pendingImageDataUri=reader.result;
      attachPreviewEl.innerHTML='<img src="'+pendingImageDataUri+'" alt="podgląd" />';
    };
    reader.onerror=function(){ appendBubble('err','Nie udało się odczytać pliku.'); };
    reader.readAsDataURL(file);
  }
  attachEl.onchange=function(){ var f=attachEl.files&&attachEl.files[0]; if(f) setAttachmentFromFile(f); };
  clearAttachBtn.onclick=clearAttachment;
  newChatBtn.onclick=function(){
    try{ sessionStorage.removeItem(KS); }catch(e){}
    threadEl.innerHTML='';
    sessionImages=[];
    renderGallery();
    clearAttachment();
    msgEl.value='';
    stEl.textContent='Nowa rozmowa.';
  };

  function updateGworkspaceField(){
    var show=(agentEl.value||'')==='creative_gdocs_brief';
    if(gworkspaceFieldEl) gworkspaceFieldEl.hidden=!show;
  }

  function updatePickHints(){
    var hint=AGENT_HINTS[agentEl.value]||'';
    agentHintEl.textContent=hint ? 'Agent: '+hint : '';
    var mv=modelEl.value;
    var mh=MODEL_HINTS[mv];
    if(!mh && mv.indexOf('or_recraft')===0) mh=RECRAFT_HINT;
    if(!mh && mv.indexOf('or_')===0) mh='OpenRouter tekst/multimodal.';
    modelHintEl.textContent=mh ? 'Model: '+mh : '';
    updateGworkspaceField();
  }

  function filterModelsForAgent(agentId){
    var allowed=AGENT_MODELS[agentId];
    var set=null;
    if(allowed){ set={}; for(var j=0;j<allowed.length;j++) set[allowed[j]]=true; }
    for(var k=0;k<modelEl.options.length;k++){
      modelEl.options[k].hidden = set ? !set[modelEl.options[k].value] : false;
    }
    var sel=modelEl.options[modelEl.selectedIndex];
    if(sel && sel.hidden){
      var def=AGENT_DEFAULTS[agentId];
      if(def!==undefined){
        for(var m=0;m<modelEl.options.length;m++){
          if(!modelEl.options[m].hidden && modelEl.options[m].value===def){ modelEl.selectedIndex=m; break; }
        }
      }
    }
  }

  workflowEl.onchange=function(){ applyWorkflow(workflowEl.value); };
  agentEl.onchange=function(){
    filterModelsForAgent(agentEl.value);
    updatePickHints();
    try{ sessionStorage.setItem(KA,agentEl.value); sessionStorage.setItem(KM,modelEl.value); }catch(e){}
  };
  modelEl.onchange=function(){
    updatePickHints();
    try{ sessionStorage.setItem(KM,modelEl.value); }catch(e){}
  };

  function apiHeaders(){
    return { 'Content-Type':'application/json', 'X-Admin-Key': keyEl.value.trim() };
  }
  function loadOperatorProfile(){
    var k=keyEl.value.trim();
    if(!k) return;
    fetch('/internal/solo-dev-chat/api/operator-profile',{ headers: apiHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j && j.profile){
          if(j.profile.brandNotes) profileNotesEl.value=j.profile.brandNotes;
          if(j.profile.defaultWorkflowId && WORKFLOWS[j.profile.defaultWorkflowId]) workflowEl.value=j.profile.defaultWorkflowId;
          try{ sessionStorage.setItem(KPROF, JSON.stringify(j.profile)); }catch(e){}
        }
      }).catch(function(){});
  }
  function loadLatestReport(){
    var k=keyEl.value.trim();
    if(!k || !latestReportEl) return;
    fetch('/internal/solo-dev-chat/api/operator-report/latest',{ headers: apiHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j && j.report && j.report.markdown_body){
          latestReportEl.textContent=j.report.report_date+ ' EDOG:'+j.report.edog_verdict+'\\n\\n'+j.report.markdown_body.slice(0,4000);
        } else if(latestReportEl){ latestReportEl.textContent='Brak raportu (cron 09:00 UTC).'; }
      }).catch(function(){ if(latestReportEl) latestReportEl.textContent='Nie udało się wczytać raportu.'; });
  }
  saveProfileBtn.onclick=function(){
    var k=keyEl.value.trim();
    if(!k){ exportStatusEl.textContent='Podaj klucz operatora.'; return; }
    var payload={
      brandNotes: profileNotesEl.value||'',
      defaultWorkflowId: workflowEl.value||PROFILE_DEFAULTS.defaultWorkflowId,
      campaignPriorities:''
    };
    fetch('/internal/solo-dev-chat/api/operator-profile',{
      method:'PUT', headers: apiHeaders(), body: JSON.stringify(payload)
    }).then(function(r){ return r.json(); }).then(function(){
      try{ sessionStorage.setItem(KPROF, JSON.stringify(payload)); }catch(e){}
      exportStatusEl.textContent='Profil zapisany w D1.';
    }).catch(function(){ exportStatusEl.textContent='Błąd zapisu profilu.'; });
  };

  try{ keyEl.value=sessionStorage.getItem(K)||''; }catch(e){}
  try{
    var prof=sessionStorage.getItem(KPROF);
    if(prof){
      var pj=JSON.parse(prof);
      if(pj.brandNotes) profileNotesEl.value=pj.brandNotes;
      if(pj.defaultWorkflowId && WORKFLOWS[pj.defaultWorkflowId]) workflowEl.value=pj.defaultWorkflowId;
    }
  }catch(e){}
  try{
    var sw=sessionStorage.getItem(KW);
    if(sw && WORKFLOWS[sw]) workflowEl.value=sw;
    var sa=sessionStorage.getItem(KA);
    if(sa && AGENT_MODELS[sa]){ agentEl.value=sa; filterModelsForAgent(sa); }
    var sm=sessionStorage.getItem(KM);
    if(sm){ for(var x=0;x<modelEl.options.length;x++){ if(modelEl.options[x].value===sm){ modelEl.selectedIndex=x; break; } } }
    var sg=sessionStorage.getItem(KGF);
    if(sg && gfileIdEl) gfileIdEl.value=sg;
  }catch(e){}
  applyWorkflow(workflowEl.value, true);
  updatePickHints();
  if(keyEl.value.trim()) loadHistory();

  document.getElementById('saveKey').onclick=function(){
    try{ sessionStorage.setItem(K,keyEl.value.trim()); stEl.textContent='Klucz zapisany.'; loadHistory(); loadOperatorProfile(); loadLatestReport(); }catch(e){ stEl.textContent='Brak sessionStorage.'; }
  };

  exportBtn.onclick=function(){
    var secret=keyEl.value.trim();
    if(!secret){ appendBubble('err','Brak X-Admin-Key.'); return; }
    exportBtn.disabled=true;
    exportStatusEl.textContent='Eksportuję…';
    fetch('/internal/solo-dev-chat/api/trigger-warehouse-export',{method:'POST',headers:{'X-Admin-Key':secret},credentials:'same-origin'})
      .then(function(res){ return res.json().then(function(j){ if(!res.ok) throw new Error(j.error||('HTTP '+res.status)); return j; }); })
      .then(function(j){
        var s=j.summary||{};
        exportStatusEl.textContent='Pixel: '+s.pixelExported+', msg: '+s.messagesExported+(s.partial?' (partial)':'');
      })
      .catch(function(e){ exportStatusEl.textContent=''; appendBubble('err', escapeHtml(String(e.message||e))); })
      .finally(function(){ exportBtn.disabled=false; });
  };

  function sendMessage(){
    var secret=keyEl.value.trim();
    if(!secret){ appendBubble('err','Brak X-Admin-Key.'); return; }
    var text=(msgEl.value||'').trim();
    var img=pendingImageDataUri;
    if(!text && !img){ appendBubble('err','Pusta wiadomość.'); return; }

    var w=WORKFLOWS[workflowEl.value];
    var suffix=(w&&w.promptSuffix)?('\\n\\n'+w.promptSuffix):'';
    var gfile=(gfileIdEl&&gfileIdEl.value||'').trim();
    if(gfile){
      try{ sessionStorage.setItem(KGF,gfile); }catch(e){}
      suffix+='\\n\\nGoogle file ID: '+gfile;
    }
    var fullText=text ? (text+suffix) : (suffix?suffix.replace(/^\\n\\n/,''):'');

    var userHtml='';
    if(img) userHtml+=imageBlockHtml(img, 'u');
    if(text) userHtml+=(userHtml?'<br/>':'')+escapeHtml(text);
    else if(img) userHtml+='<em>'+escapeHtml(IMG_PLACEHOLDER)+'</em>';
    appendBubble('user', userHtml);
    var assistantEl=appendBubble('assistant','');

    sendBtn.disabled=true;
    stEl.textContent='Wysyłam…';
    msgEl.value='';
    var sentImg=img;
    clearAttachment();

    var headers={ 'Content-Type':'application/json', 'Accept':'text/event-stream, application/json', 'X-Admin-Key':secret };
    var agentId=(agentEl.value||'').trim();
    if(agentId) headers['X-EPIR-AGENT-PRESET']=agentId;
    var mv=(modelEl.value||'').trim();
    if(mv) headers['X-Epir-Model-Variant']=mv;
    try{ sessionStorage.setItem(KA,agentId); sessionStorage.setItem(KM,mv); sessionStorage.setItem(KW,workflowEl.value); }catch(e){}

    var sid=null;
    try{ sid=sessionStorage.getItem(KS); }catch(e){}
    var payload={ message:fullText||'', stream:true, session_id:sid||undefined };
    if(sentImg) payload.image_base64=sentImg;

    fetch('/internal/solo-dev-chat/api/chat',{method:'POST',headers:headers,body:JSON.stringify(payload),credentials:'same-origin'})
      .then(function(res){
        if(!res.ok){ return res.text().then(function(t){ throw new Error(t||('HTTP '+res.status)); }); }
        var ct=(res.headers.get('content-type')||'');
        if(ct.indexOf('text/event-stream')===-1){
          return res.json().then(function(j){ assistantEl.textContent=JSON.stringify(j,null,2); });
        }
        var reader=res.body.getReader();
        var dec=new TextDecoder();
        var buf='';
        var acc='';
        var genImages=[];
        var streamFailed=false;
        var imgCounter=0;
        function renderAssistantBubble(){
          var html='';
          for(var gi=0;gi<genImages.length;gi++){
            html+=imageBlockHtml(genImages[gi], 'g'+imgCounter+'-'+gi);
          }
          if(acc) html+=(html?'<br/>':'')+escapeHtml(acc);
          assistantEl.innerHTML=html||'';
        }
        function processSseChunk(chunkText){
          var lines=chunkText.split(NL);
          var evtType='message';
          for(var li=0;li<lines.length;li++){
            var line=lines[li];
            if(line.indexOf('event:')===0){ evtType=line.slice(6).trim(); continue; }
            if(line.indexOf('data:')!==0) continue;
            var js=line.slice(5).trim();
            if(!js||js==='[DONE]') return;
            var o=JSON.parse(js);
            if(o.session_id){ try{ sessionStorage.setItem(KS,o.session_id);}catch(e){} }
            if(o.error || evtType==='error') throw new Error(o.error||'Błąd strumienia');
            if(o.images && o.images.length){
              for(var ii=0;ii<o.images.length;ii++){
                var iu=o.images[ii]&&o.images[ii].url;
                if(iu && genImages.indexOf(iu)<0){ genImages.push(iu); addSessionImage(iu); }
              }
            }
            if(o.delta) acc+=o.delta;
            if(o.content!==undefined) acc=o.content;
            renderAssistantBubble();
            scrollThread();
          }
        }
        var NL=String.fromCharCode(10);
        function pump(){
          return reader.read().then(function(ev){
            if(ev.done){
              if(streamFailed) return;
              renderAssistantBubble();
              if(!acc && !genImages.length){
                assistantEl.textContent='Brak treści. Sprawdź tryb pracy i model (SVG=tekst, Recraft=obraz).';
              }
              sendBtn.disabled=false;
              stEl.textContent='';
              scrollThread();
              return;
            }
            buf+=dec.decode(ev.value,{stream:true});
            var i;
            while((i=buf.indexOf(NL+NL))!==-1){
              var chunk=buf.slice(0,i); buf=buf.slice(i+2);
              try{ processSseChunk(chunk); }
              catch(e){
                if(e instanceof SyntaxError) continue;
                streamFailed=true;
                throw e;
              }
            }
            return pump();
          });
        }
        return pump();
      })
      .catch(function(e){
        assistantEl.className='msg err';
        assistantEl.textContent=String(e.message||e);
        sendBtn.disabled=false;
        stEl.textContent='';
      });
  }

  sendBtn.onclick=sendMessage;
  msgEl.addEventListener('keydown', function(e){
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  });
})();
  </script>
</body>
</html>`;
}

export function buildSoloDevChatHtml(): string {
  return buildStudioHtml({
    pageTitle: 'EPIR — Dev-asystent (prywatny)',
    heading: 'EPIR — Operator Studio (Project B)',
  });
}

export function buildOperatorStudioHtml(): string {
  return buildStudioHtml({
    pageTitle: 'EPIR — Operator Studio',
    heading: 'EPIR — Operator Studio (Project B)',
  });
}
