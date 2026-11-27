"use strict";

const config = require("../config/env");
const AdminSession = require("../models/AdminSession");
const { generateToken, sha256 } = require("../utils/security");

const TTL_MS = 12 * 60 * 60 * 1000;

function cookieBase() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
    path: "/"
  };
}

function setCookies(res, rawToken, csrfToken) {
  res.cookie(config.admin.cookieName || "shanzoo.admin.sid", rawToken, {
    ...cookieBase(),
    maxAge: TTL_MS
  });
  res.cookie(config.admin.csrfCookieName || "shanzoo.admin.csrf", csrfToken, {
    ...cookieBase(),
    httpOnly: false,
    maxAge: TTL_MS
  });
}

function clearCookies(res) {
  res.clearCookie(config.admin.cookieName || "shanzoo.admin.sid", cookieBase());
  res.clearCookie(config.admin.csrfCookieName || "shanzoo.admin.csrf", {
    ...cookieBase(),
    httpOnly: false
  });
}

async function createSession(req, res) {
  const rawToken = generateToken(32);
  const csrfToken = generateToken(32);
  await AdminSession.create({
    tokenHash: sha256(rawToken),
    csrfHash: sha256(csrfToken),
    userAgent: String(req.get("user-agent") || "").slice(0, 400),
    ip: String(req.ip || "").slice(0, 100),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + TTL_MS)
  });
  setCookies(res, rawToken, csrfToken);
  return csrfToken;
}

async function resolveSession(req) {
  const raw = req.cookies && req.cookies[config.admin.cookieName || "shanzoo.admin.sid"];
  if (!raw) return null;
  const session = await AdminSession.findOne({ tokenHash: sha256(raw) });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await AdminSession.deleteOne({ _id: session._id }).catch(() => {});
    return null;
  }
  return session;
}

module.exports = { createSession, resolveSession, clearCookies };
