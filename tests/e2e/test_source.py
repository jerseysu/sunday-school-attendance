"""How families found us: parent sign-up dropdown, teacher add/edit, carried over on accept, stats."""
from playwright.sync_api import sync_playwright
from helpers import BASE, new_page, login, ok, rows, wait_until, dump, shot

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    par = new_page(b, errs)
    par.goto(BASE + "/signup.html"); par.wait_for_selector("#src option[value='其他']", state="attached")
    par.fill("#name", "報名寶寶"); par.click("#group button[data-v='3-6']"); par.click("#rel button[data-v='媽媽']")
    par.fill("#phone", "0911222333")
    ok(not par.is_visible("#srcOther"), "other note is hidden until 其他 is chosen")
    par.select_option("#src", "其他")
    ok(par.is_visible("#srcOther"), "choosing 其他 shows the note box")
    par.fill("#srcOther", "公園認識")
    par.click("#agreeRules"); par.click("#agreeWaiver"); par.click("#submit")
    par.wait_for_selector("#done", state="visible")
    ok([r[11] for r in rows("報名待確認")] == ["其他：公園認識"], "sign-up stores the source with the note")
    shot(par, "source-signup.png")

    t = new_page(b, errs)
    login(t)
    t.click("#newBtn"); t.fill("#mName", "老師新增"); t.select_option("#mSrc", "親友介紹"); t.click("#mSave")
    wait_until(lambda: any(r[1] == "老師新增" for r in rows("孩子名單")), msg="teacher-added child saved")
    t.click("#newBtn"); t.fill("#mName", "角落來的"); t.select_option("#mSrc", "蒙式角落"); t.click("#mSave")
    wait_until(lambda: any(r[1] == "角落來的" and len(r) > 6 and r[6] == "蒙式角落" for r in rows("孩子名單")), msg="蒙式角落 source saved")
    ok(par.locator("#src option[value='蒙式角落']").count() == 1, "sign-up dropdown offers 蒙式角落")
    t.click("#newBtn"); t.fill("#mName", "沒填管道"); t.click("#mSave")
    wait_until(lambda: any(r[1] == "沒填管道" for r in rows("孩子名單")), msg="child without source saved")
    ok(dump()["孩子名單"][0][6] == "怎麼知道我們", "孩子名單 has the 怎麼知道我們 column")

    t.click("#signupBanner"); t.wait_for_selector("#sList .scard")
    card = t.locator("#sList .scard").first
    ok("怎麼知道我們：其他：公園認識" in card.inner_text(), "pending card shows the source")
    card.locator("[data-scall]").click(); card.locator("[data-sok]").click()
    t.wait_for_selector("#sList .scard.ok")
    src = {r[1]: (r[6] if len(r) > 6 else "") for r in rows("孩子名單")}
    ok(src.get("報名寶寶") == "其他：公園認識", "accepting copies the source to the child")
    ok(src.get("老師新增") == "親友介紹" and not src.get("沒填管道"), "teacher-chosen and empty sources saved as given")

    t.goto(BASE + "/"); t.wait_for_selector("#pin", state="hidden")
    t.click("#tab-list"); t.wait_for_selector("#kidList .row")
    t.locator("#kidList .row", has_text="沒填管道").locator("button[data-edit]").first.click()
    t.wait_for_selector("#mSrc")
    ok(t.input_value("#mSrc") == "", "edit dialog shows no source when none was saved")
    t.select_option("#mSrc", "Threads／IG"); t.click("#mSave")
    wait_until(lambda: any(r[1] == "沒填管道" and len(r) > 6 and r[6] == "Threads／IG" for r in rows("孩子名單")), msg="source edited")

    t.click("#tab-stats"); t.wait_for_selector("#sources .srcrow")
    stats = t.inner_text("#sources").replace("\n", " ")
    ok("親友介紹" in stats and "Threads／IG" in stats and "其他" in stats, "stats panel counts each source")
    shot(t, "source-stats.png")
    ok(not errs, f"no page errors: {errs}")
    b.close()
