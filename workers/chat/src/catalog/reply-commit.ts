/**
 * Kolejność tury kupującego: zapis historii, potem delta, potem [DONE].
 * Pusta treść nie tworzy klatki — klient nie dostaje pustej „Wiadomości”,
 * a koniec strumienia nie wyprzedza zapisu tej samej odpowiedzi.
 */

export type BuyerReplyFrame =
  | {kind: 'persist'; text: string}
  | {kind: 'delta'; text: string}
  | {kind: 'done'};

export function planBuyerReplyFrames(text: string): BuyerReplyFrame[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {kind: 'persist', text: trimmed},
    {kind: 'delta', text: trimmed},
    {kind: 'done'},
  ];
}
