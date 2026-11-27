"use strict";

const express = require("express");
const contentController = require("../controllers/contentController");

const router = express.Router();

router.get("/", contentController.list);

module.exports = router;
