import http from "http";
import WebSocket from "ws";
import { config } from "./config";
import { SystemMessage, ApiResponse } from "./types";
import { GateioRest } from "./exchanges/gateio/rest";

// HTTP Server
const server = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    // Простой маршрутизатор с типами
    if (req.method === "GET" && req.url === "/api/status") {
      const response: ApiResponse = { status: "DTrader-4 is running!" };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } else {
      const response: ApiResponse = { error: "Not Found" };
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    }
  }
);

// WebSocket Server с типами
const wss = new WebSocket.Server({ port: config.WS_PORT });

wss.on("connection", (ws: WebSocket) => {
  const welcomeMessage: SystemMessage = {
    type: "system",
    message: "Welcome to DTrader-4!",
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(welcomeMessage));
});

// Обработка сигналов для безопасного выхода
function shutdown(signal: string): void {
  if (config.isShuttingDown) return;
  config.isShuttingDown = true;

  console.log(`\n🛑 Получен сигнал ${signal}. Завершение работы сервера...`);

  let serversClosed = 0;
  const totalServers = 2; // HTTP и WebSocket серверы

  // Устанавливаем таймаут на закрытие серверов (5 секунд)
  const shutdownTimeout = setTimeout(() => {
    console.log(
      "⚠️  Таймаут ожидания закрытия серверов. Принудительное завершение."
    );
    process.exit(1);
  }, 5000);

  // Закрываем WebSocket сервер
  if (wss) {
    console.log("🔌 Закрываем WebSocket соединения...");

    // Закрываем все активные соединения
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.terminate();
      }
    });

    // Закрываем WebSocket сервер
    wss.close((err) => {
      if (err) {
        console.error("❌ Ошибка при закрытии WebSocket сервера:", err.message);
      } else {
        console.log("✅ WebSocket сервер успешно остановлен");
      }
      serversClosed++;
      checkAllServersClosed();
    });
  } else {
    serversClosed++;
  }

  // Закрываем HTTP сервер
  if (server) {
    console.log("🌐 Закрываем HTTP сервер...");
    server.close((err) => {
      if (err) {
        console.error("❌ Ошибка при закрытии HTTP сервера:", err.message);
      } else {
        console.log("✅ HTTP сервер успешно остановлен");
      }
      serversClosed++;
      checkAllServersClosed();
    });
  } else {
    serversClosed++;
  }

  // Проверяем, закрыты ли все серверы
  function checkAllServersClosed() {
    if (serversClosed >= totalServers) {
      clearTimeout(shutdownTimeout);
      console.log("👋 Сервер полностью остановлен. Порты освобождены.");
      console.log("💡 Вы можете запустить сервер снова");
      process.exit(0);
    }
  }
}

// Настраиваем обработчики сигналов
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGQUIT", () => shutdown("SIGQUIT"));

// Обработка необработанных ошибок
process.on("uncaughtException", (err: Error) => {
  console.error("❌ Необработанная ошибка:", err.message);
  shutdown("ERROR");
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("❌ Необработанный rejection:", reason);
  shutdown("REJECTION");
});

// Обработка завершения процесса
process.on("exit", (code) => {
  console.log(`🔚 Процесс завершен с кодом ${code}`);
  forceCleanup();
});

// Функция для принудительного освобождения портов
function forceCleanup() {
  console.log("🔥 Принудительная очистка ресурсов...");

  // Закрываем все активные соединения
  if (wss) {
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.terminate();
      }
    });
  }

  // Освобождаем ссылки на серверы
  if (server) {
    server.removeAllListeners();
  }

  if (wss) {
    wss.removeAllListeners();
  }

  console.log("🧹 Ресурсы освобождены");
}

// Обработка сигнала SIGHUP для принудительной очистки
process.on("SIGHUP", () => {
  console.log("🔥 Получен сигнал SIGHUP. Принудительная очистка.");
  forceCleanup();
  process.exit(1);
});

// Основная функция запуска
async function main() {
  // Проверка конфигурации биржи
  if (config.exchange.enabled) {
    console.log("🔄 Gate.io Exchange: Ключи API настроены");
    console.log(
      `🔑 API Key: ${config.exchange.apiKey ? "****" : "отсутствует"}`
    );
    console.log(
      `🔑 API Secret: ${config.exchange.secret ? "****" : "отсутствует"}`
    );
    console.log("💡 Готово к работе с Gate.io API через HTTP");

    // Создаем экземпляр REST соединения с API ключами
    const gateioRest = new GateioRest(config.exchange.apiKey, config.exchange.secret);

    // Устанавливаем соединение
    await gateioRest.connect();

    // Получаем баланс (аутентифицированный запрос)
    const balance = await gateioRest.getBalance();

    if (balance) {
      console.log("💰 Баланс успешно получен:");
      // Выводим только основную информацию о балансе
      if (Array.isArray(balance) && balance.length > 0) {
        console.log(`   🪙 Всего активов: ${balance.length}`);
        // Показываем только первые 3 актива для краткости
        balance.slice(0, 3).forEach((asset: any) => {
          console.log(`   💎 ${asset.currency}: ${asset.available} (заблокировано: ${asset.locked})`);
        });
        if (balance.length > 3) {
          console.log(`   ... и еще ${balance.length - 3} активов`);
        }
      }
    }

    // Закрываем соединение при завершении
    process.on("exit", () => {
      gateioRest.disconnect();
    });
  } else {
    console.log("🔄 Gate.io Exchange: Ключи API не настроены");
    console.log("🔑 API Key: отсутствует");
    console.log("🔑 API Secret: отсутствует");
    console.log("💡 Для работы с биржей добавьте API ключи в .env");
  }

  // Запуск серверов
  server.listen(config.PORT, () => {
    console.log(
      `🚀 DTrader-4 REST API запущен на http://localhost:${config.PORT}`
    );
    console.log(
      `📡 WebSocket сервер запущен на ws://localhost:${config.WS_PORT}`
    );
    if (config.exchange.enabled) {
      console.log("💰 Gate.io Exchange: Готово к работе через HTTP API");
    } else {
      console.log("💰 Gate.io Exchange: Не активно (требуются API ключи)");
    }
    console.log("💡 Нажмите Ctrl+C для безопасного завершения");
    console.log("🔧 Поддерживаются сигналы: SIGINT (Ctrl+C), SIGTERM, SIGQUIT");
  });

  // Используем Event Loop для ожидания сообщений
  console.log("🔄 Запуск основного цикла обработки сообщений...");
  console.log("💡 Используем Event Loop для эффективного ожидания");

  // Создаем обещание, которое разрешится при завершении работы
  const waitForShutdown = new Promise<void>((resolve) => {
    // Разрешаем обещание только при завершении работы
    const checkShutdown = () => {
      if (config.isShuttingDown) {
        resolve();
      } else {
        // Планируем следующую проверку в следующем тике Event Loop
        setImmediate(checkShutdown);
      }
    };

    // Начинаем проверку
    setImmediate(checkShutdown);
  });

  // Ожидаем завершения работы
  await waitForShutdown;

  console.log("🛑 Основной цикл обработки остановлен");
}

// Запуск основной функции
main().catch((error) => {
  console.error("❌ Фатальная ошибка при запуске сервера:", error.message);
  process.exit(1);
});
