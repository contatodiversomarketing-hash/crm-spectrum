import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * WhatsApp-like scroll: only follows new messages when the user is already at the bottom.
 * `resetKey` (e.g. conversation id) jumps to the bottom when it changes.
 */
export function useChatScroll(contentKey: unknown, resetKey: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const toBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottomRef.current = true;
    setShowJump(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useLayoutEffect(() => {
    atBottomRef.current = true;
    toBottom();
  }, [resetKey, toBottom]);

  useEffect(() => {
    if (atBottomRef.current) toBottom();
  }, [contentKey, toBottom]);

  return { ref, onScroll, showJump, toBottom };
}
