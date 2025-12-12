export declare class GateioRest {
    private baseUrl;
    private apiKey?;
    private secret?;
    private signature?;
    constructor(apiKey?: string, secret?: string);
    connect(): Promise<void>;
    getBalance(): Promise<any>;
    disconnect(): void;
}
