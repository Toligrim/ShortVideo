import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ApkUpdateSignaturePhase =
  | "store"
  | "clone"
  | "certificate"
  | "compare"
  | "reject"
  | "sign"
  | "verify"
  | "tamper"
  | "no-key"
  | "solarwinds"
  | "boundary";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ApkUpdateSignaturePhase;
  app?: string;
  version?: string;
  installedVersion?: string;
  certificate?: string;
  installedCertificate?: string;
  incomingCertificate?: string;
  signature?: string;
  company?: string;
  payload?: string;
};

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const phaseTitle: Record<ApkUpdateSignaturePhase, string> = {
  store: "МАГАЗИН → ОБНОВЛЕНИЕ НА ТЕЛЕФОНЕ",
  clone: "ОДИН В ОДИН · НО КОПИЯ",
  certificate: "ANDROID · ПРОВЕРЯЕТ ФАЙЛ И СЕРТИФИКАТ",
  compare: "СОПОСТАВЛЕНИЕ · ПОДПИСАНТ ВЕРСИИ",
  reject: "ЧУЖОЙ СЕРТИФИКАТ · УСТАНОВКА ОТКЛОНЕНА",
  sign: "РАЗРАБОТЧИК · ЗАКРЫТЫЙ КЛЮЧ",
  verify: "ТЕЛЕФОН · ОТКРЫТЫЙ КЛЮЧ ПРОВЕРЯЕТ APK",
  tamper: "СОДЕРЖИМОЕ ИЗМЕНЕНО · СТАРАЯ ПОДПИСЬ",
  "no-key": "ЗАКРЫТОГО КЛЮЧА НЕТ · НОВОЙ ПОДПИСИ НЕТ",
  solarwinds: "SOLARWINDS ORION · ПОДПИСЬ ДЕЙСТВУЕТ",
  boundary: "ПРЕДЕЛ · ДОВЕРЕННЫЙ КЛЮЧ НЕ ЗНАЕТ КОД",
};

const phaseIcon: Record<ApkUpdateSignaturePhase, string> = {
  store: "store",
  clone: "copy-check",
  certificate: "file-badge",
  compare: "badge-check",
  reject: "shield-x",
  sign: "stamp",
  verify: "shield-check",
  tamper: "file-exclamation-point",
  "no-key": "lock-keyhole",
  solarwinds: "building-2",
  boundary: "shield-alert",
};

const phaseColor = (phase: ApkUpdateSignaturePhase): string => {
  if (phase === "reject" || phase === "tamper" || phase === "no-key") return theme.danger;
  if (phase === "solarwinds" || phase === "boundary") return theme.warning;
  if (phase === "verify" || phase === "compare") return theme.success;
  return theme.accent;
};

const Header: React.FC<{ phase: ApkUpdateSignaturePhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 232,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor(phase)} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  enter: number;
  children: React.ReactNode;
  dashed?: boolean;
}> = ({ left, top, width, height, color, enter, children, dashed = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 24,
      border: `3px ${dashed ? "dashed" : "solid"} ${color}88`,
      background: `${theme.panel}ED`,
      boxShadow: `0 16px 46px ${color}20`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 30}px) scale(${0.92 + enter * 0.08})`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{ label: string; color: string; enter: number; top?: number; fontSize?: number }> = ({
  label,
  color,
  enter,
  top = 1030,
  fontSize = 24,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: `translateX(-50%) scale(${0.9 + enter * 0.1})`,
      padding: "14px 28px",
      borderRadius: 999,
      border: `3px solid ${color}99`,
      background: `${color}18`,
      color,
      ...mono,
      fontSize,
      whiteSpace: "nowrap",
      opacity: enter,
      boxShadow: `0 0 34px ${color}22`,
    }}
  >
    {label}
  </div>
);

const Arrow: React.FC<{ left: number; top: number; color?: string; opacity?: number }> = ({
  left,
  top,
  color = theme.accent,
  opacity = 1,
}) => (
  <div style={{ position: "absolute", left, top, color, fontSize: 54, fontWeight: 800, opacity }}>→</div>
);

const AppMark: React.FC<{ color?: string; size?: number }> = ({ color = theme.accent, size = 54 }) => (
  <IconGlyph name="app-window" size={size} color={color} strokeWidth={1.8} />
);

const CardTitle: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({
  children,
  color = theme.text,
  size = 22,
}) => <div style={{ ...mono, fontSize: size, color, textAlign: "center" }}>{children}</div>;

const Small: React.FC<{ children: React.ReactNode; color?: string; size?: number; nowrap?: boolean }> = ({
  children,
  color = theme.subtext,
  size = 18,
  nowrap = false,
}) => (
  <div style={{ ...mono, fontSize: size, color, textAlign: "center", whiteSpace: nowrap ? "nowrap" : "normal" }}>
    {children}
  </div>
);

export const ApkUpdateSignatureVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "store",
  app = "Заметки",
  version = "v2.4",
  installedVersion = "v2.3",
  certificate = "CERT A7·2C",
  installedCertificate = "CERT A7·2C",
  incomingCertificate: incomingCertificateProp,
  signature = "SIG 7b·91",
  company = "SolarWinds",
  payload = "SUNBURST",
}) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 15, mass: 0.8 } });
  const incomingCertificate = incomingCertificateProp ?? "CERT X1·9D";
  const header = <Header phase={phase} enter={enter} />;

  if (phase === "store") {
    const transfer = smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 18)));
    const packageX = interpolate(transfer, [0, 1], [485, 630]);
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={58} top={410} width={430} height={430} color={theme.accent} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="store" size={62} color={theme.accent} strokeWidth={1.7} />
            <CardTitle color={theme.accent} size={25}>МАГАЗИН ПРИЛОЖЕНИЙ</CardTitle>
            <div style={{ width: 320, padding: "20px 16px", borderRadius: 18, background: `${theme.accent}12`, border: `2px solid ${theme.accent}55`, textAlign: "center" }}>
              <AppMark color={theme.accent} size={42} />
              <div style={{ ...mono, marginTop: 10, fontSize: 27, color: theme.text }}>{app}</div>
              <div style={{ ...mono, marginTop: 8, fontSize: 22, color: theme.accent2 }}>{version} · ОБНОВЛЕНИЕ</div>
            </div>
            <Small color={theme.subtext}>кнопка «обновить»</Small>
          </div>
        </Panel>
        <Panel left={650} top={390} width={370} height={520} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <IconGlyph name="smartphone" size={86} color={theme.accent2} strokeWidth={1.7} />
            <CardTitle size={28}>ТЕЛЕФОН</CardTitle>
            <Small color={theme.accent2} size={22}>показывает обновление</Small>
            <div style={{ width: 260, padding: "16px 12px", borderRadius: 16, border: `2px solid ${theme.accent2}66`, background: `${theme.accent2}12`, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 20, color: theme.subtext }}>получен файл</div>
              <div style={{ ...mono, marginTop: 8, fontSize: 28, color: theme.text }}>APK {version}</div>
            </div>
          </div>
        </Panel>
        <Arrow left={500} top={610} opacity={enter * (0.45 + transfer * 0.55)} />
        <div
          style={{
            position: "absolute",
            left: packageX,
            top: 680,
            transform: "translateX(-50%) scale(0.86)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            opacity: enter * (0.4 + transfer * 0.6),
          }}
        >
          <IconGlyph name="package-check" size={43} color={theme.warning} strokeWidth={1.8} />
          <Small color={theme.warning} size={17} nowrap>APK {version}</Small>
        </div>
        <Pill label="ИСТОЧНИК: МАГАЗИН" color={theme.accent} enter={enter} top={1080} />
        <PulseRing x={W / 2} y={650} triggerFrame={impactLocal} tone="accent" size={210} />
      </div>
    );
  }

  if (phase === "clone") {
    const copyP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    const appCard = (left: number, color: string, title: string, detail: string, opacity: number) => (
      <Panel left={left} top={420} width={460} height={430} color={color} enter={opacity}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <AppMark color={color} size={68} />
          <CardTitle size={30}>{app}</CardTitle>
          <Small color={theme.accent2} size={23}>{version}</Small>
          <div style={{ padding: "9px 22px", borderRadius: 999, border: `2px solid ${color}99`, background: `${color}18`, color, ...mono, fontSize: 21 }}>{title}</div>
          <Small color={detail === "похожий вид" ? theme.danger : theme.success} size={19}>{detail}</Small>
        </div>
      </Panel>
    );
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        {appCard(58, theme.success, "НАСТОЯЩЕЕ", "подпись ещё впереди", enter)}
        {appCard(562, theme.danger, "ВРЕДНАЯ КОПИЯ", "похожий вид", enter * (0.35 + copyP * 0.65))}
        <div style={{ position: "absolute", left: W / 2, top: 610, transform: "translateX(-50%)", color: theme.warning, ...mono, fontSize: 44, opacity: enter }}>≡</div>
        <Pill label="ИМЯ · ИКОНКА · ВЕРСИЯ — ОДИН В ОДИН" color={theme.warning} enter={enter * (0.45 + copyP * 0.55)} top={1010} fontSize={22} />
        <PulseRing x={W - 290} y={635} triggerFrame={impactLocal} tone="danger" size={210} />
      </div>
    );
  }

  if (phase === "certificate") {
    const checkP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={45} top={430} width={330} height={390} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="file-code" size={62} color={theme.accent2} strokeWidth={1.7} />
            <CardTitle color={theme.accent2}>НОВЫЙ ФАЙЛ</CardTitle>
            <div style={{ ...mono, fontSize: 30, color: theme.text }}>APK {version}</div>
            <Small color={theme.subtext}>содержимое + подпись</Small>
            <Small color={theme.warning} size={21}>{signature}</Small>
          </div>
        </Panel>
        <Panel left={375} top={430} width={330} height={390} color={theme.accent} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="shield-check" size={68} color={theme.accent} strokeWidth={1.7} />
            <CardTitle color={theme.accent} size={25}>ANDROID</CardTitle>
            <Small color={theme.text} size={22}>извлекает сертификат</Small>
            <Small color={theme.subtext} size={20}>проверяет подпись</Small>
            <div style={{ ...mono, fontSize: 21, color: theme.warning }}>{certificate}</div>
          </div>
        </Panel>
        <Panel left={705} top={430} width={330} height={390} color={theme.success} enter={enter * (0.45 + checkP * 0.55)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="file-check" size={64} color={theme.success} strokeWidth={1.7} />
            <CardTitle color={theme.success}>РЕЗУЛЬТАТ</CardTitle>
            <Small color={theme.text} size={22}>подпись проверена</Small>
            <Small color={theme.success} size={24}>CHECK ✓</Small>
          </div>
        </Panel>
        <Arrow left={350} top={585} opacity={enter} />
        <Arrow left={680} top={585} color={theme.success} opacity={enter * (0.45 + checkP * 0.55)} />
        <Pill label="APK + CERTIFICATE → ПРОВЕРКА" color={theme.accent} enter={enter * (0.5 + checkP * 0.5)} top={970} fontSize={23} />
        <PulseRing x={W / 2} y={625} triggerFrame={impactLocal} tone="success" size={220} />
      </div>
    );
  }

  if (phase === "compare") {
    const compareP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    const candidateCertificate = incomingCertificateProp ?? certificate;
    const signerMatches = candidateCertificate === installedCertificate;
    const compareColor = signerMatches ? theme.success : theme.danger;
    const signerPill = compareP > 0.5
      ? signerMatches ? "ПОДПИСАНТ СОВПАЛ" : "ПОДПИСАНТ НЕ СОВПАЛ"
      : "СРАВНИВАЕМ СЕРТИФИКАТЫ";
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={58} top={420} width={445} height={410} color={theme.accent} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 17 }}>
            <IconGlyph name="file-up" size={60} color={theme.accent} strokeWidth={1.7} />
            <CardTitle color={theme.accent}>НОВОЕ ОБНОВЛЕНИЕ</CardTitle>
            <div style={{ ...mono, fontSize: 29, color: theme.text }}>APK {version}</div>
            <Small color={theme.subtext}>сертификат подписанта</Small>
            <div style={{ ...mono, fontSize: 27, color: signerMatches ? theme.warning : theme.danger }}>{candidateCertificate}</div>
          </div>
        </Panel>
        <Panel left={577} top={420} width={445} height={410} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 17 }}>
            <IconGlyph name="smartphone" size={62} color={theme.accent2} strokeWidth={1.7} />
            <CardTitle color={theme.accent2}>УСТАНОВЛЕННАЯ ВЕРСИЯ</CardTitle>
            <div style={{ ...mono, fontSize: 29, color: theme.text }}>APK {installedVersion}</div>
            <Small color={theme.subtext}>её доверенный подписант</Small>
            <div style={{ ...mono, fontSize: 27, color: theme.warning }}>{installedCertificate}</div>
          </div>
        </Panel>
        <div style={{ position: "absolute", left: W / 2, top: 575, transform: "translateX(-50%)", color: compareColor, ...mono, fontSize: 52, opacity: enter * (0.4 + compareP * 0.6) }}>{signerMatches ? "=" : "≠"}</div>
        <Pill label={signerPill} color={compareColor} enter={enter * (0.45 + compareP * 0.55)} top={980} />
        <PulseRing x={W / 2} y={625} triggerFrame={impactLocal} tone={signerMatches ? "success" : "danger"} size={210} />
      </div>
    );
  }

  if (phase === "reject") {
    const rejectP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={42} top={420} width={310} height={420} color={theme.danger} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="file-exclamation-point" size={61} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger}>НОВЫЙ ФАЙЛ</CardTitle>
            <div style={{ ...mono, fontSize: 28, color: theme.text }}>APK {version}</div>
            <Small color={theme.subtext}>сертификат</Small>
            <div style={{ ...mono, fontSize: 23, color: theme.danger }}>{incomingCertificate}</div>
          </div>
        </Panel>
        <Panel left={385} top={420} width={310} height={420} color={theme.warning} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <IconGlyph name="git-branch" size={60} color={theme.warning} strokeWidth={1.7} />
            <CardTitle color={theme.warning} size={24}>ДОВЕРЕННАЯ ЦЕПОЧКА</CardTitle>
            <div style={{ ...mono, fontSize: 22, color: theme.text }}>{certificate}</div>
            <div style={{ color: theme.warning, fontSize: 40 }}>↓</div>
            <Small color={theme.warning} size={22}>ROOT · ключ версии</Small>
          </div>
        </Panel>
        <Panel left={738} top={420} width={300} height={420} color={theme.danger} enter={enter * (0.35 + rejectP * 0.65)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="shield-x" size={68} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger} size={24}>ANDROID INSTALLER</CardTitle>
            <Small color={theme.subtext}>подписант не тот</Small>
            <div style={{ padding: "10px 22px", borderRadius: 999, border: `2px solid ${theme.danger}`, background: `${theme.danger}18`, color: theme.danger, ...mono, fontSize: 23 }}>ОТКЛОНЕНО</div>
          </div>
        </Panel>
        <Arrow left={350} top={590} color={theme.danger} opacity={enter} />
        <Arrow left={695} top={590} color={theme.danger} opacity={enter * (0.35 + rejectP * 0.65)} />
        <Pill label="НЕСОВПАДЕНИЕ → ОБНОВЛЕНИЕ ОТКЛОНЕНО" color={theme.danger} enter={enter * (0.45 + rejectP * 0.55)} top={990} fontSize={21} />
        <PulseRing x={W - 190} y={630} triggerFrame={impactLocal} tone="danger" size={220} />
      </div>
    );
  }

  if (phase === "sign") {
    const signatureP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={42} top={420} width={310} height={400} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="user-round" size={62} color={theme.accent2} strokeWidth={1.7} />
            <CardTitle color={theme.accent2}>РАЗРАБОТЧИК</CardTitle>
            <div style={{ ...mono, fontSize: 28, color: theme.text }}>APK {version}</div>
            <Small color={theme.subtext}>подписывает файл</Small>
          </div>
        </Panel>
        <Panel left={385} top={420} width={310} height={400} color={theme.danger} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 13 }}>
            <IconGlyph name="stamp" size={62} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger} size={23}>СЕКРЕТНЫЙ ШТАМП</CardTitle>
            <IconGlyph name="key-round" size={48} color={theme.danger} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 22, color: theme.text }}>ЗАКРЫТЫЙ КЛЮЧ</div>
            <Small color={theme.danger} size={19}>остаётся у владельца</Small>
          </div>
        </Panel>
        <Panel left={728} top={420} width={310} height={400} color={theme.accent} enter={enter * (0.35 + signatureP * 0.65)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="signature" size={62} color={theme.accent} strokeWidth={1.7} />
            <CardTitle color={theme.accent}>ПОДПИСЬ</CardTitle>
            <div style={{ ...mono, fontSize: 25, color: theme.text }}>{signature}</div>
            <Small color={theme.subtext}>для этого APK</Small>
          </div>
        </Panel>
        <Arrow left={347} top={585} opacity={enter} />
        <Arrow left={690} top={585} opacity={enter * (0.35 + signatureP * 0.65)} />
        <Pill label="APK + ЗАКРЫТЫЙ КЛЮЧ → ПОДПИСЬ" color={theme.accent} enter={enter * (0.45 + signatureP * 0.55)} top={960} fontSize={22} />
        <PulseRing x={W - 198} y={620} triggerFrame={impactLocal} tone="accent" size={220} />
      </div>
    );
  }

  if (phase === "verify") {
    const verifyP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={42} top={420} width={310} height={400} color={theme.accent} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="file-check" size={62} color={theme.accent} strokeWidth={1.7} />
            <CardTitle color={theme.accent}>КОНКРЕТНЫЙ APK</CardTitle>
            <div style={{ ...mono, fontSize: 27, color: theme.text }}>{version}</div>
            <Small color={theme.warning} size={21}>{signature}</Small>
          </div>
        </Panel>
        <Panel left={385} top={420} width={310} height={400} color={theme.success} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="key-round" size={62} color={theme.success} strokeWidth={1.7} />
            <CardTitle color={theme.success} size={23}>ОТКРЫТЫЙ КЛЮЧ</CardTitle>
            <div style={{ ...mono, fontSize: 24, color: theme.text }}>{certificate}</div>
            <Small color={theme.subtext} size={19}>может быть у телефона</Small>
          </div>
        </Panel>
        <Panel left={728} top={420} width={310} height={400} color={theme.success} enter={enter * (0.35 + verifyP * 0.65)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="smartphone" size={65} color={theme.success} strokeWidth={1.7} />
            <CardTitle color={theme.success}>ТЕЛЕФОН</CardTitle>
            <Small color={theme.text} size={21}>сверяет подпись</Small>
            <div style={{ padding: "10px 20px", borderRadius: 999, border: `2px solid ${theme.success}`, background: `${theme.success}18`, color: theme.success, ...mono, fontSize: 24 }}>CHECK ✓</div>
          </div>
        </Panel>
        <Arrow left={347} top={585} opacity={enter} />
        <Arrow left={690} top={585} color={theme.success} opacity={enter * (0.35 + verifyP * 0.65)} />
        <Pill label="ОТКРЫТЫЙ КЛЮЧ → ПОДПИСЬ ВЕРНА" color={theme.success} enter={enter * (0.45 + verifyP * 0.55)} top={960} fontSize={22} />
        <PulseRing x={W - 198} y={620} triggerFrame={impactLocal} tone="success" size={220} />
      </div>
    );
  }

  if (phase === "tamper") {
    const failP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={56} top={420} width={460} height={460} color={theme.success} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 17 }}>
            <IconGlyph name="file-check" size={64} color={theme.success} strokeWidth={1.7} />
            <CardTitle color={theme.success}>БЫЛО ПОДПИСАНО</CardTitle>
            <div style={{ ...mono, fontSize: 29, color: theme.text }}>APK {version}</div>
            <div style={{ padding: "12px 22px", borderRadius: 16, background: `${theme.success}12`, border: `2px solid ${theme.success}55`, textAlign: "center" }}>
              <Small color={theme.subtext}>содержимое</Small>
              <div style={{ ...mono, marginTop: 7, fontSize: 23, color: theme.text }}>code: clean</div>
              <div style={{ ...mono, marginTop: 9, fontSize: 21, color: theme.warning }}>{signature}</div>
            </div>
          </div>
        </Panel>
        <Panel left={564} top={420} width={460} height={460} color={theme.danger} enter={enter * (0.35 + failP * 0.65)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 17 }}>
            <IconGlyph name="file-exclamation-point" size={64} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger}>ПОСЛЕ ПОДМЕНЫ</CardTitle>
            <div style={{ ...mono, fontSize: 29, color: theme.text }}>APK {version}</div>
            <div style={{ padding: "12px 22px", borderRadius: 16, background: `${theme.danger}12`, border: `2px solid ${theme.danger}66`, textAlign: "center" }}>
              <Small color={theme.subtext}>содержимое</Small>
              <div style={{ ...mono, marginTop: 7, fontSize: 23, color: theme.danger }}>code: altered</div>
              <div style={{ ...mono, marginTop: 9, fontSize: 21, color: theme.danger, textDecoration: "line-through" }}>{signature}</div>
            </div>
            <Small color={theme.danger} size={21}>старая подпись</Small>
          </div>
        </Panel>
        <div style={{ position: "absolute", left: W / 2, top: 590, transform: "translateX(-50%)", color: theme.danger, ...mono, fontSize: 44, opacity: enter * (0.35 + failP * 0.65) }}>≠</div>
        <Pill label="ИЗМЕНИЛИ ФАЙЛ → ПОДПИСЬ НЕВАЛИДНА" color={theme.danger} enter={enter * (0.45 + failP * 0.55)} top={1020} fontSize={22} />
        <PulseRing x={W - 285} y={650} triggerFrame={impactLocal} tone="danger" size={230} />
      </div>
    );
  }

  if (phase === "no-key") {
    const blockedP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={45} top={420} width={315} height={410} color={theme.danger} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="file-exclamation-point" size={62} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger}>ИЗМЕНЁННЫЙ APK</CardTitle>
            <div style={{ ...mono, fontSize: 24, color: theme.text }}>{version}</div>
            <Small color={theme.danger} size={21}>нужна новая подпись</Small>
          </div>
        </Panel>
        <Panel left={382} top={420} width={315} height={410} color={theme.warning} enter={enter} dashed>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="lock-keyhole" size={64} color={theme.warning} strokeWidth={1.7} />
            <CardTitle color={theme.warning} size={24}>ЗАКРЫТЫЙ КЛЮЧ</CardTitle>
            <div style={{ ...mono, fontSize: 30, color: theme.danger }}>НЕТ</div>
            <Small color={theme.subtext} size={19}>у злоумышленника</Small>
          </div>
        </Panel>
        <Panel left={719} top={420} width={315} height={410} color={theme.danger} enter={enter * (0.3 + blockedP * 0.7)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15 }}>
            <IconGlyph name="signature" size={62} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger}>НОВАЯ ПОДПИСЬ</CardTitle>
            <div style={{ ...mono, fontSize: 25, color: theme.danger, opacity: 0.7, textDecoration: "line-through" }}>SIG ???</div>
            <Small color={theme.danger} size={21}>СОЗДАНИЕ ЗАБЛОКИРОВАНО</Small>
          </div>
        </Panel>
        <Arrow left={350} top={585} color={theme.danger} opacity={enter} />
        <Arrow left={687} top={585} color={theme.danger} opacity={enter * (0.3 + blockedP * 0.7)} />
        <Pill label="БЕЗ ЗАКРЫТОГО КЛЮЧА НОВОЙ ПОДПИСИ НЕТ" color={theme.danger} enter={enter * (0.45 + blockedP * 0.55)} top={980} fontSize={20} />
        <PulseRing x={W / 2} y={620} triggerFrame={impactLocal} tone="danger" size={220} />
      </div>
    );
  }

  if (phase === "solarwinds") {
    const payloadP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
        {header}
        <Panel left={42} top={420} width={310} height={440} color={theme.warning} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="building-2" size={64} color={theme.warning} strokeWidth={1.7} />
            <CardTitle color={theme.warning}>{company}</CardTitle>
            <div style={{ ...mono, fontSize: 29, color: theme.text }}>ORION</div>
            <Small color={theme.subtext} size={20}>разработчик обновления</Small>
          </div>
        </Panel>
        <Panel left={385} top={420} width={310} height={440} color={theme.danger} enter={enter * (0.35 + payloadP * 0.65)}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <IconGlyph name="package-check" size={64} color={theme.danger} strokeWidth={1.7} />
            <CardTitle color={theme.danger} size={24}>СБОРКА ORION</CardTitle>
            <div style={{ padding: "12px 19px", borderRadius: 15, border: `2px solid ${theme.danger}99`, background: `${theme.danger}15`, textAlign: "center" }}>
              <Small color={theme.danger} size={22}>вредный компонент</Small>
              <div style={{ ...mono, marginTop: 8, fontSize: 27, color: theme.danger }}>{payload}</div>
            </div>
            <Small color={theme.success} size={20}>SIG ✓ компании</Small>
          </div>
        </Panel>
        <Panel left={728} top={420} width={310} height={440} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <IconGlyph name="cloud-download" size={64} color={theme.accent2} strokeWidth={1.7} />
            <CardTitle color={theme.accent2} size={24}>ОФИЦИАЛЬНЫЙ КАНАЛ</CardTitle>
            <Small color={theme.text} size={22}>обновление → клиенты</Small>
            <Small color={theme.subtext} size={19}>подпись не подделана</Small>
          </div>
        </Panel>
        <Arrow left={350} top={590} color={theme.warning} opacity={enter} />
        <Arrow left={694} top={590} color={theme.warning} opacity={enter} />
        <Pill label="SUNBURST В СБОРКЕ · SIG ✓ КОМПАНИИ" color={theme.warning} enter={enter * (0.45 + payloadP * 0.55)} top={1010} fontSize={22} />
        <PulseRing x={W / 2} y={635} triggerFrame={impactLocal} tone="warning" size={230} />
      </div>
    );
  }

  // boundary: valid authorship is not a code-quality verdict.
  const boundaryP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.7 } });
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: layout.height, overflow: "hidden", fontFamily: theme.font }}>
      {header}
      <Panel left={48} top={420} width={460} height={450} color={theme.danger} enter={enter}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <IconGlyph name="copy" size={64} color={theme.danger} strokeWidth={1.7} />
          <CardTitle color={theme.danger}>ЧУЖАЯ КОПИЯ</CardTitle>
          <div style={{ ...mono, fontSize: 25, color: theme.text }}>ключ: {incomingCertificate}</div>
          <div style={{ padding: "10px 24px", borderRadius: 999, border: `2px solid ${theme.danger}`, background: `${theme.danger}18`, color: theme.danger, ...mono, fontSize: 23 }}>ОТКЛОНЕНО</div>
          <Small color={theme.subtext} size={19}>подписант не совпал</Small>
        </div>
      </Panel>
      <Panel left={572} top={420} width={460} height={450} color={theme.warning} enter={enter * (0.35 + boundaryP * 0.65)}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <IconGlyph name="shield-check" size={64} color={theme.warning} strokeWidth={1.7} />
          <CardTitle color={theme.warning}>ДОВЕРЕННЫЙ КЛЮЧ</CardTitle>
          <div style={{ ...mono, fontSize: 25, color: theme.text }}>ключ: {certificate}</div>
          <div style={{ padding: "10px 20px", borderRadius: 16, border: `2px solid ${theme.danger}88`, background: `${theme.danger}12`, textAlign: "center" }}>
            <Small color={theme.danger} size={21}>код: вредный · {payload}</Small>
            <Small color={theme.success} size={21}>SIG ✓ доверенного ключа</Small>
          </div>
          <Small color={theme.warning} size={20}>доброта кода? не проверяется</Small>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: W / 2, top: 590, transform: "translateX(-50%)", color: theme.warning, ...mono, fontSize: 44, opacity: enter }}>≠</div>
      <Pill label="ПОДПИСЬ ≠ ПРОВЕРКА ДОБРОТЫ КОДА" color={theme.warning} enter={enter * (0.45 + boundaryP * 0.55)} top={1020} fontSize={22} />
      <PulseRing x={W - 250} y={650} triggerFrame={impactLocal} tone="warning" size={230} />
    </div>
  );
};
