const axios = require("axios");
const { createGateIOSignature } = require("../crypto/signature");

export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  rateLimitPerMinute?: number;
}

export interface CurrencyBalance {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

export interface BalanceResponse {
  success: boolean;
  data: CurrencyBalance[];
  timestamp: number;
  error?: string;
  retriesUsed?: number;
  rateLimitRemaining?: number;
}

interface RateLimitState {
  requests: number[];
  lastCleanup: number;
}

export class GateIOBalance {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  private rateLimitPerMinute: number;

  // Rate limiting
  private rateLimitState: RateLimitState = {
    requests: [],
    lastCleanup: Date.now(),
  };

  constructor(config: GateIOConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || "https://api.gateio.ws";
    this.timeout = config.timeout || 10000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.rateLimitPerMinute = config.rateLimitPerMinute || 60;
  }

  /**
   * Проверка rate limit перед запросом
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Очистка старых запросов
    this.rateLimitState.requests = this.rateLimitState.requests.filter(
      (timestamp) => timestamp > oneMinuteAgo
    );

    if (this.rateLimitState.requests.length >= this.rateLimitPerMinute) {
      const oldestRequest = this.rateLimitState.requests[0];
      const waitTime = 60000 - (now - oldestRequest);

      console.log(`⏳ Rate limit: ожидание ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Рекурсивно проверяем снова
      return this.checkRateLimit();
    }

    // Записываем текущий запрос
    this.rateLimitState.requests.push(now);
  }

  /**
   * Определяет, можно ли повторить запрос при данной ошибке
   */
  private shouldRetry(error: any, attempt: number): boolean {
    // Проверяем количество попыток
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Network errors - всегда retry
    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNRESET" ||
      error.code === "ECONNREFUSED" ||
      error.code === "ENOTFOUND"
    ) {
      return true;
    }

    // HTTP status codes
    const status = error.response?.status;

    // Rate limit (429) - retry с большой задержкой
    if (status === 429) {
      return true;
    }

    // Server errors (5xx) - retry
    if (status >= 500 && status < 600) {
      return true;
    }

    // Service temporarily unavailable
    if (status === 503) {
      return true;
    }

    // Client errors (4xx) - обычно не retry, кроме специальных случаев
    if (status >= 400 && status < 500) {
      // 408 Request Timeout - можно retry
      if (status === 408) {
        return true;
      }
      // Остальные 4xx ошибки - не retry (неверный запрос, auth и т.д.)
      return false;
    }

    // По умолчанию не retry
    return false;
  }

  /**
   * Вычисляет задержку для следующей попытки
   */
  private getRetryDelay(attempt: number, error: any): number {
    const status = error.response?.status;

    // Для 429 (rate limit) используем большую задержку
    if (status === 429) {
      // Проверяем заголовок Retry-After, если есть
      const retryAfter = error.response?.headers?.["retry-after"];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
      // Иначе экспоненциальная задержка, но с большим базовым значением
      return Math.min(Math.pow(2, attempt) * 5000, 30000);
    }

    // Для остальных ошибок - стандартная экспоненциальная задержка
    const baseDelay = this.retryDelay;
    const exponentialDelay = Math.pow(2, attempt) * baseDelay;
    const jitter = Math.random() * 100; // Добавляем jitter

    return Math.min(exponentialDelay + jitter, 10000);
  }

  /**
   * Получить spot баланс с полной retry логикой
   */
  async getSpotBalance(currency?: string): Promise<BalanceResponse> {
    let lastError: any;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Проверка rate limit
        await this.checkRateLimit();

        // Выполнение запроса
        const result = await this.executeSpotBalanceRequest(currency);

        return {
          ...result,
          retriesUsed: attempt,
          rateLimitRemaining:
            this.rateLimitPerMinute - this.rateLimitState.requests.length,
        };
      } catch (error: any) {
        lastError = error;

        // Проверяем, можно ли retry
        if (!this.shouldRetry(error, attempt)) {
          console.error(
            `❌ Gate.io API: ошибка не подлежит retry (попытка ${attempt + 1}/${
              this.maxRetries
            })`
          );
          break;
        }

        // Если это не последняя попытка - делаем retry
        if (attempt < this.maxRetries - 1) {
          const delay = this.getRetryDelay(attempt, error);

          console.log(
            `⚠️  Gate.io API: Retry ${attempt + 1}/${
              this.maxRetries
            } после ${delay}ms`
          );
          console.log(
            `   Причина: ${error.response?.data?.message || error.message}`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Все попытки исчерпаны
    return {
      success: false,
      data: [],
      timestamp: Date.now(),
      error:
        lastError?.response?.data?.message ||
        lastError?.message ||
        "Unknown error",
      retriesUsed: this.maxRetries,
    };
  }

  /**
   * Выполняет непосредственно API запрос
   */
  private async executeSpotBalanceRequest(
    currency?: string
  ): Promise<BalanceResponse> {
    const method = "GET";
    const url = "/api/v4/spot/accounts";
    const params: Record<string, any> = {};

    if (currency) {
      params.currency = currency.toUpperCase();
    }

    const queryString = currency ? `currency=${currency.toUpperCase()}` : "";

    const sigHeaders = createGateIOSignature(
      this.apiKey,
      this.apiSecret,
      method,
      url,
      queryString
    );

    const headers = {
      ...sigHeaders,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const response = await axios.get(`${this.baseUrl}${url}`, {
      headers: headers,
      params: params,
      timeout: this.timeout,
      validateStatus: (status: number) => status < 500, // Не throw на 4xx
    });

    // Проверка успешности
    if (response.status !== 200) {
      const error: any = new Error(
        response.data?.message || `HTTP ${response.status}`
      );
      error.response = response;
      throw error;
    }

    if (!Array.isArray(response.data)) {
      throw new Error(response.data?.message || "Invalid API response format");
    }

    let balances: CurrencyBalance[] = response.data.map((item: any) => ({
      currency: item.currency,
      available: item.available,
      locked: item.locked,
      total: (parseFloat(item.available) + parseFloat(item.locked)).toString(),
    }));

    if (currency) {
      balances = balances.filter((b) => b.currency === currency.toUpperCase());
    }

    return {
      success: true,
      data: balances,
      timestamp: Date.now(),
    };
  }

  /**
   * Получить текущую статистику rate limit
   */
  getRateLimitStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequests = this.rateLimitState.requests.filter(
      (timestamp) => timestamp > oneMinuteAgo
    );

    return {
      requestsInLastMinute: recentRequests.length,
      limit: this.rateLimitPerMinute,
      remaining: this.rateLimitPerMinute - recentRequests.length,
      resetIn:
        recentRequests.length > 0
          ? Math.max(0, 60000 - (now - recentRequests[0]))
          : 0,
    };
  }
}

export default GateIOBalance;
