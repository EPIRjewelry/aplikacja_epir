import {useEffect, useState} from 'react';
import {isMetaPixelConsentGranted} from '~/lib/meta-pixel';

const CONSENT_EVENT = 'kazka-consent-change';

export function dispatchKazkaConsentChange(granted: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CONSENT_EVENT, {detail: granted}),
  );
}

/** Mirrors chat/marketing consent used for Meta Pixel (KAZKA_CONSENT_STORAGE_KEY). */
export function useKazkaConsent(): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    setGranted(isMetaPixelConsentGranted());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') {
        setGranted(detail);
      } else {
        setGranted(isMetaPixelConsentGranted());
      }
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  return granted;
}
