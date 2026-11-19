// Vercel Serverless Function — 所有 /api/* 請求都由這裡處理
// 基於 netlify/functions/api.mjs 改寫，使用 Node.js 標準 API 與 Vercel 環境
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { S3Client, HeadBucketCommand, CreateBucketCommand, GetBucketCorsCommand, PutBucketCorsCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/* ---------- 環境變量初始化 ---------- */
const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = (process.env.AUTH_SECRET || '') + '|' + PASSWORD;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const sql = DB_URL ? neon(DB_URL) : null;

const env = (k) => process.env['S3_' + k] || process.env['NEON_S3_' + k] || '';
const S3_ENDPOINT = env('ENDPOINT') || process.env.AWS_ENDPOINT_URL_S3 || '';
const S3 = {
  endpoint: S3_ENDPOINT,
  region: env('REGION') || process.env.AWS_REGION_S3 ||
    (/\.r2\.cloudflarestorage\.com/.test(S3_ENDPOINT) ? 'auto'
      : (S3_ENDPOINT.match(/[.\/]([a-z]{2}-[a-z]+-\d{1,3})\./) || [])[1] || 'us-east-1'),
  accessKeyId: env('ACCESS_KEY_ID'),
  secretAccessKey: env('SECRET_ACCESS_KEY'),
  bucket: env('BUCKET') || 'inkwell',
  pathStyle: env('FORCE_PATH_STYLE') !== 'false',
  manageCors: env('MANAGE_CORS') !== 'false',
};
const STORAGE_ON = !!(S3.endpoint && S3.accessKeyId && S3.secretAccessKey);
const MAX_MB = Number(process.env.UPLOAD_MAX_MB) || 200;
const PINNED_ORIGINS = [process.env.URL, ...(process.env.CORS_ORIGINS || '').split(',')]
  .map((x) => (x || '').trim().replace(/\/+$/, '')).filter(Boolean);
const FILE_KEY_RE = /^u\/\d{4}\/\d{2}\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/;
const COOKIE = 'ink_files';

/* ---------- S3 Client (lazy init) ---------- */
let s3Client = null;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: S3.region,
      endpoint: S3.endpoint,
      credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
      forcePathStyle: S3.pathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return s3Client;
}

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
const fileCookie = (token) =>
  `${COOKIE}=${token}; Path=/api/files; Max-Age=${token ? SESSION_DAYS * 86400 : 0}; HttpOnly; Secure; SameSite=Lax`;

// 確保 bucket 存在，並允許當前網站來源直接 PUT 上傳（CORS）
const corsOk = new Set();
async function ensureBucket(origin) {
  if (!S3.manageCors || corsOk.has(origin)) return;
  const client = getS3Client();
  const Bucket = S3.bucket;
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch (e) {
    const code = e?.$metadata?.httpStatusCode;
    if (code !== 404 && e?.name !== 'NotFound' && e?.name !== 'NoSuchBucket') throw e;
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
    } catch (e2) {
      throw new Error(`找不到 bucket「${Bucket}」，自動建立也失敗了，請在儲存服務後台手動建立（${e2.name || e2.message}）`);
    }
  }
  let origins = [];
  try {
    const r = await client.send(new GetBucketCorsCommand({ Bucket }));
    origins = (r.CORSRules || []).flatMap((x) => x.AllowedOrigins || []);
  } catch { /* 尚未設定 CORS */ }
  const need = [...new Set([...PINNED_ORIGINS, origin])];
  if (!origins.includes('*') && need.some((o) => !origins.includes(o))) {
    const others = origins.filter((o) => !need.includes(o)).slice(-15);
    const all = [...need, ...others];
    try {
      await client.send(new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: { CORSRules: [{
          AllowedOrigins: all, AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600,
        }] },
      }));
    } catch (e) {
      throw new Error(`無法設定 bucket CORS（${e?.name || e?.message || e}），請確認金鑰有設定 bucket 的權限；或在儲存服務後台為 ${origin} 設定 CORS（允許 PUT/GET/HEAD），並把 S3_MANAGE_CORS 設為 false`);
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

/* ---------- 應用設定(settings 表) ---------- */
const SETTING_MCP_ENABLED = 'mcp_enabled';
const SETTING_MCP_TOKEN = 'mcp_token';
async function getSetting(key) {
  await init();
  const [row] = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return row ? row.value : null;
}
async function setSetting(key, value) {
  await init();
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/* ---------- MCP(Streamable HTTP) ---------- */
const MCP_PROTOCOL = '2025-06-18';
const MCP_SUPPORTED = ['2024-11-05', '2025-03-26', '2025-06-18'];
const MCP_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept',
  'access-control-expose-headers': 'mcp-session-id',
  'access-control-max-age': '86400',
};

const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const bool = (description) => ({ type: 'boolean', description });
const tagArray = (description) => ({ type: 'array', items: { type: 'string' }, description });

const MCP_TOOLS = [
  { name: 'list_notes', description: '列出筆記(可用分類、標籤、關鍵字過濾),返回摘要。', inputSchema: obj({ category_id: { type: ['integer', 'null'], description: '分類 ID' }, category: str('分類名稱(與 category_id 二選一)'), tag: str('標籤名稱,可不帶 #'), query: str('在標題與內容中搜索的關鍵字'), limit: int('返回上限,默認 50,最大 200') }) },
  { name: 'get_note', description: '讀取單篇筆記的完整內容。', inputSchema: obj({ id: int('筆記 ID') }, ['id']) },
  { name: 'search_notes', description: '依關鍵字全文搜索筆記,返回摘要。', inputSchema: obj({ query: str('關鍵字'), limit: int('返回上限,默認 50') }, ['query']) },
  { name: 'create_note', description: '新建一篇筆記。', inputSchema: obj({ title: str('標題'), content: str('Markdown 內容'), category_id: { type: ['integer', 'null'], description: '分類 ID' }, category: str('分類名稱,不存在時會自動建立'), tags: tagArray('標籤陣列'), pinned: bool('是否置頂') }) },
  { name: 'update_note', description: '更新筆記;內容可整篇替換、附加或前置。', inputSchema: obj({ id: int('筆記 ID'), title: str('新標題'), content: str('新內容'), content_mode: { type: 'string', enum: ['replace', 'append', 'prepend'], description: '內容處理方式,默認 replace' }, category_id: { type: ['integer', 'null'], description: '分類 ID(null 表示移出分類)' }, category: str('分類名稱,不存在時會自動建立'), tags: tagArray('完整標籤陣列(會覆蓋原標籤)'), pinned: bool('是否置頂') }, ['id']) },
  { name: 'delete_note', description: '刪除一篇筆記。', inputSchema: obj({ id: int('筆記 ID') }, ['id']) },
  { name: 'list_categories', description: '列出全部分類與其筆記數。', inputSchema: obj({}) },
  { name: 'create_category', description: '建立分類。', inputSchema: obj({ name: str('分類名稱') }, ['name']) },
  { name: 'rename_category', description: '重命名分類。', inputSchema: obj({ id: int('分類 ID'), name: str('新名稱') }, ['id', 'name']) },
  { name: 'delete_category', description: '刪除分類,其中的筆記會變成未分類。', inputSchema: obj({ id: int('分類 ID') }, ['id']) },
  { name: 'list_tags', description: '列出全部標籤與其使用次數。', inputSchema: obj({}) },
  { name: 'set_note_meta', description: '只調整單篇筆記的分類、標籤或置頂狀態。', inputSchema: obj({ id: int('筆記 ID'), category_id: { type: ['integer', 'null'], description: '分類 ID' }, category: str('分類名稱,不存在時會自動建立'), tags: tagArray('完整標籤陣列(會覆蓋原標籤)'), pinned: bool('是否置頂') }, ['id']) },
  { name: 'bulk_organize', description: '批次整理筆記:依篩選條件新增/移除標籤、設定分類或置頂。', inputSchema: obj({ filter: obj({ ids: { type: 'array', items: { type: 'integer' }, description: '指定筆記 ID' }, category_id: { type: ['integer', 'null'], description: '依分類篩選' }, category: str('依分類名稱篩選'), tag: str('依標籤篩選'), query: str('依關鍵字篩選'), uncategorized: bool('只選未分類') }, []), add_tags: tagArray('要新增的標籤'), remove_tags: tagArray('要移除的標籤'), set_category_id: { type: ['integer', 'null'], description: '設定分類 ID(null 表示移出分類)' }, pinned: bool('設定置頂') }, ['filter']) },
  { name: 'rename_tag', description: '把所有筆記中的某個標籤改名;to 留空表示刪除該標籤。', inputSchema: obj({ from: str('原標籤'), to: str('新標籤') }, ['from']) },
  { name: 'stats', description: '筆記、分類、標籤的總量統計。', inputSchema: obj({}) },
];
const MCP_TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.name));

async function categoryIdByName(name) {
  const [c] = await sql`SELECT id FROM categories WHERE name = ${name}`;
  return c ? c.id : null;
}
async function ensureCategoryByName(name) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) return null;
  const [c] = await sql`INSERT INTO categories (name) VALUES (${n}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  return c ? c.id : null;
}
const likeArg = (q) => (q ? `%${String(q).replace(/[\\%_]/g, '\\$&')}%` : null);

const MCP_IMPL = {
  async list_notes(a = {}) {
    let cat = a.category_id === undefined ? null : toId(a.category_id);
    if (a.category) cat = await categoryIdByName(String(a.category));
    const tag = a.tag ? String(a.tag).replace(/^#/, '') : null;
    const like = likeArg(a.query);
    const limit = Math.min(Math.max(Number(a.limit) || 50, 1), 200);
    const notes = await sql`
      SELECT n.id, n.title, left(n.content, 300) AS excerpt, n.category_id, c.name AS category,
             n.tags, n.pinned, n.created_at, n.updated_at
      FROM notes n LEFT JOIN categories c ON c.id = n.category_id
      WHERE (${cat}::int IS NULL OR n.category_id = ${cat}::int)
        AND (${tag}::text IS NULL OR ${tag}::text = ANY(n.tags))
        AND (${like}::text IS NULL OR n.title ILIKE ${like}::text OR n.content ILIKE ${like}::text)
      ORDER BY n.pinned DESC, n.updated_at DESC LIMIT ${limit}`;
    return { count: notes.length, notes };
  },
  async get_note({ id }) {
    const [note] = await sql`SELECT n.*, c.name AS category FROM notes n LEFT JOIN categories c ON c.id = n.category_id WHERE n.id = ${Number(id)}`;
    if (!note) throw new Error(`筆記 ${id} 不存在`);
    return { note };
  },
  async search_notes(a = {}) { return MCP_IMPL.list_notes({ query: a.query, limit: a.limit }); },
  async create_note(a = {}) {
    let cat = toId(a.category_id);
    if (a.category) cat = await ensureCategoryByName(String(a.category));
    const [note] = await sql`
      INSERT INTO notes (title, content, category_id, tags, pinned)
      VALUES (${String(a.title ?? '')}, ${String(a.content ?? '')}, ${cat}, ${cleanTags(a.tags)}::text[], ${!!a.pinned})
      RETURNING *`;
    return { note };
  },
  async update_note(a = {}) {
    const id = Number(a.id);
    const [cur] = await sql`SELECT * FROM notes WHERE id = ${id}`;
    if (!cur) throw new Error(`筆記 ${id} 不存在`);
    let content = cur.content;
    if (typeof a.content === 'string') {
      const mode = a.content_mode || 'replace';
      content = mode === 'append'
        ? (cur.content.trim() ? cur.content.replace(/\s*$/, '') + '\n\n' + a.content : a.content)
        : mode === 'prepend'
          ? (cur.content.trim() ? a.content + '\n\n' + cur.content : a.content)
          : a.content;
    }
    let category_id = cur.category_id;
    if (a.category_id !== undefined) category_id = toId(a.category_id);
    else if (a.category !== undefined) category_id = await ensureCategoryByName(String(a.category));
    const title = a.title !== undefined ? String(a.title) : cur.title;
    const tags = a.tags !== undefined ? cleanTags(a.tags) : cur.tags;
    const pinned = a.pinned !== undefined ? !!a.pinned : cur.pinned;
    const [note] = await sql`
      UPDATE notes SET title = ${title}, content = ${content}, category_id = ${category_id},
               tags = ${tags}::text[], pinned = ${pinned}, updated_at = now()
      WHERE id = ${id} RETURNING *`;
    return { note };
  },
  async delete_note({ id }) {
    const [row] = await sql`DELETE FROM notes WHERE id = ${Number(id)} RETURNING id`;
    if (!row) throw new Error(`筆記 ${id} 不存在`);
    return { ok: true, id: row.id };
  },
  async list_categories() {
    const categories = await sql`SELECT c.id, c.name, COUNT(n.id)::int AS count FROM categories c LEFT JOIN notes n ON n.category_id = c.id GROUP BY c.id ORDER BY c.sort, c.name`;
    return { count: categories.length, categories };
  },
  async create_category({ name }) {
    const n = String(name || '').trim().slice(0, 60);
    if (!n) throw new Error('名稱不能為空');
    const [category] = await sql`INSERT INTO categories (name) VALUES (${n}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`;
    return { category };
  },
  async rename_category({ id, name }) {
    const n = String(name || '').trim().slice(0, 60);
    if (!n) throw new Error('名稱不能為空');
    try {
      const [category] = await sql`UPDATE categories SET name = ${n} WHERE id = ${Number(id)} RETURNING *`;
      if (!category) throw new Error(`分類 ${id} 不存在`);
      return { category };
    } catch (e) {
      if (String(e.message || '').includes('duplicate')) throw new Error('已存在同名分類');
      throw e;
    }
  },
  async delete_category({ id }) {
    const [row] = await sql`DELETE FROM categories WHERE id = ${Number(id)} RETURNING id`;
    if (!row) throw new Error(`分類 ${id} 不存在`);
    return { ok: true, id: row.id };
  },
  async list_tags() {
    const tags = await sql`SELECT t AS name, COUNT(*)::int AS count FROM notes, unnest(tags) AS t GROUP BY t ORDER BY count DESC, t`;
    return { count: tags.length, tags };
  },
  async set_note_meta(a = {}) {
    const id = Number(a.id);
    const [cur] = await sql`SELECT * FROM notes WHERE id = ${id}`;
    if (!cur) throw new Error(`筆記 ${id} 不存在`);
    let category_id = cur.category_id;
    if (a.category_id !== undefined) category_id = toId(a.category_id);
    else if (a.category !== undefined) category_id = await ensureCategoryByName(String(a.category));
    const tags = a.tags !== undefined ? cleanTags(a.tags) : cur.tags;
    const pinned = a.pinned !== undefined ? !!a.pinned : cur.pinned;
    const [note] = await sql`UPDATE notes SET category_id = ${category_id}, tags = ${tags}::text[], pinned = ${pinned}, updated_at = now() WHERE id = ${id} RETURNING *`;
    return { note };
  },
  async bulk_organize(a = {}) {
    const f = a.filter || {};
    const ids = Array.isArray(f.ids) && f.ids.length ? f.ids.map(Number).filter(Number.isInteger) : null;
    let cat = f.category_id !== undefined ? toId(f.category_id) : null;
    if (f.category) cat = await categoryIdByName(String(f.category));
    const tag = f.tag ? String(f.tag).replace(/^#/, '') : null;
    const like = likeArg(f.query);
    const uncat = !!f.uncategorized;
    if (!ids && cat === null && !tag && !like && !uncat) throw new Error('bulk_organize 至少需要一個篩選條件(ids / category / category_id / tag / query / uncategorized)');
    const add = cleanTags(a.add_tags);
    const remove = cleanTags(a.remove_tags);
    const touchTags = a.add_tags !== undefined || a.remove_tags !== undefined;
    const touchCat = 'set_category_id' in a;
    const setCat = toId(a.set_category_id);
    const touchPin = a.pinned !== undefined;
    const pin = !!a.pinned;
    const rows = await sql`
      UPDATE notes SET
        tags = CASE WHEN ${touchTags}::boolean THEN (SELECT COALESCE(array_agg(DISTINCT x), '{}'::text[]) FROM unnest(tags || ${add}::text[]) AS x WHERE NOT (x = ANY(${remove}::text[]))) ELSE tags END,
        category_id = CASE WHEN ${touchCat}::boolean THEN ${setCat}::int ELSE category_id END,
        pinned = CASE WHEN ${touchPin}::boolean THEN ${pin}::boolean ELSE pinned END,
        updated_at = now()
      WHERE (${ids}::int[] IS NULL OR id = ANY(${ids}::int[]))
        AND (${cat}::int IS NULL OR category_id = ${cat}::int)
        AND (${uncat}::boolean = false OR category_id IS NULL)
        AND (${tag}::text IS NULL OR ${tag}::text = ANY(tags))
        AND (${like}::text IS NULL OR title ILIKE ${like}::text OR content ILIKE ${like}::text)
      RETURNING id`;
    return { updated: rows.length, ids: rows.map((r) => r.id) };
  },
  async rename_tag(a = {}) {
    const from = String(a.from || '').replace(/^#/, '').trim();
    const to = String(a.to || '').replace(/^#/, '').trim();
    if (!from) throw new Error('from 不能為空');
    const rows = await sql`UPDATE notes SET tags = (SELECT COALESCE(array_agg(DISTINCT x), '{}'::text[]) FROM unnest(array_replace(tags, ${from}::text, ${to}::text)) AS x WHERE x <> ''), updated_at = now() WHERE ${from}::text = ANY(tags) RETURNING id`;
    return { updated: rows.length, ids: rows.map((r) => r.id), from, to };
  },
  async stats() {
    const [row] = await sql`SELECT (SELECT COUNT(*) FROM notes)::int AS notes, (SELECT COUNT(*) FROM categories)::int AS categories, (SELECT COUNT(*) FROM notes WHERE category_id IS NULL)::int AS uncategorized, (SELECT COUNT(DISTINCT t) FROM notes, unnest(tags) AS t)::int AS tags, (SELECT COUNT(*) FROM uploads)::int AS uploads`;
    return row;
  },
};

async function mcpAuthorized(req, url) {
  if ((await getSetting(SETTING_MCP_ENABLED)) !== '1') return false;
  const stored = (await getSetting(SETTING_MCP_TOKEN)) || '';
  const given = ((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '').trim();
  if (!stored || !given) return false;
  const a = sha(given), b = sha(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function mcpRpc(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case 'initialize': {
      const want = params?.protocolVersion;
      return { protocolVersion: MCP_SUPPORTED.includes(want) ? want : MCP_PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'inkwell-notes', version: '1.0.0' } };
    }
    case 'ping': return {};
    case 'tools/list': return { tools: MCP_TOOLS };
    case 'tools/call': {
      const name = params?.name;
      if (!MCP_TOOL_NAMES.has(name)) throw Object.assign(new Error(`未知的工具:${name}`), { code: -32602 });
      try { const out = await MCP_IMPL[name](params?.arguments || {}); return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }], isError: false }; }
      catch (e) { return { content: [{ type: 'text', text: `錯誤:${e.message || e}` }], isError: true }; }
    }
    default: throw Object.assign(new Error(`不支援的方法:${method}`), { code: -32601 });
  }
}

async function handleMcp(req, url) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
  if (!(await mcpAuthorized(req, url))) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } }, 401, MCP_CORS);
  if (req.method === 'GET') return new Response(null, { status: 405, headers: { ...MCP_CORS, allow: 'POST, DELETE, OPTIONS' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: MCP_CORS });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...MCP_CORS, allow: 'POST, DELETE, OPTIONS' } });
  let body;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400, MCP_CORS); }
  const batch = Array.isArray(body);
  const out = [];
  for (const msg of (batch ? body : [body])) {
    const notification = msg && msg.id === undefined;
    if (!msg || typeof msg.method !== 'string') { if (!notification) out.push({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'invalid request' } }); continue; }
    if (msg.method.startsWith('notifications/')) continue;
    try { out.push({ jsonrpc: '2.0', id: msg.id ?? null, result: await mcpRpc(msg) }); }
    catch (e) { out.push({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: e.code || -32603, message: e.message || 'error' } }); }
  }
  if (!out.length) return new Response(null, { status: 202, headers: MCP_CORS });
  return json(batch ? out : out[0], 200, { ...MCP_CORS, 'mcp-protocol-version': MCP_PROTOCOL });
}

/* ---------- schema (自動建表) ---------- */
let ready;
function init() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', category_id INT REFERENCES categories(id) ON DELETE SET NULL, tags TEXT[] NOT NULL DEFAULT '{}', pinned BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (pinned DESC, updated_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN (tags)`;
      await sql`CREATE INDEX IF NOT EXISTS notes_category_idx ON notes (category_id)`;
      await sql`CREATE TABLE IF NOT EXISTS uploads (key TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', size BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* ---------- handler ---------- */
export default async function handler(req) {
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
      const client = getS3Client();
      const target = await getSignedUrl(client, new GetObjectCommand({ Bucket: S3.bucket, Key: key }), { expiresIn: 6 * 3600 });
      return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'private, max-age=10800' } });
    }

    if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': fileCookie('') });

    if (!sql) return json({ error: '伺服器未設定 DATABASE_URL' }, 500);

    // MCP(Streamable HTTP) — 用獨立 Bearer token,不走應用登入
    if (path === '/mcp') return handleMcp(req, url);

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

    // AI 設定:MCP 開關與存取權杖
    if (path === '/ai' && method === 'GET') {
      return json({ enabled: (await getSetting(SETTING_MCP_ENABLED)) === '1', token: (await getSetting(SETTING_MCP_TOKEN)) || '', url: `${url.origin}/api/mcp`, tools: [...MCP_TOOL_NAMES] });
    }
    if (path === '/ai' && method === 'POST') {
      const b = await readBody(req);
      let token = (await getSetting(SETTING_MCP_TOKEN)) || '';
      if (b.enabled && !token) { token = randomToken(); await setSetting(SETTING_MCP_TOKEN, token); }
      if ('enabled' in b) await setSetting(SETTING_MCP_ENABLED, b.enabled ? '1' : '0');
      return json({ enabled: (await getSetting(SETTING_MCP_ENABLED)) === '1', token, url: `${url.origin}/api/mcp`, tools: [...MCP_TOOL_NAMES] });
    }
    if (path === '/ai/token' && method === 'POST') {
      const token = randomToken();
      await setSetting(SETTING_MCP_TOKEN, token);
      await setSetting(SETTING_MCP_ENABLED, '1');
      return json({ enabled: true, token, url: `${url.origin}/api/mcp`, tools: [...MCP_TOOL_NAMES] });
    }

    // 側欄:分類 / 標籤 / 計數
    if (path === '/meta' && method === 'GET') {
      const [categories, tags, counts] = await Promise.all([
        sql`SELECT c.id, c.name, COUNT(n.id)::int AS count FROM categories c LEFT JOIN notes n ON n.category_id = c.id GROUP BY c.id ORDER BY c.sort, c.name`,
        sql`SELECT t AS name, COUNT(*)::int AS count FROM notes, unnest(tags) AS t GROUP BY t ORDER BY count DESC, t`,
        sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE category_id IS NULL)::int AS uncategorized FROM notes`,
      ]);
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      return json({ categories, tags, ...counts[0], storage: { enabled: STORAGE_ON, maxMb: MAX_MB } }, 200, { 'set-cookie': fileCookie(token) });
    }

    // 申請上傳：返回預簽名 PUT 地址，瀏覽器直接上傳到物件儲存
    if (path === '/uploads' && method === 'POST') {
      if (!STORAGE_ON) return json({ error: '尚未設定物件儲存（S3_* 環境變量）' }, 503);
      const b = await readBody(req);
      const name = String(b.name || 'file').slice(0, 200);
      const type = String(b.type || '').slice(0, 100) || 'application/octet-stream';
      const size = Number(b.size) || 0;
      if (size > MAX_MB * 1024 * 1024) return json({ error: `文件超過 ${MAX_MB} MB 上限` }, 413);
      const origin = req.headers.get('origin') || url.origin;
      await ensureBucket(origin);
      const key = newKey(name);
      const client = getS3Client();
      const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: S3.bucket, Key: key, ContentType: type }), { expiresIn: 900 });
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
        ORDER BY pinned DESC, updated_at DESC LIMIT 1000`;
      return json({ notes });
    }

    // 新建筆記
    if (path === '/notes' && method === 'POST') {
      const b = await readBody(req);
      const [note] = await sql`INSERT INTO notes (title, content, category_id, tags, pinned) VALUES (${String(b.title ?? '')}, ${String(b.content ?? '')}, ${toId(b.category_id)}, ${cleanTags(b.tags)}::text[], ${!!b.pinned}) RETURNING *`;
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
        const [note] = await sql`UPDATE notes SET title = ${title}, content = ${content}, category_id = ${category_id}, tags = ${tags}::text[], pinned = ${pinned}, updated_at = now() WHERE id = ${id} RETURNING *`;
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
      const [category] = await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`;
      return json({ category }, 201);
    }
    const cm = path.match(/^\/categories\/(\d+)$/);
    if (cm) {
      const id = Number(cm[1]);
      if (method === 'PUT') {
        const name = String((await readBody(req)).name || '').trim().slice(0, 60);
        if (!name) return json({ error: '名稱不能為空' }, 400);
        try { const [category] = await sql`UPDATE categories SET name = ${name} WHERE id = ${id} RETURNING *`; return json({ category }); }
        catch { return json({ error: '已存在同名分類' }, 409); }
      }
      if (method === 'DELETE') { await sql`DELETE FROM categories WHERE id = ${id}`; return json({ ok: true }); }
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e.message || 'server error' }, 500);
  }
}