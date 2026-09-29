import { qrImageUrl } from "./qrcode.js";

const SWA_BROWSER_CDN = "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@14.0.0/dist/bundle/index.umd.min.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

const styles = `
  :root { color-scheme: light; --bg:#f7f8f7; --surface:#fff; --ink:#182923; --muted:#61736a; --line:#dce5df; --accent:#176b4d; --accent-hover:#10553c; --soft:#eaf4ed; --danger:#9d3b32; }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  button,input,select { font:inherit; }
  button,a { -webkit-tap-highlight-color:transparent; }
  button { cursor:pointer; }
  a { color:var(--accent); }
  a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible { outline:3px solid #83c7a2; outline-offset:2px; }
  h1,h2,h3,p { margin-top:0; }
  h1 { font-size:clamp(2rem,4vw,3.2rem); line-height:1.12; letter-spacing:-.045em; margin-bottom:.65rem; }
  h2 { font-size:1.35rem; line-height:1.25; letter-spacing:-.025em; margin-bottom:.45rem; }
  h3 { font-size:1.08rem; margin-bottom:.15rem; }
  p { color:var(--muted); }
  .container { width:min(100% - 2rem,1080px); margin-inline:auto; }
  .site-header { border-bottom:1px solid var(--line); background:var(--surface); }
  .header-inner { min-height:72px; display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .brand { display:inline-flex; align-items:center; gap:.65rem; color:var(--ink); font-weight:750; letter-spacing:-.02em; text-decoration:none; white-space:nowrap; }
  .brand-mark { display:grid; place-items:center; width:34px; height:34px; border-radius:9px; background:var(--accent); color:#fff; font-size:.82rem; letter-spacing:-.07em; }
  .header-actions { display:flex; align-items:center; justify-content:flex-end; gap:.7rem; flex-wrap:wrap; }
  .account { color:var(--muted); font-size:.9rem; }
  .account strong { color:var(--ink); }
  main { padding:clamp(1.5rem,4vw,3.2rem) 0 4rem; }
  .intro { margin-bottom:1.75rem; }
  .intro p { max-width:650px; margin-bottom:0; }
  .eyebrow { color:var(--accent); font-size:.78rem; font-weight:750; text-transform:uppercase; letter-spacing:.12em; margin-bottom:.5rem; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:clamp(1.15rem,2.6vw,2rem); box-shadow:0 3px 20px rgba(16,47,29,.035); }
  .card + .card { margin-top:1rem; }
  .card-heading { margin-bottom:1.5rem; }
  .card-heading p { margin:0; }
  .auth-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.85fr); gap:1rem; align-items:start; }
  .field { display:block; min-width:0; margin-bottom:1rem; }
  .field-label { display:block; font-size:.9rem; font-weight:650; margin-bottom:.4rem; }
  .field-hint { display:block; color:var(--muted); font-size:.82rem; margin-top:.35rem; }
  input,select { display:block; width:100%; min-width:0; min-height:46px; padding:.7rem .85rem; border:1px solid #bfcfc3; border-radius:10px; background:#fff; color:var(--ink); }
  input::placeholder { color:#84938a; }
  input:focus,select:focus { border-color:var(--accent); }
  .btn { min-height:44px; display:inline-flex; align-items:center; justify-content:center; gap:.35rem; padding:.65rem 1rem; border:1px solid var(--accent); border-radius:10px; background:var(--accent); color:#fff; font-weight:650; text-decoration:none; line-height:1.2; text-align:center; }
  .btn:hover { background:var(--accent-hover); border-color:var(--accent-hover); color:#fff; }
  .btn-secondary { background:#fff; border-color:var(--line); color:var(--ink); }
  .btn-secondary:hover { background:var(--soft); border-color:#b8d6c1; color:var(--ink); }
  .btn-text { background:transparent; border-color:transparent; color:var(--accent); padding-inline:.6rem; }
  .btn-text:hover { background:var(--soft); border-color:transparent; color:var(--accent); }
  .btn-small { min-height:40px; padding:.55rem .8rem; font-size:.88rem; }
  .btn-block { width:100%; }
  .button-row { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }
  .muted { color:var(--muted); }
  .small { font-size:.86rem; }
  .divider { height:1px; background:var(--line); margin:1.5rem 0; }
  .static-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(190px,.78fr); gap:clamp(1rem,3vw,2rem); align-items:start; }
  .static-result { min-height:236px; border:1px dashed #c5d6c9; border-radius:14px; background:#fbfdfb; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.9rem; padding:1rem; text-align:center; }
  .static-result img { display:block; width:min(100%,190px); height:auto; aspect-ratio:1; border:1px solid var(--line); border-radius:8px; }
  .static-result p { font-size:.88rem; margin:0; }
  [hidden] { display:none !important; }
  .tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:min(100%,390px); background:#e9efeb; padding:4px; border-radius:12px; margin:0 auto 1.5rem; }
  .tab { min-height:44px; border:0; border-radius:9px; background:transparent; color:var(--muted); font-weight:650; }
  .tab[aria-selected="true"] { background:#fff; color:var(--ink); box-shadow:0 1px 4px rgba(20,40,28,.1); }
  .section-head { display:flex; align-items:end; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
  .section-head p { margin:0; }
  .new-url-field { max-width:680px; }
  .url-row { display:flex; align-items:stretch; gap:.5rem; }
  .url-row input { flex:1; }
  .url-row .btn { flex:none; }
  .code-list { display:grid; gap:1rem; margin-top:1.5rem; }
  .code-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1rem 1.5rem; align-items:start; }
  .code-main { min-width:0; }
  .code-top { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.7rem; }
  .code-link { font-size:1.1rem; font-weight:700; overflow-wrap:anywhere; }
  .badge { display:inline-flex; align-items:center; border-radius:999px; padding:.2rem .55rem; font-size:.72rem; font-weight:700; background:var(--soft); color:var(--accent); }
  .badge-off { background:#f0f1f0; color:#66746b; }
  .code-url { overflow-wrap:anywhere; }
  .code-actions { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; margin-top:.7rem; }
  .code-actions form { margin:0; }
  .code-meta { display:flex; gap:1rem; flex-wrap:wrap; font-size:.82rem; color:var(--muted); margin-top:1rem; }
  .qr-side { display:flex; flex-direction:column; align-items:center; gap:.65rem; min-width:132px; }
  .qr-side img { display:block; width:112px; height:112px; padding:5px; border:1px solid var(--line); border-radius:10px; }
  .empty { text-align:center; padding:2.2rem 1rem; border:1px dashed #c5d6c9; border-radius:14px; background:#fbfdfb; }
  .empty p { margin:0; }
  #toast { position:fixed; bottom:1rem; left:50%; transform:translate(-50%,12px); max-width:min(92vw,440px); padding:.75rem 1rem; border-radius:10px; background:var(--ink); color:#fff; box-shadow:0 10px 30px #142f2040; opacity:0; pointer-events:none; transition:opacity .18s,transform .18s; z-index:10; text-align:center; }
  #toast.show { opacity:1; transform:translate(-50%,0); }
  @media (max-width:760px) { .auth-grid,.static-layout { grid-template-columns:1fr; } .static-result { min-height:210px; } }
  @media (max-width:600px) { .header-inner { align-items:flex-start; padding-block:.85rem; } .header-actions { gap:.25rem; } .account { width:100%; text-align:right; } .code-card { grid-template-columns:1fr; } .qr-side { flex-direction:row; justify-content:space-between; border-top:1px solid var(--line); padding-top:1rem; } .qr-side img { width:88px; height:88px; } .url-row { flex-wrap:wrap; } .url-row input { flex-basis:100%; } .code-actions > *, .code-actions form { flex:1 1 auto; } .code-actions form .btn { width:100%; } }
  @media (max-width:380px) { .container { width:min(100% - 1.25rem,1080px); } .brand { font-size:.9rem; } .header-actions .btn { font-size:.8rem; padding-inline:.5rem; } }
  @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } #toast { transition:none; } }
`;

function shell(title, body, scripts = "", auth = false) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${styles}</style>${auth ? `<script src="${SWA_BROWSER_CDN}" defer></script>` : ""}</head><body>${body}<div id="toast" role="status" aria-live="polite"></div><script>${commonScript}</script><script>${scripts}</script></body></html>`;
}

function header(account = "") {
  return `<header class="site-header"><div class="container header-inner"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">QR</span><span>QR simples</span></a>${account ? `<div class="header-actions"><span class="account">Hola, <strong>${escapeHtml(account)}</strong></span><form method="POST" action="/admin/logout"><button class="btn btn-secondary btn-small" type="submit">Cerrar sesión</button></form></div>` : `<span class="small muted">Crea y descarga en segundos</span>`}</div></header>`;
}

function staticGenerator() {
  return `<div class="card"><div class="card-heading"><h2>Crear QR estático</h2><p>Para texto o enlaces que no necesitas cambiar después.</p></div><div class="static-layout"><form id="staticForm"><label class="field"><span class="field-label">Texto o URL</span><input id="staticText" type="text" maxlength="2048" placeholder="https://ejemplo.com" required autocomplete="off"><span class="field-hint">El contenido quedará fijo en el QR.</span></label><label class="field"><span class="field-label">Tamaño de descarga</span><select id="staticSize"><option value="150">150 × 150 px</option><option value="300" selected>300 × 300 px</option><option value="500">500 × 500 px</option><option value="1000">1000 × 1000 px</option></select></label><button class="btn" type="submit">Generar QR</button></form><div class="static-result"><p id="staticPlaceholder">Tu código aparecerá aquí</p><img id="staticPreview" alt="Vista previa del QR estático" hidden><a id="staticDownload" class="btn btn-secondary btn-small" href="#" hidden>Descargar PNG</a></div></div></div>`;
}

const commonScript = `
  let toastTimer;
  function showToast(message) { const toast=document.getElementById('toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),3500); }
  async function saveQr(response,name) {
    if (!response.ok) throw new Error('download');
    const blob=await response.blob(), objectUrl=URL.createObjectURL(blob), temp=document.createElement('a');
    temp.href=objectUrl; temp.download=name; document.body.append(temp); temp.click(); temp.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[data-download-url]'); if (!link) return;
    event.preventDefault();
    try {
      await saveQr(await fetch(link.dataset.downloadUrl),link.dataset.downloadName);
    } catch {
      try { await saveQr(await fetch(link.href),link.dataset.downloadName); }
      catch { window.open(link.dataset.downloadUrl,'_blank','noopener'); showToast('Se abrió el QR para que puedas guardarlo.'); }
    }
  });
  function initStaticGenerator() {
    const form=document.getElementById('staticForm'); if (!form) return;
    const input=document.getElementById('staticText'), sizeInput=document.getElementById('staticSize'), preview=document.getElementById('staticPreview'), placeholder=document.getElementById('staticPlaceholder'), download=document.getElementById('staticDownload');
    form.addEventListener('submit', event=>{
      event.preventDefault(); const value=input.value.trim(); if (!value) { input.focus(); return; }
      const size=Number(sizeInput.value), margin=Math.min(50,Math.max(10,Math.round(size*.08)));
      const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size='+size+'x'+size+'&margin='+margin+'&data='+encodeURIComponent(value);
      preview.src=qrUrl; preview.hidden=false; placeholder.hidden=true; download.hidden=false; download.href='/download/static?text='+encodeURIComponent(value)+'&size='+size; download.dataset.value=value; download.dataset.downloadUrl=qrUrl; download.dataset.downloadName='qr-estatico-'+size+'.png';
    });
    input.addEventListener('input',()=>{ if (download.dataset.value && input.value.trim()!==download.dataset.value) { preview.hidden=true; placeholder.hidden=false; download.hidden=true; } });
    sizeInput.addEventListener('change',()=>{ preview.hidden=true; placeholder.hidden=false; download.hidden=true; });
  }
  initStaticGenerator();
`;

const authScript = `
  function friendlyError(err) { if (err?.name==='NotAllowedError') return 'Se canceló o no se completó la verificación.'; if (err?.name==='InvalidStateError') return 'Esa passkey ya está registrada en este dispositivo.'; if (err?.name==='SecurityError') return 'Este sitio no es válido para passkeys.'; const message=err?.message || 'Ocurrió un error, intenta de nuevo.'; return message.length>100?'Ocurrió un error, intenta de nuevo.':message; }
  document.getElementById('showRegister').addEventListener('click',()=>{ document.getElementById('registerBox').hidden=false; document.getElementById('showRegister').hidden=true; document.getElementById('username').focus(); });
  document.getElementById('loginBtn').addEventListener('click',async()=>{
    try { const result=await fetch('/admin/auth/login-options',{method:'POST'}); if (!result.ok) throw new Error(await result.text()); const options=await result.json(); const response=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options}); const verify=await fetch('/admin/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)}); if (!verify.ok) throw new Error(await verify.text()); location.href='/#dynamic'; } catch(err) { showToast(friendlyError(err)); }
  });
  document.getElementById('registerBtn').addEventListener('click',async()=>{
    const username=document.getElementById('username').value.trim().toLowerCase();
    try { const result=await fetch('/admin/auth/register-options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})}); if (!result.ok) throw new Error(await result.text()); const options=await result.json(); const response=await SimpleWebAuthnBrowser.startRegistration({optionsJSON:options}); const verify=await fetch('/admin/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)}); if (!verify.ok) throw new Error(await verify.text()); location.href='/#dynamic'; } catch(err) { showToast(friendlyError(err)); }
  });
`;

export function renderAuthPage() {
  return shell("QR simples — crear y descargar", `${header()}<main class="container"><div class="intro"><p class="eyebrow">Generador de QR</p><h1>Un QR, sin complicaciones.</h1><p>Crea un código estático al instante o entra a tu cuenta para cambiar después el destino de tus QR dinámicos.</p></div><div class="auth-grid">${staticGenerator()}<section class="card"><div class="card-heading"><h2>QR dinámicos</h2><p>Actualiza el enlace sin volver a imprimir el código. También puedes ver sus escaneos.</p></div><button id="loginBtn" class="btn btn-block" type="button">Entrar con passkey</button><div class="divider"></div><p class="small">¿Es tu primera vez?</p><button id="showRegister" class="btn btn-secondary btn-block" type="button">Crear cuenta</button><div id="registerBox" hidden><label class="field"><span class="field-label">Nombre de usuario</span><input id="username" type="text" placeholder="tu-usuario" autocomplete="username" minlength="3" maxlength="24" pattern="[a-z0-9_-]{3,24}"></label><button id="registerBtn" class="btn btn-block" type="button">Registrar passkey</button></div><p class="small" style="margin:1rem 0 0">Usa la huella, PIN o llave de seguridad de tu dispositivo.</p></section></div></main>`, authScript, true);
}

function codeCard(origin, code) {
  const shortUrl=origin+"/"+code.code;
  const active=Boolean(code.active);
  return `<article class="card code-card"><div class="code-main"><div class="code-top"><a class="code-link" href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener noreferrer">/${escapeHtml(code.code)}</a><span class="badge ${active ? "" : "badge-off"}">${active ? "Activo" : "Inactivo"}</span></div><form method="POST" action="/admin/update"><input type="hidden" name="code" value="${escapeHtml(code.code)}"><div class="field"><label class="field-label" for="destination-${escapeHtml(code.code)}">URL de destino</label><span class="url-row"><input id="destination-${escapeHtml(code.code)}" class="code-url" type="url" name="destination" value="${escapeHtml(code.destination)}" placeholder="https://ejemplo.com" required><button class="btn btn-secondary btn-small" type="button" data-clear-url>Borrar URL</button></span></div><div class="code-actions"><button class="btn btn-small" type="submit">Guardar destino</button></div></form><div class="code-meta"><span>${Number(code.scan_count) || 0} escaneos</span><span>Último: ${code.last_scan ? escapeHtml(code.last_scan) : "Sin escaneos"}</span></div><div class="code-actions"><form method="POST" action="/admin/toggle"><input type="hidden" name="code" value="${escapeHtml(code.code)}"><input type="hidden" name="active" value="${active ? "0" : "1"}"><button class="btn btn-secondary btn-small" type="submit">${active ? "Desactivar" : "Activar"}</button></form></div></div><div class="qr-side"><img src="${qrImageUrl(shortUrl, 150)}" width="112" height="112" alt="QR del código ${escapeHtml(code.code)}" loading="lazy"><a class="btn btn-secondary btn-small" href="/admin/download?code=${encodeURIComponent(code.code)}" data-download-url="${escapeHtml(qrImageUrl(shortUrl, 500))}" data-download-name="qr-${escapeHtml(code.code)}.png">Descargar PNG</a></div></article>`;
}

const dashboardScript = `
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  function selectTab(name, updateHash=true) { tabs.forEach(tab=>{ const selected=tab.dataset.tab===name; tab.setAttribute('aria-selected',String(selected)); tab.tabIndex=selected?0:-1; document.getElementById('panel-'+tab.dataset.tab).hidden=!selected; }); if (updateHash) history.replaceState(null,'','#'+name); }
  tabs.forEach((tab,index)=>{ tab.addEventListener('click',()=>selectTab(tab.dataset.tab)); tab.addEventListener('keydown',event=>{ if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length]; selectTab(next.dataset.tab); next.focus(); }); });
  selectTab(location.hash==='#static'?'static':'dynamic',false);
  addEventListener('hashchange',()=>selectTab(location.hash==='#static'?'static':'dynamic',false));
  document.querySelectorAll('[data-clear-url]').forEach(button=>button.addEventListener('click',()=>{ const input=button.closest('.url-row').querySelector('input'); input.value=''; input.focus(); }));
`;

export function renderDashboard(origin, username, codes) {
  return shell("Tus códigos QR", `${header(username)}<main class="container"><div class="tabs" role="tablist" aria-label="Tipo de código QR"><button class="tab" type="button" role="tab" id="tab-static" data-tab="static" aria-controls="panel-static" aria-selected="false" tabindex="-1">Estáticos</button><button class="tab" type="button" role="tab" id="tab-dynamic" data-tab="dynamic" aria-controls="panel-dynamic" aria-selected="true">Dinámicos</button></div><section id="panel-static" role="tabpanel" aria-labelledby="tab-static" hidden>${staticGenerator()}</section><section id="panel-dynamic" role="tabpanel" aria-labelledby="tab-dynamic"><div class="section-head"><div><h2>QR dinámicos</h2><p>Cambia el destino cuando quieras; el QR sigue siendo el mismo.</p></div></div><div class="card"><div class="card-heading"><h3>Crear nuevo QR</h3><p>Escribe el enlace al que enviará tu código.</p></div><form method="POST" action="/admin/create"><div class="field new-url-field"><label class="field-label" for="new-destination">URL de destino</label><span class="url-row"><input id="new-destination" type="url" name="destination" placeholder="https://ejemplo.com" required><button class="btn btn-secondary btn-small" type="button" data-clear-url>Borrar URL</button></span></div><button class="btn" type="submit">Crear QR dinámico</button></form></div><div class="code-list">${codes.length ? codes.map(code=>codeCard(origin,code)).join("") : '<div class="empty"><h3>Aún no tienes QR dinámicos</h3><p>Crea el primero con el formulario de arriba.</p></div>'}</div></section></main>`, dashboardScript);
}
