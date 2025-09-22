"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
function requestId(req, res, next) {
    const existing = req.header('x-request-id');
    const id = existing && existing.trim() ? existing.trim() : (0, crypto_1.randomUUID)();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    return next();
}
