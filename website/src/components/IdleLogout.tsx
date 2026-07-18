"use client";

import { useEffect, useRef } from "react";

/**
 * Signs the user out after a period of no interaction (default 30 min). Any
 * mouse/keyboard/touch/scroll activity resets the timer. Rendered only for
 * signed-in users; the server session also enforces the same 30-minute limit.
 */
export default function IdleLogout({
  action,
  timeoutMs = 30 * 60 * 1000,
}: {
  action: () => Promise<void>;
  timeoutMs?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Submit the hidden logout form (server action → signOut + redirect).
        formRef.current?.requestSubmit();
      }, timeoutMs);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);

  return <form ref={formRef} action={action} className="hidden" aria-hidden />;
}
