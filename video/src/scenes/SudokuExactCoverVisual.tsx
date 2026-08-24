import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme, toneColor } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type SudokuExactCoverPhase = "matrix" | "cover" | "uncover";

const W = layout.width;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => clamp01(t) * clamp01(t) * (3 - 2 * clamp01(t));

// 4 группы ограничений по 81 столбцу
const GROUPS = [
  { key: "cell", label: "КЛЕТКА", sub: "81", color: theme.accent, highlightKeys: ["constraint-cell", "columns", "one-cell"] },
  { key: "row", label: "СТРОКА", sub: "81", color: theme.accent2, highlightKeys: ["constraint-row", "one-row"] },
  { key: "col", label: "СТОЛБЕЦ", sub: "81", color: theme.success, highlightKeys: ["constraint-col", "one-col"] },
  { key: "box", label: "КВАДРАТ", sub: "81", color: theme.warning, highlightKeys: ["constraint-box", "one-box"] },
] as const;

const MATRIX_W = 860;
const MATRIX_H = 620;
const MATRIX_LEFT = (W - MATRIX_W) / 2;
const MATRIX_TOP = 520;
const HEADER_H = 64;
const ROWS_SHOWN = 18; // визуально сжатая версия 729 строк
const COLS_PER_GROUP = 6; // сжатая версия 81 столбца
const CELL_GAP = 3;
const GROUP_GAP = 12;

export const SudokuExactCoverVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SudokuExactCoverPhase;
  highlight?: string;
}> = ({ local, fps, impactLocal, phase = "matrix", highlight = "" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impactP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const hit = local >= impactLocal;

  // заголовок в зависимости от фазы
  const title =
    phase === "matrix"
      ? "МАТРИЦА ТОЧНОГО ПОКРЫТИЯ"
      : phase === "cover"
        ? "ALGORITHM X  ·  COVER"
        : "DANCING LINKS  ·  UNCOVER";
  const subtitle =
    phase === "matrix"
      ? "729 КАНДИДАТОВ  ×  324 ОГРАНИЧЕНИЯ"
      : phase === "cover"
        ? "ВЫБРАЛИ СТОЛБЕЦ — СКРЫВАЕМ СТРОКИ"
        : "ОТКАТ — ВОЗВРАЩАЕМ СВЯЗИ";

  // для matrix фазы — какой элемент подсвечен
  const isColumns = highlight === "columns" || highlight === "total";
  const isCount = highlight === "count" || highlight === "total";
  const isRows = highlight === "rows" || highlight === "count";
  const isOnes = highlight === "ones";
  const activeGroupKey = GROUPS.find((g) => g.highlightKeys.includes(highlight as never))?.key ?? null;
  const oneGroupKey =
    highlight === "one-cell" ? "cell" : highlight === "one-row" ? "row" : highlight === "one-col" ? "col" : highlight === "one-box" ? "box" : null;

  // геометрия сжатой матрицы
  const groupW = (MATRIX_W - 3 * GROUP_GAP) / 4;
  const colW = (groupW - (COLS_PER_GROUP - 1) * CELL_GAP) / COLS_PER_GROUP;
  const rowH = (MATRIX_H - HEADER_H - (ROWS_SHOWN - 1) * CELL_GAP) / ROWS_SHOWN;

  // выбранный столбец для cover/uncover
  const chosenGroupIdx = 1; // строка-группа для демо
  const chosenColIdx = 2;
  const chosenGroupLeft = MATRIX_LEFT + chosenGroupIdx * (groupW + GROUP_GAP);
  const chosenX = chosenGroupLeft + chosenColIdx * (colW + CELL_GAP) + colW / 2;
  const coverProgress = phase === "cover" ? smooth(clamp01((local - impactLocal + 8) / 18)) : 0;
  const uncoverProgress = phase === "uncover" ? smooth(clamp01((local - impactLocal + 8) / 20)) : 0;

  // какие строки покрываются выбранным столбцом (детерминированно)
  const coveredRows = [3, 7, 11, 14]; // индексы строк, которые имеют 1 в выбранном столбце
  const coveredSet = new Set(coveredRows);

  return (
    <>
      {/* заголовки */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 26,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "absolute",
          left: W /2,
          top: 360,
          transform: "translateX(-50%)",
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 36,
          color: phase === "uncover" ? theme.success : phase === "cover" ? theme.danger : theme.text,
          opacity: enter,
          textAlign: "center",
          textShadow: hit ? `0 0 28px ${phase === "uncover" ? theme.success : phase === "cover" ? theme.danger : theme.accent}66` : "none",
        }}
      >
        {subtitle}
      </div>

      {/* контейнер матрицы */}
      <div
        style={{
          position: "absolute",
          left: MATRIX_LEFT,
          top: MATRIX_TOP,
          width: MATRIX_W,
          height: MATRIX_H,
          borderRadius: 22,
          background: "#0A0F18",
          border: `3px solid ${theme.panelBorder}`,
          overflow: "hidden",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* шапки групп */}
        {GROUPS.map((g, gi) => {
          const left = gi * (groupW + GROUP_GAP);
          const active = phase === "matrix" && (isColumns || activeGroupKey === g.key || oneGroupKey === g.key);
          const dimmed = phase === "matrix" && activeGroupKey && activeGroupKey !== g.key && !isColumns && !isOnes && oneGroupKey !== g.key ? 0.28 : 1;
          const bg = active ? `${g.color}22` : "#141A26";
          const border = active ? g.color : theme.panelBorder;
          return (
            <div
              key={g.key}
              style={{
                position: "absolute",
                left,
                top: 0,
                width: groupW,
                height: HEADER_H,
                background: bg,
                borderRight: gi < 3 ? `2px solid ${theme.panelBorder}` : undefined,
                borderBottom: `3px solid ${border}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                opacity: dimmed,
              }}
            >
              <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 20, color: g.color, letterSpacing: 1 }}>{g.label}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>{g.sub}</div>
            </div>
          );
        })}

        {/* сетка строк — 4 единицы на строку */}
        {Array.from({ length: ROWS_SHOWN }).map((_, row) => {
          // детерминированные позиции 4 единиц: по одной в каждой группе
          // col indices cycle deterministically
          const cols = [
            (row * 3) % COLS_PER_GROUP,
            (row * 5 + 1) % COLS_PER_GROUP,
            (row * 2 + 2) % COLS_PER_GROUP,
            (row * 7 + 3) % COLS_PER_GROUP,
          ];
          const isCovered = phase !== "matrix" && coveredSet.has(row);
          const rowOpacity = phase === "cover" ? (isCovered ? 1 - 0.92 * coverProgress : 1 - 0.18 * coverProgress) : phase === "uncover" ? (isCovered ? 0.08 + 0.92 * uncoverProgress : 0.82 + 0.18 * uncoverProgress) : 1;
          const rowBg = isCovered && phase === "cover" && coverProgress > 0.5 ? `${theme.danger}18` : isCovered && phase === "uncover" && uncoverProgress > 0.4 ? `${theme.success}18` : "transparent";

          return (
            <div
              key={row}
              style={{
                position: "absolute",
                left: 0,
                top: HEADER_H + row * (rowH + CELL_GAP),
                width: MATRIX_W,
                height: rowH,
                background: rowBg,
                opacity: rowOpacity,
                display: "flex",
                gap: GROUP_GAP,
              }}
            >
              {GROUPS.map((g, gi) => {
                const colIdx = cols[gi];
                const isChosenCell = phase !== "matrix" && gi === chosenGroupIdx && colIdx === chosenColIdx && isCovered;
                const cellHighlight =
                  phase === "matrix" &&
                  ((highlight === "ones" && true) ||
                    oneGroupKey === g.key ||
                    activeGroupKey === g.key ||
                    isColumns);
                // для highlight "ones" — все 4 единицы светятся сильнее
                // для one-* — только одна группа
                const shouldGlow = phase === "matrix" ? (oneGroupKey ? oneGroupKey === g.key : cellHighlight) : isChosenCell;

                return (
                  <div key={g.key} style={{ width: groupW, display: "flex", gap: CELL_GAP }}>
                    {Array.from({ length: COLS_PER_GROUP }).map((__, ci) => {
                      const isOne = ci === colIdx;
                      const bg = isOne
                        ? shouldGlow
                          ? g.color
                          : `${g.color}CC`
                        : "#1B2434";
                      const opacity = isOne ? 1 : 0.55;
                      const scale = isOne && shouldGlow ? 1 + 0.06 * Math.sin((local + row * 3 + gi * 7) / 9) : 1;
                      const isTarget = isChosenCell && isOne;
                      return (
                        <div
                          key={ci}
                          style={{
                            width: colW,
                            height: rowH,
                            borderRadius: 6,
                            background: bg,
                            opacity: isOne ? opacity * (phase === "cover" && isCovered ? 1 - 0.2 * coverProgress : 1) : opacity * 0.6,
                            transform: `scale(${scale})`,
                            boxShadow: isTarget ? `0 0 18px ${g.color}` : isOne && shouldGlow ? `0 0 12px ${g.color}99` : "none",
                            border: isOne ? `1px solid ${g.color}` : `1px solid #232C3D`,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* номер строки слева (для highlight rows/count) */}
              {isRows && row < 4 ? (
                <div
                  style={{
                    position: "absolute",
                    left: -44,
                    top: 0,
                    width: 36,
                    height: rowH,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: theme.mono,
                    fontSize: 14,
                    color: theme.accent,
                    opacity: enter,
                  }}
                >
                  {row + 1}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* вертикальная линия выбранного столбца для cover/uncover */}
        {phase !== "matrix" ? (
          <div
            style={{
              position: "absolute",
              left: chosenX - 1,
              top: HEADER_H,
              width: 3,
              height: MATRIX_H - HEADER_H,
              background: phase === "cover" ? theme.danger : theme.success,
              opacity: phase === "cover" ? 0.55 + 0.45 * impactP : 0.55 + 0.45 * impactP,
              boxShadow: `0 0 18px ${phase === "cover" ? theme.danger : theme.success}`,
            }}
          />
        ) : null}

        {/* бейдж скрытых строк */}
        {phase === "cover" && hit ? (
          <div
            style={{
              position: "absolute",
              right: 14,
              top: HEADER_H + 14,
              padding: "8px 14px",
              borderRadius: 999,
              background: `${theme.danger}22`,
              border: `2px solid ${theme.danger}`,
              color: theme.danger,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 18,
              opacity: impactP,
              transform: `scale(${impactP})`,
            }}
          >
            {highlight === "hide" ? "4 СТРОКИ СПРЯТАНЫ" : highlight === "cover" ? "COVER" : "ВЫБРАН СТОЛБЕЦ"}
          </div>
        ) : null}
        {phase === "uncover" && hit ? (
          <div
            style={{
              position: "absolute",
              right: 14,
              top: HEADER_H + 14,
              padding: "8px 14px",
              borderRadius: 999,
              background: `${theme.success}22`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 18,
              opacity: impactP,
              transform: `scale(${impactP})`,
            }}
          >
            {highlight === "restore" ? "СТРОКИ ВЕРНУЛИСЬ" : highlight === "links" ? "СВЯЗИ ВОССТАНОВЛЕНЫ" : "UNCOVER"}
          </div>
        ) : null}
      </div>

      {/* нижняя легенда / числа */}
      {phase === "matrix" ? (
        <>
          {/* 729 × 324 бейдж */}
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: MATRIX_TOP + MATRIX_H + 28,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 18,
              opacity: enter,
            }}
          >
            <div
              style={{
                padding: "14px 22px",
                borderRadius: 16,
                background: isRows || isCount ? `${theme.accent}1A` : theme.panel,
                border: `3px solid ${isRows || isCount ? theme.accent : theme.panelBorder}`,
                textAlign: "center",
                boxShadow: isRows || isCount ? `0 0 28px ${theme.accent}33` : "none",
                transform: `scale(${isRows || isCount ? 1.05 : 1})`,
              }}
            >
              <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>СТРОК</div>
              <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 36, color: isRows || isCount ? theme.accent : theme.text }}>729</div>
              <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext }}>81 × 9</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: theme.subtext }}>×</div>
            <div
              style={{
                padding: "14px 22px",
                borderRadius: 16,
                background: isColumns || isCount ? `${theme.accent2}1A` : theme.panel,
                border: `3px solid ${isColumns || isCount ? theme.accent2 : theme.panelBorder}`,
                textAlign: "center",
                boxShadow: isColumns || isCount ? `0 0 28px ${theme.accent2}33` : "none",
                transform: `scale(${isColumns || isCount ? 1.05 : 1})`,
              }}
            >
              <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>СТОЛБЦОВ</div>
              <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 36, color: isColumns || isCount ? theme.accent2 : theme.text }}>324</div>
              <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext }}>4 × 81</div>
            </div>
          </div>

          {/* подпись 4 единицы */}
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: MATRIX_TOP + MATRIX_H + 230,
              transform: "translateX(-50%)",
              padding: "12px 20px",
              borderRadius: 999,
              background: isOnes || oneGroupKey ? `${theme.success}18` : `${theme.panel}CC`,
              border: `2px solid ${isOnes || oneGroupKey ? theme.success : theme.panelBorder}`,
              color: isOnes || oneGroupKey ? theme.success : theme.subtext,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 22,
              opacity: enter,
              boxShadow: isOnes ? `0 0 28px ${theme.success}33` : "none",
            }}
          >
            {highlight === "ones"
              ? "РОВНО 4 ЕДИНИЦЫ В СТРОКЕ"
              : highlight === "one-cell"
                ? "1 — КЛЕТКА ЗАНЯТА"
                : highlight === "one-row"
                  ? "1 — ЦИФРА В СТРОКЕ"
                  : highlight === "one-col"
                    ? "1 — ЦИФРА В СТОЛБЦЕ"
                    : highlight === "one-box"
                      ? "1 — ЦИФРА В КВАДРАТЕ"
                      : highlight?.startsWith("constraint-")
                        ? "ГРУППА 81"
                        : "КАЖДАЯ СТРОКА — КАНДИДАТ"}
          </div>
        </>
      ) : null}

      {phase === "cover" ? (
        <>
          {/* указатель на выбранный столбец */}
          <div
            style={{
              position: "absolute",
              left: chosenX,
              top: MATRIX_TOP - 46,
              transform: "translateX(-50%)",
              padding: "8px 16px",
              borderRadius: 999,
              background: theme.danger,
              color: "#06121A",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 18,
              opacity: enter,
              boxShadow: `0 0 24px ${theme.danger}88`,
            }}
          >
            МИНИМУМ
          </div>
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: MATRIX_TOP + MATRIX_H + 40,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 22,
              color: theme.subtext,
              opacity: enter,
              textAlign: "center",
            }}
          >
            {highlight === "choose" ? "← столбец с минимумом кандидатов" : highlight === "hide" ? "строки с 1 в этом столбце скрыты" : "столбец накрыт — cover"}
          </div>
          {hit ? <PulseRing x={chosenX} y={MATRIX_TOP + HEADER_H + 38} triggerFrame={impactLocal} tone="danger" size={120} /> : null}
        </>
      ) : null}

      {phase === "uncover" ? (
        <>
          {/* двусвязный список — мини-схема */}
          <div
            style={{
              position: "absolute",
              left: W / 2 - 320,
              top: MATRIX_TOP + MATRIX_H + 30,
              width: 640,
              height: 140,
              borderRadius: 20,
              background: theme.panel,
              border: `3px solid ${highlight === "links" ? theme.success : theme.panelBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 28px",
              opacity: enter,
              boxShadow: highlight === "links" ? `0 0 40px ${theme.success}33` : "none",
              transform: `scale(${highlight === "links" ? 1.03 : 1})`,
            }}
          >
            {["L", "X", "R"].map((label, i) => {
              const active = i === 1;
              const restored = uncoverProgress > 0.5;
              return (
                <React.Fragment key={label}>
                  <div
                    style={{
                      width: 110,
                      height: 78,
                      borderRadius: 16,
                      background: active ? (restored ? `${theme.success}22` : `${theme.danger}22`) : theme.panel,
                      border: `3px solid ${active ? (restored ? theme.success : theme.danger) : theme.panelBorder}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: active ? 1 : 0.9,
                      transform: `scale(${active && restored ? 1.06 : 1})`,
                      boxShadow: active && restored ? `0 0 20px ${theme.success}66` : "none",
                    }}
                  >
                    <IconGlyph name={active ? "link-2" : "square"} size={28} color={active ? (restored ? theme.success : theme.danger) : theme.subtext} />
                    <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 18, color: active ? (restored ? theme.success : theme.danger) : theme.subtext, marginTop: 4 }}>
                      {label}
                    </div>
                  </div>
                  {i < 2 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: enter }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 38, height: 3, background: highlight === "links" ? theme.success : theme.subtext, opacity: restored ? 1 : 0.45 }} />
                        <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `9px solid ${highlight === "links" ? theme.success : theme.subtext}`, opacity: restored ? 1 : 0.45 }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, transform: "scaleX(-1)" }}>
                        <div style={{ width: 38, height: 3, background: highlight === "links" ? theme.success : theme.subtext, opacity: restored ? 1 : 0.45 }} />
                        <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `9px solid ${highlight === "links" ? theme.success : theme.subtext}`, opacity: restored ? 1 : 0.45 }} />
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: MATRIX_TOP + MATRIX_H + 200,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 20,
              color: highlight === "links" ? theme.success : theme.subtext,
              opacity: enter,
              textAlign: "center",
              letterSpacing: 1,
            }}
          >
            {highlight === "links" ? "ДВУСВЯЗНЫЕ СПИСКИ  ·  O(1) НА СВЯЗЬ" : highlight === "restore" ? "← строки возвращаются на место" : "откат — uncover"}
          </div>
          {hit && highlight === "restore" ? <PulseRing x={W / 2} y={MATRIX_TOP + MATRIX_H + 100} triggerFrame={impactLocal} tone="success" size={180} /> : null}
        </>
      ) : null}
    </>
  );
};
