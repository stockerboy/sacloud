import { NotFoundView } from '@/components/NotFoundView'

/** 라우트에 걸리지 않은 모든 경로 (Next.js catch-all 404) */
export default function NotFound() {
  return <NotFoundView />
}
