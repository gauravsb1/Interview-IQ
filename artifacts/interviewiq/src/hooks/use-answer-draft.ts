import { useCallback, useEffect, useRef, useState } from "react";

/** Tab-scoped text recovery; no recording bytes or credentials are saved. */
export function useAnswerDraft(key?: string) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const latest = useRef("");

  useEffect(() => {
    let saved = "";
    try {
      saved = key ? sessionStorage.getItem(key) ?? "" : "";
      setNotice(saved ? "Your unsent answer was restored from this browser tab." : "");
    } catch {
      setNotice("Draft recovery is unavailable in this browser. Keep this page open until you submit.");
    }
    latest.current = saved;
    setText(saved);
  }, [key]);

  const update = useCallback((value: string | ((previous: string) => string)) => {
    const next = typeof value === "function" ? value(latest.current) : value;
    latest.current = next;
    setText(next);
    try {
      if (key) {
        if (next) sessionStorage.setItem(key, next);
        else sessionStorage.removeItem(key);
      }
    } catch {
      setNotice("Draft recovery is unavailable in this browser. Keep this page open until you submit.");
    }
  }, [key]);

  const clear = useCallback(() => update(""), [update]);
  return { text, update, clear, notice };
}
