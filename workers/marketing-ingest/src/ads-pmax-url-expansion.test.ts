import { describe, expect, it } from 'vitest';
import { planUrlExpansionOptOut, URL_EXPANSION_AUTOMATION_TYPE } from './ads-pmax-url-expansion';

describe('planUrlExpansionOptOut', () => {
  it('opts out expansion and keeps other automation rows', () => {
    const planned = planUrlExpansionOptOut([
      { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' },
      { assetAutomationType: URL_EXPANSION_AUTOMATION_TYPE, assetAutomationStatus: 'OPTED_IN' },
    ]);
    expect(planned.alreadyOptedOut).toBe(false);
    expect(planned.next).toEqual([
      { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' },
      { assetAutomationType: URL_EXPANSION_AUTOMATION_TYPE, assetAutomationStatus: 'OPTED_OUT' },
    ]);
  });

  it('appends the expansion row when the API omitted defaults', () => {
    const planned = planUrlExpansionOptOut([]);
    expect(planned.alreadyOptedOut).toBe(false);
    expect(planned.next).toEqual([
      { assetAutomationType: URL_EXPANSION_AUTOMATION_TYPE, assetAutomationStatus: 'OPTED_OUT' },
    ]);
  });
});
