"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../config/env");
function getPrettyTransport() {
    if (!(env_1.CONFIG.logPretty && env_1.CONFIG.nodeEnv !== 'production'))
        return undefined;
    try {
        // Only enable pretty transport if module is present
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require.resolve('pino-pretty');
        return { target: 'pino-pretty' };
    }
    catch {
        return undefined;
    }
}
exports.logger = (0, pino_1.default)({
    level: env_1.CONFIG.logLevel,
    transport: getPrettyTransport(),
    base: undefined,
});
