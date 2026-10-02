import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vqrpkkrqynvlzjufiocn.supabase.co";
const SUPABASE_KEY = "sb_publishable_RGTsinQvL4hyv94mzNgNHA_uKqOfDuf";
const PUSH_URL = `${SUPABASE_URL}/functions/v1/casa-family-push`;
const MATCHES_URL = "https://nulwoygrcubxbskgbvef.supabase.co/functions/v1/casa-matches";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = ["Tutte","Importante","Famiglia","Casa","Da ricordare","Idea"];
const AUTHORS = ["Angelo","Luana","Manuela"];
const emoji = {Importante:"❤️",Famiglia:"👨‍👩‍👧",Casa:"🏠","Da ricordare":"⏰",Idea:"💡"};
const klass = {Importante:"important",Famiglia:"family",Casa:"home","Da ricordare":"remember",Idea:"idea"};

let posts = [], events = [], matches = [], postReads = [], selectedCategory = "Tutte", selectedDate = null, openMenu = null;
let currentPerson = null, currentUnreadPostId = null;
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
function catPill(c){ return `<span class="category-pill ${klass[c]||""}">${emoji[c]||"📌"} ${esc(c)}</span>`; }
function postTime(ts){ const d=new Date(ts), t=new Date(); if(d.toDateString()===t.toDateString()) return "oggi, "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); return d.toLocaleDateString("it-IT",{day:"numeric",month:"short"})+", "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }

function setView(view, updateUrl=true){
  if(!["home","board","calendar","matches"].includes(view)) view="home";
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${view}`));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(updateUrl){ const u=new URL(location.href); view==="home"?u.searchParams.delete("view"):u.searchParams.set("view",view); history.replaceState({},"",u); }
  if(view==="calendar") renderCalendar();
  if(view==="matches") renderMatches();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderHero(){
  const h=new Date().getHours();
  $("#heroTitle").textContent=h<12?"Buongiorno famiglia!":h<18?"Buon pomeriggio famiglia!":"Buonasera famiglia!";
  const n=events.filter(e=>onDate(e,iso())).length;
  $("#heroSubtitle").textContent=n===0?"Oggi il calendario è tranquillo.":n===1?"Oggi abbiamo una cosa da ricordare.":`Oggi abbiamo ${n} cose da ricordare.`;
  $("#todayLabel").textContent=new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
}

function miniEvent(e){ return `<div class="mini-event"><div class="emoji">${e.all_day?"🎉":"🕒"}</div><div><strong>${linkify(e.title)}</strong><small>${esc(timeLabel(e))}${e.location?` · ${linkify(e.location)}`:""}</small></div></div>`; }

function postCard(p, controls=true){
  return `<article class="post-card" data-id="${p.id}">
    ${controls?`<button class="more-button" data-menu="post:${p.id}">•••</button>`:""}
    <div class="post-meta"><span>${catPill(p.category)}</span><time>${postTime(p.created_at)}</time></div>
    <h3>${linkify(p.title)}</h3><p>${linkify(p.body||"",true)}</p>
    <div class="post-footer">${esc(p.author||"Famiglia")}</div>
    ${controls && openMenu===`post:${p.id}` ? menuHtml("post",p.id):""}
  </article>`;
}

function eventCard(e){
  const d=dateFrom(e.start_date);
  return `<article class="event-card" data-id="${e.id}">
    <button class="more-button" data-menu="event:${e.id}">•••</button>
    <div class="event-row"><div class="event-datebox"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT",{month:"short"}).toUpperCase()}</div>
    <div><h3>${linkify(e.title)}</h3><small>${esc(timeLabel(e))}${e.location?` · ${linkify(e.location)}`:""}</small>${e.description?`<p style="margin-top:7px">${linkify(e.description,true)}</p>`:""}</div></div>
    ${openMenu===`event:${e.id}` ? menuHtml("event",e.id):""}
  </article>`;
}
function menuHtml(type,id){
  const notify = type==="post" ? `<button data-notify-post="${id}">🔔 Invia notifica</button>` : "";
  return `<div class="action-menu">${notify}<button data-edit="${type}:${id}">Modifica</button><button class="danger" data-delete="${type}:${id}">Elimina</button></div>`;
}

function renderHome(){
  renderHero();
  const today=events.filter(e=>onDate(e,iso())).sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));
  $("#todayEvents").innerHTML=today.length?today.map(miniEvent).join(""):`<div class="empty-state">Nessun impegno per oggi. Giornata libera 🙂</div>`;
  $("#latestPost").innerHTML=posts[0]?postCard(posts[0],false):`<div class="empty-state">La bacheca è ancora vuota.</div>`;
  const seen=Number(localStorage.getItem("casaLastSeenPostTs")||0);
  const unseen=posts.filter(p=>new Date(p.created_at).getTime()>seen).length;
  $("#boardBadge").textContent=unseen; $("#boardBadge").classList.toggle("hidden",!unseen);
}

function renderBoard(){
  $("#categoryFilters").innerHTML=CATEGORIES.map(c=>`<button class="filter-chip ${c===selectedCategory?"active":""}" data-category="${esc(c)}">${c==="Tutte"?"Tutte":`${emoji[c]||"📌"} ${esc(c)}`}</button>`).join("");
  const list=selectedCategory==="Tutte"?posts:posts.filter(p=>p.category===selectedCategory);
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
    const s=iso(d), outside=d.getMonth()!==m, today=s===iso(), has=events.some(e=>onDate(e,s)), sel=s===selectedDate;
    cells.push(`<button class="calendar-day ${outside?"outside":""} ${today?"today":""} ${has?"has-event":""} ${sel?"selected":""}" data-date="${s}">${d.getDate()}</button>`);
  }
  $("#calendarGrid").innerHTML=cells.join("");
  let list;
  if(selectedDate){ list=events.filter(e=>onDate(e,selectedDate)); $("#calendarListTitle").textContent="Eventi del "+dateFrom(selectedDate).toLocaleDateString("it-IT",{day:"numeric",month:"long"}); }
  else { list=events.filter(e=>(e.end_date||e.start_date)>=iso()); $("#calendarListTitle").textContent="In arrivo"; }
  list.sort((a,b)=>(a.start_date+(a.start_time||"")).localeCompare(b.start_date+(b.start_time||"")));
  $("#eventList").innerHTML=list.length?list.map(eventCard).join(""):`<div class="empty-state">Nessun evento da mostrare.</div>`;
}

function renderAll(){ renderHome(); renderBoard(); renderCalendar(); updateNotificationUI(); }

async function loadData(){
  const [p,e]=await Promise.all([
    supabase.from("casa_family_posts").select("*").order("created_at",{ascending:false}),
    supabase.from("casa_family_events").select("*").order("start_date",{ascending:true}).order("start_time",{ascending:true})
  ]);
  if(p.error||e.error){ console.error(p.error||e.error); $("#todayEvents").innerHTML=`<div class="error-box">Non riesco a collegarmi al diario di famiglia. Riprova tra poco.</div>`; return; }
  posts=p.data||[]; events=e.data||[]; renderAll();
}

function authorSelector(current){
  const sel=current||localStorage.getItem("casaAuthor")||"Angelo";
  return `<div class="field"><label>Chi sta pubblicando?</label><div class="author-pills">${AUTHORS.map(a=>`<button type="button" class="author-pill ${a===sel?"active":""}" data-author="${a}">${a}</button>`).join("")}</div><input type="hidden" name="author" value="${sel}"></div>`;
}
function categorySelect(current="Famiglia"){
  return `<div class="field"><label>Categoria</label><select name="category">${CATEGORIES.filter(c=>c!=="Tutte").map(c=>`<option ${c===current?"selected":""}>${c}</option>`).join("")}</select></div>`;
}
function postFields(p={}){
  return `<div class="field"><label>Titolo</label><input name="title" maxlength="100" required value="${esc(p.title||"")}" placeholder="Es. Pranzo di domenica"></div>
  ${categorySelect(p.category)}
  <div class="field"><label>Messaggio</label><textarea name="body" required placeholder="Scrivi qui la tua comunicazione…">${esc(p.body||"")}</textarea></div>
  ${authorSelector(p.author)}`;
}
function eventFields(e={}){
  return `<div class="field"><label>Titolo</label><input name="title" maxlength="100" required value="${esc(e.title||"")}" placeholder="Es. Cena tutti insieme"></div>
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
  if(type==="post") row={title:String(fd.get("title")||"").trim(),body:String(fd.get("body")||"").trim(),category:fd.get("category"),author,updated_at:new Date().toISOString()};
  else row={title:String(fd.get("title")||"").trim(),start_date:fd.get("start_date"),start_time:fd.get("all_day")?null:(fd.get("start_time")||null),end_date:fd.get("end_date")||null,all_day:!!fd.get("all_day"),location:String(fd.get("location")||"").trim()||null,description:String(fd.get("description")||"").trim()||null,category:fd.get("category"),author,updated_at:new Date().toISOString()};
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
async function enablePush(){
  const supported="Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  if(!supported){toast("Questo dispositivo non supporta le notifiche web");return;}
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
        deviceLabel:navigator.userAgent.slice(0,180)
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
    const v=ev.target.closest("[data-view]"); if(v){setView(v.dataset.view);return;}
    if(ev.target.closest("#globalAdd")){openChoice();return;}
    if(ev.target.closest("[data-close-sheet]")){closeChoice();return;}
    if(ev.target.closest("[data-close-form]")){closeForm();return;}
    const add=ev.target.closest("[data-add]"); if(add){openForm(add.dataset.add);return;}
    const c=ev.target.closest("[data-category]"); if(c){selectedCategory=c.dataset.category;renderBoard();return;}
    const d=ev.target.closest("[data-date]"); if(d){selectedDate=selectedDate===d.dataset.date?null:d.dataset.date;renderCalendar();return;}
    const a=ev.target.closest("[data-author]"); if(a){ $$(".author-pill").forEach(x=>x.classList.toggle("active",x===a)); a.closest(".field").querySelector("input[name=author]").value=a.dataset.author; return; }
    const m=ev.target.closest("[data-menu]"); if(m){openMenu=openMenu===m.dataset.menu?null:m.dataset.menu;renderBoard();renderCalendar();return;}
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
}
function realtime(){
  supabase.channel("casa-family-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"casa_family_posts"},loadData)
    .on("postgres_changes",{event:"*",schema:"public",table:"casa_family_events"},loadData)
    .subscribe();
}
async function init(){
  bind();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.error);
  setView(new URL(location.href).searchParams.get("view")||"home",false);
  updateNotificationUI(); await loadData(); realtime();
}
init();
