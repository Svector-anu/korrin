import { LIVE_REPORT_PATH } from '@/lib/evidence/live-report'

export function GET(request: Request) {
  return Response.redirect(new URL(LIVE_REPORT_PATH, request.url), 307)
}
