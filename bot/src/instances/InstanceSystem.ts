import { getStateManager, BalanceState } from "../core/StateManager";
import { logInfo, logSuccess, logError, logWarning } from "../core/logger";
import { GateioWebSocket } from "../exchanges/gateio/gateio-client/ws-client";
import { GateIOBalance } from "../exchanges/gateio/endpoints/getBalance";
import { baseConfig as config } from "../config/config";

interface InstanceHealth {
  stateManager: boolean;
  websocket: boolean;
  exchange: boolean;
  lastBalanceUpdate: number;
}

export class InstanceSystem {
  private stateManager: ReturnType<typeof getStateManager>;
  private isRunning: boolean;
  private wsClient?: GateioWebSocket;
  private gateioClient?: GateIOBalance;
  private balanceUpdateInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private health: InstanceHealth;

  constructor() {
    this.stateManager = getStateManager();
    this.isRunning = false;
    this.health = {
      stateManager: false,
      websocket: false,
      exchange: false,
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

        // Проверяем доступность API
        const testBalance = await this.gateioClient.getSpotBalance();
        if (testBalance.success) {
          this.health.exchange = true;
          logSuccess("Gate.io API доступен");
        } else {
          logWarning("Gate.io API недоступен");
        }
      }

      // Инициализируем WebSocket
      this.wsClient = new GateioWebSocket({
        pingInterval: 15000,
        pingTimeout: 3000,
        stateManager: this.stateManager,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000,
      });
      this.wsClient.connect();
      this.health.websocket = true;

      // Запускаем периодическое обновление баланса
      this.startBalanceUpdates();

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

  private startBalanceUpdates() {
    if (!this.gateioClient) return;

    // Обновляем баланс каждые 30 секунд
    this.balanceUpdateInterval = setInterval(async () => {
      try {
        const balance = await this.getCurrentBalance();
        if (balance) {
          this.health.lastBalanceUpdate = Date.now();
        }
      } catch (error) {
        logError("Ошибка периодического обновления баланса", error);
      }
    }, 30000);

    logInfo("Периодическое обновление баланса запущено (каждые 30 секунд)");
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      const health = this.getHealth();

      if (!health.stateManager) {
        logError(
          "Health Check: StateManager неисправен",
          new Error("Redis connection lost")
        );
      }

      if (!health.websocket) {
        logWarning("Health Check: WebSocket не подключен");
      }

      if (!health.exchange) {
        logWarning("Health Check: Gate.io API недоступен");
      }

      const timeSinceLastUpdate = Date.now() - health.lastBalanceUpdate;
      if (timeSinceLastUpdate > 60000) {
        logWarning(
          `Health Check: Баланс не обновлялся ${Math.floor(
            timeSinceLastUpdate / 1000
          )}с`
        );
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

      if (this.balanceUpdateInterval) {
        clearInterval(this.balanceUpdateInterval);
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      if (this.wsClient && this.wsClient.isConnected()) {
        this.wsClient.disconnect();
      }

      await this.stateManager.disconnect();

      this.isRunning = false;
      this.health = {
        stateManager: false,
        websocket: false,
        exchange: false,
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
      websocket: this.wsClient?.isConnected() || false,
      exchange: this.health.exchange,
      lastBalanceUpdate: this.health.lastBalanceUpdate,
    };
  }

  async getCurrentBalance(): Promise<BalanceState[] | null> {
    try {
      if (!this.gateioClient) {
        logWarning("Gate.io клиент не инициализирован");
        return await this.stateManager.getCurrentBalance();
      }

      const response = await this.gateioClient.getSpotBalance();

      if (response.success && response.data.length > 0) {
        await this.stateManager.setCurrentBalance(response.data);
        this.health.lastBalanceUpdate = Date.now();
        return response.data;
      }

      return await this.stateManager.getCurrentBalance();
    } catch (error) {
      logError("Ошибка получения текущего баланса", error);
      return null;
    }
  }
}

let instanceSystem: InstanceSystem | null = null;

export function getInstanceSystem(): InstanceSystem {
  if (!instanceSystem) {
    instanceSystem = new InstanceSystem();
  }
  return instanceSystem;
}
