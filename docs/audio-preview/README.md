# Audio preview: the veld soundscape and local music (v1.9, D-066)

Made by `npm run audio:preview` (tools/audio/preview.ts) for review; never shipped, in no build.
Each file is 20 seconds as the game plays it: the area's ambience bed, the soundscape at the
area's main light (the real scheduler, seed 42, the rates in `content/client/soundscape.json`
× 2 so that 20 s shows more of each area's set: the game plays half as many),
and the calm music stem, crossfading into the Stampede stem at 15 s (feel.json `crossfadeMs`).
Levels as in the game: music −16, ambience −20 and effects −14 LUFS before their bus, then
each call's level and distance (far = quieter and low-passed), its pan (±0.7) and the master
headroom. All sounds are interim code-made synths (tools/audio); recordings will replace them
(docs/06-ASSET-DELIVERY.md). In a hunt, calls that sound like a penalty creature (hadeda, fish
eagle, kwêvoël) also go quiet around that creature's own appearance; the preview has none.

The spectrogram (`<area>-spectrogram.png`) is time × frequency (0–12 kHz, 80 dB range); a blue
tick and name mark each call's start, the white line the switch to the Stampede stem.

## karoo-autumn — golden

[karoo-autumn.ogg](karoo-autumn.ogg) · [spectrogram](karoo-autumn-spectrogram.png) · 169 KB, -15.9 LUFS, -5.3 dBTP

- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).
- 2.7 s: sfx/amb_wind_gust — near, pan 0.49, -10 dB
- 7.0 s: sfx/amb_laughing_dove — mid, pan -0.37, -17 dB, low-pass 6500 Hz
- 9.0 s: sfx/amb_cape_turtle_dove — mid, pan 0.57, -17 dB, low-pass 6500 Hz
- 14.1 s: sfx/amb_cape_turtle_dove — mid, pan 0.53, -17 dB, low-pass 6500 Hz
- 16.5 s: sfx/amb_wind_gust — near, pan -0.17, -10 dB

The area's set (calls a minute under this light):

- cape_turtle_dove: 3.3 / min (mid, doveDay)
- laughing_dove: 1.7 / min (mid, softDay)
- hadeda: 0.6 / min (far, dawnDusk)
- wind_gust: 1.8 / min (near, windy)
- windpomp: 0.9 / min (far, windy)
- sheep: 0.8 / min (far, daytime)

## bushveld-winter — dawn mist

[bushveld-winter.ogg](bushveld-winter.ogg) · [spectrogram](bushveld-winter-spectrogram.png) · 166 KB, -16.1 LUFS, -5.6 dBTP

- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).
- 2.3 s: sfx/amb_hadeda — far, pan -0.63, -20 dB, low-pass 1500 Hz
- 4.5 s: sfx/amb_francolin — mid, pan -0.13, -15 dB, low-pass 6500 Hz
- 6.2 s: sfx/amb_laughing_dove — mid, pan -0.03, -17 dB, low-pass 6500 Hz
- 11.4 s: sfx/amb_francolin — mid, pan -0.58, -15 dB, low-pass 6500 Hz
- 17.9 s: sfx/amb_cape_turtle_dove — mid, pan 0.53, -17 dB, low-pass 6500 Hz

The area's set (calls a minute under this light):

- cape_turtle_dove: 3.3 / min (mid, doveDay)
- laughing_dove: 2.0 / min (mid, softDay)
- hadeda: 1.3 / min (far, dawnDusk)
- cicada: 0.0 / min (mid, heat)
- francolin: 3.6 / min (mid, morning)
- go_away_bird: 1.0 / min (far, daytime)

## kalahari-summer — midday

[kalahari-summer.ogg](kalahari-summer.ogg) · [spectrogram](kalahari-summer-spectrogram.png) · 164 KB, -15.9 LUFS, -6.4 dBTP

- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).
- 1.8 s: sfx/amb_laughing_dove — mid, pan 0.23, -17 dB, low-pass 6500 Hz
- 4.3 s: sfx/amb_cicada — mid, pan -0.15, -19 dB, low-pass 6500 Hz
- 8.9 s: sfx/amb_cape_turtle_dove — mid, pan 0.61, -17 dB, low-pass 6500 Hz
- 12.2 s: sfx/amb_cicada — mid, pan -0.52, -19 dB, low-pass 6500 Hz
- 17.3 s: sfx/amb_cicada — mid, pan 0.57, -19 dB, low-pass 6500 Hz

The area's set (calls a minute under this light):

- cape_turtle_dove: 1.0 / min (mid, doveDay)
- laughing_dove: 0.9 / min (mid, softDay)
- hadeda: 0.1 / min (far, dawnDusk)
- cicada: 4.0 / min (mid, heat)
- barking_gecko: 0.0 / min (mid, evening)
- korhaan: 1.0 / min (mid, daytime)

## okavango-spring — dusk

[okavango-spring.ogg](okavango-spring.ogg) · [spectrogram](okavango-spring-spectrogram.png) · 175 KB, -16.0 LUFS, -5.0 dBTP

- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).
- 0.8 s: sfx/amb_fish_eagle — far, pan 0.06, -18 dB, low-pass 1500 Hz
- 4.5 s: sfx/amb_reed_frog — mid, pan -0.68, -17 dB, low-pass 6500 Hz
- 7.0 s: sfx/amb_hadeda — far, pan 0.67, -20 dB, low-pass 1500 Hz
- 10.4 s: sfx/amb_hippo — far, pan -0.12, -18 dB, low-pass 1500 Hz
- 13.7 s: sfx/amb_cape_turtle_dove — mid, pan 0.69, -17 dB, low-pass 6500 Hz
- 15.4 s: sfx/amb_laughing_dove — mid, pan -0.52, -17 dB, low-pass 6500 Hz
- 19.6 s: sfx/amb_fish_eagle — far, pan 0.12, -18 dB, low-pass 1500 Hz

The area's set (calls a minute under this light):

- cape_turtle_dove: 1.8 / min (mid, doveDay)
- laughing_dove: 1.2 / min (mid, softDay)
- hadeda: 1.3 / min (far, dawnDusk)
- fish_eagle: 0.9 / min (far, daytime)
- reed_frog: 5.4 / min (mid, evening)
- hippo: 1.0 / min (far, steady)

## namibie — dusk

[namibie.ogg](namibie.ogg) · [spectrogram](namibie-spectrogram.png) · 160 KB, -16.0 LUFS, -5.3 dBTP

- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).
- 1.2 s: sfx/amb_barking_gecko — mid, pan -0.66, -17 dB, low-pass 6500 Hz
- 8.5 s: sfx/amb_barking_gecko — mid, pan -0.58, -17 dB, low-pass 6500 Hz
- 11.0 s: sfx/amb_cape_turtle_dove — mid, pan -0.30, -17 dB, low-pass 6500 Hz
- 15.8 s: sfx/amb_korhaan — mid, pan 0.17, -15 dB, low-pass 6500 Hz
- 18.9 s: sfx/amb_barking_gecko — mid, pan 0.66, -17 dB, low-pass 6500 Hz

The area's set (calls a minute under this light):

- cape_turtle_dove: 1.4 / min (mid, doveDay)
- laughing_dove: 0.8 / min (mid, softDay)
- hadeda: 0.6 / min (far, dawnDusk)
- cicada: 0.0 / min (far, heat)
- barking_gecko: 5.4 / min (mid, evening)
- korhaan: 1.4 / min (mid, daytime)

## oes — golden

[oes.ogg](oes.ogg) · [spectrogram](oes-spectrogram.png) · 46 KB, -34.1 LUFS, -21.3 dBTP

- No music or ambience bed is delivered for this area: the soundscape alone.
- 0.8 s: sfx/amb_laughing_dove — mid, pan -0.03, -17 dB, low-pass 6500 Hz
- 8.4 s: sfx/amb_cape_turtle_dove — mid, pan -0.36, -17 dB, low-pass 6500 Hz
- 12.6 s: sfx/amb_cicada — mid, pan -0.52, -19 dB, low-pass 6500 Hz
- 19.1 s: sfx/amb_cape_turtle_dove — mid, pan -0.64, -17 dB, low-pass 6500 Hz

The area's set (calls a minute under this light):

- cape_turtle_dove: 3.3 / min (mid, doveDay)
- laughing_dove: 2.2 / min (mid, softDay)
- hadeda: 0.4 / min (far, dawnDusk)
- cicada: 2.0 / min (mid, heat)
- francolin: 0.9 / min (mid, morning)

