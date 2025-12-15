// Модуль для работы с балансом Gate.io на основе рабочего модуля подписи
const axios = require("axios");
const { createGateIOSignature } = require("../crypto/signature");

/**
 * Интерфейс для конфигурации API Gate.io
 */
export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

/**
 * Интерфейс для информации о балансе валюты
 */
export interface CurrencyBalance {
  currency: string; // Код валюты (например, "BTC", "USDT")
  available: string; // Доступный баланс
  locked: string; // Заблокированный баланс (в ордерах)
  total: string; // Общий баланс (available + locked)
}

/**
 * Интерфейс для ответа API балансов
 */
export interface BalanceResponse {
  success: boolean;
  data: CurrencyBalance[];
  timestamp: number;
  error?: string;
}

/**
 * Класс для работы с балансами Gate.io (упрощенная версия)
 */
export class GateIOBalance {
  private apiKey: string;
  private apiSecret: string;
  
  constructor(config: GateIOConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  /**
   * Получение баланса спотового счета (как в рабочем тесте)
   */
  async getSpotBalance(currency?: string): Promise<BalanceResponse> {
    try {
      const method = "GET";
      const url = "/api/v4/spot/accounts";
      const params: Record<string, any> = {};
      
      if (currency) {
        params.currency = currency.toUpperCase();
      }
      
      // Формируем строку запроса для подписи
      const queryString = currency ? `currency=${currency.toUpperCase()}` : "";
      
      // Получаем заголовки подписи (как в рабочем тесте)
      const sigHeaders = createGateIOSignature(
        this.apiKey,
        this.apiSecret,
        method,
        url,
        queryString
      );
      
      // Создаем полные заголовки (как в рабочем тесте)
      const headers = {
        ...sigHeaders,
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      
      // Делаем запрос (как в рабочем тесте)
      const response = await axios.get(`https://api.gateio.ws${url}`, {
        headers: headers,
        params: params,
        timeout: 10000,
        validateStatus: () => true, // Как в рабочем тесте
      });
      
      // Проверяем, что response.data является массивом
      if (!Array.isArray(response.data)) {
        return {
          success: false,
          data: [],
          timestamp: Date.now(),
          error: response.data.message || "Invalid API response format",
        };
      }
      
      // Обрабатываем ответ
      let balances: CurrencyBalance[] = response.data.map((item: any) => ({
        currency: item.currency,
        available: item.available,
        locked: item.locked,
        total: (parseFloat(item.available) + parseFloat(item.locked)).toString(),
      }));
      
      // Фильтрация по валюте, если указана
      if (currency) {
        balances = balances.filter(
          (b) => b.currency === currency.toUpperCase()
        );
      }
      
      return {
        success: true,
        data: balances,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.response?.data?.message || error.message,
      };
    }
  }
}

// Экспорт по умолчанию
export default GateIOBalance;