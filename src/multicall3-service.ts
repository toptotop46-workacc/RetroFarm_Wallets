import { encodeFunctionData, decodeFunctionResult, Address } from 'viem'
import { RPCManager } from './rpc-manager.js'
import { TokenInfo, TokenListManager } from './token-list-manager.js'

/**
 * ABI для Multicall3 контракта
 */
export const MULTICALL3_ABI = [
  {
    'inputs': [
      {
        'components': [
          { 'internalType': 'address', 'name': 'target', 'type': 'address' },
          { 'internalType': 'bool', 'name': 'allowFailure', 'type': 'bool' },
          { 'internalType': 'bytes', 'name': 'callData', 'type': 'bytes' }
        ],
        'internalType': 'struct Multicall3.Call3[]',
        'name': 'calls',
        'type': 'tuple[]'
      }
    ],
    'name': 'aggregate3',
    'outputs': [
      {
        'components': [
          { 'internalType': 'bool', 'name': 'success', 'type': 'bool' },
          { 'internalType': 'bytes', 'name': 'returnData', 'type': 'bytes' }
        ],
        'internalType': 'struct Multicall3.Result[]',
        'name': 'returnData',
        'type': 'tuple[]'
      }
    ],
    'stateMutability': 'payable',
    'type': 'function'
  },
  {
    'inputs': [
      { 'internalType': 'address', 'name': 'addr', 'type': 'address' }
    ],
    'name': 'getEthBalance',
    'outputs': [
      { 'internalType': 'uint256', 'name': 'balance', 'type': 'uint256' }
    ],
    'stateMutability': 'view',
    'type': 'function'
  }
] as const

/**
 * ABI для ERC-20 токенов
 */
export const ERC20_ABI = [
  {
    'inputs': [
      { 'internalType': 'address', 'name': 'account', 'type': 'address' }
    ],
    'name': 'balanceOf',
    'outputs': [
      { 'internalType': 'uint256', 'name': '', 'type': 'uint256' }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [],
    'name': 'decimals',
    'outputs': [
      { 'internalType': 'uint8', 'name': '', 'type': 'uint8' }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [],
    'name': 'symbol',
    'outputs': [
      { 'internalType': 'string', 'name': '', 'type': 'string' }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },
  {
    'inputs': [],
    'name': 'name',
    'outputs': [
      { 'internalType': 'string', 'name': '', 'type': 'string' }
    ],
    'stateMutability': 'view',
    'type': 'function'
  }
] as const

/**
 * Структура вызова Multicall3
 */
export interface Call3 {
  target: Address
  allowFailure: boolean
  callData: `0x${string}`
}

/**
 * Результат вызова Multicall3
 */
export interface MulticallResult {
  success: boolean
  returnData: `0x${string}`
}

/**
 * Результат проверки баланса
 */
export interface BalanceResult {
  address: string
  symbol: string
  name: string
  balance: bigint
  balanceFormatted: string
  decimals: number
  usdValue: number
  priceUSD: string
}

/**
 * Результат проверки нативного баланса
 */
export interface NativeBalanceResult {
  balance: bigint
  balanceFormatted: string
  symbol: string
  usdValue: number
}

/**
 * Сервис для работы с Multicall3
 */
export class Multicall3Service {
  private rpcManager: RPCManager
  private tokenListManager: TokenListManager

  constructor (rpcManager: RPCManager, tokenListManager: TokenListManager) {
    this.rpcManager = rpcManager
    this.tokenListManager = tokenListManager
  }

  /**
   * Создать вызов для получения баланса ERC-20 токена
   */
  private createBalanceOfCall (tokenAddress: Address, walletAddress: Address): Call3 {
    const callData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress]
    })

    return {
      target: tokenAddress,
      allowFailure: true,
      callData
    }
  }

  /**
   * Выполнить Multicall3 запрос с таймаутом
   */
  private async executeMulticall (
    chainId: number,
    calls: Call3[],
    rpcUrl?: string,
    timeout: number = 10000
  ): Promise<MulticallResult[]> {
    const client = rpcUrl
      ? await this.rpcManager.getClientWithRPC(chainId, rpcUrl)
      : await this.rpcManager.getClient(chainId)
    const networkConfig = this.rpcManager.getNetworkConfig(chainId)

    if (!networkConfig) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    try {
      // Создаем промис с таймаутом
      const multicallPromise = client.request({
        method: 'eth_call',
        params: [
          {
            to: networkConfig.multicallAddress as `0x${string}`,
            data: encodeFunctionData({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              args: [calls]
            })
          },
          'latest'
        ]
      }) as Promise<string>

      // Добавляем таймаут
      const timeoutPromise = new Promise<never>((_, reject) => {
        globalThis.setTimeout(() => reject(new Error(`Multicall3 запрос превысил таймаут ${timeout}ms`)), timeout)
      })

      const result = await Promise.race([multicallPromise, timeoutPromise])

      // Декодируем результат
      const decoded = decodeFunctionResult({
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        data: result as `0x${string}`
      }) as MulticallResult[]

      return decoded
    } catch (error) {
      throw new Error(`Ошибка при выполнении Multicall3 для сети ${chainId}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  /**
   * Проверить балансы ERC-20 токенов
   */
  async checkTokenBalances (
    chainId: number,
    walletAddress: Address,
    tokens: TokenInfo[]
  ): Promise<BalanceResult[]> {
    if (tokens.length === 0) {
      return []
    }

    // Автоматически используем батчинг для всех сетей
    return await this.checkTokenBalancesBatched(chainId, walletAddress, tokens)
  }

  /**
   * Проверка балансов токенов с батчингом и ротацией RPC
   */
  async checkTokenBalancesBatched (
    chainId: number,
    walletAddress: Address,
    tokens: TokenInfo[]
  ): Promise<BalanceResult[]> {
    if (tokens.length === 0) {
      return []
    }

    // Динамический размер батча в зависимости от количества токенов
    let batchSize = 150 // Базовый размер
    if (tokens.length > 1000) {
      batchSize = 200 // Для больших списков токенов
    } else if (tokens.length < 300) {
      batchSize = 100 // Для маленьких списков токенов
    }

    const batches = this.createBatches(tokens, batchSize)
    const rpcUrls = this.rpcManager.getNetworkConfig(chainId)?.rpcUrls || []

    // Ограничиваем количество параллельных батчей для предотвращения перегрузки
    const MAX_CONCURRENT_BATCHES = 6
    const batchResults: BalanceResult[][] = []

    // Обрабатываем батчи группами для контроля нагрузки
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + MAX_CONCURRENT_BATCHES)

      const batchPromises = batchGroup.map(async (batch) => {
        if (!batch) return []

        try {
          const batchResult = await this.checkSingleBatchWithRPCRotation(
            chainId,
            walletAddress,
            batch,
            rpcUrls
          )
          return batchResult
        } catch {
          // Возвращаем пустой массив для упавшего батча
          return []
        }
      })

      // Ждем завершения группы батчей
      const groupResults = await Promise.all(batchPromises)
      batchResults.push(...groupResults)
    }

    // Объединяем все результаты
    const results: BalanceResult[] = []
    for (const batchResult of batchResults) {
      results.push(...batchResult)
    }

    return results
  }

  /**
   * Проверить нативный баланс с таймаутом
   */
  async checkNativeBalance (
    chainId: number,
    walletAddress: Address,
    timeout: number = 8000
  ): Promise<NativeBalanceResult> {
    const networkConfig = this.rpcManager.getNetworkConfig(chainId)
    if (!networkConfig) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    const client = await this.rpcManager.getClient(chainId)

    try {
      // Создаем промис с таймаутом для получения баланса
      const balancePromise = client.getBalance({
        address: walletAddress
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        globalThis.setTimeout(() => reject(new Error(`Запрос нативного баланса превысил таймаут ${timeout}ms`)), timeout)
      })

      const balance = await Promise.race([balancePromise, timeoutPromise])

      const balanceFormatted = this.formatNativeBalance(balance, networkConfig.nativeCurrency.decimals)

      // Получаем актуальную цену нативного токена из LiFi API
      const usdValue = await this.calculateNativeUSDValue(balance, networkConfig.nativeCurrency.decimals, chainId)

      return {
        balance,
        balanceFormatted,
        symbol: networkConfig.nativeCurrency.symbol,
        usdValue
      }
    } catch (error) {
      throw new Error(`Ошибка при получении нативного баланса: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  /**
   * Форматировать баланс токена
   */
  private formatTokenBalance (balance: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals)
    const wholePart = balance / divisor
    const fractionalPart = balance % divisor

    if (fractionalPart === 0n) {
      return wholePart.toString()
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
    const trimmedFractional = fractionalStr.replace(/0+$/, '')

    if (trimmedFractional === '') {
      return wholePart.toString()
    }

    return `${wholePart}.${trimmedFractional}`
  }

  /**
   * Форматировать нативный баланс
   */
  private formatNativeBalance (balance: bigint, decimals: number): string {
    return this.formatTokenBalance(balance, decimals)
  }

  /**
   * Вычислить USD стоимость токена
   */
  private calculateUSDValue (balance: bigint, decimals: number, priceUSD: string): number {
    const price = parseFloat(priceUSD)
    if (isNaN(price) || price <= 0) {
      return 0
    }

    const balanceFormatted = parseFloat(this.formatTokenBalance(balance, decimals))
    return balanceFormatted * price
  }

  /**
   * Получить цену нативного токена для сети
   */
  private async getNativeTokenPrice (chainId: number): Promise<number> {
    try {
      // Получаем список токенов для сети
      const tokens = await this.tokenListManager.getTokensForChain(chainId)

      if (tokens.length === 0) {
        return 0
      }

      // Первый токен в списке - это всегда нативный токен
      const nativeToken = tokens[0]

      if (!nativeToken) {
        return 0
      }

      return parseFloat(nativeToken.priceUSD)
    } catch {
      return 0
    }
  }

  /**
   * Вычислить USD стоимость нативного токена
   */
  private async calculateNativeUSDValue (balance: bigint, decimals: number, chainId: number): Promise<number> {
    // Получаем цену нативного токена из LiFi API
    const nativePrice = await this.getNativeTokenPrice(chainId)

    if (nativePrice <= 0) {
      return 0
    }

    const balanceFormatted = parseFloat(this.formatNativeBalance(balance, decimals))
    const usdValue = balanceFormatted * nativePrice

    return usdValue
  }

  /**
   * Проверить балансы в batch режиме для нескольких токенов
   */
  async checkBatchTokenBalances (
    chainId: number,
    walletAddress: Address,
    tokenBatches: TokenInfo[][]
  ): Promise<BalanceResult[]> {
    const allResults: BalanceResult[] = []

    for (const batch of tokenBatches) {
      try {
        const batchResults = await this.checkTokenBalances(chainId, walletAddress, batch)
        allResults.push(...batchResults)
      } catch (error) {
        console.error('Ошибка при проверке batch токенов:', error instanceof Error ? error.message : 'Неизвестная ошибка')
      }
    }

    return allResults
  }

  /**
   * Создать батчи из массива токенов
   */
  private createBatches (tokens: TokenInfo[], batchSize: number): TokenInfo[][] {
    const batches: TokenInfo[][] = []
    for (let i = 0; i < tokens.length; i += batchSize) {
      batches.push(tokens.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Проверить один батч с ротацией RPC
   */
  private async checkSingleBatchWithRPCRotation (
    chainId: number,
    walletAddress: Address,
    tokens: TokenInfo[],
    rpcUrls: string[],
    maxAttempts: number = 3
  ): Promise<BalanceResult[]> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rpcIndex = (attempt - 1) % rpcUrls.length
      const currentRpc = rpcUrls[rpcIndex]

      if (!currentRpc) {
        continue
      }

      try {
        return await this.executeMulticallWithRPC(chainId, walletAddress, tokens, currentRpc)
      } catch {
        if (attempt < maxAttempts) {
          await this.delay(500) // Уменьшаем задержку между попытками
        }
      }
    }

    throw new Error(`Батч упал после ${maxAttempts} попыток со всеми RPC`)
  }

  /**
   * Задержка выполнения
   */
  private async delay (ms: number): Promise<void> {
    return new Promise(resolve => globalThis.setTimeout(resolve, ms))
  }

  /**
   * Выполнить Multicall3 с конкретным RPC
   */
  private async executeMulticallWithRPC (
    chainId: number,
    walletAddress: Address,
    tokens: TokenInfo[],
    rpcUrl: string
  ): Promise<BalanceResult[]> {
    // Создаем вызовы для всех токенов
    const calls: Call3[] = tokens.map(token =>
      this.createBalanceOfCall(token.address as Address, walletAddress)
    )

    // Выполняем Multicall3 с конкретным RPC
    const results = await this.executeMulticall(chainId, calls, rpcUrl)

    // Обрабатываем результаты
    const balanceResults: BalanceResult[] = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const result = results[i]

      if (!token || !result) {
        continue
      }

      if (!result.success) {
        continue
      }

      try {
        const balance = decodeFunctionResult({
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          data: result.returnData
        }) as bigint

        // Форматируем баланс
        const balanceFormatted = this.formatTokenBalance(balance, token.decimals)

        // Вычисляем USD стоимость
        const usdValue = this.calculateUSDValue(balance, token.decimals, token.priceUSD)

        balanceResults.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          balance,
          balanceFormatted,
          decimals: token.decimals,
          usdValue,
          priceUSD: token.priceUSD
        })
      } catch (error) {
        // Тихо пропускаем ошибки "Cannot decode zero data" - это нормально
        if (error instanceof Error && error.message.includes('Cannot decode zero data')) {
          // Токен не найден или баланс равен 0 - это нормальное поведение
          continue
        }
        // Тихо пропускаем ошибки декодирования
      }
    }

    // Фильтруем токены с нулевым балансом
    return balanceResults.filter(result => result.balance > 0n)
  }
}
