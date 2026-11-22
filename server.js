import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const DEFAULT_SETTINGS = Object.freeze({
  instagramUrl: 'https://www.instagram.com/xbpocommunications/',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61591924862912',
  googleUrl: 'https://share.google/2uXwuCsCKBf2bV1MM',
  contactEmail: 'official@xbpoandcommunnications.com',
  contactPhone: '+923285382722',
  appsScriptUrl: '',
  spreadsheetId: '',
  driveFolderId: '',
  spreadsheetUrl: '',
  driveFolderUrl: '',
  careerRoles: [
    { id: 'role_1', name: 'Fronter', order: 1, description: 'Open the conversation, qualify the prospect and hand a valid call to the closer.', active: true },
    { id: 'role_2', name: 'Closer', order: 2, description: 'Take the qualified handoff, control the sales-stage conversation and progress the call.', active: true },
    { id: 'role_3', name: 'Verifier', order: 3, description: 'Confirm the required details and complete the defined verification checkpoints accurately.', active: true },
    { id: 'role_4', name: 'Team Lead', order: 4, description: 'Supervise floor execution, coaching and campaign quality workflows.', active: true },
  ],
});

let siteSettings = {
  ...DEFAULT_SETTINGS,
  careerRoles: DEFAULT_SETTINGS.careerRoles.map((r) => ({ ...r })),
};

const jobs = [];
const enquiries = [];
const logs = [];
const pendingCvs = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(String(password), salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

const masterEmail = (process.env.ADMIN_EMAIL || DEFAULT_SETTINGS.contactEmail).trim().toLowerCase();
const masterPassword = process.env.ADMIN_PASSWORD || '';
const users = [
  {
    id: 'usr_master',
    name: 'XBPO Master Admin',
    email: masterEmail,
    role: 'master',
    active: true,
    passwordHash: masterPassword ? hashPassword(masterPassword) : null,
  },
];

function addLog(action, targetType, status, detail, actorEmail = 'system') {
  logs.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    action: String(action || 'event').slice(0, 80),
    targetType: String(targetType || 'system').slice(0, 60),
    status: String(status || 'ok').slice(0, 30),
    detail: String(detail || '').slice(0, 500),
    actorEmail: String(actorEmail || 'system').slice(0, 150),
  });
  if (logs.length > 250) logs.length = 250;
}

addLog('server_boot', 'system', 'ok', 'Node.js Express server initialized with in-memory data store.');

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function setSessionCookie(res, user) {
  const token = signSession({
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
  res.cookie('xbpo_admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 12,
  });
}

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sess = verifySession(cookies.xbpo_admin_session);
  if (!sess) return null;
  const user = users.find((u) => u.id === sess.uid && u.active);
  return user || null;
}

function requireAdmin(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.adminUser = user;
  next();
}

function requireMaster(req, res, next) {
  if (!req.adminUser || req.adminUser.role !== 'master') {
    return res.status(403).json({ error: 'Master admin privileges required.' });
  }
  next();
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function csvSafe(value) {
  const s = String(value ?? '');
  const guarded = /^[\s]*[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function isHttpUrl(val) {
  return typeof val === 'string' && /^https?:\/\/.+/i.test(val.trim());
}

function isEmail(val) {
  return typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

function extractDriveOrSheetId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const sheetMatch = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return sheetMatch[1];
  const folderMatch = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return s;
}

const PUBLIC_PAGES = new Set([
  'index.html',
  'about.html',
  'services.html',
  'careers.html',
  'contact.html',
  'process.html',
  'privacy.html',
  'role-fronter.html',
  'role-closer.html',
  'role-verifier.html',
  'service-appointments.html',
  'service-final-expense.html',
  'service-lead-generation.html',
  'service-operations.html',
  'service-quality.html',
  'service-us-outbound.html',
]);

const MARIADB_SCHEMA_SQL = `-- XBPO Communications MariaDB v10.6+ Schema
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(32) PRIMARY KEY,
  instagram_url VARCHAR(300) NOT NULL,
  facebook_url VARCHAR(300) NOT NULL,
  google_url VARCHAR(300) NOT NULL,
  contact_email VARCHAR(150) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  apps_script_url VARCHAR(300) DEFAULT '',
  spreadsheet_id VARCHAR(128) DEFAULT '',
  drive_folder_id VARCHAR(128) DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_applications (
  id CHAR(36) PRIMARY KEY,
  receipt_id VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  city VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  experience VARCHAR(64) NOT NULL,
  education VARCHAR(120) DEFAULT '',
  portfolio VARCHAR(250) DEFAULT '',
  message TEXT,
  resume_name VARCHAR(255) NOT NULL,
  resume_mime VARCHAR(120) DEFAULT '',
  resume_size INT DEFAULT 0,
  drive_file_id VARCHAR(128) DEFAULT '',
  drive_file_url VARCHAR(300) DEFAULT '',
  drive_sync_status VARCHAR(24) DEFAULT 'pending',
  sheet_sync_status VARCHAR(24) DEFAULT 'pending',
  sheet_row_number INT DEFAULT NULL,
  sync_error TEXT,
  review_status VARCHAR(24) DEFAULT 'new',
  last_verified_at VARCHAR(40) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_enquiries (
  id CHAR(36) PRIMARY KEY,
  receipt_id VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(32) DEFAULT '',
  company VARCHAR(120) DEFAULT '',
  service VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  sheet_sync_status VARCHAR(24) DEFAULT 'pending',
  sheet_row_number INT DEFAULT NULL,
  sync_error TEXT,
  review_status VARCHAR(24) DEFAULT 'new',
  last_verified_at VARCHAR(40) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  role ENUM('master', 'admin', 'reviewer') NOT NULL DEFAULT 'reviewer',
  active TINYINT(1) NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  status VARCHAR(30) NOT NULL,
  detail TEXT,
  actor_email VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

// Security headers (iframe-compatible for AI Studio preview)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Block sensitive files & internal artifacts
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/.env') ||
    p === '/.htaccess' ||
    p === '/.user.ini' ||
    p === '/web.config' ||
    p === '/server.js' ||
    p === '/package.json' ||
    p === '/package-lock.json' ||
    p.endsWith('.php') ||
    p.endsWith('.sql') ||
    p.endsWith('.md') ||
    p.endsWith('.bat') ||
    p.endsWith('.gs')
  ) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Strip trailing slash (except root)
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, req.path.slice(0, -1) + query);
  }
  next();
});

// Redirect legacy .html URLs to clean extensionless URLs
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.endsWith('.html')) {
    const base = path.posix.basename(req.path);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (base === 'index.html') {
      return res.redirect(301, '/' + query);
    }
    if (base === 'admin.html' || PUBLIC_PAGES.has(base)) {
      return res.redirect(301, '/' + base.slice(0, -5) + query);
    }
  }
  next();
});

// Public API
app.get('/api/site-settings', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    instagramUrl: siteSettings.instagramUrl,
    facebookUrl: siteSettings.facebookUrl,
    googleUrl: siteSettings.googleUrl,
    contactEmail: siteSettings.contactEmail,
    contactPhone: siteSettings.contactPhone,
    appsScriptUrl: siteSettings.appsScriptUrl,
    careerRoles: siteSettings.careerRoles.filter((r) => r.active),
  });
});

app.post('/api/submissions', (req, res) => {
  const body = req.body || {};
  if (body.website) {
    return res.status(400).json({ error: 'Invalid submission.' });
  }
  const formType = body.formType;
  const requestId = String(body.requestId || '').trim();
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim();
  const consent = Boolean(body.consent);

  if (!requestId || requestId.length > 80) {
    return res.status(400).json({ error: 'Invalid request receipt ID.' });
  }
  if (fullName.length < 2 || fullName.length > 100) {
    return res.status(400).json({ error: 'Please provide your full name (2–100 characters).' });
  }
  if (!isEmail(email) || email.length > 150) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Consent is required before submitting.' });
  }

  const now = new Date().toISOString();

  if (formType === 'contact') {
    const service = String(body.service || '').trim();
    const message = String(body.message || '').trim();
    const phone = String(body.phone || '').trim();
    const company = String(body.company || '').trim();
    if (!service || service.length > 120) {
      return res.status(400).json({ error: 'Please select a service of interest.' });
    }
    if (message.length < 5 || message.length > 3000) {
      return res.status(400).json({ error: 'Please describe your campaign requirement.' });
    }
    const record = {
      id: crypto.randomUUID(),
      receiptId: requestId,
      fullName,
      email,
      phone: phone.slice(0, 32),
      company: company.slice(0, 120),
      service,
      message,
      sheetSyncStatus: 'pending',
      sheetRowNumber: null,
      syncError: '',
      reviewStatus: 'new',
      lastVerifiedAt: '',
      createdAt: now,
    };
    enquiries.unshift(record);
    addLog('enquiry_received', 'enquiry', 'ok', `Contact enquiry from ${fullName} (${service})`, email);
    return res.status(201).json({ ok: true, receiptId: requestId, formType: 'contact' });
  }

  if (formType === 'career') {
    const phone = String(body.phone || '').trim();
    const city = String(body.city || '').trim();
    const role = String(body.role || '').trim();
    const experience = String(body.experience || '').trim();
    const education = String(body.education || '').trim();
    const portfolio = String(body.portfolio || '').trim();
    const message = String(body.message || '').trim();
    const resumeName = String(body.resumeName || '').trim();
    const resumeMime = String(body.resumeMime || '').trim();
    const resumeBase64 = String(body.resumeBase64 || '').trim();

    if (phone.length < 7 || phone.length > 32) {
      return res.status(400).json({ error: 'Please enter a valid phone / WhatsApp number.' });
    }
    if (city.length < 2 || city.length > 100) {
      return res.status(400).json({ error: 'Please enter your city.' });
    }
    if (!role || role.length > 100) {
      return res.status(400).json({ error: 'Please select a preferred role.' });
    }
    if (!experience || experience.length > 64) {
      return res.status(400).json({ error: 'Please select your experience level.' });
    }
    if (portfolio && !isHttpUrl(portfolio)) {
      return res.status(400).json({ error: 'Portfolio / LinkedIn URL must start with http:// or https://.' });
    }
    const ext = (resumeName.split('.').pop() || '').toLowerCase();
    if (!resumeName || !['pdf', 'doc', 'docx'].includes(ext) || !resumeBase64) {
      return res.status(400).json({ error: 'Please attach a PDF, DOC, or DOCX CV.' });
    }
    const approxBytes = Math.floor((resumeBase64.length * 3) / 4);
    if (approxBytes <= 0 || approxBytes > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'CV must be no larger than 3 MB.' });
    }

    const safeFileName = resumeName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    pendingCvs.set(requestId, {
      safeFileName,
      mimeType: resumeMime || 'application/octet-stream',
      base64: resumeBase64,
    });

    const record = {
      id: crypto.randomUUID(),
      receiptId: requestId,
      fullName,
      email,
      phone,
      city,
      role,
      experience,
      education: education.slice(0, 120),
      portfolio: portfolio.slice(0, 250),
      message: message.slice(0, 2000),
      resumeName: safeFileName,
      resumeMime: resumeMime.slice(0, 120),
      resumeSize: approxBytes,
      hasTransientCv: true,
      driveFileId: '',
      driveFileUrl: '',
      driveSyncStatus: 'pending',
      sheetSyncStatus: 'pending',
      sheetRowNumber: null,
      syncError: '',
      reviewStatus: 'new',
      lastVerifiedAt: '',
      createdAt: now,
    };
    jobs.unshift(record);
    addLog('application_received', 'job', 'ok', `Career application from ${fullName} (${role})`, email);
    return res.status(201).json({ ok: true, receiptId: requestId, formType: 'career' });
  }

  return res.status(400).json({ error: 'Unsupported form type.' });
});

app.post('/api/submissions/:id/apps-script-status', (req, res) => {
  const id = req.params.id;
  const { sheetSyncStatus, driveSyncStatus, syncError } = req.body || {};
  const record = jobs.find((j) => j.receiptId === id) || enquiries.find((e) => e.receiptId === id);
  if (!record) return res.status(404).json({ error: 'Submission not found.' });
  if (sheetSyncStatus) record.sheetSyncStatus = String(sheetSyncStatus).slice(0, 24);
  if (driveSyncStatus && 'driveSyncStatus' in record) {
    record.driveSyncStatus = String(driveSyncStatus).slice(0, 24);
  }
  if (typeof syncError === 'string') record.syncError = syncError.slice(0, 500);
  res.json({ ok: true });
});

// Admin Auth API
app.post('/api/admin/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = users.find((u) => u.email.toLowerCase() === email && u.active);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (!user.passwordHash) {
    return res.status(401).json({ error: 'Admin password login is not configured. Set ADMIN_PASSWORD in environment variables.' });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    addLog('admin_login_failed', 'auth', 'error', `Failed login attempt for ${email}`, email);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  setSessionCookie(res, user);
  addLog('admin_login', 'auth', 'ok', `Signed in to Admin Portal`, user.email);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/admin/google-session', async (req, res) => {
  const accessToken = String(req.body?.accessToken || '').trim();
  if (!accessToken) return res.status(400).json({ error: 'Missing Google access token.' });
  try {
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoResp.ok) {
      return res.status(401).json({ error: 'Unable to verify Google account.' });
    }
    const info = await infoResp.json();
    const email = String(info.email || '').trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === email && u.active);
    if (!user) {
      return res.status(403).json({ error: 'Google account is not authorized for Admin Portal access.' });
    }
    setSessionCookie(res, user);
    addLog('admin_google_login', 'auth', 'ok', 'Signed in via Google Workspace OAuth', user.email);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch {
    res.status(502).json({ error: 'Failed to verify Google token.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('xbpo_admin_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({
    user: {
      id: req.adminUser.id,
      name: req.adminUser.name,
      email: req.adminUser.email,
      role: req.adminUser.role,
    },
    databaseMode: 'In-Memory Store (Node.js)',
  });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  res.json({ jobs, enquiries });
});

app.get('/api/admin/submissions/:id/pending-cv', requireAdmin, (req, res) => {
  const cv = pendingCvs.get(req.params.id);
  if (!cv) return res.status(404).json({ error: 'Transient CV not found.' });
  res.json(cv);
});

app.post('/api/admin/submissions/:id/sync-status', requireAdmin, (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const job = jobs.find((j) => j.receiptId === id);
  const enq = enquiries.find((e) => e.receiptId === id);
  const target = job || enq;
  if (!target) return res.status(404).json({ error: 'Submission not found.' });

  if (typeof body.sheetSyncStatus === 'string') target.sheetSyncStatus = body.sheetSyncStatus.slice(0, 24);
  if (typeof body.syncError === 'string') target.syncError = body.syncError.slice(0, 500);
  if (typeof body.reviewStatus === 'string') target.reviewStatus = body.reviewStatus.slice(0, 24);
  if (typeof body.lastVerifiedAt === 'string') target.lastVerifiedAt = body.lastVerifiedAt.slice(0, 40);
  if (body.sheetRowNumber !== undefined) target.sheetRowNumber = body.sheetRowNumber;

  if (job) {
    if (typeof body.driveFileId === 'string') job.driveFileId = body.driveFileId.slice(0, 128);
    if (typeof body.driveFileUrl === 'string') job.driveFileUrl = body.driveFileUrl.slice(0, 300);
    if (typeof body.driveSyncStatus === 'string') job.driveSyncStatus = body.driveSyncStatus.slice(0, 24);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/submissions/:id', requireAdmin, requireMaster, (req, res) => {
  const id = req.params.id;
  const jIdx = jobs.findIndex((j) => j.receiptId === id);
  if (jIdx !== -1) {
    jobs.splice(jIdx, 1);
    pendingCvs.delete(id);
    addLog('delete_job', 'job', 'ok', `Deleted application ${id}`, req.adminUser.email);
    return res.json({ ok: true });
  }
  const eIdx = enquiries.findIndex((e) => e.receiptId === id);
  if (eIdx !== -1) {
    enquiries.splice(eIdx, 1);
    addLog('delete_enquiry', 'enquiry', 'ok', `Deleted enquiry ${id}`, req.adminUser.email);
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Submission not found.' });
});

app.get('/api/admin/export/jobs', requireAdmin, (req, res) => {
  const headers = ['Created At', 'Receipt ID', 'Full Name', 'Email', 'Phone', 'City', 'Role', 'Experience', 'Education', 'Portfolio', 'CV File', 'Drive URL', 'Sheet Status', 'Drive Status', 'Review Status'];
  const rows = [
    headers.map(csvSafe).join(','),
    ...jobs.map((j) =>
      [
        j.createdAt,
        j.receiptId,
        j.fullName,
        j.email,
        j.phone,
        j.city,
        j.role,
        j.experience,
        j.education,
        j.portfolio,
        j.resumeName,
        j.driveFileUrl,
        j.sheetSyncStatus,
        j.driveSyncStatus,
        j.reviewStatus,
      ]
        .map(csvSafe)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="xbpo-jobs-export.csv"');
  res.send(rows.join('\n'));
});

app.get('/api/admin/export/enquiries', requireAdmin, (req, res) => {
  const headers = ['Created At', 'Receipt ID', 'Full Name', 'Email', 'Phone', 'Company', 'Service', 'Message', 'Sheet Status', 'Review Status'];
  const rows = [
    headers.map(csvSafe).join(','),
    ...enquiries.map((e) =>
      [
        e.createdAt,
        e.receiptId,
        e.fullName,
        e.email,
        e.phone,
        e.company,
        e.service,
        e.message,
        e.sheetSyncStatus,
        e.reviewStatus,
      ]
        .map(csvSafe)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="xbpo-enquiries-export.csv"');
  res.send(rows.join('\n'));
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: siteSettings });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  const instagramUrl = String(body.instagramUrl || siteSettings.instagramUrl).trim();
  const facebookUrl = String(body.facebookUrl || siteSettings.facebookUrl).trim();
  const googleUrl = String(body.googleUrl || siteSettings.googleUrl).trim();
  const contactEmail = String(body.contactEmail || siteSettings.contactEmail).trim();
  const contactPhone = String(body.contactPhone || siteSettings.contactPhone).trim();
  const appsScriptUrl = String(body.appsScriptUrl ?? siteSettings.appsScriptUrl).trim();
  const spreadsheetId = extractDriveOrSheetId(body.spreadsheetId ?? siteSettings.spreadsheetId);
  const driveFolderId = extractDriveOrSheetId(body.driveFolderId ?? siteSettings.driveFolderId);

  if (!isHttpUrl(instagramUrl) || !isHttpUrl(facebookUrl) || !isHttpUrl(googleUrl)) {
    return res.status(400).json({ error: 'Social media URLs must start with http:// or https://.' });
  }
  if (!isEmail(contactEmail)) {
    return res.status(400).json({ error: 'Please provide a valid contact email.' });
  }
  if (!/^[+0-9() .-]{10,32}$/.test(contactPhone)) {
    return res.status(400).json({ error: 'Please provide a valid contact phone number.' });
  }
  if (appsScriptUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(appsScriptUrl)) {
    return res.status(400).json({ error: 'Apps Script URL must end with /exec on script.google.com.' });
  }

  siteSettings = {
    ...siteSettings,
    instagramUrl,
    facebookUrl,
    googleUrl,
    contactEmail,
    contactPhone,
    appsScriptUrl,
    spreadsheetId,
    driveFolderId,
    spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit` : '',
    driveFolderUrl: driveFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(driveFolderId)}` : '',
  };

  addLog('settings_updated', 'settings', 'ok', 'Updated public links & Workspace settings', req.adminUser.email);
  res.json({ settings: siteSettings });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
    })),
  });
});

app.post('/api/admin/users', requireAdmin, requireMaster, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'admin' ? 'admin' : 'reviewer';
  const password = String(req.body?.password || '');

  if (name.length < 2 || !isEmail(email) || password.length < 8) {
    return res.status(400).json({ error: 'Valid name, email, and 8+ character password are required.' });
  }
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }
  const newUser = {
    id: `usr_${crypto.randomUUID().slice(0, 8)}`,
    name,
    email,
    role,
    active: true,
    passwordHash: hashPassword(password),
  };
  users.push(newUser);
  addLog('user_created', 'user', 'ok', `Created ${role} user ${email}`, req.adminUser.email);
  res.status(201).json({
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, active: newUser.active },
  });
});

app.patch('/api/admin/users/:id', requireAdmin, requireMaster, (req, res) => {
  const target = users.find((u) => u.id === req.params.id);
  if (!target || target.role === 'master') {
    return res.status(404).json({ error: 'User not found or protected.' });
  }
  if (typeof req.body?.active === 'boolean') target.active = req.body.active;
  addLog('user_updated', 'user', 'ok', `Updated status for ${target.email} (active=${target.active})`, req.adminUser.email);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, requireMaster, (req, res) => {
  const idx = users.findIndex((u) => u.id === req.params.id && u.role !== 'master');
  if (idx === -1) return res.status(404).json({ error: 'User not found or protected.' });
  const removed = users.splice(idx, 1)[0];
  addLog('user_deleted', 'user', 'ok', `Removed user ${removed.email}`, req.adminUser.email);
  res.json({ ok: true });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (req.adminUser.passwordHash && !verifyPassword(currentPassword, req.adminUser.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  req.adminUser.passwordHash = hashPassword(newPassword);
  addLog('password_changed', 'auth', 'ok', 'Updated admin password', req.adminUser.email);
  res.json({ ok: true });
});

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  res.json({ logs });
});

app.post('/api/admin/logs', requireAdmin, (req, res) => {
  const { action, targetType, status, detail } = req.body || {};
  addLog(action, targetType, status, detail, req.adminUser.email);
  res.status(201).json({ ok: true });
});

app.get('/api/admin/mariadb-schema', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', 'attachment; filename="xbpo_mariadb_schema.sql"');
  }
  res.send(MARIADB_SCHEMA_SQL);
});

// Admin Portal clean route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Render public HTML pages with live site settings injected (replaces render.php)
function renderPublicPage(fileName, res) {
  const fullPath = path.join(__dirname, fileName);
  fs.readFile(fullPath, 'utf8', (err, html) => {
    if (err) {
      return res.status(404).send('Page not found.');
    }
    let out = html
      .replaceAll(DEFAULT_SETTINGS.instagramUrl, escapeHtml(siteSettings.instagramUrl))
      .replaceAll(DEFAULT_SETTINGS.facebookUrl, escapeHtml(siteSettings.facebookUrl))
      .replaceAll(DEFAULT_SETTINGS.googleUrl, escapeHtml(siteSettings.googleUrl))
      .replaceAll(DEFAULT_SETTINGS.contactEmail, escapeHtml(siteSettings.contactEmail))
      .replaceAll(DEFAULT_SETTINGS.contactPhone, escapeHtml(siteSettings.contactPhone));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out);
  });
}

app.get('/', (req, res) => renderPublicPage('index.html', res));

app.get('/:page', (req, res, next) => {
  const slug = req.params.page;
  if (!/^[a-z0-9-]+$/i.test(slug)) return next();
  const candidate = `${slug}.html`;
  if (!PUBLIC_PAGES.has(candidate)) return next();
  renderPublicPage(candidate, res);
});

// Static assets
app.use(express.static(__dirname, { index: false }));

app.use((req, res) => {
  res.status(404).send('Not found.');
});

app.listen(PORT, HOST, () => {
  console.log(`XBPO Communications server listening on http://${HOST}:${PORT}`);
});
