// Netlify Function (v2) — 所有 /api/* 請求都由這裡處理
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const PASSWORD = process.env.APP_PASSWORD || '';
// 修改 APP_PASSWORD 或 AUTH_SECRET 後，所有已登入的會話都會失效
const SECRET = (process.env.AUTH_SECRET || '') + '|' + PASSWORD;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const sql = DB_URL ? neon(DB_URL) : null;

export const config = { path: '/api/*' };

/* ---------- helpers ---------- */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
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
  const token = (header || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const a = Buffer.from(hmac(exp));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(exp) > Date.now();
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
    if (!sql) return json({ error: '伺服器未設定 DATABASE_URL' }, 500);
    if (!PASSWORD) return json({ error: '伺服器未設定 APP_PASSWORD' }, 500);

    // 登入
    if (path === '/login' && method === 'POST') {
      const { password } = await readBody(req);
      if (typeof password === 'string' && crypto.timingSafeEqual(sha(password), sha(PASSWORD))) {
        return json({ token: makeToken() });
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
      return json({ categories, tags, ...counts[0] });
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
