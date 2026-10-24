export const SIDES = [
  ['bride', 'Bride'],
  ['groom', 'Groom'],
  ['both', 'Both'],
];
export const GROUPS = [
  ['family', 'Family'],
  ['friends', 'Friends'],
  ['colleagues', 'Colleagues'],
  ['other', 'Other'],
];
export const RSVP = {
  yes: { label: 'YES', name: 'Yes' },
  no: { label: 'NO', name: 'No' },
  pending: { label: 'PENDING', name: 'Pending' },
  'not-invited': { label: 'NOT INVITED', name: 'Not invited' },
};
export const MEALS = ['Veg', 'Non-veg', 'Jain', 'Vegan', 'No preference'];
export const sideName = (s) => SIDES.find(([v]) => v === s)?.[1] ?? s;
export const PHOTO_ACCESS = [
  ['none', 'No access'],
  ['view', 'Can view photos'],
  ['upload', 'Can view and add photos'],
];
export const photoAccessShort = { none: 'No', view: 'View', upload: 'View + add' };
