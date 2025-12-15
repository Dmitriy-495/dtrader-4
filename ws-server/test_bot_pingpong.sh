#!/bin/bash

echo "🧪 Тестирование трансляции bot:pingpong через Redis"
echo "=================================================="
echo ""

# Освобождаем порт 2808
PID=$(lsof -ti :2808 2>/dev/null)
if [ ! -z "$PID" ]; then
    echo "🔴 Освобождаем порт 2808..."
    kill -9 $PID
    sleep 1
fi

# Запускаем сервер в фоновом режиме
echo "🚀 Запускаем WebSocket сервер..."
cd /home/tda/code/dtrader/dtrader-4/ws-server
node dist/app.js > server.log 2>&1 &
SERVER_PID=$!
sleep 2

echo "✅ Сервер запущен с PID $SERVER_PID"
echo ""

# Подключаем тестового клиента
echo "📱 Подключаем тестового клиента..."
node test_welcome_client.js > client.log 2>&1 &
CLIENT_PID=$!
sleep 3

# Публикуем тестовые ping-pong сообщения от бота
echo "🤖 Публикуем тестовые сообщения от бота..."

# Публикуем PING от бота
node -e "
const { createClient } = require('redis');
const client = createClient({ url: 'redis://localhost:6379' });
client.connect().then(() => {
  client.publish('bot:pingpong', JSON.stringify({
    type: 'ping',
    latency: 10,
    timestamp: Date.now(),
    source: 'bot'
  }));
  console.log('📤 PING от бота опубликован в Redis');
  setTimeout(() => process.exit(0), 1000);
});
" &
sleep 2

# Публикуем PONG от бота
node -e "
const { createClient } = require('redis');
const client = createClient({ url: 'redis://localhost:6379' });
client.connect().then(() => {
  client.publish('bot:pingpong', JSON.stringify({
    type: 'pong',
    latency: 15,
    timestamp: Date.now(),
    source: 'bot'
  }));
  console.log('📤 PONG от бота опубликован в Redis');
  setTimeout(() => process.exit(0), 1000);
});
" &
sleep 2

# Проверяем логи сервера
echo ""
echo "📄 Логи сервера (последние 30 строк):"
echo "==================================="
tail -30 server.log | grep -E "(🤖|📡|📤|bot:pingpong)" || echo "Нет логов трансляции"

# Проверяем логи клиента
echo ""
echo "📄 Логи клиента (последние 20 строк):"
echo "==================================="
tail -20 client.log | grep -E "(bot:pingpong|🤖)" || echo "Нет логов клиента"

# Останавливаем клиента и сервер
echo ""
echo "🛑 Останавливаем клиента и сервер..."
kill -TERM $CLIENT_PID 2>/dev/null
sleep 1
kill -TERM $SERVER_PID 2>/dev/null
sleep 1

# Удаляем лог файлы
rm -f server.log client.log

echo ""
echo "🎉 Тест завершён!"
echo "   Проверьте логи выше, чтобы убедиться, что трансляция работает."