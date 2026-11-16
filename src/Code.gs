/**
 * 主日學點名 — Google Apps Script 後端
 * 資料存在這份試算表的兩個工作表：「孩子名單」「點名紀錄」
 *
 * 第一次使用（詳見 README）：
 *   1. 專案設定 > 指令碼屬性，新增 PIN = 你們教室的 4 位數密碼
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

  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 3) ss.deleteSheet(def);
}

/* ---------- 共用 ---------- */
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
    id: String(r[0]), name: String(r[1]), group: String(r[2] || '0-3'),
    active: String(r[3]).toUpperCase() !== 'FALSE', firstSeen: String(r[4] || '')
  }));
  const records = rows_(sheet_(SHEET_REC)).filter(r => r[0]).map(r => ({
    date: String(r[0]), slot: String(r[1]), kidId: String(r[2])
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
      if (String(r[0]) === date && String(r[1]) === slot && String(r[2]) === kidId) hits.push(i + 2);
    });
    if (on && hits.length === 0) {
      const kid = rows_(sheet_(SHEET_KIDS)).find(r => String(r[0]) === kidId);
      sh.appendRow([date, slot, kidId, kid ? kid[1] : '', new Date()]);
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
    sh.appendRow([id, name, group === '3-6' ? '3-6' : '0-3', 'TRUE', firstSeen || '', new Date()]);
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
    if (fields.group != null) sh.getRange(row, 3).setValue(fields.group === '3-6' ? '3-6' : '0-3');
    if (fields.active != null) sh.getRange(row, 4).setValue(fields.active ? 'TRUE' : 'FALSE');
    return true;
  });
}
