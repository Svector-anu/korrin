import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/states'
import { ReportView } from './report-view'

export const metadata: Metadata = { title: 'Signed market report' }

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingState label="Opening report" />}>
      <ReportView />
    </Suspense>
  )
}
