# Führungsmandat Freigabeportal

Das Portal bindet jede redaktionelle Entscheidung an Artikelversion, Inhalts-Hash
und einzeln gewählte Veröffentlichungskanäle. Es ist das serverseitige Gegenstück
zu den GitHub-Actions unter `../.github/workflows/`.

## Sicherheitsmodell

- GitHub Actions authentifiziert sich per `PORTAL_INGEST_SECRET`.
- Review-Links enthalten einen zufälligen, nur gehasht gespeicherten Token und
  laufen nach sieben Tagen ab.
- Bilddateien liegen nicht öffentlich in R2, sondern werden nur über einen
  gültigen Review-Token ausgeliefert.
- Freigaben werden versions- und hashgebunden gespeichert.
- Jeder Kanal wird vor dem Publizieren atomar beansprucht; unklare Ergebnisse
  sperren den Kanal für eine manuelle Prüfung.
- Website ist verbindlich der erste Veröffentlichungskanal.

## Lokale Entwicklung

Voraussetzung ist Node.js ab Version 22.13.

```bash
npm install
npm run db:generate
npm run dev
```

Die erwarteten Laufzeitvariablen sind in `.env.example` dokumentiert. Reale
Secrets gehören weder in diese Datei noch in Git.

## Prüfung

```bash
npm run lint
npm test
```

`npm test` erzeugt zuerst den vinext-Worker und prüft anschließend Paketierung,
Migration, Bindungen und die sicherheitsrelevanten UI-Regeln. Die gerenderte
Oberfläche wird zusätzlich in der lokalen Worker-Laufzeit visuell geprüft.

## Hosting

`.openai/hosting.json` deklariert die D1-Bindung `DB` und die private
R2-Bindung `EDITORIAL_ASSETS`. Migrationen werden mit
`npm run db:generate` erzeugt und zusammen mit dem Build paketiert.
