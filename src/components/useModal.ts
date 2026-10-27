"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every dialog here needs to work from the keyboard: focus moves into it
 * when it opens, Tab stays inside it, Escape closes it (when it can be
 * closed), and focus goes back to whatever opened it afterwards.
 */
export function useModal(
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
  /** For dialogs that are not always on screen: bind only while shown. */
  active = true
) {
  useEffect(() => {
    const box = ref.current;
    if (!active || !box) return;
    const opener = document.activeElement as HTMLElement | null;
    // An element that already asked for focus (autoFocus) keeps it.
    if (!box.contains(document.activeElement)) {
      const first = box.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? box).focus();
    }

    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    box.addEventListener("keydown", key);
    return () => {
      box.removeEventListener("keydown", key);
      if (opener && document.contains(opener)) opener.focus();
    };
    // Bound once per opening; onClose may change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, active]);
}
