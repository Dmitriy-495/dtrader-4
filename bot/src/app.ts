const http = require("http");
const { baseConfig: config } = require("./config/config");
const { getStateManager } = require("./core/StateManager");
const { getInstanceSystem } = require("./instances/InstanceSystem");
const { logError, logSuccess, logInfo, logWarning } = require("./core/logger");

interface ApiResponse {
  status?: string;
  error?: string;
  data?: any;
  timestamp?: string;
  health?: any;
}

let instanceSystem: any = null;
let httpServer: any = null;
let isShuttingDown: boolean = false;

// ============== HTTP SERVER ==============

const createHttpServer = (): any => {
  return http.createServer((req: any, res: any) => {
    try {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.method === "GET" && req.url === "/api/status") {
        const status = instanceSystem ? instanceSystem.getStatus() : { isRunning: false };
        const response: ApiResponse = { 
          status: "DTrader-4 Bot is running!",
          data: status,
          timestamp: new Date().toISOString()
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response, null, 2));
      } else if (req.method === "GET" && req.url === "/api/health") {
        const health = instanceSystem ? instanceSystem.getHealth() : {
          stateManager: false,
          websocket: false,
          exchange: false,
          lastBalanceUpdate: 0
        };
        
        const isHealthy = health.stateManager && health.websocket;
        
        const response: ApiResponse = {
          status: isHealthy ? "healthy" : "unhealthy",
          health: health,
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response, null, 2));
      } else if (req.method === "GET" && req.url === "/api/balance") {
        if (!instanceSystem) {
          const response: ApiResponse = { 
            error: "Instance system not initialized",
            timestamp: new Date().toISOString()
          };
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
          return;
        }
        
        instanceSystem.getCurrentBalance()
          .then((balance: any) => {
            const response: ApiResponse = { 
              status: "success",
              data: balance || [],
              timestamp: new Date().toISOString()
            };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response, null, 2));
          })
          .catch((error: Error) => {
            const response: ApiResponse = { 
              error: error.message,
              timestamp: new Date().toISOString()
            };
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
          });
      } else {
        const response: ApiResponse = { 
          error: "Not Found",
          timestamp: new Date().toISOString()
        };
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      }
    } catch (error) {
      logError("Ошибка обработки HTTP запроса", error);
      const response: ApiResponse = { 
        error: "Internal Server Error",
        timestamp: new Date().toISOString()
      };
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    }
  });
};

// ============== GRACEFUL SHUTDOWN ==============

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    logInfo('Завершение уже выполняется...');
    return;
  }
  
  isShuttingDown = true;
  logInfo(`Получен сигнал ${signal}. Начало безопасного завершения...`);

  const shutdownTimeout = setTimeout(() => {
    logError("Таймаут ожидания", new Error("Shutdown timeout"));
    process.exit(1);
  }, 10000);

  try {
    if (instanceSystem) {
      logInfo("Остановка Instance System...");
      await instanceSystem.stop();
      logSuccess("Instance System остановлен");
    }

    if (httpServer) {
      logInfo("Закрытие HTTP сервера...");
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          logSuccess("HTTP сервер остановлен");
          resolve();
        });
      });
    }

    const stateManager = getStateManager();
    if (stateManager && stateManager.isHealthy()) {
      await stateManager.disconnect();
    }

    clearTimeout(shutdownTimeout);
    logSuccess("Сервер полностью остановлен");
    process.exit(0);
  } catch (error) {
    logError("Ошибка при завершении работы", error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// ============== MAIN ==============

const main = async (): Promise<void> => {
  try {
    httpServer = createHttpServer();

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));
    process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

    process.on("uncaughtException", (err: Error) => {
      logError("Необработанная ошибка", err);
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logError("Необработанный rejection", reason);
      gracefulShutdown("UNHANDLED_REJECTION");
    });

    if (config.exchange.enabled) {
      logInfo("Gate.io Exchange: Ключи API настроены");

      instanceSystem = getInstanceSystem();
      await instanceSystem.start();

      const balance = await instanceSystem.getCurrentBalance();
      if (balance && balance.length > 0) {
        logInfo("Баланс получен:");
        balance.forEach((asset: any) => {
          logInfo(
            `  ${asset.currency}: ${asset.available} (заблокировано: ${asset.locked})`
          );
        });
      }
    } else {
      logWarning("Gate.io Exchange: Ключи API не настроены");
      logInfo("Работа в режиме без биржи (только Redis и WebSocket)");
    }

    httpServer.listen(config.SERVER_PORT, () => {
      logSuccess(`REST API запущен на http://localhost:${config.SERVER_PORT}`);
      logInfo(`  - GET /api/status - Статус системы`);
      logInfo(`  - GET /api/health - Health check`);
      logInfo(`  - GET /api/balance - Текущий баланс`);
      logInfo("WebSocket сервер работает в инстансе ws-server");
      logInfo("Нажмите Ctrl+C для завершения");
    });

    await new Promise<void>((resolve) => {
      const checkShutdown = () => {
        if (isShuttingDown) {
          resolve();
        } else {
          setImmediate(checkShutdown);
        }
      };
      setImmediate(checkShutdown);
    });
  } catch (error) {
    logError("Фатальная ошибка при запуске", error);
    process.exit(1);
  }
};

main().catch((error) => {
  logError("Фатальная ошибка", error);
  process.exit(1);
});
