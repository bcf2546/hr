/* ============================================================
 * BCF ระบบแจ้งลา — admin.js — v1.0 — 2026-06-29
 * ฝั่งแอดมิน: PIN / เพิ่ม-แก้-ลบพนักงาน / อัปรูป / ซ่อนชื่อ /
 *            สรุปการลา (Dashboard) / ตั้งค่า Telegram
 * ใช้ helper จาก app.js ($, esc, apiGet, apiPost, toast, ฯลฯ)
 * ============================================================ */
window.BCF_VER = window.BCF_VER || {};
window.BCF_VER.admin = '1.5';

let adminPin='', adminEmployees=[], editingEmpId=null, editingPhotoId='';
let adminLeaves=[], leaveStatuses=['ลาล่วงหน้า','ลากระทันหัน (วันเดียวกัน)','ลาย้อนหลัง'];

/* ---------- เข้าสู่ระบบด้วย PIN ---------- */
function openPinModal(){$('pinInput').value='';$('pinModal').classList.remove('hidden');setTimeout(()=>$('pinInput').focus(),100);}
async function submitPin(){
  const pin=$('pinInput').value.trim(); if(!pin)return;
  const btn=$('pinSubmit'); btn.disabled=true; btn.textContent='ตรวจสอบ...';
  try{
    const res=await apiGet('employees',{admin:'1',pin:pin});
    if(res.ok){adminPin=pin;$('pinModal').classList.add('hidden');adminEmployees=res.employees||[];openAdmin();}
    else toast('PIN ไม่ถูกต้อง',true);
  }catch(err){toast('เกิดข้อผิดพลาด',true);}
  btn.disabled=false; btn.textContent='เข้าสู่ระบบ';
}
function openAdmin(){
  $('adminScreen').classList.remove('hidden');
  const v=window.BCF_VER||{};
  $('verFoot').textContent='เวอร์ชัน · config '+(v.config||'?')+' · app '+(v.app||'?')+' · admin '+(v.admin||'?');
  switchAdminTab('emp'); renderAdminEmp();
}
function switchAdminTab(t){
  $('atEmp').classList.toggle('active',t==='emp');
  $('atDash').classList.toggle('active',t==='dash');
  $('atLeaves').classList.toggle('active',t==='leaves');
  $('atSet').classList.toggle('active',t==='set');
  $('adminEmpPane').classList.toggle('hidden',t!=='emp');
  $('adminDashPane').classList.toggle('hidden',t!=='dash');
  $('adminLeavesPane').classList.toggle('hidden',t!=='leaves');
  $('adminSetPane').classList.toggle('hidden',t!=='set');
  var d=new Date(), thisMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  if(t==='dash'){if(!$('dashMonth').value)$('dashMonth').value=thisMonth;loadDashboard();}
  if(t==='leaves'){if(!$('leavesMonth').value)$('leavesMonth').value=thisMonth;loadLeaves();}
  if(t==='set'){loadHolidaysAdmin();}
}

/* ---------- รายชื่อพนักงาน (แอดมิน) ---------- */
function renderAdminEmp(){
  const q=$('adminSearch').value.trim().toLowerCase();
  let list=adminEmployees.slice();
  if(q) list=list.filter(e=>(e.name_th||'').toLowerCase().includes(q)||(e.name_mm||'').toLowerCase().includes(q)||(e.emp_id||'').toLowerCase().includes(q));
  list.sort((a,b)=>(a.nationality===b.nationality?0:(a.nationality==='TH'?-1:1)));
  if(list.length===0){$('adminEmpList').innerHTML='<div class="empEmpty">ไม่พบพนักงาน</div>';return;}
  $('adminEmpList').innerHTML=list.map(e=>{
    const nm=e.name_th||e.name_mm;
    const flag=e.nationality==='MM'?'🇲🇲':'🇹🇭';
    const vis=e.visible?'<span class="pill">แสดง</span>':'<span class="pill off">ซ่อน</span>';
    return '<div class="adminRow">'+avatarHTML('ra',nm,e.photo_url,'',120)+
      '<div class="rn"><b>'+esc(nm)+'</b><small>'+flag+' '+esc(e.emp_id)+(e.note?' · '+esc(e.note):'')+' '+vis+'</small></div>'+
      '<button class="miniBtn" data-act="edit" data-id="'+esc(e.emp_id)+'">แก้</button>'+
      '<button class="miniBtn hide" data-act="hide" data-id="'+esc(e.emp_id)+'">'+(e.visible?'ซ่อน':'แสดง')+'</button>'+
      '<button class="miniBtn del" data-act="del" data-id="'+esc(e.emp_id)+'">ลบ</button>'+
    '</div>';
  }).join('');
  $('adminEmpList').querySelectorAll('.miniBtn').forEach(b=>{b.onclick=()=>adminAction(b.dataset.act,b.dataset.id);});
}
async function adminAction(act,id){
  const e=adminEmployees.find(x=>x.emp_id===id); if(!e) return;
  if(act==='edit'){openEmpModal(e);return;}
  if(act==='hide'){
    const r=await apiPost('toggleVisible',{pin:adminPin,emp_id:id});
    if(r.ok){e.visible=r.visible;renderAdminEmp();toast(r.visible?'แสดงชื่อแล้ว':'ซ่อนชื่อแล้ว');}else toast(r.error||'ผิดพลาด',true);
    return;
  }
  if(act==='del'){
    if(!confirm('ลบ "'+(e.name_th||e.name_mm)+'" ออกจากระบบ?\n(ประวัติการลายังเก็บไว้ แต่จะไม่แสดงในรายชื่อ)'))return;
    const r=await apiPost('deleteEmployee',{pin:adminPin,emp_id:id});
    if(r.ok){adminEmployees=adminEmployees.filter(x=>x.emp_id!==id);renderAdminEmp();toast('ลบแล้ว');}else toast(r.error||'ผิดพลาด',true);
  }
}
async function refreshPublicList(){try{const res=await apiGet('employees');if(res.ok)allEmployees=res.employees||[];}catch(e){}}

/* ---------- เพิ่ม/แก้ พนักงาน ---------- */
function openEmpModal(e){
  editingEmpId=e?e.emp_id:null; editingPhotoId=e?(e.photo_id||''):'';
  $('empModalTitle').textContent=e?'แก้ไขพนักงาน':'เพิ่มพนักงานใหม่';
  $('empNameTh').value=e?(e.name_th||''):'';
  $('empNameMm').value=e?(e.name_mm||''):'';
  $('empNat').value=e?e.nationality:'TH';
  $('empNote').value=e?(e.note||''):'';
  const nm=e?(e.name_th||e.name_mm):'?', prev=$('empPrev');
  if(e&&e.photo_url){prev.innerHTML='';prev.style.background="url('"+e.photo_url+"') center/cover";}
  else{prev.style.background='var(--bg2)';prev.textContent=e?initials(nm):'?';}
  $('empPhoto').value='';
  $('empModal').classList.remove('hidden');
}
async function saveEmp(){
  const name_th=$('empNameTh').value.trim();
  if(!name_th){toast('กรุณากรอกชื่อ',true);return;}
  const btn=$('empSave'); btn.disabled=true; btn.textContent='บันทึก...';
  try{
    const data={pin:adminPin,name_th:name_th,name_mm:$('empNameMm').value.trim(),nationality:$('empNat').value,note:$('empNote').value.trim(),photo_id:editingPhotoId};
    let r;
    if(editingEmpId){data.emp_id=editingEmpId;r=await apiPost('updateEmployee',data);}
    else r=await apiPost('addEmployee',data);
    if(!r.ok) throw new Error(r.error||'บันทึกไม่สำเร็จ');
    $('empModal').classList.add('hidden'); toast('บันทึกแล้ว');
    const res=await apiGet('employees',{admin:'1',pin:adminPin});
    if(res.ok)adminEmployees=res.employees||[];
    renderAdminEmp();
  }catch(err){toast(err.message,true);}
  btn.disabled=false; btn.textContent='บันทึก';
}

/* อัปโหลดรูป: ย่อขนาดในเครื่องก่อนส่ง (ไฟล์เล็ก โหลดไว) */
function handlePhotoUpload(){
  const f=$('empPhoto').files[0]; if(!f)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=async()=>{
      const max=600; let w=img.width,h=img.height;
      if(w>h){if(w>max){h=h*max/w;w=max;}}else{if(h>max){w=w*max/h;h=max;}}
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      const b64=cv.toDataURL('image/jpeg',0.85);
      $('empPrev').innerHTML=''; $('empPrev').style.background="url('"+b64+"') center/cover";
      toast('กำลังอัปโหลดรูป...');
      try{
        const r=await apiPost('uploadPhoto',{pin:adminPin,base64:b64,mime:'image/jpeg',filename:'emp_'+Date.now()+'.jpg'});
        if(r.ok){editingPhotoId=r.photo_id;toast('อัปโหลดรูปแล้ว ✓');}
        else toast(r.error||'อัปโหลดไม่สำเร็จ',true);
      }catch(err){toast('อัปโหลดไม่สำเร็จ',true);}
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(f);
}

/* ---------- Dashboard สรุปการลา ---------- */
function barW(st,key){const vals=Object.values(st);const mx=vals.length?Math.max.apply(null,vals):1;return mx?((st[key]||0)/mx*100):0;}
async function loadDashboard(){
  $('dashContent').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>';
  try{
    const res=await apiGet('dashboard',{month:$('dashMonth').value});
    if(!res.ok) throw new Error(res.error||'load failed');
    const s=res.summary;
    let html='<div class="statGrid">'+
      '<div class="statCard"><div class="sv">'+s.total_requests+'</div><div class="sl">ใบลาทั้งหมด</div></div>'+
      '<div class="statCard"><div class="sv">'+s.total_hours+'</div><div class="sl">ชั่วโมงรวม</div></div>'+
      '<div class="statCard"><div class="sv">'+s.total_days+'</div><div class="sl">คิดเป็นวัน</div></div>'+
      '<div class="statCard"><div class="sv">'+s.people_count+'</div><div class="sl">คนที่ลา</div></div>'+
    '</div>';
    const types=Object.entries(res.by_type||{});
    if(types.length){const mx=Math.max.apply(null,types.map(t=>t[1]));
      html+='<div class="fblock"><div class="flabel">ลาแยกตามประเภท</div>'+types.map(t=>'<div class="bar"><div class="bl">'+esc(t[0])+'</div><div class="bt"><div class="bf" style="width:'+(t[1]/mx*100)+'%"></div></div><div class="bv">'+t[1]+' ชม.</div></div>').join('')+'</div>';}
    const st=res.by_status||{};
    html+='<div class="fblock"><div class="flabel">แยกตามการแจ้ง</div>'+
      '<div class="bar"><div class="bl">🟢 ล่วงหน้า</div><div class="bt"><div class="bf" style="width:'+barW(st,'ลาล่วงหน้า')+'%;background:var(--green)"></div></div><div class="bv">'+(st['ลาล่วงหน้า']||0)+' ครั้ง</div></div>'+
      '<div class="bar"><div class="bl">🟡 กระทันหัน</div><div class="bt"><div class="bf" style="width:'+barW(st,'ลากระทันหัน (วันเดียวกัน)')+'%;background:var(--amber)"></div></div><div class="bv">'+(st['ลากระทันหัน (วันเดียวกัน)']||0)+' ครั้ง</div></div>'+
      '<div class="bar"><div class="bl">🔴 ย้อนหลัง</div><div class="bt"><div class="bf" style="width:'+barW(st,'ลาย้อนหลัง')+'%;background:var(--red)"></div></div><div class="bv">'+(st['ลาย้อนหลัง']||0)+' ครั้ง</div></div>'+
    '</div>';
    if(res.people.length){
      html+='<div class="fblock"><div class="flabel">รายคน (เรียงจากลามากสุด)</div>'+res.people.map(p=>{
        const flag=p.nationality==='MM'?'🇲🇲':'🇹🇭';
        return '<div class="adminRow" style="margin-bottom:7px"><div class="rn"><b>'+flag+' '+esc(p.name)+'</b><small>'+esc(p.emp_id)+'</small></div><div style="text-align:right"><div style="font-weight:800;color:var(--brand)">'+p.hours+' ชม.</div><small style="color:var(--muted)">'+p.days+' วัน · '+p.count+' ครั้ง</small></div></div>';
      }).join('')+'</div>';
    }else{html+='<div class="empEmpty">ไม่มีการลาในเดือนนี้</div>';}
    $('dashContent').innerHTML=html;
  }catch(err){$('dashContent').innerHTML='<div class="empEmpty">⚠️ '+esc(err.message)+'</div>';}
}

/* ---------- จัดการใบลา (แก้สถานะ / ลบ) ---------- */
async function loadLeaves(){
  $('leavesContent').innerHTML='<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>';
  try{
    const res=await apiGet('leaves',{admin:'1',pin:adminPin,month:$('leavesMonth').value});
    if(!res.ok) throw new Error(res.error||'load failed');
    adminLeaves=res.leaves||[];
    if(res.statuses) leaveStatuses=res.statuses;
    renderLeaves();
  }catch(err){$('leavesContent').innerHTML='<div class="empEmpty">⚠️ '+esc(err.message)+'</div>';}
}
function statusClass(s){return s.indexOf('ย้อนหลัง')>=0?'back':(s.indexOf('กระทันหัน')>=0?'same':'adv');}
function renderLeaves(){
  const q=$('leavesSearch').value.trim().toLowerCase();
  let list=adminLeaves.slice();
  if(q) list=list.filter(x=>(x.name||'').toLowerCase().includes(q)||(x.emp_id||'').toLowerCase().includes(q));
  if(list.length===0){$('leavesContent').innerHTML='<div class="empEmpty">ไม่มีใบลาในเดือนนี้</div>';return;}
  $('leavesContent').innerHTML='<div style="color:var(--muted);font-size:13px;margin-bottom:10px">ทั้งหมด '+list.length+' ใบ · แก้สถานะได้จากเมนูดรอปดาวน์</div>'+
  list.map(x=>{
    const c=statusClass(x.filing_status);
    const opts=leaveStatuses.map(s=>'<option value="'+esc(s)+'"'+(s===x.filing_status?' selected':'')+'>'+esc(s)+'</option>').join('');
    const flag=x.nationality==='MM'?'🇲🇲':'🇹🇭';
    return '<div class="histItem '+c+'">'+
      '<div class="histTop"><span class="histDate">'+esc(x.leave_date)+'</span><span class="tag '+c+'">'+esc(x.filing_status)+'</span></div>'+
      '<div class="histMeta"><span><b>'+flag+' '+esc(x.name)+'</b> ('+esc(x.emp_id)+')</span></div>'+
      '<div class="histMeta" style="margin-top:3px"><span><b>'+esc(x.leave_type)+'</b></span><span>⏰ '+esc(x.slots)+'</span><span>('+x.hours+' ชม.'+(x.is_full_day?' เต็มวัน':'')+')</span></div>'+
      (x.reason?'<div class="histReason">"'+esc(x.reason)+'"</div>':'')+
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">'+
        '<span style="font-size:13px;color:var(--muted)">เปลี่ยนสถานะ:</span>'+
        '<select class="leaveStatusSel" data-id="'+esc(x.leave_id)+'" style="flex:1;min-width:160px;padding:9px;border:2px solid var(--line);border-radius:9px;background:#fff;color:var(--text)">'+opts+'</select>'+
        '<button class="miniBtn del" data-del="'+esc(x.leave_id)+'">ลบใบนี้</button>'+
      '</div>'+
    '</div>';
  }).join('');
  $('leavesContent').querySelectorAll('.leaveStatusSel').forEach(sel=>{sel.onchange=()=>changeLeaveStatus(sel.dataset.id,sel.value);});
  $('leavesContent').querySelectorAll('[data-del]').forEach(b=>{b.onclick=()=>deleteLeaveAdmin(b.dataset.del);});
}
async function changeLeaveStatus(leaveId,status){
  try{
    const r=await apiPost('updateLeaveStatus',{pin:adminPin,leave_id:leaveId,status:status});
    if(r.ok){
      const x=adminLeaves.find(l=>l.leave_id===leaveId); if(x)x.filing_status=status;
      renderLeaves(); toast('เปลี่ยนสถานะแล้ว ✓');
    }else toast(r.error||'ผิดพลาด',true);
  }catch(err){toast('ผิดพลาด',true);}
}
async function deleteLeaveAdmin(leaveId){
  if(!confirm('ลบใบลานี้ออกจากระบบ?\n(ลบถาวร ใช้เมื่อกรอกผิดเท่านั้น)'))return;
  try{
    const r=await apiPost('deleteLeave',{pin:adminPin,leave_id:leaveId});
    if(r.ok){adminLeaves=adminLeaves.filter(l=>l.leave_id!==leaveId);renderLeaves();toast('ลบใบลาแล้ว');}
    else toast(r.error||'ผิดพลาด',true);
  }catch(err){toast('ผิดพลาด',true);}
}

/* ---------- วันหยุดบริษัท (แอดมิน) ---------- */
async function loadHolidaysAdmin(){
  $('holList').innerHTML='<div style="color:var(--muted);font-size:13px">กำลังโหลด...</div>';
  try{
    const r=await apiGet('holidays');
    const hs=(r.holidays||[]);
    if(hs.length===0){$('holList').innerHTML='<div style="color:var(--muted);font-size:13px">ยังไม่มีวันหยุด</div>';return;}
    $('holList').innerHTML=hs.map(h=>'<div class="adminRow" style="margin-bottom:7px"><div class="rn"><b>'+esc(h.date)+'</b><small>'+esc(h.name)+'</small></div><button class="miniBtn del" data-delhol="'+esc(h.date)+'">ลบ</button></div>').join('');
    $('holList').querySelectorAll('[data-delhol]').forEach(b=>{b.onclick=()=>deleteHolidayAdmin(b.dataset.delhol);});
  }catch(err){$('holList').innerHTML='<div class="empEmpty">⚠️ '+esc(err.message)+'</div>';}
}
async function addHolidayAdmin(){
  const date=$('holDate').value, name=$('holName').value.trim();
  if(!date){toast('เลือกวันที่ก่อน',true);return;}
  const btn=$('addHolBtn'); btn.disabled=true; btn.textContent='บันทึก...';
  try{
    const r=await apiPost('addHoliday',{pin:adminPin,date:date,name:name||'วันหยุด'});
    if(r.ok){toast('เพิ่มวันหยุดแล้ว');$('holDate').value='';$('holName').value='';loadHolidaysAdmin();}
    else toast(r.error||'ผิดพลาด',true);
  }catch(err){toast('ผิดพลาด',true);}
  btn.disabled=false; btn.textContent='+ เพิ่มวันหยุด';
}
async function deleteHolidayAdmin(date){
  if(!confirm('ลบวันหยุด '+date+'?'))return;
  try{
    const r=await apiPost('deleteHoliday',{pin:adminPin,date:date});
    if(r.ok){toast('ลบแล้ว');loadHolidaysAdmin();}else toast(r.error||'ผิดพลาด',true);
  }catch(err){toast('ผิดพลาด',true);}
}

/* ---------- Export ใบลาเดือนนี้เป็น CSV (เปิดใน Excel ได้) ---------- */
function exportLeavesCSV(){
  if(!adminLeaves || adminLeaves.length===0){toast('ไม่มีข้อมูลให้ Export',true);return;}
  const head=['วันที่ลา','รหัส','ชื่อ','สัญชาติ','ประเภท','ช่วงเวลา','ชั่วโมง','เต็มวัน','สถานะ','เหตุผล','แจ้งเมื่อ'];
  const rows=adminLeaves.map(x=>[x.leave_date,x.emp_id,x.name,x.nationality,x.leave_type,x.slots,x.hours,(x.is_full_day?'เต็มวัน':''),x.filing_status,(x.reason||''),x.filed_at]);
  const escCsv=v=>{v=String(v==null?'':v); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;};
  const csv=[head].concat(rows).map(r=>r.map(escCsv).join(',')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}); // BOM ให้ไทยไม่เพี้ยนใน Excel
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='BCF_ลา_'+($('leavesMonth').value||'all')+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('ดาวน์โหลดไฟล์แล้ว ✓');
}

/* ---------- อัปโหลดรูปหลายคน (ตั้งชื่อไฟล์เป็นรหัสพนักงาน) ---------- */
function resizePhoto(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{const img=new Image();img.onload=()=>{
      const max=600;let w=img.width,h=img.height;
      if(w>h){if(w>max){h=h*max/w;w=max;}}else{if(h>max){w=w*max/h;h=max;}}
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      resolve(cv.toDataURL('image/jpeg',0.85));
    };img.onerror=reject;img.src=e.target.result;};
    reader.onerror=reject; reader.readAsDataURL(file);
  });
}
async function handleBatchPhotos(){
  const files=Array.from($('batchPhotos').files||[]);
  if(files.length===0)return;
  const log=$('batchLog'); log.innerHTML='';
  const byId={}; adminEmployees.forEach(e=>{byId[String(e.emp_id).trim().toLowerCase()]=e;});
  let done=0, ok=0;
  function line(txt,color){const d=document.createElement('div');d.style.cssText='font-size:13px;padding:4px 0;color:'+(color||'var(--text)');d.innerHTML=txt;log.appendChild(d);log.scrollTop=log.scrollHeight;}
  for(const f of files){
    const base=f.name.replace(/\.[^.]+$/,'').trim();
    const emp=byId[base.toLowerCase()];
    if(!emp){ line('⚠️ '+esc(f.name)+' — ไม่พบรหัส "'+esc(base)+'"','var(--amber)'); done++; continue; }
    try{
      const b64=await resizePhoto(f);
      const up=await apiPost('setEmpPhoto',{pin:adminPin,emp_id:emp.emp_id,base64:b64,mime:'image/jpeg',filename:base+'.jpg'});
      if(!up.ok) throw new Error(up.error||'อัปโหลดไม่สำเร็จ');
      emp.photo_id=up.photo_id; if(up.photo_url)emp.photo_url=up.photo_url;
      ok++; line('✅ '+esc(emp.name_th||emp.name_mm)+' ('+esc(emp.emp_id)+')','var(--green)');
    }catch(err){ line('❌ '+esc(f.name)+' — '+esc(err.message),'var(--red)'); }
    done++;
  }
  line('<b>เสร็จ — สำเร็จ '+ok+'/'+files.length+' รูป</b>');
  toast('อัปโหลดเสร็จ '+ok+'/'+files.length);
  renderAdminEmp(); // รูปอัปเดตในตัวแปรแล้ว ไม่ต้องโหลดใหม่
}

/* ---------- ซิงค์รูปจากโฟลเดอร์ Drive ---------- */
async function syncPhotosFromDrive(){
  if(!confirm('ซิงค์รูปจากโฟลเดอร์ Drive?\n\nต้องวางรูปในโฟลเดอร์ BCF_Leave_Photos และตั้งชื่อไฟล์เป็นรหัสพนักงาน (เช่น B003.jpg) ก่อน'))return;
  const btn=$('syncDriveBtn'); btn.disabled=true; const old=btn.textContent; btn.textContent='⏳ กำลังซิงค์...';
  try{
    const r=await apiPost('syncPhotos',{pin:adminPin});
    if(!r.ok) throw new Error(r.error||'ซิงค์ไม่สำเร็จ');
    // โหลดรายชื่อใหม่เพื่อแสดงรูปที่อัปเดต
    const res=await apiGet('employees',{admin:'1',pin:adminPin});
    if(res.ok)adminEmployees=res.employees||[];
    renderAdminEmp();
    let msg='✅ ซิงค์สำเร็จ — อัปเดตรูป '+r.matched+' คน';
    if(r.unmatched_files && r.unmatched_files.length){
      msg+='\n\n⚠️ ไฟล์ที่ชื่อไม่ตรงรหัสพนักงาน ('+r.unmatched_files.length+'):\n'+r.unmatched_files.slice(0,15).join(', ');
      if(r.unmatched_files.length>15) msg+=' ...';
    }
    if(r.folder_url) msg+='\n\nเปิดโฟลเดอร์: '+r.folder_url;
    toast('ซิงค์รูปเสร็จ '+r.matched+' คน');
    alert(msg);
  }catch(err){toast(err.message,true);alert('❌ '+err.message);}
  btn.disabled=false; btn.textContent=old;
}

/* ---------- ตั้งค่า Telegram ---------- */
async function saveTelegram(){
  const btn=$('saveTgBtn'); btn.disabled=true; btn.textContent='บันทึก...';
  try{
    await apiPost('setSetting',{pin:adminPin,key:'telegram_bot_token',value:$('setTgToken').value.trim()});
    await apiPost('setSetting',{pin:adminPin,key:'telegram_chat_id',value:$('setTgChat').value.trim()});
    toast('บันทึกการตั้งค่าแล้ว ✓');
  }catch(err){toast('บันทึกไม่สำเร็จ',true);}
  btn.disabled=false; btn.textContent='บันทึกการตั้งค่า';
}
async function testTelegram(){
  const btn=$('testTgBtn'); btn.disabled=true; btn.textContent='กำลังส่ง...';
  try{
    const r=await apiPost('testTelegram',{pin:adminPin});
    toast(r.ok?'ส่งทดสอบสำเร็จ ✓ ดูในกลุ่ม Telegram':('ส่งไม่สำเร็จ: '+(r.error||'')),!r.ok);
  }catch(err){toast('ส่งไม่สำเร็จ',true);}
  btn.disabled=false; btn.textContent='📤 ทดสอบส่งข้อความ';
}

/* ---------- ผูกปุ่มฝั่งแอดมิน ---------- */
$('secretDot').onclick=openPinModal;
$('pinCancel').onclick=()=>$('pinModal').classList.add('hidden');
$('pinSubmit').onclick=submitPin;
$('pinInput').onkeydown=e=>{if(e.key==='Enter')submitPin();};
$('adminClose').onclick=()=>{$('adminScreen').classList.add('hidden');refreshPublicList();};
$('atEmp').onclick=()=>switchAdminTab('emp');
$('atDash').onclick=()=>switchAdminTab('dash');
$('atLeaves').onclick=()=>switchAdminTab('leaves');
$('atSet').onclick=()=>switchAdminTab('set');
$('adminSearch').oninput=debounce(renderAdminEmp,180);
$('leavesMonth').onchange=loadLeaves;
$('leavesSearch').oninput=debounce(renderLeaves,180);
$('exportBtn').onclick=exportLeavesCSV;
$('addHolBtn').onclick=addHolidayAdmin;
$('batchPhotoBtn').onclick=()=>{$('batchLog').innerHTML='';$('batchPhotos').value='';$('batchModal').classList.remove('hidden');};
$('syncDriveBtn').onclick=syncPhotosFromDrive;
$('batchClose').onclick=()=>$('batchModal').classList.add('hidden');
$('batchPhotos').onchange=handleBatchPhotos;
$('addEmpBtn').onclick=()=>openEmpModal(null);
$('empCancel').onclick=()=>$('empModal').classList.add('hidden');
$('empSave').onclick=saveEmp;
$('empPhoto').onchange=handlePhotoUpload;
$('dashMonth').onchange=loadDashboard;
$('saveTgBtn').onclick=saveTelegram;
$('testTgBtn').onclick=testTelegram;

/* แตะโลโก้ 5 ครั้งเร็วๆ เพื่อเข้าแอดมิน (สำรองนอกจากปุ่มลับมุมจอ) */
let logoTaps=0,logoTimer=null;
$('hdrLogo').onclick=()=>{logoTaps++;clearTimeout(logoTimer);logoTimer=setTimeout(()=>{logoTaps=0;},1200);if(logoTaps>=5){logoTaps=0;openPinModal();}};

console.log('[BCF] admin.js v' + window.BCF_VER.admin);
