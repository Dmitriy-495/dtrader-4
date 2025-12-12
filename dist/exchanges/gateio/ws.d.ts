import WebSocket from 'ws';
export declare class GateioWebSocket {
    private wsUrl;
    private socket?;
    constructor();
    connect(): void;
    disconnect(): void;
    getSocket(): WebSocket | undefined;
}
