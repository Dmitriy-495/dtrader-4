"use strict";
// Модуль для создания подписи запросов к Gate.io API
// Согласно документации: https://www.gate.com/docs/developers/apiv4/en/#authentication
Object.defineProperty(exports, "__esModule", { value: true });
exports.GateioSignature = void 0;
class GateioSignature {
    secret;
    constructor(secret) {
        this.secret = secret;
    }
    /**
     * Создает подпись для запроса к Gate.io API
     * Согласно документации: https://www.gate.com/docs/developers/apiv4/en/#authentication
     * @param method - HTTP метод (GET, POST, PUT, DELETE)
     * @param url - URL пути (например, /api/v4/spot/accounts)
     * @param queryString - Строка запроса (например, "currency_pair=BTC_USDT")
     * @param body - Тело запроса (пустая строка для GET запросов)
     * @param timestamp - Временная метка в секундах
     * @returns Подпись в верхнем регистре (HMAC-SHA512)
     */
    createSignature(method, url, queryString, body, timestamp) {
        // Формируем сообщение для подписи согласно документации
        // Request Method + "\n" + Request URL + "\n" + Query String + "\n" + HexEncode(SHA512(Request Payload)) + "\n" + Timestamp
        const methodUpper = method.toUpperCase();
        const bodyHash = this.hashBody(body);
        const message = methodUpper + '\n' + url + '\n' + queryString + '\n' + bodyHash + '\n' + timestamp;
        // Создаем HMAC-SHA512 подпись
        // Используем встроенный модуль crypto из Node.js
        const signature = require('crypto')
            .createHmac('sha512', this.secret)
            .update(message)
            .digest('hex')
            .toUpperCase();
        return signature;
    }
    /**
     * Хэширует тело запроса с помощью SHA512 и возвращает в шестнадцатеричном коде
     * @param body - Тело запроса
     * @returns Хэш в шестнадцатеричном коде
     */
    hashBody(body) {
        // Если тело запроса отсутствует, используем хэш пустой строки
        if (!body) {
            return 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e';
        }
        return require('crypto')
            .createHash('sha512')
            .update(body)
            .digest('hex');
    }
    /**
     * Создает временную метку для запроса
     * @returns Временная метка в секундах
     */
    createTimestamp() {
        return Math.floor(Date.now() / 1000).toString();
    }
    /**
     * Создает полный набор заголовков для аутентифицированного запроса
     * Согласно документации: https://www.gate.com/docs/developers/apiv4/en/#authentication
     * @param apiKey - API ключ
     * @param method - HTTP метод
     * @param url - URL пути (например, /api/v4/spot/accounts)
     * @param queryString - Строка запроса (например, "currency_pair=BTC_USDT")
     * @param body - Тело запроса
     * @returns Объект с заголовками для fetch
     */
    createAuthHeaders(apiKey, method, url, queryString, body) {
        const timestamp = this.createTimestamp();
        const signature = this.createSignature(method, url, queryString, body, timestamp);
        return {
            'KEY': apiKey,
            'SIGN': signature,
            'Timestamp': timestamp,
            'Content-Type': 'application/json'
        };
    }
}
exports.GateioSignature = GateioSignature;
//# sourceMappingURL=signature.js.map