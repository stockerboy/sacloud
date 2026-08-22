import type { ReactNode } from 'react'
import { AdminShell } from './AdminShell'

export const metadata = { title: 'SACLOUD 운영 관리' }

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
