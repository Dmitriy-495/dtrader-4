# Gate.io Balance API Module

Модуль для получения балансов с различных счетов биржи Gate.io. Написан на TypeScript с полной типизацией.

## 📦 Установка

```bash
npm install axios
```

## 🚀 Быстрый старт

typescript

```
import GateIOBalance from './getBalance';

const client = new GateIOBalance({
  apiKey: 'ВАШ_API_KEY',
  apiSecret: 'ВАШ_API_SECRET',
});

// Получить все спотовые балансы
const balances = await client.getSpotBalance();
console.log(balances.data); // [{currency: 'BTC', available: '0.5', ...}]
```



## 🔧 Конфигурация

typescript

```
interface GateIOConfig {
  apiKey: string;          // API ключ Gate.io
  apiSecret: string;       // API секрет
  baseUrl?: string;        // URL API (по умолчанию: https://api.gateio.ws/api/v4)
  timeout?: number;        // Таймаут запроса (по умолчанию: 10000ms)
}
```



## 📊 Основные методы

### 1. Спотовый баланс

typescript

```
// Все валюты
await client.getSpotBalance();

// Конкретная валюта
await client.getSpotBalance('USDT');

// Только ненулевые балансы
await client.getNonZeroBalances();
```



### 2. Маржинальный баланс

typescript

```
// Все пары
await client.getMarginBalance();

// Конкретная пара
await client.getMarginBalance('BTC_USDT');
```



### 3. Фьючерсный баланс

typescript

```
// USDT-маржа
await client.getFuturesBalance('usdt');

// BTC-маржа
await client.getFuturesBalance('btc');
```



### 4. Опционный баланс

typescript

```
// BTC опционы
await client.getOptionsBalance('BTC');

// ETH опционы
await client.getOptionsBalance('ETH');
```



### 5. Агрегированные методы

typescript

```
// Общий баланс по всем счетам
await client.getTotalBalance();

// Баланс валюты на всех счетах
await client.getCurrencyBalanceAllAccounts('BTC');

// Проверка баланса для ордера
await client.checkBalanceForOrder('USDT', 1000);
```



## 🛠️ Утилиты

typescript

```
import { BalanceUtils } from './getBalance';

// Форматирование баланса
BalanceUtils.formatBalance(balance, 4);

// Сумма балансов
BalanceUtils.sumBalances(balances, 'USDT');
```



## 📁 Структура ответа

typescript

```
interface BalanceResponse {
  success: boolean;        // Успешность запроса
  data: CurrencyBalance[]; // Массив балансов
  timestamp: number;       // Временная метка
  error?: string;         // Ошибка (если есть)
}

interface CurrencyBalance {
  currency: string;  // Код валюты (BTC, USDT и т.д.)
  available: string; // Доступный баланс
  locked: string;    // Заблокированный баланс
  total: string;     // Общий баланс
}
```



## 🔐 Настройка API ключей

1. Перейдите на [Gate.io API Management](https://www.gate.io/myaccount/apikeys)
2. Создайте новый ключ с разрешением **Wallet → Read Only**
3. Сохраните API Key и Secret
4. Никогда не коммитьте ключи в репозиторий!

## 🚨 Обработка ошибок

Все методы возвращают стандартизированный ответ:

typescript

```
// Пример успешного ответа
{
  success: true,
  data: [...],
  timestamp: 1234567890
}

// Пример ошибки
{
  success: false,
  data: [],
  timestamp: 1234567890,
  error: 'Invalid API key'
}
```



## 📈 Пример использования в торговом боте

typescript

```
class TradingBot {
  constructor(private balanceClient: GateIOBalance) {}

  async preTradeCheck() {
    // Проверяем баланс USDT
    const check = await this.balanceClient.checkBalanceForOrder('USDT', 100);
    
    if (!check.sufficient) {
      throw new Error(`Недостаточно USDT. Нужно: ${check.required}, доступно: ${check.available}`);
    }
    
    // Получаем текущие ненулевые балансы
    const balances = await this.balanceClient.getNonZeroBalances();
    return balances;
  }
}
```



## 📚 Документация

- [Официальная документация Gate.io API v4](https://www.gate.io/docs/apiv4)
- [Управление API ключами](https://www.gate.io/myaccount/apikeys)