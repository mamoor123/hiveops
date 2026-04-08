const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/email');

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

// Send email
router.post('/send', authMiddleware, (req, res) => {
  const { to, subject, body, inReplyTo } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'To and subject required' });
  const email = emailService.sendEmail({ to, subject, body, inReplyTo, userId: req.user.id });
  res.status(201).json(email);
});

// Save draft
router.post('/draft', authMiddleware, (req, res) => {
  const draft = emailService.saveDraft(req.body);
  res.status(201).json(draft);
});

// AI reply draft
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
