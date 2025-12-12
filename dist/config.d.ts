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
export declare const config: ServerConfig;
