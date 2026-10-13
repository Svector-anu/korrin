'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Copy, Droplets, ExternalLink, KeyRound, LogOut, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useDisconnect, useSwitchChain } from 'wagmi'
import { createTestnetSigner, explainError, fundFromFaucet } from '@/lib/client/execute'
import { useActiveSigner } from '@/lib/client/signer'
import { setSigner, useSigner } from '@/lib/client/store'
import { cn } from '@/lib/cn'
import { CHAIN_ID, explorerAddress, shortHex } from '@/lib/tempo/chain'
import { Button } from '../ui/button'
import { Modal } from '../ui/overlay'

function Identicon({ address, size = 18 }: { address: string; size?: number }) {
  const seed = Number.parseInt(address.slice(2, 10), 16)
  const cells = Array.from({ length: 9 }, (_, i) => (seed >> i) & 1)
  return (
    <svg width={size} height={size} viewBox="0 0 3 3" aria-hidden className="shrink-0 rounded-full bg-recessed ring-1 ring-line">
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % 3} y={Math.floor(i / 3)} width={1} height={1} fill="var(--ink-structural)" opacity={0.18 + ((seed >> (i + 9)) & 3) * 0.18} /> : null,
      )}
    </svg>
  )
}

export function WalletControl() {
  const active = useActiveSigner()
  const local = useSigner()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [funding, setFunding] = useState<'idle' | 'busy' | 'done' | string>('idle')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const fund = async () => {
    if (!active) return
    setFunding('busy')
    try {
      await fundFromFaucet(active.address)
      setFunding('done')
    } catch (e) {
      const err = explainError(e)
      setFunding(`${err.title}. ${err.reason}`)
    }
  }

  return (
    <>
    <Modal
      open={confirmRemove}
      onOpenChange={setConfirmRemove}
      title="Remove the testnet signer?"
      description="The key exists only in this browser. Once removed, any testnet funds and resting orders on it can no longer be managed from here."
      footer={
        <>
          <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
            Keep signer
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setSigner(null)
              setConfirmRemove(false)
            }}
          >
            Remove signer
          </Button>
        </>
      }
    />
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const connected = mounted && account && chain
        const wrongChain = connected && chain.id !== CHAIN_ID
        if (!active && !connected) {
          return (
            <Popover.Root open={open} onOpenChange={setOpen}>
              <Popover.Trigger asChild>
                <Button variant="primary" icon={<Wallet className="size-4" strokeWidth={1.75} />} trailingIcon={<ChevronDown className="size-3.5 opacity-70" />}>
                  Connect
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-[var(--radius-card)] bg-surface p-2 shadow-[var(--shadow-float)] data-[state=open]:animate-[fade-in_160ms_var(--ease-out-quiet)]">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      openConnectModal()
                    }}
                    className="flex w-full items-start gap-3 rounded-[var(--radius-panel)] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover"
                  >
                    <Wallet className="mt-0.5 size-4 text-ink-2" strokeWidth={1.75} />
                    <span>
                      <span className="block text-[14px] font-medium text-ink">Browser wallet</span>
                      <span className="block text-[13px] leading-snug text-muted">MetaMask, Rabby or another injected wallet on Tempo Moderato.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      createTestnetSigner()
                      setOpen(false)
                    }}
                    className="flex w-full items-start gap-3 rounded-[var(--radius-panel)] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover"
                  >
                    <KeyRound className="mt-0.5 size-4 text-ink-2" strokeWidth={1.75} />
                    <span>
                      <span className="block text-[14px] font-medium text-ink">Korrin testnet signer</span>
                      <span className="block text-[13px] leading-snug text-muted">Generates a testnet-only key that stays in this browser. No extension needed. Korrin’s servers never see it.</span>
                    </span>
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )
        }

        return (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex h-10 items-center gap-2.5 rounded-full border hairline border-line-strong bg-surface pr-3 pl-1.5 text-[14px] text-ink transition-colors duration-150 hover:bg-hover',
                  wrongChain && 'border-negative/50',
                )}
              >
                {active && <Identicon address={active.address} size={26} />}
                <span className="tabular">{active ? shortHex(active.address, 4, 4) : ''}</span>
                {wrongChain && <span className="text-negative">Wrong network</span>}
                <ChevronDown className="size-3.5 text-muted" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] data-[state=open]:animate-[fade-in_160ms_var(--ease-out-quiet)]">
                {active && (
                  <div className="px-4 pt-4 pb-3">
                    <div className="label">{active.kind === 'wallet' ? `Connected with ${active.label}` : 'Korrin testnet signer (this browser)'}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Identicon address={active.address} size={22} />
                      <span className="tabular truncate text-[13.5px] text-ink">{shortHex(active.address, 8, 6)}</span>
                      <button type="button" onClick={() => copy(active.address)} className="ml-auto rounded-md p-1 text-muted hover:bg-hover hover:text-ink" aria-label="Copy address">
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      </button>
                      <a href={explorerAddress(active.address)} target="_blank" rel="noreferrer" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink" aria-label="Open in explorer">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                    {active.kind === 'local' && <p className="mt-2 text-[13px] leading-snug text-muted">Testnet only. The key lives in this browser’s storage. Clearing site data removes it.</p>}
                  </div>
                )}
                <div className="hairline-t space-y-0.5 border-line p-2">
                  {wrongChain && (
                    <MenuItem onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={switching} icon={<Wallet className="size-3.5" />}>
                      Switch to Tempo Moderato
                    </MenuItem>
                  )}
                  <MenuItem onClick={fund} disabled={funding === 'busy' || !active} icon={<Droplets className="size-3.5" />}>
                    {funding === 'busy' ? 'Requesting testnet funds…' : funding === 'done' ? 'Faucet funds received' : 'Fund from testnet faucet'}
                  </MenuItem>
                  {funding !== 'idle' && funding !== 'busy' && funding !== 'done' && <p className="px-3 pb-1 text-[13px] text-negative">{funding}</p>}
                  {connected && (
                    <MenuItem onClick={() => disconnect()} icon={<LogOut className="size-3.5" />}>
                      Disconnect wallet
                    </MenuItem>
                  )}
                  {!connected && local && (
                    <>
                      <MenuItem onClick={() => openConnectModal()} icon={<Wallet className="size-3.5" />}>
                        Use a browser wallet instead
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setOpen(false)
                          setConfirmRemove(true)
                        }}
                        icon={<LogOut className="size-3.5" />}
                        tone="negative"
                      >
                        Remove testnet signer
                      </MenuItem>
                    </>
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )
      }}
    </ConnectButton.Custom>
    </>
  )
}

function MenuItem({ children, icon, onClick, disabled, tone }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'negative' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn('flex w-full items-center gap-2.5 rounded-[var(--radius-input)] px-3 py-2 text-left text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-50', tone === 'negative' && 'text-negative hover:text-negative')}
    >
      {icon}
      {children}
    </button>
  )
}
