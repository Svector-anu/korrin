import type { Metadata } from 'next'
import { MandatesView } from './mandates-view'

export const metadata: Metadata = { title: 'Your markets' }

export default function MandatesPage() {
  return <MandatesView />
}
