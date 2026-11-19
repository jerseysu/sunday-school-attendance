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
    before = date()
    pg.click("#changeDate")
    ok(date() == before and pg.is_visible("#dateText"), "tapping 改日期 keeps the date on screen")
    ok(pg.is_visible("#dateInput") and pg.input_value("#dateInput") == "2026-11-15", "改日期 shows the date field next to the date, filled with the current date")
    pg.keyboard.press("Escape")
    pg.fill("#dateInput", "2026-11-06"); pg.dispatch_event("#dateInput", "change")
    ok(date() == "11 月 5 日（四）" and slot() == "週四", "picking a Friday snaps back to Thursday")
    pg.click("#changeDate")
    ok(not pg.is_visible("#dateInput"), "tapping 改日期 again hides the date field")
    pg.click("#slots button:text-is('主日')")
    ok(date() == "11 月 8 日（日）", "主日 from that week is the following Sunday, not the past one")
    ok(not errs, f"no page errors: {errs}")
    b.close()
