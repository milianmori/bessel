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

Falls `localhost` bei dir nicht reagiert, probier stattdessen:

```text
http://127.0.0.1:5173
```

Wichtig: Browser-Presets und Session-Daten liegen pro Origin getrennt. Wenn deine alten Presets unter `localhost` gespeichert wurden, erscheinen sie nicht automatisch unter `127.0.0.1`.

Falls du den Dev-Server bewusst im Netzwerk freigeben willst, kannst du ihn einmalig so starten:

```bash
npm run dev -- --host 0.0.0.0
```

## Deploy

Fuer ein Deploy auf `surge.sh` gibt es jetzt einen Script mit fester Ziel-Domain:

```bash
npm run deploy
```

Der Script published immer nach:

```text
https://ersatz-bessel-milian-20260404.surge.sh/
```

Die standardmaessig mitdeployten User-Presets liegen direkt in
`public/ersatz-bessel-user-presets.md` und sind dadurch unter der festen URL
`/ersatz-bessel-user-presets.md` erreichbar.

Voraussetzung ist, dass `surge` auf deinem System verfuegbar ist, zum Beispiel ueber:

```bash
npm install -g surge
```

## Stand

- Mehrere layerbare Voices mit gemeinsamem BPM
- Adaptiver Master-Bus mit Input-Leveler, 3-Band-Kompression und Safety-Limiter hinter dem Synth-Worklet
- BPM-Randomize-Button direkt im Header
- `+ Voice` klont die aktive Voice inklusive aller lokalen Parameter
- Pro Voice eigene Preset-Auswahl, Randomize, Mute und Editoren
- Pro Voice umschaltbare Step-Pattern-Quelle mit `Rhythm` (inklusive frueherer `Amp`-Modi und Max-Rhythmen wie `3-3-2` und `Euclid`) oder altem `Web`-Verhalten
- Pro Voice ist `Master Gain` manuell steuerbar und wird von `Randomize` nicht veraendert
- Eigene User-Presets werden beim ersten Save in eine Markdown-Datei geschrieben und danach darueber aktualisiert
- Letzte Session wird lokal wiederhergestellt, damit Debug- und Recall-Staende nach Reload erhalten bleiben
- 16 Bessel-Moden aus den Original-Nullstellen
- Echtzeit-Exciter aus `click_shape`, `amps`, `nz_env`
- Pitch-Envelope mit Dauer, Range und Curve
- Frequenz- und Weight-Analyse fuer die fokussierte Voice plus globaler Live-Scope
- Presets geladen aus den originalen Philip-Daten
- Vite-Dev-Server und Vite-Build/Preview-Skripte
- Statische Assets ueber `public/`, Bilder unter `public/images/`
- Signalfluss-Doku in `master-output-scheme.md`

Die Engine ist absichtlich nah an der Max-Struktur gebaut, aber nicht bit-identisch zum Max-Rendering.
