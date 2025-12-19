import { BaseGateIOWebSocket, ConnectionStatus } from './base-ws-client';
import { GateIOWsSignature } from '../crypto/signature-ws';
import { logInfo, logSuccess, logError } from '../../../core/logger';

interface BalanceUpdate {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

interface BalanceWsConfig {
  apiKey: string;
  apiSecret: string;
  onBalanceUpdate?: (balances: BalanceUpdate[]) => void;
}

/**
 * WebSocket клиент для получения обновлений баланса Gate.io Futures
 * Наследуется от BaseGateIOWebSocket
 */
export class BalanceWebSocket extends BaseGateIOWebSocket {
  private apiKey: string;
  private apiSecret: string;
  private wsSignature: GateIOWsSignature;
  private onBalanceUpdate?: (balances: BalanceUpdate[]) => void;
  private isAuthenticated: boolean = false;

  constructor(config: BalanceWsConfig) {
    // Вызываем конструктор базового класса
    super({
      url: 'wss://fx-ws.gateio.ws/v4/ws/usdt',
      pingInterval: 15000,
      pingTimeout: 3000,
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      name: 'Balance-WS'
    });

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.wsSignature = new GateIOWsSignature({ apiSecret: this.apiSecret });
    this.onBalanceUpdate = config.onBalanceUpdate;
  }

  // ============== РЕАЛИЗАЦИЯ ABSTRACT МЕТОДОВ ==============

  /**
   * Создание ping сообщения для Futures API
   */
  protected createPingMessage(): any {
    return {
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.ping'
    };
  }

  /**
   * Проверка pong сообщения
   */
  protected isPongMessage(message: any): boolean {
    return message.event === 'pong' || message.channel === 'futures.pong';
  }

  /**
   * При открытии соединения - запускаем аутентификацию
   */
  protected onOpen(): void {
    this.isAuthenticated = false;
    this.authenticate();
  }

  /**
   * Обработка входящих сообщений
   */
  protected onMessage(message: any): void {
    // Обработка успешной аутентификации
    if (message.channel === 'futures.login' && message.event === 'api') {
      this.handleAuthResponse(message);
      return;
    }

    // Обработка подтверждения подписки
    if (message.channel === 'futures.balances' && message.event === 'subscribe') {
      logSuccess(`${this.clientName}: Подписка на баланс подтверждена`);
      return;
    }

    // Обработка обновления баланса
    if (message.channel === 'futures.balances' && message.event === 'update') {
      this.handleBalanceUpdate(message);
      return;
    }
  }

  /**
   * При закрытии соединения - сбрасываем флаг аутентификации
   */
  protected onClose(code: number, reason: string): void {
    this.isAuthenticated = false;
    this.status = ConnectionStatus.DISCONNECTED;
  }

  // ============== ЛОГИКА АУТЕНТИФИКАЦИИ ==============

  /**
   * Аутентификация через API ключи
   */
  private authenticate(): void {
    try {
      const authPayload = this.wsSignature.authForChannel(
        this.apiKey,
        'futures.balances',
        'subscribe'
      );

      const authMessage = {
        time: Math.floor(Date.now() / 1000),
        channel: 'futures.login',
        event: 'api',
        payload: authPayload
      };

      logInfo(`${this.clientName}: Отправка аутентификации...`);
      this.sendMessage(authMessage);
    } catch (error) {
      logError(`${this.clientName}: Ошибка аутентификации`, error);
    }
  }

  /**
   * Обработка ответа на аутентификацию
   */
  private handleAuthResponse(message: any): void {
    if (message.error) {
      logError(`${this.clientName}: Ошибка аутентификации`, new Error(JSON.stringify(message.error)));
      this.isAuthenticated = false;
      return;
    }

    logSuccess(`${this.clientName}: Аутентификация успешна`);
    this.isAuthenticated = true;
    this.status = ConnectionStatus.AUTHENTICATED;

    // После успешной аутентификации - подписываемся на баланс
    this.subscribeToBalances();
  }

  // ============== ЛОГИКА ПОДПИСКИ НА БАЛАНС ==============

  /**
   * Подписка на обновления баланса
   */
  private subscribeToBalances(): void {
    try {
      const subscribeMessage = {
        time: Math.floor(Date.now() / 1000),
        channel: 'futures.balances',
        event: 'subscribe',
        payload: ['!all'] // Подписка на все валюты
      };

      logInfo(`${this.clientName}: Подписка на обновления баланса...`);
      this.sendMessage(subscribeMessage);
    } catch (error) {
      logError(`${this.clientName}: Ошибка подписки на баланс`, error);
    }
  }

  /**
   * Обработка обновления баланса
   */
  private handleBalanceUpdate(message: any): void {
    try {
      const result = message.result;

      if (!result || !Array.isArray(result)) {
        return;
      }

      logInfo(`${this.clientName}: Получено обновление баланса`);

      // Конвертируем в нужный формат
      const balances: BalanceUpdate[] = result.map((item: any) => {
        const available = parseFloat(item.available || '0');
        const locked = parseFloat(item.locked || '0');

        return {
          currency: item.currency,
          available: item.available || '0',
          locked: item.locked || '0',
          total: (available + locked).toString()
        };
      });

      // Вызываем callback
      if (this.onBalanceUpdate) {
        this.onBalanceUpdate(balances);
      }

      logSuccess(`${this.clientName}: Обработано ${balances.length} валют`);
    } catch (error) {
      logError(`${this.clientName}: Ошибка обработки обновления баланса`, error);
    }
  }

  // ============== ПУБЛИЧНЫЕ МЕТОДЫ ==============

  /**
   * Проверка, аутентифицирован ли клиент
   */
  public isAuthenticated(): boolean {
    return this.isAuthenticated && this.isConnected();
  }

  /**
   * Переопределяем isConnected для учёта аутентификации
   */
  public isConnected(): boolean {
    return this.status === ConnectionStatus.AUTHENTICATED;
  }
}
