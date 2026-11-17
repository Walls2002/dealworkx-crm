"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

// A tiny toast: one message at a time, bottom right, gone after a few seconds.
const listeners = new Set<(m: string) => void>();
export function toast(message: string) {
  listeners.forEach((l) => l(message));
}

export function Toaster() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const on = (m: string) => setMessage(m);
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50">
      {message && (
        <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          <CircleCheck className="size-4 text-green-600" aria-hidden />
          {message}
        </div>
      )}
    </div>
  );
}
