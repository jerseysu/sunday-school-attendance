"""Parent sign-up page and teacher confirmation: validation, honeypot, accept/reject,
same-name merge, idempotent accept, expiry and the daily cap."""
from playwright.sync_api import sync_playwright
import datetime
import json
from helpers import BASE as B, post, call, dump, ok, OUT
def ev(js):
    r=post("/test/eval",("(()=>{"+js+"})()").encode()); assert r["ok"], r; return r
errs=[]; tel=[]
def mk(b):
    pg=b.new_page(viewport={"width":390,"height":844})
    pg.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    pg.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type=="error" and "tel:" not in m.text and "Failed to load resource" not in m.text and errs.append("console: "+m.text))
    return pg

# config: rules text set in 設定 sheet, waiver left empty
ev('const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("設定");sh.getRange(2,2).setValue("1. 請準時接送\\n2. <b>不要</b>帶零食"); return true')
# backend-only checks
ok(call("getSignups")["error"]=="BAD_PIN","getSignups without PIN is refused")
ok(call("getData")["error"]=="BAD_PIN","getData without PIN is refused")
ok(call("constructor")["error"]=="UNKNOWN_FN","prototype names are not callable")
base={"name":"測試","group":"0-3","rel":"媽媽","phone":"0912345678","agreeRules":True,"agreeWaiver":True,"version":"1","website":""}
ok("同意" in call("submitSignup",{**base,"agreeWaiver":False})["error"],"submit without waiver agreement rejected")
ok(call("submitSignup",{**base,"rel":"阿姨"})["ok"] is False,"rel whitelist enforced")
ok(call("submitSignup",{**base,"phone":"12-34"})["ok"] is False,"phone needs 6 digits")
ok(call("submitSignup",{**base,"name":"x"*21})["ok"] is False,"name length limit")
ok("更新" in call("submitSignup",{**base,"version":"0"})["error"],"stale rules version rejected")
ok(len(dump()["報名待確認"])==1,"no rows written by invalid submissions")

# a kid named 小明 already exists (for same-name merge)
xm=call("addKid","小明","3-6","",[{"rel":"爸爸","phone":"0933000111"}],pin="12345")["data"]["id"]

with sync_playwright() as p:
    b=p.chromium.launch()
    pg=mk(b)
    pg.goto(B+"/signup.html")
    pg.wait_for_function("document.getElementById('rulesText').textContent.includes('準時')")
    pg.click("#rulesBox summary")
    ok("<b>不要</b>" in pg.text_content("#rulesText"),"rules text from 設定 shown as plain text (escaped)")
    ok("還沒有填寫免責聲明" in pg.text_content("#waiverText"),"placeholder for empty waiver")
    pg.screenshot(path=OUT+"/signup-form.png",full_page=True)
    pg.fill("#name","彤彤"); pg.click("#group button[data-v='3-6']"); pg.click("#rel button[data-v='媽媽']"); pg.fill("#phone","0912-345-678")
    ok(pg.is_disabled("#submit"),"submit disabled before agreements")
    pg.click("#agreeRules")
    ok(pg.get_attribute("#agreeRules","aria-checked")=="true" and pg.is_disabled("#submit"),"one agreement still disabled")
    pg.click("#agreeWaiver")
    ok(not pg.is_disabled("#submit"),"submit enabled when both agreed")
    pg.click("#submit"); pg.wait_for_selector("#done:not([hidden])")
    code1=pg.text_content("#doneCode")
    ok(len(code1)==4 and code1.isdigit(),"done screen shows 4-digit code "+code1)
    ok(pg.text_content("#doneWho")=="彤彤・媽媽","done shows name・relation")
    ok("還不會出現在點名名單" in pg.inner_text("#done"),"done shows pending note")
    pg.screenshot(path=OUT+"/signup-done.png",full_page=True)
    pg.click("#again")
    ok(pg.input_value("#name")=="" and pg.input_value("#phone")=="0912-345-678" and pg.get_attribute("#rel button[data-v='媽媽']","aria-pressed")=="true","again keeps phone/relation, clears name")
    ok(pg.is_disabled("#submit") and pg.get_attribute("#group button[data-v='3-6']","aria-pressed")=="false","again resets agreements and age")
    # missing age → client error
    pg.fill("#name","小明"); pg.click("#agreeRules"); pg.click("#agreeWaiver"); pg.click("#submit")
    ok("年齡" in pg.text_content("#err"),"client validation message for missing age")
    pg.click("#group button[data-v='3-6']"); pg.click("#submit"); pg.wait_for_selector("#done:not([hidden])")
    code2=pg.text_content("#doneCode")
    # 3rd: to be rejected
    pg.click("#again"); pg.fill("#name","阿哲"); pg.click("#group button[data-v='0-3']"); pg.click("#rel button[data-v='爸爸']"); pg.fill("#phone","0955111222")
    pg.click("#agreeRules"); pg.click("#agreeWaiver"); pg.click("#submit"); pg.wait_for_selector("#done:not([hidden])")
    n_before=len(dump()["報名待確認"])
    # honeypot
    pg.click("#again"); pg.fill("#name","Bot"); pg.click("#group button[data-v='0-3']"); pg.fill("#website","http://spam.example")
    pg.click("#agreeRules"); pg.click("#agreeWaiver"); pg.click("#submit"); pg.wait_for_selector("#done:not([hidden])")
    ok(len(dump()["報名待確認"])==n_before,"honeypot submission shows success but stores nothing")
    rows=dump()["報名待確認"][1:]
    ok([r[2] for r in rows]==["彤彤","小明","阿哲"] and all(r[8]=="待確認" for r in rows),"3 pending rows written")
    ok(len({r[1] for r in rows})==3,"codes unique among pending")
    ok(rows[0][3]=="3-6" and rows[0][4]=="媽媽" and rows[0][5]=="0912-345-678" and rows[0][6]=="1","row fields stored")

    # ---------- teacher ----------
    t=mk(b)
    t.goto(B+"/")
    for d in "12345": t.click(f"#keys button:text-is('{d}')")
    t.wait_for_selector("#pin", state="hidden")
    t.wait_for_selector("#signupBanner:not([hidden])")
    ok("3 位新朋友等你確認" in t.inner_text("#signupBanner").replace("\n",""),"banner shows count 3")
    t.screenshot(path=OUT+"/teacher-banner.png")
    t.click("#signupBanner"); t.wait_for_selector("#sList [data-sid]")
    cards=t.locator("#sList [data-sid]")
    ok(cards.count()==3,"3 cards listed")
    c1=cards.nth(0)
    ok(code1 in c1.inner_text() and "0912-345-678" in c1.inner_text() and "3–6 歲" in c1.inner_text(),"card shows code, full phone, age")
    ok("已同意教室規則・免責聲明（" in c1.inner_text(),"card shows agreement with time")
    t.screenshot(path=OUT+"/teacher-list.png",full_page=True)
    ok(c1.locator("[data-sok]").get_attribute("aria-disabled")=="true","accept disabled before call")
    c1.locator("[data-sok]").click(force=True); t.wait_for_timeout(300)
    ok("撥打確認" in c1.inner_text() and len(dump()["孩子名單"])==2,"tapping disabled accept does nothing but hint")
    # edit phone
    c1.locator("[data-sedit]").click(); c1.locator("[data-sphone]").fill("0912-000-999")
    ok(c1.locator("[data-scall]").get_attribute("href")=="tel:0912000999","tel link follows edited phone")
    c1.locator("[data-scall]").click(); t.wait_for_timeout(300)
    ok(c1.locator("[data-sok]").get_attribute("aria-disabled")=="false","accept enabled after call")
    c1.locator("[data-sok]").click()
    t.wait_for_selector("#sList .scard.ok")
    ok("已加入名單，今天也點好名了" in t.inner_text("#sList .scard.ok"),"accepted card message")
    d=dump(); kid=[r for r in d["孩子名單"] if r[1]=="彤彤"]
    ok(len(kid)==1 and kid[0][2]=="3-6","kid created with age group")
    kid_id=kid[0][0]
    today=t.evaluate("(()=>{const d=new Date();while(![0,3,4,6].includes(d.getDay()))d.setDate(d.getDate()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
    slot=t.evaluate("document.querySelector('#slots [aria-pressed=true]').dataset.slot")
    ok(kid[0][4]==today+"_"+slot,"firstSeen = date_slot")
    ok([kid_id,"彤彤","媽媽","0912-000-999"]==[x for x in [r for r in d["家長聯絡"] if r[0]==kid_id][0][:4]],"contact written with child name and corrected phone")
    ok(any(r[2]==kid_id and r[0]==today and r[1]==slot for r in d["點名紀錄"]),"attendance row created")
    srow=[r for r in d["報名待確認"] if r[2]=="彤彤"][0]
    ok(srow[8]=="收下" and srow[10]==kid_id and srow[9],"signup marked 收下 with kid id")
    # same name card (小明)
    c2=t.locator("#sList [data-sid]").filter(has_text="小明")
    ok("名單裡已經有「小明」" in c2.inner_text(),"same-name notice")
    c2.locator("[data-scall]").click(); t.wait_for_timeout(200)
    ok(c2.locator("[data-sok]").get_attribute("aria-disabled")=="true","accept still disabled until same/different chosen")
    c2.locator("[data-schoice='same']").click()
    c2.locator("[data-sok]").click(); t.wait_for_timeout(600)
    d=dump()
    ok(len([r for r in d["孩子名單"] if r[1].startswith("小明")])==1,"merge did not create a new kid")
    ok(sorted(r[3] for r in d["家長聯絡"] if r[0]==xm)==["0912-345-678","0933000111"],"merge added phone to existing kid")
    ok(any(r[2]==xm and r[0]==today for r in d["點名紀錄"]),"merged kid marked present")
    # reject 阿哲
    c3=t.locator("#sList [data-sid]").filter(has_text="阿哲")
    c3.locator("[data-sno]").click()
    ok(c3.locator("[data-sno]").inner_text()=="再按一次確認不收" and [r for r in dump()["報名待確認"] if r[2]=="阿哲"][0][8]=="待確認","first tap only arms reject")
    t.screenshot(path=OUT+"/teacher-arm.png",full_page=True)
    c3.locator("[data-sno]").click(); t.wait_for_timeout(500)
    ok([r for r in dump()["報名待確認"] if r[2]=="阿哲"][0][8]=="不收","second tap marks 不收")
    ok("已標記不收" in t.inner_text("#sList"),"rejected card shown")
    t.screenshot(path=OUT+"/teacher-after.png",full_page=True)
    t.click("#sClose"); t.wait_for_timeout(300)
    ok(t.is_hidden("#signupBanner"),"banner gone when nothing pending")
    ok(t.locator(".kid.on",has_text="彤彤").count()==1 and t.locator(".kid.on",has_text="小明").count()==1,"accepted kids present on roll")
    ok("新朋友" in t.locator(".kid",has_text="彤彤").inner_text(),"new kid tagged 新朋友")
    # idempotent accept
    sid=srow[0]; nk=len(dump()["孩子名單"]); nr=len(dump()["點名紀錄"])
    r=call("acceptSignup",sid,{"date":today,"slot":slot},pin="12345")
    ok(r["data"]["kidId"]==kid_id and len(dump()["孩子名單"])==nk and len(dump()["點名紀錄"])==nr,"second accept returns same kid, no duplicates")
    ok(call("acceptSignup",[r for r in dump()["報名待確認"] if r[2]=="阿哲"][0][0],{"date":today,"slot":slot},pin="12345")["ok"] is False,"cannot accept a rejected signup")
    # different-child path & undecided same-name guard
    call("submitSignup",{**base,"name":"小明"})
    s4=call("getSignups",pin="12345")["data"][0]
    ok(s4["sameNameKidId"]==xm,"getSignups reports sameNameKidId")
    ok("同名" in call("acceptSignup",s4["id"],{"date":today,"slot":slot},pin="12345")["error"],"same name without decision is refused")
    r=call("acceptSignup",s4["id"],{"date":today,"slot":slot,"mergeKidId":None},pin="12345")["data"]
    ok(r["name"]=="小明（2）" and r["kidId"]!=xm,"different child added as 小明（2）")
    # expiry
    call("submitSignup",{**base,"name":"舊報名"})
    ev('const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("報名待確認");const n=sh.getLastRow();sh.getRange(n,8).setValue("2026-10-01 10:00:00");return true')
    ok(call("getSignups",pin="12345")["data"]==[] and call("getData",pin="12345")["data"]["pendingSignups"]==0,"expired signup excluded")
    ok(dump()["報名待確認"][-1][8]=="過期","expired row marked 過期")
    # daily cap
    ev('const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("設定");sh.getRange(5,2).setValue("6");return true')
    res=[call("submitSignup",{**base,"name":"cap%d"%i}) for i in range(3)]
    ok(any(not x["ok"] and "太多" in x["error"] for x in res),"daily cap enforced")
    public=json.dumps(call("submitSignup",{**base,"name":"資料"}))
    ok("0933000111" not in public and "彤彤" not in public,"public responses never include other rows")
    b.close()
print("page errors:", errs)
assert not errs
print("ALL PASS")
