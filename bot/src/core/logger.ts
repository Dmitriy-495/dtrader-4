// Простой логгер для записи логов в файл
import * as fs from 'fs';
import * as path from 'path';

// Создаем директорию для логов, если ее нет
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, 'bot.log');

// Функция для записи логов в файл
export function logToFile(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(logFilePath, logMessage, 'utf8');
  } catch (error) {
    console.error('❌ Ошибка записи в лог-файл:', error);
  }
}

// Обертки для консольного логирования с записью в файл
export function logInfo(message: string): void {
  const fullMessage = `ℹ️  ${message}`;
  console.log(fullMessage);
  logToFile(fullMessage);
}

export function logSuccess(message: string): void {
  const fullMessage = `✅ ${message}`;
  console.log(fullMessage);
  logToFile(fullMessage);
}

export function logError(message: string, error: unknown): void {
  let errorMessage = 'Неизвестная ошибка';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  const fullMessage = `❌ ${message}: ${errorMessage}`;
  console.error(fullMessage);
  logToFile(fullMessage);
}

export function logWarning(message: string): void {
  const fullMessage = `⚠️  ${message}`;
  console.warn(fullMessage);
  logToFile(fullMessage);
}