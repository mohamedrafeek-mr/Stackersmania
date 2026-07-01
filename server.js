require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();

const PORT = process.env.PORT || 3000;
const CAREERS_FILE = path.join(__dirname, 'data', 'careers.json');
const APPLICATIONS_FILE = path.join(__dirname, 'data', 'applications.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- helpers: tiny JSON "database" ----------
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- mail transporter ----------
const BREVO_API_KEY = process.env.BREVO_API_KEY?.trim();
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.COMPANY_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Stackers Mania';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const useBrevo = Boolean(BREVO_API_KEY);

let transporter = null;
let brevoClient = null;
if (!BREVO_API_KEY) {
  console.warn('[mail] BREVO_API_KEY is not configured. Falling back to Gmail SMTP if available.');
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    transporter.verify((err) => {
      if (err) {
        console.warn('[mail] Gmail transporter verification failed:', err.message);
      } else {
        console.log('[mail] Gmail SMTP transporter ready.');
      }
    });
  } else {
    console.warn('[mail] No email transporter configured. Set BREVO_API_KEY or GMAIL_USER and GMAIL_APP_PASSWORD.');
  }
} else {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = BREVO_API_KEY;
  brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
  console.log('[mail] Brevo email API configured.');
}

async function sendEmail({ to, subject, text, replyTo, attachments }) {
  if (useBrevo) {
    if (!brevoClient) {
      throw new Error('Brevo client is not initialized.');
    }

    const email = {
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      textContent: text,
      replyTo: replyTo ? { email: replyTo } : undefined,
      attachment: attachments?.map(({ filename, content, contentType }) => ({
        content: content.toString('base64'),
        name: filename,
        contentType,
      })),
    };

    try {
      return await brevoClient.sendTransacEmail(email);
    } catch (err) {
      console.error('[mail] Brevo sendTransacEmail failed:', err);
      throw new Error(
        err.response && err.response.body
          ? `Brevo error: ${JSON.stringify(err.response.body)}`
          : err.message || 'Brevo send failed.'
      );
    }
  }

  if (!transporter) {
    throw new Error('Email service is not configured. Set BREVO_API_KEY in .env or provide GMAIL_USER and GMAIL_APP_PASSWORD.');
  }

  const mailOptions = {
    from: `"${BREVO_SENDER_NAME}" <${BREVO_SENDER_EMAIL}>`,
    to,
    replyTo,
    subject,
    text,
  };

  if (attachments && attachments.length) {
    mailOptions.attachments = attachments.map(({ filename, content, contentType }) => ({
      filename,
      content,
      contentType,
    }));
  }

  return transporter.sendMail(mailOptions);
}

// ---------- middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, error: 'Not authenticated.' });
}

// Resume uploads: kept in memory only long enough to email + save to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Resume must be a PDF or Word document.'));
    }
    cb(null, true);
  },
});

// ============================================================
// PUBLIC API
// ============================================================

// List active careers
app.get('/api/careers', (req, res) => {
  const careers = readJSON(CAREERS_FILE).filter((c) => c.active);
  careers.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  res.json({ ok: true, careers });
});

// Submit a job application
app.post('/api/apply', upload.single('resume'), async (req, res) => {
  try {
    const { name, email, phone, roleTitle, message } = req.body;

    if (!name || !email || !phone || !roleTitle) {
      return res.status(400).json({ ok: false, error: 'Please fill in all required fields.' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Please attach your resume (PDF or Word, max 5MB).' });
    }

    const id = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const savedFilename = `${id}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, savedFilename), req.file.buffer);

    const record = {
      id,
      name,
      email,
      phone,
      roleTitle,
      message: message || '',
      resumeFile: savedFilename,
      resumeOriginalName: req.file.originalname,
      submittedAt: new Date().toISOString(),
    };
    const applications = readJSON(APPLICATIONS_FILE);
    applications.unshift(record);
    writeJSON(APPLICATIONS_FILE, applications);

    // 1. Notify the company, with the resume attached
    await sendEmail({
      to: process.env.COMPANY_EMAIL,
      replyTo: email,
      subject: `New application: ${roleTitle} — ${name}`,
      text: [
        `New job application received via the careers page.`,
        ``,
        `Role: ${roleTitle}`,
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        ``,
        `Message:`,
        message || '(no message provided)',
      ].join('\n'),
      attachments: [
        {
          filename: req.file.originalname,
          content: req.file.buffer,
          contentType: req.file.mimetype,
        },
      ],
    });

    // 2. Auto-reply to the applicant confirming receipt
    // This is sent best-effort — if it fails, the application itself
    // has already been saved and emailed to the company above, so we
    // don't fail the whole request over a confirmation email.
    try {
      await sendEmail({
        to: email,
        replyTo: process.env.COMPANY_EMAIL,
        subject: `We've received your application — ${roleTitle}`,
        text: [
          `Hi ${name},`,
          ``,
          `Thanks for applying to the ${roleTitle} role at Stackers Mania.`,
          `We've received your application and resume, and our team will`,
          `review it shortly. If your profile is a fit, we'll reach out`,
          `to you at this email address or by phone.`,
          ``,
          `Role applied for: ${roleTitle}`,
          `Submitted: ${new Date().toLocaleString('en-IN')}`,
          ``,
          `In the meantime, feel free to reply to this email if you have`,
          `any questions.`,
          ``,
          `Best,`,
          `Stackers Mania`,
          `Erode, Tamil Nadu, India`,
        ].join('\n'),
      });
    } catch (autoReplyErr) {
      console.warn('[apply] Auto-reply to applicant failed: ' + autoReplyErr.message);
    }

    res.json({ ok: true, message: 'Application submitted successfully.' });
  } catch (err) {
    console.error('[apply] ', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong while submitting your application. Please try again.' });
  }
});

// General contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ ok: false, error: 'Please fill in all required fields.' });
    }

    await sendEmail({
      to: process.env.COMPANY_EMAIL,
      replyTo: email,
      subject: `New contact form message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}\n\nMessage:\n${message}`,
    });

    res.json({ ok: true, message: 'Message sent successfully.' });
  } catch (err) {
    console.error('[contact] ', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong sending your message. Please try again.' });
  }
});

// ============================================================
// ADMIN API
// ============================================================

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password are required.' });
  }

  const validUser = username === process.env.ADMIN_USER;
  let validPass = false;

  if (process.env.ADMIN_PASS_HASH) {
    validPass = await bcrypt.compare(password, process.env.ADMIN_PASS_HASH);
  } else if (process.env.ADMIN_PASS) {
    validPass = password === process.env.ADMIN_PASS;
  }

  if (!validUser || !validPass) {
    return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ ok: true, loggedIn: !!(req.session && req.session.isAdmin) });
});

// Careers CRUD (admin sees active + inactive)
app.get('/api/admin/careers', requireAdmin, (req, res) => {
  const careers = readJSON(CAREERS_FILE);
  careers.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  res.json({ ok: true, careers });
});

app.post('/api/admin/careers', requireAdmin, (req, res) => {
  const { title, department, location, type, description, requirements, active } = req.body;
  if (!title || !description) {
    return res.status(400).json({ ok: false, error: 'Title and description are required.' });
  }
  const careers = readJSON(CAREERS_FILE);
  const newCareer = {
    id: crypto.randomUUID(),
    title,
    department: department || 'General',
    location: location || 'Erode, Tamil Nadu (On-site)',
    type: type || 'Full-time',
    description,
    requirements: Array.isArray(requirements)
      ? requirements
      : String(requirements || '')
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean),
    active: active !== undefined ? !!active : true,
    postedAt: new Date().toISOString().slice(0, 10),
  };
  careers.push(newCareer);
  writeJSON(CAREERS_FILE, careers);
  res.json({ ok: true, career: newCareer });
});

app.put('/api/admin/careers/:id', requireAdmin, (req, res) => {
  const careers = readJSON(CAREERS_FILE);
  const idx = careers.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Career not found.' });

  const { title, department, location, type, description, requirements, active } = req.body;
  const existing = careers[idx];
  careers[idx] = {
    ...existing,
    title: title ?? existing.title,
    department: department ?? existing.department,
    location: location ?? existing.location,
    type: type ?? existing.type,
    description: description ?? existing.description,
    requirements: Array.isArray(requirements)
      ? requirements
      : requirements !== undefined
      ? String(requirements)
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean)
      : existing.requirements,
    active: active !== undefined ? !!active : existing.active,
  };
  writeJSON(CAREERS_FILE, careers);
  res.json({ ok: true, career: careers[idx] });
});

app.delete('/api/admin/careers/:id', requireAdmin, (req, res) => {
  const careers = readJSON(CAREERS_FILE);
  const filtered = careers.filter((c) => c.id !== req.params.id);
  if (filtered.length === careers.length) {
    return res.status(404).json({ ok: false, error: 'Career not found.' });
  }
  writeJSON(CAREERS_FILE, filtered);
  res.json({ ok: true });
});

// Applications (admin only)
app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const applications = readJSON(APPLICATIONS_FILE);
  res.json({ ok: true, applications });
});

app.delete('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const applications = readJSON(APPLICATIONS_FILE);
  const target = applications.find((a) => a.id === req.params.id);
  const filtered = applications.filter((a) => a.id !== req.params.id);
  if (target && target.resumeFile) {
    const filePath = path.join(UPLOADS_DIR, path.basename(target.resumeFile));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  writeJSON(APPLICATIONS_FILE, filtered);
  res.json({ ok: true });
});

// Secure resume download — never publicly listed, admin session required
app.get('/api/admin/resume/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'File not found.' });
  }
  res.download(filePath);
});

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Something went wrong.' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Stackers Mania server running at http://localhost:${PORT}`);
});
