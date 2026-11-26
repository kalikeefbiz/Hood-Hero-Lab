import { useEffect, useRef, type PointerEvent } from "react";

const keys: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowdown: [0, 1], s: [0, 1],
  arrowright: [1, 0], d: [1, 0],
};

export function StreetControls({
  label, prompt, blocked, move, interact,
}: {
  label?: string;
  prompt: string;
  blocked: boolean;
  move: (x: number, z: number) => void;
  interact: () => void;
}) {
  const pointer = useRef<number | null>(null);
  const stick = useRef<HTMLDivElement>(null);
  const handlers = useRef({ move, interact });
  handlers.current = { move, interact };

  useEffect(() => {
    const held = new Set<string>();
    function update() {
      let x = 0, z = 0;
      for (const key of held) {
        x += keys[key][0];
        z += keys[key][1];
      }
      const scale = Math.max(1, Math.hypot(x, z));
      handlers.current.move(x / scale, z / scale);
    }
    function reset() {
      held.clear();
      pointer.current = null;
      if (stick.current) stick.current.style.transform = "";
      update();
    }
    function down(e: KeyboardEvent) {
      if (blocked || e.altKey || e.ctrlKey || e.metaKey ||
        (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]"))) return;
      const key = e.key.toLowerCase();
      if (key === "e" && !e.repeat) handlers.current.interact();
      if (!Object.hasOwn(keys, key)) return;
      e.preventDefault();
      held.add(key);
      update();
    }
    function up(e: KeyboardEvent) {
      if (held.delete(e.key.toLowerCase())) update();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      reset();
    };
  }, [blocked]);

  function drag(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const z = e.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, z);
    const scale = Math.max(31, length);
    const dx = length < 5 ? 0 : x / scale;
    const dz = length < 5 ? 0 : z / scale;
    if (stick.current) stick.current.style.transform = `translate(${dx * 31}px, ${dz * 31}px)`;
    move(dx, dz);
  }

  function release(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    if (stick.current) stick.current.style.transform = "";
    move(0, 0);
  }

  return (
    <div className="reservoir-controls" hidden={blocked}>
      <p className="reservoir-prompt" role="status">{prompt}</p>
      <div className="reservoir-joystick" aria-label="Drag to walk"
        onPointerDown={(e) => {
          if (pointer.current !== null) return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span>MOVE</span>
        <div ref={stick} />
      </div>
      {label && <button className="reservoir-interact" onClick={interact}>{label}</button>}
    </div>
  );
}
