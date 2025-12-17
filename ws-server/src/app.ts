// DTrader WebSocket Server Instance - Instance D
// Трансляция данных клиентам с аутентификацией

import { WebSocketServer, WebSocket } from "ws";
import { createClient, RedisClientType } from "redis";
import * as crypto from "crypto";
import * as http from "http";
import dotenv from "dotenv";
import { baseConfig as config } from "./config/config";

dotenv.config();

interface ClientInfo {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  connectedAt: number;
  token: string;
  subscriptions: {
    exchanges: Set<string>;
    events: Set<string>;
  };
}

interface SystemStatus {
  timestamp: number;
  botStatus: "idle" | "running" | "error";
  traderStatus: "idle" | "running" | "error";
  redisConnected: boolean;
  lastTradeSignal?: string;
}

interface AuthToken {
  token: string;
  createdAt: number;
  expiresAt: number;
  clientId?: string;
}

class WebSocketServerInstance {
  private wss?: WebSocketServer;
  private redisClient: RedisClientType;
  private clients: Map<string, ClientInfo>;
  private pingInterval: NodeJS.Timeout | null;
  private systemStatus: SystemStatus;
  private exchangeBalance: any | null;
  private isRunning: boolean;
  private isShuttingDown: boolean;
  private validTokens: Map<string, AuthToken>;
  private tokenCleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.isShuttingDown = false;
    this.exchangeBalance = null;
    this.clients = new Map();
    this.pingInterval = null;
    this.tokenCleanupInterval = null;
    this.isRunning = false;
    this.validTokens = new Map();

    this.systemStatus = {
      timestamp: Date.now(),
      botStatus: "idle",
      traderStatus: "idle",
      redisConnected: false,
    };

    if (!config.redis) {
      throw new Error("Redis configuration is required for WebSocket Server");
    }

    this.redisClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
    });
  }

  async initialize() {
    try {
      // Подключаемся к Redis
      await this.redisClient.connect();
      this.systemStatus.redisConnected = true;

      console.log(
        `✅ [${new Date().toISOString()}] WebSocket Server Instance D инициализирован`
      );
      console.log(
        `   🔌 [${new Date().toISOString()}] Подключено к Redis: redis://${
          config.redis.host
        }:${config.redis.port}`
      );

      // Создаем WebSocket сервер
      try {
        this.wss = new WebSocketServer({
          port: config.WS_PORT,
          verifyClient: (info, callback) => {
            this.verifyClient(info, callback);
          },
        });
        console.log(
          `📡 [${new Date().toISOString()}] WebSocket сервер запущен на ws://localhost:${
            config.WS_PORT
          }`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `❌ [${new Date().toISOString()}] Невозможно запустить WebSocket сервер:`,
          errorMessage
        );
        console.error(
          `   [${new Date().toISOString()}] Порт уже занят или недоступен`
        );
        process.exit(1);
      }

      // Настраиваем обработчики
      this.setupWebSocketHandlers();

      // Настраиваем ping-pong
      this.setupPingPong();

      // Настраиваем очистку токенов
      this.setupTokenCleanup();

      // Подписываемся на события
      await this.subscribeToEvents();

      // Генерируем начальные токены для тестирования
      this.generateInitialTokens();

      this.isRunning = true;
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка инициализации WebSocket Server:`,
        error
      );
      throw error;
    }
  }

  // ============== АУТЕНТИФИКАЦИЯ ==============

  private verifyClient(
    info: { origin: string; secure: boolean; req: http.IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void
  ) {
    try {
      const token = this.extractToken(info.req);

      if (!token) {
        console.log(
          `🚫 [${new Date().toISOString()}] Попытка подключения без токена`
        );
        callback(false, 401, "Unauthorized: No token provided");
        return;
      }

      if (!this.isTokenValid(token)) {
        console.log(
          `🚫 [${new Date().toISOString()}] Попытка подключения с недействительным токеном`
        );
        callback(false, 401, "Unauthorized: Invalid or expired token");
        return;
      }

      console.log(`✅ [${new Date().toISOString()}] Токен проверен успешно`);
      callback(true);
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка проверки токена:`,
        error
      );
      callback(false, 500, "Internal server error");
    }
  }

  private extractToken(req: http.IncomingMessage): string | null {
    try {
      // Пробуем извлечь из URL параметра ?token=xxx
      const url = new URL(req.url || "", `ws://${req.headers.host}`);
      const tokenFromUrl = url.searchParams.get("token");
      if (tokenFromUrl) return tokenFromUrl;

      // Пробуем извлечь из заголовка Authorization: Bearer xxx
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
      }

      return null;
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка извлечения токена:`,
        error
      );
      return null;
    }
  }

  private isTokenValid(token: string): boolean {
    const authToken = this.validTokens.get(token);
    if (!authToken) return false;

    if (Date.now() > authToken.expiresAt) {
      this.validTokens.delete(token);
      return false;
    }

    return true;
  }

  public generateToken(expiresInMinutes: number = 60): string {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + expiresInMinutes * 60 * 1000;

    this.validTokens.set(token, {
      token,
      createdAt: now,
      expiresAt,
    });

    console.log(
      `🔑 [${new Date().toISOString()}] Создан новый токен (expires: ${new Date(
        expiresAt
      ).toISOString()})`
    );

    return token;
  }

  public revokeToken(token: string): boolean {
    const deleted = this.validTokens.delete(token);
    if (deleted) {
      console.log(`🔑 [${new Date().toISOString()}] Токен отозван`);
    }
    return deleted;
  }

  private setupTokenCleanup() {
    // Очистка истекших токенов каждые 5 минут
    this.tokenCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      this.validTokens.forEach((authToken, token) => {
        if (now > authToken.expiresAt) {
          this.validTokens.delete(token);
          cleaned++;
        }
      });

      if (cleaned > 0) {
        console.log(
          `🧹 [${new Date().toISOString()}] Очищено истекших токенов: ${cleaned}`
        );
      }
    }, 5 * 60 * 1000);

    console.log(
      `🔄 [${new Date().toISOString()}] Автоматическая очистка токенов настроена (каждые 5 минут)`
    );
  }

  private generateInitialTokens() {
    // Генерируем токены для тестирования
    const testToken1 = this.generateToken(1440); // 24 часа
    const testToken2 = this.generateToken(60); // 1 час

    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                        ТЕСТОВЫЕ ТОКЕНЫ ДОСТУПА                            ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  Токен 1 (24 часа):                                                      ║
║  ${testToken1}  ║
║                                                                           ║
║  Токен 2 (1 час):                                                        ║
║  ${testToken2}  ║
║                                                                           ║
║  Использование:                                                           ║
║  ws://localhost:${config.WS_PORT}?token=YOUR_TOKEN                                   ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);
  }

  // ============== WEBSOCKET HANDLERS ==============

  private setupWebSocketHandlers() {
    if (!this.wss) return;

    this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
      this.handleNewConnection(ws, req);
    });

    this.wss.on("error", (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка WebSocket сервера:`,
        errorMessage
      );
      if (errorMessage.includes("EADDRINUSE")) {
        console.error(
          `💥 [${new Date().toISOString()}] Критическая ошибка: Порт уже занят!`
        );
        console.error(
          `   [${new Date().toISOString()}] Завершаем работу сервера...`
        );
        process.exit(1);
      }
    });
  }

  private handleNewConnection(ws: WebSocket, req: http.IncomingMessage) {
    try {
      const clientId = this.generateClientId();
      const token = this.extractToken(req);

      if (!token) {
        ws.close(1008, "No token provided");
        return;
      }

      const clientInfo: ClientInfo = {
        id: clientId,
        ws,
        isAlive: true,
        connectedAt: Date.now(),
        token,
        subscriptions: {
          exchanges: new Set<string>(),
          events: new Set<string>(),
        },
      };

      this.clients.set(clientId, clientInfo);

      // Привязываем токен к клиенту
      const authToken = this.validTokens.get(token);
      if (authToken) {
        authToken.clientId = clientId;
      }

      console.log(
        `🔌 [${new Date().toISOString()}] Новый клиент подключен: ${clientId} (всего: ${
          this.clients.size
        })`
      );

      // Отправляем приветственное сообщение
      this.sendWelcomeMessage(ws, clientId);

      // Отправляем текущий баланс, если он есть
      if (this.exchangeBalance) {
        this.sendBalanceToClient(ws, clientId, this.exchangeBalance);
      }

      // Отправляем текущее состояние системы
      this.sendCurrentSystemStatus(ws);

      // Настраиваем обработчики
      ws.on("message", (message: Buffer) => {
        this.handleClientMessage(clientId, message.toString());
      });

      ws.on("pong", () => {
        this.handleClientPong(clientId);
      });

      ws.on("close", () => {
        this.handleClientDisconnect(clientId);
      });

      ws.on("error", (error: Error) => {
        console.error(
          `❌ [${new Date().toISOString()}] Ошибка клиента ${clientId}:`,
          error.message
        );
        this.handleClientDisconnect(clientId);
      });
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки нового подключения:`,
        error
      );
      ws.close(1011, "Internal server error");
    }
  }

  private generateClientId(): string {
    return `CLIENT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private sendWelcomeMessage(ws: WebSocket, clientId: string) {
    try {
      const message = {
        type: "system:welcome",
        clientId,
        timestamp: Date.now(),
        message: "🎉 Welcome to DTrader WebSocket Server Instance D!",
        serverInfo: {
          version: "1.0.0",
          instance: "D",
          protocolVersion: "2.0",
          nodeEnv: config.NODE_ENV,
          uptime: process.uptime(),
          authenticated: true,
        },
        connectionInfo: {
          clientId,
          connectedAt: Date.now(),
          serverTime: new Date().toISOString(),
          websocketPort: config.WS_PORT,
        },
        systemStatus: {
          redisConnected: this.systemStatus.redisConnected,
          botStatus: this.systemStatus.botStatus,
          traderStatus: this.systemStatus.traderStatus,
          lastTradeSignal: this.systemStatus.lastTradeSignal || "None",
        },
        availableEvents: [
          "system:status",
          "trade:signal",
          "trade:executed",
          "trade:error",
          "market:update",
          "ping",
          "pong",
          "exchange:pong",
          "bot:pingpong",
          "exchange:balance",
        ],
        availableCommands: {
          subscribe: "Subscribe to specific events",
          unsubscribe: "Unsubscribe from events",
          status: "Get current system status",
          help: "Get help information",
        },
        documentation: {
          api: "https://dtrader.example.com/api-docs",
          github: "https://github.com/dtrader-team/dtrader",
          support: "support@dtrader.example.com",
        },
        tips: [
          'Use {"type":"ping"} to check connection health',
          'Send {"type":"status"} to get current system status',
          "All messages must be valid JSON",
          "Maximum message size: 16KB",
          "Keep your authentication token secure",
        ],
      };

      ws.send(JSON.stringify(message, null, 2));
      console.log(
        `📩 [${new Date().toISOString()}] Приветственное сообщение отправлено клиенту ${clientId}`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка отправки приветственного сообщения:`,
        error
      );
    }
  }

  private sendCurrentSystemStatus(ws: WebSocket) {
    try {
      const message = {
        type: "system:status",
        data: this.systemStatus,
        timestamp: Date.now(),
      };

      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка отправки состояния системы:`,
        error
      );
    }
  }

  private handleClientMessage(clientId: string, message: string) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      console.log(
        `📩 [${new Date().toISOString()}] Сообщение от клиента ${clientId}:`,
        message
      );

      // Парсим сообщение
      try {
        const data = JSON.parse(message);

        // Обрабатываем команды
        switch (data.type) {
          case "ping":
            this.handlePingCommand(client);
            break;
          case "status":
            this.sendCurrentSystemStatus(client.ws);
            break;
          case "subscribe":
            this.handleSubscribeCommand(client, data);
            break;
          case "unsubscribe":
            this.handleUnsubscribeCommand(client, data);
            break;
          default:
            console.log(
              `⚠️  [${new Date().toISOString()}] Неизвестная команда: ${
                data.type
              }`
            );
        }
      } catch (parseError) {
        console.error(
          `❌ [${new Date().toISOString()}] Ошибка парсинга сообщения:`,
          parseError
        );
        client.ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid JSON format",
            timestamp: Date.now(),
          })
        );
      }
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки сообщения клиента:`,
        error
      );
    }
  }

  private handlePingCommand(client: ClientInfo) {
    try {
      client.ws.send(
        JSON.stringify({
          type: "pong",
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка отправки pong:`,
        error
      );
    }
  }

  private handleSubscribeCommand(client: ClientInfo, data: any) {
    try {
      if (data.events && Array.isArray(data.events)) {
        data.events.forEach((event: string) => {
          client.subscriptions.events.add(event);
        });
      }

      if (data.exchanges && Array.isArray(data.exchanges)) {
        data.exchanges.forEach((exchange: string) => {
          client.subscriptions.exchanges.add(exchange);
        });
      }

      client.ws.send(
        JSON.stringify({
          type: "subscribed",
          subscriptions: {
            events: Array.from(client.subscriptions.events),
            exchanges: Array.from(client.subscriptions.exchanges),
          },
          timestamp: Date.now(),
        })
      );

      console.log(
        `📡 [${new Date().toISOString()}] Клиент ${
          client.id
        } подписался на события`
      );
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Ошибка подписки:`, error);
    }
  }

  private handleUnsubscribeCommand(client: ClientInfo, data: any) {
    try {
      if (data.events && Array.isArray(data.events)) {
        data.events.forEach((event: string) => {
          client.subscriptions.events.delete(event);
        });
      }

      if (data.exchanges && Array.isArray(data.exchanges)) {
        data.exchanges.forEach((exchange: string) => {
          client.subscriptions.exchanges.delete(exchange);
        });
      }

      client.ws.send(
        JSON.stringify({
          type: "unsubscribed",
          subscriptions: {
            events: Array.from(client.subscriptions.events),
            exchanges: Array.from(client.subscriptions.exchanges),
          },
          timestamp: Date.now(),
        })
      );

      console.log(
        `📡 [${new Date().toISOString()}] Клиент ${
          client.id
        } отписался от событий`
      );
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Ошибка отписки:`, error);
    }
  }

  private handleClientPong(clientId: string) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      client.isAlive = true;
      console.log(
        `🏓 [${new Date().toISOString()}] PONG получен от клиента ${clientId}`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки pong от клиента:`,
        error
      );
    }
  }

  private handleClientDisconnect(clientId: string) {
    try {
      const client = this.clients.get(clientId);
      if (client && client.token) {
        // Можно отозвать токен при отключении (опционально)
        // this.revokeToken(client.token);
      }

      this.clients.delete(clientId);
      console.log(
        `🔌 [${new Date().toISOString()}] Клиент отключен: ${clientId} (осталось: ${
          this.clients.size
        })`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки отключения клиента:`,
        error
      );
    }
  }

  // ============== PING-PONG ==============

  private setupPingPong() {
    const pingIntervalMs = 15000;

    this.pingInterval = setInterval(() => {
      this.sendPingToAllClients();
    }, pingIntervalMs);

    console.log(
      `🔄 [${new Date().toISOString()}] Ping-Pong механизм настроен (интервал: ${pingIntervalMs}ms)`
    );
  }

  private sendBalanceToClient(
    ws: WebSocket,
    clientId: string,
    balanceData: any
  ) {
    try {
      const message = {
        type: "exchange:balance",
        exchange: balanceData.exchange || "unknown",
        data: balanceData,
        timestamp: Date.now(),
        source: "exchange",
      };

      ws.send(JSON.stringify(message));
      console.log(
        `💰 [${new Date().toISOString()}] Текущий баланс отправлен новому клиенту ${clientId}`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка отправки баланса клиенту ${clientId}:`,
        error
      );
    }
  }

  private sendPingToAllClients() {
    try {
      this.clients.forEach((client, clientId) => {
        if (client.isAlive === false) {
          console.log(
            `⚠️  [${new Date().toISOString()}] Клиент ${clientId} не отвечает, закрываем соединение`
          );
          client.ws.terminate();
          return;
        }

        client.isAlive = false;

        try {
          client.ws.ping();
          console.log(
            `🏓 [${new Date().toISOString()}] PING отправлен клиенту ${clientId}`
          );
        } catch (error) {
          console.error(
            `❌ [${new Date().toISOString()}] Ошибка отправки ping клиенту ${clientId}:`,
            error
          );
          client.ws.terminate();
        }
      });
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка отправки ping клиентам:`,
        error
      );
    }
  }

  // ============== REDIS EVENTS ==============

  private async subscribeToEvents() {
    try {
      console.log(
        `📡 [${new Date().toISOString()}] Подписка на события от других инстансов...`
      );

      await this.redisClient.subscribe("bot:events", (message) => {
        this.handleBotEvent(message);
      });

      await this.redisClient.subscribe("execution:results", (message) => {
        this.handleExecutionEvent(message);
      });

      await this.redisClient.subscribe("state:updates", (message) => {
        this.handleStateUpdate(message);
      });

      await this.redisClient.subscribe("exchange:pong", (message) => {
        this.handleExchangePong(message);
      });

      await this.redisClient.subscribe("bot:pingpong", (message) => {
        this.handleBotPingPong(message);
      });

      await this.redisClient.subscribe("exchange:balance", (message) => {
        this.handleExchangeBalance(message);
      });

      console.log(
        `✅ [${new Date().toISOString()}] Подписка на события активна`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка подписки на события:`,
        error
      );
    }
  }

  private handleBotEvent(message: string) {
    try {
      const event = JSON.parse(message);
      console.log(
        `🤖 [${new Date().toISOString()}] Событие от бота: ${event.type}`
      );

      this.broadcastToAllClients("bot:event", event);
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки события от бота:`,
        error
      );
    }
  }

  private handleExecutionEvent(message: string) {
    try {
      const event = JSON.parse(message);
      console.log(
        `💰 [${new Date().toISOString()}] Событие исполнения: ${event.type}`
      );

      this.broadcastToAllClients("execution:event", event);
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки события исполнения:`,
        error
      );
    }
  }

  private handleStateUpdate(message: string) {
    try {
      const event = JSON.parse(message);
      console.log(
        `🔄 [${new Date().toISOString()}] Обновление состояния: ${event.type}`
      );

      this.broadcastToAllClients("state:update", event);
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки обновления состояния:`,
        error
      );
    }
  }

  private handleBotPingPong(message: string) {
    try {
      const pingPongData = JSON.parse(message);

      const messageType = pingPongData.type === "ping" ? "PING" : "PONG";
      console.log(
        `🤖 [${new Date().toISOString()}] Получено ${messageType} от бота`
      );

      this.broadcastTypedMessage("bot:pingpong", pingPongData, "bot");
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки ping-pong от бота:`,
        error
      );
    }
  }

  private handleExchangePong(message: string) {
    try {
      const pongData = JSON.parse(message);

      console.log(
        `🏓 [${new Date().toISOString()}] Получено pong от биржи ${
          pongData.exchange || "unknown"
        }`
      );

      this.broadcastTypedMessage(
        "exchange:pong",
        pongData,
        "exchange",
        pongData.exchange || "unknown"
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки pong от биржи:`,
        error
      );
    }
  }

  private handleExchangeBalance(message: string) {
    try {
      const balanceData = JSON.parse(message);

      console.log(
        `💰 [${new Date().toISOString()}] Получен баланс от биржи ${
          balanceData.exchange || "unknown"
        }`
      );

      // Сохраняем баланс для новых клиентов
      this.exchangeBalance = balanceData;

      this.broadcastTypedMessage(
        "exchange:balance",
        balanceData,
        "exchange",
        balanceData.exchange || "unknown"
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка обработки баланса от биржи:`,
        error
      );
    }
  }

  // ============== BROADCAST METHODS ==============

  private broadcastTypedMessage(
    type: string,
    data: any,
    source: string,
    exchange?: string
  ) {
    try {
      const message: any = {
        type,
        data,
        timestamp: Date.now(),
        source,
      };

      if (exchange) {
        message.exchange = exchange;
      }

      const messageString = JSON.stringify(message);

      console.log(
        `📡 [${new Date().toISOString()}] Трансляция ${type} от ${source} клиентам...`
      );

      let sentCount = 0;
      this.clients.forEach((client, clientId) => {
        // Проверяем подписки клиента (если есть)
        const shouldSend = this.shouldSendToClient(client, type, exchange);

        if (client.ws.readyState === 1 && shouldSend) {
          try {
            client.ws.send(messageString);
            sentCount++;
            console.log(
              `📤 [${new Date().toISOString()}] ${type} отправлен клиенту ${clientId}`
            );
          } catch (error) {
            console.error(
              `❌ [${new Date().toISOString()}] Ошибка отправки клиенту ${clientId}:`,
              error
            );
          }
        }
      });

      console.log(
        `✅ [${new Date().toISOString()}] ${type} транслирован ${sentCount} клиентам`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка трансляции ${type}:`,
        error
      );
    }
  }

  private shouldSendToClient(
    client: ClientInfo,
    eventType: string,
    exchange?: string
  ): boolean {
    // Если клиент не настроил подписки - отправляем все
    if (
      client.subscriptions.events.size === 0 &&
      client.subscriptions.exchanges.size === 0
    ) {
      return true;
    }

    // Проверяем подписку на событие
    if (
      client.subscriptions.events.size > 0 &&
      !client.subscriptions.events.has(eventType)
    ) {
      return false;
    }

    // Проверяем подписку на биржу
    if (
      exchange &&
      client.subscriptions.exchanges.size > 0 &&
      !client.subscriptions.exchanges.has(exchange)
    ) {
      return false;
    }

    return true;
  }

  private broadcastToAllClients(type: string, data: any) {
    this.broadcastTypedMessage(type, data, "system");
  }

  public broadcastExchangePong(exchangeName: string, pongData: any) {
    this.broadcastTypedMessage(
      "exchange:pong",
      pongData,
      "exchange",
      exchangeName
    );
  }

  // ============== SHUTDOWN ==============

  async getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: Date.now(),
      activeClients: this.clients.size,
      activeTokens: this.validTokens.size,
      systemStatus: this.systemStatus,
    };
  }

  async disconnect() {
    try {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }

      if (this.tokenCleanupInterval) {
        clearInterval(this.tokenCleanupInterval);
      }

      this.closeAllClientConnections();

      await this.redisClient.quit();

      console.log(
        `🔌 [${new Date().toISOString()}] WebSocket Server соединения закрыты`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка при закрытии соединений:`,
        error
      );
    }
  }

  private closeAllClientConnections() {
    try {
      this.clients.forEach((client) => {
        if (client.ws.readyState === 1) {
          client.ws.close(1001, "Server shutting down");
        }
      });

      this.clients.clear();
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка закрытия клиентских соединений:`,
        error
      );
    }
  }

  public async shutdown() {
    if (this.isShuttingDown) {
      console.log(
        `⚠️  [${new Date().toISOString()}] Процедура завершения уже выполняется`
      );
      return;
    }

    this.isShuttingDown = true;
    console.log(
      `🔄 [${new Date().toISOString()}] Начало процедуры безопасного завершения...`
    );

    try {
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.unsubscribe();
        await this.redisClient.quit();
        console.log(
          `✅ [${new Date().toISOString()}] Redis соединение закрыто`
        );
      }

      this.closeAllClientConnections();

      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      if (this.tokenCleanupInterval) {
        clearInterval(this.tokenCleanupInterval);
        this.tokenCleanupInterval = null;
      }

      if (this.wss) {
        this.wss.close((error) => {
          if (error) {
            console.error(
              `❌ [${new Date().toISOString()}] Ошибка при закрытии WebSocket сервера:`,
              error
            );
          } else {
            console.log(
              `✅ [${new Date().toISOString()}] WebSocket сервер закрыт`
            );
          }
        });
      }

      this.isRunning = false;
      console.log(
        `✅ [${new Date().toISOString()}] Безопасное завершение завершено`
      );
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка при безопасном завершении:`,
        error
      );
    }
  }
}

// ============== MAIN ==============

let wsServerInstance: WebSocketServerInstance | null = null;

async function main() {
  try {
    console.log(
      `🚀 [${new Date().toISOString()}] Запуск WebSocket Server Instance D...`
    );

    wsServerInstance = new WebSocketServerInstance();
    await wsServerInstance.initialize();

    console.log(
      `🎯 [${new Date().toISOString()}] WebSocket Server Instance D готов к работе!`
    );
    console.log(
      `💡 [${new Date().toISOString()}] Ожидание подключения клиентов...`
    );
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Фатальная ошибка:`, error);
    process.exit(1);
  }
}

// ============== SIGNAL HANDLERS ==============

async function gracefulShutdown(signal: string) {
  console.log(
    `\n🛑 [${new Date().toISOString()}] Получен сигнал ${signal}. Начало безопасного завершения...`
  );

  if (wsServerInstance) {
    try {
      const shutdownTimeout = setTimeout(() => {
        console.error(
          `❌ [${new Date().toISOString()}] Таймаут завершения (10с), принудительное завершение...`
        );
        process.exit(1);
      }, 10000);

      await wsServerInstance.shutdown();

      clearTimeout(shutdownTimeout);
    } catch (error) {
      console.error(
        `❌ [${new Date().toISOString()}] Ошибка при завершении:`,
        error
      );
      process.exit(1);
    }
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

process.on("uncaughtException", (error) => {
  console.error(
    `❌ [${new Date().toISOString()}] Необработанная ошибка:`,
    error
  );
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason) => {
  console.error(
    `❌ [${new Date().toISOString()}] Необработанный rejection:`,
    reason
  );
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Запуск
main().catch((error) => {
  console.error(`❌ [${new Date().toISOString()}] Фатальная ошибка:`, error);
  gracefulShutdown("FAILURE");
});
