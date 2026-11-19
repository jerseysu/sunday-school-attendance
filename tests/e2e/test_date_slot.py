"""Date and session always agree (clock fixed to Monday 2026-11-16)."""
from playwright.sync_api import sync_playwright
from helpers import new_page, login, ok

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = new_page(b, errs)
    pg.clock.set_fixed_time("2026-11-16T10:00:00+08:00")
    login(pg)
    date = lambda: pg.inner_text("#dateText")
    slot = lambda: pg.inner_text("#slots button[aria-pressed=true]")
    ok(date() == "11 月 15 日（日）" and slot() == "主日", "Monday opens the most recent session (Sunday)")
    for name, want in [("週三", "11 月 11 日（三）"), ("週四", "11 月 12 日（四）"), ("週六", "11 月 14 日（六）"), ("主日", "11 月 15 日（日）")]:
        pg.click(f"#slots button:text-is('{name}')")
        ok(date() == want and slot() == name, f"{name} jumps to {want} in the same Mon–Sun week")
    ok(pg.locator("#changeDate").count() == 0, "no 改日期 button any more")
    box_t = pg.locator("#dateText").bounding_box(); box_i = pg.locator("#dateInput").bounding_box()
    ok(pg.is_visible("#dateInput") and box_i["x"] > box_t["x"] + box_t["width"] - 1 and abs((box_i["y"] + box_i["height"] / 2) - (box_t["y"] + box_t["height"] / 2)) < 12,
       "the calendar sits on the right of the date, on the same line")
    ok(box_i["x"] + box_i["width"] <= 390, "the calendar fits inside a phone screen")
    ok(pg.input_value("#dateInput") == "2026-11-15", "the calendar shows the current roll-call date")
    pg.fill("#dateInput", "2026-11-06"); pg.dispatch_event("#dateInput", "change")
    ok(date() == "11 月 5 日（四）" and slot() == "週四", "picking a Friday snaps back to Thursday")
    ok(pg.input_value("#dateInput") == "2026-11-05", "the calendar follows the snapped date")
    pg.click("#slots button:text-is('主日')")
    ok(date() == "11 月 8 日（日）", "主日 from that week is the following Sunday, not the past one")
    ok(not errs, f"no page errors: {errs}")
    b.close()
