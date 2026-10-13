import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/states'
import { BuilderView } from './builder-view'

export const metadata: Metadata = { title: 'Set up a market' }

export default function NewMandatePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading mandate builder" />}>
      <BuilderView />
    </Suspense>
  )
}
