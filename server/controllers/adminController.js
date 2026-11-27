"use strict";

const config = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { sha256, safeEqual, verifyPassword, fakeVerifyPassword } = require("../utils/security");
const adminSessionService = require("../services/adminSessionService");
const AdminLoginAttempt = require("../models/AdminLoginAttempt");
const AdminSession = require("../models/AdminSession");

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const GENERIC = "Sign-in was not successful. Please try again.";

function scopeOf(req) {
  const email = req.body && typeof req.body.email === "string"
    ? req.body.email.trim().toLowerCase().slice(0, 254)
    : "";
  return sha256(String(req.ip || "").slice(0, 100) + ":" + email);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function isLocked(scope) {
  const record = await AdminLoginAttempt.findOne({ scope: scope }).catch(() => null);
  if (!record || !record.lockedUntil) return false;
  if (new Date(record.lockedUntil).getTime() > Date.now()) return true;
  await AdminLoginAttempt.deleteOne({ _id: record._id }).catch(() => {});
  return false;
}

async function failed(scope) {
  const now = new Date();
  const record = await AdminLoginAttempt.findOneAndUpdate(
    { scope: scope },
    { $inc: { failures: 1 }, $set: { expiresAt: new Date(now.getTime() + WINDOW_MS) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
  if (record && record.failures >= MAX_FAILURES) {
    await AdminLoginAttempt.updateOne(
      { _id: record._id },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), failures: 0 } }
    ).catch(() => {});
  }
}

async function succeeded(scope) {
  await AdminLoginAttempt.deleteOne({ scope: scope }).catch(() => {});
}

const login = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const scope = scopeOf(req);
  if (await isLocked(scope)) {
    return res.status(429).json({ success: false, message: GENERIC, code: "LOGIN_LOCKED" });
  }

  const emailOk = safeEqual(
    sha256(normalize(body.email)),
    sha256(normalize(config.admin.email))
  );
  const passwordOk = await verifyPassword(String(body.password || ""), config.admin.passwordHash);
  if (!emailOk) await fakeVerifyPassword(String(body.password || ""));

  if (!emailOk || !passwordOk) {
    await failed(scope);
    return res.status(401).json({ success: false, message: GENERIC, code: "LOGIN_FAILED" });
  }
  if (typeof body.password !== "string" || !body.password) {
    await failed(scope);
    return res.status(401).json({ success: false, message: GENERIC, code: "LOGIN_FAILED" });
  }

  await succeeded(scope);
  const csrfToken = await adminSessionService.createSession(req, res);
  return sendSuccess(res, { authenticated: true, csrfToken });
});

const session = asyncHandler(async (req, res) => {
  return sendSuccess(res, { authenticated: Boolean(req.adminSession) });
});

const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies && req.cookies[config.admin.cookieName];
  if (raw) await AdminSession.deleteOne({ tokenHash: sha256(raw) }).catch(() => {});
  adminSessionService.clearCookies(res);
  return sendSuccess(res, { ok: true });
});

module.exports = { login, session, logout };
