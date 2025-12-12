#!/bin/bash
echo "Запускаем сервер..."
node src/index.js &
SERVER_PID=$!
sleep 2
echo "Тестируем REST API на порту 1971:"
curl -s http://localhost:1971/api/status
echo -e "\nТестируем WebSocket на порту 2808:"
timeout 3s bash -c 'echo -e "GET / HTTP/1.1\r\nHost: localhost:2808\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n" | nc localhost 2808'
echo -e "\nОстанавливаем сервер..."
kill $SERVER_PID
echo "Тестирование завершено!"