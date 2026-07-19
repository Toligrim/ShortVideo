#!/bin/bash
# Синтез SFX-набора движка через ffmpeg — без внешних библиотек и лицензий.
set -e
OUT="$(dirname "$0")/../video/public/sfx"
mkdir -p "$OUT"

# вуш: розовый шум с полосой и огибающей
ffmpeg -v quiet -y -f lavfi -i "anoisesrc=color=pink:d=0.5:a=0.8" \
  -af "highpass=f=300,lowpass=f=2600,afade=t=in:d=0.16,afade=t=out:st=0.2:d=0.3,volume=1.4" \
  "$OUT/whoosh.wav"

# короткий вуш для смены битов
ffmpeg -v quiet -y -f lavfi -i "anoisesrc=color=pink:d=0.28:a=0.8" \
  -af "highpass=f=500,lowpass=f=3400,afade=t=in:d=0.06,afade=t=out:st=0.1:d=0.18,volume=1.2" \
  "$OUT/whoosh-short.wav"

# поп: синус с падающей частотой и экспоненциальным затуханием
ffmpeg -v quiet -y -f lavfi \
  -i "aevalsrc=0.9*sin(2*PI*(160+520*exp(-16*t))*t)*exp(-13*t):d=0.3:s=44100" \
  "$OUT/pop.wav"

# клик: короткий фильтрованный щелчок
ffmpeg -v quiet -y -f lavfi -i "anoisesrc=color=white:d=0.04:a=0.7" \
  -af "highpass=f=1800,afade=t=out:st=0.005:d=0.035,volume=1.3" \
  "$OUT/click.wav"

# дзынь: колокольчик (основной тон + гармоника)
ffmpeg -v quiet -y -f lavfi \
  -i "aevalsrc=(0.55*sin(2*PI*1318*t)+0.3*sin(2*PI*2637*t)+0.12*sin(2*PI*3951*t))*exp(-5.5*t):d=0.9:s=44100" \
  "$OUT/ding.wav"

# слэм: низкий удар + шумовая атака
ffmpeg -v quiet -y \
  -f lavfi -i "aevalsrc=0.95*sin(2*PI*(60+90*exp(-22*t))*t)*exp(-9*t):d=0.5:s=44100" \
  -f lavfi -i "anoisesrc=color=brown:d=0.09:a=0.9" \
  -filter_complex "[1]afade=t=out:st=0.01:d=0.08[n];[0][n]amix=inputs=2:normalize=0,volume=1.5" \
  "$OUT/slam.wav"

ls -la "$OUT"
