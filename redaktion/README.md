# Führungsmandat Mehrkanal-Redaktion

Dieser Ordner überträgt das Freigabeprinzip der OSTEA-Redaktion auf
`fuehrungsmandat.de` und ergänzt LinkedIn als vierten Kanal.

## Leitprinzip

Der redigierte Artikel ist die einzige inhaltliche Quelle. Facebook,
Instagram und LinkedIn erhalten jeweils eine eigenständige, vor der Freigabe
sichtbare Fassung. Die Social-Texte dürfen keine neue fachliche Behauptung
ergänzen.

Ohne eine formal gültige, versions- und hashgebundene Portalentscheidung wird
nichts veröffentlicht. Die Website geht immer zuerst live. Erst wenn die
Artikel-URL öffentlich erreichbar ist, dürfen die ausdrücklich ausgewählten
Social-Kanäle folgen.

## Ablauf

1. Der bestehende Draft-Workflow erzeugt einen Pull Request mit `draft: true`.
2. Der Artikel wird mit dem Redaktionscoach geprüft und redigiert.
3. Nach dem Merge eines geänderten Drafts erzeugt
   `editorial-approval.yml` ein Freigabepaket:
   - vollständiger Artikel,
   - Facebook-Fassung,
   - Instagram-Caption und Alt-Text,
   - LinkedIn-Fassung,
   - deterministische Markenkarte im Format 1080 × 1350 Pixel,
   - Inhalts-Hash, Version und Quellenlinks.
4. Das Portal zeigt alle Fassungen und lässt die Kanäle einzeln auswählen.
5. `editorial-publish.yml` holt eine gültige Freigabe spätestens nach fünf
   Minuten ab; ein optionaler Repository-Dispatch kann sofort auslösen.
6. Der Workflow prüft Freigabe-ID, Version und Inhalts-Hash erneut, setzt den
   Artikel über `content:release` live, baut die Site und pusht nur Artikel,
   Markenkarte und Planstatus.
7. Nach bestätigter Erreichbarkeit der Artikel-URL werden Facebook,
   Instagram und LinkedIn über getrennte Provider veröffentlicht.
8. Vor jedem Social-Aufruf reserviert das Portal den Kanal. Ein erfolgreicher
   Versand wird mit der externen Beitrags-ID abgeschlossen. Bei einem
   uneindeutigen Ergebnis wird `manual_check_required` gesetzt und nicht
   automatisch erneut gepostet.

## Sperrschalter

Alle Schalter in `config.json` stehen bewusst auf `false`. Die Workflows
überspringen externe Aktionen zusätzlich, solange die Repository-Variable
`EDITORIAL_AUTOMATION_ENABLED` nicht exakt `true` ist.

Stand 27. Juli 2026 ist im GitHub-Repository nur das Secret
`OPENAI_API_KEY` vorhanden. Das Environment `github-pages` existiert;
`content-production` und alle Portal-, Mail-, Meta- und LinkedIn-Einstellungen
fehlen noch. Damit ist die Strecke vorbereitet, aber absichtlich nicht
aktivierbar.

Erst aktivieren, wenn:

- ein eigenes Führungsmandat-Freigabeportal bereitsteht;
- Freigabemail und Rückkanal Ende-zu-Ende getestet sind;
- Facebook-Seite und Instagram-Business-Konto eindeutig verbunden sind;
- das LinkedIn-Ziel als persönliches Profil oder Organisationsseite feststeht;
- alle Schreibtests nicht öffentlich oder mit bewusstem Testinhalt bestanden
  sind;
- GitHub Environment `content-production` mit dem gewünschten Reviewer
  eingerichtet ist.

## GitHub-Konfiguration

Repository-Variablen:

- `EDITORIAL_AUTOMATION_ENABLED`
- `FUEHRUNGSMANDAT_PORTAL_URL`
- `OPENAI_TEXT_MODEL`
- `META_GRAPH_API_VERSION`
- `META_PAGE_ID`
- `META_INSTAGRAM_ACCOUNT_ID`
- `LINKEDIN_VERSION`
- `LINKEDIN_AUTHOR_URN`

Repository-Secrets:

- `OPENAI_API_KEY`
- `FUEHRUNGSMANDAT_PORTAL_SECRET`
- `FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN`
- `FUEHRUNGSMANDAT_GMAIL_APP_PASSWORD`
- `META_PAGE_ACCESS_TOKEN`
- `LINKEDIN_ACCESS_TOKEN`

Keine ID ist geheim. Tokens, App-Secrets, OAuth-Codes, Freigabelinks und
Gmail-App-Passwörter gehören ausschließlich in Secret Stores.

## LinkedIn-Ziel

Der Publisher unterstützt beide von der Posts API vorgesehenen Autor-Typen:

- persönliches Profil: `urn:li:person:<id>` mit `w_member_social`;
- Organisationsseite: `urn:li:organization:<id>` mit
  `w_organization_social` und passender Seitenrolle.

`config.json` und `LINKEDIN_AUTHOR_URN` bleiben offen, bis das tatsächliche
Ziel festgelegt und autorisiert ist.

Aktuelle Primärdokumentation für die Aktivierung:

- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [LinkedIn OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Meta Pages API – Posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Instagram Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)

## Lokal prüfen

```bash
pnpm editorial:check
pnpm content:check
pnpm check
pnpm build
```

Die Portal-Schnittstelle ist in `portal-contract.md` beschrieben.
