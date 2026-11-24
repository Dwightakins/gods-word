{
const {books, daily, situations} = window.GW;
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- storage (safe) ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('gw.'+k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('gw.'+k, JSON.stringify(v)); }catch(e){} }
};
let pos = store.get('pos', {b:43, c:1});           // John 1
let marks = store.get('marks', {});                // "b.c.v" -> {t, at}
let hls = store.get('hls', {});                    // "b.c.v" -> {k, t, at}
let prefs = store.get('prefs', {fs:20, theme:'auto'});

function applyPrefs(){
  document.documentElement.style.setProperty('--fs', prefs.fs+'px');
  if(prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', prefs.theme);
}
applyPrefs();

/* ---------- helpers ---------- */
const refOf = (b,c,v,v2) => `${books[b-1].n} ${c}${v ? ':'+v+(v2 && v2!==v ? '-'+v2 : '') : ''}`;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('show'),1800); }
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast('Copied'); }
  catch(e){ toast('Could not copy on this device'); }
}
async function shareText(text){
  if(navigator.share){ try{ await navigator.share({text}); return; }catch(e){ if(e && e.name==='AbortError') return; } }
  copyText(text);
}
const cache = {};
async function loadBook(b){
  if(cache[b]) return cache[b];
  const r = await fetch(`data/bible/${b}.json`);
  if(!r.ok) throw new Error('load');
  return cache[b] = await r.json();
}
function dayOfYear(d=new Date()){ return Math.floor((d - new Date(d.getFullYear(),0,0)) / 864e5); }
const NT = []; for(let b=40;b<=66;b++) for(let c=1;c<=books[b-1].c;c++) NT.push([b,c]);
const go = h => { if(location.hash === '#'+h) route(); else location.hash = h; };

/* ---------- TODAY ---------- */
function vToday(){
  const now = new Date(), d = dayOfYear(now);
  const v = daily[d % daily.length];
  const prov = Math.min(now.getDate(), 31);
  const [nb, nc] = NT[(d - 1) % NT.length];
  const dateStr = now.toLocaleDateString(undefined, {weekday:'long', day:'numeric', month:'long'});
  const quick = situations.filter(s=>!s.crisis).slice(0,8);
  const shareV = `"${v.t}"\n${v.ref} (KJV)`;
  view.innerHTML = `
  <div class="cover">
    <div class="label">${esc(dateStr)} · Verse of the day</div>
    <blockquote>${esc(v.t)}</blockquote>
    <cite>${esc(v.ref)}</cite>
    <p>${esc(v.note)}</p>
    <div class="row">
      <button class="btn" id="vOpen">Read the chapter</button>
      <button class="btn" id="vShare">Share</button>
      <button class="btn" id="vSave">${marks[`${v.b}.${v.c}.${v.v}`] ? 'Saved' : 'Save'}</button>
    </div>
  </div>
  <section>
    <h2>Today's reading</h2>
    <div class="cards">
      <button class="card" data-open="20.${prov}"><span>Wisdom for the day</span><b>Proverbs ${prov}</b><span>One chapter for each day of the month</span></button>
      <button class="card" data-open="${nb}.${nc}"><span>New Testament in a year</span><b>${esc(refOf(nb,nc))}</b><span>Day ${(d-1)%NT.length+1} of ${NT.length}</span></button>
    </div>
  </section>
  <section>
    <h2>What are you going through?</h2>
    <div class="chips">${quick.map(s=>`<a class="chip" href="#help-${s.id}">${esc(s.title)}</a>`).join('')}<a class="chip" href="#help"><b>See all</b></a></div>
  </section>
  <section id="installBox" hidden>
    <div class="card"><b>Install God's Word</b><span id="installMsg">Add it to your home screen. It opens like an app and works offline.</span>
    <div class="row"><button class="btn primary" id="installBtn" hidden>Install app</button></div></div>
  </section>`;
  $('#vOpen').onclick = () => openRef(v.b, v.c, v.v);
  $('#vShare').onclick = () => shareText(shareV);
  $('#vSave').onclick = e => { toggleMark(v.b, v.c, v.v, v.t); e.target.textContent = marks[`${v.b}.${v.c}.${v.v}`] ? 'Saved' : 'Save'; };
  view.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const [bb,cc] = b.dataset.open.split('.').map(Number); openRef(bb,cc); });
  showInstall();
}

/* ---------- BIBLE READER ---------- */
let sel = new Set(), flashV = 0;
async function vBible(){
  const {b, c} = pos, bk = books[b-1];
  view.innerHTML = `
  <div class="readbar">
    <button class="picker" id="pick">${esc(bk.n)} ${c} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg></button>
    <button class="nav2" id="prev" aria-label="Previous chapter">‹</button>
    <button class="nav2" id="next" aria-label="Next chapter">›</button>
    <a class="nav2" style="border-radius:10px;color:inherit" href="#search" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></a>
  </div>
  <div class="text" id="text"><p class="empty">Loading…</p></div>`;
  $('#pick').onclick = () => { bk.book = 0; go('books'); };
  $('#prev').onclick = () => step(-1);
  $('#next').onclick = () => step(1);
  let ch;
  try{ ch = (await loadBook(b))[c-1]; }
  catch(e){ $('#text').innerHTML = `<p class="empty">This chapter isn't saved on your phone yet. Connect to the internet once and it will be kept for offline reading.</p>`; return; }
  if(pos.b !== b || pos.c !== c) return;
  $('#text').innerHTML = `<h1>${esc(bk.n)} ${c}</h1>` + ch.map((t,i)=>{
    const k = `${b}.${c}.${i+1}`, h = hls[k];
    return `<span class="v${h ? ' h'+h.k : ''}" data-v="${i+1}"><sup>${i+1}</sup>${esc(t)}${marks[k] ? '<i class="bm" aria-label="bookmarked"></i>' : ''} </span>`;
  }).join('') + `<div class="pager"><button class="btn" id="p2">‹ Previous</button><button class="btn" id="n2">Next ›</button></div>`;
  $('#p2').onclick = () => step(-1);
  $('#n2').onclick = () => step(1);
  $('#text').addEventListener('click', e => {
    const s = e.target.closest('.v'); if(!s) return;
    const n = +s.dataset.v;
    sel.has(n) ? sel.delete(n) : sel.add(n);
    s.classList.toggle('sel');
    $('#actions').classList.toggle('show', sel.size > 0);
  });
  if(flashV){
    const el = view.querySelector(`.v[data-v="${flashV}"]`);
    if(el){ el.scrollIntoView({block:'center'}); el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),1600); }
    flashV = 0;
  } else window.scrollTo(0,0);
}
function step(d){
  let {b, c} = pos; c += d;
  if(c < 1){ if(b === 1) return; b--; c = books[b-1].c; }
  if(c > books[b-1].c){ if(b === 66) return; b++; c = 1; }
  setPos(b, c); vBible();
}
function setPos(b,c){ pos = {b, c}; store.set('pos', pos); clearSel(); }
function openRef(b, c, v){ setPos(b, c); flashV = v || 0; go('bible'); }
function clearSel(){ sel.clear(); $('#actions').classList.remove('show'); view.querySelectorAll('.v.sel').forEach(e=>e.classList.remove('sel')); }

/* ---------- BOOKS (find a book / chapter) ---------- */
const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g,'');
function bookMatches(q){
  const n = norm(q); if(!n) return books.map((_,i)=>i+1);
  const first = [], second = [];
  books.forEach((bk,i)=>{ const k = norm(bk.n), bare = k.replace(/^\d/,'');
    if(k.startsWith(n)) first.push(i+1); else if(bare.startsWith(n)) second.push(i+1); });
  return first.concat(second);
}
// "john 3:16", "gen 1", "1 cor 13 4", "ps 23"
function parseRef(q){
  const m = q.trim().match(/^(\d?\s*[a-z][a-z\s]*?)\.?\s*(\d+)(?:\s*[:.\s]\s*(\d+))?$/i);
  if(!m) return null;
  const b = bookMatches(m[1])[0]; if(!b) return null;
  const c = +m[2], v = m[3] ? +m[3] : 0;
  if(c < 1 || c > books[b-1].c) return null;
  return {b, c, v};
}
let bk = {q:'', t:'all', book:0};
function vBooks(){
  if(bk.book) return vChapters(bk.book);
  view.innerHTML = `<div class="readbar" style="flex-direction:column;align-items:stretch;gap:10px">
    <div style="display:flex;align-items:center;gap:8px"><a class="back" style="margin:0" href="#bible">‹ Back</a><h2 style="margin-left:6px">Books</h2></div>
    <input type="search" id="bq" placeholder="Type a book: J, Gen, 1 Cor, John 3:16" value="${esc(bk.q)}" autocomplete="off" aria-label="Find a book">
    <div class="seg" style="margin:0;align-self:flex-start">${[['all','All'],['ot','Old Testament'],['nt','New Testament']].map(([k,l])=>`<button data-tt="${k}" class="${bk.t===k?'on':''}">${l}</button>`).join('')}</div>
  </div><div id="blist"></div>`;
  const q = $('#bq');
  q.oninput = () => { bk.q = q.value; drawBooks(); };
  q.onkeydown = e => { if(e.key === 'Enter'){ const r = parseRef(q.value); if(r){ bk.q=''; openRef(r.b,r.c,r.v); } else { const f = bookMatches(q.value)[0]; if(f) openBook(f); } } };
  view.querySelector('.seg').onclick = e => { const t = e.target.closest('[data-tt]'); if(!t) return; bk.t = t.dataset.tt; view.querySelectorAll('[data-tt]').forEach(x=>x.classList.toggle('on',x===t)); drawBooks(); };
  $('#blist').onclick = e => {
    const r = e.target.closest('[data-ref]'); if(r){ const [b,c,v] = r.dataset.ref.split('.').map(Number); bk.q=''; openRef(b,c,v); return; }
    const t = e.target.closest('[data-b]'); if(t) openBook(+t.dataset.b);
  };
  drawBooks();
  window.scrollTo(0,0);
  if(window.matchMedia('(pointer:fine)').matches) q.focus();
}
const inTab = b => bk.t === 'all' || bk.q.trim() !== '' || (bk.t === 'ot' ? b <= 39 : b >= 40);
function drawBooks(){
  const list = bookMatches(bk.q).filter(inTab), r = parseRef(bk.q);
  const row = b => `<button class="brow${pos.b===b?' on':''}" data-b="${b}"><span>${esc(books[b-1].n)}</span><small>${books[b-1].c} chapter${books[b-1].c>1?'s':''}</small></button>`;
  let html = r ? `<button class="card jump" data-ref="${r.b}.${r.c}.${r.v}"><span>Go to</span><b>${esc(refOf(r.b,r.c,r.v||0))}</b></button>` : '';
  if(!list.length) html += `<p class="empty">No book starts with "${esc(bk.q)}".</p>`;
  else if(bk.q.trim()) html += `<div class="blist">${list.map(row).join('')}</div>`;
  else {
    const ot = list.filter(b=>b<=39), nt = list.filter(b=>b>=40);
    if(ot.length) html += `<p class="label sect">Old Testament · 39 books</p><div class="blist">${ot.map(row).join('')}</div>`;
    if(nt.length) html += `<p class="label sect">New Testament · 27 books</p><div class="blist">${nt.map(row).join('')}</div>`;
  }
  $('#blist').innerHTML = html;
}
function openBook(b){ if(books[b-1].c === 1){ bk.book=0; openRef(b,1); return; } bk.book = b; if(location.hash === '#books') vChapters(b); else go('books'); }
function vChapters(b){
  const n = books[b-1].c;
  view.innerHTML = `<button class="back" id="allB" style="padding:0">‹ All books</button>
  <h1 style="margin:4px 0 4px">${esc(books[b-1].n)}</h1><p class="label">${b<=39?'Old':'New'} Testament · choose a chapter</p>
  <div class="grid ch">${Array.from({length:n},(_,i)=>`<button data-c="${i+1}" class="${pos.b===b&&pos.c===i+1?'on':''}">${i+1}</button>`).join('')}</div>`;
  $('#allB').onclick = () => { bk.book = 0; vBooks(); };
  view.onclick = e => { const t = e.target.closest('[data-c]'); if(t){ bk.book = 0; bk.q = ''; openRef(b, +t.dataset.c); } };
  window.scrollTo(0,0);
}

/* verse actions */
function selText(){
  const ch = cache[pos.b][pos.c-1], vs = [...sel].sort((a,b)=>a-b);
  const contiguous = vs.every((v,i)=>!i || v === vs[i-1]+1);
  const ref = contiguous ? refOf(pos.b,pos.c,vs[0],vs[vs.length-1]) : `${books[pos.b-1].n} ${pos.c}:${vs.join(',')}`;
  return {vs, ref, text: vs.map(v=>ch[v-1]).join(' ')};
}
function toggleMark(b,c,v,t){
  const k = `${b}.${c}.${v}`;
  if(marks[k]){ delete marks[k]; toast('Bookmark removed'); } else { marks[k] = {t, at:Date.now()}; toast('Bookmarked'); }
  store.set('marks', marks);
}
$('#actions').addEventListener('click', e => {
  const t = e.target.closest('button'); if(!t || !cache[pos.b]) return;
  const {vs, ref, text} = selText(), ch = cache[pos.b][pos.c-1];
  if(t.dataset.hl){ vs.forEach(v=>{ hls[`${pos.b}.${pos.c}.${v}`] = {k:+t.dataset.hl, t:ch[v-1], at:Date.now()}; }); store.set('hls', hls); clearSel(); vBibleKeep(); return; }
  const a = t.dataset.a;
  if(a === 'clear'){ vs.forEach(v=>delete hls[`${pos.b}.${pos.c}.${v}`]); store.set('hls', hls); clearSel(); vBibleKeep(); }
  if(a === 'bm'){ const allOn = vs.every(v=>marks[`${pos.b}.${pos.c}.${v}`]); vs.forEach(v=>{ const k=`${pos.b}.${pos.c}.${v}`; if(allOn) delete marks[k]; else if(!marks[k]) marks[k]={t:ch[v-1],at:Date.now()}; }); store.set('marks',marks); toast(allOn?'Bookmark removed':'Bookmarked'); clearSel(); vBibleKeep(); }
  if(a === 'copy'){ copyText(`"${text}"\n${ref} (KJV)`); clearSel(); }
  if(a === 'share'){ shareText(`"${text}"\n${ref} (KJV)`); clearSel(); }
  if(a === 'close') clearSel();
});
function vBibleKeep(){ const y = window.scrollY; vBible().then(()=>window.scrollTo(0,y)); }

/* ---------- SEARCH ---------- */
let lastQ = '', sTimer = 0, sToken = 0;
const loadAll = () => Promise.all(books.map((_,i)=>loadBook(i+1)));
function vSearch(){
  view.innerHTML = `<a class="back" href="#bible">‹ Back to reading</a>
  <h1 style="margin:6px 0 14px">Search</h1>
  <form id="sf"><input type="search" id="q" placeholder="Book, verse or words: John, John 3:16, fear not" value="${esc(lastQ)}" enterkeyhint="search" autocomplete="off" aria-label="Search"></form>
  <div id="sBooks"></div><div id="res"></div>`;
  const q = $('#q');
  q.oninput = () => { lastQ = q.value; liveSearch(q.value); };
  $('#sf').onsubmit = e => { e.preventDefault(); const r = parseRef(q.value); if(r){ lastQ=''; openRef(r.b,r.c,r.v); return; }
    const m = bookMatches(q.value); if(m.length === 1 || (m[0] && norm(books[m[0]-1].n) === norm(q.value))){ lastQ=''; openBook(m[0]); return; }
    clearTimeout(sTimer); verseSearch(q.value.trim()); q.blur(); };
  view.onclick = e => {
    const r = e.target.closest('[data-ref]'); if(r){ const [b,c,v] = r.dataset.ref.split('.').map(Number); lastQ=''; openRef(b,c,v); return; }
    const bt = e.target.closest('[data-b]'); if(bt){ lastQ=''; openBook(+bt.dataset.b); return; }
    const g = e.target.closest('[data-go]'); if(g){ const [b,c,v] = g.dataset.go.split('.').map(Number); openRef(b,c,v); }
  };
  loadAll().catch(()=>{});                  // warm up in the background so word search is quick
  liveSearch(lastQ);
  if(!lastQ && window.matchMedia('(pointer:fine)').matches) q.focus();
}
function liveSearch(raw){
  const q = raw.trim(), box = $('#sBooks'), res = $('#res');
  clearTimeout(sTimer); sToken++;
  if(!q){ box.innerHTML = `<p class="empty">Type a book name (like J or Gen), a verse (John 3:16) or any words.</p>`; res.innerHTML=''; return; }
  const r = parseRef(q), m = bookMatches(q).slice(0,12);
  let html = r ? `<button class="card jump" data-ref="${r.b}.${r.c}.${r.v}"><span>Go to</span><b>${esc(refOf(r.b,r.c,r.v||0))}</b></button>` : '';
  if(m.length && !r) html += `<p class="label sect">Books</p><div class="blist">${m.map(b=>`<button class="brow" data-b="${b}"><span>${esc(books[b-1].n)}</span><small>${books[b-1].c} chapter${books[b-1].c>1?'s':''}</small></button>`).join('')}</div>`;
  box.innerHTML = html;
  res.innerHTML = '';
  if(q.length >= 3 && !r) sTimer = setTimeout(()=>verseSearch(q), 450);
}
async function verseSearch(q){
  const res = $('#res'), my = ++sToken; if(!res || q.length < 3) return;
  res.innerHTML = `<p class="label sect">Verses</p><p class="empty">Searching…</p>`;
  try{ await loadAll(); }
  catch(e){ if(my===sToken) res.innerHTML = `<p class="empty">Word search needs the full Bible. Connect to the internet once, or use "Save the whole Bible for offline" in settings.</p>`; return; }
  if(my !== sToken) return;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const whole = new RegExp('\\b' + safe + '\\b', 'i'), part = new RegExp(safe, 'i');
  const exact = [], other = [];
  for(let b=1;b<=66;b++) cache[b].forEach((ch,ci)=>ch.forEach((t,vi)=>{ if(whole.test(t)) exact.push([b,ci+1,vi+1,t]); else if(part.test(t)) other.push([b,ci+1,vi+1,t]); }));
  const hits = exact.concat(other), show = hits.slice(0,100), hl = new RegExp(safe,'gi');
  res.innerHTML = `<p class="label sect">Verses containing "${esc(q)}" · ${hits.length.toLocaleString()} found${hits.length>100?', showing 100':''}</p>` +
    (hits.length ? show.map(([b,c,v,t])=>`<div class="verse"><div class="meta"><b>${esc(refOf(b,c,v))}</b><button class="small" data-go="${b}.${c}.${v}">Open</button></div><p>${esc(t).replace(hl,x=>`<mark>${x}</mark>`)}</p></div>`).join('') : `<p class="empty">No verses contain those words.</p>`);
}

/* ---------- HELP ME ---------- */
const HELPLINES = `<div class="help"><b>You matter, and you don't have to go through this alone.</b>
  <p style="margin:8px 0 4px">Please talk to someone right now. These lines are free and confidential:</p>
  <ul>
    <li>SURPIN (suicide prevention), toll-free: <a href="tel:08000787746">0800 078 7746</a></li>
    <li>SURPIN: <a href="tel:09080217555">0908 021 7555</a></li>
    <li>She Writes Woman, toll-free, any hour: <a href="tel:08008002000">0800 800 2000</a></li>
    <li>Emergency: <a href="tel:112">112</a></li>
  </ul>
  <p style="margin:4px 0 0">You can also call a pastor, a friend or a family member you trust and tell them how you feel.</p></div>`;
function vHelp(){
  view.innerHTML = `<h1 style="margin-top:22px">What are you going through?</h1>
  <p class="label" style="font-size:15px;margin:8px 0 0">Pick what fits. You'll get verses for it and a short prayer you can pray.</p>
  <div class="cards">${situations.map(s=>`<a class="card${s.crisis?' crisis':''}" href="#help-${s.id}"><b>${esc(s.title)}</b><span>${esc(s.note)}</span></a>`).join('')}</div>`;
}
function vSituation(id){
  const s = situations.find(x=>x.id===id);
  if(!s){ vHelp(); return; }
  view.innerHTML = `<a class="back" href="#help">‹ All situations</a>
  <h1 style="margin:6px 0 4px">${esc(s.title)}</h1>
  ${s.crisis ? HELPLINES : ''}
  <section style="margin-top:18px">${s.verses.map(v=>`<div class="verse"><div class="meta"><b>${esc(v.ref)}</b><button class="small" data-go="${v.b}.${v.c}.${v.v}">Open</button><button class="small" data-share="${esc(v.ref)}">Share</button></div><p>${esc(v.t)}</p></div>`).join('')}</section>
  <section><h2>A prayer</h2><div class="prayer" id="pr">${esc(s.prayer)}</div>
  <div class="row"><button class="btn" id="copyPr">Copy prayer</button><button class="btn" id="sharePr">Share prayer</button></div></section>`;
  view.onclick = e => {
    const g = e.target.closest('[data-go]'); if(g){ const [b,c,v] = g.dataset.go.split('.').map(Number); openRef(b,c,v); return; }
    const sh = e.target.closest('[data-share]'); if(sh){ const v = s.verses.find(x=>x.ref===sh.dataset.share); shareText(`"${v.t}"\n${v.ref} (KJV)`); }
  };
  $('#copyPr').onclick = () => copyText(s.prayer);
  $('#sharePr').onclick = () => shareText(s.prayer);
  window.scrollTo(0,0);
}

/* ---------- SAVED ---------- */
let savedTab = 'marks';
function vSaved(){
  const src = savedTab === 'marks' ? marks : hls;
  const items = Object.entries(src).sort((a,b)=>b[1].at-a[1].at);
  view.innerHTML = `<h1 style="margin-top:22px">Saved</h1>
  <div class="seg" role="tablist"><button data-tab="marks" class="${savedTab==='marks'?'on':''}">Bookmarks (${Object.keys(marks).length})</button><button data-tab="hls" class="${savedTab==='hls'?'on':''}">Highlights (${Object.keys(hls).length})</button></div>
  <section style="margin-top:12px">${items.length ? items.map(([k,o])=>{ const [b,c,v] = k.split('.').map(Number);
    return `<div class="verse"><div class="meta"><b>${esc(refOf(b,c,v))}</b><button class="small" data-go="${k}">Open</button><button class="small" data-del="${k}">Remove</button></div><p>${o.k?`<span class="v h${o.k}">`:''}${esc(o.t)}${o.k?'</span>':''}</p></div>`; }).join('')
    : `<p class="empty">${savedTab==='marks' ? 'No bookmarks yet. In the Bible, tap a verse, then tap Bookmark.' : 'No highlights yet. In the Bible, tap a verse, then pick a colour.'}</p>`}</section>
  <p class="label">Saved on this phone only. Clearing your browser data will remove them.</p>`;
  view.onclick = e => {
    const t = e.target.closest('[data-tab]'); if(t){ savedTab = t.dataset.tab; vSaved(); return; }
    const g = e.target.closest('[data-go]'); if(g){ const [b,c,v] = g.dataset.go.split('.').map(Number); openRef(b,c,v); return; }
    const d = e.target.closest('[data-del]'); if(d){ delete src[d.dataset.del]; store.set(savedTab, src); vSaved(); }
  };
}

/* ---------- SETTINGS ---------- */
function openSettings(){
  openSheet(`<h2>Settings</h2>
  <div class="setting" style="margin-top:12px"><label class="label" for="fs">Text size</label>
    <input type="range" id="fs" min="16" max="30" step="1" value="${prefs.fs}">
    <p style="font:400 ${prefs.fs}px/1.5 var(--serif);margin:4px 0 0" id="fsPrev">The LORD is my shepherd; I shall not want.</p></div>
  <div class="setting"><span class="label">Appearance</span><br>
    <div class="seg">${['auto','light','dark'].map(t=>`<button data-theme-set="${t}" class="${prefs.theme===t?'on':''}">${t==='auto'?'Match phone':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div>
  <div class="setting"><span class="label">Offline reading</span>
    <p style="margin:6px 0">Chapters you open are kept on your phone. Save the whole Bible (about 4 MB) to read anywhere without data.</p>
    <button class="btn primary" id="dlAll">Save the whole Bible for offline</button> <span id="dlMsg" class="label"></span></div>
  <div class="setting"><span class="label">About</span>
    <p style="margin:6px 0">God's Word is free and has no ads. Scripture is from the King James Version (public domain). Your bookmarks and highlights stay on your phone; nothing is sent anywhere.</p></div>
  <button class="btn" id="closeS">Done</button>`);
  $('#fs').oninput = e => { prefs.fs = +e.target.value; $('#fsPrev').style.fontSize = prefs.fs+'px'; applyPrefs(); store.set('prefs', prefs); };
  $('#panel').onclick = e => { const t = e.target.closest('[data-theme-set]'); if(t){ prefs.theme = t.dataset.themeSet; applyPrefs(); store.set('prefs', prefs); $('#panel').querySelectorAll('[data-theme-set]').forEach(x=>x.classList.toggle('on', x===t)); } };
  $('#closeS').onclick = closeSheet;
  $('#dlAll').onclick = async () => {
    const m = $('#dlMsg'), btn = $('#dlAll'); btn.disabled = true;
    try{ for(let b=1;b<=66;b++){ await loadBook(b); m.textContent = `${Math.round(b/66*100)}%`; } m.textContent = 'Done. The whole Bible is on your phone.'; }
    catch(e){ m.textContent = 'Stopped. Check your connection and try again.'; btn.disabled = false; }
  };
}
function openSheet(html){ $('#panel').innerHTML = html; $('#sheet').classList.add('show'); $('#panel').scrollTop = 0; }
function closeSheet(){ $('#sheet').classList.remove('show'); }
$('#sheet').addEventListener('click', e => { if(e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){ closeSheet(); clearSel(); }
  if(location.hash === '#bible' && !$('#sheet').classList.contains('show') && e.target.tagName !== 'INPUT'){
    if(e.key === 'ArrowLeft') step(-1); if(e.key === 'ArrowRight') step(1);
  }
});
$('#gear').onclick = openSettings;

/* ---------- INSTALL (PWA) ---------- */
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showInstall(); });
function showInstall(){
  const box = $('#installBox'); if(!box) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if(standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if(deferred){ box.hidden = false; const b = $('#installBtn'); b.hidden = false; b.onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; box.hidden = true; }; }
  else if(ios){ box.hidden = false; $('#installMsg').textContent = 'On iPhone: tap the Share button in Safari, then "Add to Home Screen".'; }
}
if('serviceWorker' in navigator){ window.addEventListener('load', () => { try{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch(e){} }); }

/* ---------- ROUTER ---------- */
function route(){
  const h = (location.hash || '#today').slice(1);
  const tab = h.startsWith('help') ? 'help' : (h === 'search' || h === 'books') ? 'bible' : h;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  view.onclick = null; closeSheet(); if(h !== 'bible') clearSel();
  if(h === 'bible') vBible();
  else if(h === 'search') vSearch();
  else if(h === 'books') vBooks();
  else if(h === 'help') vHelp();
  else if(h.startsWith('help-')) vSituation(h.slice(5));
  else if(h === 'saved') vSaved();
  else vToday();
  if(h !== 'bible' && !h.startsWith('help-')) window.scrollTo(0,0);
}
window.addEventListener('hashchange', route);
route();
}
