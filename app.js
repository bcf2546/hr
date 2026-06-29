/* ============================================================
 * BCF ระบบแจ้งลา — app.js — v1.0 — 2026-06-29
 * ฝั่งพนักงาน: เลือกคน / ยืนยัน / แจ้งลา / ประวัติ
 * (มี helper ที่ admin.js เรียกใช้ร่วม: $, esc, apiGet, apiPost,
 *  toast, avatarHTML, avatarColor, initials, imgErr)
 * ============================================================ */
window.BCF_VER = window.BCF_VER || {};
window.BCF_VER.app = '1.0';

/* ---------- State ---------- */
let allEmployees = [], currentNat = 'TH', selectedEmp = null;
let selectedSlots = new Set(), selectedType = 'ลากิจ', sundayWork = false;

/* ---------- Helpers (ใช้ร่วมกับ admin.js) ---------- */
const $ = id => document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function avatarColor(name){let h=0;for(let i=0;i<(name||'').length;i++)h=name.charCodeAt(i)+((h<<5)-h);return 'hsl('+(Math.abs(h)%360)+',55%,52%)';}
function initials(name){const n=(name||'?').trim();return n.charAt(0)||'?';}
function toast(msg,isErr){const t=$('toast');t.textContent=msg;t.className='toast show'+(isErr?' err':'');clearTimeout(t._t);t._t=setTimeout(()=>{t.className='toast';},2600);}

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
function avatarHTML(cls,name,photoUrl,id){
  const idAttr=id?(' id="'+id+'"'):'';
  if(photoUrl) return '<img class="'+cls+'"'+idAttr+' src="'+esc(photoUrl)+'" loading="lazy" data-nm="'+esc(name)+'" onerror="imgErr(this)">';
  return '<div class="'+cls+'"'+idAttr+' style="background:'+avatarColor(name)+'">'+esc(initials(name))+'</div>';
}

function nameFor(e,nat){return nat==='MM'?(e.name_mm||e.name_th):e.name_th;}
function subFor(e,nat){return nat==='MM'?(e.name_mm?e.name_th:''):'';}

/* ---------- โหลด + แสดงรายชื่อ ---------- */
async function loadEmployees(){
  $('empContainer').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลดรายชื่อ...</div>';
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
    return '<button class="empCard" data-id="'+esc(e.emp_id)+'">'+avatarHTML('avatar',nm,e.photo_url,'')+
      '<div class="nm">'+esc(nm)+(sub?'<small>'+esc(sub)+'</small>':'')+'</div></button>';
  }).join('')+'</div>';
  $('empContainer').querySelectorAll('.empCard').forEach(c=>{c.onclick=()=>openConfirm(c.dataset.id);});
}

/* ---------- ยืนยันตัวตน (กันกดผิด) ---------- */
function openConfirm(empId){
  const e=allEmployees.find(x=>x.emp_id===empId); if(!e) return;
  selectedEmp=e;
  const nm=nameFor(e,currentNat), sub=subFor(e,currentNat);
  $('cmAvatar').outerHTML=avatarHTML('bigAvatar',nm,e.photo_url,'cmAvatar');
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
  $('pbAvatar').outerHTML=avatarHTML('pa',nm,e.photo_url,'pbAvatar');
  $('pbName').textContent=nm;
  $('pbSub').textContent=e.emp_id+(e.name_mm&&e.nationality==='MM'?' · '+e.name_th:'');
  resetForm(); switchSubTab('leave'); window.scrollTo(0,0);
}
function resetForm(){
  selectedSlots.clear(); selectedType='ลากิจ'; sundayWork=false;
  $('leaveDate').value=todayStr(); $('reasonInput').value='';
  $('leaveTypeChips').querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.type==='ลากิจ'));
  renderTimeline(); updateHourTotal(); updateStatus();
}

/* ---------- ไทม์ไลน์เวลา ---------- */
function renderTimeline(){
  $('timeline').innerHTML=DAY_BLOCKS.map(b=>{
    if(b.lunch) return '<div class="slot lunch"><div class="tk">🍴</div><div class="tm">'+b.label+'</div><span class="lz">พักเที่ยง</span></div>';
    const on=selectedSlots.has(b.v);
    return '<button class="slot'+(on?' on':'')+'" data-slot="'+b.v+'"><div class="tk">'+(on?'✓':'')+'</div><div class="tm">'+b.v+'</div></button>';
  }).join('');
  $('timeline').querySelectorAll('.slot[data-slot]').forEach(s=>{
    s.onclick=()=>{const v=s.dataset.slot; if(selectedSlots.has(v))selectedSlots.delete(v); else selectedSlots.add(v); renderTimeline(); updateHourTotal();};
  });
}
function updateHourTotal(){
  const n=selectedSlots.size, el=$('hourTotal');
  el.textContent=n>=8?'รวม 8 ชม. (เต็มวัน)':('รวม '+n+' ชม.');
  el.className='hourTotal'+(n===0?' zero':'');
}

/* ---------- สถานะการกรอก + วันอาทิตย์ ---------- */
function updateStatus(){
  const d=$('leaveDate').value, sw=$('statusWrap'), suw=$('sundayWrap');
  if(!d){sw.innerHTML='';suw.innerHTML='';return;}
  const t=todayStr(); let cls,txt,mm;
  if(d>t){cls='st-adv';txt='ลาล่วงหน้า';mm='ကြိုတင်ခွင့်';}
  else if(d===t){cls='st-same';txt='ลากระทันหัน (วันนี้)';mm='ယနေ့ ခွင့်';}
  else{cls='st-back';txt='ลาย้อนหลัง';mm='နောက်ကြောင်းပြန် ခွင့်';}
  sw.innerHTML='<div class="statusBadge '+cls+'"><span class="st-dot"></span>'+txt+' · <span style="font-weight:500">'+mm+'</span></div>';
  const dt=new Date(d+'T00:00:00');
  if(dt.getDay()===0){
    suw.innerHTML='<div class="sundayBox"><div class="sw-txt">วันนี้เป็น<b>วันอาทิตย์</b> ปกติเป็นวันหยุด<br>เปิดสวิตช์ถ้าวันนี้ต้องมาทำงาน<span class="mm" style="color:inherit">တနင်္ဂနွေ အလုပ်ဆင်းရက်ဖြစ်ရင် ဖွင့်ပါ</span></div><label class="switch"><input type="checkbox" id="sundaySwitch"'+(sundayWork?' checked':'')+'><span class="slider"></span></label></div>';
    $('sundaySwitch').onchange=ev=>{sundayWork=ev.target.checked;};
  }else{suw.innerHTML='';sundayWork=false;}
}

/* ---------- แท็บย่อย ---------- */
function switchSubTab(which){
  $('stLeave').classList.toggle('active',which==='leave');
  $('stHistory').classList.toggle('active',which==='history');
  $('paneLeave').classList.toggle('hidden',which!=='leave');
  $('paneHistory').classList.toggle('hidden',which!=='history');
  if(which==='history') loadHistory();
}

/* ---------- ส่งใบลา ---------- */
async function submitLeave(){
  const date=$('leaveDate').value;
  if(!date){toast('กรุณาเลือกวันที่',true);return;}
  if(selectedSlots.size===0){toast('กรุณาเลือกช่วงเวลาที่ลา',true);return;}
  const dt=new Date(date+'T00:00:00');
  if(dt.getDay()===0 && !sundayWork){toast('วันอาทิตย์เป็นวันหยุด — เปิดสวิตช์ถ้าต้องมาทำงาน',true);return;}
  const btn=$('submitBtn'); btn.disabled=true; const old=btn.innerHTML; btn.innerHTML='กำลังส่ง...';
  try{
    const res=await apiPost('submitLeave',{emp_id:selectedEmp.emp_id, leave_date:date, slots:[...selectedSlots], leave_type:selectedType, reason:$('reasonInput').value.trim()});
    if(!res.ok) throw new Error(res.error||'ส่งไม่สำเร็จ');
    showSuccess(res,date);
  }catch(err){toast(err.message,true); btn.disabled=false; btn.innerHTML=old;}
}
function showSuccess(res,date){
  $('submitBtn').disabled=false; $('submitBtn').innerHTML='ส่งใบลา <span class="sub">ခွင့်တင်မည်</span>';
  const stMap={'ลาล่วงหน้า':'🟢','ลากระทันหัน (วันเดียวกัน)':'🟡','ลาย้อนหลัง':'🔴'};
  const slots=[...selectedSlots].sort((a,b)=>TIME_SLOTS.indexOf(a)-TIME_SLOTS.indexOf(b));
  $('successSummary').innerHTML=
    '<div class="row"><span class="k">ชื่อ</span><span class="v">'+esc(res.name||selectedEmp.name_th)+'</span></div>'+
    '<div class="row"><span class="k">วันที่ลา</span><span class="v">'+esc(date)+'</span></div>'+
    '<div class="row"><span class="k">เวลา</span><span class="v">'+esc(slots.join(', '))+'</span></div>'+
    '<div class="row"><span class="k">จำนวน</span><span class="v">'+res.hours+' ชม.'+(res.is_full_day?' (เต็มวัน)':'')+'</span></div>'+
    '<div class="row"><span class="k">ประเภท</span><span class="v">'+esc(selectedType)+'</span></div>'+
    '<div class="row"><span class="k">สถานะ</span><span class="v">'+(stMap[res.filing_status]||'')+' '+esc(res.filing_status)+'</span></div>';
  $('screenForm').classList.add('hidden'); $('screenSuccess').classList.remove('hidden'); window.scrollTo(0,0);
}

/* ---------- ประวัติของฉัน ---------- */
async function loadHistory(){
  $('historyContainer').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>';
  try{
    const res=await apiGet('history',{emp_id:selectedEmp.emp_id});
    if(!res.ok) throw new Error(res.error||'load failed');
    const h=res.history||[];
    if(h.length===0){$('historyContainer').innerHTML='<div class="empEmpty">ยังไม่มีประวัติการลา</div>';return;}
    $('historyContainer').innerHTML=h.map(x=>{
      const c=x.filing_status.indexOf('ย้อนหลัง')>=0?'back':(x.filing_status.indexOf('กระทันหัน')>=0?'same':'adv');
      return '<div class="histItem '+c+'">'+
        '<div class="histTop"><span class="histDate">'+esc(x.leave_date)+'</span><span class="tag '+c+'">'+esc(x.filing_status)+'</span></div>'+
        '<div class="histMeta"><span><b>'+esc(x.leave_type)+'</b></span><span>⏰ '+esc(x.slots)+'</span><span>('+x.hours+' ชม.'+(x.is_full_day?' เต็มวัน':'')+')</span></div>'+
        (x.reason?'<div class="histReason">"'+esc(x.reason)+'"</div>':'')+
        '<div class="histReason" style="font-style:normal;margin-top:5px;font-size:12px;color:var(--muted-2)">แจ้งเมื่อ '+esc(x.filed_at)+'</div>'+
      '</div>';
    }).join('');
  }catch(err){$('historyContainer').innerHTML='<div class="empEmpty">⚠️ '+esc(err.message)+'</div>';}
}

/* ---------- ผูกปุ่มฝั่งพนักงาน ---------- */
$('tabTH').onclick=()=>{currentNat='TH';$('tabTH').classList.add('active');$('tabMM').classList.remove('active');renderEmployees();};
$('tabMM').onclick=()=>{currentNat='MM';$('tabMM').classList.add('active');$('tabTH').classList.remove('active');renderEmployees();};
$('searchInput').oninput=renderEmployees;
$('refreshBtn').onclick=()=>{loadEmployees();toast('รีเฟรชแล้ว');};
$('cmCancel').onclick=()=>$('confirmModal').classList.add('hidden');
$('cmConfirm').onclick=gotoForm;
$('confirmModal').onclick=e=>{if(e.target===$('confirmModal'))$('confirmModal').classList.add('hidden');};
$('changePersonBtn').onclick=()=>{$('screenForm').classList.add('hidden');$('screenSelect').classList.remove('hidden');window.scrollTo(0,0);};
$('stLeave').onclick=()=>switchSubTab('leave');
$('stHistory').onclick=()=>switchSubTab('history');
$('leaveDate').onchange=updateStatus;
$('leaveTypeChips').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{selectedType=c.dataset.type;$('leaveTypeChips').querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===c));});
$('allDayBtn').onclick=()=>{const all=selectedSlots.size>=8;selectedSlots.clear();if(!all)TIME_SLOTS.forEach(s=>selectedSlots.add(s));renderTimeline();updateHourTotal();};
$('submitBtn').onclick=submitLeave;
$('againBtn').onclick=gotoForm;
$('doneBtn').onclick=()=>{selectedEmp=null;$('screenSuccess').classList.add('hidden');$('screenSelect').classList.remove('hidden');loadEmployees();window.scrollTo(0,0);};

/* ---------- เริ่ม ---------- */
$('leaveDate').value=todayStr();
loadEmployees();
console.log('[BCF] app.js v' + window.BCF_VER.app);
