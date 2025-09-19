import ExcelJS from 'exceljs'
import { AllNetworksBalanceResult, MultiWalletBalanceResult } from './balance-checker.js'
import { BalanceResult } from './multicall3-service.js'

/**
 * Конфигурация для экспорта в Excel
 */
export interface ExcelExportConfig {
  filename?: string
  includeTimestamp?: boolean
  sortByValue?: boolean
  groupByNetwork?: boolean
}

/**
 * Экспортер результатов в Excel
 */
export class ExcelExporter {
  private workbook: ExcelJS.Workbook

  constructor () {
    this.workbook = new ExcelJS.Workbook()
  }

  /**
   * Экспортировать результаты проверки балансов в Excel
   */
  async exportBalanceResults (
    results: AllNetworksBalanceResult,
    config: ExcelExportConfig = {}
  ): Promise<string> {
    const filename = config.filename || `wallet_balances_${new Date().toISOString().split('T')[0]}.xlsx`

    console.log(`📊 Создаем Excel файл: ${filename}`)

    // Создаем новый workbook для каждого экспорта
    this.workbook = new ExcelJS.Workbook()

    // Создаем основной лист с общей информацией
    await this.createSummarySheet(results)

    // Создаем лист с детальной информацией по сетям
    await this.createNetworksSheet(results, config)

    // Создаем лист с нативными балансами
    await this.createNativeBalancesSheet(results)

    // Создаем лист с токенами
    await this.createTokensSheet(results, config)

    // Сохраняем файл
    await this.workbook.xlsx.writeFile(filename)

    console.log(`✅ Excel файл создан: ${filename}`)
    return filename
  }

  /**
   * Создать лист с общей информацией
   */
  private async createSummarySheet (
    results: AllNetworksBalanceResult
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Общая информация')

    // Заголовки
    worksheet.columns = [
      { header: 'Параметр', key: 'parameter', width: 30 },
      { header: 'Значение', key: 'value', width: 50 }
    ]

    // Данные
    const summaryData = [
      { parameter: 'Адрес кошелька', value: results.walletAddress },
      { parameter: 'Общая стоимость (USD)', value: `$${results.totalUsdValue.toFixed(2)}` },
      { parameter: 'Дата проверки', value: new Date(results.timestamp).toLocaleString('ru-RU') },
      { parameter: 'Сети с балансом', value: results.networks.filter(n => n.totalUsdValue > 0).length.toString() }
    ]

    worksheet.addRows(summaryData)

    // Стилизация
    this.styleSummarySheet(worksheet)
  }

  /**
   * Создать лист с информацией по сетям
   */
  private async createNetworksSheet (
    results: AllNetworksBalanceResult,
    _config: ExcelExportConfig
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Сети')

    // Заголовки
    worksheet.columns = [
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Нативный баланс', key: 'nativeBalance', width: 20 },
      { header: 'Символ', key: 'symbol', width: 10 },
      { header: 'USD стоимость нативного', key: 'nativeUsdValue', width: 20 },
      { header: 'Количество токенов', key: 'tokenCount', width: 15 },
      { header: 'USD стоимость токенов', key: 'tokensUsdValue', width: 20 },
      { header: 'Общая стоимость (USD)', key: 'totalUsdValue', width: 20 }
    ]

    // Данные
    const networksData = results.networks.map(network => ({
      network: network.networkName,
      chainId: network.chainId,
      nativeBalance: network.nativeBalance.balanceFormatted,
      symbol: network.nativeBalance.symbol,
      nativeUsdValue: `$${network.nativeBalance.usdValue.toFixed(2)}`,
      tokenCount: network.tokenBalances.length,
      tokensUsdValue: `$${network.tokenBalances.reduce((sum, token) => sum + token.usdValue, 0).toFixed(2)}`,
      totalUsdValue: `$${network.totalUsdValue.toFixed(2)}`
    }))

    worksheet.addRows(networksData)

    // Сортировка если нужно
    if (_config.sortByValue) {
      worksheet.getRows(2, worksheet.rowCount - 1)?.sort((a, b) => {
        const aValue = parseFloat(a.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        const bValue = parseFloat(b.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        return bValue - aValue
      })
    }

    // Стилизация
    this.styleNetworksSheet(worksheet)
  }

  /**
   * Создать лист с нативными балансами
   */
  private async createNativeBalancesSheet (
    results: AllNetworksBalanceResult
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Нативные балансы')

    // Заголовки
    worksheet.columns = [
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Символ', key: 'symbol', width: 10 },
      { header: 'Баланс', key: 'balance', width: 20 },
      { header: 'USD стоимость', key: 'usdValue', width: 20 }
    ]

    // Данные
    const nativeData = results.networks.map(network => ({
      network: network.networkName,
      chainId: network.chainId,
      symbol: network.nativeBalance.symbol,
      balance: network.nativeBalance.balanceFormatted,
      usdValue: `$${network.nativeBalance.usdValue.toFixed(2)}`
    }))

    worksheet.addRows(nativeData)

    // Стилизация
    this.styleNativeBalancesSheet(worksheet)
  }

  /**
   * Создать лист с токенами
   */
  private async createTokensSheet (
    results: AllNetworksBalanceResult,
    _config: ExcelExportConfig
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Токены')

    // Заголовки
    worksheet.columns = [
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Адрес токена', key: 'tokenAddress', width: 45 },
      { header: 'Символ', key: 'symbol', width: 15 },
      { header: 'Название', key: 'name', width: 30 },
      { header: 'Баланс', key: 'balance', width: 20 },
      { header: 'Децималы', key: 'decimals', width: 10 },
      { header: 'Цена (USD)', key: 'priceUsd', width: 15 },
      { header: 'USD стоимость', key: 'usdValue', width: 20 }
    ]

    // Собираем все токены из всех сетей
    const allTokens: Array<BalanceResult & { network: string; chainId: number }> = []

    for (const network of results.networks) {
      for (const token of network.tokenBalances) {
        allTokens.push({
          ...token,
          network: network.networkName,
          chainId: network.chainId
        })
      }
    }

    // Фильтруем нулевые балансы (всегда исключаем нули)
    const filteredTokens = allTokens.filter(token => token.balance > 0n)

    // Данные
    const tokensData = filteredTokens.map(token => ({
      network: token.network,
      chainId: token.chainId,
      tokenAddress: token.address,
      symbol: token.symbol,
      name: token.name,
      balance: token.balanceFormatted,
      decimals: token.decimals,
      priceUsd: `$${parseFloat(token.priceUSD).toFixed(6)}`,
      usdValue: `$${token.usdValue.toFixed(2)}`
    }))

    worksheet.addRows(tokensData)

    // Сортировка если нужно
    if (_config.sortByValue) {
      worksheet.getRows(2, worksheet.rowCount - 1)?.sort((a, b) => {
        const aValue = parseFloat(a.getCell('usdValue').value?.toString().replace('$', '') || '0')
        const bValue = parseFloat(b.getCell('usdValue').value?.toString().replace('$', '') || '0')
        return bValue - aValue
      })
    }

    // Стилизация
    this.styleTokensSheet(worksheet)
  }

  /**
   * Стилизация листа с общей информацией
   */
  private styleSummarySheet (worksheet: ExcelJS.Worksheet): void {
    // Заголовки
    worksheet.getRow(1).font = { bold: true, size: 14 }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    }
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } }

    // Границы
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })
    })
  }

  /**
   * Стилизация листа с сетями
   */
  private styleNetworksSheet (worksheet: ExcelJS.Worksheet): void {
    // Заголовки
    worksheet.getRow(1).font = { bold: true, size: 12 }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    }
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } }

    // Автофильтр
    worksheet.autoFilter = 'A1:H1'

    // Границы
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })
    })
  }

  /**
   * Стилизация листа с нативными балансами
   */
  private styleNativeBalancesSheet (worksheet: ExcelJS.Worksheet): void {
    // Заголовки
    worksheet.getRow(1).font = { bold: true, size: 12 }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' }
    }
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } }

    // Границы
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })
    })
  }

  /**
   * Стилизация листа с токенами
   */
  private styleTokensSheet (worksheet: ExcelJS.Worksheet): void {
    // Заголовки
    worksheet.getRow(1).font = { bold: true, size: 12 }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE46C0B' }
    }
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } }

    // Автофильтр
    worksheet.autoFilter = 'A1:I1'

    // Границы
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })
    })
  }

  /**
   * Создать сводный отчет
   */
  async createSummaryReport (results: AllNetworksBalanceResult): Promise<string> {
    const filename = `wallet_summary_${new Date().toISOString().split('T')[0]}.xlsx`

    console.log(`📊 Создаем сводный отчет: ${filename}`)

    // Создаем новый workbook для сводного отчета
    this.workbook = new ExcelJS.Workbook()

    // Создаем только основной лист
    await this.createSummarySheet(results)

    // Сохраняем файл
    await this.workbook.xlsx.writeFile(filename)

    console.log(`✅ Сводный отчет создан: ${filename}`)
    return filename
  }

  /**
   * Экспортировать результаты множественных кошельков в один Excel файл
   */
  async exportMultiWalletResults (
    results: MultiWalletBalanceResult,
    config: ExcelExportConfig = {}
  ): Promise<string> {
    const filename = config.filename || `multi_wallet_balances_${new Date().toISOString().split('T')[0]}.xlsx`

    // Создаем новый workbook для множественных кошельков
    this.workbook = new ExcelJS.Workbook()

    // Создаем лист с общей информацией по всем кошелькам
    await this.createMultiWalletSummarySheet(results)

    // Создаем лист со сводкой по кошелькам
    await this.createWalletsSummarySheet(results, config)

    // Создаем лист с детальной информацией по всем кошелькам
    await this.createMultiWalletDetailsSheet(results, config)

    // Создаем лист с нативными балансами всех кошельков
    await this.createMultiWalletNativeBalancesSheet(results)

    // Создаем лист с токенами всех кошельков
    await this.createMultiWalletTokensSheet(results, config)

    // Сохраняем файл
    await this.workbook.xlsx.writeFile(filename)

    return filename
  }

  /**
   * Создать лист с общей информацией по всем кошелькам
   */
  private async createMultiWalletSummarySheet (
    results: MultiWalletBalanceResult
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Общая информация')

    // Заголовки
    worksheet.columns = [
      { header: 'Параметр', key: 'parameter', width: 30 },
      { header: 'Значение', key: 'value', width: 50 }
    ]

    // Данные
    const summaryData = [
      { parameter: 'Количество кошельков', value: results.wallets.length.toString() },
      { parameter: 'Общая стоимость (USD)', value: `$${results.totalUsdValue.toFixed(2)}` },
      { parameter: 'Дата проверки', value: new Date(results.timestamp).toLocaleString('ru-RU') },
      { parameter: 'Кошельки с балансом', value: results.wallets.filter(w => w.results.totalUsdValue > 0).length.toString() }
    ]

    worksheet.addRows(summaryData)

    // Стилизация
    this.styleSummarySheet(worksheet)
  }

  /**
   * Создать лист со сводкой по кошелькам
   */
  private async createWalletsSummarySheet (
    results: MultiWalletBalanceResult,
    _config: ExcelExportConfig
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Сводка по кошелькам')

    // Заголовки
    worksheet.columns = [
      { header: '№', key: 'index', width: 5 },
      { header: 'Адрес кошелька', key: 'address', width: 45 },
      { header: 'Количество сетей', key: 'networksCount', width: 15 },
      { header: 'Общая стоимость (USD)', key: 'totalUsdValue', width: 20 },
      { header: 'Сети с балансом', key: 'networksWithBalance', width: 15 },
      { header: 'Количество токенов', key: 'tokensCount', width: 15 }
    ]

    // Данные
    const walletsData = results.wallets.map((wallet, index) => ({
      index: index + 1,
      address: wallet.results.walletAddress,
      networksCount: wallet.results.networks.filter(n => n.nativeBalance.balance > 0n || n.tokenBalances.some(token => token.balance > 0n)).length,
      totalUsdValue: `$${wallet.results.totalUsdValue.toFixed(2)}`,
      networksWithBalance: wallet.results.networks.filter(n => n.totalUsdValue > 0).length,
      tokensCount: wallet.results.networks.reduce((sum, n) => sum + n.tokenBalances.filter(token => token.balance > 0n).length, 0)
    }))

    worksheet.addRows(walletsData)

    // Сортировка если нужно
    if (_config.sortByValue) {
      worksheet.getRows(2, worksheet.rowCount - 1)?.sort((a, b) => {
        const aValue = parseFloat(a.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        const bValue = parseFloat(b.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        return bValue - aValue
      })
    }

    // Стилизация
    this.styleNetworksSheet(worksheet)
  }

  /**
   * Создать лист с детальной информацией по всем кошелькам
   */
  private async createMultiWalletDetailsSheet (
    results: MultiWalletBalanceResult,
    _config: ExcelExportConfig
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Детали по кошелькам')

    // Заголовки
    worksheet.columns = [
      { header: 'Кошелек', key: 'wallet', width: 45 },
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Нативный баланс', key: 'nativeBalance', width: 20 },
      { header: 'Символ', key: 'symbol', width: 10 },
      { header: 'USD стоимость нативного', key: 'nativeUsdValue', width: 20 },
      { header: 'Количество токенов', key: 'tokenCount', width: 15 },
      { header: 'USD стоимость токенов', key: 'tokensUsdValue', width: 20 },
      { header: 'Общая стоимость (USD)', key: 'totalUsdValue', width: 20 }
    ]

    // Собираем данные по всем кошелькам и сетям
    const allDetails: Array<{
      wallet: string
      network: string
      chainId: number
      nativeBalance: string
      symbol: string
      nativeUsdValue: string
      tokenCount: number
      tokensUsdValue: string
      totalUsdValue: string
    }> = []

    for (const wallet of results.wallets) {
      for (const network of wallet.results.networks) {
        // Добавляем только если есть баланс (нативный или токены)
        if (network.nativeBalance.balance > 0n || network.tokenBalances.some(token => token.balance > 0n)) {
          allDetails.push({
            wallet: wallet.results.walletAddress,
            network: network.networkName,
            chainId: network.chainId,
            nativeBalance: network.nativeBalance.balanceFormatted,
            symbol: network.nativeBalance.symbol,
            nativeUsdValue: `$${network.nativeBalance.usdValue.toFixed(2)}`,
            tokenCount: network.tokenBalances.filter(token => token.balance > 0n).length,
            tokensUsdValue: `$${network.tokenBalances.reduce((sum, token) => sum + token.usdValue, 0).toFixed(2)}`,
            totalUsdValue: `$${network.totalUsdValue.toFixed(2)}`
          })
        }
      }
    }

    worksheet.addRows(allDetails)

    // Сортировка если нужно
    if (_config.sortByValue) {
      worksheet.getRows(2, worksheet.rowCount - 1)?.sort((a, b) => {
        const aValue = parseFloat(a.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        const bValue = parseFloat(b.getCell('totalUsdValue').value?.toString().replace('$', '') || '0')
        return bValue - aValue
      })
    }

    // Стилизация
    this.styleNetworksSheet(worksheet)
  }

  /**
   * Создать лист с нативными балансами всех кошельков
   */
  private async createMultiWalletNativeBalancesSheet (
    results: MultiWalletBalanceResult
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Нативные балансы')

    // Заголовки
    worksheet.columns = [
      { header: 'Кошелек', key: 'wallet', width: 45 },
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Символ', key: 'symbol', width: 10 },
      { header: 'Баланс', key: 'balance', width: 20 },
      { header: 'USD стоимость', key: 'usdValue', width: 20 }
    ]

    // Собираем все нативные балансы
    const allNativeBalances: Array<{
      wallet: string
      network: string
      chainId: number
      symbol: string
      balance: string
      usdValue: string
    }> = []

    for (const wallet of results.wallets) {
      for (const network of wallet.results.networks) {
        // Добавляем только если баланс больше нуля
        if (network.nativeBalance.balance > 0n) {
          allNativeBalances.push({
            wallet: wallet.results.walletAddress,
            network: network.networkName,
            chainId: network.chainId,
            symbol: network.nativeBalance.symbol,
            balance: network.nativeBalance.balanceFormatted,
            usdValue: `$${network.nativeBalance.usdValue.toFixed(2)}`
          })
        }
      }
    }

    worksheet.addRows(allNativeBalances)

    // Стилизация
    this.styleNativeBalancesSheet(worksheet)
  }

  /**
   * Создать лист с токенами всех кошельков
   */
  private async createMultiWalletTokensSheet (
    results: MultiWalletBalanceResult,
    _config: ExcelExportConfig
  ): Promise<void> {
    const worksheet = this.workbook.addWorksheet('Токены')

    // Заголовки
    worksheet.columns = [
      { header: 'Кошелек', key: 'wallet', width: 45 },
      { header: 'Сеть', key: 'network', width: 20 },
      { header: 'Chain ID', key: 'chainId', width: 10 },
      { header: 'Адрес токена', key: 'tokenAddress', width: 45 },
      { header: 'Символ', key: 'symbol', width: 15 },
      { header: 'Название', key: 'name', width: 30 },
      { header: 'Баланс', key: 'balance', width: 20 },
      { header: 'Децималы', key: 'decimals', width: 10 },
      { header: 'Цена (USD)', key: 'priceUsd', width: 15 },
      { header: 'USD стоимость', key: 'usdValue', width: 20 }
    ]

    // Собираем все токены из всех кошельков и сетей
    const allTokens: Array<BalanceResult & { wallet: string; network: string; chainId: number }> = []

    for (const wallet of results.wallets) {
      for (const network of wallet.results.networks) {
        for (const token of network.tokenBalances) {
          allTokens.push({
            ...token,
            wallet: wallet.results.walletAddress,
            network: network.networkName,
            chainId: network.chainId
          })
        }
      }
    }

    // Фильтруем нулевые балансы (всегда исключаем нули)
    const filteredTokens = allTokens.filter(token => token.balance > 0n)

    // Данные
    const tokensData = filteredTokens.map(token => ({
      wallet: token.wallet,
      network: token.network,
      chainId: token.chainId,
      tokenAddress: token.address,
      symbol: token.symbol,
      name: token.name,
      balance: token.balanceFormatted,
      decimals: token.decimals,
      priceUsd: `$${parseFloat(token.priceUSD).toFixed(6)}`,
      usdValue: `$${token.usdValue.toFixed(2)}`
    }))

    worksheet.addRows(tokensData)

    // Сортировка если нужно
    if (_config.sortByValue) {
      worksheet.getRows(2, worksheet.rowCount - 1)?.sort((a, b) => {
        const aValue = parseFloat(a.getCell('usdValue').value?.toString().replace('$', '') || '0')
        const bValue = parseFloat(b.getCell('usdValue').value?.toString().replace('$', '') || '0')
        return bValue - aValue
      })
    }

    // Стилизация
    this.styleTokensSheet(worksheet)
  }
}
