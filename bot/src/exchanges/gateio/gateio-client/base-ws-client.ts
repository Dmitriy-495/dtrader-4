const { WebSocket } = require('ws');
import { logInfo, logSuccess, logError, logWarning } from '../../../core/logger';

/**
 * Конфигурация для базового WebSocket клиента
 */
export interface BaseWebSocketConfig {
  url: string;
  pingInterval?: number;
  pingTimeout?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  name?: string;
}

/**
 * Статусы подключения
 */
export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  AUTHENTICATED = 'AUTHENTICATED',
  ERROR = 'ERROR',
  SHUTTING_DOWN = 'SHUTTING_DOWN'
}

/**
 * Базовый класс для всех Gate.io WebSocket клиентов
 * 
 * Предоставляет:
 * - Connection management
 * - Ping-pong механизм
 * - Exponential backoff reconnection
 * - Централизованный error handling
 * - Event callbacks
 */
export abstract class BaseGateIOWebSocket {
  protected socket?: any;
  protected status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  protected wsUrl: string;
  protected pingIntervalMs: number;
  protected pingTimeoutMs: number;
  protected maxReconnectAttempts: number;
  protected reconnectDelay: number;
  protected reconnectAttempts: number = 0;
  protected clientName: string;
  
  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;

  constructor(config: BaseWebSocketConfig) {
    this.wsUrl = config.url;
    this.pingIntervalMs = config.pingInterval || 15000;
    this.pingTimeoutMs = config.pingTimeout || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectDelay = config.reconnectDelay || 1000;
    this.clientName = config.name || 'GateIO-WS';
    
    logSuccess(`${this.clientName}: Базовый клиент инициализирован`);
  }

  /**
   * Подключение к WebSocket
   */
  public connect(): void {
    if (this.status === ConnectionStatus.SHUTTING_DOWN) {
      logWarning(`${this.clientName}: Завершение работы, подключение отменено`);
      return;
    }

    if (this.status === ConnectionStatus.CONNECTED || 
        this.status === ConnectionStatus.CONNECTING) {
      logWarning(`${this.clientName}: Уже подключен или подключается`);
      return;
    }

    this.status = ConnectionStatus.CONNECTING;
    logInfo(`${this.clientName}: Установка соединения...`);
    logInfo(`${this.clientName}: URL - ${this.wsUrl}`);

    try {
      this.socket = new WebSocket(this.wsUrl);
      this.setupSocketHandlers();
    } catch (error) {
      logError(`${this.clientName}: Ошибка создания соединения`, error);
      this.handleConnectionError();
    }
  }

  /**
   * Настройка обработчиков событий сокета
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('open', () => {
      logSuccess(`${this.clientName}: Соединение установлено`);
      this.status = ConnectionStatus.CONNECTED;
      this.reconnectAttempts = 0;
      this.onOpen();
      this.startPingPong();
    });

    this.socket.on('error', (error: any) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`${this.clientName}: Ошибка соединения`, new Error(errorMessage));
      this.status = ConnectionStatus.ERROR;
      this.onError(error);
      this.handleConnectionError();
    });

    this.socket.on('close', (code: number, reason: string) => {
      logInfo(`${this.clientName}: Соединение закрыто (${code}: ${reason || 'no reason'})`);
      this.onClose(code, reason);
      this.handleConnectionClose();
    });

    this.socket.on('message', (data: any) => {
      this.handleMessage(data);
    });
  }

  /**
   * Обработка входящих сообщений
   */
  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);

      // Обработка pong
      if (this.isPongMessage(message)) {
        logInfo(`${this.clientName}: Получен pong (соединение активно)`);
        this.resetPingTimeout();
        this.onPong(message);
        return;
      }

      // Делегируем обработку наследникам
      this.onMessage(message);
    } catch (error) {
      logError(`${this.clientName}: Ошибка обработки сообщения`, error);
    }
  }

  /**
   * Механизм Ping-Pong
   */
  private startPingPong(): void {
    this.stopPingPong();

    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);

    logInfo(`${this.clientName}: Ping-pong запущен (интервал: ${this.pingIntervalMs}ms)`);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  /**
   * Отправка ping
   */
  protected sendPing(): void {
    if (!this.socket || this.status !== ConnectionStatus.CONNECTED) {
      logWarning(`${this.clientName}: Не могу отправить ping - соединение не активно`);
      return;
    }

    const pingMessage = this.createPingMessage();

    try {
      this.socket.send(JSON.stringify(pingMessage));
      logInfo(`${this.clientName}: Отправлен ping`);
      this.setupPingTimeout();
    } catch (error) {
      logError(`${this.clientName}: Ошибка отправки ping`, error);
      this.handleConnectionError();
    }
  }

  private setupPingTimeout(): void {
    this.pingTimeout = setTimeout(() => {
      logError(`${this.clientName}: Таймаут ожидания pong`, new Error('Ping timeout'));
      this.handleConnectionError();
    }, this.pingTimeoutMs);
  }

  private resetPingTimeout(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  /**
   * Логика переподключения с exponential backoff
   */
  private handleConnectionError(): void {
    if (this.status === ConnectionStatus.SHUTTING_DOWN) {
      return;
    }

    this.status = ConnectionStatus.ERROR;
    this.stopPingPong();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logError(
        `${this.clientName}: Превышено максимальное количество попыток`,
        new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) exceeded`)
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    logWarning(
      `${this.clientName}: Переподключение ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleConnectionClose(): void {
    if (this.status === ConnectionStatus.SHUTTING_DOWN) {
      logSuccess(`${this.clientName}: Соединение закрыто (нормальное завершение)`);
      return;
    }

    this.status = ConnectionStatus.DISCONNECTED;
    this.stopPingPong();
    this.handleConnectionError();
  }

  /**
   * Отключение
   */
  public disconnect(): void {
    this.status = ConnectionStatus.SHUTTING_DOWN;
    this.stopPingPong();

    if (this.socket) {
      try {
        this.socket.close();
        logSuccess(`${this.clientName}: Соединение закрыто`);
      } catch (error) {
        logError(`${this.clientName}: Ошибка при закрытии`, error);
      }
    }

    this.status = ConnectionStatus.DISCONNECTED;
  }

  /**
   * Проверка статуса
   */
  public isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED || 
           this.status === ConnectionStatus.AUTHENTICATED;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Отправка сообщения
   */
  protected sendMessage(message: any): void {
    if (!this.socket || !this.isConnected()) {
      logWarning(`${this.clientName}: Не могу отправить сообщение - не подключен`);
      return;
    }

    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      logError(`${this.clientName}: Ошибка отправки сообщения`, error);
    }
  }

  // ============== ABSTRACT МЕТОДЫ (должны быть реализованы в наследниках) ==============

  /**
   * Создание ping сообщения (специфично для каждого API)
   */
  protected abstract createPingMessage(): any;

  /**
   * Проверка, является ли сообщение pong
   */
  protected abstract isPongMessage(message: any): boolean;

  /**
   * Обработка открытия соединения (для дополнительной логики в наследниках)
   */
  protected abstract onOpen(): void;

  /**
   * Обработка входящих сообщений (специфично для каждого клиента)
   */
  protected abstract onMessage(message: any): void;

  // ============== ОПЦИОНАЛЬНЫЕ CALLBACKS ==============

  protected onError(_error: any): void {
    // Можно переопределить в наследниках
  }

  protected onClose(_code: number, _reason: string): void {
    // Можно переопределить в наследниках
  }

  protected onPong(_message: any): void {
    // Можно переопределить в наследниках
  }
}
