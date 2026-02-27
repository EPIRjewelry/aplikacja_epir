/**
 * Szablon HTML dla Dashboard leadów (Agent Command Center).
 * Przeniesione z Landing_pages/epir-ai-worker.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EPIR AI - Agent Command Center</title>
    <style>
        :root { --bg: #0f172a; --surface: #1e293b; --primary: #3b82f6; --text: #f8fafc; --text-muted: #94a3b8; }
        body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1, h2 { font-weight: 300; letter-spacing: -0.5px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .card { background: var(--surface); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
        .kpi-value { font-size: 2.5em; font-weight: 700; color: var(--primary); }
        .kpi-label { color: var(--text-muted); font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; color: var(--text-muted); padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.85em; }
        td { padding: 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .score-badge { background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em; }
        .intent-tag { background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        .refresh-btn { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; float: right; }
        .refresh-btn:hover { opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <button class="refresh-btn" onclick="loadData()">Odśwież Dane</button>
        <h1>Agent Command Center <span style="font-size:0.5em; opacity:0.5">v4.0</span></h1>
        <div class="kpi-grid" id="kpi-container">
            <div class="card">
                <div class="kpi-label">Aktywni (24h)</div>
                <div class="kpi-value" id="kpi-visitors">-</div>
            </div>
            <div class="card">
                <div class="kpi-label">Gorące Leady</div>
                <div class="kpi-value" id="kpi-leads">-</div>
            </div>
            <div class="card">
                <div class="kpi-label">Śr. Zaangażowanie</div>
                <div class="kpi-value" id="kpi-engagement">-</div>
            </div>
        </div>
        <div class="card">
            <h2>Najnowsze Szanse Sprzedażowe (Top 20)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Score</th>
                        <th>Klient (ID/Alias)</th>
                        <th>Intencja / Okazja</th>
                        <th>Rozmiar</th>
                        <th>Metal</th>
                        <th>Ostatnia Aktywność</th>
                    </tr>
                </thead>
                <tbody id="leads-table-body">
                    <tr><td colspan="6" style="text-align:center; opacity:0.5">Ładowanie danych...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    <script>
        const params = new URLSearchParams(window.location.search);
        const apiKey = params.get('key');
        async function loadData() {
            try {
                if (!apiKey) { throw new Error("Brak klucza autoryzacji w URL (?key=...)"); }
                const response = await fetch('/admin/api/leads', { headers: { 'X-Admin-Key': apiKey } });
                if (!response.ok) throw new Error("Błąd autoryzacji lub serwera");
                const data = await response.json();
                document.getElementById('kpi-visitors').innerText = data.stats.total_visitors ?? 0;
                document.getElementById('kpi-leads').innerText = data.stats.qualified_leads ?? 0;
                document.getElementById('kpi-engagement').innerText = Math.round(data.stats.avg_engagement ?? 0);
                const tbody = document.getElementById('leads-table-body');
                tbody.innerHTML = '';
                if (!data.leads || data.leads.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; opacity:0.5">Brak danych</td></tr>';
                } else {
                    data.leads.forEach(lead => {
                        const date = new Date(lead.last_seen).toLocaleString('pl-PL', { hour: '2-digit', minute:'2-digit', day:'numeric', month:'short' });
                        const intentHtml = lead.purchase_intent ? '<span class="intent-tag">' + lead.purchase_intent + '</span>' : '<span style="opacity:0.3">-</span>';
                        const clientId = (lead.client_id || '').substring(0, 8) + '...';
                        tbody.innerHTML += '<tr><td><span class="score-badge">' + lead.lead_score + '</span></td><td style="font-family:monospace; font-size:0.9em">' + clientId + '</td><td>' + intentHtml + '</td><td>' + (lead.ring_size || '-') + '</td><td>' + (lead.preferred_metal || '-') + '</td><td style="color:#94a3b8">' + date + '</td></tr>';
                    });
                }
            } catch (e) {
                console.error(e);
                alert('Błąd: ' + e.message);
            }
        }
        loadData();
    </script>
</body>
</html>`;
