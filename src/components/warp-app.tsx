import { useCallback, useEffect, useRef, useState } from "react";
import { Root, Track, Range, Thumb } from "@radix-ui/react-slider";
import { Volume2, VolumeX } from "lucide-react";
import {
  createWarpEngine,
  targetStarCount,
  type WarpSettings,
} from "@/starfield/engine";

const STORAGE_KEY = "deriva-settings-v1";

const DEFAULTS: WarpSettings = {
  speed: 0.48,
  density: 0.62,
  trail: 0.58,
  sound: true,
  phrase: "",
};

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function loadSettings(): WarpSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<WarpSettings>;
    return {
      speed: clamp01(typeof parsed.speed === "number" ? parsed.speed : DEFAULTS.speed),
      density: clamp01(typeof parsed.density === "number" ? parsed.density : DEFAULTS.density),
      trail: clamp01(typeof parsed.trail === "number" ? parsed.trail : DEFAULTS.trail),
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULTS.sound,
      phrase: "",
    };
  } catch {
    return DEFAULTS;
  }
}

function formatCount(density: number, compact: boolean) {
  const count = targetStarCount(density, compact);
  if (count >= 1000) {
    const scaled = count / 1000;
    const text = (scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(".", ",");
    return `${text}k`;
  }
  return String(count);
}

export function WarpApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const boostBtnRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef(false);
  const [speed, setSpeed] = useState(DEFAULTS.speed);
  const [density, setDensity] = useState(DEFAULTS.density);
  const [trail, setTrail] = useState(DEFAULTS.trail);
  const [sound, setSound] = useState(DEFAULTS.sound);
  const [phrase, setPhrase] = useState("");
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const settingsRef = useRef<WarpSettings>(DEFAULTS);
  settingsRef.current = { speed, density, trail, sound, phrase };
  const closeTimer = useRef<number | 0>(0);
  const hovering = useRef(false);

  const armClose = useCallback((delay = 4600) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!hovering.current) setOpen(false);
    }, delay);
  }, []);

  useEffect(() => {
    const saved = loadSettings();
    setSpeed(saved.speed);
    setDensity(saved.density);
    setTrail(saved.trail);
    setSound(saved.sound);
    setHydrated(true);
    const mq = window.matchMedia("(max-width: 800px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.clearTimeout(closeTimer.current);
    };
  }, [armClose]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ speed, density, trail, sound }));
    } catch {
      /* ignore quota */
    }
  }, [hydrated, speed, density, trail, sound]);

  const onSpeedDelta = useCallback((delta: number) => {
    setSpeed((value) => clamp01(value + delta));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const engine = createWarpEngine(canvas, {
        settings: settingsRef,
        boost: boostRef,
        readout: readoutRef,
        status: statusRef,
        boostButton: boostBtnRef,
        stage: stageRef,
        onSpeedDelta,
      });
      return () => engine.destroy();
    } catch (error) {
      setGlError(error instanceof Error ? error.message : "No se pudo iniciar el campo de estrellas");
      return;
    }
  }, [onSpeedDelta]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const holdBoost = (held: boolean) => {
    boostRef.current = held;
  };

  return (
    <main className="warp-root">
      <canvas
        ref={canvasRef}
        className="warp-canvas"
        aria-label="Campo de estrellas. El texto escrito se dibuja con estrellas."
      />
      {glError ? <p className="warp-fallback">{glError}</p> : null}
      <div className="warp-stage-slot">
        <div ref={stageRef} className="warp-stage" data-live={phrase.trim() ? "1" : "0"} />
      </div>
      <header className="warp-top" data-ui>
        <div className="warp-brand">
          <h1 className="warp-mark">Deriva</h1>
          <p className="warp-status" ref={statusRef}>
            crucero
          </p>
        </div>
        <button
          type="button"
          className="warp-icon-btn"
          data-on={sound ? "1" : "0"}
          aria-pressed={sound}
          aria-label={sound ? "Silenciar" : "Activar sonido"}
          onClick={() => setSound((value) => !value)}
        >
          {sound ? <Volume2 size={18} strokeWidth={1.75} /> : <VolumeX size={18} strokeWidth={1.75} />}
        </button>
      </header>
      <div
        className={open ? "warp-dock is-open" : "warp-dock"}
        onPointerEnter={() => {
          hovering.current = true;
          window.clearTimeout(closeTimer.current);
        }}
        onPointerLeave={() => {
          hovering.current = false;
          if (open) armClose();
        }}
      >
        <button
          type="button"
          className="warp-handle"
          onClick={() => {
            setOpen(true);
            armClose(7200);
          }}
        >
          Controles
        </button>
        <section className="warp-panel" data-ui aria-label="Controles de vuelo">
          <div className="warp-panel-head">
            <p className="warp-panel-label">Vuelo</p>
            <button
              type="button"
              className="warp-text-btn"
              onClick={() => setOpen(false)}
            >
              Ocultar
            </button>
          </div>
          <div className="warp-row">
            <span className="warp-row-label" id="label-speed">
              Velocidad
            </span>
            <Root
              className="warp-slider"
              min={0}
              max={1}
              step={0.001}
              value={[speed]}
              onValueChange={(value) => setSpeed(clamp01(value[0] ?? 0))}
              aria-labelledby="label-speed"
            >
              <Track className="warp-slider-track">
                <Range className="warp-slider-range" />
              </Track>
              <Thumb className="warp-slider-thumb" />
            </Root>
            <span className="warp-value" ref={readoutRef}>
              ×1.0
            </span>
          </div>
          <div className="warp-row">
            <span className="warp-row-label" id="label-density">
              Densidad
            </span>
            <Root
              className="warp-slider"
              min={0}
              max={1}
              step={0.001}
              value={[density]}
              onValueChange={(value) => setDensity(clamp01(value[0] ?? 0))}
              aria-labelledby="label-density"
            >
              <Track className="warp-slider-track">
                <Range className="warp-slider-range" />
              </Track>
              <Thumb className="warp-slider-thumb" />
            </Root>
            <span className="warp-value">{formatCount(density, compact)}</span>
          </div>
          <div className="warp-row">
            <span className="warp-row-label" id="label-trail">
              Estela
            </span>
            <Root
              className="warp-slider"
              min={0}
              max={1}
              step={0.001}
              value={[trail]}
              onValueChange={(value) => setTrail(clamp01(value[0] ?? 0))}
              aria-labelledby="label-trail"
            >
              <Track className="warp-slider-track">
                <Range className="warp-slider-range" />
              </Track>
              <Thumb className="warp-slider-thumb" />
            </Root>
            <span className="warp-value">{Math.round(trail * 100)}</span>
          </div>
          <button
            ref={boostBtnRef}
            type="button"
            className="warp-boost"
            aria-pressed="false"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              holdBoost(true);
            }}
            onPointerUp={() => holdBoost(false)}
            onPointerCancel={() => holdBoost(false)}
            onLostPointerCapture={() => holdBoost(false)}
          >
            Impulso
          </button>
          <p className="warp-hint">
            El puntero o las flechas dirigen el vuelo cuando el texto está vacío. Espacio o Impulso
            aceleran. La rueda cambia la velocidad.
          </p>
        </section>
      </div>
      <form className="warp-composer" data-ui onSubmit={(event) => event.preventDefault()}>
        <label className="warp-composer-label" htmlFor="frase">
          Escribe
        </label>
        <input
          id="frase"
          className="warp-composer-input"
          value={phrase}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Escribe y mira el recuadro"
          aria-label="Texto que forman las estrellas"
          onChange={(event) => setPhrase(event.target.value.slice(0, 80))}
        />
      </form>
    </main>
  );
}
