const express = require("express");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const workflowService = require("../services/workflows");

const router = express.Router();

// List workflows
router.get("/", authMiddleware, async (_req, res) => {
	try {
		res.json(await workflowService.getWorkflows());
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get stats
router.get("/stats", authMiddleware, async (_req, res) => {
	try {
		res.json(await workflowService.getWorkflowStats());
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get execution log
router.get("/log", authMiddleware, async (req, res) => {
	try {
		const limit = parseInt(req.query.limit, 10) || 20;
		res.json(await workflowService.getExecutionLog(limit));
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Create workflow
router.post("/", authMiddleware, adminOnly, async (req, res) => {
	try {
		const { name, trigger } = req.body;
		if (!name || !trigger)
			return res.status(400).json({ error: "Name and trigger required" });
		const wf = await workflowService.createWorkflow(req.body, req.user.id);
		res.status(201).json(wf);
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Update workflow
router.put("/:id", authMiddleware, adminOnly, async (req, res) => {
	try {
		const wf = await workflowService.updateWorkflow(req.params.id, req.body);
		if (!wf) return res.status(404).json({ error: "Workflow not found" });
		res.json(wf);
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Toggle workflow
router.post("/:id/toggle", authMiddleware, adminOnly, async (req, res) => {
	try {
		const wf = await workflowService.toggleWorkflow(req.params.id);
		res.json(wf);
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Delete workflow
router.delete("/:id", authMiddleware, adminOnly, async (req, res) => {
	try {
		await workflowService.deleteWorkflow(req.params.id);
		res.json({ success: true });
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Manually trigger a workflow
router.post("/trigger/:trigger", authMiddleware, async (req, res) => {
	try {
		const ALLOWED_TRIGGERS = [
			"task_created",
			"task_completed",
			"task_updated",
			"user_registered",
			"schedule_daily",
		];
		if (!ALLOWED_TRIGGERS.includes(req.params.trigger)) {
			return res.status(400).json({
				error: `Unknown trigger: ${req.params.trigger}. Allowed: ${ALLOWED_TRIGGERS.join(", ")}`,
			});
		}
		const results = await workflowService.processTrigger(
			req.params.trigger,
			req.body.context || {},
		);
		res.json({ triggered: results.length, results });
	} catch (_err) {
		res.status(500).json({ error: "Internal server error" });
	}
});

module.exports = router;
