import React from "react";
import { interpolate, random, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type DiffusionDenoisePhase =
  | "noise"
  | "denoise"
  | "glass"
  | "latent"
  | "ddim"
  | "prompt";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: DiffusionDenoisePhase;
  prompt?: string;
  step?: number;
  stepsTotal?: number;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

const phaseTitle: Record<DiffusionDenoisePhase, string> = {
  noise: "ШУМ · x_T ~ N(0, I)",
  denoise: "РАСШУМЛЕНИЕ · ε̂ → ВЫЧЕСТЬ",
  prompt: "ТЕКСТ → CROSS-ATTENTION → UNet",
  glass: "БЫТОВОЙ АНАЛОГ · ГРЯЗЬ СО СТЕКЛА",
  latent: "LATENT 64×64 · В 8 РАЗ КОМПАКТНЕЕ",
  ddim: "DDPM 1000 → DDIM 50 · ТОТ ЖЕ UNet",
};

// 16×16 noise cells
const NoiseGrid: React.FC<{ local: number; size: number; seed: number; alpha?: number; tint?: string; opacity?: number }> = ({
  local,
  size,
  seed,
  alpha = 1,
  tint,
  opacity = 1,
}) => {
  const cell = Math.round(size / 16);
  const drift = local * 0.3;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexWrap: "wrap",
        overflow: "hidden",
        borderRadius: 18,
        opacity,
        filter: tint ? `drop-shadow(0 0 10px ${tint}33)` : undefined,
      }}
    >
      {Array.from({ length: 256 }).map((_, i) => {
        const r = random(`noise-${seed}-${i}`);
        const g = Math.round(90 + r * 110);
        // subtle flicker
        const flicker = Math.sin((local + i) * 0.7) * 8;
        const v = Math.min(255, Math.max(0, g + flicker));
        const bg = tint && r > 0.72 ? tint : `rgb(${v},${v},${v})`;
        return (
          <div
            key={i}
            style={{
              width: cell,
              height: cell,
              background: bg,
              opacity: 0.55 + r * 0.45 * alpha,
              // tiny scale jitter to feel noisy
              transform: `scale(${0.92 + random(`s-${seed}-${i}-2`) * 0.16})`,
            }}
          />
        );
      })}
    </div>
  );
};

const PortraitSilhouette: React.FC<{ reveal: number; blur?: number }> = ({ reveal, blur = 0 }) => {
  // reveal 0..1 controls opacity and blur
  const opacity = 0.15 + reveal * 0.85;
  const b = (1 - reveal) * 12 + blur;
  return (
    <div
      style={{
        width: 280,
        height: 360,
        borderRadius: 24,
        overflow: "hidden",
        background: `linear-gradient(180deg, #FFE8D0 0%, #FFD0A8 55%, #C9A080 100%)`,
        border: `3px solid ${theme.panelBorder}`,
        opacity,
        filter: `blur(${b}px) saturate(${0.6 + reveal * 0.4})`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 30px ${theme.accent}18`,
        position: "relative",
      }}
    >
      {/* simple face: ellipse head + eyes + soft light */}
      <div
        style={{
          position: "absolute",
          left: 50,
          top: 34,
          width: 180,
          height: 220,
          borderRadius: "50% / 58%",
          background: `radial-gradient(ellipse at 38% 28%, #FFF6E8 0%, #FFD8B0 32%, #E8B48A 68%, #C48A66 100%)`,
          boxShadow: `inset 0 0 40px rgba(180,90,40,0.25)`,
        }}
      />
      {/* eyes closed soft */}
      <div style={{ position: "absolute", left: 88, top: 118, width: 32, height: 8, borderRadius: 8, background: "#8A5A3A", opacity: 0.55 }} />
      <div style={{ position: "absolute", left: 160, top: 118, width: 32, height: 8, borderRadius: 8, background: "#8A5A3A", opacity: 0.55 }} />
      {/* mouth soft */}
      <div style={{ position: "absolute", left: 118, top: 172, width: 44, height: 14, borderRadius: 14, background: "#B46A52", opacity: 0.6 }} />
      {/* soft light spot top */}
      <div
        style={{
          position: "absolute",
          left: 42,
          top: 18,
          width: 110,
          height: 90,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, transparent 72%)`,
        }}
      />
      {/* hair silhouette */}
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 12,
          width: 232,
          height: 170,
          borderRadius: "50% / 55%",
          background: `linear-gradient(180deg, #2A1A10 0%, #4A2A18 70%, transparent 100%)`,
          opacity: 0.42,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 82,
          background: `linear-gradient(180deg, transparent, #1A120A 85%)`,
          opacity: 0.35,
        }}
      />
    </div>
  );
};

export const DiffusionDenoiseVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "denoise",
  prompt = "портрет в мягком свете",
  step,
  stepsTotal,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const hitP = hit ? reveal : 0;

  const header = (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 280,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: theme.subtext,
        fontSize: 25,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name="sparkles" size={30} color={theme.accent} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  if (phase === "noise") {
    const shimmer = interpolate(local, [0, 90], [0, 1], { extrapolateRight: "clamp" });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
        {header}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 345,
            transform: `translateX(-50%) scale(${0.88 + enter * 0.12})`,
            opacity: enter,
          }}
        >
          <div
            style={{
              borderRadius: 28,
              padding: 16,
              background: `${theme.panel}F2`,
              border: `3px solid ${theme.panelBorder}`,
              boxShadow: `0 18px 60px rgba(0,0,0,0.45), 0 0 32px ${theme.accent}14`,
            }}
          >
            <NoiseGrid local={local} size={420} seed={1} />
          </div>
          <div style={{ marginTop: 18, textAlign: "center", ...mono, fontSize: 22, color: theme.subtext, letterSpacing: 3 }}>
            СЕРЫЙ ШУМ · 512×512 · x_T
          </div>
        </div>

        {/* faint portrait hidden underneath noise - reveal after impact */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 360,
            transform: "translateX(-50%)",
            opacity: hitP * 0.22,
            filter: `blur(${(1 - hitP) * 18}px)`,
          }}
        >
          <PortraitSilhouette reveal={hitP} />
        </div>
        {/* overlay noise fading slightly on hit */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 360,
            transform: "translateX(-50%)",
            opacity: 1 - hitP * 0.55,
          }}
        >
          <div style={{ borderRadius: 28, overflow: "hidden", width: 452, height: 452, pointerEvents: "none" }}>
            <NoiseGrid local={local + 100} size={452} seed={99} alpha={0.95} />
          </div>
        </div>

        {/* badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 985,
            transform: `translateX(-50%) scale(${0.9 + hitP * 0.1})`,
            padding: "16px 30px",
            borderRadius: 999,
            background: `${theme.accent}14`,
            border: `2px solid ${theme.accent}88`,
            color: theme.accent,
            ...mono,
            fontSize: 26,
            opacity: 0.25 + hitP * 0.75,
            whiteSpace: "nowrap",
            boxShadow: hit ? `0 0 28px ${theme.accent}22` : "none",
          }}
        >
          ШУМ ~ N(0, I) · ЛИЦА ЕЩЁ НЕТ
        </div>
        {/* timeline hint */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1072,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: theme.subtext,
            ...mono,
            fontSize: 20,
            opacity: enter * 0.9,
          }}
        >
          <span style={{ color: theme.accent2 }}>T</span>
          <span>—</span>
          <span style={{ color: theme.accent }}>T-1</span>
          <span>—</span>
          <span> … </span>
          <span>—</span>
          <span style={{ color: theme.success }}>0 ПОРТРЕТ</span>
        </div>
        {hit ? <PulseRing x={W / 2} y={575} triggerFrame={impactLocal} tone="accent" size={280} /> : null}
      </div>
    );
  }

  if (phase === "denoise") {
    // central denoise triple: x_t noisy + epsilon + x_{t-1}
    const denoiseP = hit ? hitP : 0;
    const cleanedReveal = 0.22 + denoiseP * 0.78;
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
        {header}
        {/* x_t */}
        <div
          style={{
            position: "absolute",
            left: 62,
            top: 365,
            width: 310,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 22}px)`,
          }}
        >
          <div
            style={{
              borderRadius: 22,
              overflow: "hidden",
              border: `3px solid ${theme.accent}55`,
              background: theme.panel,
              padding: 10,
              boxShadow: `0 0 28px ${theme.accent}14`,
            }}
          >
            <div style={{ position: "relative", width: 286, height: 286, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, opacity: 0.94 }}>
                <NoiseGrid local={local} size={286} seed={10} />
              </div>
              <div style={{ position: "absolute", inset: 0, opacity: 0.42 * cleanedReveal + 0.08 }}>
                <PortraitSilhouette reveal={0.4 * cleanedReveal} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: "center", ...mono, fontSize: 19, color: theme.accent }}>x_t · ШУМНО</div>
          <div style={{ textAlign: "center", ...mono, fontSize: 16, color: theme.subtext }}>ШАГ {step ?? 742} / {stepsTotal ?? 1000}</div>
        </div>

        {/* minus arrow */}
        <div
          style={{
            position: "absolute",
            left: 390,
            top: 510,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: enter,
            color: theme.warning,
            ...mono,
            fontSize: 20,
          }}
        >
          <span style={{ fontSize: 38, lineHeight: 1 }}>-</span>
          <span style={{ fontSize: 13, color: theme.subtext }}>ВЫЧЕСТЬ</span>
        </div>

        {/* UNet epsilon */}
        <div
          style={{
            position: "absolute",
            left: 430,
            top: 365,
            width: 220,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 22}px)`,
          }}
        >
          <div
            style={{
              borderRadius: 22,
              background: `${theme.panel}F2`,
              border: `3px solid ${theme.warning}88`,
              padding: "14px 12px 12px",
              textAlign: "center",
              boxShadow: `0 0 32px ${theme.warning}18`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: theme.warning, ...mono, fontSize: 18 }}>
              <IconGlyph name="cpu" size={22} color={theme.warning} strokeWidth={1.8} />
              UNet
            </div>
            <div style={{ marginTop: 10, borderRadius: 14, overflow: "hidden", border: `2px solid ${theme.warning}44` }}>
              <NoiseGrid local={local + 30} size={192} seed={77} tint={theme.warning} opacity={0.9} />
            </div>
            <div style={{ marginTop: 8, ...mono, fontSize: 17, color: theme.warning }}>ε̂ — ПРЕДСКАЗАННЫЙ ШУМ</div>
          </div>
          <div style={{ textAlign: "center", marginTop: 10, color: theme.subtext, ...mono, fontSize: 14 }}>
            x_t + текст → ε̂
          </div>
        </div>

        {/* equals arrow */}
        <div
          style={{
            position: "absolute",
            left: 672,
            top: 510,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: enter,
            color: theme.success,
            ...mono,
            fontSize: 20,
          }}
        >
          <span style={{ fontSize: 38, lineHeight: 1 }}>=</span>
          <span style={{ fontSize: 13, color: theme.subtext }}>ЧИЩЕ</span>
        </div>

        {/* x_{t-1} */}
        <div
          style={{
            position: "absolute",
            left: 708,
            top: 365,
            width: 310,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 22}px)`,
          }}
        >
          <div
            style={{
              borderRadius: 22,
              overflow: "hidden",
              border: `3px solid ${theme.success}AA`,
              background: theme.panel,
              padding: 10,
              boxShadow: `0 0 36px ${theme.success}20`,
            }}
          >
            <div style={{ position: "relative", width: 286, height: 286, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0 }}>
                <PortraitSilhouette reveal={cleanedReveal} />
              </div>
              <div style={{ position: "absolute", inset: 0, opacity: (1 - cleanedReveal) * 0.72 }}>
                <NoiseGrid local={local + 60} size={286} seed={10} alpha={1 - cleanedReveal} />
              </div>
              {/* epsilon subtraction flash overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(135deg, ${theme.warning}00, ${theme.warning}${hit ? "22" : "00"})`,
                  opacity: hit ? hitP : 0,
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: "center", ...mono, fontSize: 19, color: theme.success }}>x_{`{t-1}`} · ЧИЩЕ</div>
          <div style={{ textAlign: "center", ...mono, fontSize: 16, color: theme.subtext }}>ШАГ -1</div>
        </div>

        {/* formula badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 770,
            transform: `translateX(-50%) scale(${0.88 + hitP * 0.12})`,
            padding: "18px 34px",
            borderRadius: 22,
            background: `${theme.success}14`,
            border: `3px solid ${theme.success}88`,
            color: theme.text,
            fontFamily: theme.mono,
            fontSize: 30,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * (0.35 + hitP * 0.65),
            boxShadow: hit ? `0 0 36px ${theme.success}22` : "none",
          }}
        >
          x_{`{t-1}`} = x_t − ε̂
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 865,
            transform: "translateX(-50%)",
            textAlign: "center",
            color: theme.subtext,
            ...mono,
            fontSize: 18,
            opacity: enter * 0.92,
            lineHeight: 1.45,
          }}
        >
          НЕ РИСУЕТ — УГАДЫВАЕТ ГРЯЗЬ И СТИРАЕТ
          <br />
          <span style={{ color: theme.accent2, fontSize: 16 }}>ПОВТОР 50-1000 РАЗ → ПОРТРЕТ ПРОЯВЛЯЕТСЯ</span>
        </div>

        {/* text condition pill at bottom */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 990,
            transform: `translateX(-50%) scale(${0.88 + enter * 0.12})`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 26px",
            borderRadius: 999,
            background: `${theme.accent2}14`,
            border: `2px solid ${theme.accent2}88`,
            color: theme.accent2,
            ...mono,
            fontSize: 20,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          <IconGlyph name="message-circle" size={26} color={theme.accent2} strokeWidth={1.8} />
          &quot;{prompt}&quot;
          <span
            style={{
              color: theme.text,
              background: `${theme.accent2}22`,
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 16,
            }}
          >
            CROSS-ATTENTION
          </span>
        </div>
        {/* arrow from text to UNet */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 940,
            width: 2,
            height: 36,
            background: `${theme.accent2}88`,
            opacity: enter * 0.9,
          }}
        />
        <div style={{ position: "absolute", left: W / 2 - 7, top: 928, width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: `9px solid ${theme.accent2}88`, opacity: enter }} />
        {hit ? <PulseRing x={W / 2} y={815} triggerFrame={impactLocal} tone="success" size={300} /> : null}
      </div>
    );
  }

  if (phase === "prompt") {
    const promptP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.75 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
        {header}
        {/* CLIP text tower */}
        <div
          style={{
            position: "absolute",
            left: 62,
            top: 360,
            width: 300,
            borderRadius: 24,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.accent2}88`,
            padding: 22,
            opacity: enter,
            boxShadow: `0 0 30px ${theme.accent2}18`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.accent2, ...mono, fontSize: 20 }}>
            <IconGlyph name="type" size={26} color={theme.accent2} strokeWidth={1.8} />
            ТЕКСТ
          </div>
          <div
            style={{
              marginTop: 18,
              padding: "16px 18px",
              borderRadius: 16,
              background: "#0A0F18",
              border: `2px solid ${theme.accent2}44`,
              color: theme.text,
              fontFamily: theme.mono,
              fontSize: 20,
              lineHeight: 1.35,
            }}
          >
            &quot;{prompt}&quot;
          </div>
          <div style={{ marginTop: 14, ...mono, fontSize: 16, color: theme.subtext, textAlign: "center" }}>CLIP ViT-L/14 → ЭМБЕДДИНГ</div>
          <div
            style={{
              marginTop: 14,
              height: 12,
              borderRadius: 8,
              background: theme.panelBorder,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${60 + promptP * 40}%`,
                height: "100%",
                background: theme.accent2,
                boxShadow: `0 0 10px ${theme.accent2}`,
              }}
            />
          </div>
        </div>

        {/* cross-attention arrows */}
        <svg width={W} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", opacity: enter }}>
          <defs>
            <marker id="arr-accent2" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.accent2} />
            </marker>
          </defs>
          {Array.from({ length: 3 }).map((_, i) => {
            const y = 520 + i * 52;
            const dash = i === 1 ? "0" : "9 10";
            return <line key={i} x1={362} y1={y} x2={515} y2={530 + i * 14} stroke={theme.accent2} strokeWidth={i === 1 ? 4 : 2.5} strokeDasharray={dash} markerEnd="url(#arr-accent2)" opacity={0.55 + i * 0.15} />;
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            left: 378,
            top: 612,
            transform: "translateX(-50%)",
            padding: "8px 18px",
            borderRadius: 999,
            background: `${theme.accent2}18`,
            border: `2px solid ${theme.accent2}66`,
            color: theme.accent2,
            ...mono,
            fontSize: 16,
            opacity: enter,
          }}
        >
          CROSS-ATTENTION
        </div>

        {/* UNet centre */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 110,
            top: 440,
            width: 220,
            borderRadius: 28,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.warning}AA`,
            padding: "18px 16px",
            textAlign: "center",
            opacity: enter,
            boxShadow: `0 0 36px ${theme.warning}20`,
          }}
        >
          <IconGlyph name="cpu" size={38} color={theme.warning} strokeWidth={1.7} />
          <div style={{ marginTop: 8, ...mono, fontSize: 24, color: theme.warning }}>UNet</div>
          <div style={{ marginTop: 4, ...mono, fontSize: 15, color: theme.subtext, lineHeight: 1.3 }}>ПРЕДСКАЗЫВАЕТ ШУМ ε̂</div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 6 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ width: 44, height: 22, borderRadius: 8, background: `${theme.warning}${22 + i * 18}`, border: `2px solid ${theme.warning}66` }} />
            ))}
          </div>
        </div>

        {/* noisy image on right */}
        <div
          style={{
            position: "absolute",
            right: 62,
            top: 360,
            width: 300,
            borderRadius: 24,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.accent}66`,
            padding: 14,
            opacity: enter,
          }}
        >
          <div style={{ ...mono, fontSize: 18, color: theme.accent, textAlign: "center" }}>x_t · ШУМНЫЙ КАДР</div>
          <div style={{ marginTop: 12, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ position: "relative", width: 270, height: 270 }}>
              <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
                <NoiseGrid local={local} size={270} seed={55} />
              </div>
              <div style={{ position: "absolute", inset: 0, opacity: 0.28 + promptP * 0.22 }}>
                <PortraitSilhouette reveal={0.35 + promptP * 0.3} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, textAlign: "center", ...mono, fontSize: 15, color: theme.subtext }}>ВНИМАНИЕ РУЛИТ ТЕКСТОМ</div>
        </div>

        {/* bottom badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 860,
            transform: `translateX(-50%) scale(${0.88 + promptP * 0.12})`,
            padding: "18px 32px",
            borderRadius: 22,
            background: `${theme.success}14`,
            border: `3px solid ${theme.success}88`,
            color: theme.success,
            ...mono,
            fontSize: 26,
            opacity: enter * (0.4 + promptP * 0.6),
            whiteSpace: "nowrap",
          }}
        >
          ТЕКСТ ДИКТУЕТ, ЧТО СТИРАТЬ
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 970, transform: "translateX(-50%)", textAlign: "center", color: theme.subtext, ...mono, fontSize: 18, opacity: enter }}>
          CLIP → CROSS-ATTENTION В КАЖДЫЙ СЛОЙ UNet
        </div>
        {hit ? <PulseRing x={W / 2} y={550} triggerFrame={impactLocal} tone="warning" size={260} /> : null}
      </div>
    );
  }

  if (phase === "glass") {
    const wipe = interpolate(Math.max(0, local - impactLocal), [0, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const cleaned = 0.18 + wipe * 0.82;
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
        {header}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 345,
            transform: "translateX(-50%)",
            width: 560,
            height: 560,
            borderRadius: 28,
            overflow: "hidden",
            border: `4px solid ${theme.panelBorder}`,
            background: "#0A0F18",
            boxShadow: `0 22px 60px rgba(0,0,0,0.5), 0 0 40px ${theme.accent}12`,
            opacity: enter,
          }}
        >
          {/* portrait behind */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#143a2a" }}>
            <PortraitSilhouette reveal={1} />
          </div>
          {/* glass pane with dirt */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, rgba(200,210,225,${0.72 - wipe * 0.52}) 0%, rgba(160,170,185,${0.55 - wipe * 0.4}) 100%)`,
              backdropFilter: `blur(${(1 - wipe) * 2}px)`,
            }}
          />
          {/* dirt particles */}
          <div style={{ position: "absolute", inset: 0, opacity: 1 - wipe }}>
            {Array.from({ length: 44 }).map((_, i) => {
              const rx = random(`dirt-x-${i}`) * 86 + 7;
              const ry = random(`dirt-y-${i}`) * 78 + 11;
              const rs = 6 + random(`dirt-s-${i}`) * 18;
              const rc = random(`dirt-c-${i}`) > 0.5 ? "#6B5A42" : "#4A4A4A";
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${rx}%`,
                    top: `${ry}%`,
                    width: rs,
                    height: rs * (0.7 + random(`dirt-r-${i}`) * 0.6),
                    borderRadius: "50%",
                    background: rc,
                    opacity: 0.62 + random(`dirt-o-${i}`) * 0.35,
                    filter: "blur(0.6px)",
                  }}
                />
              );
            })}
          </div>
          {/* cleaned streak */}
          <div
            style={{
              position: "absolute",
              left: `${wipe * 78}%`,
              top: 0,
              width: `${22 + wipe * 78}%`,
              bottom: 0,
              background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${0.12 + wipe * 0.1}) 18%, transparent 100%)`,
              opacity: wipe,
            }}
          />
          {/* wiper hand */}
          <div
            style={{
              position: "absolute",
              left: `${8 + wipe * 62}%`,
              top: 38,
              bottom: 38,
              width: 62,
              borderRadius: 18,
              background: `linear-gradient(180deg, ${theme.accent} 0%, #0EA5C8 100%)`,
              border: `3px solid ${theme.accent}`,
              boxShadow: `0 0 22px ${theme.accent}66`,
              opacity: hit ? 1 : 0.55,
              transform: `translateX(-50%) scale(${hit ? 1 : 0.92})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconGlyph name="sparkles" size={28} color="#fff" strokeWidth={1.9} />
          </div>
          {/* highlight line where cleaned */}
          <div
            style={{
              position: "absolute",
              left: `${8 + wipe * 62}%`,
              top: 0,
              width: 4,
              bottom: 0,
              background: theme.accent,
              opacity: 0.35 + wipe * 0.35,
              filter: "blur(1px)",
            }}
          />
        </div>

        {/* labels */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 935,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 14,
            alignItems: "center",
            opacity: enter,
          }}
        >
          <div
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              background: `${theme.warning}14`,
              border: `2px solid ${theme.warning}66`,
              color: theme.warning,
              ...mono,
              fontSize: 18,
            }}
          >
            ГРЯЗЬ = ШУМ ε̂
          </div>
          <div style={{ color: theme.subtext, fontSize: 22 }}>→</div>
          <div
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              background: `${theme.success}14`,
              border: `2px solid ${theme.success}88`,
              color: theme.success,
              ...mono,
              fontSize: 18,
            }}
          >
            СТЁР → ПОРТРЕТ
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1025,
            transform: `translateX(-50%) scale(${0.9 + wipe * 0.1})`,
            padding: "18px 32px",
            borderRadius: 22,
            background: `${theme.success}16`,
            border: `3px solid ${theme.success}88`,
            color: theme.success,
            fontFamily: theme.mono,
            fontSize: 25,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * (0.4 + wipe * 0.6),
            boxShadow: wipe > 0.5 ? `0 0 30px ${theme.success}22` : "none",
          }}
        >
          КАК ТРЯПКА ПО СТЕКЛУ
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 1120, transform: "translateX(-50%)", textAlign: "center", color: theme.subtext, ...mono, fontSize: 18, opacity: enter }}>
          UNet УГАДЫВАЕТ ГРЯЗЬ И СТИРАЕТ — ПРОСТУПАЕТ ТЕКСТ
        </div>
        {hit ? <PulseRing x={W / 2} y={625} triggerFrame={impactLocal} tone="success" size={300} /> : null}
      </div>
    );
  }

  if (phase === "latent") {
    const latentP = hit ? hitP : 0;
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
        {header}
        {/* pixel box */}
        <div
          style={{
            position: "absolute",
            left: 62,
            top: 360,
            width: 440,
            height: 440,
            borderRadius: 28,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.danger}66`,
            padding: 18,
            opacity: enter,
            boxShadow: `0 0 28px ${theme.danger}11`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: theme.danger, ...mono, fontSize: 18 }}>
            <span>ПИКСЕЛИ</span>
            <span style={{ color: theme.subtext, fontSize: 15 }}>512 × 512</span>
          </div>
          <div
            style={{
              marginTop: 14,
              height: 298,
              borderRadius: 18,
              background: "#0A0F18",
              border: `2px solid ${theme.danger}22`,
              display: "flex",
              flexWrap: "wrap",
              overflow: "hidden",
              opacity: 0.92,
            }}
          >
            {Array.from({ length: 64 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: "12.5%",
                  height: "12.5%",
                  background: `rgb(${130 + (i % 7) * 10}, ${130 + (i % 5) * 12}, ${150 + (i % 3) * 18})`,
                  opacity: 0.55 + (i % 5) * 0.08,
                  border: `1px solid #0A0F18`,
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 10, textAlign: "center", ...mono, fontSize: 16, color: theme.danger }}>262 144 ПИКСЕЛЯ · ТЯЖЕЛО</div>
        </div>

        {/* compress arrow */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 565,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: enter,
          }}
        >
          <div
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              background: `${theme.accent2}16`,
              border: `2px solid ${theme.accent2}88`,
              color: theme.accent2,
              ...mono,
              fontSize: 17,
              whiteSpace: "nowrap",
            }}
          >
            АВТОЭНКОДЕР ×8
          </div>
          <div style={{ color: theme.accent2, fontSize: 36, lineHeight: 1 }}>→</div>
          <div style={{ color: theme.subtext, ...mono, fontSize: 15 }}>СЖАТИЕ</div>
        </div>

        {/* latent box */}
        <div
          style={{
            position: "absolute",
            right: 62,
            top: 360,
            width: 440,
            height: 440,
            borderRadius: 28,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.success}AA`,
            padding: 18,
            opacity: enter,
            boxShadow: `0 0 36px ${theme.success}18`,
            transform: `scale(${0.96 + latentP * 0.04})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: theme.success, ...mono, fontSize: 18 }}>
            <span>LATENT</span>
            <span style={{ color: theme.subtext, fontSize: 15 }}>64 × 64</span>
          </div>
          <div
            style={{
              marginTop: 14,
              height: 298,
              borderRadius: 18,
              background: "#0A0F18",
              border: `2px solid ${theme.success}33`,
              display: "flex",
              flexWrap: "wrap",
              overflow: "hidden",
              opacity: 0.96,
            }}
          >
            {Array.from({ length: 64 }).map((_, i) => {
              const r = random(`lat-${i}`);
              const active = r > 0.35;
              return (
                <div
                  key={i}
                  style={{
                    width: "12.5%",
                    height: "12.5%",
                    background: active ? theme.accent : "#121A28",
                    opacity: active ? 0.45 + r * 0.45 : 0.35,
                    border: `1px solid #0A0F18`,
                    boxShadow: active ? `inset 0 0 6px ${theme.accent}` : "none",
                  }}
                />
              );
            })}
          </div>
          <div style={{ marginTop: 10, textAlign: "center", ...mono, fontSize: 16, color: theme.success }}>4 096 ЛАТЕНТОВ · ЛЕГКО</div>
        </div>

        {/* comparison bar */}
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 850,
            height: 28,
            borderRadius: 999,
            background: theme.panelBorder,
            overflow: "hidden",
            display: "flex",
            opacity: enter,
          }}
        >
          <div style={{ width: "88%", background: theme.danger, opacity: 0.85 }} />
          <div style={{ width: "12%", background: theme.success }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 890,
            display: "flex",
            justifyContent: "space-between",
            ...mono,
            fontSize: 16,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          <span style={{ color: theme.danger }}>ПИКСЕЛИ 100%</span>
          <span style={{ color: theme.success }}>LATENT 12.5%</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 970,
            transform: `translateX(-50%) scale(${0.9 + latentP * 0.1})`,
            padding: "18px 30px",
            borderRadius: 22,
            background: `${theme.success}16`,
            border: `3px solid ${theme.success}88`,
            color: theme.success,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * (0.35 + latentP * 0.65),
          }}
        >
          В 8 РАЗ КОМПАКТНЕЕ · 64× БЫСТРЕЕ
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 1065, transform: "translateX(-50%)", textAlign: "center", color: theme.subtext, ...mono, fontSize: 17, opacity: enter }}>
          ДИФФУЗИМ НЕ КАРТИНКУ — СЖАТЫЙ СМЫСЛ
        </div>
        {hit ? <PulseRing x={W / 2} y={575} triggerFrame={impactLocal} tone="success" size={260} /> : null}
      </div>
    );
  }

  // ddim
  const progress = interpolate(Math.max(0, local - impactLocal), [0, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
      {header}
      {/* DDPM track */}
      <div
        style={{
          position: "absolute",
          left: 62,
          right: 62,
          top: 370,
          borderRadius: 24,
          background: `${theme.panel}F2`,
          border: `2px solid ${theme.panelBorder}`,
          padding: "20px 22px",
          opacity: enter,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...mono, fontSize: 18 }}>
          <span style={{ color: theme.subtext }}>
            <span style={{ color: theme.danger }}>DDPM</span> · ОБУЧЕНИЕ
          </span>
          <span style={{ color: theme.danger, fontSize: 16 }}>1 000 ШАГОВ</span>
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 3, height: 30, alignItems: "center" }}>
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 16 + (i % 3) * 6, borderRadius: 4, background: theme.danger, opacity: 0.32 + (i / 42) * 0.38 }} />
          ))}
        </div>
        <div style={{ marginTop: 10, textAlign: "center", ...mono, fontSize: 15, color: theme.subtext }}>T = 1000 · МЕДЛЕННО, ЗАТО ТОЧНО</div>
      </div>

      {/* arrow down */}
      <div style={{ position: "absolute", left: W / 2, top: 562, transform: "translateX(-50%)", color: theme.accent2, fontSize: 34, opacity: enter }}>↓</div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 605,
          transform: "translateX(-50%)",
          padding: "10px 22px",
          borderRadius: 999,
          background: `${theme.accent2}16`,
          border: `2px solid ${theme.accent2}88`,
          color: theme.accent2,
          ...mono,
          fontSize: 17,
          opacity: enter,
        }}
      >
        ТОТ ЖЕ UNet · НОВЫЙ СЕМПЛЕР
      </div>

      {/* DDIM track */}
      <div
        style={{
          position: "absolute",
          left: 62,
          right: 62,
          top: 672,
          borderRadius: 24,
          background: `${theme.panel}F2`,
          border: `3px solid ${theme.success}88`,
          padding: "20px 22px",
          opacity: enter,
          boxShadow: `0 0 32px ${theme.success}14`,
          transform: `scale(${0.97 + progress * 0.03})`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...mono, fontSize: 18 }}>
          <span style={{ color: theme.subtext }}>
            <span style={{ color: theme.success }}>DDIM</span> · РИСУЕМ
          </span>
          <span style={{ color: theme.success, fontSize: 16 }}>50 ШАГОВ</span>
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 6, height: 36, alignItems: "center" }}>
          {Array.from({ length: 12 }).map((_, i) => {
            const active = progress * 12 > i;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 28,
                  borderRadius: 8,
                  background: active ? theme.success : theme.panelBorder,
                  border: `2px solid ${active ? theme.success : theme.panelBorder}`,
                  boxShadow: active ? `0 0 14px ${theme.success}66` : "none",
                  opacity: active ? 1 : 0.45,
                  transform: `scale(${active ? 1.06 : 1})`,
                }}
              />
            );
          })}
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", ...mono, fontSize: 15 }}>
          <span style={{ color: theme.subtext }}>ДЕТЕРМИНИРОВАННО</span>
          <span style={{ color: theme.success }}>20× БЫСТРЕЕ · ПОЧТИ ТА ЖЕ FID</span>
        </div>
      </div>

      {/* CLIP cross-attention pill */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 892,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 26px",
          borderRadius: 999,
          background: `${theme.accent2}14`,
          border: `2px solid ${theme.accent2}66`,
          color: theme.accent2,
          ...mono,
          fontSize: 18,
          opacity: enter * (0.4 + progress * 0.6),
          whiteSpace: "nowrap",
        }}
      >
        <IconGlyph name="message-circle" size={22} color={theme.accent2} strokeWidth={1.8} />
        CLIP ViT-L/14 → CROSS-ATTENTION
        <span style={{ color: theme.text, background: `${theme.accent2}22`, padding: "4px 10px", borderRadius: 999, fontSize: 14 }}>guidance 7.5</span>
      </div>

      {/* badge */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 990,
          transform: `translateX(-50%) scale(${0.9 + progress * 0.1})`,
          padding: "18px 32px",
          borderRadius: 22,
          background: `${theme.success}16`,
          border: `3px solid ${theme.success}88`,
          color: theme.success,
          fontFamily: theme.mono,
          fontSize: 26,
          fontWeight: 800,
          whiteSpace: "nowrap",
          opacity: enter * (0.35 + progress * 0.65),
          boxShadow: progress > 0.5 ? `0 0 30px ${theme.success}22` : "none",
        }}
      >
        DDIM 50 · ЭКОНОМИМ 20 РАЗ
      </div>
      <div style={{ position: "absolute", left: W / 2, top: 1085, transform: "translateX(-50%)", textAlign: "center", color: theme.subtext, ...mono, fontSize: 17, opacity: enter }}>
        МЕНЬШЕ ШАГОВ — ТОТ ЖЕ ПОРТРЕТ
      </div>
      {hit ? <PulseRing x={W / 2} y={780} triggerFrame={impactLocal} tone="success" size={260} /> : null}
    </div>
  );
};
