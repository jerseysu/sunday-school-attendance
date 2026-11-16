# 主日學點名

內湖蒙式角落主日學的點名小工具。老師打開網址就能點名，不用登入。點名紀錄存在 Google 試算表，負責人直接打開試算表就能看。

- 前端：`src/index.html`，大按鈕、圓體字、手機優先的版面
- 後端：`src/Code.gs`，Google Apps Script，讀寫試算表
- 資料：試算表裡的「孩子名單」「點名紀錄」「統計」三個工作表

## 功能

- **點名**：自動選好今天的日期和場次（主日／週三／週四／週六），按孩子名字變綠色就完成，再按一次取消
- **新朋友**：右下角「＋」輸入名字，會標記成當次的新朋友
- **統計**：本月點名次數、平均人數、來過的孩子、新朋友、最近 12 次長條圖，以及超過 3 週沒來的孩子
- **名單**：改名字、改年齡層，不再來的孩子可以「收起來」，紀錄保留
- **教室密碼**：第一次打開輸入 4 位數，裝置會記住；擋掉拿到網址的陌生人
- 多台裝置同時點名：每 20 秒自動同步一次

## 部署（第一次，約 10 分鐘）

1. 在 Google 雲端硬碟新增一份試算表，命名為「主日學點名」
2. 試算表選單：**擴充功能 › Apps Script**
3. 把 `src/Code.gs` 的內容貼到 `程式碼.gs`
4. 左側「檔案 ＋ › HTML」，命名為 `index`，貼上 `src/index.html`
5. 左側齒輪「專案設定」：
   - 勾選「在編輯器中顯示 appsscript.json」，把內容換成 `src/appsscript.json`
   - 「指令碼屬性」新增：屬性 `PIN`，值是教室密碼（4 位數字）
6. 回到編輯器，上方函式選 `setup`，按「執行」，依提示授權
   （會看到「Google 尚未驗證這個應用程式」，選「進階 › 前往（不安全）」，因為這是你自己的程式）
7. 右上角 **部署 › 新增部署作業 › 類型：網頁應用程式**
   - 執行身分：**我**
   - 誰可以存取：**所有人**
8. 複製網頁應用程式網址，傳給同工，或加到平板主畫面

之後改程式：**部署 › 管理部署作業 › 編輯 › 版本：新版本**，網址不變。

## 部署流程

```
feature 分支 ──PR──▶ CI：語法檢查
                     │ 合併
                     ▼
                   main ──▶ GitHub Actions：語法檢查 → clasp push → clasp deploy
                                                         （更新同一個部署，網址不變）
```

- `ci.yml`：PR 和非 main 分支，只跑 `node scripts/check.mjs`
- `deploy.yml`：推到 main（或在 Actions 手動按 Run）就部署到正式網址
- 出問題要退版：`git revert` 後推上 main，或在 Apps Script「管理部署作業」把版本切回上一版

### 一次性設定

1. 先照上面「部署」手動部署一次，記下兩個 ID：
   - **Script ID**：Apps Script › 專案設定 › 指令碼 ID
   - **Deployment ID**：部署 › 管理部署作業 › 網頁應用程式那一筆的「部署作業 ID」
2. 開啟 Apps Script API：https://script.google.com/home/usersettings
3. 在自己電腦登入 clasp，產生憑證：
   ```bash
   npm install -g @google/clasp@2.4.2
   clasp login            # 會產生 ~/.clasprc.json
   cat ~/.clasprc.json    # 整段複製
   ```
4. GitHub repo › Settings › Secrets and variables › Actions，新增三個 secret：
   | 名稱 | 內容 |
   |---|---|
   | `CLASPRC_JSON` | `~/.clasprc.json` 的完整內容 |
   | `SCRIPT_ID` | Script ID |
   | `DEPLOYMENT_ID` | Deployment ID |
5. （建議）Settings › Environments 建 `production`，可以加「需要核准」，避免誤推就上線

### 本機開發

```bash
cp .clasp.json.example .clasp.json   # 填入 Script ID
node scripts/check.mjs               # 語法檢查
clasp push                           # 推到 Apps Script 的「測試部署」（/dev 網址）先試
```

`.clasp.json`、`.clasprc.json` 和密碼都不進 git。密碼只存在 Apps Script 的指令碼屬性。

## 注意

- 孩子名字是個資：網址只傳給同工，不要貼到公開群組
- 個人 Google 帳號部署的網頁，上方會有一行「此應用程式由 Google Apps Script 使用者建立」，這是 Google 固定的提示
- 頁首 logo 會跟著場次換：主日「蒙式主日學」、週六「有一村」、週三週四「蒙式角落」。logo 原檔在 `assets/`，嵌在 `src/index.html` 裡
- 設計稿（Claude Design）：https://claude.ai/artifact/KQqfXTZoF9ciRMTRyUYqvc
