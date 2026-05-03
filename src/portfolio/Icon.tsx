import type { ReactNode } from "react";

export type IconName =
  | "folder"
  | "person"
  | "brain"
  | "wrench"
  | "pencil"
  | "lock"
  | "document"
  | "envelope"
  | "gear"
  | "house"
  | "leaf";

// Solid 24×24 minimalist glyphs. Filled with currentColor so each
// icon inherits the local text color (.pwin-icon, .di-ico, etc).
const ICON_PATHS: Record<IconName, ReactNode> = {
  folder: <path d="M3 8a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  person: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6z" />
  ),
  brain: (
    <path d="M9 4a4 4 0 0 0-3.74 5.42A4 4 0 0 0 6 17a4 4 0 0 0 6-1.5V4.5A.5.5 0 0 0 11.5 4zM15 4a.5.5 0 0 0-.5.5v11A4 4 0 0 0 18 17a4 4 0 0 0 .74-7.58A4 4 0 0 0 15 4z" />
  ),
  wrench: (
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a2 2 0 0 0 2.83 2.83l6-6a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.83-2.82z" />
  ),
  pencil: (
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0L15.13 5.12l3.75 3.75z" />
  ),
  lock: (
    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z" />
  ),
  document: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 7V3.5L19.5 9z" />
  ),
  envelope: (
    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z" />
  ),
  // fill-rule: evenodd is set on the svg root so the inner circle of
  // the gear cuts out instead of filling.
  gear: (
    <path d="M19.14 12.94c.04-.31.06-.62.06-.94 0-.32-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.5.5 0 0 0 13.92 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.71 8.48a.5.5 0 0 0 .12.61l2.03 1.58c-.04.31-.06.62-.06.94 0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32a.5.5 0 0 0 .59.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96a.5.5 0 0 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
  ),
  house: <path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z" />,
  leaf: (
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C20 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
  ),
};

interface IconProps {
  name: IconName;
  size?: number | string;
  className?: string;
}

export function Icon({ name, size = "1em", className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
