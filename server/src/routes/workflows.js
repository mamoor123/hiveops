const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const workflowService = require('../services/workflows');

const router = express.Router();

// List workflows
router.get('/', authMiddleware, (req, res) => {
  res.json(workflowService.getWorkflows());
});

// Get stats
router.get('/stats', authMiddleware, (req, res) => {
  res.json(workflowService.getWorkflowStats());
});

// Get execution log
router.get('/log', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(workflowService.getExecutionLog(limit));
});

// Create workflow
router.post('/', authMiddleware, adminOnly, (req, res) => {
  const { name, trigger } = req.body;
  if (!name || !trigger) return res.status(400).json({ error: 'Name and trigger required' });
  const wf = workflowService.createWorkflow(req.body, req.user.id);
  res.status(201).json(wf);
});

// Update workflow
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const wf = workflowService.updateWorkflow(req.params.id, req.body);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });
  res.json(wf);
});

// Toggle workflow
router.post('/:id/toggle', authMiddleware, adminOnly, (req, res) => {
  const wf = workflowService.toggleWorkflow(req.params.id);
  res.json(wf);
});

// Delete workflow
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  workflowService.deleteWorkflow(req.params.id);
  res.json({ success: true });
});

// Manually trigger a workflow
router.post('/trigger/:trigger', authMiddleware, (req, res) => {
  const results = workflowService.processTrigger(req.params.trigger, req.body.context || {});
  res.json({ triggered: results.length, results });
});

module.exports = router;
