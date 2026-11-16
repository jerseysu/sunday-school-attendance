# Sunday School Attendance

A small roll-call tool for the 內湖蒙式角落 Sunday school. Teachers open a link, enter the classroom PIN, and take attendance. No account or login needed. Records are stored in a Google Sheet that the coordinator can open directly.

```
GitHub Pages (UI) ──fetch──▶ Apps Script (API, checks the classroom PIN) ──▶ Google Sheet (data)
```

The same `src/index.html` can also be served by Apps Script itself as a backup entry point. Both use the same data.

There are two entry points:

| Who | URL | PIN |
|---|---|---|
| Teachers | `https://jerseysu.github.io/sunday-school-attendance/` (backup: `…/exec`) | yes |
| Parents (QR code) | `https://jerseysu.github.io/sunday-school-attendance/signup.html` (backup: `…/exec?page=signup`) | no |

- Frontend: `src/index.html` (teachers) and `src/signup.html` (parent self-registration). Big buttons, rounded fonts, mobile-first layout
- Backend: `src/Code.gs`. Google Apps Script that reads and writes the sheet
- Data: tabs in the spreadsheet: 孩子名單 (roster), 點名紀錄 (attendance records), 統計 (stats), 家長聯絡 (parent contacts), 報名待確認 (parent sign-ups waiting for a teacher) and 設定 (settings). The last three are created automatically the first time they are used
- QR code for the parent page: `assets/signup-qr.png`

## Features

- **Roll call**: today's date and session (Sunday / Wednesday / Thursday / Saturday) are picked automatically. Tap a child's name to mark them present (it turns green); tap again to undo
- **Newcomers**: tap "+" in the bottom-right corner to add a name. The child is tagged as a newcomer for that session
- **Stats**: sessions this month, average attendance, children who came, newcomers, a bar chart of the last 12 sessions, and children who haven't come for more than 3 weeks
- **Roster**: rename a child, change the age group, or hide children who no longer come (their records are kept)
- **Parent contacts** (optional): up to two phone numbers per child (爸爸 / 媽媽 / 其他), added when a child is created or later from the roster. The roster masks the middle digits (`0912-•••-678`); tap 顯示 to reveal, 撥打 to call. A 缺電話 filter lists children with no number yet. Each parent can also have an optional faith status (基督徒 / 慕道中 / 還沒信 / 不清楚), set by teachers in the add/edit dialog only (never on the parent sign-up page); the 關懷家庭 filter lists families where a parent is 慕道中 or 還沒信.
- **How families found us** (optional): 親友介紹 / 教會的人邀請 / 經過看到 / Threads／IG / 傳單或海報 / 其他 (with a short note). Asked with a dropdown on the parent sign-up page and in the teacher add/edit dialog, stored in 孩子名單 column 怎麼知道我們, and counted on the stats tab Phone numbers are only fetched on the roster page and cleared from memory when you leave it
- **Classroom PIN**: enter the 5-digit PIN once and the device remembers it. Every read and write is checked against the PIN on the Apps Script side, so someone who only has the link sees no data
- Several devices can take attendance at once; the page syncs every 20 seconds
- **Parent self-registration**: parents scan the QR code and fill in the child's name, age group, their relation (爸爸 / 媽媽 / 其他) and mobile number, then agree to the classroom rules (教室規則) and disclaimer (免責聲明). They get a 4-digit check-in code (報到碼) to show the teacher. The child does **not** appear on the roll until a teacher confirms
- **Teacher confirmation**: when sign-ups are waiting, the roll-call page shows an orange banner "N 位新朋友等你確認". Each card shows the code and the full phone number. The teacher taps ① 撥打確認 to call the parent; only after that does ② 有響，收下 become active. Accepting adds the child (tagged as a newcomer), saves the parent's number and marks the child present for the session on screen. The number can be corrected on the card first. If a child with the same name already exists, the teacher picks "same child (just add the phone)" or "different child" (added as e.g. `小明（2）`, rename it on the roster page). 不收 needs a second tap to confirm. Sign-ups not handled within 14 days are marked 過期 and hidden

## First-time setup (about 10 minutes)

1. Create a new Google Sheet in Google Drive, for example "主日學點名"
2. In the sheet, open **Extensions › Apps Script**. The script must be created from the sheet (bound to it); a standalone project from script.google.com cannot find the data
3. Paste the contents of `src/Code.gs` into `Code.gs`
4. Click **Files ＋ › HTML**, name it `index` (the editor adds `.html`), and paste `src/index.html`. Do the same with a file named `signup` for `src/signup.html`
5. Open **Project Settings** (gear icon on the left):
   - Check **Show "appsscript.json" manifest file in editor** and replace its contents with `src/appsscript.json`
   - Under **Script Properties**, add a property `PIN` whose value is the classroom PIN (5 digits; to change the length, edit `PIN_LEN` in `src/index.html`)
6. Back in the editor, pick `setup` from the function menu and click **Run**. Authorize when asked
   (Google shows "Google hasn't verified this app"; choose **Advanced › Go to … (unsafe)**, since this is your own script)
7. Top right: **Deploy › New deployment › Select type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**. Do not choose "Anyone with Google account": it sends visitors who are not signed in to the Google login page, and GitHub Pages then shows "連不上，請確認網路" (cannot connect) after the PIN is entered
8. Copy the web app URL. Test it in a private/incognito window: you should see the PIN keypad, not a Google sign-in page

To update the code manually later: **Deploy › Manage deployments › ✏️ › Version: New version › Deploy**. The URL stays the same.

## Parent sign-up settings (設定 tab)

The 設定 tab holds key/value rows (column A = key, column B = value). Edit column B directly in the sheet:

| Key | Meaning | Default |
|---|---|---|
| 教室規則 | Classroom rules shown on the parent page (line breaks are kept) | empty: the page shows a placeholder |
| 免責聲明 | Disclaimer shown on the parent page | empty: the page shows a placeholder |
| 規則版本 | Version of the rules text. Raise it (e.g. `1` → `2`) whenever you change the wording; each sign-up records the version the parent agreed to, and a parent with an old page open is asked to reload | `1` |
| 每日報名上限 | Maximum sign-ups per day (spam guard) | `30` |

The 報名待確認 tab has one row per sign-up: 報名id, 報到碼, 孩子名字, 年齡層, 稱呼, 電話, 同意規則版本, 送出時間, 狀態 (待確認 / 收下 / 不收 / 過期), 處理時間, 孩子id. All cells are plain text.

**Privacy**: the parent page needs no PIN, so it is deliberately limited. Its only backend calls are `getSignupInfo` (rules text) and `submitSignup` (writes one row and returns only the 報到碼). It cannot read the roster, phone numbers or other sign-ups. A hidden honeypot field silently drops bot submissions. Listing, accepting and rejecting sign-ups all require the classroom PIN. Rejected and expired rows still contain the parent's phone number; delete old rows from the sheet from time to time.

## Deployment flow

```
any branch / PR ──▶ Test: syntax check + e2e tests
                        │ (on main, only if Test passes)
                        ▼
                      main ─┬─▶ pages.yml: inject API URL → GitHub Pages (frontend)
                            └─▶ deploy.yml: clasp push → update Apps Script deployment (backend, same URL)
```

- `test.yml` (**Test**): syntax check and end-to-end tests on every push and PR; run it by hand to redeploy main
- `pages.yml`: after Test passes on main, republishes `index.html` and `signup.html` from the tested commit
- `deploy.yml`: after Test passes on main, updates the Apps Script backend from the tested commit. It is skipped if the clasp secrets are not set
- To roll back: `git revert` and push to main, or switch the version back in Apps Script under **Manage deployments**

### One-time setup: GitHub Pages

1. Deploy Apps Script manually as described above and copy the web app URL (`https://script.google.com/macros/s/…/exec`)
2. Repo › **Settings › Secrets and variables › Actions › Variables** tab: add `APPS_SCRIPT_URL` = that URL. Put it under **Repository variables**, not Secrets or Environment variables
3. Repo › **Settings › Pages › Source**: choose **GitHub Actions**
4. On a free GitHub account, Pages only works for a **public repo**. The code becomes public, but it contains no children's data, and the PIN lives only in the Apps Script script properties
5. Push to main, or run "Deploy to GitHub Pages" from the Actions tab. The site is at `https://jerseysu.github.io/sunday-school-attendance/`, and the parent page at `https://jerseysu.github.io/sunday-school-attendance/signup.html`

### One-time setup: automatic Apps Script deployment

1. Deploy manually once as described above and note two IDs:
   - **Script ID**: Apps Script › Project Settings › IDs › Script ID
   - **Deployment ID**: the part between `/s/` and `/exec` in the web app URL (also shown under **Manage deployments**)
2. Turn on the Apps Script API: https://script.google.com/home/usersettings
3. Log in with clasp on your own computer to create the credentials:
   ```bash
   npx @google/clasp@2.4.2 login   # creates ~/.clasprc.json
   cat ~/.clasprc.json | pbcopy    # copy the whole file (macOS)
   ```
4. Repo › **Settings › Secrets and variables › Actions**, add three repository secrets:
   | Name | Value |
   |---|---|
   | `CLASPRC_JSON` | the full contents of `~/.clasprc.json` |
   | `SCRIPT_ID` | Script ID |
   | `DEPLOYMENT_ID` | Deployment ID |
5. (Optional) Under **Settings › Environments**, create `production` and require approval, so an accidental push doesn't go live

Once this is set up, GitHub is the source of truth: every push overwrites the code in Apps Script, so don't edit code in the Apps Script editor.

### Local development

```bash
cp .clasp.json.example .clasp.json   # fill in the Script ID
node scripts/check.mjs               # syntax check
npx @google/clasp@2.4.2 push         # push to the Apps Script test deployment (/dev URL) to try it first
```

`.clasp.json`, `.clasprc.json` and the PIN are never committed. The PIN only lives in the Apps Script script properties.

## Tests

`tests/run_e2e.py` runs browser tests (Playwright, phone-sized viewport) against `tests/mock_server.js`, which executes the real `src/Code.gs` against an in-memory spreadsheet. Each `tests/e2e/test_*.py` file gets a fresh server.

| File | Covers |
|---|---|
| `test_signup_flow.py` | Parent sign-up validation and honeypot, teacher banner, call-then-accept, reject, same-name merge, idempotent accept, 14-day expiry, daily cap, PIN checks |
| `test_contacts.py` | Parent phones in the add/edit dialog, masking, 撥打 link, 缺電話 filter, deleting a number |
| `test_faith.py` | Parent faith status, 關懷家庭 filter, editing |
| `test_source.py` | How families found us (sign-up dropdown, teacher dialog, carried over on accept, stats) |
| `test_date_slot.py` | Date and session stay in sync (clock fixed to a Monday) |
| `test_migration.py` | Old 家長聯絡 sheets get the new columns without losing data |

```bash
pip install playwright && python -m playwright install chromium
python tests/run_e2e.py            # all
python tests/run_e2e.py faith      # just files matching "faith"
```

The **Test** workflow (`.github/workflows/test.yml`) runs the syntax check and these tests on every push and PR. **Deploy to GitHub Pages** and **Deploy to Apps Script** start only after Test succeeds on `main`, and they deploy exactly the commit that was tested. To redeploy by hand, run **Actions › Test › Run workflow** on `main`. Screenshots are uploaded as the `e2e-screenshots` artifact.

## Troubleshooting

- **"No HTML file named index was found"** (or `signup`): that HTML file is missing from the Apps Script project (step 4)
- **Parent page says "規則剛剛更新了"**: 規則版本 changed after the parent opened the page; reloading fixes it
- **"連不上，請確認網路" after entering the PIN on GitHub Pages**: the deployment's access is not **Anyone**. Open the `/exec` URL in a private window; if you see a Google sign-in page, edit the deployment and set Who has access to **Anyone**
- **"出錯了：…" on the PIN screen**: the backend returned an error. Check **Executions** in the Apps Script editor for details. Common causes: `PIN` script property not set, or `setup` not run yet
- **Dates show as "NaN/NaN"**: Google Sheets turned text such as `2026-11-16` or `0-3` into dates. The current code writes these cells as plain text; run `setup` once to repair older rows
- **統計 tab shows `#N/A`**: there are no attendance records yet; it fills in after the first roll call

## Notes

- Children's names and parents' phone numbers are personal data. Share the teacher link only with co-workers, never in public groups, and share the spreadsheet only with the people in charge. The parent sign-up link and QR code are safe to post: they can only submit
- Web apps deployed from a personal Google account show a banner "This application was created by a Google Apps Script user". This is a fixed Google notice
- The header logo changes with the session: Sunday 蒙式主日學, Saturday 有一村, Wednesday/Thursday 蒙式角落. The original files are in `assets/` and are embedded in `src/index.html`
- Design (Claude Design): https://claude.ai/artifact/KQqfXTZoF9ciRMTRyUYqvc
