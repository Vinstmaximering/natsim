// Antal med rätt böjning: antal(1, 'yta', 'ytor') → "1 yta", antal(2, …) →
// "2 ytor". Gemensam för Lager-menyn och åtgärdsraden, så att "1 linjer"
// inte kan dyka upp i den ena men inte i den andra.
export const antal = (n, en, fler) => `${n} ${n === 1 ? en : fler}`;

export const antalPunkter = n => antal(n, 'punkt', 'punkter');
export const antalLinjer  = n => antal(n, 'linje', 'linjer');
export const antalYtor    = n => antal(n, 'yta', 'ytor');
