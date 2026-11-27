"use strict";

const mongoose = require("mongoose");

/** Short-lived admin session; completely separate from customer sessions. */
const adminSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    csrfHash: { type: String, required: true },
    userAgent: { type: String, default: "", maxlength: 400 },
    ip: { type: String, default: "", maxlength: 100 },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false }
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminSession", adminSessionSchema);
