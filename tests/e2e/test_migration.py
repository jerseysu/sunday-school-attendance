# env: OLD_CONTACTS=1
"""An old 家長聯絡 sheet (no 孩子名字 / 信仰 columns) is upgraded in place; renames follow."""
from helpers import call, ok, dump, PIN

d = dump()["家長聯絡"]
ok(d[0] == ["孩子id", "孩子名字", "稱呼", "電話", "信仰", "更新時間"], "header upgraded with 孩子名字 and 信仰")
ok(d[1][:5] == ["k1", "舊小明", "媽媽", "0912-111-222", ""], "existing row keeps its data and gets the child's name")
r = call("getContacts", "k1", pin=PIN)
ok(r["ok"] and r["data"] == [{"rel": "媽媽", "phone": "0912-111-222", "faith": ""}], "contacts still read correctly")
call("updateKid", "k1", {"name": "新小明"}, pin=PIN)
ok(dump()["家長聯絡"][1][1] == "新小明", "renaming a child updates 家長聯絡")
call("setContacts", "k1", [{"rel": "爸爸", "phone": "0933-000-111", "faith": "基督徒"}], pin=PIN)
ok(dump()["家長聯絡"][1][:5] == ["k1", "新小明", "爸爸", "0933-000-111", "基督徒"], "setContacts writes the new layout")
ok(call("getData")["error"] == "BAD_PIN", "API refuses calls without the PIN")
