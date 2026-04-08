/**
 * Real Email Service
 *
 * Combines SQLite email storage with:
 *   - SMTP outbound via Nodemailer (when configured)
 *   - IMAP inbound polling via ImapFlow (when configured)
 *   - Falls back to SQLite-only mode when no mail server is configured
 */

const db = require('../config/db');
const notificationService = require('./notifications');

// ─── Lazy-load mail dependencies (optional) ──────────────────────

let nodemailer = null;
let ImapFlow = null;
let simpleParser = null;

try { nodemailer = require('nodemailer'); } catch {}
try { ImapFlow = require('imapflow').ImapFlow; } catch {}
try { simpleParser = require('mailparser').simpleParser; } catch {}

// ─── SMTP Transport ──────────────────────────────────────────────

let smtpTransport = null;

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  if (!nodemailer || !process.env.SMTP_HOST) return null;

  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true = 465, false = other
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,        // Use connection pool
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
  });

  console.log(`📧 SMTP transport configured: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  return smtpTransport;
}

// ─── IMAP Poller ─────────────────────────────────────────────────

let imapClient = null;
let imapPollInterval = null;

function startImapPolling() {
  if (!ImapFlow || !process.env.IMAP_HOST) {
    console.log('📧 IMAP not configured, skipping inbound polling');
    return;
  }

  if (imapPollInterval) return;

  const pollIntervalMs = parseInt(process.env.IMAP_POLL_INTERVAL_MS || '60000'); // Default: 1 min

  console.log(`📧 IMAP polling started: ${process.env.IMAP_HOST} (every ${pollIntervalMs / 1000}s)`);

  imapClient = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: process.env.IMAP_SECURE !== 'false', // Default: true (993)
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
  });

  // Initial fetch + periodic polling
  fetchNewEmails().catch(err => console.error('📧 IMAP initial fetch failed:', err.message));
  imapPollInterval = setInterval(() => {
    fetchNewEmails().catch(err => console.error('📧 IMAP fetch failed:', err.message));
  }, pollIntervalMs);
}

function stopImapPolling() {
  if (imapPollInterval) {
    clearInterval(imapPollInterval);
    imapPollInterval = null;
  }
  if (imapClient) {
    imapClient.logout().catch(() => {});
    imapClient = null;
  }
}

async function fetchNewEmails() {
  if (!imapClient) return;

  try {
    await imapClient.connect();
    const lock = await imapClient.getMailboxLock('INBOX');

    try {
      // Get highest UID we've seen
      const lastEmail = db.prepare(
        "SELECT MAX(uid) as max_uid FROM emails WHERE uid IS NOT NULL"
      ).get();
      const lastUid = lastEmail?.max_uid || 0;

      // Fetch messages newer than last seen
      for await (const message of imapClient.fetch(`${lastUid + 1}:*`, {
        envelope: true,
        source: true,
        uid: true,
      })) {
        try {
          const parsed = await simpleParser(message.source);

          // Check if we already have this message
          if (parsed.messageId) {
            const existing = db.prepare('SELECT id FROM emails WHERE message_id = ?').get(parsed.messageId);
            if (existing) continue;
          }

          const result = db.prepare(`
            INSERT INTO emails (from_addr, to_addr, subject, body, folder, uid, message_id, date)
            VALUES (?, ?, ?, ?, 'inbox', ?, ?, ?)
          `).run(
            parsed.from?.text || '',
            parsed.to?.text || '',
            parsed.subject || '(no subject)',
            parsed.text || parsed.html || '',
            message.uid,
            parsed.messageId || null,
            parsed.date?.toISOString() || new Date().toISOString(),
          );

          // Notify all admin users about new email
          const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
          for (const admin of admins) {
            notificationService.notify({
              userId: admin.id,
              type: 'system',
              title: 'New email received',
              body: `From: ${parsed.from?.text} — ${parsed.subject}`,
              link: '/email',
              data: { emailId: result.lastInsertRowid },
            });
          }

          console.log(`📧 Fetched: ${parsed.subject}`);
        } catch (parseErr) {
          console.error('📧 Failed to parse message:', parseErr.message);
        }
      }

    } finally {
      lock.release();
    }

    await imapClient.logout();
  } catch (err) {
    console.error('📧 IMAP error:', err.message);
    // Reset client so next poll creates a fresh connection
    try { await imapClient.logout(); } catch {}
    imapClient = null;
  }
}

// ─── Core Email Functions ────────────────────────────────────────

function seedEmails() {
  const count = db.prepare('SELECT COUNT(*) as c FROM emails').get().c;
  if (count > 0) return;

  const demoEmails = [
    {
      from_addr: 'client@acmecorp.com', to_addr: 'sales@company.com',
      subject: 'Q2 Partnership Proposal',
      body: 'Hi team,\n\nWe\'d like to discuss a potential partnership for Q2.\n\nBest regards,\nSarah Chen',
      folder: 'inbox', read: 0, starred: 1,
      labels: JSON.stringify(['sales', 'urgent']),
      date: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      from_addr: 'support@vendor.io', to_addr: 'admin@company.com',
      subject: 'Your API key has been renewed',
      body: 'Hello,\n\nYour API key has been renewed until December 2026.\n\nNo action required.',
      folder: 'inbox', read: 1, starred: 0,
      labels: JSON.stringify(['system']),
      date: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      from_addr: 'newsletter@industry.com', to_addr: 'marketing@company.com',
      subject: 'Weekly Industry Digest - AI Trends',
      body: 'This week in AI:\n\n1. New LLM benchmarks released\n2. Enterprise adoption up 40%\n3. Regulatory updates from EU',
      folder: 'inbox', read: 0, starred: 0,
      labels: JSON.stringify(['newsletter']),
      date: new Date(Date.now() - 10800000).toISOString(),
    },
  ];

  const insert = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, labels, date)
    VALUES (@from_addr, @to_addr, @subject, @body, @folder, @read, @starred, @labels, @date)
  `);

  for (const email of demoEmails) insert.run(email);
  console.log('✅ Seeded demo emails');
}

seedEmails();

function rowToEmail(row) {
  if (!row) return null;
  return {
    ...row,
    from: row.from_addr,
    to: row.to_addr,
    read: !!row.read,
    starred: !!row.starred,
    labels: JSON.parse(row.labels || '[]'),
  };
}

function getEmails(folder = 'inbox', options = {}) {
  let query = 'SELECT * FROM emails WHERE folder = ?';
  const params = [folder];

  if (options.unreadOnly) { query += ' AND read = 0'; }
  if (options.starred) { query += ' AND starred = 1'; }
  if (options.label) { query += ' AND labels LIKE ?'; params.push(`%"${options.label}"%`); }
  if (options.search) {
    query += ' AND (subject LIKE ? OR body LIKE ? OR from_addr LIKE ?)';
    const q = `%${options.search}%`;
    params.push(q, q, q);
  }

  query += ' ORDER BY date DESC';
  return db.prepare(query).all(...params).map(rowToEmail);
}

function getEmail(id) {
  return rowToEmail(db.prepare('SELECT * FROM emails WHERE id = ?').get(id));
}

function markRead(id) {
  db.prepare('UPDATE emails SET read = 1 WHERE id = ?').run(id);
  return getEmail(id);
}

function toggleStar(id) {
  db.prepare('UPDATE emails SET starred = NOT starred WHERE id = ?').run(id);
  return getEmail(id);
}

function moveToFolder(id, folder) {
  db.prepare('UPDATE emails SET folder = ? WHERE id = ?').run(folder, id);
  return getEmail(id);
}

/**
 * Send an email — uses real SMTP if configured, otherwise stores in SQLite only
 */
async function sendEmail({ to, subject, body, inReplyTo, userId }) {
  const transport = getSmtpTransport();
  let realSent = false;
  let realError = null;

  // Try real SMTP first
  if (transport) {
    try {
      const fromAddr = process.env.SMTP_FROM || 'no-reply@company-os.local';
      await transport.sendMail({
        from: fromAddr,
        to,
        subject,
        text: body || '',
      });
      realSent = true;
      console.log(`📧 Sent via SMTP: ${subject} → ${to}`);
    } catch (err) {
      realError = err.message;
      console.error(`📧 SMTP send failed, saving to DB only: ${err.message}`);
    }
  }

  // Always store in DB (sent folder)
  const result = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, in_reply_to, user_id)
    VALUES (?, ?, ?, ?, 'sent', 1, 0, ?, ?)
  `).run(
    process.env.SMTP_FROM || 'admin@company-os.local',
    to, subject, body || '', inReplyTo || null, userId || null,
  );

  const email = getEmail(result.lastInsertRowid);
  email.realSent = realSent;
  if (realError) email.smtpError = realError;

  return email;
}

function saveDraft({ to, subject, body, userId }) {
  const result = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, user_id)
    VALUES (?, ?, ?, ?, 'drafts', 1, 0, ?)
  `).run('admin@company-os.local', to || '', subject || '(no subject)', body || '', userId || null);
  return getEmail(result.lastInsertRowid);
}

function getEmailStats() {
  return {
    inbox: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox'").get().c,
    unread: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox' AND read = 0").get().c,
    sent: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'sent'").get().c,
    drafts: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'drafts'").get().c,
    starred: db.prepare("SELECT COUNT(*) as c FROM emails WHERE starred = 1").get().c,
    smtpConfigured: !!getSmtpTransport(),
    imapConfigured: !!process.env.IMAP_HOST,
  };
}

async function generateReply(emailId, instructions = '') {
  const email = getEmail(emailId);
  if (!email) throw new Error('Email not found');

  // If LLM is configured, use it for real AI-generated replies
  const { callLLM } = require('./ai-engine');
  if (process.env.LLM_API_KEY) {
    const systemPrompt = `You are a professional email assistant. Draft a concise, helpful reply. Match the tone of the original email. ${instructions ? `Additional instructions: ${instructions}` : ''}`;
    const userMessage = `Original email from ${email.from}:\nSubject: ${email.subject}\n\n${email.body}\n\nDraft a reply.`;
    return callLLM(systemPrompt, userMessage);
  }

  // Fallback template
  return `Hi,

Thank you for your email regarding "${email.subject}".

I've reviewed your message and would be happy to discuss this further. Let me check with the team and get back to you.

${instructions ? `Note: ${instructions}\n\n` : ''}Best regards,
Company OS Assistant`;
}

/**
 * Get email service health/status
 */
function getHealth() {
  return {
    smtp: getSmtpTransport() ? 'configured' : 'not configured',
    imap: process.env.IMAP_HOST ? 'configured' : 'not configured',
    imapPolling: !!imapPollInterval,
  };
}

module.exports = {
  getEmails,
  getEmail,
  markRead,
  toggleStar,
  moveToFolder,
  sendEmail,
  saveDraft,
  getEmailStats,
  generateReply,
  startImapPolling,
  stopImapPolling,
  getHealth,
};
