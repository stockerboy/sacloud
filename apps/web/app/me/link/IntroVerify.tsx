'use client'

import { useEffect, useRef, useState } from 'react'
import { MeButton, MeError, MeInput, MePanel } from '../ui'

/**
 * ★★자기소개 인증★★ (2026-09-20 사장님)
 *
 * > 「병영수첩에 자기아이디로 로그인하면 프로필들어와서 자기소개 바꿀 수있는데
 * >  여기다가 3분안에 sacloud 라고 쓰면 인증성공하고 그 아이디 연동되고」
 *
 * ── 흐름
 *   ① 닉네임을 넣고 「문구 받기」   → `SACLOUD-7F3A` 가 나온다
 *   ② 병영수첩 → 내정보 → 프로필 설정 → 자기소개에 붙여넣고 저장
 *   ③ 「확인」                     → 몇 초~1분 뒤 인증 완료
 *   ④ 자기소개는 다시 바꿔도 된다
 *
 * ── ⚠ ★「확인하는 중」 을 반드시 보여 준다★
 *   사이트는 병영수첩을 직접 못 읽는다(403). ★VPS 워커★ 가 1분마다 읽어 준다.
 *   그 사이 「아직 안 됐다」 라고만 하면 ★사람이 문구를 다시 적는다.★
 *   그래서 확인을 누른 뒤에는 ★기다리는 중★ 이라고 분명히 말하고 스스로 다시 묻는다.
 *
 * ⚠ 칭호 인증(`TitleVerify`)을 대체하지 않는다 — 둘 다 있고 편한 쪽을 고른다.
 */

interface IntroState {
  status: 'idle' | 'waiting' | 'checking' | 'verified' | 'expired'
  phrase: string | null
  expiresAt: string | null
  nickname: string | null
  seen: string | null
  attempts: number
}

const URL = '/api/me/intro-verification'

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', nickname?: string) {
  const res = await fetch(URL, {
    method,
    ...(nickname ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) } : {}),
  })
  const body = (await res.json()) as { message?: string; data?: IntroState }
  if (!res.ok) throw new Error(body.message ?? '잠시 후 다시 시도해주세요')
  return body.data ?? null
}

/** 남은 시간 — 「3분」 이 실제로 줄어드는 것을 보여 준다 */
function leftOf(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return '시간이 지났습니다'
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} 남음`
}

export function IntroVerify() {
  const [nickname, setNickname] = useState('')
  const [state, setState] = useState<IntroState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  /* 남은 시간을 1초마다 다시 그린다 — 숫자가 멈춰 있으면 «멈춘 건가» 싶다 */
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])

  /* 처음에 한 번 상태를 읽는다 — 새로고침해도 하던 자리가 남아 있어야 한다 */
  useEffect(() => {
    void call('GET')
      .then((s) => {
        setState(s)
        if (s?.nickname) setNickname(s.nickname)
      })
      .catch(() => {
        /* 로그인 안 했으면 여기로 온다. 화면은 그냥 처음 모습으로 둔다 */
      })
  }, [])

  /*
   * ★확인을 부탁한 뒤에는 스스로 다시 묻는다★ — 워커가 읽어 줄 때까지 최대 1분이다.
   * ⚠ 끝나면 반드시 멈춘다. 안 그러면 인증이 끝난 뒤에도 계속 서버를 두드린다.
   */
  useEffect(() => {
    if (state?.status !== 'checking') {
      if (timer.current) { clearInterval(timer.current); timer.current = null }
      return
    }
    if (timer.current) return
    timer.current = setInterval(() => {
      void call('GET').then((s) => s && setState(s)).catch(() => {})
    }, 5000)
    return () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null }
    }
  }, [state?.status])

  const run = async (method: 'POST' | 'PUT' | 'DELETE') => {
    setError(null)
    setBusy(true)
    try {
      const s = await call(method, method === 'DELETE' ? undefined : nickname.trim())
      setState(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠시 후 다시 시도해주세요')
    } finally {
      setBusy(false)
    }
  }

  const status = state?.status ?? 'idle'
  const phrase = state?.phrase ?? null

  return (
    <MePanel>
      <h2 className="text-[15px] text-text-strong">자기소개로 인증하기</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-meta">
        게임을 켜지 않아도 됩니다. 병영수첩 프로필의 <b className="text-text">자기소개</b>에
        저희가 드리는 문구를 적으면 그 아이디가 사장님 것임이 증명됩니다.
      </p>

      {status === 'verified' ? (
        <div className="mt-4 rounded-[2px] border border-line-soft px-4 py-3">
          <p className="text-[14px] text-text-strong">
            인증 완료{state?.nickname ? ` — ${state.nickname}` : ''}
          </p>
          <p className="mt-1.5 text-[12px] text-meta">
            자기소개는 이제 원래대로 바꾸셔도 됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MeInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="서든어택 닉네임"
              disabled={busy || status === 'waiting' || status === 'checking'}
            />
            {status === 'idle' || status === 'expired' ? (
              <MeButton onClick={() => void run('POST')} disabled={busy || nickname.trim() === ''}>
                {busy ? '잠시만요…' : '문구 받기'}
              </MeButton>
            ) : (
              <>
                <MeButton onClick={() => void run('PUT')} disabled={busy || status === 'checking'}>
                  {status === 'checking' ? '확인하는 중…' : '확인'}
                </MeButton>
                <button
                  type="button"
                  onClick={() => void run('DELETE')}
                  className="text-[12px] text-meta transition-colors hover:text-accent"
                >
                  그만두기
                </button>
              </>
            )}
          </div>

          {phrase && (status === 'waiting' || status === 'checking') ? (
            <div className="mt-4 rounded-[2px] border border-line-soft px-4 py-3">
              <p className="text-[12px] text-meta">병영수첩 자기소개에 이 문구를 적어주세요</p>
              <p className="mt-2 select-all font-num text-[20px] tracking-[.08em] text-text-strong">
                {phrase}
              </p>
              <p className="mt-2 text-[12px] text-meta">
                {leftOf(state?.expiresAt ?? null)}
                {' · '}
                원래 적어두신 소개는 지우지 않으셔도 됩니다 — 뒤에 붙이기만 하면 됩니다.
              </p>
              {status === 'checking' ? (
                <p className="mt-2 text-[12px] text-accent">
                  확인하는 중입니다 — 최대 1분쯤 걸립니다. 이 화면을 켜두세요.
                </p>
              ) : null}
              {/* ★왜 안 됐는지 보여 준다★ — 「안 된다」 고만 하면 고칠 수가 없다 */}
              {state?.seen !== null && state?.seen !== undefined && state.attempts > 0 ? (
                <p className="mt-2 break-all text-[12px] text-faint">
                  지금 적혀 있는 소개: {state.seen === '' ? '(비어 있음)' : state.seen}
                </p>
              ) : null}
            </div>
          ) : null}

          {status === 'expired' ? (
            <p className="mt-3 text-[12px] text-meta">
              시간이 지났습니다. 「문구 받기」를 다시 눌러주세요.
            </p>
          ) : null}
        </>
      )}

      {error ? <MeError>{error}</MeError> : null}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-meta">
        <li>「문구 받기」를 누릅니다</li>
        <li>
          병영수첩{' '}
          <a
            href="https://barracks.sa.nexon.com/myinfo"
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            <span className="text-text">내정보 → 프로필 설정</span>
          </a>{' '}
          에서 자기소개에 문구를 적고 저장합니다
        </li>
        <li>여기로 돌아와 「확인」을 누릅니다</li>
      </ol>
    </MePanel>
  )
}
