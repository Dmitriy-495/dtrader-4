// Патч для app.ts - добавить эти endpoints в createHttpServer()

// GET /api/orderbook/:pair - Получить order book для пары
if (req.method === "GET" && req.url?.startsWith("/api/orderbook/")) {
  const pair = req.url.split("/api/orderbook/")[1];
  
  if (!pair) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Pair not specified" }));
    return;
  }

  const orderBook = instanceSystem?.getOrderBook(pair.toUpperCase());
  
  if (!orderBook) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Order book not found or not subscribed" }));
    return;
  }

  const response = {
    success: true,
    data: orderBook,
    timestamp: new Date().toISOString()
  };
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response, null, 2));
}

// GET /api/best/:pair - Получить best bid/ask для пары
else if (req.method === "GET" && req.url?.startsWith("/api/best/")) {
  const pair = req.url.split("/api/best/")[1];
  
  if (!pair) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Pair not specified" }));
    return;
  }

  const bestBidAsk = instanceSystem?.getBestBidAsk(pair.toUpperCase());
  
  if (!bestBidAsk) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Best bid/ask not found" }));
    return;
  }

  const response = {
    success: true,
    data: bestBidAsk,
    timestamp: new Date().toISOString()
  };
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response, null, 2));
}

// POST /api/orderbook/subscribe - Подписаться на пару
else if (req.method === "POST" && req.url === "/api/orderbook/subscribe") {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const pair = data.pair;
      
      if (!pair) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Pair not specified" }));
        return;
      }
      
      instanceSystem?.subscribeToOrderBook(pair.toUpperCase());
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Subscribed to ${pair}`,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
}

// POST /api/orderbook/unsubscribe - Отписаться от пары
else if (req.method === "POST" && req.url === "/api/orderbook/unsubscribe") {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const pair = data.pair;
      
      if (!pair) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Pair not specified" }));
        return;
      }
      
      instanceSystem?.unsubscribeFromOrderBook(pair.toUpperCase());
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Unsubscribed from ${pair}`,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
}
