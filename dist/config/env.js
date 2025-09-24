"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
exports.readSecretFile = readSecretFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load .env from project root (dev) then overlay system env file if present
(() => {
    try {
        dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env') });
    }
    catch { }
    try {
        const systemEnv = '/etc/chatorical/support-chat-v2.env';
        if (fs_1.default.existsSync(systemEnv)) {
            dotenv_1.default.config({ path: systemEnv });
        }
    }
    catch { }
})();
function readSecretFile(filePathEnvName, fallbackEnvName, defaultPath) {
    const p = process.env[filePathEnvName];
    if (p && typeof p === 'string') {
        try {
            return fs_1.default.readFileSync(p, 'utf8').trim();
        }
        catch { }
    }
    if (defaultPath && fs_1.default.existsSync(defaultPath)) {
        try {
            return fs_1.default.readFileSync(defaultPath, 'utf8').trim();
        }
        catch { }
    }
    if (fallbackEnvName) {
        const v = process.env[fallbackEnvName];
        if (v && typeof v === 'string' && v.trim().length > 0)
            return v;
    }
    return undefined;
}
exports.CONFIG = {
    port: Number(process.env.PORT || 4012),
    bindHost: String(process.env.BIND_HOST || '127.0.0.1'),
    nodeEnv: String(process.env.NODE_ENV || 'development'),
    publicOrigin: String(process.env.PUBLIC_ORIGIN || ''),
    allowedOrigins: String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    redisUrl: String(process.env.REDIS_URL || 'redis://127.0.0.1:6379/3'),
    redisKeyPrefix: String(process.env.REDIS_KEY_PREFIX || 'scv2:'),
    featureRedisPubSub: String(process.env.FEATURE_REDIS_PUBSUB || 'true').toLowerCase() === 'true',
    featureTenantEnforced: String(process.env.FEATURE_TENANT_CONTEXT_ENFORCED || 'false').toLowerCase() === 'true',
    logPretty: String(process.env.LOG_PRETTY || 'true').toLowerCase() === 'true',
    logLevel: String(process.env.LOG_LEVEL || 'info'),
    s2sToken: readSecretFile('S2S_TOKEN_FILE', 'SERVICE_TOKEN', '/etc/chatorical/secrets/s2s_token'),
    jwtSecret: readSecretFile('CONVERSATION_JWT_SECRET_FILE', 'CONVERSATION_JWT_SECRET', '/etc/chatorical/secrets/conversation_jwt_secret'),
    kmsMasterKey: readSecretFile('KMS_MASTER_KEY_FILE', undefined, '/etc/chatorical/secrets/kms_master_key'),
    stripeSecretKey: readSecretFile('STRIPE_SECRET_KEY_FILE', 'STRIPE_SECRET_KEY'),
    stripePublishableKey: String(process.env.STRIPE_PUBLISHABLE_KEY || ''),
    stripeWebhookSecret: readSecretFile('STRIPE_WEBHOOK_SECRET_FILE', 'STRIPE_WEBHOOK_SECRET'),
};
