import type { Metadata } from 'next'
import { MarketsView } from './markets-view'

export const metadata: Metadata = { title: 'Order books' }

export default function MarketsPage() {
  return <MarketsView />
}
