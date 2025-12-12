interface SystemMessage {
    type: 'system';
    message: string;
    timestamp: string;
}
interface ApiResponse {
    status?: string;
    error?: string;
}
export { SystemMessage, ApiResponse };
