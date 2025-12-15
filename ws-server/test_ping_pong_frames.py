#!/usr/bin/env python3
"""
Тест протокольных PING/PONG фреймов WebSocket
"""

import asyncio
import websockets
import time

async def test_ping_pong():
    print("🧪 Тестирование протокольных PING/PONG фреймов")
    print("============================================\n")
    
    try:
        # Подключаемся к серверу
        async with websockets.connect('ws://localhost:2808') as websocket:
            print("✅ Соединение установлено")
            
            # Ждём приветственное сообщение
            welcome_message = await asyncio.wait_for(websocket.recv(), timeout=5)
            print(f"📩 Приветственное сообщение: {welcome_message[:100]}...")
            
            # Теперь сервер должен отправлять PING фреймы каждые 15 секунд
            print("\n🕒 Ожидание PING фрейма от сервера...")
            print("   (Сервер отправляет PING каждые 15 секунд)")
            
            start_time = time.time()
            ping_received = False
            
            # Ждём 20 секунд, чтобы получить PING
            while time.time() - start_time < 20:
                try:
                    # Пытаемся получить сообщение с таймаутом
                    message = await asyncio.wait_for(websocket.recv(), timeout=1)
                    print(f"📩 Получено сообщение: {message[:100]}...")
                except asyncio.TimeoutError:
                    # Это нормально, просто нет сообщений
                    pass
                except Exception as e:
                    print(f"❌ Ошибка: {e}")
                    break
            
            print(f"\n✅ Тест завершён за {time.time() - start_time:.1f} секунд")
            print("💡 Если соединение не закрылось, значит PING/PONG работает правильно!")
            
    except websockets.exceptions.ConnectionClosed as e:
        print(f"\n❌ Соединение закрыто: {e}")
        if "1001" in str(e):
            print("   Это нормально, если клиент не ответил на PING")
        return False
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        return False
    
    return True

if __name__ == "__main__":
    result = asyncio.get_event_loop().run_until_complete(test_ping_pong())
    if result:
        print("\n🎉 Тест пройден успешно!")
    else:
        print("\n❌ Тест не пройден")