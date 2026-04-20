/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");
const { validateBody, sanitizeBody } = require("../middleware/validate");
const { rateLimiter } = require("../middleware/rateLimit");

const router = express.Router();
const authRateLimit = rateLimiter({
	windowMs: 15 * 60 * 1000,
	maxAttempts: 20,
});

// Register
router.post(
	"/register",
	authRateLimit,
	sanitizeBody(["email", "name"]),
	validateBody(["email", "password", "name"]),
	async (req, res) => {
		try {
			const { email, password, name, role } = req.body;
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
				return res.status(400).json({ error: "Invalid email format" });
			if (password.length < 8)
				return res
					.status(400)
					.json({ error: "Password must be at least 8 characters" });

			const existing = await db
				.prepare("SELECT id FROM users WHERE email = ?")
				.get(email);
			if (existing)
				return res.status(409).json({ error: "Email already registered" });

			const password_hash = bcrypt.hashSync(password, 10);
			const userRole = role || "member";
			const result = await db
				.prepare(
					"INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
				)
				.run(email, password_hash, name, userRole);

			const token = jwt.sign(
				{ id: result.lastInsertRowid, email, name, role: userRole },
				JWT_SECRET,
				{ algorithm: "HS256", expiresIn: "7d" },
			);
			res.status(201).json({
				token,
				user: { id: result.lastInsertRowid, email, name, role: userRole },
			});
		} catch (_err) {
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// Login
router.post(
	"/login",
	authRateLimit,
	sanitizeBody(["email"]),
	validateBody(["email", "password"]),
	async (req, res) => {
		try {
			const { email, password } = req.body;
			const user = await db
				.prepare("SELECT * FROM users WHERE email = ?")
				.get(email);
			if (!user || !bcrypt.compareSync(password, user.password_hash))
				return res.status(401).json({ error: "Invalid credentials" });

			const token = jwt.sign(
				{ id: user.id, email: user.email, name: user.name, role: user.role },
				JWT_SECRET,
				{ algorithm: "HS256", expiresIn: "7d" },
			);
			res.json({
				token,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
					department_id: user.department_id,
				},
			});
		} catch (_err) {
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// Get current user
router.get("/me", authMiddleware, async (req, res) => {
	const user = await db
		.prepare(
			"SELECT id, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ?",
		)
		.get(req.user.id);
	if (!user) return res.status(404).json({ error: "User not found" });
	res.json(user);
});

// List users
router.get("/", authMiddleware, async (_req, res) => {
	const users = await db
		.prepare(
			"SELECT id, email, name, role, department_id, avatar_url, created_at FROM users",
		)
		.all();
	res.json(users);
});

// Update profile
router.put(
	"/profile",
	authMiddleware,
	sanitizeBody(["name"]),
	async (req, res) => {
		try {
			const { name, department_id, avatar_url } = req.body;
			const updates = [];
			const params = [];
			if (name !== undefined) {
				updates.push("name = ?");
				params.push(name);
			}
			if (department_id !== undefined) {
				updates.push("department_id = ?");
				params.push(department_id || null);
			}
			if (avatar_url !== undefined) {
				updates.push("avatar_url = ?");
				params.push(avatar_url);
			}
			if (updates.length === 0)
				return res.status(400).json({ error: "No fields to update" });
			updates.push("updated_at = CURRENT_TIMESTAMP");
			params.push(req.user.id);
			await db
				.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
				.run(...params);
			const user = await db
				.prepare(
					"SELECT id, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ?",
				)
				.get(req.user.id);
			res.json(user);
		} catch (_err) {
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// Change password
router.post(
	"/change-password",
	authMiddleware,
	validateBody(["current_password", "new_password"]),
	async (req, res) => {
		try {
			const { current_password, new_password } = req.body;
			if (new_password.length < 8)
				return res
					.status(400)
					.json({ error: "New password must be at least 8 characters" });
			const user = await db
				.prepare("SELECT * FROM users WHERE id = ?")
				.get(req.user.id);
			if (!bcrypt.compareSync(current_password, user.password_hash))
				return res.status(401).json({ error: "Current password is incorrect" });
			const password_hash = bcrypt.hashSync(new_password, 10);
			await db
				.prepare(
					"UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				)
				.run(password_hash, req.user.id);
			res.json({ success: true });
		} catch (_err) {
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// Update user role (admin only)
router.put("/:id/role", authMiddleware, async (req, res) => {
	if (req.user.role !== "admin")
		return res.status(403).json({ error: "Admin access required" });
	const { role } = req.body;
	if (!["admin", "manager", "member"].includes(role))
		return res.status(400).json({ error: "Invalid role" });
	await db
		.prepare(
			"UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.run(role, req.params.id);
	const user = await db
		.prepare(
			"SELECT id, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ?",
		)
		.get(req.params.id);
	res.json(user);
});

module.exports = router;
