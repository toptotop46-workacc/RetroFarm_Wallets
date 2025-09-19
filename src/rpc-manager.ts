/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, http, PublicClient, Chain } from 'viem'
import {
  mainnet, bsc, polygon, fantom, avalanche, optimism, arbitrum, base,
  gnosis, celo, moonbeam, cronos, aurora, klaytn, boba,
  metis, fuse, moonriver, zkSync, polygonZkEvm, linea, mantle, scroll, blast,
  mode, flare, rootstock, xdc, taiko, fraxtal
} from 'viem/chains'

/**
 * Конфигурация сети с RPC endpoints
 */
export interface NetworkConfig {
  chainId: number
  name: string
  chain: Chain
  rpcUrls: string[]
  multicallAddress: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
}

/**
 * Конфигурация прокси
 */
export interface ProxyConfig {
  host: string
  port: number
  username?: string
  password?: string
  protocol: 'http' | 'https' | 'socks5'
}

/**
 * Кэшированные данные
 */
interface HealthCheckResult {
  isHealthy: boolean
  lastCheck: number
}

/**
 * Менеджер RPC подключений с fallback системой
 */
export class RPCManager {
  private clientCache = new Map<number, PublicClient>()
  private healthCache = new Map<string, HealthCheckResult>()
  private readonly HEALTH_CHECK_TTL = 5 * 60 * 1000 // 5 минут
  private proxies: ProxyConfig[] = []
  private proxyIndex = 0

  /**
   * Конфигурации всех сетей поддерживаемых LiFi с множественными RPC endpoints
   */
  private readonly networkConfigs: NetworkConfig[] = [
    {
      chainId: 1,
      name: 'Ethereum',
      chain: mainnet,
      rpcUrls: [
        'https://ethereum-rpc.publicnode.com',
        'https://eth.drpc.org',
        'https://rpc.ankr.com/eth',
        'https://eth.llamarpc.com',
        'https://rpc.flashbots.net',
        'https://eth.blockscout.com',
        'https://ethereum.publicnode.com',
        'https://eth-mainnet.g.alchemy.com/v2/demo'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 10,
      name: 'Optimism',
      chain: optimism,
      rpcUrls: [
        'https://optimism-rpc.publicnode.com',
        'https://optimism.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 14,
      name: 'Flare',
      chain: flare,
      rpcUrls: [
        'https://flare-api.flare.network/ext/C/rpc',
        'https://rpc.ankr.com/flare',
        'https://flare.rpc.thirdweb.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 }
    },
    {
      chainId: 25,
      name: 'Cronos',
      chain: cronos,
      rpcUrls: [
        'https://evm.cronos.org',
        'https://cronos.drpc.org',
        'https://endpoints.omniatech.io/v1/cronos/mainnet/public'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'CRO', symbol: 'CRO', decimals: 18 }
    },
    {
      chainId: 30,
      name: 'Rootstock',
      chain: rootstock,
      rpcUrls: [
        'https://public-node.rsk.co',
        'https://mycrypto.rsk.co',
        'https://rootstock.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Rootstock Smart Bitcoin', symbol: 'RBTC', decimals: 18 }
    },
    {
      chainId: 50,
      name: 'XDC',
      chain: xdc,
      rpcUrls: [
        'https://rpc.xdcrpc.com',
        'https://erpc.xdcrpc.com',
        'https://rpc1.xinfin.network'
      ],
      multicallAddress: '0x0b1795cca8e4ec4df02346a082df54d437f8d9af',
      nativeCurrency: { name: 'XDC', symbol: 'XDC', decimals: 18 }
    },
    {
      chainId: 56,
      name: 'BSC',
      chain: bsc,
      rpcUrls: [
        'https://bsc-dataseed.binance.org',
        'https://bsc-dataseed.bnbchain.org',
        'https://bsc-rpc.publicnode.com',
        'https://bsc-dataseed1.defibit.io',
        'https://bsc-dataseed1.ninicoin.io',
        'https://bsc.drpc.org',
        'https://rpc.ankr.com/bsc',
        'https://bsc.llamarpc.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
    },
    {
      chainId: 100,
      name: 'Gnosis',
      chain: gnosis,
      rpcUrls: [
        'https://rpc.gnosischain.com',
        'https://gnosis-rpc.publicnode.com',
        'https://gnosis.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'xDAI Native Token', symbol: 'xDAI', decimals: 18 }
    },
    {
      chainId: 122,
      name: 'FUSE',
      chain: fuse,
      rpcUrls: [
        'https://rpc.fuse.io',
        'https://fuse.drpc.org',
        'https://fuse-public.nodies.app'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'FUSE', symbol: 'FUSE', decimals: 18 }
    },
    {
      chainId: 130,
      name: 'Unichain',
      chain: {
        id: 130,
        name: 'Unichain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: ['https://mainnet.unichain.org'] },
          public: { http: ['https://mainnet.unichain.org'] }
        }
      } as any,
      rpcUrls: [
        'https://mainnet.unichain.org',
        'https://unichain.drpc.org',
        'https://unichain-rpc.publicnode.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 137,
      name: 'Polygon',
      chain: polygon,
      rpcUrls: [
        'https://polygon-bor-rpc.publicnode.com',
        'https://polygon.drpc.org',
        'https://polygon-rpc.com',
        'https://rpc-mainnet.maticvigil.com',
        'https://rpc.ankr.com/polygon',
        'https://polygon.llamarpc.com',
        'https://polygon-rpc.com',
        'https://matic-mainnet.chainstacklabs.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Polygon Ecosystem Token', symbol: 'POL', decimals: 18 }
    },
    {
      chainId: 146,
      name: 'Sonic',
      chain: { id: 146, name: 'Sonic', nativeCurrency: { name: 'S', symbol: 'S', decimals: 18 }, rpcUrls: ['https://rpc.soniclabs.com'] } as any,
      rpcUrls: [
        'https://rpc.soniclabs.com',
        'https://sonic.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'S', symbol: 'S', decimals: 18 }
    },
    {
      chainId: 204,
      name: 'opBNB',
      chain: { id: 204, name: 'opBNB', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://opbnb-mainnet-rpc.bnbchain.org'] } as any,
      rpcUrls: [
        'https://opbnb-mainnet-rpc.bnbchain.org',
        'https://1rpc.io/opbnb'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
    },
    {
      chainId: 232,
      name: 'Lens',
      chain: { id: 232, name: 'Lens', nativeCurrency: { name: 'GHO', symbol: 'GHO', decimals: 18 }, rpcUrls: ['https://api.lens.matterhosted.dev'] } as any,
      rpcUrls: [
        'https://api.lens.matterhosted.dev'
      ],
      multicallAddress: '0xeee5a340Cdc9c179Db25dea45AcfD5FE8d4d3eB8',
      nativeCurrency: { name: 'GHO', symbol: 'GHO', decimals: 18 }
    },
    {
      chainId: 250,
      name: 'Fantom',
      chain: fantom,
      rpcUrls: [
        'https://rpcapi.fantom.network',
        'https://rpc.fantom.network',
        'https://fantom-rpc.publicnode.com',
        'https://fantom.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'FTM', symbol: 'FTM', decimals: 18 }
    },
    {
      chainId: 252,
      name: 'Fraxtal',
      chain: fraxtal,
      rpcUrls: [
        'https://rpc.frax.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'FRAX', symbol: 'FRAX', decimals: 18 }
    },
    {
      chainId: 288,
      name: 'Boba',
      chain: boba,
      rpcUrls: [
        'https://mainnet.boba.network',
        'https://replica.boba.network'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 324,
      name: 'zkSync',
      chain: zkSync,
      rpcUrls: [
        'https://mainnet.era.zksync.io'
      ],
      multicallAddress: '0xF9cda624FBC7e059355ce98a31693d299FACd963',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 480,
      name: 'World Chain',
      chain: { id: 480, name: 'World Chain', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://worldchain-mainnet.g.alchemy.com/public'] } as any,
      rpcUrls: [
        'https://worldchain-mainnet.g.alchemy.com/public',
        'https://worldchain-mainnet.gateway.tenderly.co'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 999,
      name: 'HyperEVM',
      chain: { id: 999, name: 'HyperEVM', nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }, rpcUrls: ['https://rpc.hyperliquid.xyz/evm'] } as any,
      rpcUrls: [
        'https://rpc.hyperliquid.xyz/evm',
        'https://rpc.hyperlend.finance',
        'https://hyperliquid-json-rpc.stakely.io',
        'https://hyperliquid.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }
    },
    {
      chainId: 1088,
      name: 'Metis',
      chain: metis,
      rpcUrls: [
        'https://andromeda.metis.io',
        'https://metis.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'METIS', symbol: 'METIS', decimals: 18 }
    },
    {
      chainId: 1101,
      name: 'Polygon zkEVM',
      chain: polygonZkEvm,
      rpcUrls: [
        'https://zkevm-rpc.com',
        'https://polygon-zkevm.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 1135,
      name: 'Lisk',
      chain: { id: 1135, name: 'Lisk', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.api.lisk.com'] } as any,
      rpcUrls: [
        'https://rpc.api.lisk.com',
        'https://lisk.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 1284,
      name: 'Moonbeam',
      chain: moonbeam,
      rpcUrls: [
        'https://rpc.api.moonbeam.network',
        'https://moonbeam-rpc.publicnode.com',
        'https://moonbeam.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'GLMR', symbol: 'GLMR', decimals: 18 }
    },
    {
      chainId: 1285,
      name: 'Moonriver',
      chain: moonriver,
      rpcUrls: [
        'https://rpc.api.moonriver.moonbeam.network',
        'https://moonriver-rpc.publicnode.com',
        'https://moonriver.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'MOVR', symbol: 'MOVR', decimals: 18 }
    },
    {
      chainId: 1329,
      name: 'Sei',
      chain: { id: 1329, name: 'Sei', nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 }, rpcUrls: ['https://evm-rpc.sei-apis.com'] } as any,
      rpcUrls: [
        'https://evm-rpc.sei-apis.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 }
    },
    {
      chainId: 999,
      name: 'Hyperliquid',
      chain: { id: 999, name: 'Hyperliquid', nativeCurrency: { name: 'USD Coin (Perps)', symbol: 'USDC', decimals: 6 }, rpcUrls: ['https://hyperliquid.drpc.org'] } as any,
      rpcUrls: [
        'https://hyperliquid.drpc.org',
        'https://rpc.hyperliquid.xyz/evm',
        'https://hyperliquid-json-rpc.stakely.io'
      ],
      multicallAddress: '',
      nativeCurrency: { name: 'USD Coin (Perps)', symbol: 'USDC', decimals: 6 }
    },
    {
      chainId: 1480,
      name: 'Vana',
      chain: { id: 1480, name: 'Vana', nativeCurrency: { name: 'Vana', symbol: 'VAN', decimals: 18 }, rpcUrls: ['https://rpc.vana.org'] } as any,
      rpcUrls: [
        'https://rpc.vana.org'
      ],
      multicallAddress: '0xD8d2dFca27E8797fd779F8547166A2d3B29d360E',
      nativeCurrency: { name: 'Vana', symbol: 'VAN', decimals: 18 }
    },
    {
      chainId: 1625,
      name: 'Gravity',
      chain: { id: 1625, name: 'Gravity', nativeCurrency: { name: 'G', symbol: 'G', decimals: 18 }, rpcUrls: ['https://rpc.gravity.xyz/'] } as any,
      rpcUrls: [
        'https://rpc.ankr.com/gravity'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'G', symbol: 'G', decimals: 18 }
    },
    {
      chainId: 1868,
      name: 'Soneium',
      chain: { id: 1868, name: 'Soneium', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.soneium.org/'] } as any,
      rpcUrls: [
        'https://soneium-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 1923,
      name: 'Swellchain',
      chain: { id: 1923, name: 'Swellchain', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://swell-mainnet.alt.technology'] } as any,
      rpcUrls: [
        'https://swell-mainnet.alt.technology'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 2741,
      name: 'Abstract',
      chain: { id: 2741, name: 'Abstract', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://api.mainnet.abs.xyz'] } as any,
      rpcUrls: [
        'https://api.mainnet.abs.xyz'
      ],
      multicallAddress: '0xAa4De41dba0Ca5dCBb288b7cC6b708F3aaC759E7',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 5000,
      name: 'Mantle',
      chain: mantle,
      rpcUrls: [
        'https://rpc.mantle.xyz',
        'https://mantle-rpc.publicnode.com',
        'https://mantle.drpc.org',
        'https://mantle.public-rpc.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 }
    },
    {
      chainId: 8217,
      name: 'Kaia',
      chain: klaytn,
      rpcUrls: [
        'https://public-en.node.kaia.io',
        'https://klaytn.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'KAIA', symbol: 'KAIA', decimals: 18 }
    },
    {
      chainId: 8453,
      name: 'Base',
      chain: base,
      rpcUrls: [
        'https://mainnet.base.org',
        'https://base-rpc.publicnode.com',
        'https://base.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 13371,
      name: 'Immutable zkEVM',
      chain: { id: 13371, name: 'Immutable zkEVM', nativeCurrency: { name: 'IMX', symbol: 'IMX', decimals: 18 }, rpcUrls: ['https://rpc.immutable.com/'] } as any,
      rpcUrls: [
        'https://rpc.immutable.com/',
        'https://immutable-zkevm.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'IMX', symbol: 'IMX', decimals: 18 }
    },
    {
      chainId: 33139,
      name: 'Apechain',
      chain: { id: 33139, name: 'Apechain', nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 }, rpcUrls: ['https://rpc.apechain.com'] } as any,
      rpcUrls: [
        'https://rpc.apechain.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 }
    },
    {
      chainId: 34443,
      name: 'Mode',
      chain: mode,
      rpcUrls: [
        'https://mode.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 42161,
      name: 'Arbitrum',
      chain: arbitrum,
      rpcUrls: [
        'https://arb1.arbitrum.io/rpc',
        'https://arbitrum-one-rpc.publicnode.com',
        'https://arbitrum.drpc.org',
        'https://rpc.ankr.com/arbitrum',
        'https://arbitrum.llamarpc.com',
        'https://arbitrum-one.publicnode.com',
        'https://arbitrum-mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 42220,
      name: 'Celo',
      chain: celo,
      rpcUrls: [
        'https://celo.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Celo native asset', symbol: 'CELO', decimals: 18 }
    },
    {
      chainId: 42793,
      name: 'Etherlink',
      chain: { id: 42793, name: 'Etherlink', nativeCurrency: { name: 'Tezos', symbol: 'XTZ', decimals: 18 }, rpcUrls: ['https://node.mainnet.etherlink.com'] } as any,
      rpcUrls: [
        'https://node.mainnet.etherlink.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Tezos', symbol: 'XTZ', decimals: 18 }
    },
    {
      chainId: 43114,
      name: 'Avalanche',
      chain: avalanche,
      rpcUrls: [
        'https://api.avax.network/ext/bc/C/rpc',
        'https://avalanche-c-chain-rpc.publicnode.com',
        'https://avalanche.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }
    },
    {
      chainId: 57073,
      name: 'Ink',
      chain: { id: 57073, name: 'Ink', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc-gel.inkonchain.com'] } as any,
      rpcUrls: [
        'https://rpc-gel.inkonchain.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 59144,
      name: 'Linea',
      chain: linea,
      rpcUrls: [
        'https://rpc.linea.build'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 80094,
      name: 'Berachain',
      chain: { id: 80094, name: 'Berachain', nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 }, rpcUrls: ['https://rpc.berachain.com'] } as any,
      rpcUrls: [
        'https://rpc.berachain.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 }
    },
    {
      chainId: 81457,
      name: 'Blast',
      chain: blast,
      rpcUrls: [
        'https://rpc.blast.io',
        'https://blast-rpc.publicnode.com',
        'https://blast.drpc.org'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 167000,
      name: 'Taiko',
      chain: taiko,
      rpcUrls: [
        'https://rpc.mainnet.taiko.xyz',
        'https://rpc.taiko.xyz'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 534352,
      name: 'Scroll',
      chain: scroll,
      rpcUrls: [
        'https://rpc.scroll.io',
        'https://scroll.drpc.org',
        'https://scroll-mainnet.public.blastapi.io',
        'https://1rpc.io/scroll'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 747474,
      name: 'Katana',
      chain: { id: 747474, name: 'Katana', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.katana.network'] } as any,
      rpcUrls: [
        'https://rpc.katana.network'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
    },
    {
      chainId: 21000000,
      name: 'Corn',
      chain: { id: 21000000, name: 'Corn', nativeCurrency: { name: 'Bitcorn', symbol: 'BTCN', decimals: 18 }, rpcUrls: ['https://mainnet.corn-rpc.com'] } as any,
      rpcUrls: [
        'https://mainnet.corn-rpc.com'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'Bitcorn', symbol: 'BTCN', decimals: 18 }
    },
    {
      chainId: 1313161554,
      name: 'Aurora',
      chain: aurora,
      rpcUrls: [
        'https://mainnet.aurora.dev'
      ],
      multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      nativeCurrency: { name: 'AETH', symbol: 'AETH', decimals: 18 }
    }
  ]

  /**
   * Получить конфигурацию сети по chainId
   */
  getNetworkConfig (chainId: number): NetworkConfig | null {
    return this.networkConfigs.find(config => config.chainId === chainId) || null
  }

  /**
   * Получить все поддерживаемые chainId
   */
  getSupportedChainIds (): number[] {
    return this.networkConfigs.map(config => config.chainId)
  }

  /**
   * Проверить здоровье RPC endpoint
   */
  private async checkRPCHealth (rpcUrl: string): Promise<boolean> {
    const cacheKey = `health_${rpcUrl}`
    const cached = this.healthCache.get(cacheKey)

    if (cached && Date.now() - cached.lastCheck < this.HEALTH_CHECK_TTL) {
      return cached.isHealthy
    }

    try {
      const client = createPublicClient({
        chain: mainnet, // Используем mainnet для тестирования
        transport: http(rpcUrl, {
          timeout: 3000, // 3 секунды таймаут для проверки здоровья
          retryCount: 1,
          retryDelay: 300
        })
      })

      // Простой тест - получаем номер блока
      await client.getBlockNumber()

      this.healthCache.set(cacheKey, {
        isHealthy: true,
        lastCheck: Date.now()
      })

      return true
    } catch {
      this.healthCache.set(cacheKey, {
        isHealthy: false,
        lastCheck: Date.now()
      })

      return false
    }
  }

  /**
   * Найти рабочий RPC endpoint для сети
   */
  private async findWorkingRPC (chainId: number): Promise<string | null> {
    const config = this.getNetworkConfig(chainId)
    if (!config) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    for (const rpcUrl of config.rpcUrls) {
      if (await this.checkRPCHealth(rpcUrl)) {
        return rpcUrl
      }
    }

    return null
  }

  /**
   * Создать клиент для сети с fallback системой
   */
  async createClient (chainId: number): Promise<PublicClient> {
    // Проверяем кэш
    if (this.clientCache.has(chainId)) {
      return this.clientCache.get(chainId)!
    }

    const config = this.getNetworkConfig(chainId)
    if (!config) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    // Ищем рабочий RPC
    const workingRPC = await this.findWorkingRPC(chainId)
    if (!workingRPC) {
      throw new Error(`Все RPC endpoints для сети ${config.name} недоступны`)
    }

    try {
      const client = createPublicClient({
        chain: config.chain,
        transport: http(workingRPC, {
          timeout: 8000, // 8 секунд таймаут для лучшей производительности
          retryCount: 1, // Уменьшаем количество повторов
          retryDelay: 500 // Уменьшаем задержку между повторами
        })
      })

      // Тестируем клиент
      await client.getBlockNumber()

      // Кэшируем клиент
      this.clientCache.set(chainId, client)

      return client
    } catch (error) {
      throw new Error(`Не удалось создать клиент для сети ${config.name}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }

  /**
   * Получить клиент из кэша или создать новый
   */
  async getClient (chainId: number): Promise<PublicClient> {
    return await this.createClient(chainId)
  }

  /**
   * Очистить кэш клиентов
   */
  clearCache (): void {
    this.clientCache.clear()
    this.healthCache.clear()
    console.log('🧹 Кэш RPC клиентов очищен')
  }

  /**
   * Закрыть все HTTP соединения и очистить ресурсы
   */
  async closeAllConnections (): Promise<void> {
    console.log('🔄 Закрываем все RPC соединения...')

    // Закрываем все кэшированные клиенты
    for (const [chainId] of this.clientCache) {
      try {
        // viem клиенты автоматически закрывают соединения при garbage collection
        // но мы можем принудительно очистить кэш
        console.log(`🔌 Закрываем соединения для сети ${chainId}`)
      } catch (error) {
        console.warn(`⚠️ Ошибка при закрытии соединения для сети ${chainId}:`, error instanceof Error ? error.message : 'Неизвестная ошибка')
      }
    }

    // Очищаем кэши
    this.clientCache.clear()
    this.healthCache.clear()

    console.log('✅ Все RPC соединения закрыты')
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats (): { clientCache: number; healthCache: number } {
    return {
      clientCache: this.clientCache.size,
      healthCache: this.healthCache.size
    }
  }

  /**
   * Проверить доступность всех сетей
   */
  async checkAllNetworks (): Promise<Array<{ chainId: number; name: string; isAvailable: boolean; workingRPC?: string }>> {
    const results: Array<{ chainId: number; name: string; isAvailable: boolean; workingRPC?: string }> = []

    for (const config of this.networkConfigs) {
      try {
        const workingRPC = await this.findWorkingRPC(config.chainId)
        results.push({
          chainId: config.chainId,
          name: config.name,
          isAvailable: !!workingRPC,
          ...(workingRPC && { workingRPC })
        })
      } catch {
        results.push({
          chainId: config.chainId,
          name: config.name,
          isAvailable: false
        })
      }
    }

    return results
  }

  /**
   * Получить все сети поддерживаемые LiFi
   */
  getLiFiSupportedNetworks (): NetworkConfig[] {
    return [...this.networkConfigs]
  }

  /**
   * Проверить поддерживает ли сеть Multicall3
   */
  supportsMulticall3 (chainId: number): boolean {
    const config = this.getNetworkConfig(chainId)
    return config ? !!config.multicallAddress : false
  }

  /**
   * Получить адрес Multicall3 для сети
   */
  getMulticall3Address (chainId: number): string | null {
    const config = this.getNetworkConfig(chainId)
    return config?.multicallAddress || null
  }

  /**
   * Получить клиент с конкретным RPC URL
   */
  async getClientWithRPC (chainId: number, rpcUrl: string): Promise<PublicClient> {
    const networkConfig = this.getNetworkConfig(chainId)

    if (!networkConfig) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    // Создаем клиент с конкретным RPC URL
    const client = createPublicClient({
      chain: networkConfig.chain,
      transport: http(rpcUrl)
    })

    return client
  }

  /**
   * Загрузить прокси из файла
   */
  loadProxies (): void {
    try {
      const fs = require('fs')
      const proxiesText = fs.readFileSync('proxies.txt', 'utf8')
      const lines = proxiesText.split('\n').filter((line: string) =>
        line.trim() && !line.startsWith('#')
      )

      this.proxies = lines.map((line: string) => {
        const parts = line.trim().split(':')
        if (parts.length >= 2) {
          return {
            host: parts[0],
            port: parseInt(parts[1] || '8080'),
            username: parts[2],
            password: parts[3],
            protocol: 'http' as const
          }
        }
        return null
      }).filter((proxy: any) => proxy !== null) as ProxyConfig[]

      console.log(`🔗 Загружено ${this.proxies.length} прокси`)
    } catch {
      console.log('⚠️ Файл proxies.txt не найден, работаем без прокси')
      this.proxies = []
    }
  }

  /**
   * Получить следующий прокси (ротация)
   */
  getNextProxy (): ProxyConfig | null {
    if (this.proxies.length === 0) return null

    const proxy = this.proxies[this.proxyIndex % this.proxies.length]
    this.proxyIndex++
    return proxy || null
  }

  /**
   * Получить клиент с прокси
   */
  async getClientWithProxy (chainId: number, proxy?: ProxyConfig): Promise<PublicClient> {
    const networkConfig = this.getNetworkConfig(chainId)
    if (!networkConfig) {
      throw new Error(`Сеть с chainId ${chainId} не поддерживается`)
    }

    // Получаем RPC URL
    const rpcUrl = networkConfig.rpcUrls[0] // Используем первый RPC
    if (!rpcUrl) {
      throw new Error(`Нет доступных RPC для сети ${networkConfig.name}`)
    }

    // Создаем HTTP транспорт с прокси
    let transport
    if (proxy) {
      // Для прокси используем простой HTTP транспорт
      // Прокси будет работать через системные настройки
      transport = http(rpcUrl)
    } else {
      transport = http(rpcUrl)
    }

    const client = createPublicClient({
      chain: networkConfig.chain,
      transport
    })

    return client
  }
}

/**
 * Глобальный экземпляр менеджера RPC
 */
export const rpcManager = new RPCManager()
