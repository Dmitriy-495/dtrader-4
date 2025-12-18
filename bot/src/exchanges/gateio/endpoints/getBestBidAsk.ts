import { getInstanceSystem } from '../../../instances/InstanceSystem';

export interface BestBidAskResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * Получить best bid/ask для указанной пары
 */
export async function getBestBidAsk(pair: string): Promise<BestBidAskResponse> {
  try {
    const instanceSystem = getInstanceSystem();
    const bestBidAsk = instanceSystem.getBestBidAsk(pair.toUpperCase());
    
    if (!bestBidAsk) {
      return {
        success: false,
        error: 'Best bid/ask not found',
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: bestBidAsk,
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
