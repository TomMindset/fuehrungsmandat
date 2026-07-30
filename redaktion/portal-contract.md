# Vertrag des Führungsmandat-Freigabeportals

Das Portal ist die einzige technische Quelle für eine Freigabeentscheidung.
Antwortmails, Pull-Request-Kommentare und Workflow-Eingaben gelten nicht als
Freigabe.

Alle Endpunkte verlangen als interne API-Authentifizierung:

```http
X-Fuehrungsmandat-Secret: <FUEHRUNGSMANDAT_PORTAL_SECRET>
```

Bei einer privaten Sites-Bereitstellung verwendet `Authorization` zusätzlich
den separaten Workspace-Bypass-Token. Ohne diese Zugriffsschicht bleibt die
interne API-Authentifizierung abwärtskompatibel auch als Bearer-Token gültig.

Freigabelinks selbst werden niemals über diese API zurückgelesen und im
Portal nur als SHA-256-Hash gespeichert.

## Freigabekarte anlegen

```http
POST /api/editorial/reviews
Content-Type: multipart/form-data
```

Felder:

- `package`: vollständiges JSON-Paket;
- `image`: exakt die in der Freigabe sichtbare JPEG-Datei.

Das Portal validiert MIME-Typ, 1080 × 1350 Pixel, Dateigröße und
`packageHash`. Artikel-Markdown wird für die Vorschau serverseitig ohne
ausführbares HTML gerendert. Paketfelder werden nie ungefiltert als HTML
übernommen.

Idempotenzschlüssel ist die Kombination aus `brand`, `slug`, `version`,
`contentHash` und `packageHash`. `contentHash` bindet die Artikeldatei;
`packageHash` bindet zusätzlich alle kanalbezogenen Fassungen. Ein identisches
Paket liefert die vorhandene Freigabe zurück.

Antwort:

```json
{
  "id": "review-id",
  "version": 1,
  "reviewUrl": "https://portal.example/review/<one-time-token>",
  "expiresAt": "2026-08-03T10:00:00.000Z"
}
```

## Freigabemail bestätigen

```http
POST /api/editorial/reviews/{id}/mail-status
Content-Type: application/json

{
  "messageId": "<mail-id>",
  "status": "sent"
}
```

Dieser Endpunkt darf keinen erneuten Versand auslösen.

## Entscheidung lesen

```http
GET /api/editorial/reviews/{id}/publication-package
```

Nur bei gültiger Entscheidung wird das Paket ausgeliefert:

```json
{
  "id": "review-id",
  "status": "approved",
  "version": 1,
  "contentHash": "<sha256>",
  "packageHash": "<sha256>",
  "approvedAt": "2026-07-27T10:00:00.000Z",
  "approvedChannels": ["website", "facebook", "instagram"],
  "publications": [
    {
      "channel": "facebook",
      "status": "pending",
      "externalId": null,
      "url": null,
      "publishedAt": null,
      "reason": null
    }
  ],
  "package": {}
}
```

Pflichtregeln:

- `website` muss ausgewählt sein, wenn ein Social-Kanal ausgewählt ist;
- Freigabe gilt nur für exakt diese Version und diesen Inhalts-Hash;
- `changes_requested` erzeugt eine neue Version und eine neue Freigabe;
- `rejected` und `expired` sind nicht veröffentlichbar.

## Kanal reservieren

```http
POST /api/editorial/reviews/{id}/publications/{channel}/claim
Content-Type: application/json

{
  "version": 1,
  "contentHash": "<sha256>",
  "packageHash": "<sha256>",
  "workflowRunId": "123456789",
  "confirmManualRetry": false
}
```

Antwort:

```json
{
  "status": "claimed",
  "claimToken": "<one-time-claim-token>"
}
```

Ein bereits erfolgreicher oder laufender Kanal darf nicht erneut beansprucht
werden. `manual_check_required` bleibt für automatische Läufe gesperrt. Nur ein
manuell gestarteter, auf konkrete Social-Kanäle begrenzter Workflow darf nach
externer Prüfung `confirmManualRetry: true` übermitteln. Ein Claim-Token wird
serverseitig nur gehasht gespeichert.

## Kanal abschließen

```http
POST /api/editorial/reviews/{id}/publications/{channel}/complete
Content-Type: application/json

{
  "claimToken": "<one-time-claim-token>",
  "externalId": "<platform-post-id>",
  "url": "https://...",
  "publishedAt": "2026-07-27T10:05:00.000Z"
}
```

## Uneindeutiges Ergebnis sperren

```http
POST /api/editorial/reviews/{id}/publications/{channel}/manual-check
Content-Type: application/json

{
  "claimToken": "<one-time-claim-token>",
  "reason": "Netzwerkabbruch nach dem Schreibaufruf"
}
```

`manual_check_required` ist eine harte Sperre gegen automatische Wiederholung.
Ein bestätigter Retry verlangt eine konkrete Freigabe-ID, die betroffenen
Kanäle und die ausdrückliche Bestätigung der vorherigen Plattformprüfung.

## GitHub-Workflow auslösen

GitHub Actions fragt alle fünf Minuten die älteste noch nicht veröffentlichte
Freigabe ab:

```http
GET /api/editorial/reviews/next-approved
```

Ohne offene Freigabe antwortet das Portal mit `204 No Content`. Dadurch
benötigt das Portal keinen dauerhaft schreibberechtigten GitHub-Token.

Optional kann ein serverseitiger, auf dieses Repository begrenzter Token
weiterhin eine sofortige Ausführung anstoßen:

```http
POST /repos/TomMindset/fuehrungsmandat/dispatches
Content-Type: application/json

{
  "event_type": "fuehrungsmandat-review-approved",
  "client_payload": {
    "review_id": "review-id"
  }
}
```

Ohne diesen optionalen Token markiert das Portal die Freigabe für die planmäßige
Abholung. Bei einem Dispatch-Fehler bleibt sie ebenfalls abholbar. Der Workflow
kann zudem mit derselben `review_id` als reiner Testlauf oder als gezielter
Facebook-/Instagram-Retry gestartet werden. Veröffentlichung und
Dublettenschutz prüfen den Portalstatus unabhängig vom Auslöseweg erneut.
