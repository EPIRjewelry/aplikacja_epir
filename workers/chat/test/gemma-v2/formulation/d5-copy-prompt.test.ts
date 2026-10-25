import {describe, expect, it} from 'vitest';
import {GEMMA_FORMULATION_B_SYSTEM_PROMPT} from '../../../src/gemma/formulation/extract-formulation';
import {gemmaV2EmergencyReply} from '../../../src/gemma/fallback';

describe('D5 copy — bez Proszę Pana/Panią', () => {
  it('T-D5-COPY-1: system prompt formulation B bez Pana/Panią', () => {
    expect(GEMMA_FORMULATION_B_SYSTEM_PROMPT).not.toMatch(/Pana\/Panią/);
    expect(GEMMA_FORMULATION_B_SYSTEM_PROMPT).toMatch(/Pan lub Pani/);
  });

  it('T-D5-COPY-2: gemmaV2EmergencyReply bez Pana/Panią', () => {
    expect(gemmaV2EmergencyReply('epir-online-store')).not.toMatch(/Pana\/Panią/);
  });
});
