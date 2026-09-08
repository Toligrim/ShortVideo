import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

const W = layout.width;

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};

export type OriginCheckPhase =
  | "phishing"
  | "address"
  | "compare"
  | "analogy"
  | "mismatch"
  | "reject";

type RejectVariant = "house" | "field" | "phishing";

const panel = (color: string): React.CSSProperties => ({
  borderRadius: 24,
  background: `${theme.panel}F2`,
  border: `3px solid ${color}66`,
  boxShadow: `0 0 42px ${color}20`,
});

const AddressText: React.FC<{
  value: string;
  color?: string;
  fontSize?: number;
}> = ({ value, color = theme.text, fontSize = 25 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      color,
      fontFamily: theme.mono,
      fontSize,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}
  >
    <IconGlyph name="globe" size={26} color={color} strokeWidth={1.8} />
    <span>{value}</span>
  </div>
);

const BrowserDots: React.FC = () => (
  <div style={{ display: "flex", gap: 12 }}>
    {["#FF5F57", "#FEBC2E", "#28C840"].map((color) => (
      <div key={color} style={{ width: 18, height: 18, borderRadius: 9, background: color }} />
    ))}
  </div>
);

const PasswordField: React.FC<{ color?: string; compact?: boolean }> = ({
  color = theme.danger,
  compact = false,
}) => (
  <div
    style={{
      height: compact ? 62 : 78,
      borderRadius: 16,
      border: `3px solid ${color}99`,
      background: `${color}12`,
      display: "flex",
      alignItems: "center",
      padding: compact ? "0 16px" : "0 22px",
      gap: 12,
      color,
      fontFamily: theme.mono,
      fontSize: compact ? 19 : 23,
      fontWeight: 800,
    }}
  >
    <IconGlyph name="key-round" size={compact ? 25 : 30} color={color} strokeWidth={1.8} />
    <span>ПАРОЛЬ</span>
    <span style={{ marginLeft: "auto", color: theme.subtext }}>ПУСТО</span>
  </div>
);

const BrowserPage: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  address: string;
  enter: number;
  addressColor?: string;
  compact?: boolean;
}> = ({ left, top, width, height, address, enter, addressColor = theme.text, compact = false }) => {
  const pad = compact ? 24 : 34;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        ...panel(theme.accent),
        overflow: "hidden",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 38}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div
        style={{
          height: compact ? 72 : 88,
          background: theme.panel,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: `0 ${pad}px`,
        }}
      >
        <BrowserDots />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 12,
            background: "#0D1420",
            padding: compact ? "8px 8px" : "12px 18px",
            overflow: "hidden",
          }}
        >
          <AddressText value={address} color={addressColor} fontSize={compact ? 15 : 23} />
        </div>
      </div>
      <div style={{ position: "absolute", left: pad, right: pad, top: compact ? 122 : 152 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: theme.accent,
            fontFamily: theme.font,
            fontSize: compact ? 25 : 31,
            fontWeight: 800,
          }}
        >
          <div
            style={{
              width: compact ? 52 : 64,
              height: compact ? 52 : 64,
              borderRadius: 18,
              border: `3px solid ${theme.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${theme.accent}18`,
            }}
          >
            <IconGlyph name="landmark" size={compact ? 29 : 36} color={theme.accent} strokeWidth={1.8} />
          </div>
          <span>БАНК · ВХОД</span>
        </div>
        <div
          style={{
            marginTop: compact ? 24 : 34,
            height: compact ? 56 : 66,
            borderRadius: 14,
            border: `2px solid ${theme.panelBorder}`,
            color: theme.subtext,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            fontFamily: theme.mono,
            fontSize: compact ? 18 : 22,
          }}
        >
          имя пользователя
        </div>
        <div style={{ marginTop: compact ? 14 : 18 }}>
          <PasswordField compact={compact} />
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{
  text: string;
  color: string;
  enter: number;
  top: number;
}> = ({ text, color, enter, top }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: "translateX(-50%)",
      padding: "15px 30px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      ...mono,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity: enter,
      boxShadow: `0 0 34px ${color}22`,
    }}
  >
    {text}
  </div>
);

export const OriginCheckVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: OriginCheckPhase;
  variant?: RejectVariant;
}> = ({ local, fps, impactLocal, phase = "phishing", variant = "phishing" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({
    frame: Math.max(0, local - impactLocal),
    fps,
    config: { damping: 12, mass: 0.7 },
  });

  if (phase === "phishing") {
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        <BrowserPage
          left={55}
          top={350}
          width={970}
          height={660}
          address="https://bank-login.example:8080/login"
          enter={enter}
          addressColor={theme.warning}
        />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1055,
            transform: "translateX(-50%)",
            color: theme.warning,
            ...mono,
            fontSize: 23,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          ЛОГОТИП ПОХОЖ · ДОМЕН ДРУГОЙ
        </div>
        <StatusBadge text="МЕНЕДЖЕР МОЛЧИТ · ПОЛЕ ПУСТО" color={theme.danger} enter={enter} top={1140} />
        <PulseRing x={540} y={745} triggerFrame={impactLocal} tone="danger" size={220} />
      </div>
    );
  }

  if (phase === "address") {
    const parts = [
      { label: "СХЕМА", value: "https", color: theme.accent },
      { label: "ХОСТ", value: "bank.example", color: theme.accent2 },
      { label: "ПОРТ", value: "443", color: theme.success },
    ];
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: 55,
            top: 350,
            width: 970,
            height: 108,
            ...panel(theme.accent),
            display: "flex",
            alignItems: "center",
            padding: "0 28px",
            opacity: enter,
          }}
        >
          <AddressText value="https://bank.example:443/login" fontSize={29} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 55,
            top: 505,
            width: 970,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          {parts.map((part, index) => (
            <div
              key={part.label}
              style={{
                height: 300,
                ...panel(part.color),
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 20,
                padding: "0 22px",
                opacity: enter,
                transform: `translateY(${(1 - spring({ frame: Math.max(0, local - index * 5), fps, config: { damping: 14, mass: 0.75 } })) * 28}px)`,
              }}
            >
              <div style={{ ...mono, color: part.color, fontSize: 22, textAlign: "center" }}>{part.label}</div>
              <div
                style={{
                  minHeight: 96,
                  borderRadius: 18,
                  background: `${part.color}16`,
                  border: `2px solid ${part.color}88`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.text,
                  fontFamily: theme.mono,
                  fontSize: part.label === "ХОСТ" ? 23 : 34,
                  fontWeight: 800,
                  overflow: "hidden",
                }}
              >
                {part.value}
              </div>
              <div style={{ color: theme.subtext, fontFamily: theme.font, fontSize: 20, textAlign: "center" }}>
                часть адреса
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 115,
            top: 930,
            width: 850,
            height: 150,
            ...panel(theme.success),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ ...mono, color: theme.success, fontSize: 21 }}>СОХРАНЁННАЯ ЗАПИСЬ</div>
          <AddressText value="https://bank.example:443" color={theme.text} fontSize={24} />
        </div>
        <StatusBadge text="СХЕМА · ХОСТ · ПОРТ" color={theme.accent} enter={enter} top={1160} />
        <PulseRing x={540} y={995} triggerFrame={impactLocal} tone="accent" size={180} />
      </div>
    );
  }

  if (phase === "compare") {
    const rows = [
      { label: "СХЕМА", current: "https", saved: "https", color: theme.accent },
      { label: "ХОСТ", current: "bank.example", saved: "bank.example", color: theme.accent2 },
      { label: "ПОРТ", current: "443", saved: "443", color: theme.success },
    ];
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 55, top: 350, width: 455, height: 170, ...panel(theme.accent), opacity: enter, padding: "25px 26px" }}>
          <div style={{ ...mono, color: theme.accent, fontSize: 19, marginBottom: 17 }}>АДРЕС СТРАНИЦЫ</div>
          <AddressText value="https://bank.example:443/login" fontSize={19} />
        </div>
        <div style={{ position: "absolute", left: 570, top: 350, width: 455, height: 170, ...panel(theme.success), opacity: enter, padding: "25px 26px" }}>
          <div style={{ ...mono, color: theme.success, fontSize: 19, marginBottom: 17 }}>СОХРАНЁННАЯ ЗАПИСЬ</div>
          <AddressText value="https://bank.example:443" fontSize={21} />
        </div>
        <div style={{ position: "absolute", left: 70, top: 590, width: 940, display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map((row, index) => {
            const rowEnter = spring({ frame: Math.max(0, local - index * 5), fps, config: { damping: 14, mass: 0.75 } });
            const checked = reveal > 0.45;
            return (
              <div
                key={row.label}
                style={{
                  height: 86,
                  borderRadius: 18,
                  border: `2px solid ${row.color}66`,
                  background: `${row.color}10`,
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 70px 1fr 60px",
                  alignItems: "center",
                  padding: "0 20px",
                  opacity: enter * rowEnter,
                  transform: `translateX(${(1 - rowEnter) * 35}px)`,
                  color: theme.text,
                  fontFamily: theme.mono,
                  fontSize: row.label === "ХОСТ" ? 21 : 25,
                  fontWeight: 800,
                }}
              >
                <span style={{ color: row.color, fontSize: 19 }}>{row.label}</span>
                <span style={{ textAlign: "right" }}>{row.current}</span>
                <span style={{ textAlign: "center", color: theme.subtext }}>↔</span>
                <span>{row.saved}</span>
                <span style={{ color: checked ? theme.success : theme.subtext, fontSize: 31 }}>{checked ? "✓" : "?"}</span>
              </div>
            );
          })}
        </div>
        <StatusBadge text="ТРИ ЧАСТИ СОВПАЛИ · ЗАПИСЬ УЗНАНА" color={theme.success} enter={enter * (0.4 + reveal * 0.6)} top={1095} />
        <PulseRing x={540} y={815} triggerFrame={impactLocal} tone="success" size={190} />
      </div>
    );
  }

  if (phase === "analogy") {
    const rows = [
      { label: "УЛИЦА", value: "БАНКОВСКАЯ", color: theme.accent },
      { label: "НОМЕР ДОМА", value: "12", color: theme.accent2 },
      { label: "ПОДЪЕЗД", value: "3", color: theme.success },
    ];
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 65, top: 385, width: 275, height: 465, ...panel(theme.warning), opacity: enter, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <IconGlyph name="clipboard-check" size={82} color={theme.warning} strokeWidth={1.6} />
          <div style={{ ...mono, color: theme.warning, fontSize: 24 }}>КОНТРОЛЁР</div>
          <div style={{ color: theme.text, fontFamily: theme.font, fontSize: 27, fontWeight: 800 }}>сверяет адрес</div>
          <div style={{ color: theme.subtext, fontFamily: theme.mono, fontSize: 18 }}>не только вывеску</div>
        </div>
        <div style={{ position: "absolute", left: 390, top: 385, width: 625, height: 465, ...panel(theme.accent), opacity: enter, padding: "30px 34px" }}>
          <div style={{ ...mono, color: theme.accent, fontSize: 22, textAlign: "center", marginBottom: 22 }}>ПОЛНЫЙ АДРЕС · «БАНК»</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((row, index) => (
              <div key={row.label} style={{ height: 76, borderRadius: 16, border: `2px solid ${row.color}66`, background: `${row.color}10`, display: "flex", alignItems: "center", padding: "0 20px", gap: 18, opacity: enter, transform: `translateX(${(1 - spring({ frame: Math.max(0, local - index * 5), fps, config: { damping: 14, mass: 0.75 } })) * 24}px)` }}>
                <span style={{ ...mono, color: row.color, width: 175, fontSize: 19 }}>{row.label}</span>
                <span style={{ color: theme.text, fontFamily: theme.mono, fontSize: row.label === "УЛИЦА" ? 23 : 29, fontWeight: 800 }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ color: theme.subtext, fontFamily: theme.font, fontSize: 21, textAlign: "center", marginTop: 18 }}>улица · дом · подъезд</div>
        </div>
        <div style={{ position: "absolute", left: 328, top: 600, width: 62, borderTop: `3px dashed ${theme.warning}99`, opacity: enter }} />
        <div style={{ position: "absolute", left: 320, top: 585, opacity: enter }}>
          <IconGlyph name="arrow-right" size={34} color={theme.warning} strokeWidth={1.8} />
        </div>
        <StatusBadge text="ПРОВЕРКА ПО ПОЛНОМУ АДРЕСУ" color={theme.warning} enter={enter} top={1085} />
        <PulseRing x={704} y={620} triggerFrame={impactLocal} tone="warning" size={170} />
      </div>
    );
  }

  if (phase === "mismatch") {
    const columns = [
      {
        left: 50,
        title: "СОХРАНЁННАЯ ЗАПИСЬ",
        color: theme.success,
        address: "https://bank.example:443/login",
        parts: ["https", "bank.example", "443"],
      },
      {
        left: 565,
        title: "АДРЕС СТРАНИЦЫ",
        color: theme.danger,
        address: "http://bank-login.example:8080/login",
        parts: ["http", "bank-login.example", "8080"],
      },
    ];
    const labels = ["СХЕМА", "ХОСТ", "ПОРТ"];
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        {columns.map((column) => (
          <div key={column.title} style={{ position: "absolute", left: column.left, top: 370, width: 465, height: 485, ...panel(column.color), opacity: enter, padding: "28px 24px" }}>
            <div style={{ ...mono, color: column.color, fontSize: 19, textAlign: "center", marginBottom: 18 }}>{column.title}</div>
            <div style={{ color: theme.text, fontFamily: theme.mono, fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", marginBottom: 20 }}>{column.address}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {column.parts.map((part, index) => (
                <div key={labels[index]} style={{ height: 77, borderRadius: 15, border: `2px solid ${column.color}66`, background: `${column.color}10`, display: "flex", alignItems: "center", padding: "0 15px", gap: 14 }}>
                  <span style={{ ...mono, color: column.color, fontSize: 17, width: 93 }}>{labels[index]}</span>
                  <span style={{ color: theme.text, fontFamily: theme.mono, fontSize: index === 1 ? 19 : 26, fontWeight: 800 }}>{part}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", left: 495, top: 585, width: 90, borderTop: `3px dashed ${theme.danger}99`, opacity: enter }} />
        <div style={{ position: "absolute", left: 540, top: 545, transform: `scale(${0.85 + reveal * 0.15})`, color: theme.danger, opacity: enter }}><IconGlyph name="x" size={60} color={theme.danger} strokeWidth={2.2} /></div>
        <StatusBadge text="СХЕМА · ХОСТ · ПОРТ — ДРУГАЯ ТОЧКА" color={theme.danger} enter={enter * (0.35 + reveal * 0.65)} top={1060} />
        <PulseRing x={540} y={585} triggerFrame={impactLocal} tone="danger" size={190} />
      </div>
    );
  }

  if (variant === "house") {
    return (
      <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 62, top: 390, width: 430, height: 430, ...panel(theme.success), opacity: enter, padding: "28px 25px" }}>
          <div style={{ ...mono, color: theme.success, fontSize: 20, textAlign: "center" }}>ДОМ ИЗ ЗАПИСИ</div>
          <IconGlyph name="house" size={78} color={theme.success} strokeWidth={1.6} />
          <div style={{ color: theme.text, fontFamily: theme.font, fontSize: 28, fontWeight: 800, textAlign: "center", margin: "8px 0 22px" }}>БАНК</div>
          <div style={{ ...mono, color: theme.subtext, fontSize: 18, lineHeight: 1.8, textAlign: "center" }}>БАНКОВСКАЯ · 12 · 3</div>
          <div style={{ ...mono, color: theme.success, fontSize: 19, textAlign: "center", marginTop: 18 }}>АДРЕС СОВПАЛ</div>
        </div>
        <div style={{ position: "absolute", left: 588, top: 390, width: 430, height: 430, ...panel(theme.danger), opacity: enter, padding: "28px 25px" }}>
          <div style={{ ...mono, color: theme.danger, fontSize: 20, textAlign: "center" }}>ПОХОЖИЙ ДОМ</div>
          <IconGlyph name="house" size={78} color={theme.danger} strokeWidth={1.6} />
          <div style={{ color: theme.text, fontFamily: theme.font, fontSize: 28, fontWeight: 800, textAlign: "center", margin: "8px 0 22px" }}>БАНК</div>
          <div style={{ ...mono, color: theme.danger, fontSize: 18, lineHeight: 1.8, textAlign: "center" }}>БАНКОВСКАЯ · 12А · 3</div>
          <div style={{ ...mono, color: theme.danger, fontSize: 19, textAlign: "center", marginTop: 18 }}>ВЫВЕСКА ТА ЖЕ · АДРЕС ДРУГОЙ</div>
        </div>
        <div style={{ position: "absolute", left: 480, top: 600, color: theme.danger, opacity: enter }}><IconGlyph name="ban" size={110} color={theme.danger} strokeWidth={1.8} /></div>
        <StatusBadge text="ПОХОЖАЯ ВЫВЕСКА НЕ ПРОШЛА ПРОВЕРКУ" color={theme.danger} enter={enter * (0.35 + reveal * 0.65)} top={1065} />
        <PulseRing x={540} y={650} triggerFrame={impactLocal} tone="danger" size={190} />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: W, height: 1280, overflow: "hidden" }}>
      <BrowserPage
        left={50}
        top={360}
        width={530}
        height={570}
        address={variant === "field" ? "http://bank-login.example:8080/login" : "https://bank.example.evil:443/login"}
        enter={enter}
        addressColor={theme.danger}
        compact
      />
      <div style={{ position: "absolute", left: 630, top: 360, width: 400, height: 570, ...panel(theme.accent2), opacity: enter, padding: "34px 28px" }}>
        <IconGlyph name="lock-keyhole" size={72} color={theme.accent2} strokeWidth={1.6} />
        <div style={{ ...mono, color: theme.accent2, fontSize: 22, marginTop: 16 }}>МЕНЕДЖЕР</div>
        <div style={{ color: theme.subtext, fontFamily: theme.font, fontSize: 19, marginTop: 34 }}>сохранённая запись</div>
        <div style={{ color: theme.text, fontFamily: theme.mono, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", marginTop: 14 }}>https://bank.example:443</div>
        <div style={{ marginTop: 35, padding: "19px 14px", borderRadius: 16, background: `${theme.accent2}12`, border: `2px solid ${theme.accent2}66`, color: theme.accent2, ...mono, fontSize: 22, textAlign: "center" }}>••••••••</div>
        <div style={{ color: theme.danger, fontFamily: theme.font, fontSize: 21, fontWeight: 800, textAlign: "center", marginTop: 30 }}>СЕКРЕТ НЕ ВЫДАН</div>
      </div>
      <div style={{ position: "absolute", left: 560, top: 632, width: 65, borderTop: `4px dashed ${theme.danger}99`, opacity: enter }} />
      <div style={{ position: "absolute", left: 560, top: 595, color: theme.danger, opacity: enter }}><IconGlyph name="ban" size={76} color={theme.danger} strokeWidth={1.8} /></div>
      <StatusBadge text="ОТКАЗ · ФИШИНГОВЫЙ ДОМЕН НЕ ПОЛУЧИЛ ПАРОЛЬ" color={theme.danger} enter={enter * (0.35 + reveal * 0.65)} top={1070} />
      <PulseRing x={593} y={632} triggerFrame={impactLocal} tone="danger" size={180} />
    </div>
  );
};
