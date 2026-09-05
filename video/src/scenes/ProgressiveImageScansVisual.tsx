import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { stripStress } from "../lib/stress";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ProgressiveImageScansPhase =
  | "compare"
  | "blur"
  | "shapes"
  | "scans"
  | "tracing"
  | "details"
  | "blocks"
  | "sharp";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ProgressiveImageScansPhase;
};

type PhotoQuality = "blur" | "shapes" | "details" | "sharp";
type FileMode = "normal" | "scans" | "tracing" | "blocks";

const W = layout.width;
const H = layout.height;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.1 };

const phaseTitle: Record<ProgressiveImageScansPhase, string> = {
  compare: "ОДНА КАРТИНКА · ДВА СОСТОЯНИЯ",
  blur: "СКАН 1 · ВЕСЬ КАДР МУТНЫЙ",
  shapes: "СКАН 2 · ГРУБЫЕ ФОРМЫ",
  scans: "PROGRESSIVE JPEG · СКАНЫ В ОДНОМ ФАЙЛЕ",
  tracing: "СЛОИ КАЛЬКИ · ТОТ ЖЕ РИСУНОК",
  details: "СКАН 3 · ТЕНИ, КОНТУРЫ, ШТРИХИ",
  blocks: "ПРОХОДЫ · БЛОКИ ПО ВСЕМУ КАДРУ",
  sharp: "СКАН 4 · ЧЁТКИЙ КАДР",
};

const phaseIcon: Record<ProgressiveImageScansPhase, string> = {
  compare: "images",
  blur: "scan",
  shapes: "shapes",
  scans: "file-image",
  tracing: "layers-3",
  details: "scan-eye",
  blocks: "grid-3x3",
  sharp: "focus",
};

const phaseColor: Record<ProgressiveImageScansPhase, string> = {
  compare: theme.accent,
  blur: theme.accent2,
  shapes: theme.accent2,
  scans: theme.accent,
  tracing: theme.accent2,
  details: theme.success,
  blocks: theme.warning,
  sharp: theme.success,
};

const qualityDetail: Record<PhotoQuality, number> = {
  blur: 0.08,
  shapes: 0.35,
  details: 0.78,
  sharp: 1,
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      border: `3px solid ${color}77`,
      background: `${theme.panel}F0`,
      boxShadow: `0 16px 52px ${color}1E`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: ProgressiveImageScansPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 228,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 21,
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

const PhotoFrame: React.FC<{
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  quality: PhotoQuality;
  color: string;
  reveal: number;
  blockMode?: boolean;
  opacity?: number;
}> = ({ id, left, top, width, height, label, quality, color, reveal, blockMode = false, opacity = 1 }) => {
  const detail = qualityDetail[quality] * (0.28 + 0.72 * clamp01(reveal));
  const eyeDetail = clamp01((detail - 0.16) / 0.62);
  const fineDetail = clamp01((detail - 0.38) / 0.62);
  const blur = quality === "blur" ? 10 : quality === "shapes" ? 1.5 : 0;
  const gradientId = `progressive-photo-${id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const mosaic = [
    [28, 42, 114, 88, "#33506B"],
    [142, 42, 124, 88, "#24445A"],
    [266, 42, 112, 88, "#5B526D"],
    [378, 42, 112, 88, "#314A5C"],
    [28, 130, 118, 102, "#3B5665"],
    [146, 130, 126, 102, "#A06F65"],
    [272, 130, 106, 102, "#BD8A72"],
    [378, 130, 112, 102, "#594D64"],
    [28, 232, 125, 104, "#243B4D"],
    [153, 232, 119, 104, "#36556A"],
    [272, 232, 117, 104, "#784F55"],
    [389, 232, 101, 104, "#213747"],
  ] as const;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        boxSizing: "border-box",
        borderRadius: 26,
        background: "#09111B",
        border: `3px solid ${color}99`,
        boxShadow: `0 14px 44px ${color}24`,
        overflow: "hidden",
        opacity,
      }}
    >
      <div style={{ position: "absolute", left: 22, top: 18, color, fontSize: 18, ...mono }}>{stripStress(label)}</div>
      <svg
        viewBox="0 0 520 380"
        width="100%"
        height="calc(100% - 56px)"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", left: 0, bottom: 0, display: "block", filter: blur ? `blur(${blur}px) saturate(${0.62 + detail * 0.38})` : undefined }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#213B52" />
            <stop offset="0.58" stopColor="#172B3C" />
            <stop offset="1" stopColor="#0D1926" />
          </linearGradient>
          <radialGradient id={`${gradientId}-skin`} cx="38%" cy="28%" r="75%">
            <stop offset="0" stopColor="#FFE4C4" />
            <stop offset="0.58" stopColor="#D99A78" />
            <stop offset="1" stopColor="#A15D54" />
          </radialGradient>
        </defs>
        <rect width="520" height="380" fill={`url(#${gradientId})`} />
        <rect x="28" y="28" width="150" height="174" rx="16" fill="#2D526A" opacity="0.42" />
        <path d="M28 150 L88 94 L135 139 L178 104 V202 H28 Z" fill="#6A9A9C" opacity="0.52" />
        <path d="M0 300 C94 262 145 294 214 274 C293 251 393 279 520 242 V380 H0 Z" fill="#183146" />
        <path d="M0 342 C96 314 172 334 248 315 C354 288 425 319 520 289 V380 H0 Z" fill="#102333" />
        <path d="M144 380 C153 300 198 280 272 278 C351 280 393 314 405 380 Z" fill="#75495A" opacity="0.92" />
        <ellipse cx="270" cy="190" rx="103" ry="125" fill={`url(#${gradientId}-skin)`} opacity={0.55 + detail * 0.45} />
        <path d="M169 187 C167 94 217 52 286 68 C346 82 375 135 358 208 C337 172 306 148 262 148 C223 148 193 166 169 187 Z" fill="#2A1A27" opacity="0.94" />
        <path d="M171 158 C194 77 275 53 336 103" fill="none" stroke="#725064" strokeWidth="12" strokeLinecap="round" opacity="0.7" />
        <path d="M202 120 C216 85 230 72 248 61 M232 119 C250 77 267 65 282 62 M264 119 C280 83 298 78 311 82" fill="none" stroke="#D6A5B3" strokeWidth="3" strokeLinecap="round" opacity={0.22 + fineDetail * 0.72} />
        <g opacity={eyeDetail}>
          <path d="M205 191 Q231 174 256 191 Q231 208 205 191 Z" fill="#F5F0E8" />
          <path d="M284 191 Q310 174 335 191 Q310 208 284 191 Z" fill="#F5F0E8" />
          <circle cx="232" cy="191" r="8" fill="#1A1D29" />
          <circle cx="307" cy="191" r="8" fill="#1A1D29" />
          <circle cx="229" cy="188" r="2.7" fill="#FFFFFF" />
          <circle cx="304" cy="188" r="2.7" fill="#FFFFFF" />
          <path d="M205 172 Q230 157 256 169 M284 169 Q310 157 335 172" fill="none" stroke="#4A2935" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g opacity={fineDetail}>
          <path d="M270 198 C263 226 262 236 278 239" fill="none" stroke="#9A5C59" strokeWidth="5" strokeLinecap="round" />
          <path d="M241 266 Q270 284 300 264" fill="none" stroke="#873E4E" strokeWidth="7" strokeLinecap="round" />
          <path d="M214 278 Q270 298 327 277" fill="none" stroke="#F0B19A" strokeWidth="3" opacity="0.7" />
          <circle cx="193" cy="226" r="5" fill="#F5B2A0" opacity="0.55" />
          <circle cx="349" cy="226" r="5" fill="#F5B2A0" opacity="0.55" />
        </g>
        <g opacity={clamp01((detail - 0.32) / 0.68)}>
          <rect x="327" y="294" width="142" height="50" rx="8" fill="#F7C86B" opacity="0.9" />
          <text x="398" y="325" textAnchor="middle" fill="#392D1E" fontSize="22" fontWeight="800" fontFamily="Arial, sans-serif">
            ТЕКСТ
          </text>
        </g>
        <g opacity={fineDetail * 0.95} fill="none" stroke="#6EE7B7" strokeWidth="3" strokeLinecap="round">
          <path d="M64 296 C45 270 58 246 80 236" />
          <path d="M64 296 C89 278 101 259 94 237" />
          <path d="M72 279 L47 267 M78 264 L99 250" />
          <path d="M446 170 C465 148 487 156 494 179" />
          <path d="M455 165 L450 143 M474 163 L487 143" />
        </g>
        <g opacity={quality === "blur" ? 0.24 : quality === "shapes" ? 0.18 : 0}>
          {mosaic.map(([x, y, w, h, fill], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
          ))}
        </g>
      </svg>
      {blockMode ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              top: 62,
              bottom: 37,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "repeat(3, 1fr)",
              opacity: 0.34 + 0.34 * clamp01(reveal),
              pointerEvents: "none",
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: `2px solid ${i % 3 === 0 ? theme.warning : i % 3 === 1 ? theme.accent : theme.accent2}88`,
                  background: `${i % 3 === 0 ? theme.warning : i % 3 === 1 ? theme.accent : theme.accent2}10`,
                }}
              />
            ))}
          </div>
          <div style={{ position: "absolute", left: 28, bottom: 13, color: theme.warning, fontSize: 15, ...mono }}>
            БЛОКИ · ВСЯ ПЛОЩАДЬ КАДРА
          </div>
        </>
      ) : null}
    </div>
  );
};

const ScanRow: React.FC<{ index: number; caption: string; active: boolean; color: string }> = ({ index, caption, active, color }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: 230,
      height: 58,
      boxSizing: "border-box",
      padding: "0 14px",
      borderRadius: 13,
      border: `2px solid ${active ? color : theme.panelBorder}`,
      background: active ? `${color}1C` : `${theme.bg}88`,
      boxShadow: active ? `0 0 24px ${color}24` : "none",
    }}
  >
    <span style={{ color: active ? color : theme.text, fontSize: 17, ...mono }}>SCAN {index}</span>
    <span style={{ color: active ? theme.text : theme.subtext, fontSize: 14, ...mono }}>{caption}</span>
  </div>
);

const FilePanel: React.FC<{
  mode: FileMode;
  activeScan: number[];
  color: string;
  enter: number;
}> = ({ mode, activeScan, color, enter }) => {
  const captions =
    mode === "tracing"
      ? ["формы", "тени", "контуры", "штрихи"]
      : mode === "blocks"
      ? ["DC · база", "блоки", "AC · детали", "уточн."]
      : ["весь кадр", "формы", "детали", "резкость"];

  return (
    <Panel left={750} top={370} width={286} height={620} color={color} opacity={enter}>
      <div style={{ position: "absolute", left: 22, top: 20, display: "flex", alignItems: "center", gap: 10, color, ...mono, fontSize: 19 }}>
        <IconGlyph name="file-image" size={29} color={color} strokeWidth={1.8} />
        <span>ОДИН ФАЙЛ</span>
      </div>
      <div style={{ position: "absolute", left: 24, top: 67, color: theme.text, fontSize: 25, ...mono }}>photo.jpg</div>
      <div style={{ position: "absolute", left: 24, top: 101, color: theme.subtext, fontSize: 16, ...mono }}>JPEG · progressive</div>
      <div style={{ position: "absolute", left: 26, top: 145, width: 234, height: 1, background: `${color}55` }} />
      <div style={{ position: "absolute", left: 24, top: 160, display: "flex", flexDirection: "column", gap: 9 }}>
        {captions.map((caption, i) => (
          <ScanRow key={i} index={i + 1} caption={caption} active={activeScan.includes(i + 1)} color={color} />
        ))}
      </div>
      {mode === "blocks" ? (
        <div style={{ position: "absolute", left: 20, right: 20, top: 478, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, ...mono, fontSize: 15 }}>
            <span style={{ color: theme.danger, textDecoration: "line-through" }}>↓ СТРОКИ</span>
            <span style={{ color: theme.subtext, fontSize: 22 }}>→</span>
            <span style={{ color: theme.success }}>СЕТКА</span>
          </div>
          <div style={{ marginTop: 10, color: theme.warning, fontSize: 14, ...mono }}>ПО ВСЕЙ ПЛОЩАДИ</div>
        </div>
      ) : (
        <div style={{ position: "absolute", left: 24, right: 24, top: 515, textAlign: "center", color, fontSize: 16, ...mono }}>
          {mode === "tracing" ? "СЛОИ → ОДИН КАДР" : mode === "scans" ? "1 ФАЙЛ · 4 ПРОХОДА" : "ОДИН КАДР · УТОЧНЕНИЯ"}
        </div>
      )}
    </Panel>
  );
};

const LinkArrow: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => (
  <div style={{ position: "absolute", left: 710, top: 649, color, fontSize: 46, fontWeight: 800, opacity }}>→</div>
);

const ScanRibbon: React.FC<{ opacity: number; color: string }> = ({ opacity, color }) => (
  <div
    style={{
      position: "absolute",
      left: 88,
      top: 820,
      width: 594,
      height: 118,
      boxSizing: "border-box",
      padding: "12px 14px",
      borderRadius: 17,
      border: `2px solid ${color}88`,
      background: `${theme.bg}E8`,
      opacity,
    }}
  >
    <div style={{ textAlign: "center", color: theme.text, fontSize: 17, ...mono }}>ОДИН КАДР · ПРОХОДЫ НАКЛАДЫВАЮТСЯ</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 11 }}>
      {["SCAN 1", "SCAN 2", "SCAN 3", "SCAN 4"].map((label, i) => (
        <div
          key={label}
          style={{
            height: 37,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9,
            border: `2px solid ${[theme.accent2, theme.accent2, theme.accent, theme.success][i]}AA`,
            color: [theme.accent2, theme.accent2, theme.accent, theme.success][i],
            fontSize: 14,
            ...mono,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  </div>
);

const TracingSheets: React.FC<{ opacity: number }> = ({ opacity }) => {
  const sheets = [
    { left: 105, top: 765, label: "КАЛЬКА 1", caption: "ФОРМЫ", color: theme.accent2, rotate: -4 },
    { left: 314, top: 785, label: "КАЛЬКА 2", caption: "ТЕНИ", color: theme.accent, rotate: 2 },
    { left: 523, top: 765, label: "КАЛЬКА 3", caption: "ШТРИХИ", color: theme.success, rotate: -2 },
  ];
  return (
    <>
      {sheets.map((sheet) => (
        <div
          key={sheet.label}
          style={{
            position: "absolute",
            left: sheet.left,
            top: sheet.top,
            width: 174,
            height: 142,
            boxSizing: "border-box",
            paddingTop: 19,
            textAlign: "center",
            borderRadius: 15,
            border: `2px solid ${sheet.color}AA`,
            background: `${sheet.color}20`,
            color: sheet.color,
            transform: `rotate(${sheet.rotate}deg)`,
            opacity,
            boxShadow: `0 8px 24px ${sheet.color}20`,
          }}
        >
          <div style={{ fontSize: 15, ...mono }}>{sheet.label}</div>
          <div style={{ marginTop: 34, color: theme.text, fontSize: 22, ...mono }}>{sheet.caption}</div>
          <div style={{ marginTop: 11, color: theme.subtext, fontSize: 13, ...mono }}>→ КАДР</div>
        </div>
      ))}
    </>
  );
};

const BottomBadge: React.FC<{ text: string; color: string; opacity: number; scale: number }> = ({ text, color, opacity, scale }) => (
  <div
    style={{
      position: "absolute",
      left: 62,
      top: 1190,
      width: 956,
      minHeight: 78,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "14px 24px",
      borderRadius: 999,
      border: `3px solid ${color}99`,
      background: `${color}16`,
      color,
      textAlign: "center",
      whiteSpace: "nowrap",
      fontSize: 21,
      opacity,
      transform: `scale(${scale})`,
      boxShadow: `0 0 36px ${color}24`,
      ...mono,
    }}
  >
    {text}
  </div>
);

export const ProgressiveImageScansVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "blur" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hitReveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const color = phaseColor[phase];
  const header = <Header phase={phase} enter={enter} />;
  const activeScan: Record<ProgressiveImageScansPhase, number[]> = {
    compare: [1, 4],
    blur: [1],
    shapes: [2],
    scans: [1, 2, 3, 4],
    tracing: [1, 2, 3],
    details: [3],
    blocks: [1, 2, 3, 4],
    sharp: [4],
  };
  const badgeText: Record<ProgressiveImageScansPhase, string> = {
    compare: "ОДНА КАРТИНКА · ДВА СОСТОЯНИЯ",
    blur: "ПЕРВЫЙ ПРОХОД · СРАЗУ ВЕСЬ КАДР",
    shapes: "ДАЛЬШЕ · ТОТ ЖЕ КАДР УТОЧНЯЕТСЯ",
    scans: "ОДИН JPG · НЕСКОЛЬКО ПРОХОДОВ",
    tracing: "ОДИН РИСУНОК · СЛОИ НАКЛАДЫВАЮТСЯ",
    details: "ГЛАЗА · ТЕКСТ · КОНТУРЫ ДОБАВЛЯЮТСЯ",
    blocks: "НЕ СТРОКАМИ СВЕРХУ ВНИЗ · БЛОКАМИ ПО КАДРУ",
    sharp: "ОДИН JPG · НЕ ЧЕТЫРЕ ФОТО",
  };

  if (phase === "compare") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <PhotoFrame id="compare-blur" left={54} top={370} width={304} height={570} label="SCAN 1 · МУТНО" quality="blur" color={theme.accent2} reveal={1} opacity={enter} />
        <PhotoFrame id="compare-sharp" left={388} top={370} width={304} height={570} label="SCAN 4 · ЧЁТКО" quality="sharp" color={theme.success} reveal={1} opacity={enter} />
        <div style={{ position: "absolute", left: 354, top: 632, color: theme.text, fontSize: 35, ...mono, opacity: enter }}>→</div>
        <FilePanel mode="normal" activeScan={activeScan[phase]} color={color} enter={enter} />
        <BottomBadge text={badgeText[phase]} color={color} opacity={enter} scale={0.96 + enter * 0.04} />
        <PulseRing x={540} y={650} triggerFrame={impactLocal} tone="accent" size={260} />
      </div>
    );
  }

  const quality: PhotoQuality =
    phase === "blur" ? "blur" : phase === "sharp" ? "sharp" : phase === "details" ? "details" : "shapes";
  const fileMode: FileMode = phase === "scans" || phase === "tracing" || phase === "blocks" ? phase : "normal";
  const photoLabel: Record<ProgressiveImageScansPhase, string> = {
    compare: "",
    blur: "SCAN 1 · ВЕСЬ КАДР",
    shapes: "SCAN 2 · ГРУБЫЕ ФОРМЫ",
    scans: "ОДИН КАДР · 4 СКАНА",
    tracing: "ТОТ ЖЕ РИСУНОК · СЛОИ",
    details: "SCAN 3 · ДЕТАЛИ",
    blocks: "БЛОКИ · ЦВЕТ И ЯРКОСТЬ",
    sharp: "SCAN 4 · ЧЁТКИЙ КАДР",
  };
  const photoReveal = phase === "blur" ? 1 : hitReveal;
  const overlayOpacity = enter * (0.38 + 0.62 * hitReveal);

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      {header}
      <PhotoFrame
        id="main"
        left={54}
        top={370}
        width={644}
        height={620}
        label={photoLabel[phase]}
        quality={quality}
        color={color}
        reveal={photoReveal}
        blockMode={phase === "blocks"}
        opacity={enter}
      />
      {phase === "scans" ? <ScanRibbon opacity={overlayOpacity} color={color} /> : null}
      {phase === "tracing" ? <TracingSheets opacity={overlayOpacity} /> : null}
      <FilePanel mode={fileMode} activeScan={activeScan[phase]} color={color} enter={enter} />
      <LinkArrow color={color} opacity={enter} />
      <BottomBadge text={badgeText[phase]} color={color} opacity={enter} scale={0.96 + enter * 0.04} />
      <PulseRing x={376} y={680} triggerFrame={impactLocal} tone={phase === "blocks" ? "warning" : phase === "sharp" || phase === "details" ? "success" : "accent"} size={280} />
    </div>
  );
};
