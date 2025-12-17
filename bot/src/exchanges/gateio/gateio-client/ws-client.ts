const { WebSocket } = require('ws');

interface GateioWsConfig {
  pingInterval?: number;
  pingTimeout?: number;
  stateManager?: any;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export class GateioWebSocket {
  private wsUrl: string;
  private socket?: any;
  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private connected: boolean = false;
  private pingIntervalMs: number;
  private pingTimeoutMs: number;
  private stateManager?: any;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isShuttingDown: boolean = false;
  
  constructor(config?: GateioWsConfig) {
    this.wsUrl = 'wss://ws.gate.io/v4/';
    this.pingIntervalMs = config?.pingInterval || 15000;
    this.pingTimeoutMs = config?.pingTimeout || 3000;
    this.stateManager = config?.stateManager;
    this.maxReconnectAttempts = config?.maxReconnectAttempts || 10;
    this.reconnectDelay = config?.reconnectDelay || 1000;
  }
  
  public connect(): void {
    if (this.isShuttingDown) {
      console.log('⚠️  Gate.io WS: Завершение работы, подключение отменено');
      return;
    }
    
    console.log('🔄 Gate.io WS: Установка соединения...');
    
    try {
      this.socket = new WebSocket(this.wsUrl);
      
      this.socket.on('open', () => {
        console.log('✅ Gate.io WS: Соединение установлено успешно');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startPingPong();
      });
      
      this.socket.on('error', (error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Gate.io WS: Ошибка соединения:', errorMessage);
        this.handleConnectionError();
      });
      
      this.socket.on('close', (code: number, reason: string) => {
        console.log(`🔌 Gate.io WS: Соединение закрыто (${code}: ${reason})`);
        this.handleConnectionClose();
      });
      
      this.socket.on('message', (data: any) => {
        this.handleMessage(data);
      });
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка при создании соединения:', 
        error instanceof Error ? error.message : 'Неизвестная ошибка');
      this.handleConnectionError();
    }
  }
  
  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);

      if (message && message.result === 'pong') {
        console.log('🏓 Gate.io WS: Получен ответ от сервера (соединение активно)');
        this.resetPingTimeout();
        
        if (this.stateManager) {
          const pongData = {
            exchange: 'gateio',
            type: 'pong',
            timestamp: Date.now(),
            latency: this.pingTimeoutMs
          };
          
          this.stateManager.pubClient.publish('exchange:pong', JSON.stringify(pongData));
          console.log('📡 Gate.io WS: Опубликовано pong в Redis для ws-server');
        }
        
        return;
      }
      
      console.log('📩 Gate.io WS: Получено сообщение:', message);
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка обработки сообщения:', 
        error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }

  public sendPing(): void {
    if (!this.socket || !this.connected) {
      console.log('⚠️ Gate.io WS: Не могу отправить ping - соединение не активно');
      return;
    }
    
    const pingMessage = JSON.stringify({
      method: 'server.ping',
      params: [Math.floor(Date.now() / 1000)],
      id: 1
    });
    
    try {
      this.socket.send(pingMessage);
      console.log('🏓 Gate.io WS: Отправлен ping запрос');
      this.setupPingTimeout();
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка отправки ping:', 
        error instanceof Error ? error.message : 'Неизвестная ошибка');
      this.handleConnectionError();
    }
  }
  
  private startPingPong(): void {
    this.stopPingPong();
    
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
    
    console.log(`⏱️ Gate.io WS: Запущен механизм ping-pong (интервал: ${this.pingIntervalMs}ms, таймаут: ${this.pingTimeoutMs}ms)`);
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
      console.error('❌ Gate.io WS: Таймаут ожидания pong - соединение не отвечает');
      this.handleConnectionError();
    }, this.pingTimeoutMs);
  }
  
  private resetPingTimeout(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }
  
  private handleConnectionError(): void {
    if (this.isShuttingDown) {
      console.log('⚠️  Gate.io WS: Завершение работы, переподключение отменено');
      return;
    }
    
    this.connected = false;
    this.stopPingPong();
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Gate.io WS: Превышено максимальное количество попыток переподключения (${this.maxReconnectAttempts})`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );
    
    console.log(`🔄 Gate.io WS: Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  private handleConnectionClose(): void {
    if (this.isShuttingDown) {
      console.log('✅ Gate.io WS: Соединение закрыто (нормальное завершение)');
      return;
    }
    
    console.log('🔌 Gate.io WS: Соединение потеряно, попытка переподключения...');
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
        console.log('🔌 Gate.io WS: Соединение закрыто');
      } catch (error) {
        console.error('❌ Gate.io WS: Ошибка при закрытии соединения:', error);
      }
    }
    
    this.connected = false;
  }
  
  public getSocket(): WebSocket | undefined {
    return this.socket;
  }
  
  public isConnected(): boolean {
    return this.connected;
  }
}
