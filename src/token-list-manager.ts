import * as fs from 'fs'
import * as path from 'path'

/**
 * Информация о токене из Li.quest API
 */
export interface TokenInfo {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
  priceUSD: string
  coinKey: string
  logoURI?: string
}

/**
 * Ответ от Li.quest API
 */
interface LiQuestResponse {
  tokens: {
    [chainId: string]: TokenInfo[]
  }
  extended: boolean
}

/**
 * Кэшированные данные
 */
interface CachedData {
  data: TokenInfo[]
  timestamp: number
  ttl: number
}

/**
 * Менеджер списков токенов с кэшированием
 */
export class TokenListManager {
  private memoryCache = new Map<string, CachedData>()
  private readonly CACHE_DURATION = 30 * 60 * 1000 // 30 минут
  private readonly CACHE_DIR = 'cache'
  private readonly CACHE_FILE_PREFIX = 'tokens_'

  constructor () {
    this.ensureCacheDir()
  }

  /**
   * Создать директорию кэша если не существует
   */
  private ensureCacheDir (): void {
    if (!fs.existsSync(this.CACHE_DIR)) {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true })
    }
  }

  /**
   * Проверить валидность кэша
   */
  private isCacheValid (cached: CachedData): boolean {
    return Date.now() - cached.timestamp < cached.ttl
  }

  /**
   * Получить путь к файлу кэша
   */
  private getCacheFilePath (chainId: number): string {
    return path.join(this.CACHE_DIR, `${this.CACHE_FILE_PREFIX}${chainId}.json`)
  }

  /**
   * Загрузить данные из файлового кэша
   */
  private loadFromFileCache (chainId: number): TokenInfo[] | null {
    try {
      const cachePath = this.getCacheFilePath(chainId)
      if (!fs.existsSync(cachePath)) {
        return null
      }

      const fileContent = fs.readFileSync(cachePath, 'utf8')
      const cached: CachedData = JSON.parse(fileContent)

      if (this.isCacheValid(cached)) {
        return cached.data
      }

      // Удаляем устаревший файл
      fs.unlinkSync(cachePath)
      return null
    } catch (error) {
      console.warn(`Ошибка при загрузке файлового кэша для сети ${chainId}:`, error instanceof Error ? error.message : 'Неизвестная ошибка')
      return null
    }
  }

  /**
   * Сохранить данные в файловый кэш
   */
  private saveToFileCache (chainId: number, data: TokenInfo[]): void {
    try {
      const cachePath = this.getCacheFilePath(chainId)
      const cached: CachedData = {
        data,
        timestamp: Date.now(),
        ttl: this.CACHE_DURATION
      }

      fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2))
    } catch (error) {
      console.warn(`Ошибка при сохранении файлового кэша для сети ${chainId}:`, error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Загрузить токены с Li.quest API
   */
  private async fetchFromAPI (): Promise<LiQuestResponse> {
    try {
      const response = await fetch('https://li.quest/v1/tokens')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: LiQuestResponse = await response.json()

      return data
    } catch (error) {
      throw new Error(`Ошибка при загрузке токенов с Li.quest API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  /**
   * Получить токены для конкретной сети
   */
  async getTokensForChain (chainId: number): Promise<TokenInfo[]> {
    const cacheKey = `tokens_${chainId}`

    // 1. Проверяем memory cache
    const memoryCached = this.memoryCache.get(cacheKey)
    if (memoryCached && this.isCacheValid(memoryCached)) {
      return memoryCached.data
    }

    // 2. Проверяем file cache
    const fileCached = this.loadFromFileCache(chainId)
    if (fileCached) {
      // Сохраняем в memory cache
      this.memoryCache.set(cacheKey, {
        data: fileCached,
        timestamp: Date.now(),
        ttl: this.CACHE_DURATION
      })
      return fileCached
    }

    // 3. Загружаем с API
    const apiData = await this.fetchFromAPI()
    const tokens = apiData.tokens[chainId.toString()] || []

    if (tokens.length === 0) {
      return []
    }

    // 4. Кэшируем данные
    const cached: CachedData = {
      data: tokens,
      timestamp: Date.now(),
      ttl: this.CACHE_DURATION
    }

    this.memoryCache.set(cacheKey, cached)
    this.saveToFileCache(chainId, tokens)

    return tokens
  }

  /**
   * Получить токены для нескольких сетей
   */
  async getTokensForChains (chainIds: number[]): Promise<Map<number, TokenInfo[]>> {
    const results = new Map<number, TokenInfo[]>()

    // Загружаем токены параллельно для всех сетей
    const promises = chainIds.map(async (chainId) => {
      try {
        const tokens = await this.getTokensForChain(chainId)
        results.set(chainId, tokens)
      } catch (error) {
        console.error(`Ошибка при загрузке токенов для сети ${chainId}:`, error instanceof Error ? error.message : 'Неизвестная ошибка')
        results.set(chainId, [])
      }
    })

    await Promise.all(promises)
    return results
  }

  /**
   * Получить топ токены по стоимости
   */
  async getTopTokensByValue (chainId: number): Promise<TokenInfo[]> {
    const allTokens = await this.getTokensForChain(chainId)

    return allTokens
      .filter(token => token.priceUSD && parseFloat(token.priceUSD) > 0)
      .sort((a, b) => parseFloat(b.priceUSD) - parseFloat(a.priceUSD))
  }

  /**
   * Найти токен по адресу
   */
  async findTokenByAddress (chainId: number, address: string): Promise<TokenInfo | null> {
    const tokens = await this.getTokensForChain(chainId)
    return tokens.find(token => token.address.toLowerCase() === address.toLowerCase()) || null
  }

  /**
   * Очистить кэш
   */
  clearCache (): void {
    this.memoryCache.clear()

    // Удаляем файлы кэша
    try {
      const files = fs.readdirSync(this.CACHE_DIR)
      for (const file of files) {
        if (file.startsWith(this.CACHE_FILE_PREFIX)) {
          fs.unlinkSync(path.join(this.CACHE_DIR, file))
        }
      }
      console.log('🧹 Кэш токенов очищен')
    } catch (error) {
      console.warn('Ошибка при очистке файлового кэша:', error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats (): { memoryCache: number; fileCache: number } {
    let fileCacheCount = 0
    try {
      const files = fs.readdirSync(this.CACHE_DIR)
      fileCacheCount = files.filter(file => file.startsWith(this.CACHE_FILE_PREFIX)).length
    } catch {
      // Игнорируем ошибки
    }

    return {
      memoryCache: this.memoryCache.size,
      fileCache: fileCacheCount
    }
  }

  /**
   * Получить информацию о поддерживаемых сетях
   */
  async getSupportedNetworks (): Promise<Array<{ chainId: number; tokenCount: number }>> {
    try {
      const apiData = await this.fetchFromAPI()
      return Object.entries(apiData.tokens).map(([chainId, tokens]) => ({
        chainId: parseInt(chainId),
        tokenCount: tokens.length
      }))
    } catch (error) {
      console.error('Ошибка при получении списка поддерживаемых сетей:', error instanceof Error ? error.message : 'Неизвестная ошибка')
      return []
    }
  }
}
