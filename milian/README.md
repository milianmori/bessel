# Ersatz Bessel JS

Browser-basierte JS-only Version des Philip-Meyer-Max-Patchers aus [`philip/Ersatz-Bessel`](../philip/Ersatz-Bessel).

## Start

Im Projektordner:

```bash
npm install
npm run dev
```

Danach im Browser oeffnen:

```text
http://localhost:5173
```

## Stand

- Mehrere layerbare Voices mit gemeinsamem BPM
- `+ Voice` klont die aktive Voice inklusive aller lokalen Parameter
- Pro Voice eigene Preset-Auswahl, Randomize, Mute und Editoren
- Eigene User-Presets werden lokal im Browser gespeichert und koennen pro Voice aktualisiert oder geloescht werden
- Letzte Session wird lokal wiederhergestellt, damit Debug- und Recall-Staende nach Reload erhalten bleiben
- 16 Bessel-Moden aus den Original-Nullstellen
- Echtzeit-Exciter aus `click_shape`, `amps`, `nz_env`
- Pitch-Envelope mit Dauer, Range und Curve
- Frequenz- und Weight-Analyse fuer die fokussierte Voice plus globaler Live-Scope
- Presets geladen aus den originalen Philip-Daten
- Vite-Dev-Server und Vite-Build/Preview-Skripte
- Statische Assets ueber `public/`, Bilder unter `public/images/`

Die Engine ist absichtlich nah an der Max-Struktur gebaut, aber nicht bit-identisch zum Max-Rendering.
