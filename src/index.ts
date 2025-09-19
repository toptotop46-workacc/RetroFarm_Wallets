import { setupEncoding } from './encoding-setup.js'
import { BalanceCheckerApp } from './balance-checker-app.js'

/**
 * Основная функция приложения
 */
async function main (): Promise<void> {
  // Настройка кодировки для корректного отображения кириллицы
  setupEncoding()

  console.log('🚀 RetroFarm Pro - Проверка балансов кошелька')
  console.log('=' .repeat(50))

  try {
    const app = new BalanceCheckerApp()
    await app.run()
  } catch (error) {
    console.error('❌ Критическая ошибка:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    process.exit(1)
  }
}

// Запуск приложения
main().catch((error) => {
  console.error('💥 Необработанная ошибка:', error)
  process.exit(1)
})

// Удален принудительный таймер завершения - приложение должно завершаться естественным образом
