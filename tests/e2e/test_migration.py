# env: OLD_CONTACTS=1
"""Old sheets are upgraded in place without losing data: 家長聯絡 gets 孩子名字 / 信仰 / 家長姓名,
設定 gets the missing consent keys, 報名待確認 and 孩子名單 get their new column headers."""
from helpers import call, ok, dump, PIN

d = dump()["家長聯絡"]
ok(d[0] == ["孩子id", "孩子名字", "稱呼", "電話", "信仰", "更新時間", "家長姓名"], "header upgraded with 孩子名字, 信仰 and 家長姓名")
ok(d[1][:5] == ["k1", "舊小明", "媽媽", "0912-111-222", ""], "existing row keeps its data and gets the child's name")
r = call("getContacts", "k1", pin=PIN)
ok(r["ok"] and r["data"] == [{"rel": "媽媽", "phone": "0912-111-222", "faith": "", "name": ""}], "contacts still read correctly")
call("updateKid", "k1", {"name": "新小明"}, pin=PIN)
ok(dump()["家長聯絡"][1][1] == "新小明", "renaming a child updates 家長聯絡")
call("setContacts", "k1", [{"rel": "爸爸", "phone": "0933-000-111", "faith": "基督徒", "name": "林爸爸"}], pin=PIN)
row = dump()["家長聯絡"][1]
ok(row[:5] == ["k1", "新小明", "爸爸", "0933-000-111", "基督徒"] and row[6] == "林爸爸", "setContacts writes the new layout including the parent name")
call("setContacts", "k1", [{"rel": "爸爸", "phone": "0933-000-111", "faith": "基督徒"}], pin=PIN)
ok(dump()["家長聯絡"][1][6] == "林爸爸", "a client that sends no name keeps the stored name for the same phone")

cfg = dump()["設定"]
ok(cfg[:5] == [["項目", "內容"], ["教室規則", "舊規則"], ["免責聲明", ""], ["規則版本", "1"], ["每日報名上限", "30"]], "old 設定 rows are left alone")
ok(cfg[5:] == [["同意書", ""], ["同意書版本", ""]], "missing 同意書 / 同意書版本 keys are appended with blank values")
info = call("getSignupInfo")["data"]
ok(info["version"] == "2" and info["consent"].startswith("親愛的家長您好：") and "舊規則" not in info["consent"], "blank values fall back to the default consent and version 2")
call("getSignupInfo")
ok(len(dump()["設定"]) == 7, "keys are appended only once")

ok(dump()["孩子名單"][0][6:8] == ["怎麼知道我們", "參與方式"], "old 孩子名單 gets the 怎麼知道我們 and 參與方式 headers")
sh = dump()["報名待確認"]
ok(sh[0][11:] == ["怎麼知道我們", "家長姓名", "參與方式"], "old 報名待確認 gets the 家長姓名 and 參與方式 headers")
s = call("getSignups", pin=PIN)["data"]
ok(len(s) == 1 and s[0]["parentName"] == "" and s[0]["mode"] == "", "an old pending sign-up is listed with no parent name or mode")
ok(call("acceptSignup", "s1", {"date": "2026-11-15", "slot": "sun", "mode": "全天"}, pin=PIN)["ok"] is False, "unknown mode on accept is refused")
r = call("acceptSignup", "s1", {"date": "2026-11-15", "slot": "sun", "mode": "獨立"}, pin=PIN)["data"]
kid = [k for k in call("getData", pin=PIN)["data"]["kids"] if k["id"] == r["kidId"]][0]
ok(r["mode"] == "獨立" and kid["mode"] == "獨立", "teacher-chosen mode is saved even when the parent did not pick one")
ok(call("getData")["error"] == "BAD_PIN", "API refuses calls without the PIN")
