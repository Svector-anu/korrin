import { Providers } from '@/components/providers'
import { AppShell } from '@/components/shell/app-shell'

export default function WorkspaceLayout({ children }: LayoutProps<'/app'>) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  )
}
