import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vqrpkkrqynvlzjufiocn.supabase.co";
const SUPABASE_KEY = "sb_publishable_RGTsinQvL4hyv94mzNgNHA_uKqOfDuf";
const PUSH_URL = `${SUPABASE_URL}/functions/v1/casa-family-push`;
const MATCHES_URL = "https://nulwoygrcubxbskgbvef.supabase.co/functions/v1/casa-matches?all=1";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = ["Tutte","Importante","Famiglia","Casa","Da ricordare","Idea"];
const AUTHORS = ["Angelo","Luana","Manuela"];
const EVENT_OWNERS = ["Mamma","Babbo","Manu","Family"];
const OWNER_EMOJI = {Mamma:"👩",Babbo:"👨",Manu:"👧",Family:"🏠"};
const emoji = {Importante:"❤️",Famiglia:"👨‍👩‍👧",Casa:"🏠","Da ricordare":"⏰",Idea:"💡"};
const klass = {Importante:"important",Famiglia:"family",Casa:"home","Da ricordare":"remember",Idea:"idea"};

let posts = [], events = [], matches = [], postReads = [], selectedCategory = "Tutte", selectedDate = null, openMenu = null;
let currentPerson = null, currentUnreadPostId = null, selectedOwnerView = "Family";
const dismissedUnread = new Set();
let cursor = new Date(); cursor.setDate(1);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = (v="") => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));
function linkify(v="", nl2br=false){
  const text=String(v??"");
  const re=/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let out="", last=0;
  for(const m of text.matchAll(re)){
    out+=esc(text.slice(last,m.index));
    let raw=m[0], trailing="";
    while(/[.,;:!?)]$/.test(raw)){ trailing=raw.slice(-1)+trailing; raw=raw.slice(0,-1); }
    const href=/^www\./i.test(raw)?"https://"+raw:raw;
    out+=`<a class="inline-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(raw)}</a>${esc(trailing)}`;
    last=m.index+m[0].length;
  }
  out+=esc(text.slice(last));
  return nl2br?out.replace(/\n/g,"<br>"):out;
}

function toast(msg){ const e=$("#toast"); e.textContent=msg; e.classList.remove("hidden"); clearTimeout(toast.t); toast.t=setTimeout(()=>e.classList.add("hidden"),2200); }
function iso(d=new Date()){ return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
function dateFrom(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function onDate(e,d){ return e.start_date===d || (!!e.end_date && e.start_date<=d && e.end_date>=d); }
function timeLabel(e){ return e.all_day || !e.start_time ? "Tutta la giornata" : e.start_time.slice(0,5); }
function romeDateKey(value){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
  const m=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return `${m.year}-${m.month}-${m.day}`;
}
function romeTime(value){
  return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function todayKey(){ return romeDateKey(new Date()); }
function matchAsEvent(m){
  const startDate=romeDateKey(m.start);
  return {id:`match:${m.id}`,title:m.title,start_date:startDate,end_date:startDate,start_time:m.all_day?null:romeTime(m.start),all_day:!!m.all_day,location:m.location||"",description:"",source:"match",match:m};
}
function calendarItems(){ return [...events,...matches.map(matchAsEvent)]; }
function upcomingMatches(){
  const today=todayKey();
  return matches.filter(m=>String(m.start||"").slice(0,10)>=today);
}
function recipientsOf(p){ return Array.isArray(p.recipients)&&p.recipients.length?p.recipients:AUTHORS; }
function readsOf(p){ return new Set(postReads.filter(r=>r.post_id===p.id).map(r=>r.reader)); }
function catPill(c){ return `<span class="category-pill ${klass[c]||""}">${emoji[c]||"📌"} ${esc(c)}</span>`; }
function postTime(ts){ const d=new Date(ts), t=new Date(); if(d.toDateString()===t.toDateString()) return "oggi, "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); return d.toLocaleDateString("it-IT",{day:"numeric",month:"short"})+", "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }

function setView(view, updateUrl=true){
  if(!["home","board","calendar","matches","owner"].includes(view)) view="home";
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${view}`));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(updateUrl){
    const u=new URL(location.href);
    if(view==="home"){ u.searchParams.delete("view"); u.searchParams.delete("owner"); }
    else {
      u.searchParams.set("view",view);
      if(view==="owner") u.searchParams.set("owner",selectedOwnerView);
      else u.searchParams.delete("owner");
    }
    history.replaceState({},"",u);
  }
  if(view==="calendar") renderCalendar();
  if(view==="matches") renderMatches();
  if(view==="owner") renderOwnerEvents();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderHero(){
  const h=new Date().getHours();
  $("#heroTitle").textContent=h<12?"Buongiorno famiglia!":h<18?"Buon pomeriggio famiglia!":"Buonasera famiglia!";
  const n=calendarItems().filter(e=>onDate(e,iso())).length;
  $("#heroSubtitle").textContent=n===0?"Oggi il calendario è tranquillo.":n===1?"Oggi abbiamo una cosa da ricordare.":`Oggi abbiamo ${n} cose da ricordare.`;
  $("#todayLabel").textContent=new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
}

function miniEvent(e){ return `<div class="mini-event"><div class="emoji">${e.source==="match"?"🏐":(e.all_day?"🎉":"🕒")}</div><div><strong>${linkify(e.title)}</strong><small>${esc(timeLabel(e))}${e.location?` · ${linkify(e.location)}`:""}${e.source==="match"?" · Partita del Babbo":""}</small></div></div>`; }

function postCard(p, controls=true){
  return `<article class="post-card ${p.pinned?"pinned-post":""}" data-id="${p.id}">
    ${controls?`<button class="more-button" data-menu="post:${p.id}">•••</button>`:""}
    <div class="post-meta"><span>${catPill(p.category)}</span><time>${postTime(p.created_at)}</time></div>
    ${p.pinned?`<div class="pinned-label">📌 Fissato in alto</div>`:""}
    <h3>${linkify(p.title)}</h3><p>${linkify(p.body||"",true)}</p>
    <div class="post-footer">${esc(p.author||"Famiglia")}</div>
    <div class="post-read-status">${recipientsOf(p).map(name=>{const done=readsOf(p).has(name);return `<span class="read-chip ${done?"done":""}">${done?"✓":"○"} ${esc(name)}</span>`;}).join("")}</div>
    ${controls && openMenu===`post:${p.id}` ? menuHtml("post",p.id):""}
  </article>`;
}

function eventCard(e){
  if(e.source==="match") return matchCard(e.match);
  const d=dateFrom(e.start_date);
  const owner=EVENT_OWNERS.includes(e.event_owner)?e.event_owner:"Family";
  return `<article class="event-card" data-id="${e.id}">
    <button class="more-button" data-menu="event:${e.id}">•••</button>
    <div class="event-row"><div class="event-datebox"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT",{month:"short"}).toUpperCase()}</div>
    <div><span class="event-owner-pill">${OWNER_EMOJI[owner]} ${esc(owner)}</span><h3>${linkify(e.title)}</h3><small>${esc(timeLabel(e))}${e.location?` · ${linkify(e.location)}`:""}</small>${e.description?`<p style="margin-top:7px">${linkify(e.description,true)}</p>`:""}</div></div>
    ${openMenu===`event:${e.id}` ? menuHtml("event",e.id):""}
  </article>`;
}
function matchCard(m){
  const d=new Date(m.start);
  const day=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",day:"2-digit"}).format(d);
  const mon=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",month:"short"}).format(d).replace(".","").toUpperCase();
  const weekday=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",weekday:"short"}).format(d);
  const when=m.all_day?"Tutta la giornata":romeTime(m.start);
  return `<article class="match-card">
    <div class="match-datebox"><b>${day}</b><small>${mon}</small></div>
    <div class="match-content"><h3>🏐 ${linkify(m.title)}</h3><p>${esc(weekday)} · ${esc(when)}${m.location?` · ${linkify(m.location)}`:""}</p><span class="match-source">SUPERLEGA · MATCH</span></div>
  </article>`;
}
function renderMatches(){
  const box=$("#matchList");
  if(!box) return;
  const upcoming=upcomingMatches();
  box.innerHTML=upcoming.length?upcoming.map(matchCard).join(""):`<div class="empty-state">Nessuna partita in programma da oggi in avanti.</div>`;
}
function openOwnerView(owner){
  if(!EVENT_OWNERS.includes(owner)) return;
  selectedOwnerView=owner;
  setView("owner");
}
function renderOwnerEvents(){
  const box=$("#ownerEventList");
  if(!box) return;
  const owner=EVENT_OWNERS.includes(selectedOwnerView)?selectedOwnerView:"Family";
  $("#ownerViewIcon").textContent=OWNER_EMOJI[owner];
  $("#ownerViewTitle").textContent=`Eventi ${owner}`;
  $("#ownerViewSubtitle").textContent="Gli eventi da oggi in avanti.";
  const list=events
    .filter(e=>(EVENT_OWNERS.includes(e.event_owner)?e.event_owner:"Family")===owner)
    .filter(e=>(e.end_date||e.start_date)>=todayKey())
    .sort((a,b)=>(a.start_date+(a.start_time||"")).localeCompare(b.start_date+(b.start_time||"")));
  box.innerHTML=list.length?list.map(eventCard).join(""):`<div class="empty-state">Nessun evento di ${esc(owner)} da oggi in avanti.</div>`;
}
function menuHtml(type,id){
  let pin="", notify="";
  if(type==="post"){
    const p=posts.find(x=>x.id===id);
    notify=`<button data-notify-post="${id}">🔔 Invia notifica</button>`;
    pin=p?.pinned
      ? `<button data-pin-post="${id}">📌 Rimuovi dall'alto</button>`
      : `<button data-pin-post="${id}">📌 Fissa in alto</button>`;
  }
  return `<div class="action-menu">${pin}${notify}<button data-edit="${type}:${id}">Modifica</button><button class="danger" data-delete="${type}:${id}">Elimina</button></div>`;
}

function renderHome(){
  renderHero();
  const today=calendarItems().filter(e=>onDate(e,iso())).sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));
  $("#todayEvents").innerHTML=today.length?today.map(miniEvent).join(""):`<div class="empty-state">Nessun impegno per oggi. Giornata libera 🙂</div>`;
  $("#latestPost").innerHTML=posts[0]?postCard(posts[0],false):`<div class="empty-state">La bacheca è ancora vuota.</div>`;
  const seen=Number(localStorage.getItem("casaLastSeenPostTs")||0);
  const unseen=posts.filter(p=>new Date(p.created_at).getTime()>seen).length;
  $("#boardBadge").textContent=unseen; $("#boardBadge").classList.toggle("hidden",!unseen);
}

function sortBoardPosts(list){
  return [...list].sort((a,b)=>{
    if(!!a.pinned!==!!b.pinned) return a.pinned?-1:1;
    if(a.pinned&&b.pinned) return new Date(b.pinned_at||b.created_at)-new Date(a.pinned_at||a.created_at);
    return new Date(b.created_at)-new Date(a.created_at);
  });
}
function renderBoard(){
  $("#categoryFilters").innerHTML=CATEGORIES.map(c=>`<button class="filter-chip ${c===selectedCategory?"active":""}" data-category="${esc(c)}">${c==="Tutte"?"Tutte":`${emoji[c]||"📌"} ${esc(c)}`}</button>`).join("");
  const base=selectedCategory==="Tutte"?posts:posts.filter(p=>p.category===selectedCategory);
  const list=sortBoardPosts(base);
  $("#postList").innerHTML=list.length?list.map(p=>postCard(p,true)).join(""):`<div class="empty-state">Nessuna notizia in questa categoria.</div>`;
  if(posts[0]) localStorage.setItem("casaLastSeenPostTs",String(new Date(posts[0].created_at).getTime()));
}

function renderCalendar(){
  const y=cursor.getFullYear(), m=cursor.getMonth();
  $("#calendarMonthLabel").textContent=cursor.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
  const first=new Date(y,m,1), start=new Date(y,m,1-((first.getDay()+6)%7));
  const cells=[];
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const s=iso(d), outside=d.getMonth()!==m, today=s===iso(), has=calendarItems().some(e=>onDate(e,s)), sel=s===selectedDate;
    cells.push(`<button class="calendar-day ${outside?"outside":""} ${today?"today":""} ${has?"has-event":""} ${sel?"selected":""}" data-date="${s}">${d.getDate()}</button>`);
  }
  $("#calendarGrid").innerHTML=cells.join("");
  let list;
  const all=calendarItems();
  if(selectedDate){ list=all.filter(e=>onDate(e,selectedDate)); $("#calendarListTitle").textContent="Eventi del "+dateFrom(selectedDate).toLocaleDateString("it-IT",{day:"numeric",month:"long"}); }
  else { list=all.filter(e=>(e.end_date||e.start_date)>=todayKey()); $("#calendarListTitle").textContent="In arrivo"; }
  list.sort((a,b)=>(a.start_date+(a.start_time||"")).localeCompare(b.start_date+(b.start_time||"")));
  $("#eventList").innerHTML=list.length?list.map(eventCard).join(""):`<div class="empty-state">Nessun evento da mostrare.</div>`;
}

function renderAll(){ renderHome(); renderBoard(); renderCalendar(); renderMatches(); renderOwnerEvents(); updateNotificationUI(); updatePersonUI(); }

async function loadMatches(showToast=false){
  try{
    const r=await fetch(MATCHES_URL,{cache:"no-store"});
    const data=await r.json();
    if(!r.ok||!data.connected) throw new Error(data.error||("matches:"+r.status));
    matches=Array.isArray(data.matches)?data.matches:[];
    renderMatches();
    renderCalendar();
    renderHome();
    if(showToast) toast("Partite aggiornate");
  }catch(e){
    console.error("CASA matches error",e);
    if(showToast) toast("Non sono riuscito ad aggiornare le partite");
    const box=$("#matchList");
    if(box&&!matches.length) box.innerHTML=`<div class="error-box">Non riesco a leggere il calendario SUPERLEGA in questo momento.</div>`;
  }
}

async function loadData(){
  const matchPromise=loadMatches(false);
  const [p,e,r]=await Promise.all([
    supabase.from("casa_family_posts").select("*").order("created_at",{ascending:false}),
    supabase.from("casa_family_events").select("*").order("start_date",{ascending:true}).order("start_time",{ascending:true}),
    supabase.from("casa_family_post_reads").select("*")
  ]);
  if(p.error||e.error||r.error){ console.error(p.error||e.error||r.error); $("#todayEvents").innerHTML=`<div class="error-box">Non riesco a collegarmi al diario di famiglia. Riprova tra poco.</div>`; return; }
  posts=p.data||[]; events=e.data||[]; postReads=r.data||[];
  await matchPromise;
  renderAll();

  if(currentUnreadPostId&&!$("#unreadSheet").classList.contains("hidden")){
    const openPost=posts.find(p=>p.id===currentUnreadPostId);
    if(!openPost||recipientsOf(openPost).every(name=>readsOf(openPost).has(name))){
      currentUnreadPostId=null;
      $("#unreadSheet").classList.add("hidden");
    }else{
      renderUnreadButtons(openPost);
    }
  }
  showUnreadPopup();
}

function updatePersonUI(){
  const b=$("#personButton");
  if(!b) return;
  b.textContent=currentPerson?"👤":"👤";
  b.title=currentPerson?`Stai usando CASA come ${currentPerson}. Tocca per cambiare.`:"Scegli chi sta usando CASA";
  b.setAttribute("aria-label",b.title);
}
function openPersonSheet(){
  $("#personSheet").classList.remove("hidden");
}
async function setPerson(name){
  if(!AUTHORS.includes(name)) return;
  currentPerson=name;
  localStorage.setItem("casaPerson",name);
  $("#personSheet").classList.add("hidden");
  updatePersonUI();
  renderBoard();
  await syncPushPerson();
  showUnreadPopup();
}
function shortReaderName(name){
  return name==="Luana"?"Lua":name==="Manuela"?"Manu":name;
}
function incompletePosts(){
  return posts
    .filter(p=>{
      const read=readsOf(p);
      return recipientsOf(p).some(name=>!read.has(name))&&!dismissedUnread.has(p.id);
    })
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}
function renderUnreadButtons(p){
  const read=readsOf(p);
  $("#readButtons").innerHTML=recipientsOf(p).map(name=>{
    const done=read.has(name);
    const label=`${shortReaderName(name)} ha letto`;
    return done
      ? `<button type="button" class="read-person-button done" disabled>✓ ${esc(label)}</button>`
      : `<button type="button" class="read-person-button" data-mark-reader="${esc(name)}">${esc(label)}</button>`;
  }).join("");
}
function showUnreadPopup(){
  if(!$("#unreadSheet").classList.contains("hidden")) return;
  const p=incompletePosts()[0];
  if(!p) return;
  currentUnreadPostId=p.id;
  $("#unreadTitle").innerHTML=linkify(p.title);
  $("#unreadBody").innerHTML=linkify(p.body||"",true);
  $("#unreadMeta").textContent=`${p.author||"Famiglia"} · ${postTime(p.created_at)}`;
  renderUnreadButtons(p);
  $("#unreadSheet").classList.remove("hidden");
}
function dismissUnread(){
  if(currentUnreadPostId) dismissedUnread.add(currentUnreadPostId);
  currentUnreadPostId=null;
  $("#unreadSheet").classList.add("hidden");
}
async function markReaderRead(reader){
  if(!currentUnreadPostId||!AUTHORS.includes(reader)) return;
  const postId=currentUnreadPostId;
  const {error}=await supabase.from("casa_family_post_reads").insert({post_id:postId,reader});
  if(error&&error.code!=="23505"){console.error(error);toast("Non sono riuscito a salvare la lettura");return;}
  if(!postReads.some(r=>r.post_id===postId&&r.reader===reader)) postReads.push({post_id:postId,reader,read_at:new Date().toISOString()});
  renderBoard();

  const p=posts.find(x=>x.id===postId);
  if(!p) return;
  const complete=recipientsOf(p).every(name=>readsOf(p).has(name));
  if(complete){
    currentUnreadPostId=null;
    $("#unreadSheet").classList.add("hidden");
    toast("Annuncio letto da tutti");
    setTimeout(showUnreadPopup,120);
  }else{
    renderUnreadButtons(p);
    toast(`${shortReaderName(reader)} segnato come letto`);
  }
}

function authorSelector(current){
  const sel=current||currentPerson||localStorage.getItem("casaAuthor")||"Angelo";
  return `<div class="field"><label>Chi sta pubblicando?</label><div class="author-pills">${AUTHORS.map(a=>`<button type="button" class="author-pill ${a===sel?"active":""}" data-author="${a}">${a}</button>`).join("")}</div><input type="hidden" name="author" value="${sel}"></div>`;
}
function categorySelect(current="Famiglia"){
  return `<div class="field"><label>Categoria</label><select name="category">${CATEGORIES.filter(c=>c!=="Tutte").map(c=>`<option ${c===current?"selected":""}>${c}</option>`).join("")}</select></div>`;
}
function recipientSelector(current=null){
  const fallback=currentPerson?AUTHORS.filter(name=>name!==currentPerson):AUTHORS;
  const selected=Array.isArray(current)&&current.length?current:fallback;
  return `<div class="field"><label>Chi deve leggere questo annuncio?</label><div class="recipient-grid">${AUTHORS.map(name=>`<label class="recipient-option"><input type="checkbox" name="recipients" value="${name}" ${selected.includes(name)?"checked":""}><span>✓ ${name}</span></label>`).join("")}</div><p class="recipient-help">A chi selezioni comparirà l’annuncio finché non preme “Ho letto”.</p></div>`;
}
function postFields(p={}){
  return `<div class="field"><label>Titolo</label><input name="title" maxlength="100" required value="${esc(p.title||"")}" placeholder="Es. Pranzo di domenica"></div>
  ${categorySelect(p.category)}
  <div class="field"><label>Messaggio</label><textarea name="body" required placeholder="Scrivi qui la tua comunicazione…">${esc(p.body||"")}</textarea></div>
  ${recipientSelector(p.recipients)}
  ${authorSelector(p.author)}`;
}
function eventOwnerSelector(current="Family"){
  const selected=EVENT_OWNERS.includes(current)?current:"Family";
  return `<div class="field"><label>Di chi è questo evento?</label><div class="event-owner-pills">${EVENT_OWNERS.map(name=>`<button type="button" class="event-owner-pill-button ${name===selected?"active":""}" data-event-owner="${name}">${OWNER_EMOJI[name]} ${name}</button>`).join("")}</div><input type="hidden" name="event_owner" value="${selected}"></div>`;
}
function eventFields(e={}){
  return `${eventOwnerSelector(e.event_owner||"Family")}
  <div class="field"><label>Titolo</label><input name="title" maxlength="100" required value="${esc(e.title||"")}" placeholder="Es. Cena tutti insieme"></div>
  <div class="field-row"><div class="field"><label>Data</label><input type="date" name="start_date" required value="${e.start_date||iso()}"></div><div class="field"><label>Ora</label><input type="time" name="start_time" value="${e.start_time?e.start_time.slice(0,5):""}"></div></div>
  <div class="field"><label class="switch-row"><input type="checkbox" name="all_day" ${e.all_day?"checked":""}> Tutto il giorno</label></div>
  <div class="field"><label>Data fine <span style="font-weight:400;color:#777">(facoltativa)</span></label><input type="date" name="end_date" value="${e.end_date||""}"></div>
  <div class="field"><label>Luogo <span style="font-weight:400;color:#777">(facoltativo)</span></label><input name="location" value="${esc(e.location||"")}" placeholder="Es. Ristorante Da Marco"></div>
  ${categorySelect(e.category)}
  <div class="field"><label>Descrizione <span style="font-weight:400;color:#777">(facoltativa)</span></label><textarea name="description" placeholder="Aggiungi qualche dettaglio…">${esc(e.description||"")}</textarea></div>
  ${authorSelector(e.author)}`;
}
function openChoice(){ $("#choiceSheet").classList.remove("hidden"); }
function closeChoice(){ $("#choiceSheet").classList.add("hidden"); }
function openForm(type,item=null){
  closeChoice(); $("#formSheet").classList.remove("hidden");
  $("#formTitle").textContent=item?(type==="post"?"Modifica notizia":"Modifica evento"):(type==="post"?"Nuova notizia":"Nuovo evento");
  $("#formSubmit").textContent=item?"Salva":(type==="post"?"Pubblica":"Crea evento");
  $("#editId").value=item?.id||""; $("#editType").value=type; $("#formFields").innerHTML=type==="post"?postFields(item||{}):eventFields(item||{});
}
function closeForm(){ $("#formSheet").classList.add("hidden"); $("#editorForm").reset(); }

async function saveForm(ev){
  ev.preventDefault(); const fd=new FormData(ev.currentTarget), type=$("#editType").value, id=$("#editId").value;
  const author=fd.get("author")||"Famiglia"; localStorage.setItem("casaAuthor",author);
  let row;
  if(type==="post"){
    const recipients=fd.getAll("recipients").map(String).filter(x=>AUTHORS.includes(x));
    if(!recipients.length){toast("Scegli almeno una persona che deve leggere l’annuncio");return;}
    row={title:String(fd.get("title")||"").trim(),body:String(fd.get("body")||"").trim(),category:fd.get("category"),author,recipients,updated_at:new Date().toISOString()};
  }
  else {
    const eventOwner=String(fd.get("event_owner")||"Family");
    row={title:String(fd.get("title")||"").trim(),start_date:fd.get("start_date"),start_time:fd.get("all_day")?null:(fd.get("start_time")||null),end_date:fd.get("end_date")||null,all_day:!!fd.get("all_day"),location:String(fd.get("location")||"").trim()||null,description:String(fd.get("description")||"").trim()||null,category:fd.get("category"),author,event_owner:EVENT_OWNERS.includes(eventOwner)?eventOwner:"Family",updated_at:new Date().toISOString()};
  }
  const table=type==="post"?"casa_family_posts":"casa_family_events";
  const q=id?supabase.from(table).update(row).eq("id",id):supabase.from(table).insert(row);
  const {error}=await q; if(error){console.error(error);toast("Non sono riuscito a salvare");return;}
  closeForm(); toast(id?"Modifica salvata":"Pubblicato in CASA"); await loadData();
}
async function removeItem(type,id){
  if(!confirm("Vuoi davvero eliminare questo contenuto?")) return;
  const table=type==="post"?"casa_family_posts":"casa_family_events";
  const {error}=await supabase.from(table).delete().eq("id",id); if(error){toast("Non sono riuscito a eliminare");return;}
  openMenu=null; toast("Eliminato"); await loadData();
}

async function togglePinnedPost(id){
  const p=posts.find(x=>x.id===id);
  if(!p) return;

  const pinning=!p.pinned;
  if(pinning && posts.filter(x=>x.pinned).length>=3){
    toast("Puoi fissare in alto al massimo 3 annunci");
    return;
  }

  openMenu=null;
  const {error}=await supabase
    .from("casa_family_posts")
    .update({pinned:pinning})
    .eq("id",id);

  if(error){
    console.error("CASA pin post error",error);
    const msg=String(error.message||"");
    toast(msg.includes("massimo 3")?"Puoi fissare in alto al massimo 3 annunci":"Non sono riuscito ad aggiornare l'annuncio");
    return;
  }

  toast(pinning?"Annuncio fissato in alto":"Annuncio rimosso dall'alto");
  await loadData();
}

async function notifyOldPost(id){
  const p=posts.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`Vuoi inviare adesso una notifica per “${p.title}”?`)) return;

  openMenu=null;
  renderBoard();
  toast("Invio notifica…");

  try{
    const body=(p.body||"").replace(/\s+/g," ").trim();
    const r=await fetch(PUSH_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"broadcast",
        recipients:recipientsOf(p),
        payload:{
          title:`${emoji[p.category]||"📌"} ${p.title}`,
          body:body ? (body.length>140 ? body.slice(0,137)+"…" : body) : "Apri CASA per rileggere la notizia.",
          url:"./?view=board",
          tag:`casa-reminder-${p.id}-${Date.now()}`
        }
      })
    });
    if(!r.ok) throw new Error("broadcast:"+r.status);
    const data=await r.json();
    const n=Number(data.sent||0);
    toast(n===1?"Notifica inviata a 1 dispositivo":`Notifica inviata a ${n} dispositivi`);
  }catch(e){
    console.error("CASA manual notification error",e);
    toast("Non sono riuscito a inviare la notifica");
  }
}

function urlB64(s){ const pad="=".repeat((4-s.length%4)%4), b=(s+pad).replace(/-/g,"+").replace(/_/g,"/"), raw=atob(b); return Uint8Array.from([...raw].map(c=>c.charCodeAt(0))); }
function isStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function updateNotificationUI(){
  const supported="Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const granted=supported && Notification.permission==="granted";
  $("#notificationBanner").classList.toggle("hidden",!supported||granted||Notification.permission==="denied");
  $("#notificationButton").textContent=granted?"🔔":"🔕";
}
async function syncPushPerson(){
  if(!currentPerson||!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)||Notification.permission!=="granted") return;
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub) return;
    const jr=sub.toJSON();
    await fetch(PUSH_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"subscribe",subscription:jr,deviceLabel:navigator.userAgent.slice(0,180),person:currentPerson})
    });
  }catch(e){console.error("CASA push person sync",e);}
}
async function enablePush(){
  const supported="Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  if(!supported){toast("Questo dispositivo non supporta le notifiche web");return;}
  if(!currentPerson){openPersonSheet();toast("Prima scegli chi sta usando CASA");return;}
  const isiOS=/iPhone|iPad|iPod/.test(navigator.userAgent);
  if(isiOS && !isStandalone()){toast("Apri CASA dall’icona salvata nella schermata Home");return;}

  try{
    const perm=Notification.permission==="granted" ? "granted" : await Notification.requestPermission();
    if(perm!=="granted"){
      updateNotificationUI();
      toast(perm==="denied" ? "Le notifiche sono bloccate nelle impostazioni del telefono" : "Notifiche non attivate");
      return;
    }

    toast("Attivazione notifiche…");

    const reg=await navigator.serviceWorker.ready;
    const kr=await fetch(PUSH_URL+"?action=public-key");
    if(!kr.ok) throw new Error("public-key:"+kr.status);
    const {publicKey}=await kr.json();
    if(!publicKey) throw new Error("public-key-missing");

    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(publicKey)});

    const jr=sub.toJSON();
    const sr=await fetch(PUSH_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"subscribe",
        subscription:jr,
        deviceLabel:navigator.userAgent.slice(0,180),
        person:currentPerson
      })
    });
    if(!sr.ok) throw new Error("subscribe:"+sr.status);

    updateNotificationUI();
    toast("Notifiche attivate");
  }catch(e){
    console.error("CASA push activation error",e);
    const m=String(e?.message||e);
    if(m.includes("NotAllowedError")) toast("Permesso notifiche negato dal telefono");
    else if(m.includes("AbortError")) toast("Il telefono ha interrotto l’attivazione: riprova");
    else toast("Non sono riuscito ad attivare le notifiche");
  }
}

function bind(){
  document.addEventListener("click",async ev=>{
    const person=ev.target.closest("[data-person-choice]"); if(person){await setPerson(person.dataset.personChoice);return;}
    const reader=ev.target.closest("[data-mark-reader]"); if(reader){await markReaderRead(reader.dataset.markReader);return;}
    const ownerCard=ev.target.closest("[data-owner]"); if(ownerCard){openOwnerView(ownerCard.dataset.owner);return;}
    const v=ev.target.closest("[data-view]"); if(v){setView(v.dataset.view);return;}
    if(ev.target.closest("#globalAdd")){openChoice();return;}
    if(ev.target.closest("#personButton")){openPersonSheet();return;}
    if(ev.target.closest("#refreshMatches")){await loadMatches(true);return;}
    if(ev.target.closest("#unreadLater")){dismissUnread();return;}
    if(ev.target.closest("[data-close-sheet]")){closeChoice();return;}
    if(ev.target.closest("[data-close-form]")){closeForm();return;}
    const add=ev.target.closest("[data-add]"); if(add){openForm(add.dataset.add);return;}
    const chip=ev.target.closest("[data-category]"); if(chip){selectedCategory=chip.dataset.category;renderBoard();return;}
    const d=ev.target.closest("[data-date]"); if(d){selectedDate=selectedDate===d.dataset.date?null:d.dataset.date;renderCalendar();return;}
    const eventOwner=ev.target.closest("[data-event-owner]"); if(eventOwner){ eventOwner.closest(".field").querySelectorAll(".event-owner-pill-button").forEach(x=>x.classList.toggle("active",x===eventOwner)); eventOwner.closest(".field").querySelector("input[name=event_owner]").value=eventOwner.dataset.eventOwner; return; }
    const a=ev.target.closest("[data-author]"); if(a){ $(".author-pill").forEach(x=>x.classList.toggle("active",x===a)); a.closest(".field").querySelector("input[name=author]").value=a.dataset.author; return; }
    const m=ev.target.closest("[data-menu]"); if(m){openMenu=openMenu===m.dataset.menu?null:m.dataset.menu;renderBoard();renderCalendar();renderOwnerEvents();return;}
    const pin=ev.target.closest("[data-pin-post]"); if(pin){await togglePinnedPost(pin.dataset.pinPost);return;}
    const nt=ev.target.closest("[data-notify-post]"); if(nt){await notifyOldPost(nt.dataset.notifyPost);return;}
    const ed=ev.target.closest("[data-edit]"); if(ed){const [type,id]=ed.dataset.edit.split(":"); const item=(type==="post"?posts:events).find(x=>x.id===id); openMenu=null; openForm(type,item);return;}
    const del=ev.target.closest("[data-delete]"); if(del){const [type,id]=del.dataset.delete.split(":"); await removeItem(type,id);return;}
  });
  $("#editorForm").addEventListener("submit",saveForm);
  $("#prevMonth").addEventListener("click",()=>{cursor.setMonth(cursor.getMonth()-1);selectedDate=null;renderCalendar();});
  $("#nextMonth").addEventListener("click",()=>{cursor.setMonth(cursor.getMonth()+1);selectedDate=null;renderCalendar();});
  $("#enableNotifications").addEventListener("click",enablePush);
  $("#notificationButton").addEventListener("click",enablePush);
  $("#choiceSheet").addEventListener("click",e=>{if(e.target.id==="choiceSheet")closeChoice();});
  $("#formSheet").addEventListener("click",e=>{if(e.target.id==="formSheet")closeForm();});
  $("#personSheet").addEventListener("click",e=>{if(e.target.id==="personSheet"&&currentPerson)e.currentTarget.classList.add("hidden");});
  $("#unreadSheet").addEventListener("click",e=>{if(e.target.id==="unreadSheet")dismissUnread();});
}
function realtime(){
  supabase.channel("casa-family-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"casa_family_posts"},loadData)
    .on("postgres_changes",{event:"*",schema:"public",table:"casa_family_events"},loadData)
    .on("postgres_changes",{event:"*",schema:"public",table:"casa_family_post_reads"},loadData)
    .subscribe();
}
async function init(){
  const savedPerson=localStorage.getItem("casaPerson");
  const savedAuthor=localStorage.getItem("casaAuthor");
  currentPerson=AUTHORS.includes(savedPerson)?savedPerson:(AUTHORS.includes(savedAuthor)?savedAuthor:null);
  if(currentPerson) localStorage.setItem("casaPerson",currentPerson);

  bind();
  if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js?v=13",{updateViaCache:"none"})
      .then(reg=>reg.update())
      .catch(console.error);
  }
  const initialUrl=new URL(location.href);
  const urlOwner=initialUrl.searchParams.get("owner");
  if(EVENT_OWNERS.includes(urlOwner)) selectedOwnerView=urlOwner;
  setView(initialUrl.searchParams.get("view")||"home",false);
  updatePersonUI();
  updateNotificationUI();
  await loadData();
  if(currentPerson) await syncPushPerson();
  realtime();
}
init();
