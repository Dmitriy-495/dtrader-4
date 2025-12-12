import { GateIOBalance } from "./src/exchanges/gateio/endpoints/getBalance";
// Базовый класс для REST соединения с Gate.io
// Только подключение, без подписок

export class GateioRest {
  private baseUrl: string;
  private apiKey?: string;
  private secret?: string;
  
  constructor(apiKey?: string, secret?: string) {
    this.baseUrl = 'https://api.gateio.ws';
    this.apiKey = apiKey;
    this.secret = secret;
  }
  
  // Метод для базового соединения
  public async connect(): Promise<void> {
    console.log('🔄 Gate.io REST: Установка соединения...');
    
    try {
      // Простой тестовый запрос для проверки соединения
      const response = await fetch(`${this.baseUrl}/api/v4/spot/tickers?currency_pair=BTC_USDT`);
      
      if (response.ok) {
        console.log('✅ Gate.io REST: Соединение установлено успешно');
      } else {
        console.error('❌ Gate.io REST: Ошибка соединения', response.status);
      }
    } catch (error) {
      console.error('❌ Gate.io REST: Ошибка соединения:', error instanceof Error ? error.message : 'Неизвестная ошибка');
    }
  }
  
  // Метод для получения баланса (аутентифицированный запрос)
  public async getBalance(): Promise<any> {
    if (!this.apiKey || !this.secret) {
      console.error('❌ Gate.io REST: API ключи не настроены для аутентифицированных запросов');
      return null;
    }
    
    console.log('💰 Gate.io REST: Получение баланса...');
    
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const method = 'GET';
      const requestPath = '/api/v4/spot/accounts';  // Полный путь согласно документации
      const body = '';
      
      // Создаем подпись
      const message = method + requestPath + '\n' + body + timestamp;
      const signature = this.createSignature(message);
      
      const response = await fetch(`${this.baseUrl}${requestPath}`, {
        method: method,
        headers: {
          'KEY': this.apiKey,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const balanceData = await response.json();
        console.log('✅ Gate.io REST: Баланс получен успешно');
        return balanceData;
      } else {
        console.error('❌ Gate.io REST: Ошибка получения баланса', response.status, response.statusText);
        // Выводим больше информации об ошибке
        try {
          const errorData = await response.json();
          console.error('📋 Детали ошибки:', errorData);
        } catch (e) {
          // Если не удалось получить JSON с ошибкой
          console.error('📋 Не удалось получить детали ошибки');
        }
        return null;
      }
    } catch (error) {
      console.error('❌ Gate.io REST: Ошибка при получении баланса:', error instanceof Error ? error.message : 'Неизвестная ошибка');
      return null;
    }
  }
  
  // Вспомогательный метод для создания подписи
  private createSignature(message: string): string {
    if (!this.secret) {
      throw new Error('Secret не настроен');
    }
    
    // Для простоты используем HMAC-SHA512
    // В реальном проекте нужно использовать crypto модуль
    // Но для минимализма используем простой подход
    return require('crypto').createHmac('sha512', this.secret).update(message).digest('hex').toUpperCase();
  }
  
  // Метод для закрытия соединения
  public disconnect(): void {
    console.log('🔌 Gate.io REST: Соединение закрыто');
  }
}