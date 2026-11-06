const paths = {
  search: "M21 21l-6-6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  messages: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  play: "m9 5 11 7-11 7Z",
  heart:
    "M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z",
  comment: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-4a8.5 8.5 0 1 1 16-4.5Z",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  share: "m14 3 7 7-7 7v-5C7 12 4 15 3 20c-1-9 3-14 11-14Z",
  user: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  plus: "M12 4v16M4 12h16",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M9 15v6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
  more: "M5 11v2M12 11v2M19 11v2",
  volume: "M4 9h4l5-5v16l-5-5H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14",
  muted: "M4 9h4l5-5v16l-5-5H4ZM17 9l5 6M22 9l-5 6",
  pause: "M8 5v14M16 5v14",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
