import dotenv from 'dotenv';

dotenv.config();

export interface ExchangeConfig {
  apiKey?: string;
  secret?: string;
  enabled: boolean;
}

export interface ServerConfig {
  PORT: number;
  WS_PORT: number;
  isShuttingDown: boolean;
  exchange: ExchangeConfig;
}

export const config: ServerConfig = {
  PORT: parseInt(process.env.SERVER_PORT || '1971'),
  WS_PORT: parseInt(process.env.WS_PORT || '2808'),
  isShuttingDown: false,
  exchange: {
    apiKey: process.env.GATEIO_API_KEY,
    secret: process.env.GATEIO_API_SECRET,
    enabled: !!process.env.GATEIO_API_KEY && !!process.env.GATEIO_API_SECRET
  }
};