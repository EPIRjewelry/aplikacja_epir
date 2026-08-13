import {describe, expect, it} from 'vitest';
import {renderLandingAttributionScript} from '../src/landing-attribution';
import type {Env} from '../src/env';

const env = {} as Env;

describe('renderLandingAttributionScript', () => {
  it('does not embed attacker-controlled query string in inline script', () => {
    const malicious = '?utm_campaign=x</script><script>alert(1)</script>';
    const html = renderLandingAttributionScript(env, {pageSearch: malicious});
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('var search = window.location.search;');
  });
});
