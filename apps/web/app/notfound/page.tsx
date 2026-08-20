import { NotFoundView } from '@/components/NotFoundView'

/**
 * 원본 라우팅 지도에 있는 명시적 404 경로(`/notfound`).
 * 앱 내부에서 "없는 대상"으로 보낼 때 쓰는 주소라 catch-all과 별개로 존재한다.
 */
export default function NotFoundRoute() {
  return <NotFoundView />
}
