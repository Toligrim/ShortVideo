import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const CX = W / 2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const monoLabel: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 2,
};

const Card: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  scale?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.accent, opacity = 1, scale = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 24,
      background: theme.panel,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 42px ${color}20`,
      opacity,
      transform: `scale(${scale})`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </div>
);

const ObservationDots: React.FC<{
  count: number;
  left: number;
  top: number;
  width: number;
  height: number;
  progress: number;
  compact?: boolean;
}> = ({ count, left, top, width, height, progress, compact = false }) => (
  <>
    {Array.from({ length: count }).map((_, i) => {
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const x = left + width / 2 + Math.cos(angle) * (width / 2 - (compact ? 22 : 34));
      const y = top + height / 2 + Math.sin(angle) * (height / 2 - (compact ? 18 : 28));
      const p = smooth((progress - i * 0.045) / 0.32);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: compact ? 16 : 24,
            height: compact ? 16 : 24,
            borderRadius: "50%",
            transform: `translate(-50%, -50%) scale(${0.55 + p * 0.45})`,
            opacity: p,
            background: i % 3 === 0 ? theme.success : theme.accent,
            boxShadow: `0 0 22px ${i % 3 === 0 ? theme.success : theme.accent}AA`,
          }}
        />
      );
    })}
  </>
);

const GroupDots: React.FC<{ rows: number; columns: number; progress: number; color: string }> = ({
  rows,
  columns,
  progress,
  color,
}) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 16px)`, gap: 7, marginTop: 14 }}>
    {Array.from({ length: rows * columns }).map((_, i) => {
      const p = smooth((progress - i * 0.06) / 0.42);
      return (
        <div
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: 5,
            background: color,
            opacity: p,
            transform: `scale(${0.65 + p * 0.35})`,
            boxShadow: `0 0 14px ${color}88`,
          }}
        />
      );
    })}
  </div>
);

const Arrow: React.FC<{ left: number; top: number; opacity?: number }> = ({ left, top, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      color: theme.warning,
      fontFamily: theme.font,
      fontSize: 64,
      fontWeight: 800,
      opacity,
    }}
  >
    →
  </div>
);

export type OrbitFftPhase = "orbit" | "groups" | "stages";

/**
 * История Гаусса буквально: точки наблюдений Паллады превращаются в группы
 * подзадач, а затем — в ступени факторизации FFT.
 */
export const OrbitFftGroups: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: OrbitFftPhase;
  asteroid?: string;
  observations?: number;
  year?: string;
}> = ({
  local,
  fps,
  impactLocal,
  phase = "orbit",
  asteroid = "ПАЛЛАДА",
  observations = 12,
  year = "1805",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const count = Math.max(6, Math.min(16, Math.round(observations)));
  const done = local >= impactLocal;
  const transformP = done
    ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } })
    : 0;
  const asteroidName = asteroid.toUpperCase();

  if (phase === "orbit") {
    const orbitW = 820;
    const orbitH = 480;
    const orbitX = CX - orbitW / 2;
    const orbitY = 520;
    const observationP = smooth(local / 34);
    const orbitP = smooth((local - 24) / 28);
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 250,
            transform: "translateX(-50%)",
            ...monoLabel,
            fontSize: 28,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          {year} · ОРБИТА {asteroidName}
        </div>
        <div
          style={{
            position: "absolute",
            left: orbitX,
            top: orbitY,
            width: orbitW,
            height: orbitH,
            borderRadius: "50%",
            border: `4px dashed ${theme.accent2}99`,
            transform: `rotate(-12deg) scale(${0.88 + 0.12 * enter})`,
            opacity: enter * orbitP,
            boxShadow: `0 0 70px ${theme.accent2}1F`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: CX,
            top: orbitY + orbitH / 2,
            transform: `translate(-50%, -50%) scale(${enter})`,
            width: 112,
            height: 112,
            borderRadius: "50%",
            background: `${theme.warning}20`,
            border: `3px solid ${theme.warning}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 44px ${theme.warning}55`,
          }}
        >
          <IconGlyph name="sun" size={64} color={theme.warning} strokeWidth={1.6} />
        </div>
        <ObservationDots
          count={count}
          left={orbitX}
          top={orbitY}
          width={orbitW}
          height={orbitH}
          progress={observationP}
        />
        <div
          style={{
            position: "absolute",
            left: orbitX + orbitW - 84,
            top: orbitY + 58,
            transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * enter}) rotate(12deg)`,
            opacity: enter * orbitP,
          }}
        >
          <IconGlyph name="orbit" size={78} color={theme.success} strokeWidth={1.6} />
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1110,
            transform: "translateX(-50%)",
            ...monoLabel,
            fontSize: 27,
            color: theme.accent,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          {count} НАБЛЮДЕНИЙ → ОДНА ОРБИТА
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1180,
            transform: "translateX(-50%)",
            fontFamily: theme.font,
            fontSize: 34,
            fontWeight: 700,
            color: theme.text,
            opacity: enter,
          }}
        >
          Гаусс собирает траекторию из точек
        </div>
      </>
    );
  }

  if (phase === "groups") {
    const leftX = 70;
    const leftY = 500;
    const leftW = 300;
    const leftH = 590;
    const groupP = transformP;
    const groupCards = [
      { label: "G₁", x: 540, color: theme.accent, progress: groupP },
      { label: "G₂", x: 720, color: theme.accent2, progress: Math.max(0, groupP - 0.08) },
      { label: "G₃", x: 900, color: theme.success, progress: Math.max(0, groupP - 0.16) },
    ];
    const subtaskCards = [
      { label: "S₁", x: 470, color: theme.accent2, progress: Math.max(0, groupP - 0.12) },
      { label: "S₂", x: 625, color: theme.accent2, progress: Math.max(0, groupP - 0.18) },
      { label: "S₃", x: 780, color: theme.accent2, progress: Math.max(0, groupP - 0.24) },
      { label: "S₄", x: 935, color: theme.accent2, progress: Math.max(0, groupP - 0.3) },
    ];
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 245,
            transform: "translateX(-50%)",
            ...monoLabel,
            fontSize: 28,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          {asteroidName} · {count} НАБЛЮДЕНИЙ
        </div>
        <Card left={leftX} top={leftY} width={leftW} height={leftH} color={theme.accent} opacity={enter}>
          <IconGlyph name="orbit" size={62} color={theme.accent} strokeWidth={1.5} />
          <div style={{ ...monoLabel, fontSize: 25, color: theme.text, marginTop: 14 }}>ДАННЫЕ ОРБИТЫ</div>
          <div style={{ fontFamily: theme.font, fontSize: 27, color: theme.subtext, marginTop: 8 }}>{count} точек</div>
          <div style={{ position: "absolute", left: 28, top: 260, width: leftW - 56, height: 190 }}>
            <ObservationDots count={count} left={35} top={25} width={leftW - 126} height={140} progress={1} compact />
          </div>
        </Card>
        <div
          style={{
            position: "absolute",
            left: 384,
            top: 770,
            color: theme.warning,
            fontFamily: theme.font,
            fontSize: 25,
            fontWeight: 700,
            transform: `rotate(-90deg) translateX(-50%)`,
            transformOrigin: "center",
            opacity: enter,
          }}
        >
          группируем
        </div>
        <Arrow left={405} top={735} opacity={groupP} />
        <div
          style={{
            position: "absolute",
            left: 555,
            top: 425,
            ...monoLabel,
            fontSize: 22,
            color: theme.accent,
            opacity: enter,
          }}
        >
          СНАЧАЛА · ПО ЧЕТЫРЕ
        </div>
        {groupCards.map((card) => (
          <Card
            key={card.label}
            left={card.x}
            top={500}
            width={145}
            height={190}
            color={card.color}
            opacity={card.progress * enter}
            scale={0.72 + 0.28 * card.progress}
          >
            <div style={{ ...monoLabel, fontSize: 28, color: card.color }}>{card.label}</div>
            <GroupDots rows={1} columns={4} progress={card.progress} color={card.color} />
            <div style={{ fontFamily: theme.font, fontSize: 22, color: theme.subtext, marginTop: 13 }}>4 точки</div>
          </Card>
        ))}
        <Arrow left={690} top={705} opacity={groupP} />
        <div
          style={{
            position: "absolute",
            left: 555,
            top: 790,
            ...monoLabel,
            fontSize: 22,
            color: theme.accent2,
            opacity: enter,
          }}
        >
          ПОТОМ · ПО ТРИ
        </div>
        {subtaskCards.map((card) => (
          <Card
            key={card.label}
            left={card.x}
            top={850}
            width={128}
            height={168}
            color={card.color}
            opacity={card.progress * enter}
            scale={0.72 + 0.28 * card.progress}
          >
            <div style={{ ...monoLabel, fontSize: 25, color: card.color }}>{card.label}</div>
            <GroupDots rows={1} columns={3} progress={card.progress} color={card.color} />
            <div style={{ fontFamily: theme.font, fontSize: 20, color: theme.subtext, marginTop: 12 }}>3 точки</div>
          </Card>
        ))}
        {done ? <PulseRing x={CX} y={760} triggerFrame={impactLocal} tone="success" size={330} /> : null}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1080,
            transform: `translateX(-50%) scale(${badgeP})`,
            opacity: badgeP,
            padding: "16px 30px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
          }}
        >
          12 → 3×4 → 4×3 · ПОДЗАДАЧИ
        </div>
      </>
    );
  }

  const stageP = smooth(local / 30);
  const stages = [
    { title: "12 ТОЧЕК", color: theme.accent, kind: "source" },
    { title: "3 × 4", color: theme.accent2, kind: "four" },
    { title: "4 × 3", color: theme.success, kind: "three" },
    { title: "FFT", color: theme.warning, kind: "fft" },
  ];
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 245,
          transform: "translateX(-50%)",
          ...monoLabel,
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        FFT · СТУПЕНИ ПОДЗАДАЧ
      </div>
      {stages.map((stage, i) => {
        const p = smooth((stageP - i * 0.16) / 0.7);
        const x = 48 + i * 252;
        return (
          <React.Fragment key={stage.title}>
            {i > 0 ? <Arrow left={x - 57} top={690} opacity={p * enter} /> : null}
            <Card left={x} top={470} width={208} height={475} color={stage.color} opacity={p * enter} scale={0.82 + 0.18 * p}>
              <div style={{ ...monoLabel, fontSize: 24, color: stage.color }}>{stage.title}</div>
              {stage.kind === "source" ? (
                <>
                  <IconGlyph name="orbit" size={66} color={stage.color} strokeWidth={1.5} />
                  <ObservationDots count={count} left={x + 44} top={620} width={120} height={180} progress={p} compact />
                </>
              ) : null}
              {stage.kind === "four" ? (
                <>
                  {[0, 1, 2].map((row) => (
                    <div key={row} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: row === 0 ? 34 : 18 }}>
                      <span style={{ fontFamily: theme.mono, fontSize: 18, color: stage.color }}>G{row + 1}</span>
                      <GroupDots rows={1} columns={4} progress={p} color={stage.color} />
                    </div>
                  ))}
                </>
              ) : null}
              {stage.kind === "three" ? (
                <>
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: row === 0 ? 26 : 15 }}>
                      <span style={{ fontFamily: theme.mono, fontSize: 18, color: stage.color }}>S{row + 1}</span>
                      <GroupDots rows={1} columns={3} progress={p} color={stage.color} />
                    </div>
                  ))}
                </>
              ) : null}
              {stage.kind === "fft" ? (
                <>
                  <IconGlyph name="git-branch" size={66} color={stage.color} strokeWidth={1.5} />
                  {["12 → 6", "6 → 3", "3 → 1"].map((label, row) => (
                    <div
                      key={label}
                      style={{
                        width: 148,
                        marginTop: row === 0 ? 38 : 18,
                        padding: "10px 8px",
                        borderRadius: 12,
                        border: `2px solid ${stage.color}88`,
                        color: stage.color,
                        fontFamily: theme.mono,
                        fontSize: 20,
                        textAlign: "center",
                        opacity: smooth((p - row * 0.12) / 0.45),
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </>
              ) : null}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, textAlign: "center", fontFamily: theme.font, fontSize: 21, color: theme.subtext }}>
                {stage.kind === "source" ? "наблюдения" : stage.kind === "fft" ? "быстрые суммы" : "группы"}
              </div>
            </Card>
          </React.Fragment>
        );
      })}
      {done ? <PulseRing x={CX} y={710} triggerFrame={impactLocal} tone="warning" size={430} /> : null}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 1080,
          transform: `translateX(-50%) scale(${badgeP})`,
          opacity: badgeP,
          padding: "16px 30px",
          borderRadius: 999,
          background: `${theme.warning}18`,
          border: `2px solid ${theme.warning}`,
          color: theme.warning,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 30,
          whiteSpace: "nowrap",
        }}
      >
        ПРОМЕЖУТОЧНЫЕ СУММЫ → FFT
      </div>
    </>
  );
};
