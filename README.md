# GitHub Pages 版日文單字複習

這一版是純靜態前端，適合直接部署到 GitHub Pages。

## 已包含功能

- Supabase Email + Password 登入 / 註冊
- 只讀取自己 `owner_id` 的單字
- 單字搜尋與 JLPT 等級篩選
- SRS 複習流程
- 新增單字
- 刪除單字
- 瀏覽器日文語音播放
- 同一段文字每第 3 次播放自動改成慢速

## 你要先準備的

1. Supabase 專案
2. `public.vocab_items` 已建立並有資料
3. Authentication 已開 `Email`
4. GitHub repo

## 先改 `config.js`

把下面兩個值換成你自己的：

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

## 推薦的 Supabase 設定

- `Authentication > Sign In / Providers > Email` 開啟
- 如果只是你自己先測，`Confirm email` 可以先關掉

## 發佈到 GitHub Pages

1. 建一個 GitHub repo
2. 把這個資料夾內的檔案放進 repo 根目錄
3. push 到 GitHub
4. 到 repo 的 `Settings > Pages`
5. Source 選 `Deploy from a branch`
6. Branch 選 `main`，資料夾選 `/root`
7. 等待發佈完成

之後網址通常會像：

```text
https://你的帳號.github.io/你的repo名/
```

## 注意

- 這版用的是瀏覽器內建語音，不需要 Google API key
- 如果你之後要換成 Google Cloud TTS，就需要額外小後端，不能把金鑰直接放在 GitHub Pages
