"use strict";

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const SiteContent = require("../models/SiteContent");
const keys = require("../utils/contentKeys");

const VERSION = () => Date.now();

function publicPayload(docs) {
  const values = {};
  const originals = {};
  const history = {};
  docs.forEach((doc) => {
    values[doc.key] = doc.value;
    const meta = keys.info(doc.key);
    if (meta) originals[doc.key] = meta.original || "";
    history[doc.key] = (doc.history || []).map((item) => item.value);
  });
  return { version: VERSION(), values, originals, history };
}

const list = asyncHandler(async (_req, res) => {
  const docs = await SiteContent.find({ value: { $ne: null } }).lean();
  res.setHeader("Cache-Control", "no-store");
  return sendSuccess(res, publicPayload(docs));
});

function validateChanges(changes) {
  if (!Array.isArray(changes)) throw ApiError.badRequest("Invalid request.", "BAD_CHANGES");
  if (changes.length > keys.batchLimit()) {
    throw ApiError.badRequest("Too many changes at once.", "BATCH_TOO_LARGE");
  }
  return changes.map((change) => {
    if (!change || !keys.isValidKey(change.key)) {
      throw ApiError.badRequest("Invalid content key.", "BAD_KEY");
    }
    const meta = keys.info(change.key);
    const value = keys.sanitize(change.value, Boolean(meta && meta.multiline));
    return { key: change.key, value, meta };
  });
}

const update = asyncHandler(async (req, res) => {
  const changes = validateChanges((req.body || {}).changes);
  const updatedBy = String(configEmail(req)).slice(0, 254);
  const limit = keys.historyLimit();

  for (const change of changes) {
    const doc = await SiteContent.findOne({ key: change.key });
    if (!doc && change.value === null) continue;
    if (!doc) {
      await SiteContent.create({
        key: change.key,
        value: change.value,
        page: (change.meta && change.meta.page) || "",
        multiline: Boolean(change.meta && change.meta.multiline),
        updatedAt: new Date(),
        updatedBy
      });
      continue;
    }
    if (doc.value !== null && doc.value !== change.value) {
      doc.history.push({ value: doc.value, updatedAt: doc.updatedAt || new Date(), updatedBy: doc.updatedBy || "" });
      if (doc.history.length > limit) doc.history.splice(0, doc.history.length - limit);
    }
    doc.value = change.value;
    doc.updatedAt = new Date();
    doc.updatedBy = updatedBy;
    if (change.meta) doc.page = change.meta.page || doc.page;
    await doc.save();
  }

  return sendSuccess(res, { version: VERSION(), saved: changes.length });
});

function configEmail(req) {
  return req && req.adminEmail ? req.adminEmail : "admin";
}

const reset = asyncHandler(async (req, res) => {
  const changes = validateChanges([{ key: (req.body || {}).key, value: null }]);
  const change = changes[0];
  const doc = await SiteContent.findOne({ key: change.key });
  if (doc && doc.value !== null) {
    doc.history.push({ value: doc.value, updatedAt: doc.updatedAt || new Date(), updatedBy: doc.updatedBy || "" });
    if (doc.history.length > keys.historyLimit()) {
      doc.history.splice(0, doc.history.length - keys.historyLimit());
    }
    doc.value = null;
    doc.updatedAt = new Date();
    doc.updatedBy = configEmail(req);
    await doc.save();
  }
  return sendSuccess(res, { version: VERSION(), reset: change.key });
});

const resetAll = asyncHandler(async (req, res) => {
  if (!(req.body || {}).confirm) throw ApiError.badRequest("Confirmation required.", "CONFIRM_REQUIRED");
  const docs = await SiteContent.find({ value: { $ne: null } });
  const limit = keys.historyLimit();
  for (const doc of docs) {
    doc.history.push({ value: doc.value, updatedAt: doc.updatedAt || new Date(), updatedBy: doc.updatedBy || "" });
    if (doc.history.length > limit) doc.history.splice(0, doc.history.length - limit);
    doc.value = null;
    doc.updatedAt = new Date();
    doc.updatedBy = configEmail(req);
    await doc.save();
  }
  return sendSuccess(res, { version: VERSION(), reset: docs.length });
});

const history = asyncHandler(async (req, res) => {
  const key = String((req.query || {}).key || "");
  if (!keys.isValidKey(key)) throw ApiError.badRequest("Invalid content key.", "BAD_KEY");
  const doc = await SiteContent.findOne({ key: key }).lean();
  const meta = keys.info(key);
  return sendSuccess(res, {
    key,
    original: meta ? meta.original || "" : "",
    versions: doc ? (doc.history || []).slice(-keys.historyLimit()) : []
  });
});

const exportContent = asyncHandler(async (_req, res) => {
  const docs = await SiteContent.find({ value: { $ne: null } }).lean();
  const payload = {
    version: VERSION(),
    exportedAt: new Date().toISOString(),
    keys: keys.knownKeys().length,
    values: {},
    originals: {},
    changes: []
  };
  docs.forEach((doc) => {
    const meta = keys.info(doc.key);
    payload.values[doc.key] = doc.value;
    payload.originals[doc.key] = meta ? meta.original || "" : "";
    payload.changes.push({
      key: doc.key,
      page: doc.page,
      original: meta ? meta.original || "" : "",
      value: doc.value
    });
  });
  return sendSuccess(res, payload);
});

module.exports = { list, update, reset, resetAll, history, exportContent };
