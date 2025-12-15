#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🧪 Тестирование приветственного сообщения WebSocket сервера');
console.log('======================================================\n');

// Создаем WebSocket клиент
const ws = new WebSocket('ws://localhost:2808');

ws.on('open', () => {
  console.log('✅ Соединение установлено с сервером');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    
    if (message.type === 'system:welcome') {
      console.log('📩 Получено приветственное сообщение:\n');
      console.log('🎉 Сообщение:', message.message);
      console.log('🆔 Client ID:', message.clientId);
      console.log('🕒 Серверное время:', message.connectionInfo.serverTime);
      console.log('🔌 WebSocket порт:', message.connectionInfo.websocketPort);
      console.log('📊 Статус Redis:', message.systemStatus.redisConnected ? '✅ Подключено' : '❌ Отключено');
      console.log('📊 Статус бота:', message.systemStatus.botStatus);
      console.log('📊 Статус трейдера:', message.systemStatus.traderStatus);
      console.log('\n📋 Доступные события:', message.availableEvents.length);
      message.availableEvents.forEach(event => console.log(`   - ${event}`));
      
      console.log('\n📋 Доступные команды:');
      Object.entries(message.availableCommands).forEach(([cmd, desc]) => {
        console.log(`   ${cmd}: ${desc}`);
      });
      
      console.log('\n💡 Советы:');
      message.tips.forEach(tip => console.log(`   • ${tip}`));
      
      console.log('\n📖 Документация:');
      console.log(`   API: ${message.documentation.api}`);
      console.log(`   GitHub: ${message.documentation.github}`);
      console.log(`   Support: ${message.documentation.support}`);
      
      console.log('\n✅ Тест приветственного сообщения пройден успешно!');
      
      // Закрываем соединение через 1 секунду
      setTimeout(() => {
        console.log('\n🔌 Закрытие соединения...');
        ws.close();
        process.exit(0);
      }, 1000);
      
    } else {
      console.log('📩 Получено другое сообщение:', message.type);
    }
    
  } catch (error) {
    console.error('❌ Ошибка парсинга сообщения:', error);
    console.log('📄 Сырые данные:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ Ошибка WebSocket:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 Соединение закрыто');
});

// Таймаут на подключение
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('❌ Не удалось подключиться к серверу');
    process.exit(1);
  }
}, 3000);