// Mock Apps Script for tests: runs the real src/Code.gs against in-memory sheets and serves
// src/index.html and src/signup.html. PORT (default 8766); OLD_CONTACTS=1 seeds old-format 孩子名單/家長聯絡/設定/報名待確認 sheets.
const fs=require('fs'),vm=require('vm'),http=require('http');
const path=require('path');
const ROOT=path.join(__dirname,'..','src')+path.sep;
const PORT=Number(process.env.PORT||8766);
const sheets={};
function mkSheet(name){return{name,rows:[]}}
const api=sh=>({
  getLastRow:()=>sh.rows.length,getLastColumn:()=>Math.max(1,...sh.rows.map(r=>r.length)),
  appendRow:v=>sh.rows.push(v.slice()),
  getRange:(a,b,c,d)=>{
    if(typeof a==='string')return{setNumberFormat(){return this},setFormula(){return this}};
    const r0=a,c0=b,nr=c||1,nc=d||1;
    return{
      getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>((sh.rows[r0-1+i]||[])[c0-1+j])??'')),
      setNumberFormat(){return this},
      setValues(v){v.forEach((row,i)=>{sh.rows[r0-1+i]=sh.rows[r0-1+i]||[];row.forEach((x,j)=>sh.rows[r0-1+i][c0-1+j]=x)});return this},
      setValue(x){sh.rows[r0-1]=sh.rows[r0-1]||[];sh.rows[r0-1][c0-1]=x;return this},
      getValue:()=>((sh.rows[r0-1]||[])[c0-1])??''
    }},
  deleteRow:r=>sh.rows.splice(r-1,1),setFrozenRows(){},
  insertColumnAfter:c=>{sh.rows.forEach(r=>{while(r.length<c)r.push('');r.splice(c,0,'')})},
});
const ss={getSheetByName:n=>sheets[n]?api(sheets[n]):null,
  insertSheet:n=>{if(sheets[n])throw new Error('exists');sheets[n]=mkSheet(n);return api(sheets[n])},
  getSheets:()=>Object.keys(sheets),deleteSheet(){}};
const p2=n=>String(n).padStart(2,'0');
function formatDate(d,tz,fmt){const t=new Date(d.getTime()+8*3600e3);
  return fmt.replace('yyyy',t.getUTCFullYear()).replace('MM',p2(t.getUTCMonth()+1)).replace('dd',p2(t.getUTCDate()))
    .replace('HH',p2(t.getUTCHours())).replace('mm',p2(t.getUTCMinutes())).replace('ss',p2(t.getUTCSeconds()));}
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},PropertiesService:{getScriptProperties:()=>({getProperty:()=>'12345'})},
 Session:{getScriptTimeZone:()=>'Asia/Taipei'},Utilities:{formatDate,getUuid:()=>Math.random().toString(16).slice(2,10)+'-x'},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return t}})},
 HtmlService:{createHtmlOutputFromFile:f=>({file:f,setTitle(){return this},addMetaTag(){return this}})},console,Math,Date};
ctx.__sheets=sheets;vm.createContext(ctx);vm.runInContext(fs.readFileSync(ROOT+'Code.gs','utf8'),ctx);
if(process.env.OLD_CONTACTS){ // 模擬舊版家長聯絡（沒有孩子名字欄）
  sheets['孩子名單']={name:'孩子名單',rows:[['id','名字','年齡層','顯示','第一次來','建立時間'],['k1','舊小明','0-3','TRUE','','']]};
  sheets['家長聯絡']={name:'家長聯絡',rows:[['孩子id','稱呼','電話','更新時間'],['k1','媽媽','0912-111-222','x']]};
  // 舊版設定（教室規則＋免責聲明）和舊版報名表（12 欄，沒有家長姓名、參與方式）
  sheets['設定']={name:'設定',rows:[['項目','內容'],['教室規則','舊規則'],['免責聲明',''],['規則版本','1'],['每日報名上限','30']]};
  const now=formatDate(new Date(),'','yyyy-MM-dd HH:mm:ss');
  sheets['報名待確認']={name:'報名待確認',rows:[['報名id','報到碼','孩子名字','年齡層','稱呼','電話','同意規則版本','送出時間','狀態','處理時間','孩子id','怎麼知道我們'],
    ['s1','1234','舊報名','0-3','爸爸','0922-333-444','1',now,'待確認','','','']]};
}
vm.runInContext('setup()',ctx);
const page=f=>fs.readFileSync(ROOT+f,'utf8').replace('__APPS_SCRIPT_URL__','http://localhost:'+PORT+'/api').replace('/^https:\\/\\//','/^http/');
http.createServer((req,res)=>{
  if(req.method==='POST'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{
    if(req.url==='/test/eval'){let out;try{out=JSON.stringify({ok:true,v:vm.runInContext(b,ctx)})}catch(e){out=JSON.stringify({ok:false,e:String(e)})}res.end(out);return}
    const out=ctx.doPost({postData:{contents:b}});
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(out)});return}
  if(req.url.startsWith('/dump')){res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,v])=>[k,v.rows]))));return}
  if(req.url.startsWith('/signup.html')){res.writeHead(200,{'Content-Type':'text/html'});res.end(page('signup.html'));return}
  if(req.url==='/'||req.url.startsWith('/index.html')){res.writeHead(200,{'Content-Type':'text/html'});res.end(page('index.html'));return}
  res.writeHead(404);res.end();
}).listen(PORT,()=>console.log('up'));
