const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/email-real');

const router = express.Router();

// Get emails by folder
router.get('/:folder', authMiddleware, (req, res) => {
  const { unread, starred, label, search } = req.query;
  const emails = emailService.getEmails(req.params.folder, {
    unreadOnly: unread === 'true',
    starred: starred === 'true',
    label,
    search,
  });
  res.json(emails);
});

// Get stats
router.get('/meta/stats', authMiddleware, (req, res) => {
  res.json(emailService.getEmailStats());
});

// Get email health
router.get('/meta/health', authMiddleware, (req, res) => {
  res.json(emailService.getHealth());
});

// Get single email
router.get('/item/:id', authMiddleware, (req, res) => {
  const email = emailService.getEmail(req.params.id);
  if (!email) return res.status(404).json({ error: 'Email not found' });
  emailService.markRead(req.params.id);
  res.json(email);
});

// Mark as read
router.post('/:id/read', authMiddleware, (req, res) => {
  const email = emailService.markRead(req.params.id);
  res.json(email);
});

// Toggle star
router.post('/:id/star', authMiddleware, (req, res) => {
  const email = emailService.toggleStar(req.params.id);
  res.json(email);
});

// Move to folder
router.post('/:id/move', authMiddleware, (req, res) => {
  const { folder } = req.body;
  const email = emailService.moveToFolder(req.params.id, folder);
  res.json(email);
});

// Send email (async — may use real SMTP)
router.post('/send', authMiddleware, async (req, res) => {
  const { to, subject, body, inReplyTo } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'To and subject required' });
  try {
    const email = await emailService.sendEmail({ to, subject, body, inReplyTo, userId: req.user.id });
    res.status(201).json(email);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save draft
router.post('/draft', authMiddleware, (req, res) => {
  const draft = emailService.saveDraft(req.body);
  res.status(201).json(draft);
});

// AI reply draft (async — may use LLM)
router.post('/:id/draft-reply', authMiddleware, async (req, res) => {
  try {
    const { instructions } = req.body;
    const reply = await emailService.generateReply(req.params.id, instructions);
    res.json({ reply });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
