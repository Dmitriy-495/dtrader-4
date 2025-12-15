#!/usr/bin/env python3
"""
Тестовый WebSocket клиент на Python для проверки приветственного сообщения
"""

import json
import websocket
import time

def on_message(ws, message):
    """Обработчик входящих сообщений"""
    try:
        data = json.loads(message)
        
        if data['type'] == 'system:welcome':
            print("📩 Получено приветственное сообщение:")
            print(f"🎉 {data['message']}")
            print(f"🆔 Client ID: {data['clientId']}")
            print(f"🕒 Серверное время: {data['connectionInfo']['serverTime']}")
            print(f"🔌 WebSocket порт: {data['connectionInfo']['websocketPort']}")
            print(f"📊 Redis: {'✅ Подключено' if data['systemStatus']['redisConnected'] else '❌ Отключено'}")
            print(f"📊 Бот: {data['systemStatus']['botStatus']}")
            print(f"📊 Трейдер: {data['systemStatus']['traderStatus']}")
            
            print("\n📋 Доступные события:")
            for event in data['availableEvents']:
                print(f"   - {event}")
            
            print("\n📋 Доступные команды:")
            for cmd, desc in data['availableCommands'].items():
                print(f"   {cmd}: {desc}")
            
            print("\n💡 Советы:")
            for tip in data['tips']:
                print(f"   • {tip}")
            
            print("\n📖 Документация:")
            print(f"   API: {data['documentation']['api']}")
            print(f"   GitHub: {data['documentation']['github']}")
            print(f"   Support: {data['documentation']['support']}")
            
            print("\n✅ Тест приветственного сообщения пройден успешно!")
            
            # Закрываем соединение через 1 секунду
            time.sleep(1)
            ws.close()
            
        elif data['type'] == 'system:status':
            print(f"\n📊 Получен статус системы: {data['status']}")
            
        elif data['type'] == 'ping':
            print(f"\n🏓 Получен ping, отправляем pong...")
            ws.send(json.dumps({"type": "pong", "timestamp": int(time.time() * 1000)}))
            
    except json.JSONDecodeError as e:
        print(f"❌ Ошибка парсинга JSON: {e}")
        print(f"📄 Сырые данные: {message}")

def on_error(ws, error):
    """Обработчик ошибок"""
    print(f"❌ Ошибка WebSocket: {error}")

def on_close(ws, close_status_code, close_msg):
    """Обработчик закрытия соединения"""
    print(f"\n🔌 Соединение закрыто с кодом: {close_status_code}")

def on_open(ws):
    """Обработчик открытия соединения"""
    print("✅ Соединение с WebSocket сервером установлено")

def main():
    """Основная функция"""
    print("🧪 Тестирование WebSocket клиента на Python")
    print("=========================================\n")
    
    # Устанавливаем соединение
    ws = websocket.WebSocketApp(
        "ws://localhost:2808",
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    
    # Запускаем клиент
    ws.run_forever()

if __name__ == "__main__":
    main()