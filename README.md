# Fuehrungsmandat.de

Persönliche Fachpublikation von Thomas Hoffmann zu Führungsmandat, Rollenklärung, lateraler Führung und Wirkung in Veränderung.

## Rolle der Site

- `fuehrungsmandat.de` ist der publizistische Fachraum.
- `mandat-wirkung.de` bleibt das diskrete Coaching-Angebot.
- Inhalte werden eigenständig formuliert und verlinken ruhig auf Mandat & Wirkung.

## Entwicklung

```bash
pnpm --dir fuehrungsmandat dev
pnpm --dir fuehrungsmandat check
pnpm --dir fuehrungsmandat build
```

Wenn dieser Ordner in ein eigenes Repository verschoben wird:

```bash
pnpm dev
pnpm content:check
pnpm build
```

## Content

Beiträge liegen unter `src/content/notes`.

```bash
pnpm --dir fuehrungsmandat content:research
pnpm --dir fuehrungsmandat content:research:web
pnpm --dir fuehrungsmandat content:draft
pnpm --dir fuehrungsmandat content:generate
pnpm --dir fuehrungsmandat content:check
```

`content:research` recherchiert wissenschaftliche Themenimpulse über OpenAlex und verdichtet sie mit der OpenAI API zu redaktionellen Themenvorschlägen in `content-ideas.json`. Die gesammelten Quellen liegen unter `research/openalex-sources.json`.

`content:research:web` recherchiert zusätzlich mit OpenAI Web Search nach wissenschaftlich anschlussfähigen Fundstellen und schreibt Vorschläge nach `content-ideas-web.json`. Die Rohantwort liegt unter `research/openai-web-search-response.json`.

Für reine Quellensammlung ohne OpenAI-Verdichtung:

```bash
pnpm --dir fuehrungsmandat content:research -- --collect-only
```

`content:draft` erzeugt ein Offline-Skeleton aus dem Redaktionsplan.

`content:generate` erzeugt mit der OpenAI API einen vollständigen Artikelentwurf. Dafür muss `OPENAI_API_KEY` gesetzt sein. Optional kann `OPENAI_MODEL` gesetzt werden.

Beide Generatoren markieren den verwendeten Plan-Eintrag als `drafted`. Der Artikel bleibt mit `draft: true` unsichtbar, bis er redaktionell freigegeben wird.

`content:release` setzt einen geprüften Artikel nur mit exakter Freigabeformel live:

```bash
pnpm --dir fuehrungsmandat content:release -- --slug=<slug> --confirm="Freigegeben für Veröffentlichung: <slug>"
```

Danach müssen `content:check` und `build` erfolgreich laufen, bevor committed und nach GitHub gepusht wird.

## Deployment

Die Site ist auf `https://fuehrungsmandat.de` ausgelegt. Der CNAME liegt in `public/CNAME`.

Der vorbereitete GitHub-Pages-Workflow liegt unter `.github/workflows/deploy.yml`. Er wird aktiv, wenn dieser Ordnerinhalt in das bestehende Repository `TomMindset/fuehrungsmandat` übernommen wird.

Der automatische Draft-Workflow liegt unter `.github/workflows/content-draft.yml`.

Der wissenschaftliche Recherche-Workflow liegt unter `.github/workflows/topic-research.yml`, ist aber bewusst nur manuell startbar. Die regelmäßige Themenrecherche soll zunächst als geplante Codex-Aufgabe laufen, damit Quellen und Themen redaktionell beurteilt werden können, bevor GitHub daraus Produktionsschritte macht.

Für den automatischen Draft-Workflow in GitHub:

- Repository Secret `OPENAI_API_KEY` setzen.
- Optional Repository Variable `OPENAI_MODEL` setzen.
- Optional Repository Variable `OPENAI_WEB_SEARCH_MODEL` setzen.
- Optional Repository Secret `OPENALEX_API_KEY` setzen, falls OpenAlex mit API-Key genutzt werden soll.
- Der Workflow öffnet Pull Requests; er veröffentlicht nicht automatisch.

Im aktuellen Monorepo sollten diese Workflows nicht an die Root-`.github`-Workflows verschoben werden, weil dort bereits Mandat & Wirkung über GitHub Pages deployed wird.

## Offene TODOs

- Rechtliche Prüfung von Impressum und Datenschutz vor Livegang.
- Ordnerinhalt in `TomMindset/fuehrungsmandat` übertragen.
- DNS für `fuehrungsmandat.de` einrichten.
- Später entscheiden, ob Auto-Publish für risikoarme Notizen aktiviert wird.
