/* eslint-disable @typescript-eslint/no-explicit-any */
import { BalanceChecker } from './balance-checker.js'
import { ExcelExporter } from './excel-exporter.js'
import {
  getAllWalletAddresses,
  getWalletAddressesForSelection,
  getWalletCount,
  formatAddressForSelection
} from './wallet-utils.js'
import prompts from 'prompts'

/**
 * Главное приложение для проверки балансов кошелька
 */
export class BalanceCheckerApp {
  private balanceChecker: BalanceChecker
  private excelExporter: ExcelExporter
  private isShuttingDown = false

  constructor () {
    this.balanceChecker = new BalanceChecker()
    this.excelExporter = new ExcelExporter()
    this.setupGracefulShutdown()
  }

  /**
   * Главное меню приложения
   */
  async showMainMenu (): Promise<void> {
    console.log('\n🚀 RetroFarm Pro - Проверка балансов кошелька')
    console.log('=' .repeat(50))

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Выберите действие:',
      choices: [
        { title: '🔍 Проверить балансы кошельков', value: 'check_wallets' },
        { title: '📊 Проверить доступность сетей', value: 'check_networks' },
        { title: '📄 Экспортировать в Excel (тестовые данные)', value: 'export_test' },
        { title: '❌ Выход', value: 'exit' }
      ]
    })

    if (!action) {
      console.log('👋 До свидания!')
      return
    }

    await this.handleAction(action)
  }

  /**
   * Обработка выбранного действия
   */
  private async handleAction (action: string): Promise<void> {
    switch (action) {
    case 'check_wallets':
      await this.checkWalletsBalances()
      break
    case 'check_networks':
      await this.checkNetworkAvailability()
      break
    case 'export_test':
      await this.exportTestData()
      break
    case 'exit':
      console.log('👋 До свидания!')
      return
    }

    // Возвращаемся в главное меню
    await this.showMainMenu()
  }

  /**
   * Главный метод проверки кошельков
   */
  private async checkWalletsBalances (): Promise<void> {
    try {
      // Получаем количество доступных кошельков
      const walletCount = getWalletCount()

      if (walletCount === 0) {
        console.log('❌ Не найдено доступных кошельков.')
        return
      }

      console.log(`\n🔍 Найдено ${walletCount} кошельков для проверки`)

      // Показываем подменю выбора
      const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'Выберите режим проверки:',
        choices: [
          { title: `📋 Проверить все кошельки (${walletCount})`, value: 'check_all' },
          { title: '🎯 Выбрать конкретные кошельки', value: 'check_selected' }
        ]
      })

      if (!action) return

      if (action === 'check_all') {
        await this.checkAllWallets()
      } else if (action === 'check_selected') {
        await this.checkSelectedWallets()
      }

    } catch (error) {
      console.error('❌ Ошибка при проверке кошельков:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Проверить все кошельки
   */
  private async checkAllWallets (): Promise<void> {
    try {
      const walletAddresses = getAllWalletAddresses()

      // Настройки проверки
      const { chainIds } = await prompts({
        type: 'multiselect',
        name: 'chainIds',
        message: 'Выберите сети для проверки (Enter для всех):',
        choices: this.balanceChecker.getSupportedChainIds().map((chainId: number) => {
          const networkConfig = this.balanceChecker.getNetworkConfig(chainId)
          const networkName = networkConfig?.name || `Chain ${chainId}`
          return {
            title: `${networkName} (${chainId})`,
            value: chainId
          }
        }),
        hint: '- Пробел для выбора, Enter для подтверждения'
      })

      const results = await this.balanceChecker.checkMultipleWallets(
        walletAddresses,
        {
          chainIds: chainIds.length > 0 ? chainIds : undefined
        }
      )

      // Выводим результаты
      console.log(this.balanceChecker.formatMultiWalletResults(results))

      // Предлагаем экспорт в Excel
      const { exportToExcel } = await prompts({
        type: 'confirm',
        name: 'exportToExcel',
        message: 'Экспортировать результаты в Excel?',
        initial: true
      })

      if (exportToExcel) {
        await this.exportMultiWalletResultsToExcel(results)
      }

    } catch (error) {
      console.error('❌ Ошибка при проверке всех кошельков:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Выбрать конкретные кошельки для проверки
   */
  private async checkSelectedWallets (): Promise<void> {
    try {
      const walletAddresses = getWalletAddressesForSelection()

      // Выбор кошельков
      const { selectedWallets } = await prompts({
        type: 'multiselect',
        name: 'selectedWallets',
        message: 'Выберите кошельки для проверки:',
        choices: walletAddresses.map((address, index) => ({
          title: `Кошелек ${index + 1}: ${formatAddressForSelection(address)}`,
          value: address
        })),
        hint: '- Пробел для выбора, Enter для подтверждения'
      })

      if (!selectedWallets || selectedWallets.length === 0) {
        console.log('❌ Не выбрано ни одного кошелька')
        return
      }

      // Настройки проверки
      const { chainIds } = await prompts({
        type: 'multiselect',
        name: 'chainIds',
        message: 'Выберите сети для проверки (Enter для всех):',
        choices: this.balanceChecker.getSupportedChainIds().map((chainId: number) => {
          const networkConfig = this.balanceChecker.getNetworkConfig(chainId)
          const networkName = networkConfig?.name || `Chain ${chainId}`
          return {
            title: `${networkName} (${chainId})`,
            value: chainId
          }
        }),
        hint: '- Пробел для выбора, Enter для подтверждения'
      })

      const results = await this.balanceChecker.checkMultipleWallets(
        selectedWallets,
        {
          chainIds: chainIds.length > 0 ? chainIds : undefined
        }
      )

      // Выводим результаты
      console.log(this.balanceChecker.formatMultiWalletResults(results))

      // Предлагаем экспорт в Excel
      const { exportToExcel } = await prompts({
        type: 'confirm',
        name: 'exportToExcel',
        message: 'Экспортировать результаты в Excel?',
        initial: true
      })

      if (exportToExcel) {
        await this.exportMultiWalletResultsToExcel(results)
      }

    } catch (error) {
      console.error('❌ Ошибка при проверке выбранных кошельков:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Проверить доступность сетей
   */
  private async checkNetworkAvailability (): Promise<void> {
    try {
      console.log('\n🌐 Проверяем доступность сетей...')

      const results = await this.balanceChecker.checkNetworkAvailability()

      console.log('\n📊 Статус сетей:')
      console.log('=' .repeat(50))

      for (const result of results) {
        const status = result.isAvailable ? '✅' : '❌'
        const rpcInfo = result.workingRPC ? ` (${result.workingRPC})` : ''
        console.log(`${status} ${result.name} (${result.chainId})${rpcInfo}`)
      }

    } catch (error) {
      console.error('❌ Ошибка при проверке сетей:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Экспортировать результаты множественных кошельков в Excel
   */
  private async exportMultiWalletResultsToExcel (results: any): Promise<void> {
    try {
      // Автогенерация имени файла
      const filename = `balances_${new Date().toISOString().split('T')[0]}.xlsx`

      // Создаем один Excel файл со всеми кошельками (без сортировки)
      const excelFilename = await this.excelExporter.exportMultiWalletResults(results, {
        filename,
        sortByValue: false
      })

      console.log(`✅ Excel файл создан: ${excelFilename}`)

    } catch (error) {
      console.error('❌ Ошибка при экспорте множественных кошельков в Excel:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Экспортировать тестовые данные
   */
  private async exportTestData (): Promise<void> {
    try {
      console.log('\n📊 Создаем тестовые данные для экспорта...')

      // Создаем тестовые данные
      const testResults: any = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        networks: [
          {
            chainId: 1,
            networkName: 'Ethereum',
            walletAddress: '0x1234567890123456789012345678901234567890',
            nativeBalance: {
              balance: BigInt('1000000000000000000'), // 1 ETH
              balanceFormatted: '1.0',
              symbol: 'ETH',
              usdValue: 2000
            },
            tokenBalances: [
              {
                address: '0xA0b86a33E6441c8C06DdD4C4c4c4c4c4c4c4c4c4',
                symbol: 'USDC',
                name: 'USD Coin',
                balance: BigInt('1000000000'), // 1000 USDC
                balanceFormatted: '1000.0',
                decimals: 6,
                usdValue: 1000,
                priceUSD: '1.0'
              }
            ],
            totalUsdValue: 3000,
            timestamp: Date.now()
          }
        ],
        totalUsdValue: 3000,
        timestamp: Date.now()
      }

      const excelFilename = await this.excelExporter.exportBalanceResults(testResults, {
        filename: 'test_export.xlsx',
        sortByValue: true
      })

      console.log(`✅ Тестовый Excel файл создан: ${excelFilename}`)

    } catch (error) {
      console.error('❌ Ошибка при создании тестовых данных:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Настроить graceful shutdown
   */
  private setupGracefulShutdown (): void {
    // Обработчик для SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true

      console.log('\n🔄 Получен сигнал завершения (SIGINT)...')
      await this.cleanup()
      process.exit(0)
    })

    // Обработчик для SIGTERM
    process.on('SIGTERM', async () => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true

      console.log('\n🔄 Получен сигнал завершения (SIGTERM)...')
      await this.cleanup()
      process.exit(0)
    })

    // Обработчик для необработанных исключений
    process.on('uncaughtException', async (error) => {
      console.error('💥 Необработанное исключение:', error)
      await this.cleanup()
      process.exit(1)
    })

    // Обработчик для необработанных промисов
    process.on('unhandledRejection', async (reason) => {
      console.error('💥 Необработанное отклонение промиса:', reason)
      await this.cleanup()
      process.exit(1)
    })
  }

  /**
   * Очистка ресурсов при завершении
   */
  private async cleanup (): Promise<void> {
    try {
      console.log('🧹 Очищаем ресурсы...')

      // Закрываем все RPC соединения
      await this.balanceChecker.cleanup()

      console.log('✅ Очистка завершена')
    } catch (error) {
      console.error('⚠️ Ошибка при очистке ресурсов:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Запустить приложение
   */
  async run (): Promise<void> {
    try {
      await this.showMainMenu()
    } catch (error) {
      console.error('❌ Критическая ошибка приложения:', error instanceof Error ? error.message : 'Неизвестная ошибка')
      await this.cleanup()
    }
  }
}
