# DTrader-4 Server Tests

Организованная структура тестов для DTrader-4 сервера.

## Структура тестов

```
tests/
├── README.md              # Этот файл
├── test_server.js         # Основные тесты сервера
├── test_server.sh         # Bash скрипт для быстрого тестирования
├── unit/                  # Юнит тесты
├── integration/           # Интеграционные тесты
└── performance/           # Тесты производительности
```

## Запуск тестов

### 1. Основные тесты (Node.js)

```bash
# Запуск основных тестов
node tests/test_server.js

# Или с npm (после настройки package.json)
npm test
```

### 2. Быстрое тестирование (Bash)

```bash
# Быстрый тест сервера
./tests/test_server.sh
```

### 3. Отдельные тесты

```bash
# Тест REST API
node -e "require('./tests/test_server.js').testRestApi()"

# Тест WebSocket
node -e "require('./tests/test_server.js').testWebSocket()"
```

## Что тестируется

✅ **REST API**
- Ответ на `/api/status`
- Корректный JSON формат
- Статус код 200

✅ **WebSocket**
- Успешное подключение
- Приветственное сообщение
- Корректный JSON формат сообщений

✅ **Безопасное завершение**
- Обработка SIGINT (Ctrl+C)
- Обработка SIGTERM
- Обработка SIGQUIT
- Освобождение портов

## Создание новых тестов

### Юнит тесты
Помещайте в `tests/unit/` - тесты отдельных функций и модулей.

### Интеграционные тесты
Помещайте в `tests/integration/` - тесты взаимодействия компонентов.

### Тесты производительности
Помещайте в `tests/performance/` - тесты нагрузки и производительности.

## Лучшие практики

1. **Изолируйте тесты** - каждый тест должен быть независимым
2. **Очищайте ресурсы** - освобождайте порты и процессы после тестов
3. **Используйте таймауты** - предотвращайте зависание тестов
4. **Пишите понятные сообщения** - ошибки должны быть информативными
5. **Следуйте структуре** - помещайте тесты в соответствующие папки

## Зависимости

- Node.js 14+
- Standard library modules (http, ws, child_process)
- No external test frameworks (pure Node.js)

## Пример создания теста

```javascript
// tests/unit/example.test.js
const assert = require('assert');

function testExample() {
  const result = 2 + 2;
  assert.strictEqual(result, 4, '2 + 2 should equal 4');
  console.log('✅ Example test passed');
}

if (require.main === module) {
  testExample();
}

module.exports = { testExample };
```