import React, { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { Lottie, LottieAnimationData } from "@remotion/lottie";

/** Готовая Lottie-анимация из public/lottie/<name>.json (кладём только CC/бесплатные).
 *  Для кузницы: анимированный замок/щит/лупа дешевле, чем рисовать с нуля. */
export const LottieGlyph: React.FC<{
  name: string; // имя файла без .json
  size?: number;
  loop?: boolean;
}> = ({ name, size = 200, loop = true }) => {
  const [data, setData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender(`lottie-${name}`));

  useEffect(() => {
    fetch(staticFile(`lottie/${name}.json`))
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [handle, name]);

  if (!data) return null;
  return (
    <div style={{ width: size, height: size }}>
      <Lottie animationData={data} loop={loop} />
    </div>
  );
};
