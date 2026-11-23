"use strict";

const path = require("path");
const zlib = require("zlib");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

const config = require("./config/env");
const apiRouter = require("./routes");
const { attachUser } = require("./middleware/auth");
const { verifyOrigin, csrfProtection } = require("./middleware/csrf");
const { apiLimiter } = require("./middleware/rateLimiters");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

/* ------------------------------ Security --------------------------------- */

app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / non-browser requests (no Origin header).
      if (!origin) return callback(null, true);
      const clean = origin.replace(/\/$/, "");
      if (config.allowedOrigins.includes(clean)) return callback(null, true);
      // Disallowed origin: omit CORS headers (browser blocks the response).
      // The request is still rejected server-side by verifyOrigin() below.
      return callback(null, false);
    },
    credentials: true
  })
);

/* --------------------------- Body / input parsing ------------------------ */

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

// Strip MongoDB operators ($ / .) from user input to prevent NoSQL injection.
app.use(mongoSanitize());
// Prevent HTTP parameter pollution.
app.use(hpp());

/* ------------------------------- API routes ------------------------------ */

app.use(
  "/api",
  attachUser,
  verifyOrigin,
  csrfProtection,
  apiLimiter,
  apiRouter
);

// Unknown API route -> JSON 404 (never falls through to static files).
app.use("/api", notFoundHandler);

/* ------------------------------ Static site ------------------------------ */

// Never serve backend source, config or tooling from the web root.
const BLOCKED = /^\/(api|server|tools|node_modules)(\/|$)|^\/(package(-lock)?\.json|\.env|\.env\.example|\.gitignore)$/i;
app.use((req, res, next) => {
  if (BLOCKED.test(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  return next();
});

const GZIPPABLE = /\.(?:html|css|js|json|svg|xml|txt|webmanifest)$/i;

app.use(function (req, res, next) {
  const wantsHtml = /\btext\/html\b/.test(req.get("accept") || "");
  if (!GZIPPABLE.test(req.path) && !wantsHtml) return next();
  if (!/\bgzip\b/.test(req.get("accept-encoding") || "")) return next();
  if (res.getHeader("Content-Encoding")) return next();

  const write = res.write;
  const end = res.end;
  const chunks = [];

  res.write = function (chunk, encoding, callback) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  };

  res.end = function (chunk, encoding, callback) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || "utf8"));
    }
    res.write = write;
    res.end = end;
    res.removeHeader("Content-Length");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    zlib.gzip(Buffer.concat(chunks), { level: 6 }, function (err, gzipped) {
      if (err) return end.call(res, Buffer.concat(chunks), callback);
      return end.call(res, gzipped, callback);
    });
  };

  return next();
});

const ROOT_INDEX = path.resolve(config.projectRoot, "..", "index.html");

app.get(["/", "/index.html"], function (req, res, next) {
  res.sendFile(ROOT_INDEX, function (err) {
    if (err) return next();
  });
});

const staticOptions = {
  index: "index.html",
  dotfiles: "deny",
  extensions: false,
  maxAge: config.isProd ? "1h" : 0,
  setHeaders(res, filePath) {
    if (config.isProd && /\.(?:css|js|png|jpe?g|webp|avif|svg|ico|woff2)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  }
};

app.use("/frontend", express.static(config.frontendRoot, staticOptions));
app.use(express.static(config.frontendRoot, staticOptions));

// Any other non-API path: static pages only (404 as HTML fallback).
app.use((req, res) => {
  res.status(404).sendFile(path.resolve(config.frontendRoot, "pages", "404.html"), (err) => {
    if (err) res.status(404).type("text/plain").send("Not found");
  });
});

/* ----------------------------- Error handling ---------------------------- */

app.use(errorHandler);

module.exports = app;
