import { getStateManager, BalanceState } from "../core/StateManager";
import { logInfo, logSuccess, logError, logWarning } from "../core/logger";
import { OrderBookWebSocket, OrderBookSnapshot, BestBidAsk } from "../exchanges/gateio/gateio-client/orderbook-ws-client";
import { BalanceWebSocket } from "../exchanges/gateio/gateio-client/balance-ws-client";
import { GateIOBalance } from "../exchanges/gateio/endpoints/getBalance";
import { baseConfig as config } from "../config/config";

interface InstanceHealth {
  stateManager: boolean;
  exchange: boolean;
  orderBook: boolean;
  balanceWs: boolean;
  lastBalanceUpdate: number;
}

export class InstanceSystem {
  private stateManager: ReturnType<typeof getStateManager>;
  private isRunning: boolean;
  private orderBookWs?: OrderBookWebSocket;
  private balanceWs?: BalanceWebSocket;
  private gateioClient?: GateIOBalance;
  private healthCheckInterval?: NodeJS.Timeout;
  private health: InstanceHealth;

  constructor() {
    this.stateManager = getStateManager();
    this.isRunning = false;
    this.health = {
      stateManager: false,
      exchange: false,
      orderBook: false,
      balanceWs: false,
      lastBalanceUpdate: 0,
    };

    logSuccess("Instance System для bot инстанса инициализирован");
  }

  async start() {
    try {
      if (this.isRunning) {
        logInfo("Instance System уже запущен");
        return true;
      }

      logInfo("Запуск Instance System для bot инстанса...");

      // Проверяем Redis
      try {
        await this.stateManager.getCurrentBalance();
        this.health.stateManager = true;
      } catch (error) {
        logError("Redis не доступен", error);
        throw error;
      }

      // Инициализируем Gate.io API клиент
      if (config.exchange.enabled) {
        this.gateioClient = new GateIOBalance({
          apiKey: config.exchange.apiKey!,
          apiSecret: config.exchange.secret!,
          maxRetries: 3,
          retryDelay: 1000,
        });

        const testBalance = await this.gateioClient.getSpotBalance();
        if (testBalance.success) {
          this.health.exchange = true;
          logSuccess("Gate.io API доступен");
        } else {
          logWarning("Gate.io API недоступен");
        }
      }

      // Инициализируем Order Book WebSocket
      if (config.orderBook && config.orderBook.pairs.length > 0) {
        logInfo("Инициализация Order Book WebSocket...");
        
        this.orderBookWs = new OrderBookWebSocket({
          depth: config.orderBook.depth || 20,
          updateSpeed: config.orderBook.updateSpeed || '100ms',
          onOrderBookUpdate: (update: any) => {
            logInfo(`Order Book update: ${update.contract}`);
          },
          onBestBidAsk: (data: any) => {
            logInfo(`Best Bid/Ask ${data.contract}: ${data.bestBid?.price}/${data.bestAsk?.price} (spread: ${data.spreadPercent.toFixed(4)}%)`);
          }
        });
        
        this.orderBookWs.connect();
        this.health.orderBook = true;
        logSuccess("Order Book WebSocket инициализирован");
      }

      // Инициализируем Balance WebSocket вместо REST polling
      if (config.exchange.enabled) {
        logInfo("Инициализация Balance WebSocket...");
        
        this.balanceWs = new BalanceWebSocket({
          apiKey: config.exchange.apiKey!,
          apiSecret: config.exchange.secret!,
          onBalanceUpdate: async (balances) => {
            // Сохраняем в Redis при получении обновления
            await this.stateManager.setCurrentBalance(balances);
            this.health.lastBalanceUpdate = Date.now();
            logInfo(`💰 Баланс обновлен: ${balances.length} валют`);
          }
        });
        
        this.balanceWs.connect();
        this.health.balanceWs = true;
        logSuccess("Balance WebSocket инициализирован");
      }

      // Запускаем health check
      this.startHealthCheck();

      this.isRunning = true;
      logSuccess("Instance System для bot инстанса запущен");

      return true;
    } catch (error) {
      logError("Ошибка запуска Instance System", error);
      throw error;
    }
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      const health = this.getHealth();

      if (!health.stateManager) {
        logError("Health Check: StateManager неисправен", new Error("Redis connection lost"));
      }

      if (!health.exchange) {
        logWarning("Health Check: Gate.io API недоступен");
      }
      
      if (!health.balanceWs && config.exchange.enabled) {
        logWarning("Health Check: Balance WebSocket не подключен");
      }
      
      if (!health.orderBook && config.orderBook?.pairs.length > 0) {
        logWarning("Health Check: Order Book WebSocket не подключен");
      }

      const timeSinceLastUpdate = Date.now() - health.lastBalanceUpdate;
      if (timeSinceLastUpdate > 60000 && config.exchange.enabled) {
        logWarning(`Health Check: Баланс не обновлялся ${Math.floor(timeSinceLastUpdate / 1000)}с`);
      }
    }, 60000);

    logInfo("Health Check запущен (каждые 60 секунд)");
  }

  async stop() {
    try {
      if (!this.isRunning) {
        logInfo("Instance System уже остановлен");
        return true;
      }

      logInfo("Остановка Instance System для bot инстанса...");

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      if (this.orderBookWs && this.orderBookWs.isConnected()) {
        this.orderBookWs.disconnect();
      }
      
      if (this.balanceWs && this.balanceWs.isConnected()) {
        this.balanceWs.disconnect();
      }

      await this.stateManager.disconnect();

      this.isRunning = false;
      this.health = {
        stateManager: false,
        exchange: false,
        orderBook: false,
        balanceWs: false,
        lastBalanceUpdate: 0,
      };

      logSuccess("Instance System для bot инстанса остановлен");

      return true;
    } catch (error) {
      logError("Ошибка остановки Instance System", error);
      throw error;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      health: this.health,
      timestamp: Date.now(),
    };
  }

  getHealth(): InstanceHealth {
    return {
      stateManager: this.stateManager.isHealthy(),
      exchange: this.health.exchange,
      orderBook: this.orderBookWs?.isConnected() || false,
      balanceWs: this.balanceWs?.isConnected() || false,
      lastBalanceUpdate: this.health.lastBalanceUpdate,
    };
  }

  async getCurrentBalance(): Promise<BalanceState[] | null> {
    try {
      // Сначала пытаемся получить из Redis (там данные от WebSocket)
      const cachedBalance = await this.stateManager.getCurrentBalance();
      
      if (cachedBalance && cachedBalance.length > 0) {
        return cachedBalance;
      }

      // Fallback на REST API если нет данных в Redis
      if (!this.gateioClient) {
        logWarning("Gate.io клиент не инициализирован");
        return null;
      }

      const response = await this.gateioClient.getSpotBalance();

      if (response.success && response.data.length > 0) {
        await this.stateManager.setCurrentBalance(response.data);
        this.health.lastBalanceUpdate = Date.now();
        return response.data;
      }

      return null;
    } catch (error) {
      logError("Ошибка получения текущего баланса", error);
      return null;
    }
  }
  
  // ============== ORDER BOOK МЕТОДЫ ==============
  
  /**
   * Получить order book для конкретной пары
   */
  getOrderBook(pair: string): OrderBookSnapshot | null {
    if (!this.orderBookWs) {
      logWarning("Order Book WebSocket не инициализирован");
      return null;
    }
    return this.orderBookWs.getOrderBook(pair);
  }
  
  /**
   * Получить best bid/ask для пары
   */
  getBestBidAsk(pair: string): BestBidAsk | null {
    if (!this.orderBookWs) {
      logWarning("Order Book WebSocket не инициализирован");
      return null;
    }
    return this.orderBookWs.getBestBidAsk(pair);
  }
  
  /**
   * Подписаться на order book конкретной пары
   */
  subscribeToOrderBook(pair: string): void {
    if (!this.orderBookWs) {
      logWarning("Order Book WebSocket не инициализирован");
      return;
    }
    this.orderBookWs.subscribeToPair(pair);
  }
  
  /**
   * Отписаться от order book пары
   */
  unsubscribeFromOrderBook(pair: string): void {
    if (!this.orderBookWs) {
      logWarning("Order Book WebSocket не инициализирован");
      return;
    }
    this.orderBookWs.unsubscribeFromPair(pair);
  }
  
  /**
   * Получить список подписанных пар
   */
  getSubscribedPairs(): string[] {
    if (!this.orderBookWs) {
      return [];
    }
    return this.orderBookWs.getSubscribedPairs();
  }
}

let instanceSystem: InstanceSystem | null = null;

export function getInstanceSystem(): InstanceSystem {
  if (!instanceSystem) {
    instanceSystem = new InstanceSystem();
  }
  return instanceSystem;
}
