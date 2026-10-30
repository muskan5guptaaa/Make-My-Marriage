// The checklist library the task plan generator draws on: what usually needs doing for each
// kind of function, and how many days before it. A function is matched to a checklist by the
// words in its name; anything unmatched gets the general event checklist.
// The model adapts these items to the couple's wedding; it never invents due dates.

export const CHECKLISTS = [
  {
    id: 'engagement',
    name: 'Engagement / Roka',
    keywords: ['engagement', 'roka', 'sagai', 'mangni', 'ring ceremony', 'nischayathartham'],
    items: [
      { title: 'Book the venue', daysBefore: 45 },
      { title: 'Choose and order the rings', daysBefore: 30 },
      { title: 'Finalise the guest list for both families', daysBefore: 25 },
      { title: 'Book the caterer and fix the menu', daysBefore: 21 },
      { title: 'Buy gifts and shagun for the other family', daysBefore: 10 },
      { title: 'Book a photographer', daysBefore: 14 },
      { title: 'Confirm the pandit and the muhurat', daysBefore: 14 },
    ],
  },
  {
    id: 'mehendi',
    name: 'Mehendi',
    keywords: ['mehendi', 'mehndi', 'henna'],
    items: [
      { title: 'Book the mehendi artists', daysBefore: 45, note: 'One artist for every 8–10 guests who want mehendi' },
      { title: 'Plan the decor and seating (floor seating, cushions)', daysBefore: 21 },
      { title: 'Order bangles and favours for guests', daysBefore: 14 },
      { title: 'Book the dhol or DJ', daysBefore: 21 },
      { title: 'Fix the menu with light snacks and chaat', daysBefore: 14 },
      { title: 'Confirm the bride’s mehendi design with the artist', daysBefore: 7 },
    ],
  },
  {
    id: 'haldi',
    name: 'Haldi',
    keywords: ['haldi', 'pithi', 'ubtan', 'mangalsnanam', 'tel baan'],
    items: [
      { title: 'Buy haldi paste ingredients and bowls', daysBefore: 3 },
      { title: 'Arrange yellow decor and marigold flowers', daysBefore: 7 },
      { title: 'Plan clothes everyone can get stained (yellow dress code)', daysBefore: 14 },
      { title: 'Arrange towels, water and a place to wash after', daysBefore: 2 },
      { title: 'Book the photographer for the morning slot', daysBefore: 21 },
    ],
  },
  {
    id: 'sangeet',
    name: 'Sangeet',
    keywords: ['sangeet', 'sangit', 'cocktail', 'musical night', 'garba', 'dandiya'],
    items: [
      { title: 'Book the DJ or band and the sound system', daysBefore: 45 },
      { title: 'Book a choreographer for family dances', daysBefore: 40 },
      { title: 'Make the performance list and running order', daysBefore: 21 },
      { title: 'Hold dance rehearsals with both families', daysBefore: 10, note: 'Usually two or three evening sessions' },
      { title: 'Arrange the stage, lighting and dance floor', daysBefore: 14 },
      { title: 'Find an anchor or emcee for the night', daysBefore: 21 },
      { title: 'Confirm the bar and drinks licence, if serving alcohol', daysBefore: 14 },
    ],
  },
  {
    id: 'wedding',
    name: 'Wedding ceremony',
    keywords: ['wedding', 'shaadi', 'pheras', 'phera', 'vivah', 'nikah', 'anand karaj', 'muhurtham', 'kalyanam', 'baraat', 'ceremony', 'lagan'],
    items: [
      { title: 'Book the pandit (or qazi or granthi) and confirm the muhurat', daysBefore: 90 },
      { title: 'Book the venue and the mandap decor', daysBefore: 90 },
      { title: 'Order the bride’s outfit and schedule fittings', daysBefore: 75 },
      { title: 'Order the groom’s sherwani and safa', daysBefore: 60 },
      { title: 'Book hair and makeup for the bride', daysBefore: 60 },
      { title: 'Book the ghodi or car and band for the baraat', daysBefore: 45 },
      { title: 'Buy the puja samagri for the ceremony', daysBefore: 7 },
      { title: 'Arrange varmala garlands and flowers', daysBefore: 3 },
      { title: 'Pack the bride’s and groom’s day-of bags', daysBefore: 1 },
    ],
  },
  {
    id: 'reception',
    name: 'Reception',
    keywords: ['reception', 'walima', 'party'],
    items: [
      { title: 'Book the reception venue', daysBefore: 75 },
      { title: 'Fix the menu and do a food tasting', daysBefore: 30 },
      { title: 'Plan the stage and photo backdrop', daysBefore: 21 },
      { title: 'Book a band or DJ for the evening', daysBefore: 30 },
      { title: 'Arrange return gifts for guests', daysBefore: 14 },
      { title: 'Choose the couple’s reception outfits', daysBefore: 45 },
    ],
  },
  {
    id: 'event',
    name: 'Any function',
    keywords: [],
    items: [
      { title: 'Confirm the venue and timings', daysBefore: 30 },
      { title: 'Fix the menu with the caterer', daysBefore: 14 },
      { title: 'Plan the decor', daysBefore: 14 },
      { title: 'Send invitations to the guests invited', daysBefore: 21 },
      { title: 'Confirm the final headcount with the caterer', daysBefore: 3 },
    ],
  },
];

// Wedding-wide work, counted back from the first function.
export const WEDDING_WIDE = {
  id: 'wedding-wide',
  name: 'Whole wedding',
  items: [
    { title: 'Set the total budget and split it by function', daysBefore: 120 },
    { title: 'Make the full guest list with both families', daysBefore: 100 },
    { title: 'Book guest accommodation and room blocks', daysBefore: 75 },
    { title: 'Design and print the wedding cards', daysBefore: 60 },
    { title: 'Send invitations and save-the-dates', daysBefore: 45 },
    { title: 'Plan travel and pickups for outstation guests', daysBefore: 30 },
    { title: 'Make the day-of timeline and share it with vendors', daysBefore: 7 },
    { title: 'Pay vendor advances and note the balances due', daysBefore: 7 },
  ],
};
