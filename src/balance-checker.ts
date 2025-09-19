import { Address } from 'viem'
import { RPCManager } from './rpc-manager.js'
import { TokenListManager } from './token-list-manager.js'
import { Multicall3Service, BalanceResult, NativeBalanceResult } from './multicall3-service.js'
import * as cliProgress from 'cli-progress'

/**
 * Результат проверки балансов для одной сети
 */
export interface NetworkBalanceResult {
  chainId: number
  networkName: string
  walletAddress: string
  nativeBalance: NativeBalanceResult
  tokenBalances: BalanceResult[]
  totalUsdValue: number
  timestamp: number
}

/**
 * Результат проверки балансов для всех сетей
 */
export interface AllNetworksBalanceResult {
  walletAddress: string
  networks: NetworkBalanceResult[]
  totalUsdValue: number
  timestamp: number
}

/**
 * Конфигурация для проверки балансов
 */
export interface BalanceCheckConfig {
  chainIds?: number[] // Если не указано, проверяются все поддерживаемые сети
  batchSize?: number // Размер batch для Multicall3
}

/**
 * Результат проверки балансов для одного кошелька
 */
export interface WalletBalanceResult {
  address: string
  results: AllNetworksBalanceResult
}

/**
 * Результат проверки балансов для множественных кошельков
 */
export interface MultiWalletBalanceResult {
  wallets: WalletBalanceResult[]
  totalUsdValue: number
  timestamp: number
}

/**
 * Основной класс для проверки балансов кошелька
 */
export class BalanceChecker {
  private rpcManager: RPCManager
  private tokenListManager: TokenListManager
  private multicallService: Multicall3Service

  constructor () {
    this.rpcManager = new RPCManager()
    this.tokenListManager = new TokenListManager()
    this.multicallService = new Multicall3Service(this.rpcManager, this.tokenListManager)
  }

  /**
   * Получить поддерживаемые chainId
   */
  getSupportedChainIds (): number[] {
    return this.rpcManager.getSupportedChainIds()
  }

  /**
   * Получить конфигурацию сети по chainId
   */
  getNetworkConfig (chainId: number) {
    return this.rpcManager.getNetworkConfig(chainId)
  }

  /**
   * Очистка ресурсов
   */
  async cleanup (): Promise<void> {
    try {
      console.log('🧹 Очищаем ресурсы BalanceChecker...')

      // Закрываем все RPC соединения
      await this.rpcManager.closeAllConnections()

      // Очищаем кэш токенов
      this.tokenListManager.clearCache()
      console.log('✅ BalanceChecker очищен')
    } catch (error) {
      console.error('⚠️ Ошибка при очистке BalanceChecker:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Проверить балансы кошелька во всех поддерживаемых сетях
   */
  async checkAllNetworks (
    walletAddress: Address,
    config: BalanceCheckConfig = {}
  ): Promise<AllNetworksBalanceResult> {
    const supportedChainIds = this.rpcManager.getSupportedChainIds()
    const chainIds = config.chainIds || supportedChainIds

    // Проверяем все сети параллельно
    const networkPromises = chainIds.map(async (chainId) => {
      try {
        const networkResult = await this.checkSingleNetwork(walletAddress, chainId)
        return networkResult
      } catch {
        // Добавляем пустой результат для неудачной сети
        const networkConfig = this.rpcManager.getNetworkConfig(chainId)
        return {
          chainId,
          networkName: networkConfig?.name || `Chain ${chainId}`,
          walletAddress,
          nativeBalance: {
            balance: 0n,
            balanceFormatted: '0',
            symbol: networkConfig?.nativeCurrency.symbol || 'ETH',
            usdValue: 0
          },
          tokenBalances: [],
          totalUsdValue: 0,
          timestamp: Date.now()
        } as NetworkBalanceResult
      }
    })

    // Ждем завершения всех сетей
    const networkResults = await Promise.all(networkPromises)

    // Вычисляем общую стоимость
    const totalUsdValue = networkResults.reduce((sum, network) => sum + network.totalUsdValue, 0)

    const result: AllNetworksBalanceResult = {
      walletAddress,
      networks: networkResults,
      totalUsdValue,
      timestamp: Date.now()
    }

    return result
  }

  /**
   * Проверить балансы кошелька в конкретной сети
   */
  async checkSingleNetwork (
    walletAddress: Address,
    chainId: number
  ): Promise<NetworkBalanceResult> {
    const networkConfig = this.rpcManager.getNetworkConfig(chainId)
    if (!networkConfig) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    // Получаем токены для сети
    const tokens = await this.tokenListManager.getTokensForChain(chainId)

    // Проверяем нативный баланс
    const nativeBalance = await this.multicallService.checkNativeBalance(chainId, walletAddress)

    // Проверяем балансы токенов
    const tokenBalances = await this.multicallService.checkTokenBalances(
      chainId,
      walletAddress,
      tokens
    )

    // Фильтруем нулевые балансы (всегда исключаем нули)
    const finalTokenBalances = tokenBalances.filter(token => token.balance > 0n)

    // Вычисляем общую стоимость
    const tokenUsdValue = finalTokenBalances.reduce((sum, token) => sum + token.usdValue, 0)
    const totalUsdValue = nativeBalance.usdValue + tokenUsdValue

    return {
      chainId,
      networkName: networkConfig.name,
      walletAddress,
      nativeBalance,
      tokenBalances: finalTokenBalances,
      totalUsdValue,
      timestamp: Date.now()
    }
  }

  /**
   * Получить статистику кэшей
   */
  getCacheStats (): {
    rpc: { clientCache: number; healthCache: number }
    tokens: { memoryCache: number; fileCache: number }
    } {
    return {
      rpc: this.rpcManager.getCacheStats(),
      tokens: this.tokenListManager.getCacheStats()
    }
  }

  /**
   * Проверить доступность всех сетей
   */
  async checkNetworkAvailability (): Promise<Array<{
    chainId: number
    name: string
    isAvailable: boolean
    workingRPC?: string
  }>> {
    return await this.rpcManager.checkAllNetworks()
  }

  /**
   * Экспортировать результаты в JSON
   */
  exportToJSON (results: AllNetworksBalanceResult, filename?: string): string {
    const jsonString = JSON.stringify(results, null, 2)

    if (filename) {
      const fs = require('fs')
      fs.writeFileSync(filename, jsonString)
      console.log(`📄 Результаты экспортированы в ${filename}`)
    }

    return jsonString
  }

  /**
   * Форматировать результаты для вывода в консоль
   */
  formatResultsForConsole (results: AllNetworksBalanceResult): string {
    let output = `\n📊 Результаты проверки балансов для кошелька ${results.walletAddress}\n`
    output += `💰 Общая стоимость: $${results.totalUsdValue.toFixed(2)}\n`
    output += `🌐 Проверено сетей: ${results.networks.length}\n\n`

    for (const network of results.networks) {
      output += `🔗 ${network.networkName} (${network.chainId})\n`
      output += `   💎 ${network.nativeBalance.symbol}: ${network.nativeBalance.balanceFormatted} ($${network.nativeBalance.usdValue.toFixed(2)})\n`

      if (network.tokenBalances.length > 0) {
        output += `   🪙 Токены (${network.tokenBalances.length}):\n`
        for (const token of network.tokenBalances.slice(0, 5)) { // Показываем только первые 5
          output += `      ${token.symbol}: ${token.balanceFormatted} ($${token.usdValue.toFixed(2)})\n`
        }
        if (network.tokenBalances.length > 5) {
          output += `      ... и еще ${network.tokenBalances.length - 5} токенов\n`
        }
      }

      output += `   💰 Итого по сети: $${network.totalUsdValue.toFixed(2)}\n\n`
    }

    return output
  }

  /**
   * Проверить балансы множественных кошельков
   */
  async checkMultipleWallets (
    walletAddresses: string[],
    config: BalanceCheckConfig = {}
  ): Promise<MultiWalletBalanceResult> {

    // Создаем прогресс-бар для кошельков
    const progressBar = new cliProgress.SingleBar({
      format: '🔍 Проверка кошельков: [{bar}] {percentage}% | {value}/{total} кошельков | {duration_formatted}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true
    })

    progressBar.start(walletAddresses.length, 0)

    const walletResults: WalletBalanceResult[] = []
    let totalUsdValue = 0

    // Обрабатываем кошельки батчами по 8 штук для оптимальной производительности
    const BATCH_SIZE = 8

    for (let i = 0; i < walletAddresses.length; i += BATCH_SIZE) {
      const batch = walletAddresses.slice(i, i + BATCH_SIZE)

      // Обрабатываем батч параллельно
      const batchPromises = batch.map(async (walletAddress) => {
        if (!walletAddress) return null

        try {
          const results = await this.checkAllNetworks(walletAddress as Address, config)
          progressBar.increment()
          return {
            address: walletAddress,
            results
          }
        } catch {
          // Добавляем пустой результат для неудачного кошелька
          progressBar.increment()
          return {
            address: walletAddress,
            results: {
              walletAddress,
              networks: [],
              totalUsdValue: 0,
              timestamp: Date.now()
            }
          }
        }
      })

      // Ждем завершения всех кошельков в батче
      const batchResults = await Promise.all(batchPromises)

      // Добавляем результаты
      for (const result of batchResults) {
        if (result) {
          walletResults.push(result)
          totalUsdValue += result.results.totalUsdValue
        }
      }
    }

    progressBar.stop()

    const result: MultiWalletBalanceResult = {
      wallets: walletResults,
      totalUsdValue,
      timestamp: Date.now()
    }

    return result
  }

  /**
   * Форматировать результаты для множественных кошельков
   */
  formatMultiWalletResults (results: MultiWalletBalanceResult): string {
    let output = `\n📊 Результаты проверки ${results.wallets.length} кошельков\n`
    output += `💰 Общая стоимость: $${results.totalUsdValue.toFixed(2)}\n`
    output += `🌐 Проверено кошельков: ${results.wallets.length}\n`

    return output
  }

  /**
   * Экспортировать результаты множественных кошельков в JSON
   */
  exportMultiWalletToJSON (results: MultiWalletBalanceResult, filename?: string): string {
    const jsonString = JSON.stringify(results, null, 2)

    if (filename) {
      const fs = require('fs')
      fs.writeFileSync(filename, jsonString)
      console.log(`📄 Результаты экспортированы в ${filename}`)
    }

    return jsonString
  }
}
