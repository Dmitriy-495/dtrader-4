#!/bin/bash

echo "🧪 Тестирование улучшений Bot Instance"
echo "========================================"
echo ""

# Проверка компиляции
echo "📝 1. Проверка компиляции TypeScript..."
# cd bot
if npx tsc --noEmit; then
    echo "✅ Компиляция успешна"
else
    echo "❌ Ошибка компиляции"
    exit 1
fi
echo ""

# Проверка структуры файлов
echo "📁 2. Проверка структуры файлов..."
FILES=(
    "src/app.ts"
    "src/core/StateManager.ts"
    "src/core/logger.ts"
    "src/exchanges/gateio/gateio-client/ws-client.ts"
    "src/exchanges/gateio/endpoints/getBalance.ts"
    "src/instances/InstanceSystem.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file существует"
    else
        echo "❌ $file отсутствует"
        exit 1
    fi
done
echo ""

# Проверка зависимостей
echo "📦 3. Проверка зависимостей..."
if [ -f "package.json" ]; then
    echo "✅ package.json найден"
    if [ -d "node_modules" ]; then
        echo "✅ node_modules установлены"
    else
        echo "⚠️  node_modules не найдены, запустите: npm install"
    fi
else
    echo "❌ package.json не найден"
    exit 1
fi
echo ""

# Проверка конфигурации
echo "⚙️  4. Проверка конфигурации..."
if [ -f "../.env" ]; then
    echo "✅ .env файл найден в корне"
else
    echo "⚠️  .env файл не найден, создайте из .env.example"
fi
echo ""

echo "✅ Все проверки пройдены успешно!"
echo ""
echo "📋 Следующие шаги:"
echo "   1. Убедитесь, что Redis запущен"
echo "   2. Настройте .env файл с вашими API ключами"
echo "   3. Запустите: npm run start:dev"
echo ""
