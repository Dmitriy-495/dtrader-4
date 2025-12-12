export declare class GateioSignature {
    private secret;
    constructor(secret: string);
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
    createSignature(method: string, url: string, queryString: string, body: string, timestamp: string): string;
    /**
     * Хэширует тело запроса с помощью SHA512 и возвращает в шестнадцатеричном коде
     * @param body - Тело запроса
     * @returns Хэш в шестнадцатеричном коде
     */
    private hashBody;
    /**
     * Создает временную метку для запроса
     * @returns Временная метка в секундах
     */
    createTimestamp(): string;
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
    createAuthHeaders(apiKey: string, method: string, url: string, queryString: string, body: string): Record<string, string>;
}
