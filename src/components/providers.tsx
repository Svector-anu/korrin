'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { connectorsForWallets, lightTheme, RainbowKitProvider, type Theme } from '@rainbow-me/rainbowkit'
import { coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { tempoModerato } from 'viem/chains'
import { createConfig, http, useAccount, useWalletClient, WagmiProvider } from 'wagmi'
import { setExternalWallet } from '@/lib/client/signer'
import { MULTICALL3 } from '@/lib/tempo/chain'
import { TooltipProvider } from './ui/tooltip'

/**
 * Injected wallets sign standard transactions, so this chain omits Tempo's
 * feeToken (which would force the 0x76 envelope wallets cannot sign).
 */
const walletChain = { ...tempoModerato, contracts: { ...tempoModerato.contracts, multicall3: { address: MULTICALL3 } } }

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Browser wallets',
      wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, injectedWallet, ...(projectId ? [walletConnectWallet] : [])],
    },
  ],
  { appName: 'Korrin', projectId: projectId ?? 'korrin-injected-only' },
)

const wagmiConfig = createConfig({
  chains: [walletChain],
  connectors,
  transports: { [walletChain.id]: http(undefined, { retryCount: 6, retryDelay: 350 }) },
  ssr: true,
})

/** RainbowKit theme expressed in Korrin tokens, so it follows light and dark automatically. */
const base = lightTheme()
const korrinWalletTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    accentColor: 'var(--primary)',
    accentColorForeground: 'var(--primary-ink)',
    actionButtonBorder: 'var(--line)',
    actionButtonBorderMobile: 'var(--line)',
    actionButtonSecondaryBackground: 'var(--surface-recessed)',
    closeButton: 'var(--ink-muted)',
    closeButtonBackground: 'var(--surface-recessed)',
    connectButtonBackground: 'var(--surface)',
    connectButtonInnerBackground: 'var(--surface-recessed)',
    connectButtonText: 'var(--ink)',
    connectionIndicator: 'var(--positive)',
    error: 'var(--negative)',
    generalBorder: 'var(--line)',
    generalBorderDim: 'var(--line-faint)',
    menuItemBackground: 'var(--surface-hover)',
    modalBackdrop: 'var(--overlay)',
    modalBackground: 'var(--surface)',
    modalBorder: 'var(--line)',
    modalText: 'var(--ink)',
    modalTextDim: 'var(--ink-faint)',
    modalTextSecondary: 'var(--ink-muted)',
    profileAction: 'var(--surface-recessed)',
    profileActionHover: 'var(--surface-hover)',
    profileForeground: 'var(--surface)',
    selectedOptionBorder: 'var(--accent)',
    standby: 'var(--ink-muted)',
  },
  fonts: { body: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' },
  radii: {
    actionButton: '999px',
    connectButton: '999px',
    menuButton: '10px',
    modal: '14px',
    modalMobile: '14px',
  },
  shadows: {
    ...base.shadows,
    connectButton: 'none',
    dialog: 'var(--shadow-widget)',
    profileDetailsAction: 'none',
    selectedOption: 'none',
    selectedWallet: 'none',
    walletLogo: 'none',
  },
}

function WalletBridge() {
  const { address, connector, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  useEffect(() => {
    setExternalWallet(isConnected && address && walletClient ? { client: walletClient, address, connector: connector?.name ?? 'Browser wallet' } : null)
  }, [isConnected, address, walletClient, connector])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={korrinWalletTheme} modalSize="compact" appInfo={{ appName: 'Korrin', disclaimer: undefined }}>
          <TooltipProvider>
            <WalletBridge />
            {children}
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export { walletChain }
