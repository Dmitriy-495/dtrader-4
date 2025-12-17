const { WebSocket } = require('ws');
import { baseConfig as config } from '../../../config/config';

export interface OrderBookLevel {
  price: string;
  amount: string;
}

export interface OrderBookSnapshot {
  contract: string;
  timestamp: number;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
}

export interface OrderBookUpdate {
  contract: string;
  timestamp: number;
  asks?: OrderBookLevel[];
  bids?: OrderBookLevel[];
  event: 'update' | 'snapshot';
}

export interface BestBidAsk {
  contract: string;
  timestamp: number;
  bestBid: OrderBookLevel | null;
  bestAsk: OrderBookLevel | null;
  spread: number;
  spreadPercent: number;
}

interface OrderBookWsConfig {
  depth?: number;
  updateSpeed?: string;
  stateManager?: any;
  onOrderBookUpdate?: (update: OrderBookUpdate) => void;
  onBestBidAsk?: (data: BestBidAsk) => void;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export class OrderBookWebSocket {
  private wsUrl: string;
  private socket?: any;
  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private connected: boolean = false;
  private depth: number;
  private updateSpeed: string;
  private subscribedPairs: Set<string> = new Set();
  
  // Callbacks
  private onOrderBookUpdate?: (update: OrderBookUpdate) => void;
  private onBestBidAsk?: (data: BestBidAsk) => void;
  
  // Connection management
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isShuttingDown: boolean = false;
  
  // State manager для публикации в Redis
  private stateManager?: any;
  
  // Order book cache для вычисления best bid/ask
  private orderBooks: Map<string, OrderBookSnapshot> = new Map();

  constructor(config?: OrderBookWsConfig) {
    this.wsUrl = baseConfig.exchange.futuresWsUrl || 'wss://fx-ws.gateio.ws/v4/ws/usdt';
    this.depth = config?.depth || 20;
    this.updateSpeed = config?.updateSpeed || '100ms';
    this.stateManager = config?.stateManager;
    this.onOrderBookUpdate = config?.onOrderBookUpdate;
    this.onBestBidAsk = config?.onBestBidAsk;
    this.maxReconnectAttempts = config?.maxReconnectAttempts || 10;
    this.reconnectDelay = config?.reconnectDelay || 1000;
  }

  public connect(): void {
    if (this.isShuttingDown) {
      console.log('⚠️  OrderBook WS: Завершение работы, подключение отменено');
      return;
    }

    console.log('🔄 OrderBook WS: Установка соединения...');
    console.log(`   URL: ${this.wsUrl}`);
    console.log(`   Глубина: ${this.depth}`);

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.on('open', () => {
        console.log('✅ OrderBook WS: Соединение установлено');
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Подписываемся на торговые пары
        this.subscribeToConfiguredPairs();
        
        this.startPingPong();
      });

      this.socket.on('error', (error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ OrderBook WS: Ошибка соединения:', errorMessage);
        this.handleConnectionError();
      });

      this.socket.on('close', (code: number, reason: string) => {
        console.log(`🔌 OrderBook WS: Соединение закрыто (${code}: ${reason})`);
        this.handleConnectionClose();
      });

      this.socket.on('message', (data: any) => {
        this.handleMessage(data);
      });

    } catch (error) {
      console.error('❌ OrderBook WS: Ошибка при создании соединения:',
        error instanceof Error ? error.message : 'Неизвестная ошибка');
      this.handleConnectionError();
    }
  }

  /**
   * Подписка на торговые пары из конфигурации
   */
  private subscribeToConfiguredPairs(): void {
    const pairs = config.orderBook.pairs;
    
    if (pairs.length === 0) {
      console.warn('⚠️  OrderBook WS: Нет настроенных торговых пар');
      return;
    }

    console.log(`📊 OrderBook WS: Подписка на ${pairs.length} пар(ы)...`);
    
    pairs.forEach(pair => {
      this.subscribeToPair(pair.symbol);
    });
  }

  /**
   * Подписка на order book конкретной пары
   */
  public subscribeToPair(contract: string): void {
    if (!this.connected || !this.socket) {
      console.warn(`⚠️  OrderBook WS: Не подключено, отложена подписка на ${contract}`);
      return;
    }

    const subscribeMessage = {
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.order_book',
      event: 'subscribe',
      payload: [contract, this.depth.toString(), this.updateSpeed]
    };

    try {
      this.socket.send(JSON.stringify(subscribeMessage));
      this.subscribedPairs.add(contract);
      console.log(`✅ OrderBook WS: Подписка на ${contract} (глубина: ${this.depth})`);
    } catch (error) {
      console.error(`❌ OrderBook WS: Ошибка подписки на ${contract}:`, error);
    }
  }

  /**
   * Отписка от пары
   */
  public unsubscribeFromPair(contract: string): void {
    if (!this.connected || !this.socket) {
      return;
    }

    const unsubscribeMessage = {
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.order_book',
      event: 'unsubscribe',
      payload: [contract]
    };

    try {
      this.socket.send(JSON.stringify(unsubscribeMessage));
      this.subscribedPairs.delete(contract);
      this.orderBooks.delete(contract);
      console.log(`🔕 OrderBook WS: Отписка от ${contract}`);
    } catch (error) {
      console.error(`❌ OrderBook WS: Ошибка отписки от ${contract}:`, error);
    }
  }

  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);

      // Обработка pong
      if (message && message.event === 'pong') {
        this.resetPingTimeout();
        return;
      }

      // Обработка подтверждения подписки
      if (message && message.event === 'subscribe') {
        console.log(`✅ OrderBook WS: Подтверждение подписки на ${message.result?.contract}`);
        return;
      }

      // Обработка обновлений order book
      if (message && message.channel === 'futures.order_book' && message.event === 'update') {
        this.handleOrderBookUpdate(message);
      }

    } catch (error) {
      console.error('❌ OrderBook WS: Ошибка обработки сообщения:',
        error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }

  /**
   * Обработка обновления order book
   */
  private handleOrderBookUpdate(message: any): void {
    try {
      const result = message.result;
      
      if (!result || !result.t || !result.s) {
        return;
      }

      const contract = result.s; // contract symbol
      const timestamp = result.t; // timestamp in milliseconds
      const asks = result.asks || [];
      const bids = result.bids || [];

      // Создаем объект обновления
      const update: OrderBookUpdate = {
        contract,
        timestamp,
        asks: asks.map((level: any) => ({
          price: level.p,
          amount: level.s
        })),
        bids: bids.map((level: any) => ({
          price: level.p,
          amount: level.s
        })),
        event: 'update'
      };

      // Обновляем локальный кэш order book
      this.updateOrderBookCache(contract, update);

      // Вычисляем best bid/ask
      const bestBidAsk = this.calculateBestBidAsk(contract);

      // Вызываем callbacks
      if (this.onOrderBookUpdate) {
        this.onOrderBookUpdate(update);
      }

      if (bestBidAsk && this.onBestBidAsk) {
        this.onBestBidAsk(bestBidAsk);
      }

      // Публикуем в Redis
      this.publishToRedis(contract, update, bestBidAsk);

    } catch (error) {
      console.error('❌ OrderBook WS: Ошибка обработки обновления:', error);
    }
  }

  /**
   * Обновление локального кэша order book
   */
  private updateOrderBookCache(contract: string, update: OrderBookUpdate): void {
    let orderBook = this.orderBooks.get(contract);

    if (!orderBook) {
      // Создаем новый order book
      orderBook = {
        contract,
        timestamp: update.timestamp,
        asks: update.asks || [],
        bids: update.bids || []
      };
    } else {
      // Обновляем существующий
      orderBook.timestamp = update.timestamp;
      if (update.asks) orderBook.asks = update.asks;
      if (update.bids) orderBook.bids = update.bids;
    }

    this.orderBooks.set(contract, orderBook);
  }

  /**
   * Вычисление best bid/ask из order book
   */
  private calculateBestBidAsk(contract: string): BestBidAsk | null {
    const orderBook = this.orderBooks.get(contract);
    
    if (!orderBook) {
      return null;
    }

    const bestBid = orderBook.bids.length > 0 ? orderBook.bids[0] : null;
    const bestAsk = orderBook.asks.length > 0 ? orderBook.asks[0] : null;

    let spread = 0;
    let spreadPercent = 0;

    if (bestBid && bestAsk) {
      spread = parseFloat(bestAsk.price) - parseFloat(bestBid.price);
      const midPrice = (parseFloat(bestAsk.price) + parseFloat(bestBid.price)) / 2;
      spreadPercent = (spread / midPrice) * 100;
    }

    return {
      contract,
      timestamp: orderBook.timestamp,
      bestBid,
      bestAsk,
      spread,
      spreadPercent
    };
  }

  /**
   * Публикация данных в Redis
   */
  private async publishToRedis(
    contract: string,
    update: OrderBookUpdate,
    bestBidAsk: BestBidAsk | null
  ): Promise<void> {
    if (!this.stateManager) {
      return;
    }

    try {
      // Публикуем order book update
      await this.stateManager.pubClient.publish(
        'orderbook:update',
        JSON.stringify({
          type: 'orderbook_update',
          data: update,
          timestamp: Date.now()
        })
      );

      // Публикуем best bid/ask
      if (bestBidAsk) {
        await this.stateManager.pubClient.publish(
          'orderbook:best',
          JSON.stringify({
            type: 'best_bid_ask',
            data: bestBidAsk,
            timestamp: Date.now()
          })
        );
      }

    } catch (error) {
      console.error('❌ OrderBook WS: Ошибка публикации в Redis:', error);
    }
  }

  /**
   * Получить текущий order book для пары
   */
  public getOrderBook(contract: string): OrderBookSnapshot | null {
    return this.orderBooks.get(contract) || null;
  }

  /**
   * Получить текущий best bid/ask для пары
   */
  public getBestBidAsk(contract: string): BestBidAsk | null {
    return this.calculateBestBidAsk(contract);
  }

  /**
   * Получить список подписанных пар
   */
  public getSubscribedPairs(): string[] {
    return Array.from(this.subscribedPairs);
  }

  private sendPing(): void {
    if (!this.socket || !this.connected) {
      return;
    }

    const pingMessage = JSON.stringify({
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.ping'
    });

    try {
      this.socket.send(pingMessage);
      this.setupPingTimeout();
    } catch (error) {
      console.error('❌ OrderBook WS: Ошибка отправки ping:', error);
      this.handleConnectionError();
    }
  }

  private startPingPong(): void {
    this.stopPingPong();

    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 15000);
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

  private setupPingTimeout(): void {
    this.pingTimeout = setTimeout(() => {
      console.error('❌ OrderBook WS: Таймаут ожидания pong');
      this.handleConnectionError();
    }, 3000);
  }

  private resetPingTimeout(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  private handleConnectionError(): void {
    if (this.isShuttingDown) {
      return;
    }

    this.connected = false;
    this.stopPingPong();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ OrderBook WS: Превышено максимальное количество попыток (${this.maxReconnectAttempts})`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    console.log(`🔄 OrderBook WS: Переподключение ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleConnectionClose(): void {
    if (this.isShuttingDown) {
      console.log('✅ OrderBook WS: Соединение закрыто (нормальное завершение)');
      return;
    }

    this.connected = false;
    this.stopPingPong();
    this.handleConnectionError();
  }

  public disconnect(): void {
    this.isShuttingDown = true;
    this.stopPingPong();

    if (this.socket) {
      try {
        this.socket.close();
        console.log('🔌 OrderBook WS: Соединение закрыто');
      } catch (error) {
        console.error('❌ OrderBook WS: Ошибка при закрытии:', error);
      }
    }

    this.connected = false;
    this.subscribedPairs.clear();
    this.orderBooks.clear();
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
