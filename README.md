# Stackers Mania — Company Website

A full website for Stackers Mania: Home, Services, Work, About, Careers and
Contact, plus a small admin panel for managing career listings and viewing
applications. Career applications and the contact form are emailed straight
to your Gmail inbox.

## ⚠️ Read this first — about the credentials you shared

You pasted your Gmail app password and admin password directly into this
chat. Please treat both as **compromised** and rotate them once your site is
live, even though this project keeps them server-side only and never exposes
them to visitors:

1. **Gmail App Password** — go to your Google Account → Security →
   2-Step Verification → App passwords, delete the old one, generate a new
   16-character app password, and put it in `.env` as `GMAIL_APP_PASSWORD`.
2. **Admin password** — `rafeek.m` is short and guessable. Pick a longer,
   random one and update it (see "Changing the admin password" below).

Never commit the `.env` file to GitHub or share it — it's already listed in
`.gitignore`.

## What's included

```
stackersmania/
├── server.js              Express server: API + serves the website
├── package.json
├── .env                   Your secrets (Gmail, admin login, session key)
├── data/
│   ├── careers.json       Career listings (edited via the admin panel)
│   └── applications.json  Applications received (auto-created)
├── uploads/                Resume files (auto-created, not public)
├── scripts/
│   └── hash-password.js   Helper to generate a secure admin password hash
└── public/
    ├── index.html          Main website
    ├── admin.html          Admin panel (careers + applications)
    ├── css/                Styles
    └── js/                 Frontend scripts
```

## Running it locally

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd stackersmania
npm install
npm start
```

Then open:
- **Website:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin.html

Login with the `ADMIN_USER` / `ADMIN_PASS` values in `.env` (currently
`admin` / `rafeek.m` — please change this, see below).

## How the careers page works

1. You add/edit/hide roles from the admin panel (**Careers** tab). They're
   stored in `data/careers.json`.
2. The public Careers section on the website loads open roles automatically
   and shows an **Apply** button for each.
3. When someone applies, their details + resume are:
   - emailed to `stackersmania@gmail.com` (from `COMPANY_EMAIL` in `.env`)
     with the resume attached, and
   - saved in `data/applications.json` / `uploads/`, viewable in the admin
     panel's **Applications** tab (with a resume download link).

The general **Contact** form on the site also emails straight to
`COMPANY_EMAIL`.

## Changing the admin password (recommended)

The quick-start password lives in `.env` as plain text (`ADMIN_PASS`). For
better security, generate a hash instead:

```bash
npm run hash-password -- "YourNewStrongerPassword"
```

Copy the printed `ADMIN_PASS_HASH=...` line into `.env`, and you can clear
out `ADMIN_PASS`. The server checks the hash first if it's set.

## Deploying it

This is a small Node.js app, so it needs actual server hosting (not a
static host like plain GitHub Pages). Easy options:

- **Render / Railway / Fly.io** — connect your repo, set the same
  environment variables from `.env` in their dashboard, deploy.
- **A VPS (e.g. DigitalOcean, Hostinger VPS)** — `npm install`, then run
  with a process manager like `pm2 start server.js`, and put Nginx in front
  for HTTPS.

Wherever you deploy, set the `.env` values as environment variables in that
platform's dashboard rather than uploading the `.env` file itself.

## Editing site content

- **Text/copy** (About, Services, hero wording): edit `public/index.html` directly.
- **Colors/fonts**: edit the `:root` variables at the top of `public/css/style.css`.
- **Career listings**: use the admin panel — no code editing needed.
- **Selected Work section**: currently placeholder projects — swap in your
  real case studies in `public/index.html` under `<section id="work">` as you
  complete real projects.

## A couple of things worth knowing

- Resume files are capped at 5MB and must be PDF or Word (`.pdf`, `.doc`, `.docx`).
- Resumes are stored in `uploads/`, which is **not** publicly browsable —
  only accessible through the admin panel while logged in.
- Sessions last 8 hours, then you'll need to log in to `/admin.html` again.
