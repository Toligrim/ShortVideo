import React, { useId } from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type RollingShutterPhase = "scan" | "split" | "distort" | "compare";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RollingShutterPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.1,
};

const phaseTitle: Record<RollingShutterPhase, string> = {
  scan: "МАТРИЦА СЧИТЫВАЕТ СТРОКИ",
  split: "ОДИН КАДР · РАЗНЫЕ МОМЕНТЫ",
  distort: "ЖЁСТКАЯ ЛОПАСТЬ · КРИВАЯ КАРТИНКА",
  compare: "ДВИЖЕНИЕ + ВРЕМЯ = ИСКАЖЕНИЕ",
};

const phaseColor: Record<RollingShutterPhase, string> = {
  scan: theme.accent,
  split: theme.warning,
  distort: theme.danger,
  compare: theme.accent2,
};

const phaseIcon: Record<RollingShutterPhase, string> = {
  scan: "scan-line",
  split: "layers",
  distort: "move",
  compare: "gauge",
};

const point = (cx: number, cy: number, radius: number, angle: number) => ({
  x: cx + Math.cos(angle) * radius,
  y: cy + Math.sin(angle) * radius,
});

const straightBladePath = (cx: number, cy: number, rotation: number, radius: number) => {
  const a = rotation;
  const p0 = point(cx, cy, 38, a - 0.12);
  const p1 = point(cx, cy, radius, a - 0.08);
  const p2 = point(cx, cy, radius, a + 0.08);
  const p3 = point(cx, cy, 42, a + 0.17);
  return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} Z`;
};

const bentBladePath = (cx: number, cy: number, rotation: number, radius: number, bend: number) => {
  const radii = [38, radius * 0.42, radius * 0.73, radius];
  const points = radii.map((r, i) => point(cx, cy, r, rotation + bend * (r / radius) ** 1.35));
  return `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
};

const Fan: React.FC<{
  cx: number;
  cy: number;
  radius: number;
  rotation: number;
  color: string;
  opacity?: number;
}> = ({ cx, cy, radius, rotation, color, opacity = 1 }) => (
  <g opacity={opacity}>
    <circle cx={cx} cy={cy} r={radius + 18} fill="none" stroke={`${color}30`} strokeWidth={3} />
    {[0, 1, 2].map((i) => (
      <path
        key={i}
        d={straightBladePath(cx, cy, rotation + (i * Math.PI * 2) / 3, radius)}
        fill={`${color}55`}
        stroke={color}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    ))}
    <circle cx={cx} cy={cy} r={34} fill={theme.panel} stroke={color} strokeWidth={6} />
    <circle cx={cx} cy={cy} r={10} fill={color} />
  </g>
);

const BentFan: React.FC<{
  cx: number;
  cy: number;
  radius: number;
  rotation: number;
  bend: number;
  color: string;
  opacity?: number;
}> = ({ cx, cy, radius, rotation, bend, color, opacity = 1 }) => (
  <g opacity={opacity}>
    <circle cx={cx} cy={cy} r={radius + 18} fill="none" stroke={`${color}30`} strokeWidth={3} />
    {[0, 1, 2].map((i) => {
      const angle = rotation + (i * Math.PI * 2) / 3;
      return (
        <g key={i}>
          <path
            d={bentBladePath(cx, cy, angle, radius, bend * (i % 2 === 0 ? 1 : -0.82))}
            fill="none"
            stroke={`${color}28`}
            strokeWidth={31}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={bentBladePath(cx, cy, angle, radius, bend * (i % 2 === 0 ? 1 : -0.82))}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    })}
    <circle cx={cx} cy={cy} r={34} fill={theme.panel} stroke={color} strokeWidth={6} />
    <circle cx={cx} cy={cy} r={10} fill={color} />
  </g>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 26,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 38px ${color}1C`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: RollingShutterPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 226,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 23,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );
};

const Badge: React.FC<{ text: string; color: string; opacity: number; pop: number }> = ({
  text,
  color,
  opacity,
  pop,
}) => (
  <div
    style={{
      position: "absolute",
      left: 90,
      top: 1190,
      width: 900,
      minHeight: 76,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "13px 24px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      fontSize: 22,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      transform: `scale(${0.97 + pop * 0.03})`,
      boxShadow: `0 0 34px ${color}22`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const PanelTitle: React.FC<{ left: number; top: number; text: string; color: string; size?: number }> = ({
  left,
  top,
  text,
  color,
  size = 24,
}) => (
  <div style={{ position: "absolute", left, top, color, fontSize: size, whiteSpace: "nowrap", ...mono }}>
    {text}
  </div>
);

const SvgLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    style={{ position: "absolute", inset: 0, overflow: "visible" }}
  >
    {children}
  </svg>
);

const ScanPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const rows = 12;
  const progress = smooth((local - 8) / 48);
  const activeRow = Math.min(rows - 1, Math.floor(progress * rows));
  const fanRotation = -0.72 + local * 0.035;
  const sensorTop = 485;
  const rowGap = 32;
  const sensorLeft = 658;
  const sensorWidth = 288;
  return (
    <>
      <Panel left={55} top={365} width={465} height={675} color={theme.accent2}>
        <PanelTitle left={0} top={32} text="СЦЕНА · ВЕНТИЛЯТОР" color={theme.accent2} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 545, textAlign: "center", color: theme.text, fontSize: 21, ...mono }}>
          ЛОПАСТЬ · ПРЯМАЯ
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 588, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>
          движется целиком
        </div>
      </Panel>
      <Panel left={570} top={365} width={455} height={675} color={theme.accent}>
        <PanelTitle left={0} top={32} text="МАТРИЦА · 12 СТРОК" color={theme.accent} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 575, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>
          строка за строкой · t₀ → t₁
        </div>
      </Panel>
      <SvgLayer>
        <g opacity={enter}>
          <Fan cx={285} cy={700} radius={170} rotation={fanRotation} color={theme.accent2} />
          <line x1={285} y1={488} x2={285} y2={910} stroke={`${theme.accent2}22`} strokeWidth={2} strokeDasharray="8 12" />
          <text x={285} y={462} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={18} fontWeight={800}>
            ДВИЖЕНИЕ
          </text>
          <text x={285} y={965} textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontSize={20} fontWeight={800}>
            t = {Math.round(local / 3)}
          </text>
        </g>
        <g opacity={enter}>
          <rect x={sensorLeft - 24} y={sensorTop - 26} width={sensorWidth + 48} height={rows * rowGap + 52} rx={20} fill="#090D15" stroke={`${theme.accent}88`} strokeWidth={3} />
          {Array.from({ length: rows }).map((_, i) => {
            const y = sensorTop + i * rowGap;
            const visible = i <= activeRow;
            const active = i === activeRow && local > 8;
            const tilt = (i / (rows - 1) - 0.5) * 22 + Math.sin(local / 16) * 3;
            const color = active ? theme.warning : visible ? theme.accent : theme.panelBorder;
            return (
              <g key={i} opacity={visible ? 1 : 0.45}>
                <rect x={sensorLeft} y={y} width={sensorWidth} height={24} rx={6} fill={active ? `${theme.warning}22` : `${color}0C`} stroke={`${color}88`} strokeWidth={2} />
                <line x1={sensorLeft + 42} y1={y + 12} x2={sensorLeft + sensorWidth - 18} y2={y + 12 + tilt} stroke={color} strokeWidth={5} strokeLinecap="round" />
                <text x={sensorLeft - 12} y={y + 17} textAnchor="end" fill={color} fontFamily={theme.mono} fontSize={15} fontWeight={800}>
                  {String(i + 1).padStart(2, "0")}
                </text>
              </g>
            );
          })}
          {local > 8 ? (
            <>
              <line x1={sensorLeft - 38} y1={sensorTop + activeRow * rowGap + 12} x2={sensorLeft + sensorWidth + 18} y2={sensorTop + activeRow * rowGap + 12} stroke={theme.warning} strokeWidth={5} opacity={0.95} />
              <circle cx={sensorLeft + sensorWidth + 24} cy={sensorTop + activeRow * rowGap + 12} r={9} fill={theme.warning} />
              <text x={sensorLeft + sensorWidth + 42} y={sensorTop + activeRow * rowGap + 18} fill={theme.warning} fontFamily={theme.mono} fontSize={16} fontWeight={800}>
                SCAN
              </text>
            </>
          ) : null}
          <text x={sensorLeft + sensorWidth / 2} y={sensorTop + rows * rowGap + 20} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={17} fontWeight={800}>
            ВЕРХ → НИЗ
          </text>
        </g>
      </SvgLayer>
      <Badge text="КАЖДАЯ СТРОКА ПОЛУЧАЕТ СВОЙ МОМЕНТ" color={theme.accent} opacity={enter} pop={0} />
      <PulseRing x={sensorLeft + sensorWidth / 2} y={sensorTop + activeRow * rowGap + 12} triggerFrame={impactLocal} tone="accent" size={180} />
    </>
  );
};

const SplitPhase: React.FC<{ local: number; enter: number; impactLocal: number; clipPrefix: string }> = ({
  local,
  enter,
  impactLocal,
  clipPrefix,
}) => {
  const rowCount = 12;
  const frameX = 110;
  const frameY = 445;
  const frameW = 860;
  const frameH = 535;
  const rowH = frameH / rowCount;
  const reveal = smooth((local - 8) / 42);
  const oldRotation = -0.62;
  const newRotation = oldRotation + 0.34 + smooth((local - impactLocal) / 20) * 0.1;
  return (
    <>
      <Panel left={70} top={360} width={940} height={700} color={theme.warning}>
        <PanelTitle left={0} top={32} text="СОБРАННЫЙ КАДР" color={theme.warning} />
      </Panel>
      <SvgLayer>
        <defs>
          {Array.from({ length: rowCount }).map((_, i) => (
            <clipPath key={i} id={`${clipPrefix}-row-${i}`}>
              <rect x={frameX} y={frameY + i * rowH} width={frameW} height={rowH + 1} />
            </clipPath>
          ))}
        </defs>
        <g opacity={enter}>
          <rect x={frameX} y={frameY} width={frameW} height={frameH} rx={20} fill="#090D15" stroke={`${theme.warning}AA`} strokeWidth={4} />
          {Array.from({ length: rowCount }).map((_, i) => {
            const visible = i / rowCount <= reveal;
            const t = i / (rowCount - 1);
            const angle = mix(oldRotation, newRotation, t);
            return (
              <g key={i} clipPath={`url(#${clipPrefix}-row-${i})`} opacity={visible ? 1 : 0.12}>
                <Fan cx={540} cy={715} radius={270} rotation={angle} color={i < rowCount / 2 ? theme.accent : theme.accent2} />
              </g>
            );
          })}
          {Array.from({ length: rowCount + 1 }).map((_, i) => {
            const y = frameY + i * rowH;
            return <line key={i} x1={frameX} y1={y} x2={frameX + frameW} y2={y} stroke={`${theme.text}28`} strokeWidth={2} />;
          })}
          <line x1={frameX + 22} y1={frameY + frameH / 2} x2={frameX + frameW - 22} y2={frameY + frameH / 2} stroke={theme.warning} strokeWidth={4} strokeDasharray="10 12" />
          <text x={frameX + 28} y={frameY + 48} fill={theme.accent} fontFamily={theme.mono} fontSize={20} fontWeight={800}>
            ВЕРХ · t₀
          </text>
          <text x={frameX + frameW - 28} y={frameY + frameH - 24} textAnchor="end" fill={theme.accent2} fontFamily={theme.mono} fontSize={20} fontWeight={800}>
            НИЗ · t₁
          </text>
          <text x={frameX + frameW / 2} y={frameY + frameH + 44} textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontSize={19} fontWeight={800}>
            12 строк → один прямоугольный кадр
          </text>
        </g>
      </SvgLayer>
      <Badge text="ВЕРХ И НИЗ ФИКСИРУЮТСЯ НЕОДНОВРЕМЕННО" color={theme.warning} opacity={enter} pop={0} />
      <PulseRing x={540} y={715} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

const DistortPhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const hit = local >= impactLocal;
  const bendPop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 13, mass: 0.75 } }) : 0;
  const bend = 0.12 + bendPop * 0.27;
  const rotation = -0.72 + local * 0.018;
  return (
    <>
      <Panel left={55} top={365} width={465} height={690} color={theme.success}>
        <PanelTitle left={0} top={32} text="РЕАЛЬНОСТЬ" color={theme.success} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 570, textAlign: "center", color: theme.success, fontSize: 22, ...mono }}>
          МЕТАЛЛ НЕ ГНЁТСЯ
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 614, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>
          лопасть остаётся прямой
        </div>
      </Panel>
      <Panel left={560} top={365} width={465} height={690} color={theme.danger}>
        <PanelTitle left={0} top={32} text="СНИМОК ТЕЛЕФОНА" color={theme.danger} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 570, textAlign: "center", color: theme.danger, fontSize: 22, ...mono }}>
          ЛОПАСТЬ КРИВАЯ
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 614, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>
          картинка собрана из строк
        </div>
      </Panel>
      <SvgLayer>
        <g opacity={enter}>
          <Fan cx={287} cy={700} radius={176} rotation={rotation} color={theme.success} />
          <text x={287} y={474} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={17} fontWeight={800}>
            ПРЯМОЙ ОБЪЕКТ
          </text>
        </g>
        <g opacity={enter}>
          <rect x={625} y={492} width={335} height={410} rx={18} fill="#090D15" stroke={`${theme.danger}88`} strokeWidth={3} />
          {Array.from({ length: 11 }).map((_, i) => {
            const y = 515 + i * 36;
            return <line key={i} x1={625} y1={y} x2={960} y2={y} stroke={`${theme.text}25`} strokeWidth={2} />;
          })}
          <BentFan cx={792} cy={700} radius={145} rotation={rotation} bend={bend} color={theme.danger} />
          <text x={792} y={474} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={17} fontWeight={800}>
            ОДИН КАДР
          </text>
        </g>
        <text x={540} y={705} textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontSize={58} fontWeight={800}>
          →
        </text>
      </SvgLayer>
      <Badge text="РАЗНЫЕ МОМЕНТЫ → КРИВАЯ ГЕОМЕТРИЯ" color={theme.danger} opacity={enter} pop={bendPop} />
      <PulseRing x={792} y={700} triggerFrame={impactLocal} tone="danger" size={230} />
    </>
  );
};

const ComparePhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const rotation = -0.7 + local * 0.03;
  const bend = 0.08 + pop * 0.3;
  return (
    <>
      <Panel left={55} top={365} width={465} height={700} color={theme.subtext}>
        <PanelTitle left={0} top={32} text="СПОКОЙНЕЕ · КОРОТКОЕ ОКНО" color={theme.subtext} size={21} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 565, textAlign: "center", color: theme.subtext, fontSize: 20, ...mono }}>
          круг остаётся кругом
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 610, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
          меньше разницы по строкам
        </div>
      </Panel>
      <Panel left={560} top={365} width={465} height={700} color={theme.accent2}>
        <PanelTitle left={0} top={32} text="БЫСТРЕЕ · ДОЛЬШЕ ОКНО" color={theme.accent2} size={21} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 565, textAlign: "center", color: theme.accent2, fontSize: 20, ...mono }}>
          круг → овал · лопасть → кривая
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 610, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
          разница по строкам растёт
        </div>
      </Panel>
      <SvgLayer>
        <g opacity={enter}>
          <rect x={102} y={480} width={370} height={355} rx={20} fill="#090D15" stroke={`${theme.subtext}77`} strokeWidth={3} />
          <circle cx={287} cy={655} r={142} fill="none" stroke={`${theme.subtext}55`} strokeWidth={5} />
          <Fan cx={287} cy={655} radius={130} rotation={rotation} color={theme.subtext} />
          <text x={287} y={875} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={18} fontWeight={800}>
            ∆t маленькое
          </text>
        </g>
        <g opacity={enter}>
          <rect x={607} y={480} width={370} height={355} rx={20} fill="#090D15" stroke={`${theme.accent2}88`} strokeWidth={3} />
          <ellipse cx={792} cy={655} rx={146} ry={105} fill="none" stroke={`${theme.accent2}66`} strokeWidth={5} />
          <BentFan cx={792} cy={655} radius={130} rotation={rotation} bend={bend} color={theme.accent2} />
          <text x={792} y={875} textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontSize={18} fontWeight={800}>
            ∆t большое
          </text>
        </g>
      </SvgLayer>
      <Badge text="БЫСТРЕЕ + ДОЛЬШЕ СЧИТЫВАНИЕ → СИЛЬНЕЕ ИСКАЖЕНИЕ" color={theme.accent2} opacity={enter} pop={pop} />
      <PulseRing x={792} y={655} triggerFrame={impactLocal} tone="accent2" size={220} />
    </>
  );
};

export const RollingShutterVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "scan" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });
  const clipPrefix = `rolling-shutter-${useId().replace(/:/g, "")}`;

  return (
    <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      {phase === "scan" ? <ScanPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "split" ? <SplitPhase local={local} enter={enter} impactLocal={impactLocal} clipPrefix={clipPrefix} /> : null}
      {phase === "distort" ? <DistortPhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
      {phase === "compare" ? <ComparePhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
    </div>
  );
};
