// DTrader Trader Instance - Instance C
// Исполнитель торговых операций

import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';
import { config } from './config/config';

// Загружаем переменные окружения
dotenv.config();

// Типы данных
interface BalanceState {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

interface TradeSignal {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
}

interface OrderExecution {
  id: string;
  signalId: string;
  symbol: string;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  executedPrice?: number;
  executedAmount?: number;
  timestamp: number;
}

class TraderInstance {
  private redisClient: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private isRunning: boolean;
  private executedOrders: OrderExecution[];
  
  constructor() {
    this.isRunning = false;
    this.executedOrders = [];
    
    if (!config.redis) {
      throw new Error('Redis configuration is required for Trader Instance');
    }
    
    // Инициализируем Redis клиенты
    this.redisClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });
    
    this.pubClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });
    
    this.subClient = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });
  }
  
  async initialize() {
    try {
      await Promise.all([
        this.redisClient.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);
      
      console.log('✅ Trader Instance C инициализирован');
      console.log(`   🔌 Подключено к Redis: redis://${config.redis.host}:${config.redis.port}`);
      
      // Подписываемся на торговые сигналы
      await this.subscribeToTradeSignals();
      
      this.isRunning = true;
      
    } catch (error) {
      console.error('❌ Ошибка инициализации Trader Instance:', error);
      throw error;
    }
  }
  
  async subscribeToTradeSignals() {
    try {
      console.log('📡 Подписка на торговые сигналы...');
      
      await this.subClient.subscribe('trading:signals', (message) => {
        this.handleTradeSignal(message);
      });
      
      console.log('✅ Подписка на канал trading:signals активна');
      
    } catch (error) {
      console.error('❌ Ошибка подписки на торговые сигналы:', error);
      throw error;
    }
  }
  
  private async handleTradeSignal(message: string) {
    try {
      console.log('📩 Получен торговый сигнал:', message);
      
      const signal: TradeSignal = JSON.parse(message);
      
      // Исполняем ордер
      const execution = await this.executeOrder(signal);
      
      // Сохраняем результат исполнения
      this.executedOrders.push(execution);
      
      // Публикуем результат
      await this.publishExecutionResult(execution);
      
    } catch (error) {
      console.error('❌ Ошибка обработки торгового сигнала:', error);
    }
  }
  
  private async executeOrder(signal: TradeSignal): Promise<OrderExecution> {
    try {
      console.log(`🔄 Исполнение ордера: ${signal.type.toUpperCase()} ${signal.amount} ${signal.symbol} @ ${signal.price}`);
      
      // Симулируем исполнение (в реальности здесь будет вызов API биржи)
      const executedPrice = this.simulateExecutionPrice(signal.price, signal.type);
      const executedAmount = this.simulateExecutionAmount(signal.amount);
      
      const execution: OrderExecution = {
        id: `ORDER-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        signalId: signal.id,
        symbol: signal.symbol,
        type: signal.type,
        price: signal.price,
        amount: signal.amount,
        status: 'executed',
        executedPrice,
        executedAmount,
        timestamp: Date.now()
      };
      
      console.log(`✅ Ордер исполнен: ${execution.id}`);
      console.log(`   💰 Цена: ${execution.executedPrice}, Количество: ${execution.executedAmount}`);
      
      return execution;
      
    } catch (error) {
      console.error('❌ Ошибка исполнения ордера:', error);
      
      return {
        id: `ORDER-${Date.now()}-ERROR`,
        signalId: signal.id,
        symbol: signal.symbol,
        type: signal.type,
        price: signal.price,
        amount: signal.amount,
        status: 'failed',
        timestamp: Date.now()
      };
    }
  }
  
  private simulateExecutionPrice(basePrice: number, type: 'buy' | 'sell'): number {
    // Добавляем небольшой спред
    const spread = 0.001; // 0.1%
    return type === 'buy' ? basePrice * (1 + spread) : basePrice * (1 - spread);
  }
  
  private simulateExecutionAmount(requestedAmount: number): number {
    // 95-100% исполнение
    const executionRatio = 0.95 + Math.random() * 0.05;
    return requestedAmount * executionRatio;
  }
  
  private async publishExecutionResult(execution: OrderExecution) {
    try {
      const result = {
        type: 'orderExecuted',
        data: execution
      };
      
      await this.pubClient.publish('execution:results', JSON.stringify(result));
      console.log('📢 Результат исполнения опубликован в execution:results');
      
    } catch (error) {
      console.error('❌ Ошибка публикации результата исполнения:', error);
    }
  }
  
  async getExecutionHistory(): Promise<OrderExecution[]> {
    return this.executedOrders;
  }
  
  async getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: Date.now(),
      totalOrdersExecuted: this.executedOrders.length
    };
  }
  
  async disconnect() {
    try {
      await Promise.all([
        this.redisClient.quit(),
        this.pubClient.quit(),
        this.subClient.quit()
      ]);
      
      console.log('🔌 Trader Instance соединения закрыты');
      
    } catch (error) {
      console.error('❌ Ошибка при закрытии соединений:', error);
    }
  }
}

// Основная функция
async function main() {
  try {
    console.log('🚀 Запуск Trader Instance C...');
    
    const trader = new TraderInstance();
    await trader.initialize();
    
    console.log('🎯 Trader Instance C готов к работе!');
    console.log('💡 Ожидание торговых сигналов...');
    
  } catch (error) {
    console.error('❌ Фатальная ошибка:', error);
    process.exit(1);
  }
}

// Обработка сигналов для безопасного завершения
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал SIGINT. Завершение работы...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Получен сигнал SIGTERM. Завершение работы...');
  process.exit(0);
});

// Запуск
main().catch(error => {
  console.error('❌ Фатальная ошибка:', error);
  process.exit(1);
});