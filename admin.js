/* ============================================================
 * BCF ระบบแจ้งลา — admin.js — v1.0 — 2026-06-29
 * ฝั่งแอดมิน: PIN / เพิ่ม-แก้-ลบพนักงาน / อัปรูป / ซ่อนชื่อ /
 *            สรุปการลา (Dashboard) / ตั้งค่า Telegram
 * ใช้ helper จาก app.js ($, esc, apiGet, apiPost, toast, ฯลฯ)
 * ============================================================ */
window.BCF_VER = window.BCF_VER || {};
window.BCF_VER.admin = '1.0';

let adminPin='', adminEmployees=[], editingEmpId=null, editingPhotoId='';

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
  $('atEmp').classList.toggle('active',t==='emp');$('atDash').classList.toggle('active',t==='dash');$('atSet').classList.toggle('active',t==='set');
  $('adminEmpPane').classList.toggle('hidden',t!=='emp');
  $('adminDashPane').classList.toggle('hidden',t!=='dash');
  $('adminSetPane').classList.toggle('hidden',t!=='set');
  if(t==='dash'){if(!$('dashMonth').value){const d=new Date();$('dashMonth').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}loadDashboard();}
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
    return '<div class="adminRow">'+avatarHTML('ra',nm,e.photo_url,'')+
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
    if(r.ok){e.visible=r.visible;renderAdminEmp();toast(r.visible?'แสดงชื่อแล้ว':'ซ่อนชื่อแล้ว');refreshPublicList();}else toast(r.error||'ผิดพลาด',true);
    return;
  }
  if(act==='del'){
    if(!confirm('ลบ "'+(e.name_th||e.name_mm)+'" ออกจากระบบ?\n(ประวัติการลายังเก็บไว้ แต่จะไม่แสดงในรายชื่อ)'))return;
    const r=await apiPost('deleteEmployee',{pin:adminPin,emp_id:id});
    if(r.ok){adminEmployees=adminEmployees.filter(x=>x.emp_id!==id);renderAdminEmp();toast('ลบแล้ว');refreshPublicList();}else toast(r.error||'ผิดพลาด',true);
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
    renderAdminEmp(); refreshPublicList();
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
$('adminClose').onclick=()=>$('adminScreen').classList.add('hidden');
$('atEmp').onclick=()=>switchAdminTab('emp');
$('atDash').onclick=()=>switchAdminTab('dash');
$('atSet').onclick=()=>switchAdminTab('set');
$('adminSearch').oninput=renderAdminEmp;
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
