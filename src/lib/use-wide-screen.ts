"use client";
import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  const q = matchMedia("(min-width: 768px)");
  q.addEventListener("change", notify);
  return () => q.removeEventListener("change", notify);
};
export function useWideScreen() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}
