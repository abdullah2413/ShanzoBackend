"use strict";

const mongoose = require("mongoose");

const HISTORY_LIMIT = 10;

/**
 * `value: null` means "no override" — the original source text is shown.
 * Keeping the document with a null value preserves its rollback history.
 */
const siteContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, default: null },
    page: { type: String, default: "", index: true },
    multiline: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: "" },
    history: [
      {
        value: { type: String, default: null },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String, default: "" }
      }
    ]
  },
  { versionKey: false }
);

siteContentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.history = (ret.history || []).slice(-HISTORY_LIMIT);
    return ret;
  }
});

module.exports = mongoose.model("SiteContent", siteContentSchema);
