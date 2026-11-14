// Netlify Function (v2) — 所有 /api/* 請求都由這裡處理
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const PASSWORD = process.env.APP_PASSWORD || '';
// 修改 APP_PASSWORD 或 AUTH_SECRET 後，所有已登入的會話都會失效
const SECRET = (process.env.AUTH_SECRET || '') + '|' + PASSWORD;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const sql = DB_URL ? neon(DB_URL) : null;

/* ---------- Neon Object Storage（可選） ----------
   Netlify 保留 AWS_* 變量名，所以用 NEON_S3_* */
const S3 = {
  endpoint: process.env.NEON_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || '',
  // 沒填就從端點解析（…storage.c-2.us-east-2.aws.neon.tech → us-east-2）
  region: process.env.NEON_S3_REGION || process.env.AWS_REGION_S3 ||
    ((process.env.NEON_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || '').match(/\.([a-z]{2}-[a-z]+-\d)\.aws\./) || [])[1] || 'us-east-1',
  accessKeyId: process.env.NEON_S3_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.NEON_S3_SECRET_ACCESS_KEY || '',
  bucket: process.env.NEON_S3_BUCKET || 'inkwell',
};
const STORAGE_ON = !!(S3.endpoint && S3.accessKeyId && S3.secretAccessKey);
const MAX_MB = Number(process.env.UPLOAD_MAX_MB) || 200;
// 正式網址永遠保留在 bucket CORS 白名單裡（Netlify 自動提供 URL；也可用 CORS_ORIGINS 追加，逗號分隔）
const PINNED_ORIGINS = [process.env.URL, ...(process.env.CORS_ORIGINS || '').split(',')]
  .map((x) => (x || '').trim().replace(/\/+$/, '')).filter(Boolean);
const FILE_KEY_RE = /^u\/\d{4}\/\d{2}\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/;
const COOKIE = 'ink_files';

export const config = { path: '/api/*' };

/* ---------- helpers ---------- */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const readBody = async (req) => { try { return await req.json(); } catch { return {}; } };
const hmac = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${hmac(exp)}`;
}
function verify(header) {
  return verifyToken((header || '').replace(/^Bearer\s+/i, ''));
}
function verifyToken(token) {
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const a = Buffer.from(hmac(exp));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(exp) > Date.now();
}
const readCookie = (req, name) => {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
};
// 媒體文件用 cookie 鑒權（<img>/<video> 無法帶 Authorization 頭）
const fileCookie = (token) =>
  `${COOKIE}=${token}; Path=/api/files; Max-Age=${token ? SESSION_DAYS * 86400 : 0}; HttpOnly; Secure; SameSite=Lax`;

/* ---------- S3 client（按需載入） ---------- */
let s3p;
function s3() {
  if (!s3p) {
    s3p = (async () => {
      const m = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const client = new m.S3Client({
        region: S3.region,
        endpoint: S3.endpoint,
        credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
      return { m, client, sign: getSignedUrl };
    })().catch((e) => { s3p = null; throw e; });
  }
  return s3p;
}

// 確保 bucket 存在，並允許當前網站來源直接 PUT 上傳（CORS）。只走直傳：設定不了就報錯，不中轉。
const corsOk = new Set();
async function ensureBucket(origin) {
  if (corsOk.has(origin)) return;
  const { m, client } = await s3();
  const Bucket = S3.bucket;
  try {
    await client.send(new m.HeadBucketCommand({ Bucket }));
  } catch (e) {
    const code = e?.$metadata?.httpStatusCode;
    if (code !== 404 && e?.name !== 'NotFound' && e?.name !== 'NoSuchBucket') throw e;
    try {
      await client.send(new m.CreateBucketCommand({ Bucket }));
    } catch (e2) {
      throw new Error(`找不到 bucket「${Bucket}」，自動建立也失敗了，請在 Neon Console 的 Object storage 手動建立（${e2.name || e2.message}）`);
    }
  }
  let origins = [];
  try {
    const r = await client.send(new m.GetBucketCorsCommand({ Bucket }));
    origins = (r.CORSRules || []).flatMap((x) => x.AllowedOrigins || []);
  } catch { /* 尚未設定 CORS */ }
  const need = [...new Set([...PINNED_ORIGINS, origin])];
  if (!origins.includes('*') && need.some((o) => !origins.includes(o))) {
    // 固定來源永遠保留；其餘（預覽 / 分支部署網址）只留最新的，避免名單無限增長
    const others = origins.filter((o) => !need.includes(o)).slice(-15);
    const all = [...need, ...others];
    try {
      await client.send(new m.PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: { CORSRules: [{
          AllowedOrigins: all, AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600,
        }] },
      }));
    } catch (e) {
      throw new Error(`無法設定 bucket CORS（${e?.name || e?.message || e}），請確認 Neon 憑證有 storage:write 權限，或在 Neon 手動為 ${origin} 設定 CORS`);
    }
  }
  corsOk.add(origin);
}
function newKey(name) {
  const d = new Date();
  const ext = (String(name).match(/\.([A-Za-z0-9]{1,8})$/) || [])[1];
  return `u/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext ? '.' + ext.toLowerCase() : ''}`;
}

const cleanTags = (t) =>
  [...new Set((Array.isArray(t) ? t : [])
    .map((x) => String(x).trim().replace(/^#/, '').slice(0, 50))
    .filter(Boolean))].slice(0, 30);
const toId = (v) => {
  if (v === null || v === undefined || v === '' || v === 'none') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

/* ---------- schema (自動建表) ---------- */
let ready;
function init() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        category_id INT REFERENCES categories(id) ON DELETE SET NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        pinned BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (pinned DESC, updated_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN (tags)`;
      await sql`CREATE INDEX IF NOT EXISTS notes_category_idx ON notes (category_id)`;
      await sql`CREATE TABLE IF NOT EXISTS uploads (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '',
        size BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* ---------- handler ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = req.method;

  try {
    if (!PASSWORD) return json({ error: '伺服器未設定 APP_PASSWORD' }, 500);

    // 讀取已上傳的媒體：鑒權後 302 到短期簽名地址（bucket 保持私有）
    const fm = path.match(/^\/files\/(.+)$/);
    if (fm && (method === 'GET' || method === 'HEAD')) {
      const key = decodeURIComponent(fm[1]);
      if (!FILE_KEY_RE.test(key)) return new Response('not found', { status: 404 });
      if (!verifyToken(readCookie(req, COOKIE)) && !verify(req.headers.get('authorization'))) {
        return new Response('unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
      }
      if (!STORAGE_ON) return new Response('storage not configured', { status: 503 });
      const { m, client, sign } = await s3();
      const target = await sign(client, new m.GetObjectCommand({ Bucket: S3.bucket, Key: key }), { expiresIn: 6 * 3600 });
      return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'private, max-age=10800' } });
    }

    if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': fileCookie('') });

    if (!sql) return json({ error: '伺服器未設定 DATABASE_URL' }, 500);

    // 登入
    if (path === '/login' && method === 'POST') {
      const { password } = await readBody(req);
      if (typeof password === 'string' && crypto.timingSafeEqual(sha(password), sha(PASSWORD))) {
        const token = makeToken();
        return json({ token }, 200, { 'set-cookie': fileCookie(token) });
      }
      await sleep(600);
      return json({ error: '密碼錯誤' }, 401);
    }

    if (!verify(req.headers.get('authorization'))) return json({ error: 'unauthorized' }, 401);
    await init();

    // 側欄：分類 / 標籤 / 計數
    if (path === '/meta' && method === 'GET') {
      const [categories, tags, counts] = await Promise.all([
        sql`SELECT c.id, c.name, COUNT(n.id)::int AS count
            FROM categories c LEFT JOIN notes n ON n.category_id = c.id
            GROUP BY c.id ORDER BY c.sort, c.name`,
        sql`SELECT t AS name, COUNT(*)::int AS count
            FROM notes, unnest(tags) AS t GROUP BY t ORDER BY count DESC, t`,
        sql`SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE category_id IS NULL)::int AS uncategorized
            FROM notes`,
      ]);
      // 順便刷新媒體 cookie（舊會話登入時還沒有這個 cookie）
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      return json(
        { categories, tags, ...counts[0], storage: { enabled: STORAGE_ON, maxMb: MAX_MB } },
        200, { 'set-cookie': fileCookie(token) });
    }

    // 申請上傳：返回預簽名 PUT 地址，瀏覽器直接上傳到 Neon Object Storage
    if (path === '/uploads' && method === 'POST') {
      if (!STORAGE_ON) return json({ error: '尚未設定 Neon Object Storage（NEON_S3_* 環境變量）' }, 503);
      const b = await readBody(req);
      const name = String(b.name || 'file').slice(0, 200);
      const type = String(b.type || '').slice(0, 100) || 'application/octet-stream';
      const size = Number(b.size) || 0;
      if (size > MAX_MB * 1024 * 1024) return json({ error: `文件超過 ${MAX_MB} MB 上限` }, 413);
      const origin = req.headers.get('origin') || url.origin;
      await ensureBucket(origin);
      const key = newKey(name);
      const { m, client, sign } = await s3();
      const uploadUrl = await sign(client, new m.PutObjectCommand({ Bucket: S3.bucket, Key: key, ContentType: type }), { expiresIn: 900 });
      await sql`INSERT INTO uploads (key, name, type, size) VALUES (${key}, ${name}, ${type}, ${size})`;
      return json({ key, url: `/api/files/${key}`, uploadUrl, headers: { 'Content-Type': type } }, 201);
    }

    // 筆記列表
    if (path === '/notes' && method === 'GET') {
      const cat = url.searchParams.get('category');
      const catId = toId(cat);
      const uncat = cat === 'none';
      const tag = url.searchParams.get('tag') || null;
      const q = (url.searchParams.get('q') || '').trim();
      const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
      const notes = await sql`
        SELECT id, title, left(content, 300) AS excerpt, category_id, tags, pinned, created_at, updated_at
        FROM notes
        WHERE (${catId}::int IS NULL OR category_id = ${catId}::int)
          AND (${uncat}::boolean = false OR category_id IS NULL)
          AND (${tag}::text IS NULL OR ${tag}::text = ANY(tags))
          AND (${like}::text IS NULL OR title ILIKE ${like}::text OR content ILIKE ${like}::text)
        ORDER BY pinned DESC, updated_at DESC
        LIMIT 1000`;
      return json({ notes });
    }

    // 新建筆記
    if (path === '/notes' && method === 'POST') {
      const b = await readBody(req);
      const [note] = await sql`
        INSERT INTO notes (title, content, category_id, tags, pinned)
        VALUES (${String(b.title ?? '')}, ${String(b.content ?? '')}, ${toId(b.category_id)},
                ${cleanTags(b.tags)}::text[], ${!!b.pinned})
        RETURNING *`;
      return json({ note }, 201);
    }

    // 單篇筆記
    const nm = path.match(/^\/notes\/(\d+)$/);
    if (nm) {
      const id = Number(nm[1]);
      if (method === 'GET') {
        const [note] = await sql`SELECT * FROM notes WHERE id = ${id}`;
        return note ? json({ note }) : json({ error: '筆記不存在' }, 404);
      }
      if (method === 'PUT') {
        const b = await readBody(req);
        const [cur] = await sql`SELECT * FROM notes WHERE id = ${id}`;
        if (!cur) return json({ error: '筆記不存在' }, 404);
        const title = 'title' in b ? String(b.title ?? '') : cur.title;
        const content = 'content' in b ? String(b.content ?? '') : cur.content;
        const category_id = 'category_id' in b ? toId(b.category_id) : cur.category_id;
        const tags = 'tags' in b ? cleanTags(b.tags) : cur.tags;
        const pinned = 'pinned' in b ? !!b.pinned : cur.pinned;
        const [note] = await sql`
          UPDATE notes SET title = ${title}, content = ${content}, category_id = ${category_id},
                 tags = ${tags}::text[], pinned = ${pinned}, updated_at = now()
          WHERE id = ${id} RETURNING *`;
        return json({ note });
      }
      if (method === 'DELETE') {
        await sql`DELETE FROM notes WHERE id = ${id}`;
        return json({ ok: true });
      }
    }

    // 分類
    if (path === '/categories' && method === 'POST') {
      const name = String((await readBody(req)).name || '').trim().slice(0, 60);
      if (!name) return json({ error: '名稱不能為空' }, 400);
      const [category] = await sql`
        INSERT INTO categories (name) VALUES (${name})
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`;
      return json({ category }, 201);
    }
    const cm = path.match(/^\/categories\/(\d+)$/);
    if (cm) {
      const id = Number(cm[1]);
      if (method === 'PUT') {
        const name = String((await readBody(req)).name || '').trim().slice(0, 60);
        if (!name) return json({ error: '名稱不能為空' }, 400);
        try {
          const [category] = await sql`UPDATE categories SET name = ${name} WHERE id = ${id} RETURNING *`;
          return json({ category });
        } catch {
          return json({ error: '已存在同名分類' }, 409);
        }
      }
      if (method === 'DELETE') {
        await sql`DELETE FROM categories WHERE id = ${id}`;
        return json({ ok: true });
      }
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e.message || 'server error' }, 500);
  }
};
