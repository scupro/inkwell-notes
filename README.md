# Inkwell — Notion 風格 Markdown 筆記

純靜態前端 + Netlify Functions + Neon Postgres，無需構建步驟。

## 功能
- 桌面三欄：分類/標籤（可折疊）｜筆記列表｜編輯/閱讀區
- 移動端：登入後默認顯示筆記列表，點擊進入筆記，側欄為抽屜，支持系統返回鍵
- 閱讀 / 編輯 / 分欄預覽三種模式，自動保存
- 淺色 / 深色模式（跟隨系統，可手動切換）
- 外鏈媒體直接顯示與播放：
  - 圖片：`![](https://.../a.jpg)`，點擊放大
  - 音頻：`![audio](https://.../a.mp3)` 或單獨一行貼 `.mp3/.m4a/.wav/.ogg/.flac` 鏈接
  - 視頻：`![video](https://.../a.mp4)` 或單獨一行貼 `.mp4/.webm/.mov` 鏈接
  - 嵌入：單獨一行貼 YouTube / Bilibili / Vimeo / Spotify 鏈接自動變播放器
  - 也支持原生 `<video>` `<audio>` HTML（已用 DOMPurify 消毒，iframe 僅白名單）
- GFM：表格、代碼高亮、待辦清單（閱讀模式可直接勾選）
- 分類增刪改、標籤（Enter/逗號添加）、置頂、全文搜索
- 密碼登入（環境變量控制），HMAC 簽名令牌

快捷鍵：`Ctrl/⌘+S` 保存、`Ctrl/⌘+E` 切換閱讀/編輯、`Alt+N` 新建、`Ctrl/⌘+\` 折疊側欄、`Ctrl/⌘+B/I` 粗體/斜體

## 部署
1. **Neon**：在 https://neon.tech 新建項目，複製 Connection string（含 `?sslmode=require`）。表會在首次請求時自動創建（或手動執行 `schema.sql`）。
2. **推送到 GitHub**，在 Netlify「Add new site → Import an existing project」選擇此倉庫。構建命令留空，發佈目錄 `public`（`netlify.toml` 已設定）。
3. **環境變量**（Site configuration → Environment variables）：

| 變量 | 必填 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Neon 連接字串（使用 Netlify 的 Neon 擴展時可用 `NETLIFY_DATABASE_URL` 代替） |
| `APP_PASSWORD` | 是 | 訪問密碼 |
| `AUTH_SECRET` | 建議 | 令牌簽名密鑰，`openssl rand -hex 32` |
| `SESSION_DAYS` | 否 | 登入有效天數，默認 30 |

4. 重新部署。修改 `APP_PASSWORD` 或 `AUTH_SECRET` 會使所有設備登出。

## 本地開發
```bash
npm install
cp .env.example .env   # 填入真實值
npx netlify dev        # http://localhost:8888
```

## 結構
```
public/            index.html, style.css, app.js（前端）
netlify/functions/ api.mjs（/api/* 全部接口）
schema.sql         數據表（可選）
```

## API
`POST /api/login` · `GET /api/meta` · `GET/POST /api/notes` · `GET/PUT/DELETE /api/notes/:id` · `POST /api/categories` · `PUT/DELETE /api/categories/:id`

## License

[MIT](LICENSE)
