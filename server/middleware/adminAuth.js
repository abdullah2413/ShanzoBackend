"use strict";

const config = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sha256, safeEqual } = require("../utils/security");
const adminSessionService = require("../services/adminSessionService");

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Resolves the admin session from its own cookie; never trusts client ids. */
const attachAdmin = asyncHandler(async (req, _res, next) => {
  req.adminSession = null;
  try {
    req.adminSession = await adminSessionService.resolveSession(req);
  } catch (_err) {
    req.adminSession = null;
  }
  next();
});

function requireAdmin(req, _res, next) {
  if (!req.adminSession) {
    return next(ApiError.unauthorized("Session required.", "AUTH_REQUIRED"));
  }
  req.adminEmail = config.admin.email;
  return next();
}

/**
 * Double-submit CSRF for admin writes. Login is exempt because no session
 * exists yet; origin/referer checking still applies to it globally.
 */
function adminCsrfProtection(req, _res, next) {
  if (!UNSAFE.has(req.method) || req.path === "/login") return next();

  const header = req.get("x-csrf-token");
  const cookie = req.cookies ? req.cookies[config.admin.csrfCookieName] : null;
  if (!header || !cookie || !safeEqual(header, cookie)) {
    return next(ApiError.forbidden("Invalid CSRF token.", "CSRF_FAILED"));
  }
  if (!req.adminSession || !safeEqual(sha256(header), req.adminSession.csrfHash)) {
    return next(ApiError.forbidden("Invalid CSRF token.", "CSRF_FAILED"));
  }
  return next();
}

module.exports = { attachAdmin, requireAdmin, adminCsrfProtection };
