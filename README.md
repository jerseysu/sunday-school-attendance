# Sunday School Attendance

A small roll-call tool for the 內湖蒙式角落 Sunday school. Teachers open a link, enter the classroom PIN, and take attendance. No account or login needed. Records are stored in a Google Sheet that the coordinator can open directly.

```
GitHub Pages (UI) ──fetch──▶ Apps Script (API, checks the classroom PIN) ──▶ Google Sheet (data)
```

The same `src/index.html` can also be served by Apps Script itself as a backup entry point. Both use the same data.

- Frontend: `src/index.html`. Big buttons, rounded fonts, mobile-first layout
- Backend: `src/Code.gs`. Google Apps Script that reads and writes the sheet
- Data: tabs in the spreadsheet: 孩子名單 (roster), 點名紀錄 (attendance records), 統計 (stats), and 家長聯絡 (parent contacts, created automatically the first time it is used)

## Features

- **Roll call**: today's date and session (Sunday / Wednesday / Thursday / Saturday) are picked automatically. Tap a child's name to mark them present (it turns green); tap again to undo
- **Newcomers**: tap "+" in the bottom-right corner to add a name. The child is tagged as a newcomer for that session
- **Stats**: sessions this month, average attendance, children who came, newcomers, a bar chart of the last 12 sessions, and children who haven't come for more than 3 weeks
- **Roster**: rename a child, change the age group, or hide children who no longer come (their records are kept)
- **Parent contacts** (optional): up to two phone numbers per child (爸爸 / 媽媽 / 其他), added when a child is created or later from the roster. The roster masks the middle digits (`0912-•••-678`); tap 顯示 to reveal, 撥打 to call. A 缺電話 filter lists children with no number yet. Phone numbers are only fetched on the roster page and cleared from memory when you leave it
- **Classroom PIN**: enter the 5-digit PIN once and the device remembers it. Every read and write is checked against the PIN on the Apps Script side, so someone who only has the link sees no data
- Several devices can take attendance at once; the page syncs every 20 seconds

## First-time setup (about 10 minutes)

1. Create a new Google Sheet in Google Drive, for example "主日學點名"
2. In the sheet, open **Extensions › Apps Script**. The script must be created from the sheet (bound to it); a standalone project from script.google.com cannot find the data
3. Paste the contents of `src/Code.gs` into `Code.gs`
4. Click **Files ＋ › HTML**, name it `index` (the editor adds `.html`), and paste `src/index.html`
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

## Deployment flow

```
feature branch ──PR──▶ CI: syntax check
                        │ merge
                        ▼
                      main ─┬─▶ pages.yml: syntax check → inject API URL → GitHub Pages (frontend)
                            └─▶ deploy.yml: syntax check → clasp push → update Apps Script deployment (backend, same URL)
```

- `ci.yml`: runs `node scripts/check.mjs` on PRs and non-main branches
- `pages.yml`: republishes the frontend when `src/index.html` changes
- `deploy.yml`: updates the Apps Script backend on every push to main. It is skipped if the clasp secrets are not set
- To roll back: `git revert` and push to main, or switch the version back in Apps Script under **Manage deployments**

### One-time setup: GitHub Pages

1. Deploy Apps Script manually as described above and copy the web app URL (`https://script.google.com/macros/s/…/exec`)
2. Repo › **Settings › Secrets and variables › Actions › Variables** tab: add `APPS_SCRIPT_URL` = that URL. Put it under **Repository variables**, not Secrets or Environment variables
3. Repo › **Settings › Pages › Source**: choose **GitHub Actions**
4. On a free GitHub account, Pages only works for a **public repo**. The code becomes public, but it contains no children's data, and the PIN lives only in the Apps Script script properties
5. Push to main, or run "Deploy to GitHub Pages" from the Actions tab. The site is at `https://jerseysu.github.io/sunday-school-attendance/`

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

## Troubleshooting

- **"No HTML file named index was found"**: the `index` HTML file is missing from the Apps Script project (step 4)
- **"連不上，請確認網路" after entering the PIN on GitHub Pages**: the deployment's access is not **Anyone**. Open the `/exec` URL in a private window; if you see a Google sign-in page, edit the deployment and set Who has access to **Anyone**
- **"出錯了：…" on the PIN screen**: the backend returned an error. Check **Executions** in the Apps Script editor for details. Common causes: `PIN` script property not set, or `setup` not run yet
- **Dates show as "NaN/NaN"**: Google Sheets turned text such as `2026-11-16` or `0-3` into dates. The current code writes these cells as plain text; run `setup` once to repair older rows
- **統計 tab shows `#N/A`**: there are no attendance records yet; it fills in after the first roll call

## Notes

- Children's names and parents' phone numbers are personal data. Share the link only with co-workers, never in public groups, and share the spreadsheet only with the people in charge
- Web apps deployed from a personal Google account show a banner "This application was created by a Google Apps Script user". This is a fixed Google notice
- The header logo changes with the session: Sunday 蒙式主日學, Saturday 有一村, Wednesday/Thursday 蒙式角落. The original files are in `assets/` and are embedded in `src/index.html`
- Design (Claude Design): https://claude.ai/artifact/KQqfXTZoF9ciRMTRyUYqvc
