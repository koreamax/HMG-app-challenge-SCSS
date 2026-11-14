/**
 * 앱에 넣은 쉼터 좌표 (NaviHelper 가 없거나 안내 중이 아닐 때 쓴다).
 * 지금은 시연 경로의 예시 좌표다. 출시 때 한국도로공사 졸음쉼터 공공데이터로 바꾼다.
 */
export type RestArea = { id: string; name: string; road: string; km: number; lat: number; lng: number }

/** 시연 경로: 고속도로 상행 (예시). km 는 경로 시작점에서의 거리 */
export const DEMO_ROUTE = { name: '고속도로 상행 (시연 경로)', lengthKm: 120 }

export const REST_AREAS: RestArea[] = [
  { id: 'r1', name: '졸음쉼터 A', road: '고속도로 상행', km: 14, lat: 37.2101, lng: 127.0861 },
  { id: 'r2', name: '졸음쉼터 B', road: '고속도로 상행', km: 41, lat: 36.9963, lng: 127.1772 },
  { id: 'r3', name: '졸음쉼터 C', road: '고속도로 상행', km: 77, lat: 36.7218, lng: 127.3402 },
]

/** 경로 앞쪽에서 가장 가까운 쉼터 (지금 위치 km 기준). 없으면 null */
export function nextRestArea(nowKm: number, list: RestArea[] = REST_AREAS): (RestArea & { aheadKm: number }) | null {
  const ahead = list.filter((r) => r.km > nowKm + 0.5).sort((a, b) => a.km - b.km)
  if (!ahead.length) return null
  return { ...ahead[0], aheadKm: Math.round(ahead[0].km - nowKm) }
}

/** 말로 부를 이름 (예: "14킬로미터 앞 졸음쉼터 A") */
export const spokenName = (r: RestArea & { aheadKm: number }) => r.aheadKm + '킬로미터 앞 ' + r.name
