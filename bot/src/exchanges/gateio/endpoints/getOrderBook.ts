import { getInstanceSystem } from '../../../instances/InstanceSystem';

export interface OrderBookResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * Получить order book для указанной пары
 */
export async function getOrderBook(pair: string): Promise<OrderBookResponse> {
  try {
    const instanceSystem = getInstanceSystem();
    const orderBook = instanceSystem.getOrderBook(pair.toUpperCase());
    
    if (!orderBook) {
      return {
        success: false,
        error: 'Order book not found or not subscribed',
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: orderBook,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    };
  }
}
