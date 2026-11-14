/** 음성 문장. [표 2]의 문장을 그대로 쓴다 (따옴표 안의 말). 나머지는 같은 말투로 짧게 */
export const LINES = {
  cautionBump: '짐 고정이 약합니다. 방지턱을 천천히 넘으세요.',
  cautionSection: '짐 고정이 약합니다. 앞 구간을 천천히 지나세요.',
  checkNeeded: '방금 짐에 큰 힘이 걸렸습니다. 다음에 설 때 짐을 확인하세요.',
  /** 키트 없이 고속도로: 다음에 설 곳이 멀어 쉼터를 묻는다 ("네" -> 쉼터 경유지) */
  checkNeededAsk: '방금 짐에 큰 힘이 걸렸습니다. 다음 졸음쉼터에서 확인할까요?',
  barLoose: '바가 느슨해졌습니다.',
  cargoMoved: '짐이 밀렸습니다.',
  restAreaAsk: '다음 졸음쉼터에서 확인하세요. 안내할까요?',
  safePlace: '가까운 안전한 곳에 세우고 바를 확인하세요.',
  cargoLost: '짐이 떨어졌을 수 있습니다. 안전한 곳에 세우고, 도로에 떨어진 짐은 직접 줍지 말고 신고하세요.',
  // 출발 때 한 번
  departSlide: '짐 고정이 약합니다. 급제동 때 짐이 밀릴 수 있습니다.',
  departTip: '키가 큰 짐입니다. 넘어지지 않게 묶였는지 확인하세요.',
  departGrey: '지금은 짐 상태를 판정할 수 없습니다.',
  // 사건 뒤 정차 (내비 지도가 앞에 있을 수 있어 화면을 열라고 말한다)
  parkedRelash: '세우셨습니다. 적재적소 화면에서 다시 묶을 순서를 확인하세요.',
  // 재점검
  firstStop: '출발 뒤 첫 정차입니다. 바가 느슨하지 않은지 확인하세요.',
  recheckKm: (km: number) => `${km}킬로미터를 달렸습니다. 바를 확인하세요.`,
  unloadFirst: '짐을 일부 내렸습니다. 남은 짐의 바를 다시 확인하세요.',
  // 경유지
  waypointAdded: (name: string) => `${name}를 경유지로 넣었습니다.`,
  waypointNone: '앞쪽에 넣을 쉼터가 없습니다. 안전한 곳에 세우고 확인하세요.',
} as const

/** 신고 전화 (정차 화면) */
export const REPORT_PHONES = [
  { road: '고속도로', label: '한국도로공사', phone: '1588-2504' },
  { road: '일반 도로', label: '경찰', phone: '112' },
] as const
