// State Manager с использованием Redis
import { createClient, RedisClientType } from 'redis';
import { baseConfig as config } from '../config/config';
import { logInfo, logSuccess, logError, logWarning } from './logger';

export interface BalanceState {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

export class StateManager {
  private redisClient: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  
  constructor() {
    if (!config.redis) {
      throw new Error('Redis configuration is required. Please set REDIS_HOST and REDIS_PORT in .env');
    }
    
    // Основной клиент для работы с данными
    this.redisClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000) // Экспоненциальный бэкофф
      }
    });
    
    // Клиенты для Pub/Sub (должны быть отдельными)
    this.pubClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });
    
    this.subClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });
    
    this.initialize();
  }
  
  private async initialize() {
    try {
      // Подключаемся к Redis
      await Promise.all([
        this.redisClient.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);
      logSuccess('Redis StateManager инициализирован');
      logInfo(`Подключено к redis://${config.redis.host}:${config.redis.port}`);
    } catch (error) {
      logError('Ошибка подключения к Redis', error);
      throw error;
    }
  }
  
  // Установка текущего баланса
  async setCurrentBalance(balance: BalanceState[]) {
    try {
      logInfo('Сохранение баланса в Redis...');
      logInfo(`Получено состояние баланса: ${balance.length} активов`);
      
      const balanceString = JSON.stringify(balance);
      logInfo(`Сериализовано в JSON: ${balanceString.length} символов`);
      
      // Реальный Redis
      await this.redisClient.set('currentBalance', balanceString);
      logSuccess('Успешно записано в Redis');
      
      await this.pubClient.publish('stateUpdate', JSON.stringify({
        type: 'balanceUpdated',
        data: balance
      }));
      logInfo('Опубликовано событие обновления баланса');
      
      logSuccess('Баланс успешно сохранен в Redis');
    } catch (error) {
      logError('Ошибка при сохранении баланса в Redis', error);
      throw error;
    }
  }
  
  // Получение текущего баланса
  async getCurrentBalance(): Promise<BalanceState[] | null> {
    try {
      logInfo('Чтение баланса из Redis...');
      
      // Реальный Redis
      const balance = await this.redisClient.get('currentBalance');
      
      if (balance) {
        logInfo(`Получено из Redis: ${balance.length} символов`);
        const parsedBalance = JSON.parse(balance);
        logInfo(`Десериализовано в объект: ${parsedBalance.length} активов`);
        logSuccess('Баланс успешно получен из Redis');
        return parsedBalance;
      } else {
        logWarning('Баланс в Redis не найден');
        return null;
      }
    } catch (error) {
      logError('Ошибка при получении баланса из Redis', error);
      return null;
    }
  }
  
  // Подписка на обновления состояния
  async subscribeToUpdates(callback: (channel: string, message: string) => void) {
    try {
      // Реальный Redis
      await this.subClient.subscribe('stateUpdate', callback);
      logInfo('Подписка на обновления состояния активна');
    } catch (error) {
      logError('Ошибка подписки на обновления', error);
      throw error;
    }
  }
  
  // Закрытие соединений
  async disconnect() {
    try {
      // Проверяем, что клиенты еще подключены
      const clients = [this.redisClient, this.pubClient, this.subClient];
      const activeClients = clients.filter(client => {
        try {
          return client.isOpen;
        } catch {
          return false;
        }
      });
      
      if (activeClients.length > 0) {
        await Promise.all(activeClients.map(client => client.quit()));
        logInfo('Redis соединения закрыты');
      }
    } catch (error) {
      logError('Ошибка при закрытии Redis соединений', error);
      // Не бросаем ошибку, чтобы не прерывать завершение
    }
  }
}

// Экземпляр StateManager
let stateManager: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!stateManager) {
    stateManager = new StateManager();
  }
  return stateManager;
}