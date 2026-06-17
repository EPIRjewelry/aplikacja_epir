# Mostek raportu operatora → Google Workspace

**Status:** operacyjny add-on Project B — **kanał eksportu / wizualizacji**, nie SSOT.

## Orthodoksja

| Warstwa | Rola |
|---------|------|
| **D1** `operator_daily_reports` | Jedyny SSOT raportów i profilu operatora |
| **Google Docs / Drive** | Płaski eksport do czytania przez operatora (human-in-the-loop → NotebookLM) |
| **Sheets** | **Nie** ledger agentów ani baza transakcyjna |
| **MCP `epir-gworkspace` w Cursorze** | Lokalny odczyt briefów — **nie** w przeglądarce Operator Studio |

## Przepływ

1. Cron `0 9 * * *` UTC na `epir-bigquery-batch`: **automatyczny catch-up eksportu** D1→Pipelines (do 12 przebiegów), potem raport Markdown (`operator-daily-report.ts`).
2. Raport trafia do D1 `operator_daily_reports` (baza `ai-assistant-sessions-db`) — **pełna treść**, w tym sekcja **Gemma** (kto rozmawiał i o czym).
3. E-mail operatora: ustaw `OPERATOR_REPORT_EMAIL_TO` (var na workerze batch) — wysyłka przez **MailChannels** (wymaga SPF/DKIM domeny `OPERATOR_REPORT_EMAIL_FROM`).
4. Opcjonalnie: `POST` na `GWORKSPACE_REPORT_WEBHOOK_URL` — payload z **maskowaniem PII (SHA-256)**; pole `emailTo` przekazuje adres do Apps Script (Gmail).

**Normalizacja Customer Match (przed hash):** email — `trim`, lowercase, na `gmail.com` / `googlemail.com` usuń kropki w local part i subadres po `+`; telefon — gdy jest `+`, format E.164 (`+` + cyfry); bez `+` — same cyfry (bez zgadywania kodu kraju).

## Payload webhook (worker → Apps Script)

```json
{
  "title": "EPIR Raport 2026-06-11",
  "body": "# Raport…\n\n_Eksport Workspace: pola PII zastąpione skrótem SHA-256…_",
  "piiMasked": true,
  "exportedAt": "2026-06-11T09:00:00.000Z",
  "ssot": "d1_operator_daily_reports",
  "emailTo": "operator@example.com"
}
```

## Konfiguracja webhook (Apps Script)

1. Utwórz projekt Apps Script powiązany z Dyskiem operatora.
2. Wklej szablon `doPost` poniżej.
3. Wdróż jako **Web app** (wykonaj jako Ty, dostęp: tylko Ty).
4. Skopiuj URL wdrożenia.
5. Operator (poza repo): `wrangler secret put GWORKSPACE_REPORT_WEBHOOK_URL` w `workers/bigquery-batch`.
6. E-mail: `wrangler secret put OPERATOR_REPORT_EMAIL_TO` (adres operatora) oraz opcjonalnie var `OPERATOR_REPORT_EMAIL_FROM` (domyślnie `reports@epirbizuteria.pl`) — patrz [`EPIR_DEPLOYMENT_AND_OPERATIONS.md`](EPIR_DEPLOYMENT_AND_OPERATIONS.md) § MailChannels SPF.

**Orthodoksja:** webhook to osobny kanał zaufania; nie zastępuje `EPIR_CHAT_SHARED_SECRET` ani Storefront MCP.

### Szablon `Code.gs`

```javascript
/**
 * EPIR — most raportu dziennego (eksport z D1, PII już zamaskowane po stronie workera).
 * Web app: Execute as Me, Who has access: Only myself
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var title = String(payload.title || 'EPIR Raport');
    var body = String(payload.body || '');
    var emailTo = String(payload.emailTo || '').trim();
    if (payload.piiMasked !== true) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'piiMasked_required' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Opcja A: Google Doc
    var doc = DocumentApp.create(title);
    var docBody = doc.getBody();
    docBody.appendParagraph(body.replace(/\n/g, '\n'));
    doc.saveAndClose();

    if (emailTo) {
      GmailApp.sendEmail(emailTo, title, body);
    }

    // Opcja B (alternatywa): plik .md na Drive — odkomentuj i usuń Opcję A
    // var folder = DriveApp.getRootFolder();
    // var file = folder.createFile(title + '.md', body, MimeType.PLAIN_TEXT);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        docId: doc.getId(),
        docUrl: doc.getUrl(),
        exportedAt: payload.exportedAt || new Date().toISOString(),
        ssot: payload.ssot || 'd1_operator_daily_reports',
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
```

## Odczyt w Operator Studio

- `GET /internal/operator-studio/api/reports` — lista z D1 (SSOT)
- `GET /internal/operator-studio/api/reports/:date` — pełny Markdown z D1

**Pętla Growth Engineer:** excerpt raportu z panelu → NotebookLM → blueprint → Cursor (MCP `gdocs_read_markdown` tylko lokalnie).

## Lokalny odczyt briefów (Cursor)

MCP `epir-gworkspace` w Cursorze (`gdocs_read_markdown` po `fileId`) — patrz [`mcp-servers/gworkspace/README.md`](../mcp-servers/gworkspace/README.md).

Operator Studio **nie** implementuje Google MCP w przeglądarce; rola Kreacja używa pola tekstowego do wklejenia briefu z Cursora.
