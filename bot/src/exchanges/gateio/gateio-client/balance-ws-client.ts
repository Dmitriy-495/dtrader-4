const { WebSocket } = require('ws');
import { GateIOWsSignature } from '../crypto/signature-ws';
import { baseConfig as config } from '../../../config/config';

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
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export class BalanceWebSocket {
  private wsUrl: string = 'wss://fx-ws.gateio.ws/v4/ws/usdt';
  private socket?: any;
  private connected: boolean = false;
  private authenticated: boolean = false;
  private apiKey: string;
  private apiSecret: string;
  private wsSignature: GateIOWsSignature;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isShuttingDown: boolean = false;
  private pingInterval?: NodeJS.Timeout;
  private onBalanceUpdate?: (balances: BalanceUpdate[]) => void;
  
  constructor(config: BalanceWsConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.wsSignature = new GateIOWsSignature({ apiSecret: this.apiSecret });
    this.onBalanceUpdate = config.onBalanceUpdate;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectDelay = config.reconnectDelay || 1000;
  }
  
  public connect(): void {
    if (this.isShuttingDown) {
      console.log('⚠️  Balance WS: Завершение работы, подключение отменено');
      return;
    }
    
    console.log('🔄 Balance WS: Установка соединения...');
    console.log(`   URL: ${this.wsUrl}`);
    
    try {
      this.socket = new WebSocket(this.wsUrl);
      
      this.socket.on('open', () => {
        console.log('✅ Balance WS: Соединение установлено');
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Аутентификация
        this.authenticate();
      });
      
      this.socket.on('error', (error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Balance WS: Ошибка соединения:', errorMessage);
        this.handleConnectionError();
      });
      
      this.socket.on('close', (code: number, reason: string) => {
        console.log(`🔌 Balance WS: Соединение закрыто (${code}: ${reason})`);
        this.handleConnectionClose();
      });
      
      this.socket.on('message', (data: any) => {
        this.handleMessage(data);
      });
      
    } catch (error) {
      console.error('❌ Balance WS: Ошибка при создании соединения:', error);
      this.handleConnectionError();
    }
  }
  
  private authenticate(): void {
    try {
      // Создаем подпись для аутентификации
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
      
      console.log('🔐 Balance WS: Отправка аутентификации...');
      this.socket.send(JSON.stringify(authMessage));
      
    } catch (error) {
      console.error('❌ Balance WS: Ошибка аутентификации:', error);
    }
  }
  
  private subscribeToBalances(): void {
    try {
      const subscribeMessage = {
        time: Math.floor(Date.now() / 1000),
        channel: 'futures.balances',
        event: 'subscribe',
        payload: ['!all'] // Подписка на все валюты
      };
      
      console.log('📡 Balance WS: Подписка на обновления баланса...');
      this.socket.send(JSON.stringify(subscribeMessage));
      
      // Запускаем ping-pong
      this.startPingPong();
      
    } catch (error) {
      console.error('❌ Balance WS: Ошибка подписки:', error);
    }
  }
  
  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);
      
      // Обработка успешной аутентификации
      if (message.channel === 'futures.login' && message.event === 'api') {
        if (message.error) {
          console.error('❌ Balance WS: Ошибка аутентификации:', message.error);
          return;
        }
        
        console.log('✅ Balance WS: Аутентификация успешна');
        this.authenticated = true;
        this.subscribeToBalances();
        return;
      }
      
      // Обработка подтверждения подписки
      if (message.channel === 'futures.balances' && message.event === 'subscribe') {
        console.log('✅ Balance WS: Подписка подтверждена');
        return;
      }
      
      // Обработка обновления баланса
      if (message.channel === 'futures.balances' && message.event === 'update') {
        this.handleBalanceUpdate(message);
        return;
      }
      
      // Обработка pong
      if (message.event === 'pong') {
        // Pong получен
        return;
      }
      
    } catch (error) {
      console.error('❌ Balance WS: Ошибка обработки сообщения:', error);
    }
  }
  
  private handleBalanceUpdate(message: any): void {
    try {
      const result = message.result;
      
      if (!result || !Array.isArray(result)) {
        return;
      }
      
      console.log('💰 Balance WS: Получено обновление баланса');
      
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
      
      console.log(`✅ Balance WS: Обработано ${balances.length} валют`);
      
    } catch (error) {
      console.error('❌ Balance WS: Ошибка обработки обновления баланса:', error);
    }
  }
  
  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.socket && this.connected) {
        const pingMessage = {
          time: Math.floor(Date.now() / 1000),
          channel: 'futures.ping'
        };
        
        try {
          this.socket.send(JSON.stringify(pingMessage));
        } catch (error) {
          console.error('❌ Balance WS: Ошибка отправки ping:', error);
        }
      }
    }, 15000);
  }
  
  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }
  
  private handleConnectionError(): void {
    if (this.isShuttingDown) {
      return;
    }
    
    this.connected = false;
    this.authenticated = false;
    this.stopPingPong();
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Balance WS: Превышено максимальное количество попыток (${this.maxReconnectAttempts})`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );
    
    console.log(`🔄 Balance WS: Переподключение ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  private handleConnectionClose(): void {
    if (this.isShuttingDown) {
      console.log('✅ Balance WS: Соединение закрыто (нормальное завершение)');
      return;
    }
    
    this.connected = false;
    this.authenticated = false;
    this.stopPingPong();
    this.handleConnectionError();
  }
  
  public disconnect(): void {
    this.isShuttingDown = true;
    this.stopPingPong();
    
    if (this.socket) {
      try {
        this.socket.close();
        console.log('🔌 Balance WS: Соединение закрыто');
      } catch (error) {
        console.error('❌ Balance WS: Ошибка при закрытии:', error);
      }
    }
    
    this.connected = false;
    this.authenticated = false;
  }
  
  public isConnected(): boolean {
    return this.connected && this.authenticated;
  }
}
