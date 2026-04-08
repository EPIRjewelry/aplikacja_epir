(function(){
  if(window.__EPIR_ASSISTANT_RUNTIME_LOADED__||window.__EPIR_ASSISTANT_RUNTIME_LOADING__)return;
  window.__EPIR_ASSISTANT_RUNTIME_LOADING__=true;
  var src='';
  if(document.currentScript&&document.currentScript.src)src=document.currentScript.src;
  if(!src){
    var scripts=document.scripts||[];
    for(var i=scripts.length-1;i>=0;i--){
      var candidate=scripts[i]&&scripts[i].src||'';
      if(/\/assistant\.js(?:\?|$)/.test(candidate)){src=candidate;break;}
    }
  }
  if(!src&&typeof document!=='undefined'&&document.querySelector){
    var el=document.querySelector('script[src*="assistant.js"]');
    if(el&&el.src)src=el.src;
  }
  if(!src){
    window.__EPIR_ASSISTANT_RUNTIME_LOADING__=false;
    console.error('[EPIR Assistant] Nie znaleziono źródła assistant.js');
    return;
  }
  var runtimeSrc=src.replace(/assistant\.js(\?|$)/,'assistant-runtime.js$1');
  var runtime=document.createElement('script');
  runtime.src=runtimeSrc;
  runtime.defer=true;
  runtime.onload=function(){window.__EPIR_ASSISTANT_RUNTIME_LOADING__=false;};
  runtime.onerror=function(){
    window.__EPIR_ASSISTANT_RUNTIME_LOADING__=false;
    console.error('[EPIR Assistant] Nie udało się załadować assistant-runtime.js');
  };
  (document.head||document.documentElement).appendChild(runtime);
})();
