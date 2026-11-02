const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'adminbero';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alibeyk\u00f6y';
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

fs.mkdirSync(DATA_DIR, { recursive: true });

function now() { return new Date().toISOString(); }
function id() { return crypto.randomBytes(24).toString('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('base64url');
  return `${salt}.${derived}`;
}
function passwordMatches(password, stored) {
  const [salt, saved] = String(stored).split('.');
  if (!salt || !saved) return false;
  const candidate = hashPassword(password, salt).split('.')[1];
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(saved));
}
function emptyModules() {
  return Object.fromEntries(['A1', 'A2', 'B1', 'B2'].map((code) => [code, { lessons: 0, weeks: 7, absences: 0 }]));
}
function defaultDatabase() {
  const createdAt = now();
  return {
    users: [{
      id: id(), username: ADMIN_USERNAME, passwordHash: hashPassword(ADMIN_PASSWORD), role: 'admin',
      legalAcceptedAt: createdAt, createdAt, updatedAt: createdAt,
      profile: { firstName: 'Berat', lastName: '\u00d6zer', birthDate: '', department: '', avatar: '' },
      modules: emptyModules()
    }],
    sessions: []
  };
}
function loadDatabase() {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(db.users) && Array.isArray(db.sessions)) return db;
  } catch { /* First start creates the database. */ }
  const db = defaultDatabase();
  saveDatabase(db);
  return db;
}
function saveDatabase(db) {
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}
let db = loadDatabase();
// Repair the development seed created by early Windows-encoding previews only.
// It never affects a normally created account or an account with saved module data.
const seededAdmin = db.users.find((user) => user.username === ADMIN_USERNAME && user.role === 'admin');
if (seededAdmin && seededAdmin.profile?.firstName === 'Berat' && seededAdmin.profile?.lastName?.length > 4 && Object.values(seededAdmin.modules || {}).every((item) => item.lessons === 0 && item.absences === 0)) {
  seededAdmin.passwordHash = hashPassword(ADMIN_PASSWORD);
  seededAdmin.profile.lastName = '\u00d6zer';
  saveDatabase(db);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(payload));
}
function sendError(res, status, message) { sendJson(res, status, { error: message }); }
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const pos = item.indexOf('=');
    return [item.slice(0, pos).trim(), decodeURIComponent(item.slice(pos + 1).trim())];
  }));
}
function getCurrentUser(req) {
  const sessionId = parseCookies(req).lau_session;
  if (!sessionId) return null;
  const session = db.sessions.find((item) => item.id === sessionId && item.expiresAt > Date.now());
  return session ? db.users.find((user) => user.id === session.userId) || null : null;
}
function cookieHeader(req, sessionId, expiresAt) {
  const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' ? '; Secure' : '';
  return `lau_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}${secure}`;
}
function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}
function summary(modules) {
  const entries = Object.values(modules || {});
  const lessons = entries.reduce((total, item) => total + Number(item.lessons || 0), 0);
  const absences = entries.reduce((total, item) => total + Number(item.absences || 0), 0);
  const attendance = lessons ? Math.max(0, ((lessons - absences) / lessons) * 100) : null;
  return { lessons, absences, attendance };
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > 750000) { reject(new Error('İstek boyutu çok büyük.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error('Geçersiz veri biçimi.')); }
    });
    req.on('error', reject);
  });
}
function cleanText(value, max) { return String(value || '').trim().slice(0, max); }
function validModules(input) {
  const next = {};
  for (const code of ['A1', 'A2', 'B1', 'B2']) {
    const current = input?.[code] || {};
    const lessons = Number(current.lessons);
    const weeks = Number(current.weeks);
    const absences = Number(current.absences);
    if (!Number.isInteger(lessons) || lessons < 0 || lessons > 400 || ![7, 8].includes(weeks) || !Number.isInteger(absences) || absences < 0 || absences > lessons) return null;
    next[code] = { lessons, weeks, absences };
  }
  return next;
}
function createSession(req, res, userId) {
  db.sessions = db.sessions.filter((item) => item.expiresAt > Date.now());
  const expiresAt = Date.now() + SESSION_MS;
  const sessionId = id();
  db.sessions.push({ id: sessionId, userId, expiresAt });
  saveDatabase(db);
  return { 'set-cookie': cookieHeader(req, sessionId, expiresAt) };
}
function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) { sendError(res, 401, 'Devam etmek için giriş yapmalısın.'); return null; }
  return user;
}

async function api(req, res, url) {
  const route = url.pathname;
  if (req.method === 'POST' && route === '/api/auth/register') {
    const body = await readJson(req);
    const username = cleanText(body.username, 28).toLowerCase();
    const password = String(body.password || '');
    if (!body.legalAccepted) return sendError(res, 400, 'Hesap açmak için yasal bilgilendirme onayı gerekli.');
    if (!/^[a-z0-9_.-]{3,28}$/.test(username)) return sendError(res, 400, 'Kullanıcı adı 3–28 karakter olmalı; yalnızca harf, sayı, nokta, tire veya alt çizgi içerebilir.');
    if (password.length < 8 || password.length > 128) return sendError(res, 400, 'Şifre 8–128 karakter arasında olmalı.');
    if (db.users.some((user) => user.username === username)) return sendError(res, 409, 'Bu kullanıcı adı kullanılıyor.');
    const createdAt = now();
    const user = { id: id(), username, passwordHash: hashPassword(password), role: 'student', legalAcceptedAt: createdAt, createdAt, updatedAt: createdAt, profile: { firstName: '', lastName: '', birthDate: '', department: '', avatar: '' }, modules: emptyModules() };
    db.users.push(user);
    const headers = createSession(req, res, user.id);
    return sendJson(res, 201, { user: publicUser(user) }, headers);
  }
  if (req.method === 'POST' && route === '/api/auth/login') {
    const body = await readJson(req);
    const username = cleanText(body.username, 28).toLowerCase();
    const user = db.users.find((item) => item.username === username);
    if (!user || !passwordMatches(String(body.password || ''), user.passwordHash)) return sendError(res, 401, 'Kullanıcı adı veya şifre hatalı.');
    const headers = createSession(req, res, user.id);
    return sendJson(res, 200, { user: publicUser(user) }, headers);
  }
  if (req.method === 'POST' && route === '/api/auth/logout') {
    const sessionId = parseCookies(req).lau_session;
    db.sessions = db.sessions.filter((item) => item.id !== sessionId);
    saveDatabase(db);
    return sendJson(res, 200, { ok: true }, { 'set-cookie': 'lau_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (req.method === 'GET' && route === '/api/me') {
    const user = getCurrentUser(req);
    return sendJson(res, 200, { user: user ? publicUser(user) : null });
  }
  if (req.method === 'PUT' && route === '/api/profile') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readJson(req);
    const avatar = cleanText(body.avatar, 450000);
    if (avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(avatar)) return sendError(res, 400, 'Profil görseli geçersiz.');
    user.profile = { firstName: cleanText(body.firstName, 50), lastName: cleanText(body.lastName, 50), birthDate: /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate || '') ? body.birthDate : '', department: cleanText(body.department, 100), avatar };
    user.updatedAt = now(); saveDatabase(db);
    return sendJson(res, 200, { user: publicUser(user) });
  }
  if (req.method === 'PUT' && route === '/api/progress') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readJson(req); const modules = validModules(body.modules);
    if (!modules) return sendError(res, 400, 'Modül verilerinden birini kontrol et. Devamsızlık, ders sayısından büyük olamaz.');
    user.modules = modules; user.updatedAt = now(); saveDatabase(db);
    return sendJson(res, 200, { user: publicUser(user), summary: summary(modules) });
  }
  if (req.method === 'GET' && route === '/api/admin/overview') {
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return sendError(res, 403, 'Bu alan yalnızca yönetici hesabı içindir.');
    const users = db.users.map((item) => ({ id: item.id, username: item.username, role: item.role, profile: item.profile, createdAt: item.createdAt, updatedAt: item.updatedAt, summary: summary(item.modules) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sendJson(res, 200, { totalUsers: users.length, totalAbsences: users.reduce((total, item) => total + item.summary.absences, 0), users });
  }
  return sendError(res, 404, 'API yolu bulunamadı.');
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendError(res, 404, 'Sayfa bulunamadı.');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, error.message || 'Beklenmeyen bir sunucu hatası oluştu.');
  }
});
server.listen(PORT, () => console.log(`LAÜ Devamsızlık Takip hazır: http://localhost:${PORT}`));
