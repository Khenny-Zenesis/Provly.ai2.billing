// Display-only formatting. Inputs are ALWAYS minor units (integers); we only
// divide for presentation, never for storage or calculation (R2.1).

const SYMBOLS: Record<string, string> = {
  NGN: "\u20a6", // ₦
};

export function formatMoneyMinor(amountMinor: number, currency = "NGN"): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const naira = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
  return `${symbol}${naira}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
