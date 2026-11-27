"use strict";

/**
 * Centralised, validated environment configuration.
 *
 * Every secret is read from process.env (loaded from `.env`) and is NEVER
 * hard-coded. Missing required values fail fast at boot so the server never
 * runs in a half-configured, insecure state.
 */

const path = require("path");
const dotenv = require("dotenv");

// Load `.env` from the backend root.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });


function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return String(value).trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value).trim();
}

function bool(name, fallback) {
  const v = optional(name, undefined);
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(name, fallback) {
  const v = optional(name, undefined);
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = optional("NODE_ENV", "development");
const isProd = NODE_ENV === "production";

function normalizeOrigin(value) {
  const clean = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) {
    try {
      return String(new URL(clean).origin).replace(/\/+$/, "");
    } catch (_e) {
      return clean;
    }
  }
  return clean;
}

function originsFrom(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

const defaultProdOrigins = ["https://shanzoo.com", "https://www.shanzoo.com"];
const defaultDevOrigins = [
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:5517",
  "http://127.0.0.1:5500",
  "http://localhost:5173"
];
const configuredOrigins = Array.from(
  new Set([
    ...originsFrom(optional("FRONTEND_URL", "")),
    ...originsFrom(optional("ALLOWED_ORIGINS", ""))
  ])
);
const allowedOrigins = Array.from(
  new Set(
    configuredOrigins.length
      ? [...configuredOrigins, ...(isProd ? [] : defaultDevOrigins)]
      : [...defaultProdOrigins, ...(isProd ? [] : defaultDevOrigins)]
  )
);


const config = {
  env: NODE_ENV,
  isProd,
  port: int("PORT", 3000),
  frontendUrl: allowedOrigins[0],
  allowedOrigins,
  trustProxy: bool("TRUST_PROXY", isProd || Boolean(process.env.VERCEL)),


  db: {
    uri: required("MONGODB_URI"),
    name: optional("DB_NAME", "shanzoo")
  },

  secrets: {
    session: required("SESSION_SECRET"),
    otpPepper: optional("OTP_PEPPER", required("SESSION_SECRET"))
  },

  // Edit Mode credentials are server-only. A bcrypt hash is required at boot
  // so the editor can never silently run with a missing/placeholder password.
  admin: {
    email: required("ADMIN_EMAIL"),
    passwordHash: required("ADMIN_PASSWORD_HASH"),
    cookieName: "shanzoo.admin.sid",
    csrfCookieName: "shanzoo.admin.csrf"
  },

  session: {
    ttlDays: int("SESSION_TTL_DAYS", 3),
    cookieName: "shanzoo.sid",
    csrfCookieName: "shanzoo.csrf"
  },

  otp: {
    ttlMinutes: int("OTP_TTL_MINUTES", 2),
    maxAttempts: int("OTP_MAX_ATTEMPTS", 5),
    resendCooldownSeconds: int("OTP_RESEND_COOLDOWN_SECONDS", 60)
  },

  content: {
    historyLimit: int("SITE_CONTENT_HISTORY_LIMIT", 10),
    maxBatch: int("SITE_CONTENT_MAX_BATCH", 200)
  },

  mail: {
    transport: optional("MAIL_TRANSPORT", "auto").toLowerCase(),
    resendApiKey: optional("RESEND_API_KEY", ""),
    resendFrom: optional("RESEND_FROM_EMAIL", ""),
    receiverEmail: optional("CONTACT_RECEIVER_EMAIL", "info@shanzoo.com"),
    smtp: {
      host: optional("SMTP_HOST", ""),
      port: int("SMTP_PORT", 465),
      secure: bool("SMTP_SECURE", true),
      user: optional("SMTP_USER", ""),
      pass: optional("SMTP_APP_PASSWORD", ""),
      from: optional("SMTP_FROM_EMAIL", optional("SMTP_USER", ""))
    }
  }
};

// Resolve absolute paths for the backend root and the sibling static site.
config.projectRoot = path.resolve(__dirname, "..", "..");
config.frontendRoot = path.resolve(config.projectRoot, "..", "frontend");


module.exports = config;

