"""Parent faith status: set in the add dialog, shown on the roster, 關懷家庭 filter, edit."""
from playwright.sync_api import sync_playwright
from helpers import new_page, login, ok, rows, wait_until, dump, shot

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = new_page(b, errs)
    login(pg)

    pg.click("#newBtn"); pg.fill("#mName", "信仰測試")
    pg.fill("#mPhone0", "0912-345-678"); pg.click("[data-ci='0'][data-faith='慕道中']")
    ok(pg.input_value("#mPhone0") == "0912-345-678", "choosing a faith keeps the typed phone")
    pg.click("#mAddParent"); pg.click("[data-ci='1'][data-rel='爸爸']"); pg.click("[data-ci='1'][data-faith='還沒信']")
    pg.click("#mSave")
    wait_until(lambda: len([r for r in rows("家長聯絡") if r[1] == "信仰測試"]) == 2, msg="faith rows saved")
    ok(dump()["家長聯絡"][0] == ["孩子id", "孩子名字", "稱呼", "電話", "信仰", "更新時間"], "家長聯絡 has the 信仰 column")
    got = sorted((r[2], r[3], r[4]) for r in rows("家長聯絡") if r[1] == "信仰測試")
    ok(got == [("媽媽", "0912-345-678", "慕道中"), ("爸爸", "", "還沒信")], "faith saved per parent, even without a phone")

    pg.click("#newBtn"); pg.fill("#mName", "基督徒寶寶"); pg.fill("#mPhone0", "0988765432")
    pg.click("[data-ci='0'][data-faith='基督徒']"); pg.click("#mSave")
    wait_until(lambda: any(r[1] == "基督徒寶寶" for r in rows("家長聯絡")), msg="second family saved")

    pg.click("#tab-list"); pg.wait_for_selector(".fpill")
    ok("關懷家庭 1" in pg.inner_text("#listFilter"), "關懷家庭 counts families with a seeker or non-believer parent")
    pg.click("[data-filter='care']")
    lst = pg.inner_text("#kidList")
    ok("信仰測試" in lst and "基督徒寶寶" not in lst, "關懷家庭 filter lists the right family")
    ok(pg.is_visible("#careHint"), "care hint is shown")
    ok("沒有電話" in lst, "parent without a phone shows 沒有電話")
    shot(pg, "faith-roster.png")

    pg.click("[data-filter='all']")
    pg.locator("#kidList .row", has_text="信仰測試").locator("button[data-edit]").first.click()
    pg.wait_for_selector("[data-ci='1'][data-faith]")
    ok(pg.get_attribute("[data-ci='0'][aria-pressed='true'][data-faith]", "data-faith") == "慕道中", "edit dialog shows saved faith")
    pg.click("[data-ci='0'][data-faith='基督徒']"); pg.click("#mSave")
    wait_until(lambda: any(r[1] == "信仰測試" and r[2] == "媽媽" and r[4] == "基督徒" for r in rows("家長聯絡")), msg="faith updated")
    ok(not errs, f"no page errors: {errs}")
    b.close()
