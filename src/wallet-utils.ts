import * as fs from 'fs'
import { isAddress } from 'viem'

/**
 * Валидация адреса кошелька
 */
export function isValidWalletAddress (address: string): boolean {
  try {
    return isAddress(address)
  } catch {
    return false
  }
}

/**
 * Форматировать адрес для безопасного отображения
 */
export function formatAddressForDisplay (address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Форматировать адрес для отображения в списке выбора (полный адрес)
 */
export function formatAddressForSelection (address: string): string {
  return address
}

/**
 * Получить все адреса кошельков из wallets.txt
 */
export function getAllWalletAddresses (): string[] {
  if (!fs.existsSync('wallets.txt')) {
    throw new Error('Файл wallets.txt не найден')
  }

  const content = fs.readFileSync('wallets.txt', 'utf8')
  const lines = content.split('\n')
  const addresses: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      try {
        if (isValidWalletAddress(trimmedLine)) {
          addresses.push(trimmedLine)
        } else {
          console.warn(`⚠️ Пропущен неверный адрес: ${trimmedLine.slice(0, 10)}...`)
        }
      } catch {
        console.warn(`⚠️ Ошибка при обработке адреса: ${trimmedLine.slice(0, 10)}...`)
      }
    }
  }

  if (addresses.length === 0) {
    throw new Error('Не найдено валидных адресов кошельков в файле wallets.txt')
  }

  return addresses
}

/**
 * Получить количество кошельков
 */
export function getWalletCount (): number {
  try {
    const addresses = getAllWalletAddresses()
    return addresses.length
  } catch {
    return 0
  }
}

/**
 * Получить адреса для выбора
 */
export function getWalletAddressesForSelection (): string[] {
  const addresses = getAllWalletAddresses()

  if (addresses.length === 0) {
    throw new Error('Не найдено доступных кошельков')
  }

  return addresses
}
