// Улучшенная версия app.ts без WebSocket (только HTTP и InstanceSystem)
const http = require("http");
const { baseConfig: config } = require("./config/config");
const { getStateManager } = require("./core/StateManager");
const { getInstanceSystem } = require("./instances/InstanceSystem");
const { logError, logSuccess, logInfo, logWarning } = require("./core/logger");

// Типы
interface SystemMessage {
  type: "system" | "balanceUpdate" | "error";
  message?: string;
  timestamp?: string;
  data?: any;
}

interface ApiResponse {
  status?: string;
  error?: string;
  data?: any;
  timestamp?: string;
}

// Состояние приложения
let instanceSystem: any = null;
let httpServer: any = null;

// HTTP Server
const createHttpServer = (): any => {
  return http.createServer((req: any, res: any) => {
    try {
      if (req.method === "GET" && req.url === "/api/status") {
        const response: ApiResponse = { status: "DTrader-4 is running!" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } else if (req.method === "GET" && req.url === "/api/health") {
        const response: ApiResponse = {
          status: "healthy",
          timestamp: new Date().toISOString(),
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } else {
        const response: ApiResponse = { error: "Not Found" };
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      }
    } catch (error) {
      logError("Ошибка обработки HTTP запроса", error);
      const response: ApiResponse = { error: "Internal Server Error" };
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    }
  });
};

// Graceful Shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  if (config.isShuttingDown) return;
  config.isShuttingDown = true;

  logInfo(`Получен сигнал ${signal}. Завершение работы...`);

  const shutdownTimeout = setTimeout(() => {
    logError("Таймаут ожидания", new Error("Shutdown timeout"));
    process.exit(1);
  }, 5000);

  try {
    // Остановка Instance System
    if (instanceSystem) {
      logInfo("Остановка Instance System...");
      await instanceSystem.stop();
      logSuccess("Instance System остановлен");
    }

    // Закрытие HTTP сервера
    if (httpServer) {
      logInfo("Закрытие HTTP сервера...");
      httpServer.close(() => {
        logSuccess("HTTP сервер остановлен");
      });
    }

    clearTimeout(shutdownTimeout);
    logSuccess("Сервер полностью остановлен");
    process.exit(0);
  } catch (error) {
    logError("Ошибка при завершении работы", error);
    process.exit(1);
  }
};

// Основная функция
const main = async (): Promise<void> => {
  try {
    // Инициализация сервера
    httpServer = createHttpServer();

    // Настройка обработчиков сигналов
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

    // Обработка необработанных ошибок
    process.on("uncaughtException", (err: Error) => {
      logError("Необработанная ошибка", err);
      gracefulShutdown("ERROR");
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logError("Необработанный rejection", reason);
      gracefulShutdown("REJECTION");
    });

    // Проверка конфигурации биржи
    if (config.exchange.enabled) {
      logInfo("Gate.io Exchange: Ключи API настроены");

      // Инициализация Instance System
      instanceSystem = getInstanceSystem();
      await instanceSystem.start();

      // Получение баланса
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
      logInfo("Gate.io Exchange: Ключи API не настроены");
    }

    // Запуск сервера
    httpServer.listen(config.SERVER_PORT, () => {
      logSuccess(`REST API запущен на http://localhost:${config.SERVER_PORT}`);
      logInfo("WebSocket сервер работает в инстансе ws-server");
      logInfo("Нажмите Ctrl+C для завершения");
    });

    // Ожидание завершения
    await new Promise<void>((resolve) => {
      const checkShutdown = () => {
        if (config.isShuttingDown) {
          resolve();
        } else {
          setImmediate(checkShutdown);
        }
      };
      setImmediate(checkShutdown);
    });

    // Освобождение ресурсов
    const stateManager = getStateManager();
    await stateManager.disconnect();
  } catch (error) {
    logError("Фатальная ошибка при запуске", error);
    process.exit(1);
  }
};

// Запуск
main().catch((error) => {
  logError("Фатальная ошибка", error);
  process.exit(1);
});
