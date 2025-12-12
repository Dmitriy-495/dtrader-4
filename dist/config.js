"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    PORT: parseInt(process.env.SERVER_PORT || '1971'),
    WS_PORT: parseInt(process.env.WS_PORT || '2808'),
    isShuttingDown: false,
    exchange: {
        apiKey: process.env.GATEIO_API_KEY,
        secret: process.env.GATEIO_API_SECRET,
        enabled: !!process.env.GATEIO_API_KEY && !!process.env.GATEIO_API_SECRET
    }
};
//# sourceMappingURL=config.js.map