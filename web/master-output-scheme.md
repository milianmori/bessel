# Master Output Scheme

Aktueller Signalfluss der Web-Audio-Engine mit messbasiertem Master-Bus.

```text
Per-Voice Synthesis
  kick / subbass / perc modal voices
          |
          v
Voice Mix
  Summe aller aktiven Voices
  / sqrt(activeVoiceCount)
          |
          v
Pre-Master Stereo Bus
  sauberes Float-Signal aus dem Synth-Worklet
          |
          v
3-Band Crossover
  Low:    < 120 Hz
  Mid:    120 Hz - 3.2 kHz
  High:   > 3.2 kHz
          |
          +-------------------------------+
          |                               |
          v                               v
Live Detection pro Band           Messfenster nach Aenderung
  peak env                        Trigger:
  RMS env                         preset load / random voice
  crest                           voice add/remove / type switch
  detect                          manuelle Tweaks nach kurzer Ruhezeit
          |                               |
          |                               v
          |                       16 Steps Analyse
          |                         mittleres Band-Niveau
          |                         crest / transient character
          |                         detect / peak reference
          |                               |
          |                               v
          |                        Frozen Band Profile
          |                          threshold
          |                          attack
          |                          release
          |                          ratio / max GR
          |                          mode voicing
          |                               |
          +---------------+---------------+
                          |
                          v
Per-Band Compression
  nutzt live detect + frozen profile
  GR bewegt sich weiter, die gesetzten Werte bleiben stabil
                          |
                          v
Band Recombine
  linked stereo gain pro Band
                          |
                          v
Limiter + Auto Makeup + Soft Clip
  Ceiling: -1 dBFS
  Makeup nur fuer Lautheitsausgleich
  Limiter bleibt Safety-Netz
                          |
                          v
Analyser
                          |
                          v
AudioContext Destination
```

## Regeln

- Der Master-Bus misst nicht permanent neue Thresholds oder Attacks, sondern nur nach relevanten Aenderungen.
- Waehren der Messung bleibt die Band-Detection live; nach Abschluss werden pro Band feste Arbeitswerte gesetzt.
- Die Dropdown-Modi verschieben diese gesetzten Werte in unterschiedliche Richtungen:
  `Balanced`, `Aggressive`, `Punch`, `Smooth`, `Glue`, `Air Keep`.
- `Threshold`, `Attack` und `Release` bleiben nach der Messung stabil, waehrend `Detect`, `Crest` und `GR` weiter live reagieren.
- Der Limiter arbeitet weiterhin kontinuierlich als Fangnetz und bringt bei Bedarf moderates Auto-Makeup mit.

## Implementierung

- Synth-Ausgabe: `src/worklets/bessel-processor.js`
- Master-Bus: `src/worklets/master-bus-processor.js`
- Routing: `src/audio-engine.js`
- UI / Triggerlogik: `src/main.js`
