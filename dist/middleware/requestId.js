"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
const logger_1 = require("../telemetry/logger");
function requestId(req, res, next) {
    const existing = req.header('x-request-id');
    const id = existing && existing.trim() ? existing.trim() : (0, crypto_1.randomUUID)();
    req.requestId = id;
    try {
        logger_1.logger.bindings = () => ({ request_id: id });
    }
    catch { }
    res.setHeader('x-request-id', id);
    return next();
}
