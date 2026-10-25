import type {BuyerDiscoverSlots} from './discover-slots';

export function discoverQuestionForSlot(slot: keyof BuyerDiscoverSlots): string {
  switch (slot) {
    case 'product_type':
      return 'Jaki rodzaj biżuterii Pana lub Panią interesuje — pierścionek, kolczyki, naszyjnik czy bransoletka?';
    case 'budget':
      return 'Jaki orientacyjny budżet Pana lub Panią interesuje — raczej niższy, średni czy wyższy?';
    case 'metal':
      return 'Jaki metal Pana lub Panią interesuje — srebro, złoto 14K czy 18K?';
    case 'stone':
      return 'Jaki kamień Pana lub Panią interesuje — brylant, szafir, inny?';
    case 'occasion':
      return 'Na jaką okazję szuka Pan lub Pani biżuterii — urodziny, rocznica, zaręczyny?';
    case 'recipient':
      return 'Dla kogo jest prezent — partner, mama, przyjaciółka?';
    default:
      return 'Czy może Pan lub Pani opisać, czego szuka — rodzaj biżuterii lub okazję?';
  }
}
