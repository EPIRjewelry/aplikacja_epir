import {describe, expect, it} from 'vitest';
import {
  flattenStoneProfileFields,
  stoneProfileToAdditionalProperty,
} from './stone-profile';

describe('flattenStoneProfileFields', () => {
  it('maps key/value pairs and skips empty', () => {
    expect(
      flattenStoneProfileFields([
        {key: 'stone_name', value: 'Amethyst'},
        {key: 'hardness', value: ' 7 '},
        {key: 'chakra', value: ''},
        {key: null, value: 'x'},
      ]),
    ).toEqual({stone_name: 'Amethyst', hardness: '7'});
  });

  it('returns empty object for missing fields', () => {
    expect(flattenStoneProfileFields(null)).toEqual({});
    expect(flattenStoneProfileFields(undefined)).toEqual({});
    expect(flattenStoneProfileFields([])).toEqual({});
  });
});

describe('stoneProfileToAdditionalProperty', () => {
  it('maps only JSON-LD text fields with PropertyValue shape', () => {
    const props = stoneProfileToAdditionalProperty([
      {key: 'stone_name', value: 'Amethyst'},
      {key: 'hardness', value: '7'},
      {key: 'refractive_index', value: '1.54–1.55'},
      {key: 'jaki_to_zwiazek', value: 'SiO₂'},
      {key: 'birthstone_month', value: 'February'},
      {key: 'chakra', value: 'Crown'},
      {key: 'paleta_kolorow_kamienia', value: 'Purple to violet'},
      {key: 'komu_dedykowany_jest_ten_kamien', value: 'Seekers of calm'},
      {key: 'mythology', value: '{"type":"root"}'},
      {key: 'zdjecie_makro', value: 'gid://shopify/MediaImage/1'},
      {key: 'design_challenge', value: 'Facet tension'},
    ]);

    expect(props).toEqual([
      {'@type': 'PropertyValue', name: 'Stone', value: 'Amethyst'},
      {'@type': 'PropertyValue', name: 'Hardness (Mohs)', value: '7'},
      {
        '@type': 'PropertyValue',
        name: 'Refractive Index',
        value: '1.54–1.55',
      },
      {
        '@type': 'PropertyValue',
        name: 'Chemical Composition',
        value: 'SiO₂',
      },
      {'@type': 'PropertyValue', name: 'Birthstone', value: 'February'},
      {'@type': 'PropertyValue', name: 'Chakra', value: 'Crown'},
      {
        '@type': 'PropertyValue',
        name: 'Color Range',
        value: 'Purple to violet',
      },
      {
        '@type': 'PropertyValue',
        name: 'For Whom',
        value: 'Seekers of calm',
      },
    ]);
  });

  it('omits missing values', () => {
    expect(
      stoneProfileToAdditionalProperty([
        {key: 'stone_name', value: 'Opal'},
        {key: 'hardness', value: ''},
      ]),
    ).toEqual([
      {'@type': 'PropertyValue', name: 'Stone', value: 'Opal'},
    ]);
  });
});
