/**
 * Jednoużytkowy UI: Dev-asystent (`internal-dashboard`) — Project B.
 * Auth: `X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET`.
 * Agent: `X-EPIR-AGENT-PRESET` | Model: `X-Epir-Model-Variant` | Załącznik: `image_base64`.
 */
import {
  buildSoloDevAgentSelectHtml,
  buildSoloDevModelSelectHtml,
  soloDevAgentDefaultsJson,
  soloDevAgentModelMapJson,
} from './solo-dev-agent-presets';

const AGENT_OPTIONS = buildSoloDevAgentSelectHtml();
const MODEL_OPTIONS = buildSoloDevModelSelectHtml();
const AGENT_MODEL_MAP_JSON = soloDevAgentModelMapJson();
const AGENT_DEFAULTS_JSON = soloDevAgentDefaultsJson();

export const SOLO_DEV_CHAT_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EPIR — Dev-asystent (prywatny)</title>
  <style>
    :root { --bg:#0b1220; --card:#151d2e; --b:#243044; --tx:#e8eef8; --m:#94a3b8; --a:#38bdf8; --user:#1e3a5f; --asst:#1a2838; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--tx); min-height:100vh; }
    .wrap { max-width:960px; margin:0 auto; padding:20px; display:flex; flex-direction:column; min-height:100vh; }
    h1 { font-weight:600; font-size:1.15rem; margin:0 0 6px; }
    p.sub { color:var(--m); font-size:.85rem; margin:0 0 12px; line-height:1.45; }
    .row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; align-items:center; }
    .row-pick { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
    @media (max-width:640px) { .row-pick { grid-template-columns:1fr; } }
    label { font-size:.8rem; color:var(--m); display:block; margin-bottom:4px; }
    input, select, textarea, button {
      background:var(--card); border:1px solid var(--b); color:var(--tx); border-radius:8px; padding:10px 12px; font-size:.9rem;
    }
    select { width:100%; }
    input#key { flex:1; min-width:200px; }
    #thread {
      flex:1; min-height:200px; max-height:60vh; overflow-y:auto; margin:12px 0;
      border:1px solid var(--b); border-radius:10px; background:var(--card); padding:12px;
    }
    .msg { margin-bottom:12px; padding:10px 12px; border-radius:10px; font-size:.88rem; line-height:1.5; max-width:92%; }
    .msg.user { background:var(--user); margin-left:auto; white-space:pre-wrap; }
    .msg.assistant { background:var(--asst); margin-right:auto; white-space:pre-wrap; }
    .msg.err { background:#3f1d1d; color:#f87171; max-width:100%; }
    .msg img.attach { max-width:100%; max-height:220px; border-radius:6px; margin-bottom:8px; display:block; }
    .composer { border-top:1px solid var(--b); padding-top:12px; }
    textarea#msg { width:100%; min-height:88px; resize:vertical; }
    .composer-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px; }
    button#send { background:var(--a); color:#042; font-weight:600; border:none; cursor:pointer; }
    button#send:disabled { opacity:.45; cursor:not-allowed; }
    #attachPreview { margin-top:8px; }
    #attachPreview img { max-height:120px; border-radius:6px; border:1px solid var(--b); }
    .err { color:#f87171; }
    .hint { font-size:.75rem; color:var(--m); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>EPIR — agent wewnętrzny (analityka / projektowanie)</h1>
    <p class="sub">Token operatora, agent, model. <strong>Enter</strong> — wyślij, <strong>Shift+Enter</strong> — nowa linia. Jedna grafika na wiadomość (max 4 MB).</p>
    <div class="row">
      <label for="key">X-Admin-Key</label>
      <input id="key" type="password" autocomplete="off" placeholder="sekret operatora" />
      <button type="button" id="saveKey">Zapisz w tej przeglądarce</button>
      <button type="button" id="newChat">Nowa rozmowa</button>
    </div>
    <div class="row-pick">
      <div>
        <label for="agent">Agent (<code>X-EPIR-AGENT-PRESET</code>)</label>
        <select id="agent">${AGENT_OPTIONS}</select>
      </div>
      <div>
        <label for="model">Model (<code>X-Epir-Model-Variant</code>)</label>
        <select id="model">${MODEL_OPTIONS}</select>
      </div>
    </div>
    <div id="thread" aria-live="polite"></div>
    <div class="composer">
      <label for="msg">Wiadomość</label>
      <textarea id="msg" placeholder="Np. opisz kierunek packshotu lub SVG do Blendera…"></textarea>
      <p class="hint">Enter — wyślij · Shift+Enter — nowa linia</p>
      <div id="attachPreview"></div>
      <div class="composer-actions">
        <label class="hint" style="margin:0;">
          <input type="file" id="attach" accept="image/*" style="max-width:220px;" /> Załącz obraz
        </label>
        <button type="button" id="clearAttach">Usuń załącznik</button>
        <button id="send">Wyślij</button>
        <button type="button" id="exportWarehouse">Eksport D1→Pipelines (~2500)</button>
        <span id="status" class="sub" style="margin:0;"></span>
      </div>
    </div>
  </div>
  <script>
(function(){
  var K='epir_solo_dev_chat_admin_key';
  var KS='epir_solo_dev_chat_session_id';
  var KA='epir_solo_dev_chat_agent';
  var KM='epir_solo_dev_chat_model';
  var MAX_BYTES=4*1024*1024;
  var IMG_PLACEHOLDER='(załącznik obrazu)';
  var AGENT_MODELS=${AGENT_MODEL_MAP_JSON};
  var AGENT_DEFAULTS=${AGENT_DEFAULTS_JSON};
  var keyEl=document.getElementById('key');
  var agentEl=document.getElementById('agent');
  var modelEl=document.getElementById('model');
  var msgEl=document.getElementById('msg');
  var threadEl=document.getElementById('thread');
  var stEl=document.getElementById('status');
  var sendBtn=document.getElementById('send');
  var exportBtn=document.getElementById('exportWarehouse');
  var attachEl=document.getElementById('attach');
  var attachPreviewEl=document.getElementById('attachPreview');
  var clearAttachBtn=document.getElementById('clearAttach');
  var newChatBtn=document.getElementById('newChat');
  var pendingImageDataUri=null;

  function scrollThread(){ threadEl.scrollTop=threadEl.scrollHeight; }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function appendBubble(role, html){
    var div=document.createElement('div');
    div.className='msg '+role;
    div.innerHTML=html;
    threadEl.appendChild(div);
    scrollThread();
    return div;
  }
  function renderHistoryItem(entry){
    var role=entry.role==='user'?'user':'assistant';
    var text=entry.content||'';
    var html='';
    if(text===IMG_PLACEHOLDER){
      html='<em>'+escapeHtml(IMG_PLACEHOLDER)+'</em>';
    } else {
      html=escapeHtml(text);
    }
    appendBubble(role, html);
  }
  function loadHistory(){
    var secret=keyEl.value.trim();
    if(!secret) return Promise.resolve();
    var sid=null;
    try { sid=sessionStorage.getItem(KS); } catch(e){}
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
    reader.onerror=function(){ appendBubble('err', 'Nie udało się odczytać pliku.'); };
    reader.readAsDataURL(file);
  }
  attachEl.onchange=function(){ var f=attachEl.files&&attachEl.files[0]; if(f) setAttachmentFromFile(f); };
  clearAttachBtn.onclick=clearAttachment;
  newChatBtn.onclick=function(){
    try { sessionStorage.removeItem(KS); } catch(e){}
    threadEl.innerHTML='';
    clearAttachment();
    msgEl.value='';
    stEl.textContent='Nowa rozmowa — następna wiadomość utworzy sesję.';
  };

  function filterModelsForAgent(agentId){
    var allowed=AGENT_MODELS[agentId];
    var set=null;
    if(allowed){ set={}; for(var j=0;j<allowed.length;j++){ set[allowed[j]]=true; } }
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

  try { keyEl.value=sessionStorage.getItem(K)||''; } catch(e){}
  try {
    var sa=sessionStorage.getItem(KA);
    if(sa && AGENT_MODELS[sa]){ agentEl.value=sa; filterModelsForAgent(sa); }
    var sm=sessionStorage.getItem(KM);
    if(sm){ for(var x=0;x<modelEl.options.length;x++){ if(modelEl.options[x].value===sm){ modelEl.selectedIndex=x; break; } } }
  } catch(e){}
  if(keyEl.value.trim()) loadHistory();

  agentEl.onchange=function(){
    filterModelsForAgent(agentEl.value);
    try { sessionStorage.setItem(KA, agentEl.value); sessionStorage.setItem(KM, modelEl.value); } catch(e){}
  };
  modelEl.onchange=function(){ try { sessionStorage.setItem(KM, modelEl.value); } catch(e){} };
  document.getElementById('saveKey').onclick=function(){
    try { sessionStorage.setItem(K,keyEl.value.trim()); stEl.textContent='Zapisano.'; loadHistory(); } catch(e){ stEl.textContent='Brak sessionStorage.'; }
  };

  exportBtn.onclick=function(){
    var secret=keyEl.value.trim();
    if(!secret){ appendBubble('err','Brak X-Admin-Key.'); return; }
    exportBtn.disabled=true;
    stEl.textContent='Eksportuję…';
    fetch('/internal/solo-dev-chat/api/trigger-warehouse-export',{method:'POST',headers:{'X-Admin-Key':secret},credentials:'same-origin'})
      .then(function(res){ return res.json().then(function(j){ if(!res.ok) throw new Error(j.error||('HTTP '+res.status)); return j; }); })
      .then(function(j){
        var s=j.summary||{};
        var msg='Pixel: '+s.pixelExported+', messages: '+s.messagesExported+', watermark: '+s.last_pixel_export_at;
        if(s.partial) msg+=' — zostało ~'+s.pending_pixel_after+' wierszy (kliknij ponownie).';
        if(s.pipeline_error) msg+=' BŁĄD: '+s.pipeline_error;
        stEl.textContent=msg;
      })
      .catch(function(e){ stEl.textContent=''; appendBubble('err', escapeHtml(String(e.message||e))); })
      .finally(function(){ exportBtn.disabled=false; });
  };

  function sendMessage(){
    var secret=keyEl.value.trim();
    if(!secret){ appendBubble('err','Brak X-Admin-Key.'); return; }
    var text=(msgEl.value||'').trim();
    var img=pendingImageDataUri;
    if(!text && !img){ appendBubble('err','Pusta wiadomość — wpisz tekst lub dołącz obraz.'); return; }

    var userHtml='';
    if(img) userHtml+='<img class="attach" src="'+img+'" alt="załącznik" />';
    if(text) userHtml+=(userHtml?'<br/>':'')+escapeHtml(text);
    else if(img) userHtml+='<em>'+escapeHtml(IMG_PLACEHOLDER)+'</em>';
    appendBubble('user', userHtml);
    var assistantEl=appendBubble('assistant', '');

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
    try { sessionStorage.setItem(KA, agentId); sessionStorage.setItem(KM, mv); } catch(e){}

    var sid=null;
    try { sid=sessionStorage.getItem(KS); } catch(e){}
    var payload={ message:text||'', stream:true, session_id:sid||undefined };
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
        var NL=String.fromCharCode(10);
        function pump(){
          return reader.read().then(function(ev){
            if(ev.done){
              assistantEl.textContent=acc||'(koniec)';
              sendBtn.disabled=false;
              stEl.textContent='';
              scrollThread();
              return;
            }
            buf+=dec.decode(ev.value,{stream:true});
            var i;
            while((i=buf.indexOf(NL+NL))!==-1){
              var chunk=buf.slice(0,i); buf=buf.slice(i+2);
              chunk.split(NL).filter(function(l){return l.indexOf('data:')===0;}).forEach(function(line){
                var js=line.slice(5).trim();
                if(!js||js==='[DONE]') return;
                try{
                  var o=JSON.parse(js);
                  if(o.session_id){ try{ sessionStorage.setItem(KS,o.session_id);}catch(e){} }
                  if(o.error) throw new Error(o.error);
                  if(o.delta) acc+=o.delta;
                  if(o.content!==undefined) acc=o.content;
                  assistantEl.textContent=acc;
                  scrollThread();
                }catch(e){ if(e instanceof SyntaxError) return; throw e; }
              });
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
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });
})();
  </script>
</body>
</html>
`;
