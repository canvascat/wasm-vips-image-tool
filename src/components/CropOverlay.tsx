import { useRef, type PointerEvent as ReactPointerEvent } from "react";

export type CropBox = { x: number; y: number; width: number; height: number };

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

type CropOverlayProps = {
  imageUrl: string;
  width: number;
  height: number;
  crop: CropBox;
  onChange: (crop: CropBox) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function CropOverlay({ imageUrl, width, height, crop, onChange }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    clientX: number;
    clientY: number;
    crop: CropBox;
  } | null>(null);

  const toPercent = (value: number, total: number) => `${(value / total) * 100}%`;

  const onPointerDown = (event: ReactPointerEvent, mode: DragMode) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      crop: { ...crop },
    };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = ((event.clientX - drag.clientX) * width) / rect.width;
    const dy = ((event.clientY - drag.clientY) * height) / rect.height;
    const start = drag.crop;
    const minSize = 24;

    if (drag.mode === "move") {
      onChange({
        ...start,
        x: clamp(start.x + dx, 0, width - start.width),
        y: clamp(start.y + dy, 0, height - start.height),
      });
      return;
    }

    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;
    if (drag.mode.includes("w")) left = clamp(start.x + dx, 0, right - minSize);
    if (drag.mode.includes("e")) right = clamp(start.x + start.width + dx, left + minSize, width);
    if (drag.mode.includes("n")) top = clamp(start.y + dy, 0, bottom - minSize);
    if (drag.mode.includes("s")) bottom = clamp(start.y + start.height + dy, top + minSize, height);
    onChange({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const handles: { mode: DragMode; className: string }[] = [
    { mode: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
    { mode: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
    { mode: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { mode: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
  ];

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full overflow-hidden rounded-lg bg-muted/30"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img src={imageUrl} alt="预览" className="h-full w-full object-contain" />
      <div
        className="absolute border-2 border-primary bg-primary/10"
        style={{
          left: toPercent(crop.x, width),
          top: toPercent(crop.y, height),
          width: toPercent(crop.width, width),
          height: toPercent(crop.height, height),
        }}
        onPointerDown={(event) => onPointerDown(event, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {handles.map((handle) => (
          <span
            key={handle.mode}
            className={`absolute h-3 w-3 rounded-sm border border-primary bg-background ${handle.className}`}
            onPointerDown={(event) => onPointerDown(event, handle.mode)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ))}
      </div>
    </div>
  );
}
