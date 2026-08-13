import type { CocreateBriefFields } from './types';
import {
  FIELD_LIMITS,
  isValidEmail,
  requireTrimmed,
  sanitizeEmailHeader,
  trimField,
} from './utils';

export function parseCocreateFormData(formData: FormData): { ok: true; fields: CocreateBriefFields } | { ok: false; message: string } {
  const name = requireTrimmed(formData.get('name'), FIELD_LIMITS.MAX_NAME);
  const emailRaw = requireTrimmed(formData.get('email'), FIELD_LIMITS.MAX_EMAIL);
  const vision = requireTrimmed(formData.get('vision'), FIELD_LIMITS.MAX_VISION);

  if (!name || !emailRaw || !vision) {
    return { ok: false, message: 'Uzupełnij imię, e-mail i opis wizji.' };
  }
  const safeName = sanitizeEmailHeader(name, FIELD_LIMITS.MAX_NAME);
  if (!safeName) {
    return { ok: false, message: 'Podaj poprawne imię.' };
  }
  if (!isValidEmail(emailRaw)) {
    return { ok: false, message: 'Podaj poprawny adres e-mail.' };
  }

  const consentProject = formData.get('consent_project');
  if (consentProject !== '1' && consentProject !== 'on' && consentProject !== 'true') {
    return { ok: false, message: 'Wymagana zgoda na kontakt w sprawie projektu.' };
  }

  const consentMarketingRaw = formData.get('consent_marketing');
  const consentMarketing = consentMarketingRaw === '1' || consentMarketingRaw === 'on' || consentMarketingRaw === 'true';

  return {
    ok: true,
    fields: {
      name: safeName,
      email: emailRaw.toLowerCase(),
      phone: trimField(formData.get('phone'), FIELD_LIMITS.MAX_PHONE),
      vision,
      jewelryType: trimField(formData.get('jewelry_type'), FIELD_LIMITS.MAX_SHORT),
      metal: trimField(formData.get('metal'), FIELD_LIMITS.MAX_SHORT),
      stone: trimField(formData.get('stone'), FIELD_LIMITS.MAX_SHORT),
      occasion: trimField(formData.get('occasion'), FIELD_LIMITS.MAX_SHORT),
      budgetBand: trimField(formData.get('budget_band'), FIELD_LIMITS.MAX_SHORT),
      timeline: trimField(formData.get('timeline'), FIELD_LIMITS.MAX_SHORT),
      ringSize: trimField(formData.get('ring_size'), FIELD_LIMITS.MAX_SHORT),
      consentProject: true,
      consentMarketing,
      sourceUrl: trimField(formData.get('source_url'), 512),
    },
  };
}
