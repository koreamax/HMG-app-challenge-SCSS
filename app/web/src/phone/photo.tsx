/**
 * 짐 사진: 카메라(<input capture="environment">)로 찍은 것을 긴 변 약 800 px JPEG 로 줄인다.
 * 기록(운송장)에 넣으니 작게: 한 장 100 KB 안팎. EXIF 방향은 브라우저가 맞춘 대로 그린다.
 */
import { useRef, type ReactNode } from 'react'

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('사진을 읽지 못했습니다'))
    }
    img.src = url
  })
}

export async function downscale(file: Blob, max = 800, quality = 0.8): Promise<string> {
  let src: ImageBitmap | HTMLImageElement
  let w: number
  let h: number
  try {
    const bm = await createImageBitmap(file, { imageOrientation: 'from-image' })
    src = bm
    w = bm.width
    h = bm.height
  } catch {
    const img = await loadImage(file)
    src = img
    w = img.naturalWidth
    h = img.naturalHeight
  }
  const k = Math.min(1, max / Math.max(1, w, h))
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(w * k))
  cv.height = Math.max(1, Math.round(h * k))
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error('사진을 줄이지 못했습니다')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.drawImage(src, 0, 0, cv.width, cv.height)
  if ('close' in src) src.close()
  return cv.toDataURL('image/jpeg', quality)
}

/** 숨은 카메라 입력 하나와 여는 함수. onPhoto 는 줄인 JPEG data URL 을 받는다 */
export function usePhotoInput(onPhoto: (dataUrl: string) => void, onError?: (msg: string) => void, tag = 'photo'): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      data-photo={tag}
      onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        try {
          onPhoto(await downscale(f))
        } catch (err) {
          onError?.(err instanceof Error ? err.message : '사진을 붙이지 못했습니다')
        }
      }}
    />
  )
  return { open: () => ref.current?.click(), input }
}
