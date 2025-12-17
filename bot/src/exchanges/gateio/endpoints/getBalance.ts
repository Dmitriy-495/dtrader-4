const axios = require("axios");
const { createGateIOSignature } = require("../crypto/signature");

export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
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
}

export class GateIOBalance {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: GateIOConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || "https://api.gateio.ws";
    this.timeout = config.timeout || 10000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  async getSpotBalance(currency?: string): Promise<BalanceResponse> {
    return this.getSpotBalanceWithRetry(currency);
  }

  async getSpotBalanceWithRetry(
    currency?: string,
    retriesUsed: number = 0
  ): Promise<BalanceResponse> {
    try {
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
        validateStatus: () => true,
      });

      if (!Array.isArray(response.data)) {
        throw new Error(response.data.message || "Invalid API response format");
      }

      let balances: CurrencyBalance[] = response.data.map((item: any) => ({
        currency: item.currency,
        available: item.available,
        locked: item.locked,
        total: (
          parseFloat(item.available) + parseFloat(item.locked)
        ).toString(),
      }));

      if (currency) {
        balances = balances.filter(
          (b) => b.currency === currency.toUpperCase()
        );
      }

      return {
        success: true,
        data: balances,
        timestamp: Date.now(),
        retriesUsed,
      };
    } catch (error: any) {
      if (this.shouldRetry(error) && retriesUsed < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retriesUsed);
        console.log(
          `⚠️  Gate.io API: Retry ${retriesUsed + 1}/${
            this.maxRetries
          } after ${delay}ms`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.getSpotBalanceWithRetry(currency, retriesUsed + 1);
      }

      return {
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.response?.data?.message || error.message,
        retriesUsed,
      };
    }
  }

  private shouldRetry(error: any): boolean {
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      return true;
    }

    if (error.response?.status === 429) {
      return true;
    }

    if (error.response?.status >= 500) {
      return true;
    }

    return false;
  }
}

export default GateIOBalance;
