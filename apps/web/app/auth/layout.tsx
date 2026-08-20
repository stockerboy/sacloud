/**
 * 인증 화면 레이아웃.
 *
 * 원본은 인증 화면에서 전역 GNB·푸터를 보여주지 않고 화면 전체를 카드로 채운다(관측).
 * 셸 제거는 `AppShell`이 경로(`/auth/*`)로 판단하므로 여기서는 그대로 통과시킨다.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
