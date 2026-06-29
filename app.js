/* ============================================================
 * BCF ระบบแจ้งลา — app.js — v1.0 — 2026-06-29
 * ฝั่งพนักงาน: เลือกคน / ยืนยัน / แจ้งลา / ประวัติ
 * (มี helper ที่ admin.js เรียกใช้ร่วม: $, esc, apiGet, apiPost,
 *  toast, avatarHTML, avatarColor, initials, imgErr)
 * ============================================================ */
window.BCF_VER = window.BCF_VER || {};
window.BCF_VER.app = '1.7';

/* ---------- State ---------- */
let allEmployees = [], currentNat = 'TH', selectedEmp = null;
let selectedSlots = new Set(), selectedType = 'ลากิจ', override = false;
let dayMode = 'single';          // 'single' | 'range'
let holidayMap = {};             // 'yyyy-MM-dd' -> ชื่อวันหยุด

/* ---------- Helpers (ใช้ร่วมกับ admin.js) ---------- */
const $ = id => document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function avatarColor(name){let h=0;for(let i=0;i<(name||'').length;i++)h=name.charCodeAt(i)+((h<<5)-h);return 'hsl('+(Math.abs(h)%360)+',55%,52%)';}
function initials(name){const n=(name||'?').trim();return n.charAt(0)||'?';}
function toast(msg,isErr){const t=$('toast');t.textContent=msg;t.className='toast show'+(isErr?' err':'');clearTimeout(t._t);t._t=setTimeout(()=>{t.className='toast';},2600);}
function debounce(fn,ms){let t;return function(){const a=arguments,c=this;clearTimeout(t);t=setTimeout(()=>fn.apply(c,a),ms);};}
function sizedUrl(u,size){return (u&&size)?u.replace(/=w\d+$/,'=w'+size):u;}
const AM_SLOTS=TIME_SLOTS.slice(0,4);   // 08:00-12:00
const PM_SLOTS=TIME_SLOTS.slice(4,8);   // 13:00-17:00
function fmtDMY(s){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||''); return m?(m[3]+'/'+m[2]+'/'+m[1]):(s||''); }
function deviceInfo(){
  const ua=navigator.userAgent||'';
  let os='อื่นๆ';
  if(/iPhone|iPad|iPod/i.test(ua))os='iPhone/iPad'; else if(/Android/i.test(ua))os='Android';
  else if(/Windows/i.test(ua))os='Windows'; else if(/Mac/i.test(ua))os='Mac'; else if(/Linux/i.test(ua))os='Linux';
  let br='อื่นๆ';
  if(/Line/i.test(ua))br='LINE'; else if(/Edg/i.test(ua))br='Edge'; else if(/Chrome/i.test(ua))br='Chrome';
  else if(/CriOS/i.test(ua))br='Chrome'; else if(/FxiOS|Firefox/i.test(ua))br='Firefox'; else if(/Safari/i.test(ua))br='Safari';
  return os+' · '+br;
}

async function apiGet(action,params){
  const q=new URLSearchParams(Object.assign({action:action},params||{})).toString();
  const r=await fetch(API_URL+'?'+q); return r.json();
}
async function apiPost(action,data){
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:action},data||{}))});
  return r.json();
}

/* รูปพนักงาน + fallback เป็นอักษรย่อ (ถ้าโหลดรูปไม่ได้) */
function imgErr(img){
  const name=img.getAttribute('data-nm')||'';
  const d=document.createElement('div');
  d.className=img.className;
  d.style.background=avatarColor(name);
  d.textContent=initials(name);
  if(img.id) d.id=img.id;
  img.replaceWith(d);
}
function avatarHTML(cls,name,photoUrl,id,size){
  const idAttr=id?(' id="'+id+'"'):'';
  const url=sizedUrl(photoUrl,size);
  if(url) return '<img class="'+cls+'"'+idAttr+' src="'+esc(url)+'" loading="lazy" decoding="async" data-nm="'+esc(name)+'" onerror="imgErr(this)">';
  return '<div class="'+cls+'"'+idAttr+' style="background:'+avatarColor(name)+'">'+esc(initials(name))+'</div>';
}

function nameFor(e,nat){return nat==='MM'?(e.name_mm||e.name_th):e.name_th;}
function subFor(e,nat){return nat==='MM'?(e.name_mm?e.name_th:''):'';}

/* ---------- โหลด + แสดงรายชื่อ ---------- */
async function loadEmployees(){
  $('empContainer').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลดรายชื่อ...</div>';
  loadHolidays();
  try{
    const res=await apiGet('employees');
    if(!res.ok) throw new Error(res.error||'load failed');
    allEmployees=res.employees||[];
    $('cntTH').textContent=allEmployees.filter(e=>e.nationality==='TH').length+' คน';
    $('cntMM').textContent=allEmployees.filter(e=>e.nationality==='MM').length+' คน';
    renderEmployees();
  }catch(err){
    $('empContainer').innerHTML='<div class="empEmpty">⚠️ โหลดข้อมูลไม่สำเร็จ<br><small>'+esc(err.message)+'</small><br><br>ตรวจว่า Web app URL ถูกต้อง และ deploy แบบ Anyone</div>';
  }
}

function renderEmployees(){
  const q=$('searchInput').value.trim().toLowerCase();
  let list=allEmployees.filter(e=>e.nationality===currentNat);
  if(q) list=list.filter(e=>(e.name_th||'').toLowerCase().includes(q)||(e.name_mm||'').toLowerCase().includes(q));
  if(list.length===0){$('empContainer').innerHTML='<div class="empEmpty">ไม่พบรายชื่อ'+(q?' "'+esc(q)+'"':'')+'</div>';return;}
  $('empContainer').innerHTML='<div class="empGrid">'+list.map(e=>{
    const nm=nameFor(e,currentNat), sub=subFor(e,currentNat);
    return '<button class="empCard" data-id="'+esc(e.emp_id)+'">'+avatarHTML('avatar',nm,e.photo_url,'',160)+
      '<div class="nm">'+esc(nm)+(sub?'<small>'+esc(sub)+'</small>':'')+'</div></button>';
  }).join('')+'</div>';
  $('empContainer').querySelectorAll('.empCard').forEach(c=>{c.onclick=()=>openConfirm(c.dataset.id);});
}

/* ---------- ยืนยันตัวตน (กันกดผิด) ---------- */
function openConfirm(empId){
  const e=allEmployees.find(x=>x.emp_id===empId); if(!e) return;
  selectedEmp=e;
  const nm=nameFor(e,currentNat), sub=subFor(e,currentNat);
  $('cmAvatar').outerHTML=avatarHTML('bigAvatar',nm,e.photo_url,'cmAvatar',300);
  $('cmName').innerHTML=esc(nm)+(sub?'<small>'+esc(sub)+'</small>':'');
  $('confirmModal').classList.remove('hidden');
}

/* ---------- ไปหน้าแจ้งลา ---------- */
function gotoForm(){
  $('confirmModal').classList.add('hidden');
  $('screenSelect').classList.add('hidden');
  $('screenSuccess').classList.add('hidden');
  $('screenForm').classList.remove('hidden');
  const e=selectedEmp, nm=nameFor(e,e.nationality);
  $('pbAvatar').outerHTML=avatarHTML('pa',nm,e.photo_url,'pbAvatar',120);
  $('pbName').textContent=nm;
  $('pbSub').textContent=e.emp_id+(e.name_mm&&e.nationality==='MM'?' · '+e.name_th:'');
  // พม่า: ปิดการใช้ลาพักร้อน (ยังไม่เปิดใช้)
  const vacaChip=$('leaveTypeChips').querySelector('[data-type="ลาพักร้อน"]');
  if(e.nationality==='MM') vacaChip.classList.add('disabled'); else vacaChip.classList.remove('disabled');
  resetForm(); switchSubTab('leave'); window.scrollTo(0,0);
}
function resetForm(){
  selectedSlots.clear(); selectedType='ลากิจ'; override=false; pendingPayload=null;
  $('leaveDate').value=todayStr(); $('reasonInput').value='';
  $('dateFrom').value=todayStr(); $('dateTo').value=todayStr();
  $('leaveTypeChips').querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.type==='ลากิจ'));
  markQuick(null);
  setDayMode('single');
  applyTypeMode();
  renderTimeline(); updateHourTotal();
}

/* ---------- ไทม์ไลน์เวลา ---------- */
function markQuick(which){
  ['btnFull','btnAM','btnPM'].forEach(id=>$(id).classList.toggle('active', id===which));
}
function setQuick(slots,which){
  selectedSlots.clear(); slots.forEach(s=>selectedSlots.add(s));
  markQuick(which); renderTimeline(); updateHourTotal();
}
function syncQuickHighlight(){
  // ไฮไลต์ปุ่มลัดให้ตรงกับ slot ที่เลือกอยู่ (ถ้าตรงพอดี)
  const arr=[...selectedSlots].sort((a,b)=>TIME_SLOTS.indexOf(a)-TIME_SLOTS.indexOf(b)).join(',');
  if(arr===TIME_SLOTS.join(',')) markQuick('btnFull');
  else if(arr===AM_SLOTS.join(',')) markQuick('btnAM');
  else if(arr===PM_SLOTS.join(',')) markQuick('btnPM');
  else markQuick(null);
}
function renderTimeline(){
  $('timeline').innerHTML=DAY_BLOCKS.map(b=>{
    if(b.lunch) return '<div class="slot lunch"><div class="tk">🍴</div><div class="tm">'+b.label+'</div><span class="lz">พักเที่ยง</span></div>';
    const on=selectedSlots.has(b.v);
    return '<button class="slot'+(on?' on':'')+'" data-slot="'+b.v+'"><div class="tk">'+(on?'✓':'')+'</div><div class="tm">'+b.v+'</div></button>';
  }).join('');
  $('timeline').querySelectorAll('.slot[data-slot]').forEach(s=>{
    s.onclick=()=>{const v=s.dataset.slot; if(selectedSlots.has(v))selectedSlots.delete(v); else selectedSlots.add(v); renderTimeline(); updateHourTotal(); syncQuickHighlight();};
  });
}

/* ---------- ประเภทลา → ปรับโหมด (พักร้อน = หลายวัน ไม่เลือกเวลา) ---------- */
function applyTypeMode(){
  const isVaca = (selectedType==='ลาพักร้อน');
  $('timeBlock').classList.toggle('hidden', isVaca);
  $('dayModeToggle').classList.toggle('hidden', isVaca);
  $('vacaNote').classList.toggle('hidden', !isVaca);
  if(isVaca){
    setDayMode('range');                 // พักร้อน = ช่วงวัน (วันเดียวก็ได้)
    selectedSlots.clear(); TIME_SLOTS.forEach(s=>selectedSlots.add(s)); // นับเต็มวัน
  }
}
function updateHourTotal(){
  const n=selectedSlots.size, el=$('hourTotal');
  el.textContent=n>=8?'รวม 8 ชม. (เต็มวัน)':('รวม '+n+' ชม.');
  el.className='hourTotal'+(n===0?' zero':'');
}

/* ---------- วันหยุดบริษัท ---------- */
async function loadHolidays(){
  try{ const r=await apiGet('holidays'); if(r.ok){ holidayMap={}; (r.holidays||[]).forEach(h=>{holidayMap[h.date]=h.name;}); } }catch(e){}
}

/* ---------- โหมดวันเดียว/หลายวัน ---------- */
function setDayMode(m){
  dayMode=m;
  $('modeSingle').classList.toggle('active',m==='single');
  $('modeRange').classList.toggle('active',m==='range');
  $('singleDateWrap').classList.toggle('hidden',m!=='single');
  $('rangeDateWrap').classList.toggle('hidden',m!=='range');
  updateStatus();
}

/* ---------- สถานะการกรอก + วันอาทิตย์/วันหยุด ---------- */
function overrideBox(th,mm){
  return '<div class="sundayBox"><div class="sw-txt">'+th+'<span class="mm" style="color:inherit">'+mm+'</span></div><label class="switch"><input type="checkbox" id="daySwitch"><span class="slider"></span></label></div>';
}
function updateStatus(){
  const sw=$('statusWrap'), suw=$('sundayWrap');
  if(dayMode==='range'){ sw.innerHTML=''; suw.innerHTML=''; override=false; return; }
  const d=$('leaveDate').value;
  if(!d){sw.innerHTML='';suw.innerHTML='';return;}
  const t=todayStr(); let cls,txt,mm;
  if(d>t){cls='st-adv';txt='ลาล่วงหน้า';mm='ကြိုတင်ခွင့်';}
  else if(d===t){cls='st-same';txt='ลากระทันหัน (วันนี้)';mm='ယနေ့ ခွင့်';}
  else{cls='st-back';txt='ลาย้อนหลัง';mm='နောက်ကြောင်းပြန် ခွင့်';}
  sw.innerHTML='<div class="statusBadge '+cls+'"><span class="st-dot"></span>'+txt+' · <span style="font-weight:500">'+mm+'</span></div>';
  const dt=new Date(d+'T00:00:00'), hol=holidayMap[d];
  override=false;
  if(hol){
    suw.innerHTML=overrideBox('วันนี้เป็น<b>วันหยุด ('+esc(hol)+')</b> ปกติไม่ต้องลา<br>เปิดสวิตช์ถ้าวันนี้ต้องมาทำงาน','ဒီနေ့ ပိတ်ရက်ဖြစ်ရင် ဖွင့်ပါ');
    $('daySwitch').onchange=ev=>{override=ev.target.checked;};
  } else if(dt.getDay()===0){
    suw.innerHTML=overrideBox('วันนี้เป็น<b>วันอาทิตย์</b> ปกติเป็นวันหยุด<br>เปิดสวิตช์ถ้าวันนี้ต้องมาทำงาน','တနင်္ဂနွေ ဆင်းရင် ဖွင့်ပါ');
    $('daySwitch').onchange=ev=>{override=ev.target.checked;};
  } else { suw.innerHTML=''; }
}

/* ---------- แท็บย่อย ---------- */
function switchSubTab(which){
  $('stLeave').classList.toggle('active',which==='leave');
  $('stHistory').classList.toggle('active',which==='history');
  $('paneLeave').classList.toggle('hidden',which!=='leave');
  $('paneHistory').classList.toggle('hidden',which!=='history');
  if(which==='history') loadHistory();
}

/* ---------- ส่งใบลา (มีป๊อปอัพยืนยันก่อน) ---------- */
let pendingPayload=null;
function buildLeavePayload(){
  if(selectedSlots.size===0){toast('กรุณาเลือกช่วงเวลาที่ลา',true);return null;}
  const slots=[...selectedSlots].sort((a,b)=>TIME_SLOTS.indexOf(a)-TIME_SLOTS.indexOf(b));
  const reason=$('reasonInput').value.trim();
  const nm=nameFor(selectedEmp,selectedEmp.nationality);
  if(dayMode==='range'){
    const from=$('dateFrom').value, to=$('dateTo').value;
    if(!from||!to){toast('กรุณาเลือกช่วงวัน (จาก-ถึง)',true);return null;}
    if(to<from){toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',true);return null;}
    const sm='<div class="row"><span class="k">ชื่อ</span><span class="v">'+esc(nm)+'</span></div>'+
      '<div class="row"><span class="k">ช่วงวัน</span><span class="v">'+esc(from)+' ถึง '+esc(to)+'</span></div>'+
      '<div class="row"><span class="k">เวลา/วัน</span><span class="v">'+esc(slots.join(', '))+'</span></div>'+
      '<div class="row"><span class="k">ประเภท</span><span class="v">'+esc(selectedType)+'</span></div>';
    return {payload:{emp_id:selectedEmp.emp_id, date_from:from, date_to:to, slots:slots, leave_type:selectedType, reason:reason, device:deviceInfo()}, summaryHTML:sm};
  }
  const date=$('leaveDate').value;
  if(!date){toast('กรุณาเลือกวันที่',true);return null;}
  const dt=new Date(date+'T00:00:00');
  if(holidayMap[date] && !override){toast('วันนี้เป็นวันหยุด ('+holidayMap[date]+') — เปิดสวิตช์ถ้าต้องมาทำงาน',true);return null;}
  if(dt.getDay()===0 && !override){toast('วันอาทิตย์เป็นวันหยุด — เปิดสวิตช์ถ้าต้องมาทำงาน',true);return null;}
  const t=todayStr();
  const stTxt=date>t?'🟢 ลาล่วงหน้า':(date===t?'🟡 ลากระทันหัน (วันนี้)':'🔴 ลาย้อนหลัง');
  const sm='<div class="row"><span class="k">ชื่อ</span><span class="v">'+esc(nm)+'</span></div>'+
    '<div class="row"><span class="k">วันที่ลา</span><span class="v">'+esc(date)+'</span></div>'+
    '<div class="row"><span class="k">เวลา</span><span class="v">'+esc(slots.join(', '))+'</span></div>'+
    '<div class="row"><span class="k">จำนวน</span><span class="v">'+slots.length+' ชม.'+(slots.length>=8?' (เต็มวัน)':'')+'</span></div>'+
    '<div class="row"><span class="k">ประเภท</span><span class="v">'+esc(selectedType)+'</span></div>'+
    '<div class="row"><span class="k">สถานะ</span><span class="v">'+stTxt+'</span></div>';
  return {payload:{emp_id:selectedEmp.emp_id, leave_date:date, slots:slots, leave_type:selectedType, reason:reason, override:override?'1':'', device:deviceInfo()}, summaryHTML:sm};
}
function askConfirmSubmit(){
  const b=buildLeavePayload(); if(!b)return;
  pendingPayload=b.payload;
  $('confirmSummary').innerHTML=b.summaryHTML;
  $('confirmSubmitModal').classList.remove('hidden');
}
async function doSubmit(){
  $('confirmSubmitModal').classList.add('hidden');
  const p=pendingPayload; if(!p)return;
  const btn=$('submitBtn'); btn.disabled=true; const old=btn.innerHTML; btn.innerHTML='กำลังส่ง...';
  try{
    const res=await apiPost('submitLeave', p);
    if(!res.ok) throw new Error(res.error||'ส่งไม่สำเร็จ');
    showSuccess(res,p);
  }catch(err){toast(err.message,true);}
  btn.disabled=false; btn.innerHTML=old; pendingPayload=null;
}
function showSuccess(res,p){
  const stMap={'ลาล่วงหน้า':'🟢','ลากระทันหัน (วันเดียวกัน)':'🟡','ลาย้อนหลัง':'🔴'};
  let html;
  if(res.multi){
    const dates=(res.created||[]).map(c=>fmtDMY(c.date)).join(', ');
    html='<div class="row"><span class="k">ผลการลา</span><span class="v">สำเร็จ '+res.created_count+' วัน</span></div>'+
      '<div class="row"><span class="k">วันที่ลา</span><span class="v">'+esc(dates)+'</span></div>'+
      '<div class="row"><span class="k">เวลา/วัน</span><span class="v">'+res.hours_each+' ชม.</span></div>'+
      (res.skipped&&res.skipped.length?('<div class="row"><span class="k">ข้าม</span><span class="v">'+res.skipped.length+' วัน (หยุด/ซ้ำ)</span></div>'):'');
  } else {
    const slots=[...selectedSlots].sort((a,b)=>TIME_SLOTS.indexOf(a)-TIME_SLOTS.indexOf(b));
    html='<div class="row"><span class="k">ชื่อ</span><span class="v">'+esc(res.name||selectedEmp.name_th)+'</span></div>'+
      '<div class="row"><span class="k">วันที่ลา</span><span class="v">'+esc(fmtDMY((p&&p.leave_date)||''))+'</span></div>'+
      '<div class="row"><span class="k">เวลา</span><span class="v">'+esc(slots.join(', '))+'</span></div>'+
      '<div class="row"><span class="k">จำนวน</span><span class="v">'+res.hours+' ชม.'+(res.is_full_day?' (เต็มวัน)':'')+'</span></div>'+
      '<div class="row"><span class="k">ประเภท</span><span class="v">'+esc(selectedType)+'</span></div>'+
      '<div class="row"><span class="k">สถานะ</span><span class="v">'+(stMap[res.filing_status]||'')+' '+esc(res.filing_status)+'</span></div>';
  }
  if(res.pending_approval){
    html = '<div class="row" style="background:var(--amber-bg);border:1.5px solid var(--amber-line);border-radius:9px;padding:10px;margin-bottom:8px"><span class="k" style="color:#8a5a00">🌴 ลาพักร้อน</span><span class="v" style="color:#8a5a00;font-weight:800">รออนุมัติจากหัวหน้า</span></div>' + html;
  }
  $('successSummary').innerHTML=html;
  $('screenForm').classList.add('hidden'); $('screenSuccess').classList.remove('hidden'); window.scrollTo(0,0);
}

/* ---------- ประวัติของฉัน (+ ยกเลิกใบลา) ---------- */
async function loadHistory(){
  $('historyContainer').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>';
  try{
    const res=await apiGet('history',{emp_id:selectedEmp.emp_id});
    if(!res.ok) throw new Error(res.error||'load failed');
    const h=res.history||[];
    if(h.length===0){$('historyContainer').innerHTML='<div class="empEmpty">ยังไม่มีประวัติการลา</div>';return;}
    $('historyContainer').innerHTML=h.map(x=>{
      const c=x.filing_status.indexOf('ย้อนหลัง')>=0?'back':(x.filing_status.indexOf('กระทันหัน')>=0?'same':'adv');
      const cancelBtn=x.can_cancel?'<button class="btn btn-line btn-block" style="margin-top:10px;padding:10px" data-cancel="'+esc(x.leave_id)+'">✕ ยกเลิกใบลานี้ · ပယ်ဖျက်</button>':'';
      const apMap={'รออนุมัติ':['#8a5a00','var(--amber-bg)','var(--amber-line)','⏳ รออนุมัติ'],'อนุมัติ':['#1a7f4b','#E2F5EB','#9ad9b8','✅ อนุมัติแล้ว'],'ไม่อนุมัติ':['#b3261e','#FDE7E7','#f2b8b5','❌ ไม่อนุมัติ']};
      const ap=apMap[x.approval_status];
      const apBadge=ap?'<div style="margin-top:8px;display:inline-block;font-size:12.5px;font-weight:800;color:'+ap[0]+';background:'+ap[1]+';border:1.5px solid '+ap[2]+';padding:5px 10px;border-radius:8px">'+ap[3]+'</div>':'';
      return '<div class="histItem '+c+'">'+
        '<div class="histTop"><span class="histDate">'+esc(fmtDMY(x.leave_date))+'</span><span class="tag '+c+'">'+esc(x.filing_status)+'</span></div>'+
        '<div class="histMeta"><span><b>'+esc(x.leave_type)+'</b></span><span>⏰ '+esc(x.slots)+'</span><span>('+x.hours+' ชม.'+(x.is_full_day?' เต็มวัน':'')+')</span></div>'+
        (x.reason?'<div class="histReason">"'+esc(x.reason)+'"</div>':'')+
        apBadge+
        '<div class="histReason" style="font-style:normal;margin-top:5px;font-size:12px;color:var(--muted-2)">แจ้งเมื่อ '+esc(x.filed_at)+'</div>'+
        cancelBtn+
      '</div>';
    }).join('');
    $('historyContainer').querySelectorAll('[data-cancel]').forEach(b=>{b.onclick=()=>cancelMyLeave(b.dataset.cancel);});
  }catch(err){$('historyContainer').innerHTML='<div class="empEmpty">⚠️ '+esc(err.message)+'</div>';}
}
async function cancelMyLeave(leaveId){
  const reason=prompt('ยกเลิกใบลานี้?\n\nกรุณาใส่เหตุผลการยกเลิก (จำเป็น):','');
  if(reason===null) return;               // กดยกเลิก prompt
  if(!reason.trim()){ toast('ต้องใส่เหตุผลการยกเลิก',true); return; }
  try{
    const r=await apiPost('cancelLeave',{emp_id:selectedEmp.emp_id, leave_id:leaveId, reason_cancel:reason.trim()});
    if(r.ok){toast('ยกเลิกใบลาแล้ว');loadHistory();}
    else toast(r.error||'ยกเลิกไม่ได้',true);
  }catch(err){toast('ผิดพลาด',true);}
}

/* ---------- ผูกปุ่มฝั่งพนักงาน ---------- */
$('tabTH').onclick=()=>{currentNat='TH';$('tabTH').classList.add('active');$('tabMM').classList.remove('active');renderEmployees();};
$('tabMM').onclick=()=>{currentNat='MM';$('tabMM').classList.add('active');$('tabTH').classList.remove('active');renderEmployees();};
$('searchInput').oninput=debounce(renderEmployees,180);
$('refreshBtn').onclick=()=>{loadEmployees();toast('รีเฟรชแล้ว');};
$('cmCancel').onclick=()=>$('confirmModal').classList.add('hidden');
$('cmConfirm').onclick=gotoForm;
$('confirmModal').onclick=e=>{if(e.target===$('confirmModal'))$('confirmModal').classList.add('hidden');};
$('changePersonBtn').onclick=()=>{$('screenForm').classList.add('hidden');$('screenSelect').classList.remove('hidden');window.scrollTo(0,0);};
$('stLeave').onclick=()=>switchSubTab('leave');
$('stHistory').onclick=()=>switchSubTab('history');
$('leaveDate').onchange=updateStatus;
$('modeSingle').onclick=()=>setDayMode('single');
$('modeRange').onclick=()=>setDayMode('range');
$('leaveTypeChips').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{
  if(c.classList.contains('disabled'))return;
  selectedType=c.dataset.type;
  $('leaveTypeChips').querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===c));
  applyTypeMode(); updateHourTotal();
});
$('btnFull').onclick=()=>setQuick(TIME_SLOTS,'btnFull');
$('btnAM').onclick=()=>setQuick(AM_SLOTS,'btnAM');
$('btnPM').onclick=()=>setQuick(PM_SLOTS,'btnPM');
$('submitBtn').onclick=askConfirmSubmit;
$('csCancel').onclick=()=>{$('confirmSubmitModal').classList.add('hidden');pendingPayload=null;};
$('csConfirm').onclick=doSubmit;
$('confirmSubmitModal').onclick=e=>{if(e.target===$('confirmSubmitModal')){$('confirmSubmitModal').classList.add('hidden');pendingPayload=null;}};
$('againBtn').onclick=gotoForm;
$('doneBtn').onclick=()=>{selectedEmp=null;$('screenSuccess').classList.add('hidden');$('screenSelect').classList.remove('hidden');loadEmployees();window.scrollTo(0,0);};

/* ---------- เริ่ม ---------- */
$('leaveDate').value=todayStr();
loadEmployees();
console.log('[BCF] app.js v' + window.BCF_VER.app);
