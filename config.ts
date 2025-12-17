// Базовая конфигурация для всех инстансов dtrader-4
import * as dotenv from "dotenv";
import * as path from "path";

// Определяем путь к .env файлу
// Используем корень проекта (на уровень выше директории bot)

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });
console.log(rootEnvPath);

// Логируем загрузку конфигурации
console.log("📁 Загрузка конфигурации из:", rootEnvPath);
if (!process.env.GATEIO_API_KEY || !process.env.GATEIO_API_SECRET) {
  console.log(
    "⚠️  .env файл не найден или не содержит API ключей, используются значения по умолчанию"
  );
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

export interface BaseConfig {
  NODE_ENV: string;
  SERVER_PORT: number;
  WS_PORT: number;
  exchange: ExchangeConfig;
  websocket: WebSocketConfig;
  redis: RedisConfig;
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
};
