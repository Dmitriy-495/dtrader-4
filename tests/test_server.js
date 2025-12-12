#!/usr/bin/env node
/**
 * Основные тесты для DTrader-4 сервера
 * Тестирует REST API и WebSocket функциональность
 */

const http = require('http');
const WebSocket = require('ws');
const { execSync } = require('child_process');

// Конфигурация тестов
const TEST_CONFIG = {
  restPort: 1971,
  wsPort: 2808,
  testTimeout: 10000,
  serverStartDelay: 2000
};

// Цвета для вывода
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.startTime = Date.now();
  }
  
  log(message, color = colors.cyan) {
    console.log(`${color}${message}${colors.reset}`);
  }
  
  success(testName) {
    this.passed++;
    this.log(`✅ PASS: ${testName}`, colors.green);
  }
  
  fail(testName, error) {
    this.failed++;
    this.log(`❌ FAIL: ${testName}`, colors.red);
    if (error) {
      this.log(`   Error: ${error.message}`, colors.red);
    }
  }
  
  summary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.log(`\n${'='.repeat(50)}`, colors.magenta);
    this.log(`📊 Test Summary:`, colors.magenta);
    this.log(`   Total: ${this.passed + this.failed}`, colors.cyan);
    this.log(`   Passed: ${this.passed}`, colors.green);
    this.log(`   Failed: ${this.failed}`, colors.red);
    this.log(`   Duration: ${duration}s`, colors.cyan);
    this.log(`${'='.repeat(50)}`, colors.magenta);
    
    return this.failed === 0;
  }
}

async function testRestApi() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`REST API test timed out after ${TEST_CONFIG.testTimeout}ms`));
    }, TEST_CONFIG.testTimeout);
    
    http.get(`http://localhost:${TEST_CONFIG.restPort}/api/status`, (res) => {
      clearTimeout(timeout);
      
      if (res.statusCode !== 200) {
        reject(new Error(`Expected status 200, got ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status !== 'DTrader-4 is running!') {
            reject(new Error(`Unexpected response: ${data}`));
          }
          resolve();
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function testWebSocket() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket test timed out after ${TEST_CONFIG.testTimeout}ms`));
    }, TEST_CONFIG.testTimeout);
    
    const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.wsPort}`);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'system' && message.message === 'Welcome to DTrader-4!') {
          ws.close();
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
  });
}

async function startServer() {
  return new Promise((resolve) => {
    const serverProcess = execSync('node src/index.js & echo $!', { 
      encoding: 'utf8',
      cwd: __dirname + '/..'
    }).trim();
    
    setTimeout(() => resolve(serverProcess), TEST_CONFIG.serverStartDelay);
  });
}

async function stopServer(pid) {
  try {
    execSync(`kill -TERM ${pid}`, { stdio: 'pipe' });
  } catch (e) {
    // Ignore errors if process already stopped
  }
}

async function runTests() {
  const runner = new TestRunner();
  let serverPid = null;
  
  try {
    runner.log('🧪 Starting DTrader-4 Server Tests...', colors.blue);
    
    // Start server
    runner.log('🚀 Starting server...', colors.cyan);
    serverPid = await startServer();
    runner.log(`📋 Server PID: ${serverPid}`, colors.cyan);
    
    // Test REST API
    runner.log('🔍 Testing REST API...', colors.cyan);
    await testRestApi();
    runner.success('REST API responds correctly');
    
    // Test WebSocket
    runner.log('🔍 Testing WebSocket...', colors.cyan);
    await testWebSocket();
    runner.success('WebSocket connects successfully');
    
    // All tests passed
    return runner.summary();
    
  } catch (error) {
    runner.fail('Test execution', error);
    return runner.summary();
  } finally {
    // Cleanup
    if (serverPid) {
      runner.log('🧹 Stopping server...', colors.cyan);
      await stopServer(serverPid);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runTests, testRestApi, testWebSocket };