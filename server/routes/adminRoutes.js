"use strict";

const express = require("express");
const adminController = require("../controllers/adminController");
const contentController = require("../controllers/contentController");
const { requireAdmin, adminCsrfProtection } = require("../middleware/adminAuth");
const { adminLoginLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/login", adminLoginLimiter, adminController.login);
router.get("/session", adminController.session);
router.post("/logout", adminCsrfProtection, adminController.logout);

router.put("/content", adminCsrfProtection, requireAdmin, contentController.update);
router.post("/content/reset", adminCsrfProtection, requireAdmin, contentController.reset);
router.post("/content/reset-all", adminCsrfProtection, requireAdmin, contentController.resetAll);
router.get("/content/history", requireAdmin, contentController.history);
router.get("/content/export", requireAdmin, contentController.exportContent);

module.exports = router;
