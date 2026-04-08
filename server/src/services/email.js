/**
 * Email Service (SQLite-backed)
 *
 * Stores emails in SQLite with demo seed data.
 * Supports reading, composing, starring, folder management, and AI draft replies.
 */

const db = require('../config/db');

/**
 * Seed demo emails if table is empty
 */
function seedEmails() {
  const count = db.prepare('SELECT COUNT(*) as c FROM emails').get().c;
  if (count > 0) return;

  const demoEmails = [
    {
      from_addr: 'client@acmecorp.com', to_addr: 'sales@company.com',
      subject: 'Q2 Partnership Proposal',
      body: 'Hi team,\n\nWe\'d like to discuss a potential partnership for Q2. Our marketing team has identified significant synergy between our products.\n\nCan we schedule a call this week?\n\nBest regards,\nSarah Chen\nVP Partnerships, Acme Corp',
      folder: 'inbox', read: 0, starred: 1,
      labels: JSON.stringify(['sales', 'urgent']),
      date: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      from_addr: 'support@vendor.io', to_addr: 'admin@company.com',
      subject: 'Your API key has been renewed',
      body: 'Hello,\n\nYour API key for vendor.io has been automatically renewed. The new key is valid until December 2026.\n\nNo action required.',
      folder: 'inbox', read: 1, starred: 0,
      labels: JSON.stringify(['system']),
      date: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      from_addr: 'newsletter@industry.com', to_addr: 'marketing@company.com',
      subject: 'Weekly Industry Digest - AI Trends',
      body: 'This week in AI:\n\n1. New LLM benchmarks released\n2. Enterprise adoption up 40%\n3. Regulatory updates from EU\n4. Open source model releases\n\nRead more at industry.com',
      folder: 'inbox', read: 0, starred: 0,
      labels: JSON.stringify(['newsletter']),
      date: new Date(Date.now() - 10800000).toISOString(),
    },
    {
      from_addr: 'hr@company.com', to_addr: 'team@company.com',
      subject: 'Team Building Event - April 15th',
      body: 'Hi everyone!\n\nWe\'re organizing a team building event on April 15th at 3pm. Activities include escape room and dinner.\n\nPlease RSVP by April 10th.\n\nHR Team',
      folder: 'inbox', read: 1, starred: 0,
      labels: JSON.stringify(['hr']),
      date: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      from_addr: 'devops@company.com', to_addr: 'engineering@company.com',
      subject: 'Server Maintenance - Tonight 2am',
      body: 'Heads up team,\n\nWe\'ll be performing scheduled maintenance on the production servers tonight from 2am to 4am UTC.\n\nExpected downtime: ~30 minutes\n\nDevOps',
      folder: 'inbox', read: 0, starred: 1,
      labels: JSON.stringify(['engineering', 'ops']),
      date: new Date(Date.now() - 172800000).toISOString(),
    },
  ];

  const insert = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, labels, date)
    VALUES (@from_addr, @to_addr, @subject, @body, @folder, @read, @starred, @labels, @date)
  `);

  for (const email of demoEmails) {
    insert.run(email);
  }
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

function sendEmail({ to, subject, body, inReplyTo, userId }) {
  const result = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, in_reply_to, user_id)
    VALUES (?, ?, ?, ?, 'sent', 1, 0, ?, ?)
  `).run('admin@company.com', to, subject, body || '', inReplyTo || null, userId || null);
  return getEmail(result.lastInsertRowid);
}

function saveDraft({ to, subject, body, userId }) {
  const result = db.prepare(`
    INSERT INTO emails (from_addr, to_addr, subject, body, folder, read, starred, user_id)
    VALUES (?, ?, ?, ?, 'drafts', 1, 0, ?)
  `).run('admin@company.com', to || '', subject || '(no subject)', body || '', userId || null);
  return getEmail(result.lastInsertRowid);
}

function getEmailStats() {
  return {
    inbox: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox'").get().c,
    unread: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'inbox' AND read = 0").get().c,
    sent: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'sent'").get().c,
    drafts: db.prepare("SELECT COUNT(*) as c FROM emails WHERE folder = 'drafts'").get().c,
    starred: db.prepare("SELECT COUNT(*) as c FROM emails WHERE starred = 1").get().c,
  };
}

async function generateReply(emailId, instructions = '') {
  const email = getEmail(emailId);
  if (!email) throw new Error('Email not found');

  return `Hi,

Thank you for your email regarding "${email.subject}".

I've reviewed your message and would be happy to discuss this further. Let me check with the team and get back to you with a detailed response by end of day.

${instructions ? `Note: ${instructions}\n\n` : ''}Please let me know if you need anything else in the meantime.

Best regards,
HiveOps Assistant`;
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
};
