#!/usr/bin/env node

const WebSocket = require('ws');
const { createClient } = require('redis');

console.log('🧪 Тестирование трансляции exchange:pong через Redis');
console.log('==================================================\n');

// Конфигурация
const WS_PORT = 2808;
const REDIS_HOST = 'localhost';
const REDIS_PORT = 6379;

// Создаем WebSocket клиент
const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

// Создаем Redis клиент для публикации сообщений
const redisPublisher = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`
});

let clientId = null;
let messageCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket соединение установлено');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    
    if (message.type === 'system:welcome') {
      clientId = message.clientId;
      console.log(`📩 Приветственное сообщение получено`);
      console.log(`🆔 Client ID: ${clientId}`);
      console.log(`📋 Доступные события: ${message.availableEvents.join(', ')}`);
      
      // Проверяем, что exchange:pong есть в списке
      if (message.availableEvents.includes('exchange:pong')) {
        console.log('✅ Событие exchange:pong доступно');
      } else {
        console.log('❌ Событие exchange:pong не найдено в списке');
      }
      
      // Подключаемся к Redis и публикуем тестовое сообщение
      setTimeout(() => {
        connectToRedisAndPublish();
      }, 1000);
      
    } else if (message.type === 'exchange:pong') {
      messageCount++;
      console.log(`\n🏓 Получено exchange:pong #${messageCount}:`);
      console.log(`   🏦 Биржа: ${message.exchange}`);
      console.log(`   📊 Задержка: ${message.data.latency}ms`);
      console.log(`   🕒 Время: ${new Date(message.timestamp).toISOString()}`);
      console.log(`   📤 Источник: ${message.source}`);
      
      // Если получили 3 сообщения, завершаем тест
      if (messageCount >= 3) {
        console.log('\n✅ Тест успешно завершён!');
        ws.close();
        redisPublisher.quit();
        process.exit(0);
      }
    } else {
      console.log(`📩 Получено другое сообщение: ${message.type}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка парсинга сообщения:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ Ошибка WebSocket:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 WebSocket соединение закрыто');
  redisPublisher.quit();
});

async function connectToRedisAndPublish() {
  try {
    console.log('\n🔌 Подключение к Redis для публикации...');
    await redisPublisher.connect();
    console.log('✅ Подключено к Redis');
    
    // Публикуем тестовые сообщения exchange:pong
    console.log('\n📤 Публикация тестовых сообщений exchange:pong...');
    
    const testMessages = [
      {
        exchange: 'gateio',
        latency: 45,
        timestamp: Date.now(),
        status: 'connected'
      },
      {
        exchange: 'binance',
        latency: 32,
        timestamp: Date.now(),
        status: 'connected'
      },
      {
        exchange: 'gateio',
        latency: 42,
        timestamp: Date.now(),
        status: 'connected'
      }
    ];
    
    // Публикуем сообщения с интервалом 500ms
    for (let i = 0; i < testMessages.length; i++) {
      setTimeout(async () => {
        const message = testMessages[i];
        await redisPublisher.publish('exchange:pong', JSON.stringify(message));
        console.log(`📤 Опубликовано сообщение ${i+1}/${testMessages.length} от ${message.exchange}`);
      }, i * 500);
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения к Redis:', error);
    process.exit(1);
  }
}

// Таймаут на подключение
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('❌ Не удалось подключиться к WebSocket серверу');
    process.exit(1);
  }
}, 5000);