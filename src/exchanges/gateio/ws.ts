// Базовый класс для WebSocket соединения с Gate.io
// Только подключение, без подписок

import WebSocket from 'ws';

export class GateioWebSocket {
  private wsUrl: string;
  private socket?: WebSocket;
  
  constructor() {
    this.wsUrl = 'wss://api.gateio.ws/ws/v4/';
  }
  
  // Метод для базового соединения
  public connect(): void {
    console.log('🔄 Gate.io WS: Установка соединения...');
    
    try {
      this.socket = new WebSocket(this.wsUrl);
      
      this.socket.on('open', () => {
        console.log('✅ Gate.io WS: Соединение установлено успешно');
      });
      
      this.socket.on('error', (error) => {
        console.error('❌ Gate.io WS: Ошибка соединения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
      });
      
      this.socket.on('close', () => {
        console.log('🔌 Gate.io WS: Соединение закрыто');
      });
      
    } catch (error) {
      console.error('❌ Gate.io WS: Ошибка при создании соединения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }
  
  // Метод для закрытия соединения
  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      console.log('🔌 Gate.io WS: Соединение закрыто');
    }
  }
  
  // Метод для получения текущего сокета (если нужно)
  public getSocket(): WebSocket | undefined {
    return this.socket;
  }
}