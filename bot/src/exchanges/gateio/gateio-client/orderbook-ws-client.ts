const { WebSocket } = require('ws');

export interface OrderBookSnapshot {
  contract: string;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
  timestamp: number;
}

export interface BestBidAsk {
  contract: string;
  bestBid: { price: string; size: string } | null;
  bestAsk: { price: string; size: string } | null;
  spread: number;
  spreadPercent: number;
  timestamp: number;
}

interface OrderBookConfig {
  depth?: number;
  updateSpeed?: string;
  stateManager?: any;
  onOrderBookUpdate?: (update: OrderBookSnapshot) => void;
  onBestBidAsk?: (data: BestBidAsk) => void;
}

export class OrderBookWebSocket {
  private wsUrl: string = 'wss://fx-ws.gateio.ws/v4/ws/usdt';
  private socket?: any;
  private connected: boolean = false;
  private depth: number;
  private updateSpeed: string;
  private subscribedPairs: Set<string> = new Set();
  private orderBooks: Map<string, OrderBookSnapshot> = new Map();
  private onOrderBookUpdate?: (update: OrderBookSnapshot) => void;
  private onBestBidAsk?: (data: BestBidAsk) => void;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private isShuttingDown: boolean = false;
  private pingInterval?: NodeJS.Timeout;

  constructor(config: OrderBookConfig) {
    this.depth = config.depth || 20;
    this.updateSpeed = config.updateSpeed || '100ms';
    this.onOrderBookUpdate = config.onOrderBookUpdate;
    this.onBestBidAsk = config.onBestBidAsk;
  }

  public connect(): void {
    if (this.isShuttingDown) {
      console.log('⚠️  Order Book WS: Завершение работы, подключение отменено');
      return;
    }

    console.log('🔄 Order Book WS: Установка соединения...');

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.on('open', () => {
        console.log('✅ Order Book WS: Соединение установлено');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startPingPong();
      });

      this.socket.on('error', (error: any) => {
        console.error('❌ Order Book WS: Ошибка:', error);
        this.handleConnectionError();
      });

      this.socket.on('close', () => {
        console.log('🔌 Order Book WS: Соединение закрыто');
        this.handleConnectionClose();
      });

      this.socket.on('message', (data: any) => {
        this.handleMessage(data);
      });
    } catch (error) {
      console.error('❌ Order Book WS: Ошибка создания соединения:', error);
      this.handleConnectionError();
    }
  }

  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);

      if (message.event === 'update' && message.channel === 'futures.order_book') {
        this.processOrderBookUpdate(message);
      }
    } catch (error) {
      console.error('❌ Order Book WS: Ошибка обработки сообщения:', error);
    }
  }

  private processOrderBookUpdate(message: any): void {
    const contract = message.result?.contract;
    if (!contract) return;

    const snapshot: OrderBookSnapshot = {
      contract,
      bids: message.result?.bids || [],
      asks: message.result?.asks || [],
      timestamp: Date.now()
    };

    this.orderBooks.set(contract, snapshot);

    if (this.onOrderBookUpdate) {
      this.onOrderBookUpdate(snapshot);
    }

    this.calculateBestBidAsk(snapshot);
  }

  private calculateBestBidAsk(snapshot: OrderBookSnapshot): void {
    const bestBid = snapshot.bids.length > 0 ? {
      price: snapshot.bids[0][0],
      size: snapshot.bids[0][1]
    } : null;

    const bestAsk = snapshot.asks.length > 0 ? {
      price: snapshot.asks[0][0],
      size: snapshot.asks[0][1]
    } : null;

    let spread = 0;
    let spreadPercent = 0;

    if (bestBid && bestAsk) {
      const bidPrice = parseFloat(bestBid.price);
      const askPrice = parseFloat(bestAsk.price);
      spread = askPrice - bidPrice;
      spreadPercent = (spread / bidPrice) * 100;
    }

    const bestBidAsk: BestBidAsk = {
      contract: snapshot.contract,
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      timestamp: Date.now()
    };

    if (this.onBestBidAsk) {
      this.onBestBidAsk(bestBidAsk);
    }
  }

  public subscribeToPair(pair: string): void {
    if (!this.socket || !this.connected) {
      console.log('⚠️  Order Book WS: Не подключен, отложенная подписка');
      this.subscribedPairs.add(pair);
      return;
    }

    const subscribeMessage = {
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.order_book',
      event: 'subscribe',
      payload: [pair, this.depth.toString(), this.updateSpeed]
    };

    this.socket.send(JSON.stringify(subscribeMessage));
    this.subscribedPairs.add(pair);
    console.log(`📡 Order Book WS: Подписка на ${pair}`);
  }

  public unsubscribeFromPair(pair: string): void {
    if (!this.socket || !this.connected) {
      this.subscribedPairs.delete(pair);
      return;
    }

    const unsubscribeMessage = {
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.order_book',
      event: 'unsubscribe',
      payload: [pair]
    };

    this.socket.send(JSON.stringify(unsubscribeMessage));
    this.subscribedPairs.delete(pair);
    this.orderBooks.delete(pair);
    console.log(`📡 Order Book WS: Отписка от ${pair}`);
  }

  public getOrderBook(pair: string): OrderBookSnapshot | null {
    return this.orderBooks.get(pair) || null;
  }

  public getBestBidAsk(pair: string): BestBidAsk | null {
    const snapshot = this.orderBooks.get(pair);
    if (!snapshot) return null;

    const bestBid = snapshot.bids.length > 0 ? {
      price: snapshot.bids[0][0],
      size: snapshot.bids[0][1]
    } : null;

    const bestAsk = snapshot.asks.length > 0 ? {
      price: snapshot.asks[0][0],
      size: snapshot.asks[0][1]
    } : null;

    let spread = 0;
    let spreadPercent = 0;

    if (bestBid && bestAsk) {
      const bidPrice = parseFloat(bestBid.price);
      const askPrice = parseFloat(bestAsk.price);
      spread = askPrice - bidPrice;
      spreadPercent = (spread / bidPrice) * 100;
    }

    return {
      contract: pair,
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      timestamp: Date.now()
    };
  }

  public getSubscribedPairs(): string[] {
    return Array.from(this.subscribedPairs);
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
          console.error('❌ Order Book WS: Ошибка ping:', error);
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
    if (this.isShuttingDown) return;

    this.connected = false;
    this.stopPingPong();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Order Book WS: Превышено максимальное количество попыток`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    console.log(`🔄 Order Book WS: Переподключение ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleConnectionClose(): void {
    if (this.isShuttingDown) {
      console.log('✅ Order Book WS: Соединение закрыто (нормальное завершение)');
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
        console.log('🔌 Order Book WS: Соединение закрыто');
      } catch (error) {
        console.error('❌ Order Book WS: Ошибка закрытия:', error);
      }
    }

    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
