import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type ClipboardFormatsPhase = "browser" | "copy" | "formats" | "envelopes" | "choose" | "result";
export type ClipboardFormatsVariant = "source" | "html" | "pair" | "rtf";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ClipboardFormatsPhase;
  variant?: ClipboardFormatsVariant;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.accent, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F4`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1A`,
    }}
  >
    {children}
  </div>
);

const AppLabel: React.FC<{ icon: string; text: string; color: string }> = ({ icon, text, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, color, fontSize: 22, ...mono }}>
    <IconGlyph name={icon} size={30} color={color} strokeWidth={1.8} />
    {text}
  </div>
);

const BrowserPanel: React.FC<{ left: number; top: number; width: number; height: number; compact?: boolean }> = ({
  left,
  top,
  width,
  height,
  compact = false,
}) => (
  <Panel left={left} top={top} width={width} height={height} color={theme.accent}>
    <div style={{ position: "absolute", inset: 0, padding: compact ? 20 : 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.accent, fontSize: compact ? 18 : 22, ...mono }}>
        <IconGlyph name="globe" size={compact ? 25 : 31} color={theme.accent} strokeWidth={1.8} />
        БРАУЗЕР
      </div>
      <div style={{ marginTop: 18, height: 34, borderRadius: 12, background: `${theme.subtext}12`, color: theme.subtext, fontSize: compact ? 15 : 18, padding: "8px 14px", ...mono }}>
        example.com/article
      </div>
      <div style={{ marginTop: 30, color: theme.text, fontSize: compact ? 20 : 26, lineHeight: 1.65 }}>
        <div>Важная заметка</div>
        <div style={{ color: theme.subtext }}>Список фактов и ссылка</div>
        <div style={{ color: theme.subtext }}>Абзац продолжается здесь</div>
      </div>
    </div>
  </Panel>
);

const Selection: React.FC<{ left: number; top: number; width: number; height: number; opacity: number }> = ({ left, top, width, height, opacity }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 10,
      background: `${theme.accent}30`,
      border: `3px solid ${theme.accent}`,
      color: theme.text,
      padding: "9px 14px",
      boxSizing: "border-box",
      fontSize: 21,
      opacity,
      ...mono,
    }}
  >
    Важная заметка · список
  </div>
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color?: string; opacity?: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color = theme.accent2,
  opacity = 1,
}) => (
  <svg width={W} height={layout.safeBottom} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity, overflow: "visible" }}>
    <path d={`M ${x1} ${y1} L ${x2 - 18} ${y2}`} fill="none" stroke={`${color}99`} strokeWidth={5} strokeDasharray="12 16" />
    <path d={`M ${x2 - 20} ${y2 - 12} L ${x2} ${y2} L ${x2 - 20} ${y2 + 12}`} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatusPill: React.FC<{ text: string; color?: string; opacity?: number }> = ({ text, color = theme.success, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1205,
      transform: "translateX(-50%)",
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 21,
      ...mono,
    }}
  >
    {text}
  </div>
);

const FormatCard: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
  tone: string;
  children: React.ReactNode;
  opacity?: number;
}> = ({ left, top, width, height, title, tone, children, opacity = 1 }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      padding: 24,
      borderRadius: 22,
      background: `${theme.panel}F4`,
      border: `3px solid ${tone}99`,
      boxShadow: `0 0 30px ${tone}18`,
      opacity,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: tone, fontSize: 19, ...mono }}>
      <IconGlyph name="file-text" size={27} color={tone} strokeWidth={1.8} />
      {title}
    </div>
    <div style={{ marginTop: 24, color: theme.text, fontSize: 24, lineHeight: 1.55 }}>{children}</div>
  </div>
);

const Envelope: React.FC<{ left: number; top: number; width: number; height: number; title: string; tone: string; detail: boolean; opacity: number }> = ({
  left,
  top,
  width,
  height,
  title,
  tone,
  detail,
  opacity,
}) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      padding: 24,
      borderRadius: 24,
      background: `${theme.panel}F4`,
      border: `3px solid ${tone}99`,
      opacity,
      boxShadow: `0 0 32px ${tone}18`,
    }}
  >
    <div style={{ color: tone, fontSize: 20, ...mono }}>{title}</div>
    <div style={{ position: "absolute", left: 24, right: 24, top: detail ? 98 : 112, height: detail ? 190 : 95, border: `3px solid ${tone}99`, borderRadius: 16 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%", borderRight: `2px solid ${tone}55`, transform: "skewY(28deg)", transformOrigin: "top right" }} />
      <div style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", borderLeft: `2px solid ${tone}55`, transform: "skewY(-28deg)", transformOrigin: "top left" }} />
      {detail ? (
        <div style={{ position: "absolute", left: 20, right: 20, top: 20, color: theme.subtext, fontSize: 18, lineHeight: 1.6, ...mono }}>
          <div>{"<b>текст</b>"}</div>
          <div>{"<a>ссылка</a>"}</div>
          <div>{"<li>список</li>"}</div>
        </div>
      ) : null}
    </div>
  </div>
);

const ClipboardFormatsVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "browser", variant = "source" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const motion = useMotion();

  if (phase === "browser") {
    const copyP = motion.action("copy");
    const cursorP = motion.action("copy");
    return (
      <>
        <BrowserPanel left={80} top={390} width={920} height={520} />
        <MotionGroup id="selection" index={0} action={{ preset: "pulse", cue: "copy" }}>
          <Selection left={170} top={580} width={650} height={60} opacity={copyP} />
        </MotionGroup>
        <MotionGroup id="cursor" index={1} action={{ preset: "transfer", cue: "copy", from: { x: -80, y: 50 }, to: { x: 0, y: 0 } }}>
          <div style={{ position: "absolute", left: 760, top: 735, opacity: cursorP }}>
            <IconGlyph name="mouse-pointer-2" size={55} color={theme.accent2} strokeWidth={1.8} />
          </div>
        </MotionGroup>
        <StatusPill text="ФРАГМЕНТ ВЫДЕЛЕН" color={theme.accent} opacity={enter} />
        <PulseRing x={490} y={610} triggerFrame={impactLocal} tone="accent" size={190} />
      </>
    );
  }

  if (phase === "copy") {
    const arrivalP = motion.action("arrival");
    return (
      <>
        <BrowserPanel left={55} top={440} width={400} height={420} compact />
        <Panel left={625} top={390} width={400} height={520} color={theme.accent2}>
          <div style={{ position: "absolute", left: 28, top: 25 }}><AppLabel icon="file-text" text="ВОРД" color={theme.accent2} /></div>
          <div style={{ position: "absolute", left: 28, top: 105, color: theme.subtext, fontSize: 18, ...mono }}>НОВЫЙ ДОКУМЕНТ</div>
          <div style={{ position: "absolute", left: 28, top: 175, color: theme.text, fontSize: 28, opacity: arrivalP }}>
            <strong>Важная заметка</strong>
            <div style={{ color: theme.accent2, fontSize: 20, marginTop: 18 }}>• список фактов</div>
            <div style={{ color: theme.accent, fontSize: 20, marginTop: 10, textDecoration: "underline" }}>ссылка</div>
          </div>
        </Panel>
        <MotionGroup id="fragment" index={1} action={{ preset: "transfer", cue: "arrival", from: { x: 0, y: 0 }, to: { x: 470, y: -15 } }}>
          <FormatCard left={165} top={650} width={270} height={130} title="ФРАГМЕНТ" tone={theme.accent} opacity={Math.max(0.12, 1 - arrivalP * 0.88)}>
            буквы + стиль
          </FormatCard>
        </MotionGroup>
        <Arrow x1={455} y1={705} x2={625} y2={650} color={theme.accent2} opacity={enter} />
        <PulseRing x={825} y={645} triggerFrame={impactLocal} tone="accent2" size={210} />
      </>
    );
  }

  if (phase === "formats") {
    const plainP = motion.action("plain");
    const htmlFocus = variant === "html";
    const htmlP = htmlFocus ? motion.action("html") : 0;
    return (
      <>
        <Panel left={70} top={390} width={940} height={650} color={theme.warning}>
          <div style={{ position: "absolute", left: 30, top: 26 }}><AppLabel icon="clipboard-list" text="ОДИН ФРАГМЕНТ" color={theme.warning} /></div>
        </Panel>
        <MotionGroup id="source" index={0}>
          <FormatCard left={htmlFocus ? 120 : 330} top={htmlFocus ? 520 : 515} width={htmlFocus ? 250 : 420} height={125} title="ИСТОЧНИК" tone={theme.warning}>
            один и тот же текст
          </FormatCard>
        </MotionGroup>
        <Arrow x1={540} y1={640} x2={htmlFocus ? 755 : 365} y2={htmlFocus ? 770 : 850} color={theme.warning} opacity={enter} />
        <Arrow x1={540} y1={640} x2={htmlFocus ? 345 : 715} y2={htmlFocus ? 1010 : 850} color={theme.warning} opacity={enter} />
        <MotionGroup id="plain" index={1} action={{ preset: "transfer", cue: "plain", from: { x: -100, y: 25 }, to: { x: 0, y: 0 } }}>
          <FormatCard left={htmlFocus ? 110 : 120} top={htmlFocus ? 820 : 650} width={htmlFocus ? 300 : 390} height={htmlFocus ? 180 : 235} title="text/plain" tone={theme.accent} opacity={Math.max(0.16, plainP)}>
            только буквы
            <div style={{ color: theme.subtext, fontSize: 18, marginTop: 12, ...mono }}>Важная заметка</div>
          </FormatCard>
        </MotionGroup>
        <MotionGroup id="html" index={2} action={{ preset: "transfer", cue: "html", from: { x: 100, y: 25 }, to: { x: 0, y: 0 } }}>
          <FormatCard left={htmlFocus ? 500 : 570} top={htmlFocus ? 675 : 650} width={htmlFocus ? 430 : 390} height={htmlFocus ? 300 : 235} title="text/html" tone={theme.accent2} opacity={htmlFocus ? Math.max(0.16, htmlP) : 0}>
            <div style={{ ...mono, color: theme.accent2, fontSize: htmlFocus ? 21 : 18 }}>{"<b>жирный</b>"}</div>
            <div style={{ ...mono, color: theme.accent2, fontSize: htmlFocus ? 21 : 18, marginTop: 8 }}>{"<a>ссылка</a>"}</div>
            <div style={{ ...mono, color: theme.accent2, fontSize: htmlFocus ? 21 : 18, marginTop: 8 }}>{"<li>список</li>"}</div>
          </FormatCard>
        </MotionGroup>
        <PulseRing x={htmlFocus ? 725 : 540} y={htmlFocus ? 820 : 770} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "envelopes") {
    const pair = variant !== "rtf";
    const shortP = pair ? Math.max(0.42, motion.action("short")) : 1;
    const richP = pair ? Math.max(0.42, motion.action("rich")) : 1;
    const rtfP = variant === "rtf" ? motion.action("rtf") : 0;
    const rulesP = variant === "rtf" ? motion.action("rules") : 0;
    return (
      <>
        <MotionGroup id="short-envelope" index={0} action={pair ? { preset: "transfer", cue: "short", from: { x: -130, y: 0 }, to: { x: 0, y: 0 } } : undefined}>
          <Envelope left={105} top={455} width={365} height={440} title="КОРОТКИЙ" tone={theme.accent} detail={false} opacity={pair ? shortP : enter} />
          <div style={{ position: "absolute", left: 145, top: 790, color: theme.accent, fontSize: 19, ...mono, opacity: pair ? shortP : enter }}>text/plain</div>
        </MotionGroup>
        <MotionGroup id="rich-envelope" index={1} action={pair ? { preset: "transfer", cue: "rich", from: { x: 130, y: 0 }, to: { x: 0, y: 0 } } : undefined}>
          <Envelope left={610} top={400} width={365} height={540} title="ПОДРОБНЫЙ" tone={theme.accent2} detail opacity={pair ? richP : enter} />
          <div style={{ position: "absolute", left: 660, top: 830, color: theme.accent2, fontSize: 19, ...mono, opacity: pair ? richP : enter }}>text/html</div>
          {variant === "rtf" ? (
            <MotionGroup id="rtf-label" index={2} action={{ preset: "pulse", cue: "rtf" }}>
              <div style={{ position: "absolute", left: 775, top: 985, color: theme.warning, fontSize: 22, ...mono, opacity: rtfP }}>RTF · ПРАВИЛА</div>
            </MotionGroup>
          ) : null}
          {variant === "rtf" ? (
            <div style={{ position: "absolute", left: 640, top: 705, color: theme.warning, fontSize: 16, lineHeight: 1.5, ...mono, opacity: rulesP }}>
              ШРИФТ · АБЗАЦ · ОТСТУП
            </div>
          ) : null}
        </MotionGroup>
        <Arrow x1={475} y1={675} x2={610} y2={675} color={theme.warning} opacity={enter} />
        <PulseRing x={variant === "rtf" ? 790 : 540} y={variant === "rtf" ? 790 : 675} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "choose") {
    const listP = motion.action("list");
    const pickP = motion.action("pick");
    const richP = motion.action("rich");
    return (
      <>
        <MotionGroup id="word-app" index={0}>
          <Panel left={125} top={390} width={830} height={650} color={theme.accent2}>
            <div style={{ position: "absolute", left: 30, top: 28 }}><AppLabel icon="file-text" text="ПРИЛОЖЕНИЕ · ВОРД" color={theme.accent2} /></div>
            <div style={{ position: "absolute", left: 30, top: 105, color: theme.subtext, fontSize: 18, ...mono }}>ДОСТУПНЫЕ ПРЕДСТАВЛЕНИЯ</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="format-list" index={1} action={{ preset: "pulse", cue: "list" }}>
          <div style={{ position: "absolute", left: 205, top: 560, width: 670, opacity: Math.max(0.12, listP) }}>
            {[{ label: "text/plain", detail: "только буквы", tone: theme.accent }, { label: "text/html", detail: "теги и стиль", tone: theme.accent2 }, { label: "text/rtf", detail: "правила абзаца", tone: theme.warning }].map((item, index) => (
              <div key={item.label} style={{ height: 92, marginBottom: 14, padding: "18px 22px", boxSizing: "border-box", borderRadius: 18, border: `2px solid ${item.tone}66`, background: `${item.tone}10`, display: "flex", alignItems: "center", justifyContent: "space-between", color: theme.text, ...mono }}>
                <span style={{ color: item.tone, fontSize: 22 }}>{item.label}</span>
                <span style={{ color: theme.subtext, fontSize: 18 }}>{item.detail}</span>
                <IconGlyph name="check" size={24} color={item.tone} strokeWidth={2} />
              </div>
            ))}
          </div>
        </MotionGroup>
        <MotionGroup id="choice" index={2} action={{ preset: "transfer", cue: "pick", from: { x: -90, y: -160 }, to: { x: 0, y: 0 } }}>
          <div style={{ position: "absolute", left: 190, top: 1080, width: 700, height: 92, borderRadius: 18, border: `4px solid ${theme.success}`, background: `${theme.success}18`, opacity: Math.max(0.1, pickP) }}>
            <div style={{ position: "absolute", left: 20, top: 27, color: theme.success, fontSize: 22, ...mono }}>ВЫБОР · HTML</div>
            <div style={{ position: "absolute", right: 20, top: 27, color: theme.success, fontSize: 18, ...mono, opacity: richP }}>БОГАТОЕ ИЗ ПОНЯТНЫХ</div>
          </div>
        </MotionGroup>
        <PulseRing x={540} y={1126} triggerFrame={impactLocal} tone="success" size={200} />
      </>
    );
  }

  const wordP = motion.action("word");
  const preserveP = motion.action("preserve");
  const simpleP = motion.action("simple");
  const lettersP = motion.action("letters");
  return (
    <>
      <MotionGroup id="word-output" index={0} action={{ preset: "pulse", cue: "preserve" }}>
        <Panel left={70} top={410} width={440} height={570} color={theme.accent2}>
          <div style={{ position: "absolute", left: 28, top: 28, opacity: Math.max(0.12, wordP) }}><AppLabel icon="file-text" text="ВОРД" color={theme.accent2} /></div>
          <div style={{ position: "absolute", left: 30, top: 145, color: theme.text, fontSize: 28, lineHeight: 1.7, opacity: Math.max(0.12, preserveP) }}>
            <strong>Важная заметка</strong>
            <div style={{ color: theme.accent, fontSize: 21 }}>ссылка</div>
            <div style={{ color: theme.accent2, fontSize: 21 }}>• пункт списка</div>
          </div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="plain-output" index={1} action={{ preset: "transfer", cue: "simple", from: { x: 120, y: 0 }, to: { x: 0, y: 0 } }}>
        <Panel left={570} top={410} width={440} height={570} color={theme.accent}>
          <div style={{ position: "absolute", left: 28, top: 28 }}><AppLabel icon="notebook-pen" text="ПРОСТОЙ ПОЛУЧАТЕЛЬ" color={theme.accent} /></div>
          <div style={{ position: "absolute", left: 30, top: 150, color: theme.text, fontSize: 28, lineHeight: 1.7, opacity: Math.max(0.12, simpleP) }}>
            <span style={{ opacity: Math.max(0.12, lettersP) }}>Важная заметка</span>
            <div style={{ fontSize: 21, color: theme.subtext, opacity: Math.max(0.12, lettersP) }}>ссылка</div>
            <div style={{ fontSize: 21, color: theme.subtext, opacity: Math.max(0.12, lettersP) }}>пункт списка</div>
          </div>
        </Panel>
      </MotionGroup>
      <StatusPill text="ФОРМАТ ЗАВИСИТ ОТ ПОЛУЧАТЕЛЯ" color={theme.success} opacity={enter} />
      <PulseRing x={290} y={690} triggerFrame={impactLocal} tone="accent2" size={190} />
    </>
  );
};

export { ClipboardFormatsVisual };
