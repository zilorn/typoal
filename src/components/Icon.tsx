import type { JSX } from "solid-js";

type Name =
  | "arrow"
  | "arrow-up"
  | "book"
  | "search"
  | "sun"
  | "moon"
  | "menu"
  | "close"
  | "plus"
  | "edit"
  | "trash"
  | "logout"
  | "check"
  | "rss"
  | "chevron"
  | "clock"
  | "pen"
  | "leaf"
  | "code"
  | "copy"
  | "eye"
  | "save"
  | "back"
  | "lock";
const paths: Record<Name, () => JSX.Element> = {
  arrow: () => (
    <>
      <path d="M4 12h15M13 5l7 7-7 7" />
    </>
  ),
  "arrow-up": () => (
    <>
      <path d="M6 18 18 6M6 6h12v12" />
    </>
  ),
  book: () => (
    <>
      <path d="M4 4h9c4 0 7 2 7 6v10h-9c-4 0-7-2-7-6V4ZM10 4v16M14 9h3M14 13h3" />
    </>
  ),
  search: () => (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  sun: () => (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
    </>
  ),
  moon: () => <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
  menu: () => <path d="M4 6h16M4 12h16M4 18h16" />,
  close: () => <path d="m6 6 12 12M6 18 18 6" />,
  plus: () => <path d="M12 5v14M5 12h14" />,
  edit: () => (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
    </>
  ),
  trash: () => (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  logout: () => (
    <>
      <path d="M9 4H4v16h5M9 12h12M16 7l5 5-5 5" />
    </>
  ),
  check: () => <path d="m5 12 4 4L19 6" />,
  rss: () => (
    <>
      <path d="M5 4a15 15 0 0 1 15 15M5 10a9 9 0 0 1 9 9" />
      <circle cx="5" cy="19" r="1" />
    </>
  ),
  chevron: () => <path d="m8 4 8 8-8 8" />,
  clock: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pen: () => (
    <>
      <path d="m12 19 8-15-9 6-2 7 3 2ZM11 10l4 3M3 21h14" />
      <circle cx="12" cy="14" r="1" />
    </>
  ),
  leaf: () => (
    <>
      <path d="M19 3C5 2 2 12 6 17s14 1 13-14ZM5 20l10-12" />
    </>
  ),
  code: () => (
    <>
      <path d="m7 6-6 6 6 6M17 6l6 6-6 6M14 3l-4 18" />
    </>
  ),
  copy: () => (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M15 8V3H3v13h5" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  save: () => (
    <>
      <path d="M4 3h13l4 4v14H4V3ZM8 3v6h8V3M8 21v-8h9v8" />
    </>
  ),
  back: () => (
    <>
      <path d="M20 12H4M10 5l-7 7 7 7" />
    </>
  ),
  lock: () => (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
    </>
  ),
};

export default function Icon(props: {
  name: Name;
  size?: number;
  class?: string;
}) {
  return (
    <svg
      width={props.size || 20}
      height={props.size || 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
    >
      {paths[props.name]()}
    </svg>
  );
}
