# Führungsmandat Mehrkanal-Redaktion

Dieser Ordner überträgt das Freigabeprinzip der OSTEA-Redaktion auf
`fuehrungsmandat.de`. Website, Facebook und Instagram sind vorbereitet;
LinkedIn bleibt bis zur späteren Anbindung pausiert und wird im Portal nicht
zur Freigabe angeboten.

## Leitprinzip

Der redigierte Artikel ist die einzige inhaltliche Quelle. Facebook,
Instagram und perspektivisch LinkedIn erhalten jeweils eine eigenständige,
vor der Freigabe sichtbare Fassung. Die Social-Texte dürfen keine neue
fachliche Behauptung ergänzen.

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
   - vorbereitete, derzeit nicht auswählbare LinkedIn-Fassung,
   - deterministische Markenkarte im Format 1080 × 1350 Pixel,
   - Inhalts-Hash, Version und Quellenlinks.
4. Das Portal zeigt alle Fassungen und lässt die Kanäle einzeln auswählen.
5. `editorial-publish.yml` holt eine gültige Freigabe spätestens nach fünf
   Minuten ab; ein optionaler Repository-Dispatch kann sofort auslösen.
6. Der Workflow prüft Freigabe-ID, Version und Inhalts-Hash erneut, setzt den
   Artikel über `content:release` live, baut die Site und pusht nur Artikel,
   Markenkarte und Planstatus.
7. Nach bestätigter Erreichbarkeit der Artikel-URL laufen Facebook und
   Instagram in unabhängigen Jobs mit 15 beziehungsweise 20 Minuten Abstand.
   Ein Fehler auf einem Kanal blockiert den anderen nicht.
8. Vor jedem Social-Aufruf reserviert das Portal den Kanal. Ein erfolgreicher
   Versand wird mit der externen Beitrags-ID abgeschlossen. Bei einem
   uneindeutigen Ergebnis wird `manual_check_required` gesetzt und nicht
   automatisch erneut gepostet. Nach externer Plattformprüfung kann ein
   manueller Workflow ausschließlich den betroffenen Social-Kanal wiederholen.

## Sperrschalter

Alle Schalter in `config.json` stehen bewusst auf `false`. Die Workflows
überspringen externe Aktionen zusätzlich, solange die Repository-Variable
`EDITORIAL_AUTOMATION_ENABLED` nicht exakt `true` ist.

Portal, bestätigte Meta-IDs, Systemnutzer-Token und das Environment
`content-production` sind eingerichtet. Der Token liegt ausschließlich als
GitHub-Secret vor. Mailversand, Live-Schalter und LinkedIn bleiben offen; damit
ist die Strecke weiterhin absichtlich nicht publikationsaktiv.

Erst aktivieren, wenn:

- ein eigenes Führungsmandat-Freigabeportal bereitsteht;
- Freigabemail und Rückkanal Ende-zu-Ende getestet sind;
- Facebook-Seite und Instagram-Business-Konto eindeutig verbunden sind;
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

## Gezielter Social-Retry

`editorial-publish.yml` kann manuell mit einer konkreten `review_id` und
`retry_channels` (`facebook`, `instagram` oder beide) gestartet werden. Wenn
das Portal zuvor `manual_check_required` gesetzt hat, muss erst auf der
Plattform geprüft werden, ob doch ein Beitrag entstanden ist. Nur wenn kein
Beitrag existiert, darf `confirm_manual_retry` aktiviert werden.

Der Schalter `skip_offsets` ist ausschließlich für einen solchen bestätigten
Retry vorgesehen. Ein `dry_run` prüft Freigabe, Hashes, Ziel-IDs und
Zugangsdaten, führt aber keine Veröffentlichung aus.

## LinkedIn-Ziel

Der Publisher unterstützt beide von der Posts API vorgesehenen Autor-Typen:

- persönliches Profil: `urn:li:person:<id>` mit `w_member_social`;
- Organisationsseite: `urn:li:organization:<id>` mit
  `w_organization_social` und passender Seitenrolle.

`approvalEnabled`, `live`, `LINKEDIN_AUTHOR_URN` und Modus bleiben deaktiviert
beziehungsweise offen, bis das tatsächliche Ziel festgelegt und autorisiert
ist.

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
