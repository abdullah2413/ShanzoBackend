"use strict";

const app = require("./server/app");
const config = require("./server/config/env");
const { connectDatabase, disconnectDatabase } = require("./server/config/db");

async function start() {
  try {
    await connectDatabase();
  } catch (err) {
    console.error(`[startup] Could not connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`[startup] SHANZOO server listening on http://0.0.0.0:${config.port} (${config.env})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[shutdown] ${signal} received — closing gracefully.`);
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
