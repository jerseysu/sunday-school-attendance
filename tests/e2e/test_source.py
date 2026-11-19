"""How families found us: parent sign-up dropdown, teacher add/edit, carried over on accept, stats."""
from playwright.sync_api import sync_playwright
from helpers import BASE, new_page, login, ok, rows, wait_until, dump, shot

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    par = new_page(b, errs)
    par.goto(BASE + "/signup.html"); par.wait_for_selector("#src option[value='其他']", state="attached")
    par.fill("#name", "報名寶寶"); par.click("#group button[data-v='3-6']"); par.click("#rel button[data-v='媽媽']")
    par.fill("#phone", "0911222333"); par.fill("#parentName", "林媽媽"); par.click("#mode [data-v='陪同']")
    ok(not par.is_visible("#srcOther"), "other note is hidden until 其他 is chosen")
    par.select_option("#src", "其他")
    ok(par.is_visible("#srcOther"), "choosing 其他 shows the note box")
    par.fill("#srcOther", "公園認識")
    par.click("#consentBox summary")
    par.wait_for_function("document.getElementById('consentText').textContent.includes('六、家長確認')")
    consent = par.inner_text("#consentText")
    ok(consent.startswith("親愛的家長您好：") and "一、課程參與" in consent and consent.rstrip().endswith("依法應負之責任。"), "default consent text is shown on the sign-up page")
    shot(par, "consent-open.png")
    par.click("#agreeConsent"); par.click("#submit")
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
    t.click("#tab-stats"); t.wait_for_selector("#sources .srcnone")
    ok("還沒填的孩子（1）" in t.inner_text("#sources .srcnone"), "stats lists children with no source")
    shot(t, "source-missing.png")
    t.click("#sources .srcnone button:text-is('沒填管道')"); t.wait_for_selector("#mSrc")
    ok(t.input_value("#mName") == "沒填管道" and t.input_value("#mSrc") == "", "tapping a name opens that child with no source chosen")
    t.select_option("#mSrc", "Threads／IG"); t.click("#mSave")
    wait_until(lambda: any(r[1] == "沒填管道" and len(r) > 6 and r[6] == "Threads／IG" for r in rows("孩子名單")), msg="source filled from stats")
    t.wait_for_function("!document.querySelector('#sources .srcnone')", timeout=5000)
    ok(True, "the missing list disappears once everyone has a source")

    t.wait_for_selector("#sources .srcrow")
    stats = t.inner_text("#sources").replace("\n", " ")
    ok("親友介紹" in stats and "Threads／IG" in stats and "其他" in stats, "stats panel counts each source")
    shot(t, "source-stats.png")
    ok(not errs, f"no page errors: {errs}")
    b.close()
