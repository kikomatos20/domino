// Renders a single domino tile with proper pip layouts.

const PIP_LAYOUT: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Rotate a 3x3 pip pattern 90°. Pips are painted on the tile face, so when the
 * tile lies on its side the pattern turns with it (a horizontal six reads as
 * 3 columns x 2 rows, not 2 columns x 3 rows).
 */
function rotate90(pips: number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (pips.includes((2 - c) * 3 + r)) out.push(r * 3 + c);
    }
  }
  return out;
}

function Half({ value, rotated }: { value: number; rotated: boolean }) {
  const base = PIP_LAYOUT[value] ?? [];
  const pips = rotated ? rotate90(base) : base;
  return (
    <div className="half">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={pips.includes(i) ? "pip" : "pip empty"} />
      ))}
    </div>
  );
}

export interface DominoTileProps {
  left: number;
  right: number;
  vertical?: boolean;
  back?: boolean;
  small?: boolean;
  highlight?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function DominoTile({
  left,
  right,
  vertical = false,
  back = false,
  small = false,
  highlight = false,
  dimmed = false,
  onClick,
  onPointerDown,
  className = "",
  style,
}: DominoTileProps) {
  const cls = [
    "tile",
    vertical ? "vertical" : "horizontal",
    back ? "back" : "",
    small ? "small" : "",
    highlight ? "highlight" : "",
    dimmed ? "dimmed" : "",
    onClick ? "clickable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
      role={onClick || onPointerDown ? "button" : undefined}
    >
      {!back && (
        <>
          <Half value={left} rotated={!vertical} />
          <div className="divider" />
          <Half value={right} rotated={!vertical} />
        </>
      )}
    </div>
  );
}
