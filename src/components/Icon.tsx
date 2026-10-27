/**
 * Small line icons, drawn in the text colour. They replace the emoji and
 * Unicode glyphs the menu used to carry, which looked different on every
 * phone and could not take the look's colours.
 */
export type IconName =
  | "menu"
  | "close"
  | "home"
  | "computer"
  | "friends"
  | "record"
  | "medal"
  | "check"
  | "book"
  | "trophy"
  | "tile"
  | "swap"
  | "lock"
  | "back"
  | "crown"
  | "buoy"
  | "flag"
  | "spark"
  | "target"
  | "robot"
  | "pair"
  | "wind"
  | "flame"
  | "hands"
  | "diamond";

const PATHS: Record<IconName, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  computer: "M4 5h16v11H4zM9 20h6M12 16v4",
  friends: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.5M18 14c1.8.8 3 2.4 3 4.5",
  record: "M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.3 6.6 19.3l1.3-6L3.4 9.2l6-.6z",
  medal: "M8 3h8l-2 6h-4zM12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  book: "M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0zM20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6",
  tile: "M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM6 12h12M12 7.5h.01M12 15.5h.01",
  swap: "M5 8h13l-3-3M19 16H6l3 3",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  back: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10",
  crown: "M4 8l4 4 4-7 4 7 4-4-2 11H6z",
  buoy: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  robot: "M6 8h12v11H6zM12 4v4M9.5 13h.01M14.5 13h.01M9 16.5h6M3 12v3M21 12v3",
  pair: "M7 4h4v9H7zM13 11h4v9h-4zM7 8.5h4M13 15.5h4",
  wind: "M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8",
  flame: "M12 21c4 0 6-3 6-6 0-4-3-6-4-10-1 3-3 4-3 6-1-1-2-2-2-3-2 2-3 4-3 7 0 3 2 6 6 6z",
  hands: "M3 12l4-4 4 2 3-2 7 5M7 8l-4 8 3 2M21 13l-6 6-3-2M12 17l-3-2M14.5 15.5l-3-2",
  diamond: "M12 3l8 9-8 9-8-9z",
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
