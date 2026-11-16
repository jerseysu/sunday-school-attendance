/**
 * 主日學點名 — Google Apps Script 後端
 * 資料存在這份試算表的兩個工作表：「孩子名單」「點名紀錄」
 *
 * 第一次使用（詳見 README）：
 *   1. 專案設定 > 指令碼屬性，新增 PIN = 你們教室的 5 位數密碼
 *      （密碼不寫在程式碼裡，才不會被推上 GitHub）
 *   2. 在編輯器上方選 setup，按「執行」，依提示授權
 *   3. 部署 > 新增部署作業 > 網頁應用程式（執行身分：我；誰可以存取：所有人）
 */
const SHEET_KIDS = '孩子名單';
const SHEET_REC = '點名紀錄';
const SHEET_STATS = '統計';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('主日學點名')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * JSON API，給 GitHub Pages 上的前端用。
 * 前端用 Content-Type: text/plain 送 POST，避開 Apps Script 不支援的 CORS 預檢。
 * body: {"fn":"getData","pin":"1234","args":[...]}
 */
const API_ = { getData: getData, setPresent: setPresent, addKid: addKid, updateKid: updateKid };

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API_[req.fn];
    if (!fn) throw new Error('UNKNOWN_FN');
    const args = Array.isArray(req.args) ? req.args : [];
    out = { ok: true, data: fn.apply(null, [req.pin].concat(args)) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 第一次執行：建立工作表與欄位 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kids = ss.getSheetByName(SHEET_KIDS) || ss.insertSheet(SHEET_KIDS);
  if (kids.getLastRow() === 0) {
    kids.appendRow(['id', '名字', '年齡層', '顯示', '第一次來', '建立時間']);
  }
  kids.getRange('A:E').setNumberFormat('@');
  kids.setFrozenRows(1);

  const rec = ss.getSheetByName(SHEET_REC) || ss.insertSheet(SHEET_REC);
  if (rec.getLastRow() === 0) {
    rec.appendRow(['日期', '場次', '孩子id', '名字', '點名時間']);
  }
  rec.getRange('A:D').setNumberFormat('@');
  rec.setFrozenRows(1);

  const st = ss.getSheetByName(SHEET_STATS) || ss.insertSheet(SHEET_STATS);
  st.getRange('A1').setFormula(
    "=QUERY('" + SHEET_REC + "'!A:C,\"select A, B, count(C) where A is not null group by A, B order by A desc label A '日期', B '場次', count(C) '人數'\",1)"
  );
  st.setFrozenRows(1);

  // 修復：把已經被轉成日期的格子改回文字
  [[kids, 3, group_], [rec, 1, day_]].forEach(([sh, col, f]) => {
    const n = sh.getLastRow();
    if (n < 2) return;
    const rg = sh.getRange(2, col, n - 1, 1);
    const vals = rg.getValues().map(r => [r[0] === '' ? '' : f(r[0])]);
    rg.setNumberFormat('@').setValues(vals);
  });

  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 3) ss.deleteSheet(def);
}

/* ---------- 共用 ---------- */
// 試算表常把 2026-11-16、0-3 自動轉成日期；讀取時一律轉回文字
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function tz_() { return Session.getScriptTimeZone() || 'Asia/Taipei'; }
function day_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
function group_(v) {
  if (isDate_(v)) return (v.getMonth() === 2 && v.getDate() === 6) ? '3-6' : '0-3';
  return String(v) === '3-6' ? '3-6' : '0-3';
}
function fs_(v) { return isDate_(v) ? day_(v) + '_sun' : String(v || ''); }
// 寫入前先把格子設成純文字，避免被轉成日期；最後一欄（時間）保留原格式
function appendText_(sh, values) {
  const row = sh.getLastRow() + 1;
  const n = values.length;
  sh.getRange(row, 1, 1, n - 1).setNumberFormat('@');
  sh.getRange(row, 1, 1, n).setValues([values]);
}
function setText_(rg, v) { rg.setNumberFormat('@').setValue(v); }

function check_(pin) {
  const real = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!real) throw new Error('尚未設定教室密碼：請到專案設定 > 指令碼屬性新增 PIN');
  if (String(pin) !== String(real)) throw new Error('BAD_PIN');
}
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('請先在試算表的 Apps Script 執行 setup');
  return sh;
}
function rows_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- 給網頁呼叫的 API ---------- */

/** 讀取全部名單與點名紀錄 */
function getData(pin) {
  check_(pin);
  const kids = rows_(sheet_(SHEET_KIDS)).filter(r => r[0]).map(r => ({
    id: String(r[0]), name: String(r[1]), group: group_(r[2]),
    active: String(r[3]).toUpperCase() !== 'FALSE', firstSeen: fs_(r[4])
  }));
  const records = rows_(sheet_(SHEET_REC)).filter(r => r[0]).map(r => ({
    date: day_(r[0]), slot: String(r[1]), kidId: String(r[2])
  }));
  return { kids: kids, records: records };
}

/** 點名或取消點名 */
function setPresent(pin, date, slot, kidId, on) {
  check_(pin);
  return withLock_(() => {
    const sh = sheet_(SHEET_REC);
    const data = rows_(sh);
    const hits = [];
    data.forEach((r, i) => {
      if (day_(r[0]) === date && String(r[1]) === slot && String(r[2]) === kidId) hits.push(i + 2);
    });
    if (on && hits.length === 0) {
      const kid = rows_(sheet_(SHEET_KIDS)).find(r => String(r[0]) === kidId);
      appendText_(sh, [date, slot, kidId, kid ? String(kid[1]) : '', new Date()]);
    }
    if (!on) hits.reverse().forEach(row => sh.deleteRow(row));
    return true;
  });
}

/** 新增孩子；同名的孩子已存在就回傳原本的 id（並重新顯示） */
function addKid(pin, name, group, firstSeen) {
  check_(pin);
  name = String(name || '').trim();
  if (!name) throw new Error('請輸入名字');
  return withLock_(() => {
    const sh = sheet_(SHEET_KIDS);
    const data = rows_(sh);
    const i = data.findIndex(r => String(r[1]) === name);
    if (i >= 0) {
      sh.getRange(i + 2, 4).setValue('TRUE');
      return { id: String(data[i][0]), existed: true };
    }
    const id = Utilities.getUuid().slice(0, 8);
    appendText_(sh, [id, name, group === '3-6' ? '3-6' : '0-3', 'TRUE', firstSeen || '', new Date()]);
    return { id: id, existed: false };
  });
}

/** 修改孩子：name / group / active */
function updateKid(pin, id, fields) {
  check_(pin);
  return withLock_(() => {
    const sh = sheet_(SHEET_KIDS);
    const data = rows_(sh);
    const i = data.findIndex(r => String(r[0]) === id);
    if (i < 0) throw new Error('找不到這個孩子');
    const row = i + 2;
    if (fields.name != null) sh.getRange(row, 2).setValue(String(fields.name).trim());
    if (fields.group != null) setText_(sh.getRange(row, 3), fields.group === '3-6' ? '3-6' : '0-3');
    if (fields.active != null) sh.getRange(row, 4).setValue(fields.active ? 'TRUE' : 'FALSE');
    return true;
  });
}
