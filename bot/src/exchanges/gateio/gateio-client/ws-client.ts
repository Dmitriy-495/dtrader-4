// Базовый класс для WebSocket соединения с Gate.io
// С поддержкой механизма ping-pong

const { WebSocket } = require('ws');

export class GateioWebSocket {
  private wsUrl: string;
  private socket?: any;
  private pingInterval?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private connected: boolean = false;
  private pingIntervalMs: number;
  private pingTimeoutMs: number;
  private stateManager?: any; // Добавляем StateManager для публикации в Redis
  
  constructor(config?: { pingInterval?: number; pingTimeout?: number; stateManager?: any }) {
    // Используем основную сеть для WebSocket API v4 (spot trading)
    this.wsUrl = 'wss://ws.gate.io/v4/';
    this.pingIntervalMs = config?.pingInterval || 5000; // 5 секунд по умолчанию
    this.pingTimeoutMs = config?.pingTimeout || 3000; // 3 секунды по умолчанию
    this.stateManager = config?.stateManager; // Сохраняем StateManager
  }
  
  // Метод для базового соединения
  public connect(): void {
    console.log('🔄 Gate.io WS: Установка соединения...');
    
    try {
      this.socket = new WebSocket(this.wsUrl);
      
      this.socket.on('open', () => {
        console.log('✅ Gate.io WS: Соединение установлено успешно');
        this.connected = true;
        
        // Для ping-pong аутентификация не требуется
        // if (this.apiKey && this.signatureGenerator) {
        //   this.authenticate();
        // }
        
        this.startPingPong(); // Запускаем механизм ping-pong после подключения
      });
      
      this.socket.on('error', (error: any) => {
        const errorMessage = error instanceof Error ? error.message : (error && error.toString()) || 'Неизвестная ошибка';
        console.error('❌ Gate.io WS: Ошибка соединения:', errorMessage);
        console.error('📌 Подробности ошибки:', error);
        this.handleConnectionError();
      });
      
      this.socket.on('close', () => {
        console.log('🔌 Gate.io WS: Соединение закрыто');
        this.handleConnectionClose();
      });
      
      this.socket.on('message', (data: any) => {
        this.handleMessage(data);
      });
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка при создании соединения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }
  
  // Метод для обработки входящих сообщений
  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data);

      // Для Gate.io API v4 ответ на ping приходит в виде {"result":"pong"}
      if (message && message.result === 'pong') {
        console.log('🏓 Gate.io WS: Получен ответ от сервера (соединение активно)');
        this.resetPingTimeout(); // Сбрасываем таймаут при получении ответа
        
        // Публикуем pong в Redis для ws-server
        if (this.stateManager) {
          const pongData = {
            exchange: 'gateio',
            type: 'pong',
            timestamp: Date.now(),
            latency: this.pingTimeoutMs // Используем pingTimeoutMs как задержку
          };
          
          this.stateManager.pubClient.publish('exchange:pong', JSON.stringify(pongData));
          console.log('📡 Gate.io WS: Опубликовано pong в Redis для ws-server');
        }
        
        return;
      }
      
      // Обработка других типов сообщений
      console.log('📩 Gate.io WS: Получено сообщение:', message);
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка обработки сообщения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }
  

  // Метод для отправки ping
  public sendPing(): void {
    if (!this.socket || !this.connected) {
      console.log('⚠️ Gate.io WS: Не могу отправить ping - соединение не активно');
      return;
    }
    
    // Отправляем ping в правильном формате для Gate.io API v4 (с методом)
    const pingMessage = JSON.stringify({
      method: 'server.ping',
      params: [Math.floor(Date.now() / 1000)],
      id: 1
    });
    
    try {
      this.socket.send(pingMessage);
      console.log('🏓 Gate.io WS: Отправлен ping запрос');
      
      // Устанавливаем таймаут ожидания pong
      this.setupPingTimeout();
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка отправки ping:', error instanceof Error ? error.message : 'Неизвестная ошибка');
      this.handleConnectionError();
    }
  }
  
  // Метод для запуска автоматического ping-pong
  private startPingPong(): void {
    // Очищаем существующие таймеры
    this.stopPingPong();
    
    // Запускаем периодический ping
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
    
    console.log(`⏱️ Gate.io WS: Запущен механизм ping-pong (интервал: ${this.pingIntervalMs}ms, таймаут: ${this.pingTimeoutMs}ms)`);
  }
  
  // Метод для остановки ping-pong
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
  
  // Метод для установки таймаута ожидания pong
  private setupPingTimeout(): void {
    this.pingTimeout = setTimeout(() => {
      console.error('❌ Gate.io WS: Таймаут ожидания pong - соединение не отвечает');
      this.handleConnectionError();
    }, this.pingTimeoutMs);
  }
  
  // Метод для сброса таймаута ожидания pong
  private resetPingTimeout(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }
  
  // Метод для обработки ошибок соединения
  private handleConnectionError(): void {
    console.error('❌ Gate.io WS: Ошибка соединения - попытка переподключения...');
    this.connected = false;
    this.stopPingPong();
    
    // Пытаемся переподключиться через 10 секунд (увеличиваем задержку)
    setTimeout(() => {
      console.log('🔄 Gate.io WS: Пытаемся переподключиться...');
      this.connect();
    }, 10000);
  }
  
  // Метод для обработки закрытия соединения
  private handleConnectionClose(): void {
    console.log('🔌 Gate.io WS: Соединение закрыто');
    this.connected = false;
    this.stopPingPong();
  }
  
  // Метод для закрытия соединения
  public disconnect(): void {
    this.stopPingPong();
    if (this.socket) {
      this.socket.close();
      console.log('🔌 Gate.io WS: Соединение закрыто');
    }
  }
  
  // Метод для получения текущего сокета (если нужно)
  public getSocket(): WebSocket | undefined {
    return this.socket;
  }
  
  // Метод для проверки состояния соединения
  public isConnected(): boolean {
    return this.connected;
  }
}