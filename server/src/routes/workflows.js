/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const workflowService = require('../services/workflows');

const router = express.Router();

// List workflows
router.get('/', authMiddleware, async (req, res) => {
  res.json(await workflowService.getWorkflows());
});

// Get stats
router.get('/stats', authMiddleware, async (req, res) => {
  res.json(await workflowService.getWorkflowStats());
});

// Get execution log
router.get('/log', authMiddleware, async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(await workflowService.getExecutionLog(limit));
});

// Create workflow
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { name, trigger } = req.body;
  if (!name || !trigger) return res.status(400).json({ error: 'Name and trigger required' });
  const wf = await workflowService.createWorkflow(req.body, req.user.id);
  res.status(201).json(wf);
});

// Update workflow
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const wf = await workflowService.updateWorkflow(req.params.id, req.body);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });
  res.json(wf);
});

// Toggle workflow
router.post('/:id/toggle', authMiddleware, adminOnly, async (req, res) => {
  const wf = await workflowService.toggleWorkflow(req.params.id);
  res.json(wf);
});

// Delete workflow
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  await workflowService.deleteWorkflow(req.params.id);
  res.json({ success: true });
});

// Manually trigger a workflow
router.post('/trigger/:trigger', authMiddleware, async (req, res) => {
  const results = await workflowService.processTrigger(req.params.trigger, req.body.context || {});
  res.json({ triggered: results.length, results });
});

module.exports = router;
