"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** useState that survives the component unmounting (studio tab switch) and page reloads within
 *  the same browser tab, via sessionStorage. Client-only: the component must not be server
 *  rendered (load it with next/dynamic { ssr: false }), or the first render would not match.
 *  Storage failures (quota, private mode) silently fall back to plain in-memory state. */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value === undefined) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded or storage blocked: keep working without persistence
    }
  }, [key, value]);

  return [value, setValue];
}
