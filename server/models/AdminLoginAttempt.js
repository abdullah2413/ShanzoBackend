"use strict";

const mongoose = require("mongoose");

/** DB-backed failed-login counter so lockouts survive restarts/instances. */
const adminLoginAttemptSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, unique: true, index: true },
    failures: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false }
);

adminLoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminLoginAttempt", adminLoginAttemptSchema);
