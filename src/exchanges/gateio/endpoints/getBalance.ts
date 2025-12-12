import axios, { AxiosInstance, AxiosResponse } from "axios";
import { createHmac } from "crypto";

/**
 * Интерфейс для конфигурации API Gate.io
 */
export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
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
 * Интерфейс для расширенного баланса с дополнительной информацией
 */
export interface DetailedBalance extends CurrencyBalance {
  usd_value?: string; // Примерная стоимость в USD
  btc_value?: string; // Примерная стоимость в BTC
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
 * Класс для работы с балансами Gate.io
 */
export class GateIOBalance {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;

  constructor(config: GateIOConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;

    this.client = axios.create({
      baseURL: config.baseUrl || "https://api.gateio.ws/api/v4",
      timeout: config.timeout || 10000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  /**
   * Генерация подписи для приватных запросов
   */
  private generateSignature(
    method: string,
    endpoint: string,
    queryString: string = "",
    body: string = ""
  ): string {
    const payload = [method, endpoint, queryString, body]
      .filter((p) => p)
      .join("\n");

    return createHmac("sha512", this.apiSecret).update(payload).digest("hex");
  }

  /**
   * Форматирование временной метки
   */
  private getTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  /**
   * Выполнение приватного запроса к API
   */
  private async makePrivateRequest<T>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    params: Record<string, any> = {},
    data?: any
  ): Promise<AxiosResponse<T>> {
    const timestamp = this.getTimestamp();
    let queryString = "";
    let bodyString = "";

    if (method === "GET" && Object.keys(params).length > 0) {
      queryString = querystring.stringify(params);
    } else if (data) {
      bodyString = JSON.stringify(data);
    }

    const signature = this.generateSignature(
      method,
      endpoint,
      queryString,
      bodyString
    );

    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    const config = {
      method,
      url,
      headers: {
        KEY: this.apiKey,
        Timestamp: timestamp,
        SIGN: signature,
        "Content-Type": "application/json",
      },
      data: bodyString || undefined,
    };

    return this.client.request<T>(config);
  }

  /**
   * Получение баланса спотового счета
   * Документация: https://www.gate.io/docs/apiv4/#get-account-detail
   */
  async getSpotBalance(currency?: string): Promise<BalanceResponse> {
    try {
      const endpoint = "/spot/accounts";
      const params: Record<string, any> = {};

      if (currency) {
        params.currency = currency.toUpperCase();
      }

      const response = await this.makePrivateRequest<any[]>(
        "GET",
        endpoint,
        params
      );

      let balances: CurrencyBalance[] = response.data.map((item) => ({
        currency: item.currency,
        available: item.available,
        locked: item.locked,
        total: (
          parseFloat(item.available) + parseFloat(item.locked)
        ).toString(),
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

  /**
   * Получение баланса маржинального счета
   * Документация: https://www.gate.io/docs/apiv4/#query-margin-account
   */
  async getMarginBalance(currencyPair?: string): Promise<BalanceResponse> {
    try {
      const endpoint = "/margin/accounts";
      const params: Record<string, any> = {};

      if (currencyPair) {
        params.currency_pair = currencyPair;
      }

      const response = await this.makePrivateRequest<any>(
        "GET",
        endpoint,
        params
      );

      // Обработка структуры ответа маржинального счета
      const balances: CurrencyBalance[] = [];

      if (response.data.currencies) {
        Object.entries(response.data.currencies).forEach(
          ([currency, data]: [string, any]) => {
            balances.push({
              currency,
              available: data.available,
              locked: data.locked,
              total: (
                parseFloat(data.available) + parseFloat(data.locked)
              ).toString(),
            });
          }
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

  /**
   * Получение баланса фьючерсного счета (USDT-M)
   * Документация: https://www.gate.io/docs/apiv4/#list-futures-accounts
   */
  async getFuturesBalance(
    settle: "usdt" | "btc" = "usdt"
  ): Promise<BalanceResponse> {
    try {
      const endpoint = `/futures/${settle}/accounts`;

      const response = await this.makePrivateRequest<any>("GET", endpoint);

      const balances: CurrencyBalance[] = [];

      if (response.data) {
        balances.push({
          currency: settle.toUpperCase(),
          available: response.data.available,
          locked: "0", // Для фьючерсов locked обычно 0
          total: response.data.total,
        });
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

  /**
   * Получение баланса опционного счета
   * Документация: https://www.gate.io/docs/apiv4/#list-options-accounts
   */
  async getOptionsBalance(
    underlying: "BTC" | "ETH" = "BTC"
  ): Promise<BalanceResponse> {
    try {
      const endpoint = "/options/accounts";
      const params = { underlying };

      const response = await this.makePrivateRequest<any>(
        "GET",
        endpoint,
        params
      );

      const balances: CurrencyBalance[] = [];

      if (response.data) {
        balances.push({
          currency: underlying,
          available: response.data.available,
          locked: response.data.locked || "0",
          total: response.data.total,
        });
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

  /**
   * Получение общего баланса по всем счетам (агрегированный)
   */
  async getTotalBalance(): Promise<{
    success: boolean;
    data: DetailedBalance[];
    timestamp: number;
    error?: string;
  }> {
    try {
      const [spotBalances, marginBalances, futuresBalances, optionsBalances] =
        await Promise.allSettled([
          this.getSpotBalance(),
          this.getMarginBalance(),
          this.getFuturesBalance(),
          this.getOptionsBalance(),
        ]);

      const allBalances: Record<string, DetailedBalance> = {};

      // Агрегация балансов из всех источников
      const addBalances = (result: PromiseSettledResult<BalanceResponse>) => {
        if (result.status === "fulfilled" && result.value.success) {
          result.value.data.forEach((balance) => {
            const currency = balance.currency;

            if (!allBalances[currency]) {
              allBalances[currency] = {
                ...balance,
                usd_value: "0",
                btc_value: "0",
              };
            } else {
              // Суммируем балансы для одинаковых валют
              const current = allBalances[currency];
              current.available = (
                parseFloat(current.available) + parseFloat(balance.available)
              ).toString();
              current.locked = (
                parseFloat(current.locked) + parseFloat(balance.locked)
              ).toString();
              current.total = (
                parseFloat(current.total) + parseFloat(balance.total)
              ).toString();
            }
          });
        }
      };

      addBalances(spotBalances);
      addBalances(marginBalances);
      addBalances(futuresBalances);
      addBalances(optionsBalances);

      const aggregatedBalances = Object.values(allBalances);

      return {
        success: true,
        data: aggregatedBalances,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * Получение баланса конкретной валюты на всех счетах
   */
  async getCurrencyBalanceAllAccounts(currency: string): Promise<{
    success: boolean;
    data: {
      spot: CurrencyBalance | null;
      margin: CurrencyBalance | null;
      futures: CurrencyBalance | null;
      options: CurrencyBalance | null;
      total: CurrencyBalance;
    };
    timestamp: number;
    error?: string;
  }> {
    try {
      const [spotResult, marginResult, futuresResult, optionsResult] =
        await Promise.allSettled([
          this.getSpotBalance(currency),
          this.getMarginBalance(),
          this.getFuturesBalance(),
          this.getOptionsBalance(),
        ]);

      const result: any = {
        spot: null,
        margin: null,
        futures: null,
        options: null,
        total: {
          currency,
          available: "0",
          locked: "0",
          total: "0",
        },
      };

      // Обработка спотового баланса
      if (
        spotResult.status === "fulfilled" &&
        spotResult.value.success &&
        spotResult.value.data.length > 0
      ) {
        result.spot = spotResult.value.data[0];
      }

      // Обработка маржинального баланса
      if (marginResult.status === "fulfilled" && marginResult.value.success) {
        const marginBalance = marginResult.value.data.find(
          (b: CurrencyBalance) => b.currency === currency.toUpperCase()
        );
        if (marginBalance) result.margin = marginBalance;
      }

      // Обработка фьючерсного баланса
      if (futuresResult.status === "fulfilled" && futuresResult.value.success) {
        const futuresBalance = futuresResult.value.data.find(
          (b: CurrencyBalance) => b.currency === currency.toUpperCase()
        );
        if (futuresBalance) result.futures = futuresBalance;
      }

      // Обработка опционного баланса
      if (optionsResult.status === "fulfilled" && optionsResult.value.success) {
        const optionsBalance = optionsResult.value.data.find(
          (b: CurrencyBalance) => b.currency === currency.toUpperCase()
        );
        if (optionsBalance) result.options = optionsBalance;
      }

      // Расчет общего баланса
      [result.spot, result.margin, result.futures, result.options].forEach(
        (balance) => {
          if (balance) {
            result.total.available = (
              parseFloat(result.total.available) + parseFloat(balance.available)
            ).toString();
            result.total.locked = (
              parseFloat(result.total.locked) + parseFloat(balance.locked)
            ).toString();
            result.total.total = (
              parseFloat(result.total.total) + parseFloat(balance.total)
            ).toString();
          }
        }
      );

      return {
        success: true,
        data: result,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        success: false,
        data: {
          spot: null,
          margin: null,
          futures: null,
          options: null,
          total: { currency, available: "0", locked: "0", total: "0" },
        },
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * Получение баланса только с ненулевым доступным балансом
   */
  async getNonZeroBalances(): Promise<BalanceResponse> {
    const result = await this.getSpotBalance();

    if (result.success) {
      result.data = result.data.filter(
        (balance) =>
          parseFloat(balance.available) > 0 || parseFloat(balance.locked) > 0
      );
    }

    return result;
  }

  /**
   * Проверка достаточности баланса для ордера
   */
  async checkBalanceForOrder(
    currency: string,
    requiredAmount: number,
    includeLocked: boolean = false
  ): Promise<{
    sufficient: boolean;
    available: number;
    required: number;
    missing: number;
    currency: string;
  }> {
    const result = await this.getSpotBalance(currency);

    if (!result.success || result.data.length === 0) {
      return {
        sufficient: false,
        available: 0,
        required: requiredAmount,
        missing: requiredAmount,
        currency,
      };
    }

    const balance = result.data[0];
    const available = parseFloat(balance.available);
    const total = includeLocked
      ? available + parseFloat(balance.locked)
      : available;

    const sufficient = total >= requiredAmount;

    return {
      sufficient,
      available: total,
      required: requiredAmount,
      missing: sufficient ? 0 : requiredAmount - total,
      currency,
    };
  }
}

/**
 * Экспорт утилитарных функций
 */
export const BalanceUtils = {
  /**
   * Форматирование баланса для вывода
   */
  formatBalance(balance: CurrencyBalance, decimals: number = 8): string {
    return `${balance.currency}: ${parseFloat(balance.available).toFixed(
      decimals
    )} available, ${parseFloat(balance.locked).toFixed(decimals)} locked`;
  },

  /**
   * Сумма всех балансов в указанной валюте
   */
  sumBalances(balances: CurrencyBalance[], currency: string): number {
    return balances
      .filter((b) => b.currency === currency.toUpperCase())
      .reduce((sum, b) => sum + parseFloat(b.total), 0);
  },

  /**
   * Конвертация баланса в другую валюту (заглушка - нужен API курсов)
   */
  async convertBalance(
    balance: CurrencyBalance,
    toCurrency: string
  ): Promise<{ amount: number; currency: string }> {
    // Здесь должна быть интеграция с API курсов валют
    // Временная заглушка
    return {
      amount: parseFloat(balance.total),
      currency: toCurrency,
    };
  },
};

/**
 * Экспорт по умолчанию
 */
export default GateIOBalance;
