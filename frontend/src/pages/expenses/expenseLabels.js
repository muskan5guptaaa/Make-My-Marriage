export const PAID_BY = [
  ['bride-side', "Bride's side"],
  ['groom-side', "Groom's side"],
  ['shared', 'Shared'],
];
export const PAYMENT = {
  pending: { label: 'PENDING', name: 'Pending' },
  partial: { label: 'PARTIAL', name: 'Partly paid' },
  paid: { label: 'PAID', name: 'Paid' },
};
export const paidByName = (v) => PAID_BY.find(([k]) => k === v)?.[1] ?? v;
