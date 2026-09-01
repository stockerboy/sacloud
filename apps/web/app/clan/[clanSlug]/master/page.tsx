'use client'

/**
 * 클랜 **마스터 인증하기** `/clan/{slug}/master` (2026-09-01 · D-253).
 *
 * ```
 *   ① 인게임 스크린샷 1장을 고른다   (마스터 계정으로 접속한 화면)
 *   ② 제출 → 「심사중」
 *   ③ 운영자가 사진을 보고 승인 또는 거부
 *   ④ 승인되면 [클랜 설정] 이 열린다
 * ```
 *
 * ── 판정하는 것은 **사람**이다. 그것을 숨기지 않는다
 *   「자동으로 확인됩니다」 같은 말을 쓰지 않는다. 사람이 본다고 그대로 적는다.
 *   얼마나 걸리는지는 `[미확인]` 이므로 **「보통 N일 걸립니다」 를 지어내지 않는다.**
 *
 * ── 거부되면 **사유를 그대로 보여 준다**
 *   무엇을 고쳐야 하는지 모르면 사용자는 같은 사진을 다시 낸다.
 *
 * ── 색
 *   진홍(`--color-accent`)은 **상태 한 곳**에만 쓴다 (D-204).
 */

import { use, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileSkeleton, SectionTitle } from '@sacloud/ui'
import {
  CLAN_MASTER_IMAGE_MAX_BYTES,
  CLAN_MASTER_IMAGE_MIME_TYPES,
  CLAN_MASTER_NOTE_MAX,
  clanMasterImageErrorMessage,
  parseImageDataUrl,
  type ClanMasterClaimState,
} from '@sacloud/contract'
import { ApiError, apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

const MAX_MB = Math.floor(CLAN_MASTER_IMAGE_MAX_BYTES / (1024 * 1024))

function ClanMasterBody({ clanSlug }: { clanSlug: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  /** 고른 사진의 data URL. **제출 전까지 서버로 가지 않는다** */
  const [image, setImage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [note, setNote] = useState('')
  /** 화면에서 먼저 잡은 오류. 서버와 **같은 문구**를 쓴다 (계약이 문구를 갖고 있다) */
  const [localError, setLocalError] = useState<string | null>(null)

  const claim = useQuery({
    queryKey: ['clan', clanSlug, 'master-claim'],
    queryFn: () => apiGet('clanMasterClaimShow', { params: { clanSlug } }),
    enabled: ready,
  })

  const submit = useMutation({
    mutationFn: () =>
      apiSend('clanMasterClaimCreate', {
        params: { clanSlug },
        body: { image, note: note.trim() || null },
      }),
    onSuccess: () => {
      setImage(null)
      setFileName(null)
      void queryClient.invalidateQueries({ queryKey: ['clan', clanSlug] })
    },
  })

  const cancel = useMutation({
    mutationFn: () => apiSend('clanMasterClaimCancel', { params: { clanSlug } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clan', clanSlug] }),
  })

  if (!claim.data) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={1} height={240} />
      </div>
    )
  }

  const data: ClanMasterClaimState = claim.data.data

  function pickFile(file: File | null) {
    setLocalError(null)
    setImage(null)
    setFileName(null)
    if (!file) return

    if (file.size > CLAN_MASTER_IMAGE_MAX_BYTES) {
      setLocalError(clanMasterImageErrorMessage('too-large'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setLocalError(clanMasterImageErrorMessage('not-data-url'))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      /* 서버와 **같은 규칙**으로 먼저 본다. 3MB 를 보내고 나서 거절당하지 않게 */
      const parsed = parseImageDataUrl(value)
      if (!parsed.ok) {
        setLocalError(clanMasterImageErrorMessage(parsed.error))
        return
      }
      setImage(value)
      setFileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="pc-container pb-[40px] pt-[40px]">
      <SectionTitle title="마스터 인증" note={clanSlug} />

      <div className="mt-6 max-w-[560px]">
        <StatusLine data={data} />

        {/* 준비되지 않았으면 있는 척하지 않는다 */}
        {!data.available ? (
          <p className="mt-6 border-l-2 border-accent py-1 pl-4 text-[13px] leading-relaxed text-meta">
            마스터 인증은 준비 중입니다.
          </p>
        ) : null}

        {data.available && data.status === 'approved' ? (
          <div className="mt-6">
            <p className="text-[13px] leading-relaxed text-meta">
              이 클랜의 마스터로 인증됐습니다. 클랜 공지와 리그 초대 설정을 바꿀 수 있습니다.
            </p>
            <Link
              href={`/clan/${clanSlug}/setting`}
              className="btn-line mt-5 inline-flex h-10 items-center px-5 text-[13px]"
            >
              <span>클랜 설정</span>
            </Link>
          </div>
        ) : null}

        {data.available && data.status === 'pending' ? (
          <div className="mt-6">
            <p className="text-[13px] leading-relaxed text-meta">
              제출한 사진을 운영자가 직접 확인합니다. 결과가 나오면 이 화면에 표시됩니다.
            </p>
            {data.image_url ? (
              <img
                src={data.image_url}
                alt="제출한 인게임 스크린샷"
                className="mt-4 max-h-[320px] w-auto max-w-full rounded-[2px] border border-line"
              />
            ) : null}
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
              className="btn-line mt-5 h-10 px-5 text-[13px] disabled:opacity-50"
            >
              {cancel.isPending ? '취소중' : '신청 취소'}
            </button>
          </div>
        ) : null}

        {data.available && data.taken_by_other ? (
          <p className="mt-6 border-l-2 border-accent py-1 pl-4 text-[13px] leading-relaxed text-meta">
            이 클랜은 이미 다른 회원이 마스터로 인증했습니다. 잘못된 경우 운영자에게 문의해주세요.
          </p>
        ) : null}

        {data.available && data.can_submit ? (
          <div className="mt-8">
            <ol className="mb-6 space-y-2 text-[13px] leading-relaxed text-meta">
              <li>1. 클랜 마스터 계정으로 게임에 접속합니다.</li>
              <li>2. 마스터인 것이 보이는 화면을 스크린샷으로 찍습니다.</li>
              <li>3. 아래에 사진 1장을 첨부하고 제출합니다.</li>
              <li>4. 운영자가 사진을 보고 승인하면 클랜 설정이 열립니다.</li>
            </ol>

            <input
              ref={fileInput}
              type="file"
              accept={CLAN_MASTER_IMAGE_MIME_TYPES.join(',')}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn-line h-10 px-5 text-[13px]"
              >
                사진 고르기
              </button>
              <span className="text-[12px] text-faint">
                PNG · JPG · WEBP / 최대 <span className="num">{MAX_MB}</span>MB
              </span>
            </div>

            {image ? (
              <div className="mt-4">
                <div className="text-[12px] text-meta">{fileName}</div>
                <img
                  src={image}
                  alt="첨부할 인게임 스크린샷 미리보기"
                  className="mt-2 max-h-[320px] w-auto max-w-full rounded-[2px] border border-line"
                />
              </div>
            ) : null}

            <label className="mt-6 block text-[12px] text-meta" htmlFor="clan-master-note">
              운영자에게 남길 말 (선택)
            </label>
            <textarea
              id="clan-master-note"
              value={note}
              maxLength={CLAN_MASTER_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-[2px] border border-line bg-card px-3 py-2 text-[15px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />

            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                disabled={!image || submit.isPending}
                onClick={() => submit.mutate()}
                className="h-10 rounded-[2px] border border-accent px-6 text-[13px] text-accent transition-colors hover:bg-accent hover:text-page disabled:opacity-50"
              >
                {submit.isPending ? '제출중' : '제출'}
              </button>
              {localError ? <span className="text-[12px] text-accent">{localError}</span> : null}
              {!localError && submit.isError ? (
                <span className="text-[12px] text-accent">{submitErrorMessage(submit.error)}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 지금 어디까지 왔는지 한 줄. **진홍은 여기 하나뿐이다** */
function StatusLine({ data }: { data: ClanMasterClaimState }) {
  const label = statusLabel(data.status)
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="text-[12px] text-meta">상태</span>
      <span className={data.status === 'approved' ? 'text-accent' : 'text-text-strong'}>
        {label}
      </span>
      {data.decision_note ? (
        <span className="text-[12px] text-meta">사유 {data.decision_note}</span>
      ) : null}
    </div>
  )
}

function statusLabel(status: ClanMasterClaimState['status']): string {
  switch (status) {
    case 'none':
      return '신청 전'
    case 'pending':
      return '심사중'
    case 'approved':
      return '인증됨'
    case 'rejected':
      return '거부됨'
    case 'cancelled':
      return '취소됨'
    case 'revoked':
      return '해제됨'
  }
}

/**
 * 제출 실패를 사람 말로.
 *
 * `apiSend` 는 서버 문구를 싣고 오지 않는다(상태 코드만 온다). 그래서 대부분의 오류는
 * **제출 전에 화면이 먼저 잡는다**(`parseImageDataUrl`). 여기 남는 것은 그 밖의 경우다.
 */
function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return '로그인이 필요합니다.'
    if (error.status === 429) return '신청을 너무 많이 냈습니다. 잠시 후 다시 시도해주세요.'
    if (error.status === 404) return '클랜을 찾을 수 없습니다.'
    if (error.status === 400) return '사진을 다시 확인해주세요.'
  }
  return '제출하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

export default function ClanMasterPage({ params }: { params: Promise<{ clanSlug: string }> }) {
  const { clanSlug } = use(params)
  return (
    <AuthGuard>
      <ClanMasterBody clanSlug={clanSlug} />
    </AuthGuard>
  )
}
