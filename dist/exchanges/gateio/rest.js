"use strict";
// Базовый класс для REST соединения с Gate.io
// Только подключение, без подписок
Object.defineProperty(exports, "__esModule", { value: true });
exports.GateioRest = void 0;
const signature_1 = require("./signature");
class GateioRest {
    baseUrl;
    apiKey;
    secret;
    signature;
    constructor(apiKey, secret) {
        this.baseUrl = 'https://api.gateio.ws';
        this.apiKey = apiKey;
        this.secret = secret;
        // Инициализируем модуль подписи, если есть секрет
        if (this.secret) {
            this.signature = new signature_1.GateioSignature(this.secret);
        }
    }
    // Метод для базового соединения
    async connect() {
        console.log('🔄 Gate.io REST: Установка соединения...');
        try {
            // Простой тестовый запрос для проверки соединения
            const response = await fetch(`${this.baseUrl}/api/v4/spot/tickers?currency_pair=BTC_USDT`);
            if (response.ok) {
                console.log('✅ Gate.io REST: Соединение установлено успешно');
            }
            else {
                console.error('❌ Gate.io REST: Ошибка соединения', response.status);
            }
        }
        catch (error) {
            console.error('❌ Gate.io REST: Ошибка соединения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
        }
    }
    // Метод для получения баланса (аутентифицированный запрос)
    async getBalance() {
        if (!this.apiKey || !this.secret || !this.signature) {
            console.error('❌ Gate.io REST: API ключи не настроены для аутентифицированных запросов');
            return null;
        }
        console.log('💰 Gate.io REST: Получение баланса...');
        try {
            const method = 'GET';
            const url = '/spot/accounts'; // URL без префикса
            const prefix = '/api/v4'; // Префикс
            const queryString = ''; // Нет параметров запроса для этого endpoint
            const body = '';
            // Используем модуль подписи для создания заголовков
            // Согласно примеру на Python, используем prefix + url
            const headers = this.signature.createAuthHeaders(this.apiKey, method, prefix + url, queryString, body);
            // Отладочная информация
            console.log('🔍 Отладочная информация:');
            console.log(`   API Key: ${this.apiKey ? '****' : 'отсутствует'}`);
            console.log(`   URL: ${prefix + url}`);
            console.log(`   Query String: ${queryString}`);
            console.log(`   Body Hash: cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e`);
            console.log(`   Timestamp: ${headers.Timestamp}`);
            console.log(`   Signature: ${headers.SIGN.substring(0, 16)}...`);
            // Добавляем заголовки Accept и Content-Type как в примере на Python
            const allHeaders = {
                ...headers,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };
            const response = await fetch(`${this.baseUrl}${prefix}${url}`, {
                method: method,
                headers: allHeaders
            });
            if (response.ok) {
                const balanceData = await response.json();
                console.log('✅ Gate.io REST: Баланс получен успешно');
                return balanceData;
            }
            else {
                console.error('❌ Gate.io REST: Ошибка получения баланса', response.status, response.statusText);
                // Выводим больше информации об ошибке
                try {
                    const errorData = await response.json();
                    console.error('📋 Детали ошибки:', errorData);
                    // Выводим возможные причины и решения
                    if (errorData.label === 'INVALID_KEY') {
                        console.error('💡 Возможные причины:');
                        console.error('   1. API ключ недействителен или устарел');
                        console.error('   2. API ключ не имеет необходимых разрешений');
                        console.error('   3. API ключ привязан к другому IP адресу');
                        console.error('💡 Решения:');
                        console.error('   1. Проверьте API ключи в .env файле');
                        console.error('   2. Убедитесь, что ключи имеют разрешение на чтение баланса');
                        console.error('   3. Проверьте привязку ключей к IP адресу');
                    }
                }
                catch (e) {
                    // Если не удалось получить JSON с ошибкой
                    console.error('📋 Не удалось получить детали ошибки');
                }
                return null;
            }
        }
        catch (error) {
            console.error('❌ Gate.io REST: Ошибка при получении баланса:', error instanceof Error ? error.message : 'Неизвестная ошибка');
            return null;
        }
    }
    // Метод для закрытия соединения
    disconnect() {
        console.log('🔌 Gate.io REST: Соединение закрыто');
    }
}
exports.GateioRest = GateioRest;
//# sourceMappingURL=rest.js.map