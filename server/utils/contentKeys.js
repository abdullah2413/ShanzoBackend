"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../config/env");

const KEY_PATTERN = /^[a-z0-9][a-z0-9._\[\]-]{2,180}$/;
const MAX_LENGTH = 4000;

const CANDIDATES = [
  process.env.CONTENT_KEYS_FILE,
  path.resolve(__dirname, "data", "edit-keys.json"),
  path.resolve(__dirname, "..", "..", "..", "frontend", "tools", "edit-keys.json")
].filter(Boolean);

let manifest = null;
for (const file of CANDIDATES) {
  try {
    if (fs.existsSync(file)) {
      manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      break;
    }
  } catch (_err) {
    /* Try the next location. */
  }
}

const byKey = {};
if (manifest && Array.isArray(manifest.keys)) {
  manifest.keys.forEach((item) => {
    if (item && typeof item.key === "string") byKey[item.key] = item;
  });
}

function knownKeys() {
  return Object.keys(byKey);
}

function info(key) {
  return byKey[key] || null;
}

function isValidKey(key) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) return false;
  return Object.keys(byKey).length === 0 ? true : Boolean(byKey[key]);
}

/** Plain text only: no tags, no angle brackets, no control characters. */
function sanitize(value, multiline) {
  if (value === null || value === undefined) return null;
  let text = String(value);
  text = text.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
  text = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  if (!multiline) text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_LENGTH);
}

function batchLimit() {
  const n = Number(config.content && config.content.maxBatch);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

function historyLimit() {
  const n = Number(config.content && config.content.historyLimit);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
}

module.exports = { knownKeys, info, isValidKey, sanitize, batchLimit, historyLimit, loaded: Boolean(manifest) };
