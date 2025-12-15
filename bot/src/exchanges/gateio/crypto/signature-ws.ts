const { createHmac } = require("crypto");

/**
 * Конфигурация для WebSocket подписи
 */
export interface WsSignatureConfig {
  apiSecret: string;
}

/**
 * Параметры для WebSocket аутентификации
 */
export interface WsAuthParams {
  channel?: string;
  event?: string;
  timestamp?: number;
}

/**
 * Результат WebSocket аутентификации
 */
export interface WsAuthResult {
  method: "api_key";
  KEY: string;
  SIGN: string;
  Timestamp: string;
}

/**
 * Класс для создания подписей Gate.io WebSocket
 */
export class GateIOWsSignature {
  private apiSecret: string;

  constructor(config: WsSignatureConfig) {
    this.apiSecret = config.apiSecret;
  }

  /**
   * Генерация подписи для WebSocket аутентификации
   * Формат: timestamp\nchannel\nevent\n
   */
  generateWsAuth(apiKey: string, params: WsAuthParams = {}): WsAuthResult {
    const {
      channel = "",
      event = "",
      timestamp = Math.floor(Date.now() / 1000),
    } = params;

    // 1. Создаем payload для подписи
    const payload = `${timestamp}\n${channel}\n${event}\n`;

    // 2. Генерируем HMAC подпись
    const signature = createHmac("sha512", this.apiSecret)
      .update(payload)
      .digest("hex");

    // 3. Формируем объект аутентификации
    return {
      method: "api_key",
      KEY: apiKey,
      SIGN: signature,
      Timestamp: timestamp.toString(),
    };
  }

  /**
   * Быстрая аутентификация для подписки на каналы
   */
  authForChannel(
    apiKey: string,
    channel: string,
    event: string = "subscribe"
  ): WsAuthResult {
    return this.generateWsAuth(apiKey, { channel, event });
  }

  /**
   * Общая аутентификация (без конкретного канала)
   */
  generalAuth(apiKey: string): WsAuthResult {
    return this.generateWsAuth(apiKey);
  }
}

export default GateIOWsSignature;
