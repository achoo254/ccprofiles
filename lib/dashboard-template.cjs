#!/usr/bin/env node
'use strict';

/**
 * dashboard-template.cjs — Single-page HTML dashboard
 *
 * Returns complete HTML string with inline CSS + JS.
 * No external CDN/assets. Dark/light theme via prefers-color-scheme.
 */

/**
 * Generate full HTML page for dashboard.
 * @param {string} token - Security token injected into client JS
 */
function generateHTML(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ccprofiles dashboard</title>
<style>${getCSS()}</style>
</head>
<body>
<header>
  <h1>ccprofiles dashboard</h1>
  <button class="btn btn-primary" onclick="handleSave()">Save Current</button>
</header>
<div id="grid"></div>
<div id="toasts"></div>
<script>${getJS(token)}</script>
</body>
</html>`;
}

function getCSS() {
  return `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--text2:#6e6e73;--accent:#0071e3;--accent-hover:#0077ED;--danger:#ff3b30;--danger-hover:#e0342b;--border:#d2d2d7;--toast-bg:#1d1d1f;--toast-text:#f5f5f7;--shadow:0 2px 8px rgba(0,0,0,.08);--radius:12px}
@media(prefers-color-scheme:dark){:root{--bg:#1d1d1f;--card:#2c2c2e;--text:#f5f5f7;--text2:#98989d;--accent:#0a84ff;--accent-hover:#409cff;--danger:#ff453a;--danger-hover:#ff6961;--border:#38383a;--toast-bg:#f5f5f7;--toast-text:#1d1d1f;--shadow:0 2px 8px rgba(0,0,0,.3)}}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:24px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
h1{font-size:1.4rem;font-weight:600}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);transition:border-color .2s}
.card.active{border-color:var(--accent);border-width:2px}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.card-name{font-size:1.1rem;font-weight:600}
.badge{font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:500}
.badge-active{background:var(--accent);color:#fff}
.badge-sub{background:var(--border);color:var(--text2)}
.card-email{color:var(--text2);font-size:.85rem;margin-bottom:4px}
.card-saved{color:var(--text2);font-size:.75rem;margin-bottom:12px}
.card-status{font-size:.85rem;margin-bottom:16px;min-height:1.2em}
.status-valid{color:#34c759}
.status-invalid{color:var(--danger)}
.status-checking{color:var(--text2);font-style:italic}
.status-unknown{color:var(--text2)}
.card-actions{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:none;padding:8px 16px;border-radius:8px;font-size:.85rem;font-weight:500;cursor:pointer;transition:background .2s,opacity .2s}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover:not(:disabled){background:var(--accent-hover)}
.btn-secondary{background:var(--border);color:var(--text)}
.btn-secondary:hover:not(:disabled){background:var(--text2);color:#fff}
.btn-danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
.btn-danger:hover:not(:disabled){background:var(--danger);color:#fff}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:4px}
@keyframes spin{to{transform:rotate(360deg)}}
#toasts{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:1000}
.toast{padding:12px 20px;border-radius:8px;background:var(--toast-bg);color:var(--toast-text);font-size:.85rem;box-shadow:0 4px 12px rgba(0,0,0,.15);animation:fadeIn .3s ease}
.toast-error{background:var(--danger);color:#fff}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeOut{from{opacity:1}to{opacity:0}}
.empty{text-align:center;color:var(--text2);padding:48px 20px;grid-column:1/-1}
.empty p{margin-bottom:8px}
`;
}

function getJS(token) {
  // Escape token for safe JS injection
  const safeToken = token.replace(/[^a-f0-9]/g, '');
  return `
'use strict';
const TOKEN='${safeToken}';
const BASE=location.origin;
let ws=null;let wsRetries=0;const MAX_RETRIES=3;

async function api(method,path,body){
  const url=BASE+path+(path.includes('?')?'&':'?')+'token='+TOKEN;
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(url,opts);
  return r.json();
}

function connectWS(){
  if(ws&&ws.readyState<2)return;
  const url='ws://'+location.host+'/ws?token='+TOKEN;
  ws=new WebSocket(url);
  ws.onopen=()=>{wsRetries=0};
  ws.onmessage=(e)=>{
    try{const msg=JSON.parse(e.data);handleWS(msg)}catch{}
  };
  ws.onclose=()=>{
    if(wsRetries<MAX_RETRIES){wsRetries++;setTimeout(connectWS,1000*wsRetries)}
  };
}

function escAttr(s){return (s||'').replace(/\\\\/g,'\\\\\\\\').replace(/"/g,'\\\\"')}
function findCard(name){return document.querySelector('[data-name="'+CSS.escape(name)+'"]')}

function handleWS(msg){
  if(msg.type==='check-result'){
    const card=findCard(msg.name);
    if(!card)return;
    const st=card.querySelector('.card-status');
    if(msg.valid){
      st.className='card-status status-valid';
      st.textContent='\\u2713 valid \\u2014 '+msg.email+' ['+msg.subscriptionType+']';
    }else{
      st.className='card-status status-invalid';
      st.textContent='\\u2717 invalid or expired';
    }
    enableCardButtons(card);
  }else if(msg.type==='profile-changed'){
    loadProfiles();
    const label=msg.action==='delete'?'Deleted':msg.action==='switch'?'Switched to':'Saved';
    showToast(label+' "'+msg.name+'"');
  }else if(msg.type==='error'){
    showToast(msg.message,'error');
  }
}

function enableCardButtons(card){
  card.querySelectorAll('.btn').forEach(b=>b.disabled=false);
}

async function loadProfiles(){
  const r=await api('GET','/api/profiles');
  if(!r.ok)return showToast(r.error,'error');
  renderProfiles(r.data);
}

function renderProfiles(profiles){
  const grid=document.getElementById('grid');
  if(!profiles.length){
    grid.innerHTML='<div class="empty"><p>No profiles found.</p><p>Use <strong>Save Current</strong> or run <code>ccprofiles save &lt;name&gt;</code></p></div>';
    return;
  }
  grid.innerHTML=profiles.map(renderCard).join('');
}

function renderCard(p){
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const n=esc(p.name);
  const isActive=p.active;
  const saved=p.savedAt?new Date(p.savedAt).toLocaleString():'';
  return '<div class="card'+(isActive?' active':'')+'" data-name="'+n+'">'
    +'<div class="card-header"><span class="card-name">'+n+'</span>'
    +(isActive?'<span class="badge badge-active">active</span>':'<span class="badge badge-sub">'+esc(p.subscriptionType)+'</span>')
    +'</div>'
    +'<div class="card-email">'+esc(p.email)+'</div>'
    +(isActive?'<div class="card-email"><span class="badge badge-sub">'+esc(p.subscriptionType)+'</span></div>':'')
    +'<div class="card-saved">'+saved+'</div>'
    +'<div class="card-status status-unknown">? unknown</div>'
    +'<div class="card-actions">'
    +(!isActive?'<button class="btn btn-primary" onclick="handleSwitch(\\''+n+'\\')">Switch</button>':'')
    +'<button class="btn btn-secondary" onclick="handleCheck(\\''+n+'\\')">Check</button>'
    +'<button class="btn btn-danger" onclick="handleDelete(\\''+n+'\\')">Delete</button>'
    +'</div></div>';
}

async function handleSwitch(name){
  const r=await api('POST','/api/switch/'+encodeURIComponent(name));
  if(!r.ok)showToast(r.error,'error');
  else{showToast('Switched to "'+name+'"');loadProfiles()}
}

async function handleDelete(name){
  if(!confirm('Delete profile "'+name+'"?'))return;
  const r=await api('DELETE','/api/delete/'+encodeURIComponent(name));
  if(!r.ok)showToast(r.error,'error');
  else{showToast('Deleted "'+name+'"');loadProfiles()}
}

function handleCheck(name){
  const card=document.querySelector('[data-name="'+name+'"]');
  if(card){
    const st=card.querySelector('.card-status');
    st.className='card-status status-checking';
    st.innerHTML='<span class="spinner"></span>checking...';
    card.querySelectorAll('.btn').forEach(b=>b.disabled=true);
    card.querySelector('.btn-danger').disabled=false;
  }
  api('GET','/api/check/'+encodeURIComponent(name));
}

async function handleSave(){
  const name=prompt('Profile name (leave blank for auto-detect):');
  if(name===null)return;
  const r=await api('POST','/api/save',{name:name||undefined});
  if(!r.ok)showToast(r.error,'error');
  else{showToast('Saved "'+r.data.name+'"');loadProfiles()}
}

function showToast(msg,type){
  const el=document.createElement('div');
  el.className='toast'+(type==='error'?' toast-error':'');
  el.textContent=msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>{el.style.animation='fadeOut .3s ease forwards';setTimeout(()=>el.remove(),300)},3000);
}

loadProfiles();
connectWS();
`;
}

module.exports = { generateHTML };
