#!/usr/bin/env node
/**
 * Patches for PDP pracownia / telefon (local only, no push).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(root, 'themes/epir-online-store/templates');

const RETURN_SNIPPETS = [
  /<li><strong>Zwroty:<\/strong>[^<]*<\/li>/gi,
  /<p>Zwrot wyrobu bez podania przyczyny[^<]*<\/p>/gi,
  /Masz 14 dni na zwrot[^<]*/gi,
  /14 dni na zwrot/gi,
  /do 14 dni od chwili odebrania przesyłki[^<]*/gi,
];

function stripReturnsFromContent(content) {
  let next = content;
  for (const re of RETURN_SNIPPETS) {
    next = next.replace(re, '');
  }
  next = next.replace(/"header": "Wysyłka i Zwroty"/g, '"header": "Wysyłka"');
  return next;
}

function patchContent(content, fileName) {
  let next = content.replace(/polityka-zwrotow-1/g, 'polityka-zwrotow');
  next = stripReturnsFromContent(next);

  if (fileName === 'product.nowy-szablon.json') {
    next = next.replace(
      `"addons": {
          "type": "addons",
          "disabled": true,
          "settings": {
            "show_atcp": false,
            "show_ask_a_question": false,`,
      `"addons": {
          "type": "addons",
          "disabled": false,
          "settings": {
            "show_atcp": false,
            "show_ask_a_question": false,`,
    );
    next = next.replace(
      /"show_ask_a_question": true,/g,
      '"show_ask_a_question": false,',
    );
    next = next.replace(
      `"shipping_VBJFtx": {
          "type": "shipping",
          "disabled": true,`,
      `"shipping_VBJFtx": {
          "type": "shipping",
          "disabled": false,`,
    );
    next = next.replace(/"date_format": "%b %d"/g, '"date_format": "%d.%m.%Y"');
    next = next.replace(/"show_shipping_text": true/g, '"show_shipping_text": false');
    next = next.replace(
      /"shipping_text": "[^"]*"/g,
      '"shipping_text": ""',
    );
    next = next.replace(
      `"buy_buttons",
        "description_pdp_editorial",
        "size_guide_link_pdp",
        "payments_comfort_pdp",
        "addons",
        "shipping_VBJFtx",`,
      `"buy_buttons",
        "addons",
        "shipping_VBJFtx",
        "description_pdp_editorial",
        "size_guide_link_pdp",
        "payments_comfort_pdp",`,
    );
    next = next.replace(
      /"disable_selected_variant_default": false/g,
      '"disable_selected_variant_default": true',
    );
    next = next.replace(
      `"size_title": "Rozmiar"`,
      `"size_title": "Rozmiar,Size,Ring size,ring-size"`,
    );
  }

  if (fileName === 'product.pierscionek-zloto-turmali.json') {
    next = next.replace(`"size_title": "Size"`, `"size_title": "Rozmiar,Size,Ring size,ring-size"`);
    next = next.replace(
      /"disable_selected_variant_default": false/g,
      '"disable_selected_variant_default": true',
    );
    next = next.replace(/"show_ask_a_question": true,/g, '"show_ask_a_question": false,');
    next = next.replace(/"show_shipping_text": true/g, '"show_shipping_text": false');
    next = next.replace(
      /"shipping_text": "[^"]*"/g,
      '"shipping_text": ""',
    );
    next = next.replace(
      /"epir_engraving": (true|false)/g,
      '"epir_engraving": true',
    );
    if (!next.includes('"epir_engraving"')) {
      next = next.replace(
        /"disable_selected_variant_default": true,/,
        '"disable_selected_variant_default": true,\n        "epir_engraving": true,',
      );
    }
  }

  if (fileName === 'product.json') {
    next = next.replace(
      /"disable_selected_variant_default": false/g,
      '"disable_selected_variant_default": true',
    );
  }

  return next;
}

const files = fs.readdirSync(templatesDir).filter((f) => f.startsWith('product') && f.endsWith('.json'));

for (const fileName of files) {
  const filePath = path.join(templatesDir, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const patched = patchContent(raw, fileName);
  if (patched !== raw) {
    fs.writeFileSync(filePath, patched, 'utf8');
    console.log('patched', fileName);
  }
}
