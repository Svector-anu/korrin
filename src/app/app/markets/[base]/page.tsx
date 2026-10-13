import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/states'
import { MarketDetailView } from './market-detail-view'

export const metadata: Metadata = { title: 'Order book' }

export default function MarketDetailPage({ params }: PageProps<'/app/markets/[base]'>) {
  return (
    <Suspense fallback={<LoadingState label="Reading market" />}>
      <MarketDetailView params={params} />
    </Suspense>
  )
}
