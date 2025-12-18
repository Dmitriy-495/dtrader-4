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

  // Rate limiting - проверка перед запросом
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.rateLimitState.requests = this.rateLimitState.requests.filter(
      (timestamp) => timestamp > oneMinuteAgo
    );

    if (this.rateLimitState.requests.length >= this.rateLimitPerMinute) {
      const oldestRequest = this.rateLimitState.requests[0];
      const waitTime = 60000 - (now - oldestRequest);
      console.log(`⏳ Rate limit: ожидание ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }

    this.rateLimitState.requests.push(now);
  }

  // Определяет, можно ли повторить запрос
  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;

    // Network errors - retry
    if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(error.code)) {
      return true;
    }

    const status = error.response?.status;
    
    // 429 Rate limit - retry
    if (status === 429) return true;
    
    // 5xx Server errors - retry
    if (status >= 500 && status < 600) return true;
    
    // 503 Service unavailable - retry
    if (status === 503) return true;
    
    // 408 Request timeout - retry
    if (status === 408) return true;

    return false;
  }

  // Вычисляет задержку для retry
  private getRetryDelay(attempt: number, error: any): number {
    const status = error.response?.status;

    if (status === 429) {
      const retryAfter = error.response?.headers?.["retry-after"];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) return seconds * 1000;
      }
      return Math.min(Math.pow(2, attempt) * 5000, 30000);
    }

    const baseDelay = this.retryDelay;
    const exponentialDelay = Math.pow(2, attempt) * baseDelay;
    const jitter = Math.random() * 100;

    return Math.min(exponentialDelay + jitter, 10000);
  }

  // ОСНОВНОЙ МЕТОД с retry логикой
  async getSpotBalance(currency?: string): Promise<BalanceResponse> {
    let lastError: any;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        const result = await this.executeSpotBalanceRequest(currency);

        return {
          ...result,
          retriesUsed: attempt,
          rateLimitRemaining: this.rateLimitPerMinute - this.rateLimitState.requests.length,
        };
      } catch (error: any) {
        lastError = error;

        if (!this.shouldRetry(error, attempt)) {
          console.error(`❌ Gate.io API: ошибка не подлежит retry (попытка ${attempt + 1}/${this.maxRetries})`);
          break;
        }

        if (attempt < this.maxRetries - 1) {
          const delay = this.getRetryDelay(attempt, error);
          console.log(`⚠️  Gate.io API: Retry ${attempt + 1}/${this.maxRetries} после ${delay}ms`);
          console.log(`   Причина: ${error.response?.data?.message || error.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      data: [],
      timestamp: Date.now(),
      error: lastError?.response?.data?.message || lastError?.message || "Unknown error",
      retriesUsed: this.maxRetries,
    };
  }

  private async executeSpotBalanceRequest(currency?: string): Promise<BalanceResponse> {
    const method = "GET";
    const url = "/api/v4/spot/accounts";
    const params: Record<string, any> = {};

    if (currency) params.currency = currency.toUpperCase();

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
      validateStatus: (status: number) => status < 500,
    });

    if (response.status !== 200) {
      const error: any = new Error(response.data?.message || `HTTP ${response.status}`);
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

  getRateLimitStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.rateLimitState.requests.filter((t) => t > oneMinuteAgo);

    return {
      requestsInLastMinute: recentRequests.length,
      limit: this.rateLimitPerMinute,
      remaining: this.rateLimitPerMinute - recentRequests.length,
      resetIn: recentRequests.length > 0 ? Math.max(0, 60000 - (now - recentRequests[0])) : 0,
    };
  }
}

export default GateIOBalance;
