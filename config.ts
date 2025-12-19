// Базовая конфигурация для всех инстансов dtrader-4
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// ВАЖНО: После компиляции __dirname будет указывать на bot/dist/src/config
// Нужно подняться на 4 уровня: bot/dist/src/config → bot/dist/src → bot/dist → bot → dtrader-4

const isDev = __dirname.includes("/src/config"); // true если запущен через ts-node
const isCompiled = __dirname.includes("/dist/"); // true если скомпилирован

let rootEnvPath = "";

if (isDev) {
  // Разработка: bot/src/config → bot → dtrader-4
  rootEnvPath = path.resolve(__dirname, "../../../.env");
} else if (isCompiled) {
  // Production: bot/dist/src/config → bot/dist/src → bot/dist → bot → dtrader-4
  rootEnvPath = path.resolve(__dirname, "../../../../.env");
} else {
  // Fallback
  rootEnvPath = path.resolve(__dirname, "../../../.env");
}

console.log("📁 Загрузка конфигурации из:", rootEnvPath);
console.log(
  "📂 Файл существует:",
  fs.existsSync(rootEnvPath) ? "✅ Да" : "❌ Нет"
);

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  console.log("⚠️  .env файл не найден по пути:", rootEnvPath);
  console.log("📍 __dirname:", __dirname);
  console.log("📍 isDev:", isDev);
  console.log("📍 isCompiled:", isCompiled);
}

// Логируем загрузку конфигурации
console.log(
  "🔑 GATEIO_API_KEY:",
  process.env.GATEIO_API_KEY ? "✅ Настроен" : "❌ Не настроен"
);
console.log(
  "🔑 GATEIO_API_SECRET:",
  process.env.GATEIO_API_SECRET ? "✅ Настроен" : "❌ Не настроен"
);

export interface ExchangeConfig {
  apiKey?: string;
  secret?: string;
  enabled: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
}

export interface WebSocketConfig {
  pingInterval: number;
  pingTimeout: number;
}

export interface OrderBookConfig {
  pairs: string[];
  depth: number;
  updateSpeed: string;
}

export interface BaseConfig {
  NODE_ENV: string;
  SERVER_PORT: number;
  WS_PORT: number;
  exchange: ExchangeConfig;
  websocket: WebSocketConfig;
  redis: RedisConfig;
  orderBook?: OrderBookConfig;
}

export const baseConfig: BaseConfig = {
  NODE_ENV: process.env.NODE_ENV || "development",
  SERVER_PORT: parseInt(process.env.SERVER_PORT || "1971"),
  WS_PORT: parseInt(process.env.WS_PORT || "2808"),
  exchange: {
    apiKey: process.env.GATEIO_API_KEY,
    secret: process.env.GATEIO_API_SECRET,
    enabled: !!process.env.GATEIO_API_KEY && !!process.env.GATEIO_API_SECRET,
  },
  websocket: {
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || "15000"),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || "3000"),
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  orderBook: {
    pairs: (process.env.ORDERBOOK_PAIRS || "BTC_USDT").split(","),
    depth: parseInt(process.env.ORDERBOOK_DEPTH || "20"),
    updateSpeed: process.env.ORDERBOOK_UPDATE_SPEED || "100ms",
  },
};

// Логируем конфигурацию Order Book
if (baseConfig.orderBook) {
  console.log("📊 Торговые пары:", baseConfig.orderBook.pairs.join(", "));
  console.log("📖 Order Book глубина:", baseConfig.orderBook.depth);
}

console.log("🔐 Exchange enabled:", baseConfig.exchange.enabled);
