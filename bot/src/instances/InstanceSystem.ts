// Instance System для bot инстанса
// Упрощенная версия для работы в рамках одного инстанса

import { getStateManager, BalanceState } from '../core/StateManager';
import { logInfo, logSuccess, logError } from '../core/logger';
import { GateioWebSocket } from '../exchanges/gateio/gateio-client/ws-client';

export class InstanceSystem {
  private stateManager: ReturnType<typeof getStateManager>;
  private isRunning: boolean;
  private wsClient?: GateioWebSocket;
  
  constructor() {
    this.stateManager = getStateManager();
    this.isRunning = false;
    logSuccess('Instance System для bot инстанса инициализирован');
  }
  
  // Запуск системы
  async start() {
    try {
      if (this.isRunning) {
        logInfo('Instance System уже запущен');
        return true;
      }
      
      logInfo('Запуск Instance System для bot инстанса...');
      
      // Проверяем соединение с Redis (просто пытаемся получить текущий баланс)
      await this.stateManager.getCurrentBalance();
      
      // Инициализируем WebSocket соединение с механизмом ping-pong
      this.wsClient = new GateioWebSocket({
        pingInterval: 15000,  // 15 секунд
        pingTimeout: 3000,     // 3 секунды
        stateManager: this.stateManager // Передаем StateManager для публикации в Redis
      });
      this.wsClient.connect();
      
      this.isRunning = true;
      logSuccess('Instance System для bot инстанса запущен');
      
      return true;
      
    } catch (error) {
      logError('Ошибка запуска Instance System', error);
      throw error;
    }
  }
  
  // Остановка системы
  async stop() {
    try {
      if (!this.isRunning) {
        logInfo('Instance System уже остановлен');
        return true;
      }
      
      logInfo('Остановка Instance System для bot инстанса...');
      
      // Закрываем WebSocket соединение (только если оно установлено)
      if (this.wsClient && this.wsClient.isConnected()) {
        this.wsClient.disconnect();
      }
      
      // Закрываем соединения с Redis
      await this.stateManager.disconnect();
      
      this.isRunning = false;
      logSuccess('Instance System для bot инстанса остановлен');
      
      return true;
      
    } catch (error) {
      logError('Ошибка остановки Instance System', error);
      throw error;
    }
  }
  
  // Получение статуса системы
  getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: Date.now()
    };
  }
  
  // Получение текущего баланса
  async getCurrentBalance(): Promise<BalanceState[] | null> {
    try {
      return await this.stateManager.getCurrentBalance();
    } catch (error) {
      logError('Ошибка получения текущего баланса', error);
      return null;
    }
  }
}

// Singleton экземпляр Instance System
let instanceSystem: InstanceSystem | null = null;

export function getInstanceSystem(): InstanceSystem {
  if (!instanceSystem) {
    instanceSystem = new InstanceSystem();
  }
  return instanceSystem;
}