"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
let singleton = null;
function getRedis() {
    const injected = globalThis.__redis;
    if (injected)
        return injected;
    if (singleton)
        return singleton;
    singleton = new ioredis_1.default(env_1.CONFIG.redisUrl);
    return singleton;
}
