import { getInstanceSystem } from '../../../instances/InstanceSystem';

export interface SubscribeResponse {
  success: boolean;
  message?: string;
  error?: string;
  timestamp: number;
}

/**
 * Подписаться на order book конкретной пары
 */
export function subscribeOrderBook(pair: string): SubscribeResponse {
  try {
    const instanceSystem = getInstanceSystem();
    instanceSystem.subscribeToOrderBook(pair.toUpperCase());
    
    return {
      success: true,
      message: `Subscribed to ${pair}`,
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

/**
 * Отписаться от order book пары
 */
export function unsubscribeOrderBook(pair: string): SubscribeResponse {
  try {
    const instanceSystem = getInstanceSystem();
    instanceSystem.unsubscribeFromOrderBook(pair.toUpperCase());
    
    return {
      success: true,
      message: `Unsubscribed from ${pair}`,
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
