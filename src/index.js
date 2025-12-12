require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const ccxt = require('ccxt');

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// REST API
app.get('/api/status', (req, res) => {
    res.json({ status: 'DTrader-4 is running!' });
});

// WebSocket Server
const wss = new WebSocket.Server({ port: process.env.WS_PORT || 2808 });

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ 
        type: 'system', 
        message: 'Welcome to DTrader-4!',
        timestamp: new Date().toISOString() 
    }));
});

// Gate.io Exchange
const exchange = new ccxt.gateio({
    apiKey: process.env.GATEIO_API_KEY,
    secret: process.env.GATEIO_API_SECRET,
});

app.listen(PORT, () => {
    console.log(`DTrader-4 server running on http://localhost:${PORT}`);
});