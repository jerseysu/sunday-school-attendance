/**
 * 主日學點名 — Google Apps Script 後端
 * 資料存在這份試算表：「孩子名單」「點名紀錄」「家長聯絡」「報名待確認」「設定」
 * （後三張第一次用到時自動建立）
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
const SHEET_CONTACTS = '家長聯絡';
const SHEET_SIGNUP = '報名待確認';
const SHEET_CONFIG = '設定';
const RELS_ = ['爸爸', '媽媽', '其他'];
const SLOTS_ = ['sun', 'wed', 'thu', 'sat'];
const MAX_CONTACTS_ = 2;
const SIGNUP_DAYS_ = 14; // 超過 14 天沒處理的報名就當作過期
// 「設定」工作表的預設值（教會可以直接在試算表改 B 欄）
const CONFIG_DEFAULTS_ = [
  ['教室規則', ''],
  ['免責聲明', ''],
  ['規則版本', '1'],
  ['每日報名上限', '30']
];

/** ?page=signup 給家長報名頁，其他都是老師的點名頁 */
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'signup') {
    return HtmlService.createHtmlOutputFromFile('signup')
      .setTitle('蒙式角落・新朋友報到')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('主日學點名')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * JSON API，給 GitHub Pages 上的前端用。
 * 前端用 Content-Type: text/plain 送 POST，避開 Apps Script 不支援的 CORS 預檢。
 * body: {"fn":"getData","pin":"1234","args":[...]}
 */
const API_ = {
  getData: getData, setPresent: setPresent, addKid: addKid, updateKid: updateKid,
  getContacts: getContacts, setContacts: setContacts,
  getSignups: getSignups, acceptSignup: acceptSignup, rejectSignup: rejectSignup
};
// 不用密碼的公開 API（家長報名頁）：只能讀規則文字、送出報名，讀不到任何名單或電話
const PUBLIC_API_ = { getSignupInfo: getSignupInfo, submitSignup: submitSignup };
const own_ = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const args = Array.isArray(req.args) ? req.args : [];
    const name = String(req.fn);
    if (own_(PUBLIC_API_, name)) {
      out = { ok: true, data: PUBLIC_API_[name].apply(null, args) };
    } else {
      if (!own_(API_, name)) throw new Error('UNKNOWN_FN');
      out = { ok: true, data: API_[name].apply(null, [req.pin].concat(args)) };
    }
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

  contactsSheet_();
  signupSheet_();
  configSheet_();

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

/* ---------- 家長聯絡 ---------- */
// 一個孩子最多兩列：孩子id、稱呼（爸爸／媽媽／其他）、電話（存成文字，開頭的 0 才不會不見）
function contactsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_CONTACTS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_CONTACTS);
    sh.appendRow(['孩子id', '稱呼', '電話', '更新時間']);
    sh.getRange('A:C').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}
function cleanPhone_(v) {
  return String(v == null ? '' : v).replace(/[^\d+\- ]/g, '').trim().slice(0, 20);
}
function cleanContacts_(list) {
  if (!Array.isArray(list)) return [];
  return list.map(c => ({
    rel: RELS_.indexOf(String(c && c.rel)) >= 0 ? String(c.rel) : '其他',
    phone: cleanPhone_(c && c.phone)
  })).filter(c => c.phone.replace(/\D/g, '').length >= 6).slice(0, MAX_CONTACTS_);
}
function readContacts_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTACTS);
  if (!sh) return [];
  return rows_(sh).filter(r => r[0]).map(r => ({ kidId: String(r[0]), rel: String(r[1]), phone: cleanPhone_(r[2]) }));
}
function writeContacts_(kidId, list) {
  const sh = contactsSheet_();
  const data = rows_(sh);
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0]) === kidId) sh.deleteRow(i + 2);
  }
  list.forEach(c => appendText_(sh, [kidId, c.rel, c.phone, new Date()]));
}

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
  const withPhone = {};
  readContacts_().forEach(c => { withPhone[c.kidId] = true; });
  const kids = rows_(sheet_(SHEET_KIDS)).filter(r => r[0]).map(r => ({
    id: String(r[0]), name: String(r[1]), group: group_(r[2]),
    active: String(r[3]).toUpperCase() !== 'FALSE', firstSeen: fs_(r[4]),
    hasContact: !!withPhone[String(r[0])]
  }));
  const records = rows_(sheet_(SHEET_REC)).filter(r => r[0]).map(r => ({
    date: day_(r[0]), slot: String(r[1]), kidId: String(r[2])
  }));
  return { kids: kids, records: records, pendingSignups: countPending_() };
}

/** 點名或取消點名 */
function setPresent(pin, date, slot, kidId, on) {
  check_(pin);
  return withLock_(() => setPresent_(date, slot, kidId, on));
}
// 呼叫前要先拿到鎖
function setPresent_(date, slot, kidId, on) {
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
}

/** 新增孩子；同名的孩子已存在就回傳原本的 id（並重新顯示） */
function addKid(pin, name, group, firstSeen, contacts) {
  check_(pin);
  name = String(name || '').trim();
  if (!name) throw new Error('請輸入名字');
  const list = cleanContacts_(contacts);
  return withLock_(() => {
    const sh = sheet_(SHEET_KIDS);
    const data = rows_(sh);
    const i = data.findIndex(r => String(r[1]) === name);
    let id, existed;
    if (i >= 0) {
      sh.getRange(i + 2, 4).setValue('TRUE');
      id = String(data[i][0]); existed = true;
    } else {
      id = Utilities.getUuid().slice(0, 8); existed = false;
      appendText_(sh, [id, name, group === '3-6' ? '3-6' : '0-3', 'TRUE', firstSeen || '', new Date()]);
    }
    if (list.length) writeContacts_(id, list); // 同名孩子已存在時，只有填了電話才覆蓋
    const has = list.length > 0 || readContacts_().some(c => c.kidId === id);
    return { id: id, existed: existed, hasContact: has };
  });
}

/** 讀家長電話：給 kidId 只回那個孩子的，不給就回全部（名單頁用） */
function getContacts(pin, kidId) {
  check_(pin);
  const all = readContacts_();
  if (kidId) return all.filter(c => c.kidId === String(kidId)).map(c => ({ rel: c.rel, phone: c.phone }));
  const out = {};
  all.forEach(c => { (out[c.kidId] = out[c.kidId] || []).push({ rel: c.rel, phone: c.phone }); });
  return out;
}

/** 整組取代某個孩子的家長電話（空陣列＝全部刪除） */
function setContacts(pin, kidId, contacts) {
  check_(pin);
  kidId = String(kidId || '');
  if (!kidId) throw new Error('找不到這個孩子');
  const list = cleanContacts_(contacts);
  return withLock_(() => {
    if (!rows_(sheet_(SHEET_KIDS)).some(r => String(r[0]) === kidId)) throw new Error('找不到這個孩子');
    writeContacts_(kidId, list);
    return list;
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

/* ---------- 家長自己報名（報名待確認） ---------- */
// 欄位：報名id、報到碼、孩子名字、年齡層、稱呼、電話、同意規則版本、送出時間、狀態、處理時間、孩子id
// 全部存成純文字（時間也是 yyyy-MM-dd HH:mm:ss 文字），試算表才不會自作主張轉格式
const SIGNUP_HEAD_ = ['報名id', '報到碼', '孩子名字', '年齡層', '稱呼', '電話', '同意規則版本', '送出時間', '狀態', '處理時間', '孩子id'];
const ST_PENDING_ = '待確認', ST_OK_ = '收下', ST_NO_ = '不收', ST_EXPIRED_ = '過期';

// 第一次用到時建立；兩個人同時建立時，慢的那個改拿已經建好的
function ensureSheet_(name, init) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  try { sh = ss.insertSheet(name); } catch (err) { sh = ss.getSheetByName(name); if (sh) return sh; throw err; }
  init(sh);
  return sh;
}
function signupSheet_() {
  return ensureSheet_(SHEET_SIGNUP, sh => {
    sh.getRange('A:K').setNumberFormat('@');
    sh.appendRow(SIGNUP_HEAD_);
    sh.setFrozenRows(1);
  });
}
function configSheet_() {
  return ensureSheet_(SHEET_CONFIG, sh => {
    sh.getRange('A:B').setNumberFormat('@');
    sh.appendRow(['項目', '內容']);
    CONFIG_DEFAULTS_.forEach(r => sh.appendRow(r));
    sh.setFrozenRows(1);
  });
}
function config_() {
  const out = {};
  CONFIG_DEFAULTS_.forEach(r => { out[r[0]] = r[1]; });
  rows_(configSheet_()).forEach(r => {
    const k = String(r[0]).trim();
    if (k && String(r[1]) !== '') out[k] = String(r[1]);
  });
  return out;
}
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function writeTextRow_(sh, row, values) {
  sh.getRange(row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
}
function setCell_(sh, row, col, v) { setText_(sh.getRange(row, col), v); }
// 送出時間（文字）距今幾天
function ageDays_(time) {
  const d = String(time).slice(0, 10).split('-').map(Number);
  const t = now_().slice(0, 10).split('-').map(Number);
  if (d.length < 3 || d.some(isNaN)) return 0;
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(d[0], d[1] - 1, d[2])) / 86400000);
}
function isPending_(r) { return String(r[8]) === ST_PENDING_ && ageDays_(r[7]) <= SIGNUP_DAYS_; }
function countPending_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SIGNUP);
  return sh ? rows_(sh).filter(r => r[0] && isPending_(r)).length : 0;
}
// 名字只留一般文字：去掉控制字元、多餘空白，開頭不能是 = + - @（避免被當成公式）
function cleanName_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ')
    .trim().replace(/^[=+\-@\s]+/, '');
}

/** 公開：報名頁要顯示的教室規則、免責聲明 */
function getSignupInfo() {
  const c = config_();
  return { rules: String(c['教室規則'] || ''), waiver: String(c['免責聲明'] || ''), version: String(c['規則版本'] || '1') };
}

/** 公開：家長送出報名。只回報到碼，不回任何其他資料 */
function submitSignup(form) {
  form = form && typeof form === 'object' ? form : {};
  const fakeCode = () => String(1000 + Math.floor(Math.random() * 9000));
  if (String(form.website || '') !== '') return { code: fakeCode() }; // 機器人：假裝成功，不存
  const name = cleanName_(form.name);
  if (!name) throw new Error('請填孩子的名字');
  if (Array.from(name).length > 20) throw new Error('名字太長了，20 個字以內就好');
  const group = String(form.group);
  if (group !== '0-3' && group !== '3-6') throw new Error('請選孩子的年齡');
  const rel = String(form.rel);
  if (RELS_.indexOf(rel) < 0) throw new Error('請選您是孩子的誰');
  const phone = cleanPhone_(form.phone);
  if (phone.replace(/\D/g, '').length < 6) throw new Error('請填您的手機號碼');
  if (form.agreeRules !== true || form.agreeWaiver !== true) throw new Error('請先閱讀並同意教室規則和免責聲明');
  const c = config_();
  const version = String(c['規則版本'] || '1');
  if (String(form.version == null ? '' : form.version) !== version) throw new Error('規則剛剛更新了，請重新整理頁面再看一次');
  const cap = Math.max(0, parseInt(c['每日報名上限'], 10) || 30);
  return withLock_(() => {
    const sh = signupSheet_();
    const data = rows_(sh).filter(r => r[0]);
    const today = now_().slice(0, 10);
    if (data.filter(r => String(r[7]).slice(0, 10) === today).length >= cap) {
      throw new Error('今天報名的人太多了，請直接找現場老師');
    }
    const used = {};
    data.filter(isPending_).forEach(r => { used[String(r[1])] = true; });
    let code = fakeCode();
    for (let i = 0; i < 100 && used[code]; i++) code = fakeCode();
    if (used[code]) throw new Error('請稍後再試一次');
    writeTextRow_(sh, sh.getLastRow() + 1, [
      Utilities.getUuid().slice(0, 8), code, name, group, rel, phone, version, now_(), ST_PENDING_, '', ''
    ]);
    return { code: code };
  });
}

/** 老師：待確認的報名（過期的會順手標成「過期」） */
function getSignups(pin) {
  check_(pin);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SIGNUP);
  if (!sh) return [];
  const kidByName = {};
  rows_(sheet_(SHEET_KIDS)).filter(r => r[0]).forEach(r => {
    const n = String(r[1]).trim();
    if (!kidByName[n]) kidByName[n] = String(r[0]);
  });
  const data = rows_(sh);
  const expired = [];
  const out = [];
  data.forEach((r, i) => {
    if (!r[0] || String(r[8]) !== ST_PENDING_) return;
    if (!isPending_(r)) { expired.push(i + 2); return; }
    const name = String(r[2]);
    out.push({
      id: String(r[0]), code: String(r[1]), name: name, group: group_(r[3]), rel: String(r[4]),
      phone: cleanPhone_(r[5]), version: String(r[6]), time: String(r[7]),
      sameNameKidId: kidByName[name.trim()] || null
    });
  });
  if (expired.length) {
    withLock_(() => expired.forEach(row => {
      if (String(sh.getRange(row, 9).getValues()[0][0]) === ST_PENDING_) {
        setCell_(sh, row, 9, ST_EXPIRED_); setCell_(sh, row, 10, now_());
      }
    }));
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function findSignup_(sh, id) {
  id = String(id || '');
  const data = rows_(sh);
  const i = id ? data.findIndex(r => String(r[0]) === id) : -1;
  if (i < 0) throw new Error('找不到這筆報名');
  return { row: i + 2, r: data[i] };
}

/**
 * 老師：電話確認後收下。opts = {date, slot, mergeKidId?, phone?}
 * mergeKidId：字串＝跟名單裡那個孩子是同一個（只補電話）；null＝不同孩子（另外新增）
 * 同一筆再按一次會回傳同一個 kidId，不會重複新增
 */
function acceptSignup(pin, id, opts) {
  check_(pin);
  opts = opts && typeof opts === 'object' ? opts : {};
  const date = String(opts.date || '');
  const slot = String(opts.slot || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期不對');
  if (SLOTS_.indexOf(slot) < 0) throw new Error('場次不對');
  return withLock_(() => {
    const sh = signupSheet_();
    const s = findSignup_(sh, id);
    const status = String(s.r[8]);
    if (status === ST_OK_) return { kidId: String(s.r[10]), already: true };
    if (status === ST_NO_) throw new Error('這筆已經標記不收了');
    if (status !== ST_PENDING_ || !isPending_(s.r)) throw new Error('這筆報名已經過期了');
    const rel = RELS_.indexOf(String(s.r[4])) >= 0 ? String(s.r[4]) : '其他';
    const phone = cleanPhone_(opts.phone != null && String(opts.phone).trim() !== '' ? opts.phone : s.r[5]);
    if (phone.replace(/\D/g, '').length < 6) throw new Error('電話號碼太短了');
    const kidsSh = sheet_(SHEET_KIDS);
    const kids = rows_(kidsSh);
    let name = String(s.r[2]).trim();
    let kidId, merged = false;
    if (opts.mergeKidId) {
      kidId = String(opts.mergeKidId);
      const ki = kids.findIndex(r => String(r[0]) === kidId);
      if (ki < 0) throw new Error('找不到名單裡的那個孩子');
      kidsSh.getRange(ki + 2, 4).setValue('TRUE');
      name = String(kids[ki][1]);
      merged = true;
      // 只補電話：同一支號碼已經有了就不動；兩位都滿了就換掉同稱呼（或第二位）的那支
      const list = readContacts_().filter(c => c.kidId === kidId).map(c => ({ rel: c.rel, phone: c.phone }));
      const d = phone.replace(/\D/g, '');
      if (!list.some(c => c.phone.replace(/\D/g, '') === d)) {
        if (list.length < MAX_CONTACTS_) list.push({ rel: rel, phone: phone });
        else {
          const j = list.findIndex(c => c.rel === rel);
          list[j >= 0 ? j : list.length - 1] = { rel: rel, phone: phone };
        }
        writeContacts_(kidId, list);
      }
    } else {
      const names = {};
      kids.forEach(r => { names[String(r[1]).trim()] = true; });
      if (names[name]) {
        if (opts.mergeKidId !== null) throw new Error('名單裡已經有同名的孩子，請先選是不是同一個孩子');
        // 不同孩子但同名：加上（2）（3）…，點名時才分得出來，之後可以在名單頁改
        let n = 2;
        while (names[name + '（' + n + '）']) n++;
        name = name + '（' + n + '）';
      }
      kidId = Utilities.getUuid().slice(0, 8);
      appendText_(kidsSh, [kidId, name, group_(s.r[3]), 'TRUE', date + '_' + slot, new Date()]);
      // 全新的孩子：沒有舊電話、沒有舊點名，直接加一列就好（不用整張表掃一遍）
      appendText_(contactsSheet_(), [kidId, rel, phone, new Date()]);
      appendText_(sheet_(SHEET_REC), [date, slot, kidId, name, new Date()]);
    }
    if (merged) setPresent_(date, slot, kidId, true);
    // 報名那一列：電話、狀態、處理時間、孩子id 一次寫完（第 6～11 欄）
    sh.getRange(s.row, 6, 1, 6).setNumberFormat('@')
      .setValues([[phone, String(s.r[6]), String(s.r[7]), ST_OK_, now_(), kidId]]);
    return { kidId: kidId, name: name, merged: merged, group: group_(s.r[3]), firstSeen: merged ? '' : date + '_' + slot };
  });
}

/** 老師：不收 */
function rejectSignup(pin, id) {
  check_(pin);
  return withLock_(() => {
    const sh = signupSheet_();
    const s = findSignup_(sh, id);
    const status = String(s.r[8]);
    if (status === ST_NO_) return true;
    if (status === ST_OK_) throw new Error('這筆已經收下了');
    setCell_(sh, s.row, 9, ST_NO_);
    setCell_(sh, s.row, 10, now_());
    return true;
  });
}
