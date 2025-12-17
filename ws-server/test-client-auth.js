#!/usr/bin/env node

const WebSocket = require('ws');

// Токен из консоли при запуске сервера
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('❌ Использование: node test-client-auth.js YOUR_TOKEN');
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:2808?token=${TOKEN}`);

ws.on('open', () => {
  console.log('✅ Подключено к серверу с токеном');
  
  // Отправляем ping
  ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    
    if (message.type === 'system:welcome') {
      console.log('\n🎉 ПРИВЕТСТВЕННОЕ СООБЩЕНИЕ:');
      console.log(`   Client ID: ${message.clientId}`);
      console.log(`   Authenticated: ${message.serverInfo.authenticated}`);
      console.log(`   Events: ${message.availableEvents.join(', ')}`);
    } else if (message.type === 'pong') {
      console.log('\n🏓 PONG получен от сервера');
    } else {
      console.log(`\n📩 ${message.type}:`, JSON.stringify(message, null, 2));
    }
  } catch (error) {
    console.log('📩 Сообщение:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ Ошибка:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 Соединение закрыто: ${code} - ${reason}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Закрытие соединения...');
  ws.close();
  process.exit(0);
});
