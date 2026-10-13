'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'

const overlayClass =
  'fixed inset-0 z-40 bg-overlay data-[state=open]:animate-[fade-in_180ms_var(--ease-out-quiet)] data-[state=closed]:animate-[fade-out_140ms_var(--ease-out-quiet)]'

/** Right-hand inspection drawer. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className="fixed inset-y-2 right-2 z-50 flex w-[min(480px,calc(100vw-16px))] flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-widget)] outline-none data-[state=open]:animate-[drawer-in_220ms_var(--ease-out-quiet)] data-[state=closed]:animate-[drawer-out_160ms_var(--ease-out-quiet)]">
          <header className="hairline-b flex items-start justify-between gap-4 border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="title">{title}</Dialog.Title>
              {description ? <Dialog.Description className="label mt-0.5">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Details</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close" iconOnly className="-mr-2">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="hairline-t flex items-center justify-end gap-2 border-line px-5 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Centred modal for confirmations and the execution flow. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  dismissible?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (dismissible || next ? onOpenChange(next) : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-widget)] outline-none data-[state=open]:animate-[modal-in_200ms_var(--ease-out-quiet)]',
            className,
          )}
        >
          <header className="px-6 pt-5 pb-2">
            <Dialog.Title className="heading text-[19px] text-structural">{title}</Dialog.Title>
            {description ? <Dialog.Description className="prose-body mt-1 text-[14.5px] text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Dialog</Dialog.Description>}
          </header>
          {children && <div className="min-h-0 overflow-y-auto px-6 py-3">{children}</div>}
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pt-2 pb-5">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
