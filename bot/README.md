# 🤖 DTrader Bot Instance (Instance B)

Торговый бот для работы с криптобиржей Gate.io через WebSocket и REST API.

## 🎯 Основные функции

- ✅ Получение балансов с Gate.io
- ✅ WebSocket соединение с биржей
- ✅ Публикация данных в Redis
- ✅ Автоматическое восстановление соединений
- ✅ HTTP API для мониторинга
- ✅ Health checks

## 🚀 Быстрый старт
```bash
# 1. Установка зависимостей
npm install

# 2. Настройка конфигурации
# Убедитесь, что в корневом .env указаны API ключи

# 3. Запуск
npm run start:dev

# 4. Проверка
curl http://localhost:1971/api/health
```

## 📚 Документация

- [IMPROVEMENTS.md](IMPROVEMENTS.md) - Подробное описание улучшений
- [../docs/](../docs/) - Общая документация проекта

## 🔧 Конфигурация

Все настройки в корневом `.env` файле:
```env
# Gate.io API
GATEIO_API_KEY=your_key
GATEIO_API_SECRET=your_secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Порты
SERVER_PORT=1971
WS_PORT=2808
```

## 🧪 Тестирование
```bash
# Запуск всех проверок
./test-improvements.sh

# Проверка API
curl http://localhost:1971/api/status
curl http://localhost:1971/api/health
curl http://localhost:1971/api/balance
```

## 📊 Мониторинг

### Health Check
```bash
curl http://localhost:1971/api/health
```

### Логи
```bash
tail -f logs/bot.log
```

## 🆘 Поддержка

Если возникли проблемы, смотрите:
1. [IMPROVEMENTS.md](IMPROVEMENTS.md) - раздел Troubleshooting
2. Логи в `logs/bot.log`
3. Health check endpoint

## 📝 Лицензия

MIT
