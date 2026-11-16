"""Shared helpers for the end-to-end tests (run through tests/run_e2e.py)."""
import json
import os
import urllib.request

BASE = os.environ.get("E2E_BASE", "http://localhost:8766")
OUT = os.environ.get("E2E_OUT", "/tmp/e2e-out")
PIN = "12345"
os.makedirs(OUT, exist_ok=True)


def post(path, body):
    data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method="POST")
    return json.loads(urllib.request.urlopen(req).read())


def call(fn, *args, pin=None):
    d = {"fn": fn, "args": list(args)}
    if pin:
        d["pin"] = pin
    return post("/api", d)


def dump():
    return json.loads(urllib.request.urlopen(BASE + "/dump").read())


def ok(cond, msg):
    assert cond, msg
    print("PASS", msg)


def new_page(browser, errs):
    pg = browser.new_page(viewport={"width": 390, "height": 844})
    pg.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    pg.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    pg.on("pageerror", lambda e: errs.append(str(e)))
    return pg


def login(pg, pin=PIN):
    pg.goto(BASE + "/")
    for d in pin:
        pg.click(f"#keys button:text-is('{d}')")
    pg.wait_for_selector("#pin", state="hidden")


def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, name), full_page=True)


def wait_until(check, timeout=10.0, msg="condition"):
    """Poll check() until it returns something truthy (the backend writes asynchronously)."""
    import time
    end = time.time() + timeout
    while True:
        v = check()
        if v:
            return v
        if time.time() > end:
            raise AssertionError("timed out waiting for " + msg)
        time.sleep(0.2)


def rows(sheet):
    return dump().get(sheet, [])[1:]
