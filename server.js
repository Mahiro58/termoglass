import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import Database from 'better-sqlite3';

/* ---------- Poprawne ścieżki (Windows/Mac/Linux) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_DIR   = path.join(__dirname, 'db');
const DB_FILE  = path.join(DB_DIR, 'data.sqlite');
const UP_DIR   = path.join(__dirname, 'uploads');
const PUB_DIR  = path.join(__dirname, 'public');

/* ---------- Katalogi ---------- */
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

/* ---------- Baza (SQLite) ---------- */
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

function runSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(sql);
  }
  // Tabela banerów (na wypadek gdyby nie było w schema.sql)
  db.exec(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      link_url TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);
}

function seedAdmin() {
  const { ADMIN_EMAIL = 'admin@local', ADMIN_PASSWORD = 'admin123' } = process.env;
  const row = db.prepare('SELECT id FROM users WHERE email=?').get(ADMIN_EMAIL);
  if (!row) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?,?,?)')
      .run(ADMIN_EMAIL, hash, Date.now());
  }
}

function ensureBaseCats() {
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
    if (count === 0) {
      const cats = [
        'narzędzia ręczne',
        'elektronarzędzia',
        'farby & wykończenia',
        'podłogi & płytki',
        'oświetlenie',
        'akcesoria montażowe'
      ];
      const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
      const tx = db.transaction(arr => arr.forEach(n => stmt.run(n)));
      tx(cats);
    }
  } catch {
    // tabela categories może nie istnieć, jeśli nie było schema.sql – zignoruj
  }
}

/* ---------- Init przez CLI ---------- */
if (process.argv.includes('--init')) {
  runSchema();
  seedAdmin();
  ensureBaseCats();
  console.log('DB initialized.');
  process.exit(0);
}

/* ---------- App ---------- */
const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/* ---------- Statyki ---------- */
app.use('/uploads', express.static(UP_DIR));
app.use(express.static(PUB_DIR));

/* ---------- Upload (multer) ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'image')
      .replace(/[^a-z0-9.\-_]/gi, '_')
      .toLowerCase();
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Niedozwolony typ pliku'));
  }
});

/* ---------- Auth helpers ---------- */
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
function setAuthCookie(res, payload) {
  // dłuższa sesja (7 dni)
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

/* ===================== AUTH ===================== */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  setAuthCookie(res, { uid: user.id, email: user.email });
  res.json({ ok: true, email: user.email });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ email: payload.email });
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
});

/* Zmiana e-mail/hasła admina */
app.post('/api/admin', requireAuth, (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email_required' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.uid);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const hash = password ? bcrypt.hashSync(password, 10) : u.password_hash;
  try {
    db.prepare('UPDATE users SET email=?, password_hash=? WHERE id=?').run(email, hash, u.id);
    setAuthCookie(res, { uid: u.id, email });
    res.json({ ok: true, email });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'email_taken' });
    throw e;
  }
});

/* ===================== CATEGORIES ===================== */
app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name FROM categories ORDER BY name COLLATE NOCASE').all();
    res.json(rows);
  } catch {
    res.json([]); // gdy tabela nie istnieje
  }
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  try {
    const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
    res.json({ id: info.lastInsertRowid, name });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'duplicate' });
    throw e;
  }
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

/* ===================== PRODUCTS ===================== */
/* Public: lista produktów (dla strony głównej) */
app.get('/api/products', (req, res) => {
  let { search = '', categoryId = '', sort = 'created_desc' } = req.query;

  // normalizacja sort (myślniki/podkreślenia, małe litery)
  sort = String(sort).toLowerCase().replace(/-/g, '_');

  const where = [];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(Number(categoryId));
  }

  const order =
    sort === 'name_asc'       ? 'p.name COLLATE NOCASE ASC' :
    sort === 'name_desc'      ? 'p.name COLLATE NOCASE DESC' :
    sort === 'price_asc'      ? 'p.price ASC' :
    sort === 'price_desc'     ? 'p.price DESC' :
    sort === 'category_asc'   ? 'COALESCE(c.name, "") COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC' :
    sort === 'category_desc'  ? 'COALESCE(c.name, "") COLLATE NOCASE DESC, p.name COLLATE NOCASE ASC' :
                                'p.created_at DESC';

  const rows = db.prepare(`
    SELECT p.id, p.name, p.price, p.show_price, p.description, p.image_url,
           p.created_at, c.id AS category_id, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${order}
  `).all(...params);

  res.json(rows);
});

/* Dodawanie produktu (z uploadem) */
app.post('/api/products', requireAuth, upload.single('image'), (req, res) => {
  const { name, category_id, price = 0, show_price = '1', description = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });

  const catId = category_id ? Number(category_id) : null;
  const imgUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const info = db.prepare(`
    INSERT INTO products (name, category_id, price, show_price, description, image_url, created_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    name,
    catId,
    Number(price) || 0,
    String(show_price) === '1' ? 1 : 0,
    description,
    imgUrl,
    Date.now()
  );

  res.json({ id: info.lastInsertRowid });
});

/* Edycja prostych pól (bez podmiany zdjęcia) */
app.patch('/api/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!old) return res.status(404).json({ error: 'not_found' });

  const { name, category_id, price, show_price, description } = req.body || {};
  db.prepare(`
    UPDATE products
       SET name=?, category_id=?, price=?, show_price=?, description=?
     WHERE id=?
  `).run(
    name ?? old.name,
    category_id !== undefined ? (Number(category_id) || null) : old.category_id,
    price !== undefined ? Number(price) : old.price,
    show_price !== undefined ? (show_price ? 1 : 0) : old.show_price,
    description ?? old.description,
    id
  );

  res.json({ ok: true });
});

/* Usuwanie produktu (+ usunięcie pliku obrazu, jeśli istnieje) */
app.delete('/api/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT image_url FROM products WHERE id=?').get(id);

  db.prepare('DELETE FROM products WHERE id=?').run(id);

  if (row?.image_url) {
    // "/uploads/plik.webp" -> "<projekt>/uploads/plik.webp"
    const abs = path.join(__dirname, row.image_url.replace(/^\//, ''));
    if (fs.existsSync(abs)) fs.unlink(abs, () => {});
  }
  res.json({ ok: true });
});

/* ===================== BANNERS (slider) ===================== */

/* utwórz tabelę banerów jeśli start bez --init */
db.exec(`
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );
`);

/* Public: aktywne banery na stronę główną */
app.get('/api/banners', (req, res) => {
  const rows = db.prepare(`
    SELECT id, image_url, link_url
    FROM banners
    WHERE active = 1
    ORDER BY sort_order ASC, created_at DESC
  `).all();
  res.json(rows);
});

/* Admin: pełna lista banerów */
app.get('/api/admin/banners', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, image_url, link_url, sort_order, active, created_at
    FROM banners
    ORDER BY sort_order ASC, created_at DESC
  `).all();
  res.json(rows);
});

/* Dodawanie banera */
app.post('/api/banners', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  const { link_url = '', sort_order = 0, active = '1' } = req.body || {};
  const info = db.prepare(`
    INSERT INTO banners (image_url, link_url, sort_order, active, created_at)
    VALUES (?,?,?,?,?)
  `).run(
    `/uploads/${req.file.filename}`,
    link_url || null,
    Number(sort_order) || 0,
    String(active) === '1' ? 1 : 0,
    Date.now()
  );
  res.json({ id: info.lastInsertRowid });
});

/* Edycja banera (meta + opcjonalna podmiana zdjęcia) */
app.patch('/api/banners/:id', requireAuth, upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM banners WHERE id=?').get(id);
  if (!old) return res.status(404).json({ error: 'not_found' });

  let image_url = old.image_url;
  if (req.file) {
    const absOld = path.join(__dirname, old.image_url.replace(/^\//,''));
    if (fs.existsSync(absOld)) fs.unlink(absOld, ()=>{});
    image_url = `/uploads/${req.file.filename}`;
  }

  const { link_url, sort_order, active } = req.body || {};
  db.prepare(`
    UPDATE banners
       SET image_url=?, link_url=?, sort_order=?, active=?
     WHERE id=?
  `).run(
    image_url,
    link_url !== undefined ? (link_url || null) : old.link_url,
    sort_order !== undefined ? Number(sort_order) : old.sort_order,
    active !== undefined ? (String(active) === '1' ? 1 : 0) : old.active,
    id
  );
  res.json({ ok: true });
});

/* Usuwanie banera (+ kasowanie pliku) */
app.delete('/api/banners/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT image_url FROM banners WHERE id=?').get(id);
  db.prepare('DELETE FROM banners WHERE id=?').run(id);
  if (row?.image_url) {
    const abs = path.join(__dirname, row.image_url.replace(/^\//,''));
    if (fs.existsSync(abs)) fs.unlink(abs, ()=>{});
  }
  res.json({ ok: true });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;

// Jeśli DB nie istnieje (świeży projekt) — utwórz schemat, admina, kategorie
if (!fs.existsSync(DB_FILE)) {
  runSchema();
  seedAdmin();
  ensureBaseCats();
} else {
  // db istnieje – dopilnujmy, że banners też istnieje
  db.exec(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      link_url TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);
}

app.listen(PORT, () => {
  console.log(`➡  http://localhost:${PORT}`);
});
