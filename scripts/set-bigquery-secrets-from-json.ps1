# [DEPRECATED] Ten skrypt ustawiał sekrety Google BigQuery na workerze `epir-bigquery-batch`.
# Worker nie używa już BigQuery — eksport idzie przez Pipelines, odczyty whitelisty przez R2 SQL.
# Patrz: docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md oraz workers/bigquery-batch/wrangler.toml
Write-Host "Skrypt przestarzały — nie ustawia sekretów. Użyj dokumentacji deploy (Pipelines + R2_SQL_API_TOKEN)." -ForegroundColor Yellow
exit 1
