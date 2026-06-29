/*************************************************************
 * BCF ระบบแจ้งลาพนักงาน — Backend (Google Apps Script)
 * บริษัท ฟาร์มไก่ดำ (กาญจนบุรี) จำกัด
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 *  1) สร้าง Google Sheet ใหม่ 1 ไฟล์
 *  2) เมนู Extensions > Apps Script  แล้ววางโค้ดนี้ทั้งหมด
 *  3) กดเลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์ครั้งแรก)
 *     -> ระบบจะสร้างชีททั้งหมด + โฟลเดอร์เก็บรูปใน Drive ให้เอง
 *  4) Deploy > New deployment > เลือก type = Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     -> ก๊อปปี้ Web app URL ไปใส่ในไฟล์ index.html (ค่า API_URL)
 *
 * อัปเดตโค้ดภายหลัง: วางทับ แล้ว Deploy > Manage deployments > แก้ version
 *************************************************************/

/* ====== ค่าคงที่ ====== */
var TZ = 'Asia/Bangkok';
var SHEETS = {
  EMP: 'Employees',
  LEAVE: 'Leaves',
  PAY_TH: 'Payroll_TH',
  PAY_MM: 'Payroll_MM',
  HOLIDAY: 'Holidays',
  SET: 'Settings'
};
var DEFAULT_PIN = '1234';                 // PIN แอดมินเริ่มต้น (เปลี่ยนได้ในชีท Settings)
var PHOTO_FOLDER_NAME = 'BCF_Leave_Photos';

/* ประเภทการลา (ใช้แยกคอลัมน์ใน Payroll) */
var LEAVE_TYPES = ['ลาป่วย','ลากิจ','ลาพักร้อน'];

/* ช่วงเวลาทำงาน (นาฬิกา 24 ชม.) — 12:00-13:00 คือพักเที่ยง ไม่ให้ลา */
var TIME_SLOTS = [
  '08:00-09:00','09:00-10:00','10:00-11:00','11:00-12:00',
  '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00'
];
var WORK_HOURS_PER_DAY = TIME_SLOTS.length; // = 8 ชั่วโมง/วัน

/* ====== Helper พื้นฐาน ====== */
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name){ return ss_().getSheetByName(name); }

function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function todayStr_(){
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}
function nowStr_(){
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

/* อ่าน/เขียน Settings (key-value) */
function getSetting_(key){
  var sh = sheet_(SHEETS.SET);
  if(!sh) return '';
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][0]).trim() === key) return String(vals[i][1]);
  }
  return '';
}
function setSetting_(key, value){
  var sh = sheet_(SHEETS.SET);
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][0]).trim() === key){
      sh.getRange(i+1,2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function checkPin_(pin){
  var real = getSetting_('admin_pin') || DEFAULT_PIN;
  return String(pin) === String(real);
}

/* สร้าง emp_id อัตโนมัติ เช่น TH001 / MM015 */
function genEmpId_(nat){
  var prefix = (nat === 'MM') ? 'MM' : 'TH';
  var sh = sheet_(SHEETS.EMP);
  var vals = sh.getDataRange().getValues();
  var max = 0;
  for(var i=1;i<vals.length;i++){
    var id = String(vals[i][0]);
    if(id.indexOf(prefix) === 0){
      var n = parseInt(id.substring(2),10);
      if(!isNaN(n) && n>max) max = n;
    }
  }
  var num = (max+1).toString();
  while(num.length<3) num = '0'+num;
  return prefix+num;
}

/* สร้าง URL รูปจาก Drive file id (ใช้ CDN ของ Google เสถียรกว่า uc?export) */
function photoUrl_(fileId){
  if(!fileId) return '';
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=w400';
}

/* ====== ติดตั้งครั้งแรก ====== */
function setup(){
  var ss = ss_();
  var folder = getOrCreatePhotoFolder_();

  // 1) Settings — สร้างถ้ายังไม่มี / เติม key ที่ขาด (ไม่ทับค่าที่ตั้งไว้แล้ว เช่น PIN/Token)
  var st = sheet_(SHEETS.SET);
  if(!st){
    st = ss.insertSheet(SHEETS.SET);
    st.getRange(1,1,1,2).setValues([['key','value']]).setFontWeight('bold');
    st.setColumnWidth(1,200); st.setColumnWidth(2,420);
  }
  ensureSetting_('admin_pin', DEFAULT_PIN);
  ensureSetting_('photo_folder_id', folder.getId());
  ensureSetting_('company_name', 'บริษัท ฟาร์มไก่ดำ (กาญจนบุรี) จำกัด');
  ensureSetting_('company_address', '300/13 ถ.แสงชูโตเหนือ ต.ท่ามะขาม อ.เมือง จ.กาญจนบุรี 71000');
  ensureSetting_('telegram_bot_token', '');
  ensureSetting_('telegram_chat_id', '');

  // 2) Employees — ใส่หัวตาราง ไม่ล้างข้อมูล
  var emp = sheet_(SHEETS.EMP) || ss.insertSheet(SHEETS.EMP);
  ensureHeader_(emp, ['emp_id','name_th','name_mm','nationality','photo_id','visible','active','note','created_at']);
  emp.setFrozenRows(1);
  emp.setColumnWidths(1,1,90); emp.setColumnWidths(2,2,180);

  // 3) Leaves — ใส่หัวตาราง + สีสถานะ ไม่ล้างข้อมูล
  var lv = sheet_(SHEETS.LEAVE) || ss.insertSheet(SHEETS.LEAVE);
  ensureHeader_(lv, ['filed_at','leave_id','emp_id','name','nationality','leave_date','slots','hours','is_full_day','leave_type','filing_status','reason']);
  lv.setFrozenRows(1);
  lv.setColumnWidths(1,1,150); lv.setColumnWidths(6,1,110); lv.setColumnWidths(7,1,220); lv.setColumnWidths(12,1,260);
  applyLeaveFormatting_(lv);

  // 4) Holidays — วันหยุดบริษัท (ใหม่)
  var hd = sheet_(SHEETS.HOLIDAY) || ss.insertSheet(SHEETS.HOLIDAY);
  ensureHeader_(hd, ['date','name','created_at']);
  hd.setFrozenRows(1);
  hd.setColumnWidths(1,1,120); hd.setColumnWidths(2,1,260);

  // 5) Payroll TH/MM — แยกประเภทลา + checkbox หัก/ไม่หัก (รวม+รายคน) คงค่าแรง/การติ๊กเดิม
  syncPayrollRosters_();

  ss.setActiveSheet(emp);
  return 'Setup/อัปเดตเสร็จแล้ว ✔ (ข้อมูลเดิมไม่ถูกลบ)';
}

/* เติม key ในชีท Settings เฉพาะที่ยังไม่มี (ไม่ทับค่าเดิม) */
function ensureSetting_(key, def){
  var sh = sheet_(SHEETS.SET);
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++) if(String(vals[i][0]).trim()===key) return;
  sh.appendRow([key, def]);
}

/* ใส่/อัปเดตหัวตาราง (แถว 1) โดยไม่แตะข้อมูลด้านล่าง */
function ensureHeader_(sh, headers){
  sh.getRange(1,1,1,headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#0062A1').setFontColor('#ffffff');
}

function getOrCreatePhotoFolder_(){
  var existingId = getSetting_('photo_folder_id');
  if(existingId){
    try { return DriveApp.getFolderById(existingId); } catch(e){}
  }
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if(it.hasNext()) return it.next();
  var f = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f;
}

/* สีสถานะใน Leaves: ล่วงหน้า=เขียว / กระทันหัน=เหลือง / ย้อนหลัง=แดง */
function applyLeaveFormatting_(lv){
  var rng = lv.getRange('K2:K1000'); // คอลัมน์ filing_status
  var rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('ย้อนหลัง').setBackground('#F8D7DA').setFontColor('#B02A37').setBold(true)
      .setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('กระทันหัน').setBackground('#FFF3CD').setFontColor('#997404')
      .setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('ล่วงหน้า').setBackground('#D1E7DD').setFontColor('#0F5132')
      .setRanges([rng]).build()
  ];
  lv.setConditionalFormatRules(rules);
}

/*
 * รีเฟรชชีท Payroll_TH / Payroll_MM จาก Employees (เฉพาะ active)
 * - คงค่าแรง/วัน และการติ๊ก หัก/ไม่หัก เดิม (จับคู่ด้วย emp_id)
 * - มี checkbox คุม 2 ระดับ: สวิตช์รวม (H2,I2,J2) + ติ๊กรายคน (H,I,J)
 */
function syncPayrollRosters_(){
  var emp = sheet_(SHEETS.EMP).getDataRange().getValues();
  var th = [], mm = [];
  for(var i=1;i<emp.length;i++){
    var id = String(emp[i][0]).trim();
    if(!id) continue;
    if(String(emp[i][6]).toUpperCase() === 'FALSE') continue; // ไม่ active
    var row = { id:id, name: emp[i][1] || emp[i][2], nat: emp[i][3] };
    if(row.nat === 'MM') mm.push(row); else th.push(row);
  }
  rebuildPayroll_(SHEETS.PAY_TH, 'คนไทย', th);
  rebuildPayroll_(SHEETS.PAY_MM, 'พม่า', mm);
}

function rebuildPayroll_(name, label, rows){
  var ss = ss_();
  var sh = sheet_(name) || ss.insertSheet(name);

  // 1) อ่านค่าเดิม (ค่าแรง + ติ๊กหัก) ตาม emp_id ก่อนเขียนทับ (รองรับการอัปเกรดจากโครงเก่า)
  var idSet = {}; rows.forEach(function(r){ idSet[r.id]=true; });
  var oldLast = sh.getLastRow();
  var keep = {}; // id -> {wage, fS, fK, fV}
  if(oldLast >= 1){
    var old = sh.getRange(1,1,oldLast,13).getValues();
    for(var i=0;i<old.length;i++){
      var id = String(old[i][0]).trim();
      if(!idSet[id]) continue;
      keep[id] = {
        wage: old[i][2],
        fS: (typeof old[i][7]==='boolean')? old[i][7] : true,  // หักป่วย
        fK: (typeof old[i][8]==='boolean')? old[i][8] : true,  // หักกิจ
        fV: (typeof old[i][9]==='boolean')? old[i][9] : true   // หักพักร้อน
      };
    }
  }

  // 2) แถว 1: เดือนที่คำนวณ
  sh.getRange('A1').setValue('เดือนที่คำนวณ ('+label+') :').setFontWeight('bold');
  if(!(sh.getRange('B1').getValue() instanceof Date)){
    var fom = new Date(); fom.setDate(1);
    sh.getRange('B1').setValue(fom).setNumberFormat('mmmm yyyy').setBackground('#FFF3CD').setFontWeight('bold');
  }
  sh.getRange('C1').setValue('← แก้เดือน (วันที่ 1)').setFontColor('#888');

  // 3) แถว 2: สวิตช์หักเงินรวมทั้งบริษัท (H2/I2/J2 อยู่ตรงหัวคอลัมน์ หักป่วย/หักกิจ/หักพักร้อน)
  sh.getRange('A2').setValue('สวิตช์หักเงินรวม (ติ๊ก = หักทั้งบริษัท) →').setFontWeight('bold').setFontColor('#0062A1');
  var cbRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sh.getRange('H2:J2').setDataValidation(cbRule);
  ['H2','I2','J2'].forEach(function(c){ if(typeof sh.getRange(c).getValue()!=='boolean') sh.getRange(c).setValue(true); });
  sh.getRange('H2:J2').setBackground('#E7F1FA').setHorizontalAlignment('center');

  // 4) แถว 3: หัวตาราง
  var head = ['emp_id','ชื่อพนักงาน','ค่าแรง/วัน (กรอก)','ค่าแรง/ชม.',
              'ลาป่วย (ชม.)','ลากิจ (ชม.)','ลาพักร้อน (ชม.)',
              'หักป่วย?','หักกิจ?','หักพักร้อน?','รวมลา (ชม.)','ชม.หักจริง','ยอดหักรวม (บาท)'];
  sh.getRange(3,1,1,head.length).setValues([head]).setFontWeight('bold').setBackground('#0062A1').setFontColor('#ffffff');
  sh.setFrozenRows(3);
  sh.setColumnWidths(1,1,80); sh.setColumnWidths(2,1,180); sh.setColumnWidths(3,1,115);
  sh.setColumnWidths(4,1,90); sh.setColumnWidths(5,3,90);
  sh.setColumnWidths(8,3,80); sh.setColumnWidths(11,1,95); sh.setColumnWidths(12,1,90); sh.setColumnWidths(13,1,150);

  // 5) ล้างข้อมูลเก่า (แถว 4 ลงไป) ทั้งค่าและ checkbox
  if(oldLast >= 4){
    var clr = sh.getRange(4,1,oldLast-3,13);
    clr.clearContent(); clr.clearDataValidations();
  }
  if(rows.length === 0) return;

  // 6) เขียนข้อมูล (เริ่มแถว 4)
  var L = SHEETS.LEAVE;
  function sumByType(rn, type){
    return '=IFERROR(SUMIFS('+L+'!$H:$H,'+L+'!$C:$C,$A'+rn+','+
      L+'!$F:$F,">="&$B$1,'+L+'!$F:$F,"<="&EOMONTH($B$1,0),'+L+'!$J:$J,"'+type+'"),0)';
  }
  var out = [];
  for(var r=0;r<rows.length;r++){
    var rn = r+4, id = rows[r].id, k = keep[id] || {};
    out.push([
      id, rows[r].name,
      (k.wage!==undefined && k.wage!=='')? k.wage : '',
      '=IF($C'+rn+'="","",$C'+rn+'/'+WORK_HOURS_PER_DAY+')',                 // D ค่าแรง/ชม.
      sumByType(rn,'ลาป่วย'), sumByType(rn,'ลากิจ'), sumByType(rn,'ลาพักร้อน'), // E,F,G
      (k.fS!==undefined?k.fS:true), (k.fK!==undefined?k.fK:true), (k.fV!==undefined?k.fV:true), // H,I,J ติ๊กรายคน
      '=$E'+rn+'+$F'+rn+'+$G'+rn,                                            // K รวมลา
      '=$E'+rn+'*IF(AND($H$2,$H'+rn+'),1,0)+$F'+rn+'*IF(AND($I$2,$I'+rn+'),1,0)+$G'+rn+'*IF(AND($J$2,$J'+rn+'),1,0)', // L ชม.หักจริง
      '=IF($D'+rn+'="",0,ROUND($L'+rn+'*$D'+rn+',2))'                        // M ยอดหัก
    ]);
  }
  var n = out.length;
  sh.getRange(4,1,n,13).setValues(out);
  sh.getRange(4,8,n,3).setDataValidation(cbRule).setHorizontalAlignment('center'); // checkbox H:J
  sh.getRange(4,3,n,1).setBackground('#FFFBEA');                                    // ค่าแรง สีเหลือง
  sh.getRange(4,4,n,1).setNumberFormat('#,##0.00');
  sh.getRange(4,13,n,1).setNumberFormat('#,##0.00');
}

/* ====== Router ====== */
function doGet(e){
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try{
    if(action === 'ping')       return json_({ok:true, time:nowStr_()});
    if(action === 'config')     return json_(getConfig_());
    if(action === 'employees')  return json_(getEmployees_(e.parameter));
    if(action === 'history')    return json_(getHistory_(e.parameter));
    if(action === 'dashboard')  return json_(getDashboard_(e.parameter));
    if(action === 'leaves')     return json_(getLeavesAdmin_(e.parameter));
    if(action === 'holidays')   return json_(getHolidays_());
    return json_({ok:false, error:'unknown action: '+action});
  }catch(err){
    return json_({ok:false, error:String(err)});
  }
}

function doPost(e){
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch(err){ data = {}; }
  var action = data.action || '';
  try{
    if(action === 'submitLeave')    return json_(submitLeave_(data));
    if(action === 'cancelLeave')    return json_(cancelLeave_(data));
    // ---- ต้องใส่ PIN แอดมิน ----
    if(['addEmployee','updateEmployee','deleteEmployee','toggleVisible','uploadPhoto','setSetting','testTelegram','updateLeaveStatus','deleteLeave','addHoliday','deleteHoliday']
        .indexOf(action) >= 0){
      if(!checkPin_(data.pin)) return json_({ok:false, error:'PIN ไม่ถูกต้อง'});
    }
    if(action === 'addEmployee')    return json_(addEmployee_(data));
    if(action === 'updateEmployee') return json_(updateEmployee_(data));
    if(action === 'deleteEmployee') return json_(deleteEmployee_(data));
    if(action === 'toggleVisible')  return json_(toggleVisible_(data));
    if(action === 'uploadPhoto')    return json_(uploadPhoto_(data));
    if(action === 'setSetting')     return json_(setSettingApi_(data));
    if(action === 'updateLeaveStatus') return json_(updateLeaveStatus_(data));
    if(action === 'deleteLeave')    return json_(deleteLeave_(data));
    if(action === 'addHoliday')     return json_(addHoliday_(data));
    if(action === 'deleteHoliday')  return json_(deleteHoliday_(data));
    if(action === 'testTelegram')   return json_(tgSend_('✅ <b>ทดสอบ Telegram จากหน้าแอดมิน</b>\nเชื่อมต่อกลุ่มนี้เรียบร้อยแล้ว'));
    return json_({ok:false, error:'unknown action: '+action});
  }catch(err){
    return json_({ok:false, error:String(err)});
  }
}

/* ====== ฟังก์ชันสำหรับหน้าเว็บ ====== */

function getConfig_(){
  return {
    ok:true,
    company_name: getSetting_('company_name'),
    company_address: getSetting_('company_address'),
    time_slots: TIME_SLOTS,
    work_hours_per_day: WORK_HOURS_PER_DAY,
    today: todayStr_()
  };
}

function getEmployees_(p){
  var admin = p && p.admin === '1' && checkPin_(p.pin);
  var vals = sheet_(SHEETS.EMP).getDataRange().getValues();
  var list = [];
  for(var i=1;i<vals.length;i++){
    var id = String(vals[i][0]).trim();
    if(!id) continue;
    var visible = String(vals[i][5]).toUpperCase() !== 'FALSE';
    var active  = String(vals[i][6]).toUpperCase() !== 'FALSE';
    if(!admin){
      // หน้าเลือกพนักงาน: เฉพาะ active และ visible
      if(!active || !visible) continue;
    } else {
      if(!active) continue; // แอดมินก็ไม่โชว์คนที่ลบ/ลาออก (active=false) ในลิสต์ปกติ
    }
    var o = {
      emp_id: id,
      name_th: vals[i][1],
      name_mm: vals[i][2],
      nationality: vals[i][3] || 'TH',
      photo_url: photoUrl_(vals[i][4]),
      photo_id: admin ? vals[i][4] : undefined,
      visible: admin ? visible : undefined,
      note: admin ? vals[i][7] : undefined
    };
    list.push(o);
  }
  return {ok:true, employees:list};
}

/* คำนวณสถานะการกรอก เทียบวันลา vs วันนี้ */
function computeFilingStatus_(leaveDateStr){
  var today = todayStr_();
  if(leaveDateStr > today)  return 'ลาล่วงหน้า';
  if(leaveDateStr === today) return 'ลากระทันหัน (วันเดียวกัน)';
  return 'ลาย้อนหลัง';
}

/* ---------- ตัวช่วยเรื่องวันที่/วันหยุด/ลาซ้ำ ---------- */
function parseDateStr_(s){ var p=s.split('-'); return new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); }
function dateToStr_(dt){ return Utilities.formatDate(dt, TZ, 'yyyy-MM-dd'); }

function isHoliday_(dateStr){
  var sh = sheet_(SHEETS.HOLIDAY);
  if(!sh) return null;
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    var d=vals[i][0];
    var ds=(d instanceof Date)?Utilities.formatDate(d,TZ,'yyyy-MM-dd'):String(d).trim();
    if(ds===dateStr) return vals[i][1]||'วันหยุด';
  }
  return null;
}
/* ช่วงเวลาที่พนักงานคนนี้ลาไปแล้วในวันนั้น (กันลาซ้ำ) */
function getTakenSlots_(empId, dateStr){
  var vals = sheet_(SHEETS.LEAVE).getDataRange().getValues();
  var taken = {};
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][2]).trim()!==empId) continue;
    var d=vals[i][5];
    var ds=(d instanceof Date)?Utilities.formatDate(d,TZ,'yyyy-MM-dd'):String(d).trim();
    if(ds!==dateStr) continue;
    String(vals[i][6]||'').split(',').forEach(function(s){ s=s.trim(); if(s) taken[s]=true; });
  }
  return taken;
}
/* เขียนใบลา 1 แถว คืนผลลัพธ์ */
function writeLeaveRow_(emp, dateStr, slots, leaveType, reason){
  var hours=slots.length;
  var isFull=(hours>=WORK_HOURS_PER_DAY);
  var status=computeFilingStatus_(dateStr);
  var leaveId='L'+Utilities.formatDate(new Date(),TZ,'yyMMddHHmmss')+Math.floor(Math.random()*900+100);
  var name=emp.name_th||emp.name_mm;
  var lv=sheet_(SHEETS.LEAVE);
  lv.appendRow([nowStr_(), leaveId, emp.emp_id, name, emp.nationality, parseDateStr_(dateStr),
    slots.join(', '), hours, isFull?'เต็มวัน':'', leaveType, status, reason||'']);
  lv.getRange(lv.getLastRow(),6).setNumberFormat('yyyy-mm-dd');
  return {leave_id:leaveId, hours:hours, is_full_day:isFull, filing_status:status, name:name, date:dateStr};
}

function submitLeave_(d){
  var empId = String(d.emp_id||'').trim();
  if(!empId) return {ok:false, error:'ไม่พบรหัสพนักงาน'};
  var emp = findEmployee_(empId);
  if(!emp) return {ok:false, error:'ไม่พบพนักงานคนนี้'};

  var slots = (d.slots||[]).filter(function(s){ return TIME_SLOTS.indexOf(s)>=0; });
  if(slots.length === 0) return {ok:false, error:'กรุณาเลือกช่วงเวลาที่ลาอย่างน้อย 1 ช่วง'};
  slots.sort(function(a,b){ return TIME_SLOTS.indexOf(a)-TIME_SLOTS.indexOf(b); });
  var leaveType = d.leave_type || 'ลากิจ';
  var reason = d.reason || '';
  var override = (d.override===true || d.override==='1');

  // ===== โหมดลาหลายวัน (date_from .. date_to) =====
  if(d.date_from && d.date_to){
    var from=String(d.date_from).trim(), to=String(d.date_to).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return {ok:false, error:'ช่วงวันไม่ถูกต้อง'};
    var dFrom=parseDateStr_(from), dTo=parseDateStr_(to);
    if(dTo<dFrom) return {ok:false, error:'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'};
    var created=[], skipped=[], cur=new Date(dFrom), guard=0;
    while(cur<=dTo && guard<70){
      guard++;
      var ds=dateToStr_(cur), why=null;
      if(cur.getDay()===0) why='วันอาทิตย์';
      else { var hn=isHoliday_(ds); if(hn) why='วันหยุด: '+hn; }
      if(!why){
        var taken=getTakenSlots_(empId, ds);
        if(slots.filter(function(s){return taken[s];}).length>0) why='ลาซ้ำ';
      }
      if(why) skipped.push({date:ds, reason:why});
      else created.push(writeLeaveRow_(emp, ds, slots, leaveType, reason));
      cur.setDate(cur.getDate()+1);
    }
    if(created.length===0) return {ok:false, error:'ไม่มีวันที่ลาได้ในช่วงนี้ (วันหยุด/อาทิตย์/ลาซ้ำทั้งหมด)', skipped:skipped};
    notifyTelegramRange_(emp, created, skipped, slots, leaveType, reason);
    return {ok:true, multi:true, created_count:created.length, created:created, skipped:skipped, hours_each:slots.length};
  }

  // ===== โหมดวันเดียว =====
  var leaveDate = String(d.leave_date||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) return {ok:false, error:'วันที่ลาไม่ถูกต้อง'};
  var dObj = parseDateStr_(leaveDate);
  if(dObj.getDay()===0 && !override) return {ok:false, error:'วันอาทิตย์เป็นวันหยุด (ถ้าต้องมาทำงาน เปิดสวิตช์ก่อนส่ง)'};
  var hname = isHoliday_(leaveDate);
  if(hname && !override) return {ok:false, error:'วันนี้เป็นวันหยุด ('+hname+') ไม่ต้องลา'};
  var taken1 = getTakenSlots_(empId, leaveDate);
  var conf = slots.filter(function(s){ return taken1[s]; });
  if(conf.length>0) return {ok:false, error:'ลาซ้ำ! ช่วงเวลานี้ลาไปแล้ว: '+conf.join(', ')};

  var res = writeLeaveRow_(emp, leaveDate, slots, leaveType, reason);
  notifyTelegram_(emp, leaveDate, slots, res.hours, leaveType, res.filing_status, reason);
  return {ok:true, leave_id:res.leave_id, hours:res.hours, is_full_day:res.is_full_day, filing_status:res.filing_status, name:res.name};
}

function findEmployee_(empId){
  var vals = sheet_(SHEETS.EMP).getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][0]).trim() === empId){
      return {
        emp_id:empId, name_th:vals[i][1], name_mm:vals[i][2],
        nationality:vals[i][3]||'TH', photo_id:vals[i][4], row:i+1
      };
    }
  }
  return null;
}

function getHistory_(p){
  var empId = String(p.emp_id||'').trim();
  if(!empId) return {ok:false, error:'ไม่พบรหัสพนักงาน'};
  var today = todayStr_();
  var vals = sheet_(SHEETS.LEAVE).getDataRange().getValues();
  var out = [];
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][2]).trim() === empId){
      var ds = fmtDate_(vals[i][5]);
      out.push({
        leave_id: vals[i][1],
        filed_at: fmtCell_(vals[i][0]),
        leave_date: ds,
        slots: vals[i][6],
        hours: vals[i][7],
        is_full_day: vals[i][8],
        leave_type: vals[i][9],
        filing_status: vals[i][10],
        reason: vals[i][11],
        can_cancel: (ds >= today)   // ยกเลิกได้เฉพาะวันนี้/ล่วงหน้า
      });
    }
  }
  out.reverse(); // ล่าสุดอยู่บน
  return {ok:true, history:out};
}

/* พนักงานยกเลิกใบลาของตัวเอง (เฉพาะวันนี้/ล่วงหน้า) */
function cancelLeave_(d){
  var empId = String(d.emp_id||'').trim();
  var leaveId = String(d.leave_id||'').trim();
  if(!empId || !leaveId) return {ok:false, error:'ข้อมูลไม่ครบ'};
  var sh = sheet_(SHEETS.LEAVE);
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][1]).trim() === leaveId){
      if(String(vals[i][2]).trim() !== empId) return {ok:false, error:'ใบลานี้ไม่ใช่ของคุณ'};
      var d0 = vals[i][5];
      var ds = (d0 instanceof Date)?Utilities.formatDate(d0,TZ,'yyyy-MM-dd'):String(d0).trim();
      if(ds < todayStr_()) return {ok:false, error:'ยกเลิกไม่ได้ — เป็นการลาที่ผ่านมาแล้ว'};
      sh.deleteRow(i+1);
      return {ok:true};
    }
  }
  return {ok:false, error:'ไม่พบใบลานี้'};
}

/* ---------- วันหยุดบริษัท ---------- */
function getHolidays_(){
  var sh = sheet_(SHEETS.HOLIDAY);
  if(!sh) return {ok:true, holidays:[]};
  var vals = sh.getDataRange().getValues();
  var out = [];
  for(var i=1;i<vals.length;i++){
    var d=vals[i][0]; if(!d) continue;
    var ds=(d instanceof Date)?Utilities.formatDate(d,TZ,'yyyy-MM-dd'):String(d).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
    out.push({date:ds, name:vals[i][1]||'วันหยุด'});
  }
  out.sort(function(a,b){ return a.date<b.date?-1:1; });
  return {ok:true, holidays:out};
}
function addHoliday_(d){
  var ds=String(d.date||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return {ok:false, error:'วันที่ไม่ถูกต้อง'};
  var sh=sheet_(SHEETS.HOLIDAY);
  var vals=sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    var dd=vals[i][0]; var dds=(dd instanceof Date)?Utilities.formatDate(dd,TZ,'yyyy-MM-dd'):String(dd).trim();
    if(dds===ds) return {ok:false, error:'มีวันหยุดนี้อยู่แล้ว'};
  }
  sh.appendRow([parseDateStr_(ds), d.name||'วันหยุด', nowStr_()]);
  sh.getRange(sh.getLastRow(),1).setNumberFormat('yyyy-mm-dd');
  return {ok:true};
}
function deleteHoliday_(d){
  var ds=String(d.date||'').trim();
  var sh=sheet_(SHEETS.HOLIDAY);
  var vals=sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    var dd=vals[i][0]; var dds=(dd instanceof Date)?Utilities.formatDate(dd,TZ,'yyyy-MM-dd'):String(dd).trim();
    if(dds===ds){ sh.deleteRow(i+1); return {ok:true}; }
  }
  return {ok:false, error:'ไม่พบวันหยุดนี้'};
}

/* Dashboard สรุปลารายเดือนต่อคน */
function getDashboard_(p){
  var month = String(p.month||'').trim(); // yyyy-MM ; ว่าง = เดือนปัจจุบัน
  if(!/^\d{4}-\d{2}$/.test(month)){
    month = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  }
  var vals = sheet_(SHEETS.LEAVE).getDataRange().getValues();
  var map = {}; // emp_id -> agg
  var totalHours = 0, totalCount = 0;
  var byType = {};
  var byStatus = {};

  for(var i=1;i<vals.length;i++){
    var d = vals[i][5];
    if(!(d instanceof Date)) continue;
    var m = Utilities.formatDate(d, TZ, 'yyyy-MM');
    if(m !== month) continue;

    var empId = String(vals[i][2]).trim();
    var name = vals[i][3];
    var nat = vals[i][4];
    var hours = Number(vals[i][7])||0;
    var type = vals[i][9]||'อื่นๆ';
    var status = vals[i][10]||'';

    if(!map[empId]) map[empId] = {emp_id:empId, name:name, nationality:nat, hours:0, days:0, count:0};
    map[empId].hours += hours;
    map[empId].days += hours/WORK_HOURS_PER_DAY;
    map[empId].count += 1;

    totalHours += hours; totalCount += 1;
    byType[type] = (byType[type]||0)+hours;
    byStatus[status] = (byStatus[status]||0)+1;
  }

  var people = Object.keys(map).map(function(k){ return map[k]; });
  people.sort(function(a,b){ return b.hours - a.hours; });
  people.forEach(function(x){ x.days = Math.round(x.days*100)/100; });

  return {
    ok:true, month:month,
    summary:{ total_hours:totalHours, total_requests:totalCount,
              total_days: Math.round(totalHours/WORK_HOURS_PER_DAY*100)/100,
              people_count: people.length },
    by_type: byType, by_status: byStatus, people: people
  };
}

/* ====== แอดมิน: จัดการใบลา (แก้สถานะ / ลบ) ====== */

var LEAVE_STATUSES = ['ลาล่วงหน้า','ลากระทันหัน (วันเดียวกัน)','ลาย้อนหลัง'];

/* ดึงรายการใบลา (เฉพาะแอดมิน) — กรองตามเดือน yyyy-MM ถ้าระบุ */
function getLeavesAdmin_(p){
  if(!(p && p.admin === '1' && checkPin_(p.pin))) return {ok:false, error:'PIN ไม่ถูกต้อง'};
  var month = String(p.month||'').trim();
  var vals = sheet_(SHEETS.LEAVE).getDataRange().getValues();
  var out = [];
  for(var i=1;i<vals.length;i++){
    var d = vals[i][5];
    if(month && /^\d{4}-\d{2}$/.test(month)){
      if(!(d instanceof Date)) continue;
      if(Utilities.formatDate(d, TZ, 'yyyy-MM') !== month) continue;
    }
    out.push({
      leave_id: vals[i][1],
      emp_id: vals[i][2],
      name: vals[i][3],
      nationality: vals[i][4],
      leave_date: fmtDate_(vals[i][5]),
      slots: vals[i][6],
      hours: vals[i][7],
      is_full_day: vals[i][8],
      leave_type: vals[i][9],
      filing_status: vals[i][10],
      reason: vals[i][11],
      filed_at: fmtCell_(vals[i][0])
    });
  }
  out.reverse(); // ล่าสุดบนสุด
  return {ok:true, leaves:out, statuses:LEAVE_STATUSES};
}

/* แก้สถานะการกรอกของใบลา (filing_status) */
function updateLeaveStatus_(d){
  var leaveId = String(d.leave_id||'').trim();
  var status = String(d.status||'').trim();
  if(!leaveId) return {ok:false, error:'ไม่พบ leave_id'};
  if(LEAVE_STATUSES.indexOf(status) < 0) return {ok:false, error:'สถานะไม่ถูกต้อง'};
  var sh = sheet_(SHEETS.LEAVE);
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][1]).trim() === leaveId){
      sh.getRange(i+1, 11).setValue(status); // คอลัมน์ filing_status (สีจะเปลี่ยนเองตามเงื่อนไข)
      return {ok:true, filing_status:status};
    }
  }
  return {ok:false, error:'ไม่พบใบลานี้'};
}

/* ลบใบลา (กรณีกรอกผิด) */
function deleteLeave_(d){
  var leaveId = String(d.leave_id||'').trim();
  if(!leaveId) return {ok:false, error:'ไม่พบ leave_id'};
  var sh = sheet_(SHEETS.LEAVE);
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][1]).trim() === leaveId){
      sh.deleteRow(i+1);
      return {ok:true};
    }
  }
  return {ok:false, error:'ไม่พบใบลานี้'};
}

/* ====== แอดมิน: จัดการพนักงาน ====== */

function addEmployee_(d){
  var nat = (d.nationality === 'MM') ? 'MM' : 'TH';
  var id = genEmpId_(nat);
  var sh = sheet_(SHEETS.EMP);
  sh.appendRow([
    id, d.name_th||'', d.name_mm||'', nat, d.photo_id||'',
    true, true, d.note||'', nowStr_()
  ]);
  syncPayrollRosters_();
  return {ok:true, emp_id:id};
}

function updateEmployee_(d){
  var emp = findEmployee_(d.emp_id);
  if(!emp) return {ok:false, error:'ไม่พบพนักงาน'};
  var sh = sheet_(SHEETS.EMP);
  var row = emp.row;
  var needSync = false; // รีเฟรช payroll เฉพาะเมื่อชื่อ/สัญชาติเปลี่ยน (ไม่ใช่ตอนเปลี่ยนรูป/หมายเหตุ)
  if(d.name_th !== undefined && String(d.name_th) !== String(emp.name_th||'')){ sh.getRange(row,2).setValue(d.name_th); needSync=true; }
  if(d.name_mm !== undefined && String(d.name_mm) !== String(emp.name_mm||'')){ sh.getRange(row,3).setValue(d.name_mm); needSync=true; }
  if(d.nationality !== undefined){ var nat=d.nationality==='MM'?'MM':'TH'; if(nat!==String(emp.nationality)){ sh.getRange(row,4).setValue(nat); needSync=true; } }
  if(d.photo_id !== undefined && d.photo_id !== '') sh.getRange(row,5).setValue(d.photo_id);
  if(d.note !== undefined) sh.getRange(row,8).setValue(d.note);
  if(needSync) syncPayrollRosters_();
  return {ok:true};
}

/* "ลบ" = ตั้ง active=false (เก็บประวัติลาไว้) */
function deleteEmployee_(d){
  var emp = findEmployee_(d.emp_id);
  if(!emp) return {ok:false, error:'ไม่พบพนักงาน'};
  sheet_(SHEETS.EMP).getRange(emp.row,7).setValue(false);
  syncPayrollRosters_();
  return {ok:true};
}

function toggleVisible_(d){
  var emp = findEmployee_(d.emp_id);
  if(!emp) return {ok:false, error:'ไม่พบพนักงาน'};
  var sh = sheet_(SHEETS.EMP);
  var cur = String(sh.getRange(emp.row,6).getValue()).toUpperCase() !== 'FALSE';
  sh.getRange(emp.row,6).setValue(!cur);
  return {ok:true, visible: !cur};
}

/* อัปโหลดรูป (base64) -> เก็บใน Drive -> คืน file_id */
function uploadPhoto_(d){
  if(!d.base64) return {ok:false, error:'ไม่มีไฟล์รูป'};
  var folder = getOrCreatePhotoFolder_();
  var b64 = d.base64.indexOf(',') >= 0 ? d.base64.split(',')[1] : d.base64;
  var mime = d.mime || 'image/jpeg';
  var name = (d.filename || ('photo_'+Date.now())) ;
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {ok:true, photo_id:file.getId(), photo_url:photoUrl_(file.getId())};
}

function setSettingApi_(d){
  if(!d.key) return {ok:false, error:'no key'};
  setSetting_(d.key, d.value||'');
  return {ok:true};
}

/* ====== Telegram ======
 * แจ้งเตือนเข้ากลุ่ม Telegram ทุกครั้งที่มีคนแจ้งลา
 * ต้องตั้งค่า 2 ค่าในชีท Settings: telegram_bot_token, telegram_chat_id
 * (ดูวิธีหา chat id ได้จากฟังก์ชัน getTelegramChatId ด้านล่าง)
 * ถ้ายังไม่ได้ตั้งค่า จะข้ามไปเฉยๆ ไม่ error
 */

// escape อักขระพิเศษของ HTML กันข้อความพังเวลาเหตุผล/ชื่อมี < > &
function tgEscape_(s){
  return String(s===undefined||s===null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ส่งข้อความเข้า Telegram (คืน response object) — ใช้ภายใน
function tgSend_(text){
  var token = getSetting_('telegram_bot_token');
  var chatId = getSetting_('telegram_chat_id');
  if(!token || !chatId) return {ok:false, error:'ยังไม่ได้ตั้งค่า token หรือ chat_id ในชีท Settings'};
  try{
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage', {
      method:'post',
      contentType:'application/json',
      payload: JSON.stringify({
        chat_id: chatId, text: text, parse_mode:'HTML', disable_web_page_preview:true
      }),
      muteHttpExceptions:true
    });
    var body = JSON.parse(res.getContentText());
    return body.ok ? {ok:true} : {ok:false, error: body.description || 'ส่งไม่สำเร็จ'};
  }catch(e){
    return {ok:false, error:String(e)};
  }
}

// ส่งรูป + คำบรรยาย (caption) เข้า Telegram โดยดึงไฟล์จาก Drive
function tgSendPhoto_(fileId, caption){
  var token = getSetting_('telegram_bot_token');
  var chatId = getSetting_('telegram_chat_id');
  if(!token || !chatId || !fileId) return {ok:false, error:'no token/chat/file'};
  try{
    var blob = DriveApp.getFileById(fileId).getBlob();
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendPhoto', {
      method:'post',
      payload:{ chat_id:chatId, caption:caption, parse_mode:'HTML', photo:blob },
      muteHttpExceptions:true
    });
    var body = JSON.parse(res.getContentText());
    return body.ok ? {ok:true} : {ok:false, error: body.description || 'ส่งรูปไม่สำเร็จ'};
  }catch(e){
    return {ok:false, error:String(e)};
  }
}

function notifyTelegram_(emp, leaveDate, slots, hours, leaveType, status, reason){
  var token = getSetting_('telegram_bot_token');
  var chatId = getSetting_('telegram_chat_id');
  if(!token || !chatId) return; // ยังไม่เปิดใช้

  var statusIcon = status.indexOf('ย้อนหลัง')>=0 ? '🔴' :
                   (status.indexOf('กระทันหัน')>=0 ? '🟡' : '🟢');
  var name = emp.name_th || emp.name_mm;
  if(emp.name_mm && emp.nationality==='MM') name = (emp.name_th||'') + ' / ' + emp.name_mm;
  var dayLabel = (hours >= WORK_HOURS_PER_DAY) ? ' (เต็มวัน)' : '';

  // เน้นพิเศษถ้าเป็นลาย้อนหลัง/กระทันหัน (แอดมินต้องจับตา)
  var alertHead = '';
  if(status.indexOf('ย้อนหลัง')>=0) alertHead = '⚠️⚠️ <b>ลาย้อนหลัง — ต้องตรวจสอบ</b> ⚠️⚠️\n';
  else if(status.indexOf('กระทันหัน')>=0) alertHead = '⚠️ <b>ลากระทันหัน (แจ้งวันลา)</b>\n';

  var text = alertHead +
    '📋 <b>แจ้งลาใหม่</b>\n' +
    '👤 ' + tgEscape_(name) + ' (' + tgEscape_(emp.emp_id) + ')\n' +
    '📅 วันลา: ' + tgEscape_(leaveDate) + '\n' +
    '⏰ เวลา: ' + tgEscape_(slots.join(', ')) + '  (' + hours + ' ชม.)' + dayLabel + '\n' +
    '📝 ประเภท: ' + tgEscape_(leaveType) + '\n' +
    statusIcon + ' สถานะ: <b>' + tgEscape_(status) + '</b>' +
    (reason ? ('\n💬 เหตุผล: ' + tgEscape_(reason)) : '');

  // ถ้ามีรูปพนักงาน ส่งรูปพร้อมคำบรรยาย; ถ้าไม่มี/ส่งรูปไม่ได้ ส่งข้อความแทน
  if(emp.photo_id){
    var r = tgSendPhoto_(emp.photo_id, text);
    if(!r.ok) tgSend_(text);
  } else {
    tgSend_(text);
  }
}

/* แจ้ง Telegram สรุปการลาหลายวัน (ส่งครั้งเดียว) */
function notifyTelegramRange_(emp, created, skipped, slots, leaveType, reason){
  var token=getSetting_('telegram_bot_token'), chatId=getSetting_('telegram_chat_id');
  if(!token||!chatId) return;
  var name=emp.name_th||emp.name_mm;
  if(emp.name_mm && emp.nationality==='MM') name=(emp.name_th||'')+' / '+emp.name_mm;
  var dates=created.map(function(c){return c.date;});
  var anyBack=created.some(function(c){return c.filing_status.indexOf('ย้อนหลัง')>=0;});
  var head = anyBack ? '⚠️ <b>ลาหลายวัน (มีลาย้อนหลัง)</b>\n' : '📋 <b>แจ้งลาหลายวัน</b>\n';
  var text = head +
    '👤 '+tgEscape_(name)+' ('+tgEscape_(emp.emp_id)+')\n'+
    '📅 ลา '+created.length+' วัน: '+tgEscape_(dates.join(', '))+'\n'+
    '⏰ เวลา/วัน: '+tgEscape_(slots.join(', '))+'  ('+slots.length+' ชม./วัน)\n'+
    '📝 ประเภท: '+tgEscape_(leaveType)+
    (reason?('\n💬 เหตุผล: '+tgEscape_(reason)):'')+
    (skipped.length?('\nℹ️ ข้าม '+skipped.length+' วัน (วันหยุด/อาทิตย์/ลาซ้ำ)'):'');
  if(emp.photo_id){ var r=tgSendPhoto_(emp.photo_id,text); if(!r.ok) tgSend_(text); }
  else tgSend_(text);
}

/* -------- ตัวช่วยตั้งค่า Telegram (รันจากเมนูในชีทได้) -------- */

// 1) หลังสร้างบอทแล้ว ให้เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์อะไรก็ได้ในกลุ่ม 1 ข้อความ
//    จากนั้นรันฟังก์ชันนี้ -> มันจะแสดง chat id ของกลุ่มให้ (ดูใน popup / Logs)
function getTelegramChatId(){
  var token = getSetting_('telegram_bot_token');
  if(!token){
    _alert_('กรุณาใส่ telegram_bot_token ในชีท Settings ก่อน');
    return;
  }
  try{
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getUpdates', {muteHttpExceptions:true});
    var body = JSON.parse(res.getContentText());
    if(!body.ok){ _alert_('Token ผิดหรือมีปัญหา: ' + (body.description||'')); return; }
    if(!body.result || body.result.length===0){
      _alert_('ยังไม่เจอข้อความ\n\nวิธีทำ:\n1) เพิ่มบอทเข้ากลุ่ม\n2) พิมพ์ข้อความอะไรก็ได้ในกลุ่ม 1 ครั้ง\n3) รันฟังก์ชันนี้อีกที');
      return;
    }
    var lines = [];
    var seen = {};
    body.result.forEach(function(u){
      var chat = (u.message && u.message.chat) || (u.channel_post && u.channel_post.chat);
      if(chat && !seen[chat.id]){
        seen[chat.id] = true;
        lines.push('• ' + (chat.title || chat.first_name || chat.type) + '  →  chat_id = ' + chat.id);
      }
    });
    var msg = 'พบแชตเหล่านี้:\n\n' + lines.join('\n') +
              '\n\nก๊อปปี้ chat_id ของกลุ่มที่ต้องการ ไปวางในชีท Settings แถว telegram_chat_id';
    Logger.log(msg);
    _alert_(msg);
  }catch(e){
    _alert_('ผิดพลาด: ' + e);
  }
}

// 2) ทดสอบส่งข้อความเข้ากลุ่ม (รันจากเมนู หรือเรียกผ่าน API ปุ่มในหน้าแอดมิน)
function testTelegram(){
  var r = tgSend_('✅ <b>ทดสอบ Telegram สำเร็จ</b>\nระบบแจ้งลา BCF เชื่อมต่อกลุ่มนี้เรียบร้อยแล้ว');
  _alert_(r.ok ? '✅ ส่งทดสอบสำเร็จ! ดูข้อความในกลุ่ม Telegram ได้เลย'
              : '❌ ส่งไม่สำเร็จ: ' + r.error);
  return r;
}

function _alert_(msg){
  try { SpreadsheetApp.getUi().alert(msg); } catch(e){ Logger.log(msg); }
}

/* ====== ฟอร์แมตค่า ====== */
function fmtCell_(v){
  if(v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return String(v||'');
}
function fmtDate_(v){
  if(v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v||'');
}

/* เมนูช่วยเรียก setup จากในชีท */
function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('BCF ระบบลา')
    .addItem('▶ ติดตั้ง/รีเซ็ตโครงสร้าง (setup)','setup')
    .addItem('🔄 รีเฟรชรายชื่อ Payroll','syncPayrollRosters_')
    .addSeparator()
    .addItem('📱 หา Chat ID ของกลุ่ม Telegram','getTelegramChatId')
    .addItem('✅ ทดสอบส่ง Telegram','testTelegram')
    .addToUi();
}
