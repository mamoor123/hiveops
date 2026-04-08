const db = require('../config/db');
const notificationService = require('./notifications');

let nodemailer = null;
let ImapFlow = null;
let simpleParser = null;
try { nodemailer = require('nodemailer'); } catch {}
try { ImapFlow = require('imapflow').ImapFlow; } catch {}
try { simpleParser = require('mailparser').simpleParser; } catch {}

let smtpTransport = null;
let imapClient = null;
let imapPollInterval = null;

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true, maxConnections: 5, maxMessages: 100, connectionTimeout: 10_000, socketTimeout: 30_000,
  });
  console.log(`📧 SMTP transport configured: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  return smtpTransport;
}

function startImapPolling() {
  if (!ImapFlow || !process.env.IMAP_HOST) return;
  if (imapPollInterval) return;
  const pollIntervalMs = parseInt(process.env.IMAP_POLL_INTERVAL_MS || '60000');
  console.log(`📧 IMAP polling started: ${process.env.IMAP_HOST} (every ${pollIntervalMs / 1000}s)`);
  imapClient = new ImapFlow({ host: process.env.IMAP_HOST, port: parseInt(process.env.IMAP_PORT || '993'), secure: process.env.IMAP_SECURE !== 'false', auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS }, logger: false });
  fetchNewEmails().catch(err => console.error('📧 IMAP initial fetch failed:', err.message));
  imapPollInterval = setInterval(() => { fetchNewEmails().catch(err => console.error('📧 IMAP fetch failed:', err.message)); }, pollIntervalMs);
}

function stopImapPolling() {
  if (imapPollInterval) { clearInterval(imapPollInterval); imapPollInterval = null; }
  if (imapClient) { imapClient.logout().catch(() => {}); imapClient = null; }
}

async function fetchNewEmails() {
  if (!imapClient) return;
  try {
    await imapClient.connect();
    const lock = await imapClient.getMailboxLock('INBOX');
    try {
      const lastEmail = await db.prepare("SELECT MAX(uid) as max_uid FROM emails WHERE uid IS NOT NULL").get();
      const lastUid = lastEmail?.max_uid || 0;
      for await (const message of imapClient.fetch(`${lastUid + 1}:*`, { envelope: true, source: true, uid: true })) {
        try {
          const parsed = await simpleParser(message.source);
          if (parsed.messageId) { const existing = await db.prepare('SELECT id FROM emails WHERE message_id = ?').get(parsed.messageId); if (existing) continue; }
          const result = await db.prepare("INSERT INTO emails (from_addr, to_addr, subject, body, folder, uid, message_id, date) VALUES (?, ?, ?, ?, 'inbox', ?, ?, ?)").run(parsed.from?.text || '', parsed.to?.text || '', parsed.subject || '(no subject)', parsed.text || parsed.html || '', message.uid, parsed.messageId || null, parsed.date?.toISOString() || new Date().toISOString());
          const admins = await db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
          for (const admin of admins) notificationService.notify({ userId: admin.id, type: 'system', title: 'New email received', body: `From: ${parsed.from?.text} — ${parsed.subject}`, link: '/email', data: { emailId: result.lastInsertRowid } });
          console.log(`📧 Fetched: ${parsed.subject}`);
        } catch (parseErr) { console.error('📧 Failed to parse message:', parseErr.message); }
      }
    } finally { lock.release(); }
    await imapClient.logout();
  } catch (err) {
    console.error('📧 IMAP error:', err.message);
    try { await imapClient.logout(); } catch {}
    imapClient = null;
  }
}

// Seed on load — try/catch for PG compatibility
try {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM emails').get();
  const doSeed = (row) => {
    const count = row ? (row.c || row.count || 0) : 0;
    if (count > 0) return;
    const demo = [
      { from_addr: 'client@acmecorp.com', to_addr: 'sales@company.com', subject: 'Q2 Partnership Proposal', body: 'Hi team,\n\nWe\'d like to discuss a potential partnership for Q2.\n\nBest regards,\nSarah Chen', folder: 'inbox', read: false, starred: true, labels: JSON.stringify(['sales', 'urgent']), date: new Date(Date.now() - 3600000).toISOString() },
      { from_addr: 'support@vendor.io', to_addr: 'admin@company.com', subject: 'Your API key has been renewed', body: 'Your API key has been renewed until December 2026.\n\nNo action required.', folder: 'inbox', read: true, starred: false, labels: JSON.stringify(['system']), date: new Date(Date.now() - 7200000).toISOString() },
      { from_addr: 'newsletter@industry.com', to_addr: 'marketing@company.com', subject: 'Weekly Industry Digest - AI Trends', body: 'This week in AI:\n1. New LLM benchmarks released\n2. Enterprise adoption up 40%\n3. Regulatory updates from EU', folder: 'inbox', read: false, starred: false, labels: JSON.stringify(['newsletter']), date: new Date(Date.now() - 10800000).toISOString() },
    ];
    const insert = db.prepare('INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, labels, date) VALUES (@from_addr, @to_addr, @subject, @body, @folder, @read, @starred, @labels, @date)');
    for (const email of demo) insert.run(email);
    console.log('✅ Seeded demo emails');
  };
  if (countRow && typeof countRow.then === 'function') { countRow.then(doSeed).catch(() => {}); } else { doSeed(countRow); }
} catch (e) { /* Table may not exist yet */ }

function safeJson(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
function rowToEmail(row) { if (!row) return null; return { ...row, from: row.from_addr, to: row.to_addr, read: !!row.read, starred: !!row.starred, labels: safeJson(row.labels, []) }; }

async function getEmails(folder = 'inbox', options = {}) {
  let query = 'SELECT * FROM emails WHERE folder = ?';
  const params = [folder];
  if (options.unreadOnly) query += ' AND read = false';
  if (options.starred) query += ' AND starred = true';
  if (options.label) { query += ' AND labels LIKE ?'; params.push(`%"${options.label}"%`); }
  if (options.search) { query += ' AND (subject LIKE ? OR body LIKE ? OR from_addr LIKE ?)'; const q = `%${options.search}%`; params.push(q, q, q); }
  query += ' ORDER BY date DESC';
  const rows = await db.prepare(query).all(...params);
  return rows.map(rowToEmail);
}

async function getEmail(id) { return rowToEmail(await db.prepare('SELECT * FROM emails WHERE id = ?').get(id)); }
async function markRead(id) { await db.prepare('UPDATE emails SET read = true WHERE id = ?').run(id); return getEmail(id); }
async function toggleStar(id) { await db.prepare('UPDATE emails SET starred = NOT starred WHERE id = ?').run(id); return getEmail(id); }
async function moveToFolder(id, folder) { await db.prepare('UPDATE emails SET folder = ? WHERE id = ?').run(folder, id); return getEmail(id); }

async function sendEmail({ to, subject, body, inReplyTo, userId }) {
  const transport = getSmtpTransport();
  let realSent = false, realError = null;
  if (transport) {
    try { await transport.sendMail({ from: process.env.SMTP_FROM || 'no-reply@hiveops.local', to, subject, text: body || '' }); realSent = true; console.log(`📧 Sent via SMTP: ${subject} → ${to}`); }
    catch (err) { realError = err.message; console.error(`📧 SMTP send failed, saving to DB only: ${err.message}`); }
  }
  const result = await db.prepare("INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, in_reply_to, user_id) VALUES (?, ?, ?, ?, 'sent', true, false, ?, ?)").run(process.env.SMTP_FROM || 'admin@hiveops.local', to, subject, body || '', inReplyTo || null, userId || null);
  const email = await getEmail(result.lastInsertRowid);
  email.realSent = realSent;
  if (realError) email.smtpError = realError;
  return email;
}

async function saveDraft({ to, subject, body, userId }) {
  const result = await db.prepare("INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, user_id) VALUES (?, ?, ?, ?, 'drafts', true, false, ?)").run('admin@hiveops.local', to || '', subject || '(no subject)', body || '', userId || null);
  return getEmail(result.lastInsertRowid);
}

async function getEmailStats() {
  const inboxRow = await db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox'").get();
  const unreadRow = await db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox' AND read = false").get();
  const sentRow = await db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'sent'").get();
  const draftsRow = await db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'drafts'").get();
  const starredRow = await db.prepare("SELECT COUNT(*) as c FROM emails WHERE starred = true").get();
  return {
    inbox: inboxRow ? (inboxRow.c || inboxRow.count || 0) : 0,
    unread: unreadRow ? (unreadRow.c || unreadRow.count || 0) : 0,
    sent: sentRow ? (sentRow.c || sentRow.count || 0) : 0,
    drafts: draftsRow ? (draftsRow.c || draftsRow.count || 0) : 0,
    starred: starredRow ? (starredRow.c || starredRow.count || 0) : 0,
    smtpConfigured: !!getSmtpTransport(), imapConfigured: !!process.env.IMAP_HOST,
  };
}

async function generateReply(emailId, instructions = '') {
  const email = await getEmail(emailId);
  if (!email) throw new Error('Email not found');
  if (process.env.LLM_API_KEY) {
    const { callLLM } = require('./ai-engine');
    return callLLM(`You are a professional email assistant. Draft a concise, helpful reply. ${instructions ? `Additional instructions: ${instructions}` : ''}`, `Original email from ${email.from}:\nSubject: ${email.subject}\n\n${email.body}\n\nDraft a reply.`);
  }
  return `Hi,\n\nThank you for your email regarding "${email.subject}".\n\nI've reviewed your message and would be happy to discuss this further.\n\n${instructions ? `Note: ${instructions}\n\n` : ''}Best regards,\nHiveOps Assistant`;
}

function getHealth() { return { smtp: getSmtpTransport() ? 'configured' : 'not configured', imap: process.env.IMAP_HOST ? 'configured' : 'not configured', imapPolling: !!imapPollInterval }; }

module.exports = { getEmails, getEmail, markRead, toggleStar, moveToFolder, sendEmail, saveDraft, getEmailStats, generateReply, startImapPolling, stopImapPolling, getHealth };
