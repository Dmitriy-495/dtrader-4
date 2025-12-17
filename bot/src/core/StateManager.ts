import { createClient, RedisClientType } from "redis";
import { baseConfig as config } from "../config/config";
import { logInfo, logSuccess, logError, logWarning } from "./logger";

export interface BalanceState {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

export class StateManager {
  private redisClient: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private connectionTimeout: number = 5000;

  constructor() {
    if (!config.redis) {
      throw new Error("Redis configuration is required");
    }

    this.redisClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > this.maxReconnectAttempts) {
            logError(
              "Redis reconnect attempts exceeded",
              new Error("Max retries")
            );
            return new Error("Max reconnect attempts exceeded");
          }
          return Math.min(retries * 100, 5000);
        },
        connectTimeout: this.connectionTimeout,
      },
    });

    this.pubClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
        connectTimeout: this.connectionTimeout,
      },
    });

    this.subClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
        connectTimeout: this.connectionTimeout,
      },
    });

    this.setupEventHandlers();
    this.initialize();
  }

  private setupEventHandlers() {
    this.redisClient.on("connect", () => {
      logInfo("Redis main client connecting...");
    });

    this.redisClient.on("ready", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logSuccess("Redis main client ready");
    });

    this.redisClient.on("error", (error) => {
      this.isConnected = false;
      logError("Redis main client error", error);
    });

    this.redisClient.on("reconnecting", () => {
      this.reconnectAttempts++;
      logWarning(
        `Redis reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
    });
  }

  private async initialize() {
    try {
      const connectPromises = [
        this.redisClient.connect(),
        this.pubClient.connect(),
        this.subClient.connect(),
      ];

      await Promise.race([
        Promise.all(connectPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 10000)
        ),
      ]);

      this.isConnected = true;
      logSuccess("Redis StateManager инициализирован");
      logInfo(`Подключено к redis://${config.redis.host}:${config.redis.port}`);
    } catch (error) {
      this.isConnected = false;
      logError("Ошибка подключения к Redis", error);
      throw error;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redisClient.isOpen) {
      throw new Error("Redis connection is not active");
    }

    try {
      await Promise.race([
        this.redisClient.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis ping timeout")), 3000)
        ),
      ]);
    } catch (error) {
      this.isConnected = false;
      // throw new Error(`Redis health check failed: ${error.message}`);
    }
  }

  async setCurrentBalance(balance: BalanceState[]): Promise<void> {
    try {
      await this.ensureConnected();

      logInfo("Сохранение баланса в Redis...");
      logInfo(`Получено состояние баланса: ${balance.length} активов`);

      const balanceString = JSON.stringify(balance);
      logInfo(`Сериализовано в JSON: ${balanceString.length} символов`);

      await Promise.race([
        this.redisClient.set("currentBalance", balanceString),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Set timeout")), 5000)
        ),
      ]);

      logSuccess("Успешно записано в Redis");

      await this.pubClient.publish(
        "stateUpdate",
        JSON.stringify({
          type: "balanceUpdated",
          data: balance,
          timestamp: Date.now(),
        })
      );

      logInfo("Опубликовано событие обновления баланса");
      logSuccess("Баланс успешно сохранен в Redis");
    } catch (error) {
      logError("Ошибка при сохранении баланса в Redis", error);
      throw error;
    }
  }

  async getCurrentBalance(): Promise<BalanceState[] | null> {
    try {
      await this.ensureConnected();

      logInfo("Чтение баланса из Redis...");

      const balance = await Promise.race([
        this.redisClient.get("currentBalance"),
        new Promise<string | null>((_, reject) =>
          setTimeout(() => reject(new Error("Get timeout")), 5000)
        ),
      ]);

      if (balance) {
        logInfo(`Получено из Redis: ${balance.length} символов`);
        const parsedBalance = JSON.parse(balance);
        logInfo(`Десериализовано в объект: ${parsedBalance.length} активов`);
        logSuccess("Баланс успешно получен из Redis");
        return parsedBalance;
      } else {
        logWarning("Баланс в Redis не найден");
        return null;
      }
    } catch (error) {
      logError("Ошибка при получении баланса из Redis", error);
      return null;
    }
  }

  async subscribeToUpdates(
    callback: (channel: string, message: string) => void
  ): Promise<void> {
    try {
      await this.subClient.subscribe("stateUpdate", callback);
      logInfo("Подписка на обновления состояния активна");
    } catch (error) {
      logError("Ошибка подписки на обновления", error);
      throw error;
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.redisClient.isOpen;
  }

  async disconnect(): Promise<void> {
    try {
      const clients = [this.redisClient, this.pubClient, this.subClient];
      const activeClients = clients.filter((client) => {
        try {
          return client.isOpen;
        } catch {
          return false;
        }
      });

      if (activeClients.length > 0) {
        await Promise.all(activeClients.map((client) => client.quit()));
        logInfo("Redis соединения закрыты");
      }

      this.isConnected = false;
    } catch (error) {
      logError("Ошибка при закрытии Redis соединений", error);
    }
  }
}

let stateManager: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!stateManager) {
    stateManager = new StateManager();
  }
  return stateManager;
}
