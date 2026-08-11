/**
 * Shopify customers_export.csv → segmenty Customer Match (lokalnie, bez wysyłania PII).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmailForCustomerMatch(email) {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    const plus = local.indexOf('+');
    if (plus >= 0) local = local.slice(0, plus);
  }
  return `${local}@${domain}`;
}

export function hashEmailForCustomerMatch(email) {
  const normalized = normalizeEmailForCustomerMatch(email);
  if (!normalized || !normalized.includes('@')) return null;
  return createHash('sha256').update(normalized).digest('hex');
}

function isTestRow(row) {
  const email = (row.Email || '').trim().toLowerCase();
  const fn = (row['First Name'] || '').trim().toLowerCase();
  if (!email) return true;
  if (fn === 'test') return true;
  if (/^test\d*@/.test(email)) return true;
  if (email.includes('@test.') || email.endsWith('@test.com')) return true;
  if (email.startsWith('test@')) return true;
  return false;
}

function hasConsent(row) {
  return (row['Accepts Email Marketing'] || '').trim().toLowerCase() === 'yes';
}

export const SEGMENTS = {
  consent: {
    listName: 'EPIR_CRM_Email_Consent',
    description: 'Shopify — zgoda na email marketing',
    filter(row) {
      return hasConsent(row) && !isTestRow(row);
    },
  },
  'high-value': {
    listName: 'EPIR_CRM_High_Value',
    description: 'Shopify — zgoda + Total Spent >= 1000 PLN',
    filter(row) {
      if (!hasConsent(row) || isTestRow(row)) return false;
      const spent = Number.parseFloat(row['Total Spent'] || '0');
      return Number.isFinite(spent) && spent >= 1000;
    },
  },
  repeat: {
    listName: 'EPIR_CRM_Repeat',
    description: 'Shopify — zgoda + >= 2 zamówienia',
    filter(row) {
      if (!hasConsent(row) || isTestRow(row)) return false;
      const orders = Number.parseFloat(row['Total Orders'] || '0');
      return Number.isFinite(orders) && orders >= 2;
    },
  },
};

export function parseShopifyCustomersCsv(csvPath) {
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function analyzeCsv(csvPath) {
  const rows = parseShopifyCustomersCsv(csvPath);
  const summary = {
    totalRows: rows.length,
    segments: {},
  };
  for (const [key, seg] of Object.entries(SEGMENTS)) {
    const matched = rows.filter(seg.filter);
    const hashes = [];
    const seen = new Set();
    for (const row of matched) {
      const h = hashEmailForCustomerMatch(row.Email || '');
      if (!h || seen.has(h)) continue;
      seen.add(h);
      hashes.push(h);
    }
    summary.segments[key] = {
      listName: seg.listName,
      description: seg.description,
      rowCount: matched.length,
      uniqueHashes: hashes.length,
    };
  }
  return summary;
}

export function hashesForSegment(csvPath, segmentKey) {
  const seg = SEGMENTS[segmentKey];
  if (!seg) throw new Error(`unknown segment: ${segmentKey}`);
  const rows = parseShopifyCustomersCsv(csvPath).filter(seg.filter);
  const hashes = [];
  const seen = new Set();
  for (const row of rows) {
    const h = hashEmailForCustomerMatch(row.Email || '');
    if (!h || seen.has(h)) continue;
    seen.add(h);
    hashes.push(h);
  }
  return { listName: seg.listName, description: seg.description, hashes };
}

/** Plik do ręcznego uploadu w Google Ads UI (Audience Manager → Customer list). */
export function rowsForSegment(csvPath, segmentKey) {
  const seg = SEGMENTS[segmentKey];
  if (!seg) throw new Error(`unknown segment: ${segmentKey}`);
  const rows = parseShopifyCustomersCsv(csvPath).filter(seg.filter);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const email = (row.Email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      firstName: (row['First Name'] || '').trim(),
      lastName: (row['Last Name'] || '').trim(),
      country: (row['Default Address Country Code'] || row.Country || 'PL').trim() || 'PL',
      zip: (row['Default Address Zip'] || '').trim(),
      phone: (row.Phone || row['Default Address Phone'] || '').trim(),
    });
  }
  return { listName: seg.listName, description: seg.description, rows: out };
}
