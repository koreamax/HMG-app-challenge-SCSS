/** 아주 작은 전역 상태 (useSyncExternalStore). 화면은 useApp(선택자) 로 필요한 것만 읽는다 */
import { useSyncExternalStore } from 'react'

export type Store<T> = {
  get: () => T
  set: (patch: Partial<T> | ((s: T) => Partial<T>)) => void
  subscribe: (fn: () => void) => () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...p }
      for (const fn of subs) fn()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function useStore<T extends object, S>(store: Store<T>, pick: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()), () => pick(store.get()))
}
