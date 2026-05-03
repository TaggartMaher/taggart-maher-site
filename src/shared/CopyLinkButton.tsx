import { useEffect, useRef, useState } from "react";

interface CopyLinkButtonProps {
  // Override the visible idle/copied label. Defaults are "Copy link" /
  // "Copied".
  label?: string;
  copiedLabel?: string;
  className?: string;
}

const COPY_FEEDBACK_DURATION_MS = 2000;

export function CopyLinkButton({
  label = "Copy link",
  copiedLabel = "Copied",
  className,
}: CopyLinkButtonProps) {
  const [showCopiedFeedback, setShowCopiedFeedback] = useState(false);
  const revertTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current !== null) {
        window.clearTimeout(revertTimeoutRef.current);
      }
    };
  }, []);

  async function handleClick(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      console.warn("[copy-link] clipboard API unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShowCopiedFeedback(true);
      if (revertTimeoutRef.current !== null) {
        window.clearTimeout(revertTimeoutRef.current);
      }
      revertTimeoutRef.current = window.setTimeout(() => {
        setShowCopiedFeedback(false);
        revertTimeoutRef.current = null;
      }, COPY_FEEDBACK_DURATION_MS);
    } catch (error) {
      console.warn("[copy-link] clipboard write failed:", error);
    }
  }

  return (
    <button
      type="button"
      className={"copy-link-button" + (className ? " " + className : "")}
      onClick={handleClick}
    >
      <span aria-live="polite">{showCopiedFeedback ? copiedLabel : label}</span>
    </button>
  );
}
