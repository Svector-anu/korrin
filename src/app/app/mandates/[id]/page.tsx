import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/states'
import { MandateDetailView } from './mandate-detail-view'

export const metadata: Metadata = { title: 'Market' }

export default function MandatePage({ params }: PageProps<'/app/mandates/[id]'>) {
  return (
    <Suspense fallback={<LoadingState label="Loading mandate" />}>
      <MandateDetailView params={params} />
    </Suspense>
  )
}
