"""Teacher adds children with parent phones, masks/reveals numbers, fills missing ones, deletes one."""
from playwright.sync_api import sync_playwright
from helpers import new_page, login, ok, rows, wait_until, shot

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = new_page(b, errs)
    login(pg)

    pg.click("#newBtn"); pg.fill("#mName", "彤彤"); pg.fill("#mPhone0", "0912-345-678")
    pg.click("#mAddParent"); pg.click("[data-ci='1'][data-rel='爸爸']"); pg.fill("#mPhone1", "0933222111")
    pg.click("#mSave")
    wait_until(lambda: len([r for r in rows("家長聯絡") if r[1] == "彤彤"]) == 2, msg="two phones saved")
    tong = [r for r in rows("家長聯絡") if r[1] == "彤彤"]
    ok(sorted((r[2], r[3]) for r in tong) == [("媽媽", "0912-345-678"), ("爸爸", "0933222111")], "both parents saved with relation and phone")

    pg.click("#newBtn"); pg.fill("#mName", "芊芊"); pg.click("#mSave")
    wait_until(lambda: any(r[1] == "芊芊" for r in rows("孩子名單")), msg="second child saved")
    pg.wait_for_function("document.getElementById('countN').textContent.trim()==='2'", timeout=10000)
    wait_until(lambda: len(rows("點名紀錄")) == 2, msg="two attendance rows")
    ok(True, "both new children are marked present on screen and in 點名紀錄")

    pg.click("#tab-list")
    pg.wait_for_selector(".phone")
    ok("缺電話 1" in pg.inner_text("#listFilter"), "missing-phone filter counts one child")
    ok("0912-•••-678" in pg.inner_text("#kidList"), "phone is masked by default")
    pg.click("[data-show] >> nth=0")
    ok("0912-345-678" in pg.inner_text(".phone >> nth=0"), "tapping 顯示 reveals the full number")
    ok(pg.get_attribute(".call >> nth=0", "href") == "tel:0912345678", "撥打 is a tel: link with digits only")
    shot(pg, "contacts-list.png")

    pg.click("[data-filter='missing']")
    ok("芊芊" in pg.inner_text("#kidList") and "彤彤" not in pg.inner_text("#kidList"), "missing filter shows only the child without a phone")
    pg.click(".nophone"); pg.wait_for_selector("#mPhone0"); pg.fill("#mPhone0", "0988765432"); pg.click("#mSave")
    wait_until(lambda: any(r[1] == "芊芊" and r[3] == "0988765432" for r in rows("家長聯絡")), msg="filled phone saved")
    pg.wait_for_timeout(300)
    ok("缺電話 0" in pg.inner_text("#listFilter"), "missing count drops to zero after 補上")

    pg.click("[data-filter='all']")
    pg.locator("#kidList .row", has_text="彤彤").locator("button[data-edit]").first.click()
    pg.wait_for_selector("#mPhone1")
    ok(pg.input_value("#mPhone0") == "0912-345-678" and pg.input_value("#mPhone1") == "0933222111", "edit dialog loads saved phones")
    pg.click("[data-cdel='1']"); pg.click("#mSave")
    wait_until(lambda: len([r for r in rows("家長聯絡") if r[1] == "彤彤"]) == 1, msg="one phone removed")

    pg.click("#tab-roll"); pg.click("#tab-list"); pg.wait_for_selector(".phone")
    ok("0933" not in pg.inner_text("#kidList"), "deleted phone no longer listed after reload")
    ok(not errs, f"no page errors: {errs}")
    b.close()
