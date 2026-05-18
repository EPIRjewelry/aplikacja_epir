/**
 * Jednoużytkowy UI: Dev-asystent (`internal-dashboard`) — Project B.
 * Auth: nagłówek `X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET` (jak `/admin/api/leads`).
 * Model: `X-Epir-Model-Variant` (default = Groq GPT-OSS-120B; alternatywy Workers AI wg `model-params.ts`).
 */
export const SOLO_DEV_CHAT_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EPIR — Dev-asystent (prywatny)</title>
  <style>
    :root { --bg:#0b1220; --card:#151d2e; --b:#243044; --tx:#e8eef8; --m:#94a3b8; --a:#38bdf8; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--tx); min-height:100vh; }
    .wrap { max-width:880px; margin:0 auto; padding:20px; }
    h1 { font-weight:600; font-size:1.15rem; margin:0 0 6px; }
    p.sub { color:var(--m); font-size:.85rem; margin:0 0 16px; line-height:1.45; }
    .row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; align-items:center; }
    label { font-size:.8rem; color:var(--m); }
    input, select, textarea, button {
      background:var(--card); border:1px solid var(--b); color:var(--tx); border-radius:8px; padding:10px 12px; font-size:.9rem;
    }
    input#key { flex:1; min-width:200px; }
    textarea#msg { width:100%; min-height:100px; resize:vertical; }
    button#send { background:var(--a); color:#042; font-weight:600; border:none; cursor:pointer; }
    button#send:disabled { opacity:.45; cursor:not-allowed; }
    #log { white-space:pre-wrap; background:var(--card); border:1px solid var(--b); border-radius:10px; padding:14px; min-height:200px; font-size:.88rem; line-height:1.5; }
    .err { color:#f87171; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>EPIR — agent wewnętrzny (analityka / kampanie)</h1>
    <p class="sub">Wklej <strong>ten sam token</strong>, którego używasz do panelu operatora (<code>EPIR_OPERATOR_PANEL_SECRET</code>).
      Zapisuje się tylko w <code>sessionStorage</code> tej przeglądarki. W produkcji chronij host <strong>Cloudflare Access</strong> lub VPN — wtedy sekret zostaje tylko w Cloudflare Secrets, a dostęp do strony mają tylko uprawnieni.</p>
    <div class="row">
      <label for="key">X-Admin-Key</label>
      <input id="key" type="password" autocomplete="off" placeholder="sekret operatora" />
      <button type="button" id="saveKey">Zapisz w tej przeglądarce</button>
    </div>
    <div class="row">
      <label for="model">Model (<code>X-Epir-Model-Variant</code>)</label>
      <select id="model">
        <option value="">default — GPT-OSS-120B (Groq / AI Gateway)</option>
        <option value="kimi_k25">kimi_k25 — Kimi K2.5 (Workers AI)</option>
        <option value="k26">k26 — Kimi K2.6</option>
        <option value="glm_flash">glm_flash — GLM-4.7-flash</option>
        <option value="qwen3_30b_a3b">qwen3_30b_a3b — Qwen3 MoE</option>
        <option value="gemma4_26b">gemma4_26b — Gemma 4 26B</option>
        <option value="scout_17b">scout_17b — alias GPT-OSS-120B</option>
      </select>
    </div>
    <div class="row" style="flex-direction:column; align-items:stretch;">
      <label for="msg">Wiadomość</label>
      <textarea id="msg" placeholder="Np. opisz ingress S2S dla Hydrogen…"></textarea>
    </div>
    <div class="row">
      <button id="send">Wyślij (stream SSE)</button>
      <span id="status" class="sub" style="margin:0;"></span>
    </div>
    <p class="sub">Odpowiedź:</p>
    <div id="log"></div>
  </div>
  <script>
(function(){
  var K='epir_solo_dev_chat_admin_key';
  var keyEl=document.getElementById('key');
  var modelEl=document.getElementById('model');
  var msgEl=document.getElementById('msg');
  var logEl=document.getElementById('log');
  var stEl=document.getElementById('status');
  var sendBtn=document.getElementById('send');
  try { keyEl.value=sessionStorage.getItem(K)||''; } catch(e){}
  document.getElementById('saveKey').onclick=function(){
    try { sessionStorage.setItem(K,keyEl.value.trim()); stEl.textContent='Zapisano.'; } catch(e){ stEl.textContent='Brak sessionStorage.'; }
  };
  sendBtn.onclick=function(){
    var secret=keyEl.value.trim();
    if(!secret){ logEl.innerHTML='<span class="err">Brak X-Admin-Key.</span>'; return; }
    var text=(msgEl.value||'').trim();
    if(!text){ logEl.innerHTML='<span class="err">Pusta wiadomość.</span>'; return; }
    sendBtn.disabled=true;
    stEl.textContent='Wysyłam…';
    logEl.textContent='';
    var headers={ 'Content-Type':'application/json', 'Accept':'text/event-stream, application/json', 'X-Admin-Key':secret };
    var mv=(modelEl.value||'').trim();
    if(mv) headers['X-Epir-Model-Variant']=mv;
    var sid=null;
    try { sid=sessionStorage.getItem('epir_solo_dev_chat_session_id'); } catch(e){}
    var body=JSON.stringify({ message:text, stream:true, session_id:sid||undefined });
    fetch('/internal/solo-dev-chat/api/chat',{method:'POST',headers:headers,body:body,credentials:'same-origin'})
      .then(function(res){
        if(!res.ok){ return res.text().then(function(t){ throw new Error(t||('HTTP '+res.status)); }); }
        var ct=(res.headers.get('content-type')||'');
        if(ct.indexOf('text/event-stream')===-1){ return res.json().then(function(j){ logEl.textContent=JSON.stringify(j,null,2); }); }
        var reader=res.body.getReader();
        var dec=new TextDecoder();
        var buf='';
        var acc='';
        var NL=String.fromCharCode(10);
        function pump(){
          return reader.read().then(function(ev){
            if(ev.done){ logEl.textContent=acc||'(koniec)'; sendBtn.disabled=false; stEl.textContent=''; return; }
            buf+=dec.decode(ev.value,{stream:true});
            var i;
            while((i=buf.indexOf(NL+NL))!==-1){
              var chunk=buf.slice(0,i); buf=buf.slice(i+2);
              chunk.split(NL).filter(function(l){return l.indexOf('data:')===0;}).forEach(function(line){
                var js=line.slice(5).trim();
                if(!js||js==='[DONE]') return;
                try{
                  var o=JSON.parse(js);
                  if(o.session_id){ try{ sessionStorage.setItem('epir_solo_dev_chat_session_id',o.session_id);}catch(e){} }
                  if(o.error) throw new Error(o.error);
                  if(o.delta) acc+=o.delta;
                  if(o.content!==undefined) acc=o.content;
                  logEl.textContent=acc;
                }catch(e){ if(e instanceof SyntaxError) return; throw e; }
              });
            }
            return pump();
          });
        }
        return pump();
      })
      .catch(function(e){ logEl.innerHTML='<span class="err">'+String(e.message||e)+'</span>'; sendBtn.disabled=false; stEl.textContent=''; });
  };
})();
  </script>
</body>
</html>
`;
