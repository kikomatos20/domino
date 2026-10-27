/**
 * Small line icons, drawn in the text colour. They replace the emoji and
 * Unicode glyphs the menu used to carry, which looked different on every
 * phone and could not take the look's colours.
 */
export type IconName = "menu" | "close" | "home" | "computer" | "friends" | "record" | "medal" | "check";

const PATHS: Record<IconName, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  computer: "M4 5h16v11H4zM9 20h6M12 16v4",
  friends: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.5M18 14c1.8.8 3 2.4 3 4.5",
  record: "M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.3 6.6 19.3l1.3-6L3.4 9.2l6-.6z",
  medal: "M8 3h8l-2 6h-4zM12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
