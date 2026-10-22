// Homepage copy. Everything here describes what the app actually does; example names and
// numbers appear only inside the clearly labelled previews.

export const COMPARISON = {
  before: [
    '“Who has the latest guest list?”',
    '“I thought you booked the photographer.”',
    '“How much have we spent on decor so far?”',
    '“Did the Mehta family say yes to Reception?”',
  ],
  after: [
    'One guest list, with every RSVP per function',
    'Tasks with an owner and a due date',
    'Budget against actual, down to the rupee',
    'Every function’s date, venue and dress code',
  ],
};

export const FEATURES = [
  {
    icon: 'DashboardIcon',
    label: 'Dashboard',
    title: 'The whole wedding at a glance',
    text: 'A countdown to the next function, a timeline of every function, and the numbers that matter on one screen.',
    sample: '4 days until Sangeet',
  },
  {
    icon: 'TasksIcon',
    label: 'Tasks',
    title: 'A little help from everyone',
    text: 'Give each task to the right person with a due date. Overdue ones stand out; done ones get crossed off.',
    sample: 'Caterer booked by Rohan',
  },
  {
    icon: 'GuestsIcon',
    label: 'Guests',
    title: 'Guests, thoughtfully invited',
    text: 'Invite each guest only to the functions they should attend, set their plus-ones, or import your spreadsheet.',
    sample: '142 guests, 5 functions',
  },
  {
    icon: 'FunctionsIcon',
    label: 'RSVPs',
    title: 'Answers you can count on',
    text: 'Guests reply separately for each function, with how many are coming and their meal choice.',
    sample: '98 yes for Sangeet',
  },
  {
    icon: 'ExpensesIcon',
    label: 'Expenses',
    title: 'Know where the money goes',
    text: "Budget against actual by category and by function, split between bride's side, groom's side and shared.",
    sample: 'Catering · ₹3,50,000',
  },
  {
    icon: 'GalleryIcon',
    label: 'Livestream',
    title: 'For the ones far away',
    text: 'Add a YouTube livestream link to any function, so family abroad can watch the pheras live.',
    sample: 'Wedding · streaming live',
  },
];

export const EVENTS = [
  { day: '18', month: 'OCT', name: 'Haldi', lead: 'Turmeric, laughter and a lot of yellow', time: '9:00 AM', venue: 'Family home', dress: 'Yellow', tone: 'haldi' },
  { day: '20', month: 'OCT', name: 'Mehendi', lead: 'Henna, songs and stories', time: '4:00 PM', venue: 'Garden lawn', dress: 'Pastels', tone: 'mehendi' },
  { day: '24', month: 'OCT', name: 'Sangeet', lead: 'The night everyone dances', time: '7:00 PM', venue: 'The Grand Lawns', dress: 'Gold & emerald', tone: 'sangeet' },
  { day: '26', month: 'OCT', name: 'Wedding', lead: 'The pheras, the vows, forever', time: '10:00 AM', venue: 'Amber Fort Gardens', dress: 'Ivory & gold', tone: 'wedding' },
  { day: '27', month: 'OCT', name: 'Reception', lead: 'One more celebration', time: '7:30 PM', venue: 'The Grand Lawns', dress: 'Cocktail', tone: 'reception' },
];

export const STEPS = [
  { title: 'Create your wedding', text: 'Add the couple’s names, then each function with its date, venue and dress code.' },
  { title: 'Bring in family', text: 'Invite parents, siblings and cousins as co-admins by email, even if they’ve never used the app.' },
  { title: 'Add guests, share links', text: 'Type them in or import a spreadsheet, choose their functions, and send each private link on WhatsApp.' },
  { title: 'Watch it come together', text: 'RSVPs, tasks and spending update for everyone the moment anyone changes them.' },
];

export const ROLES = [
  {
    who: 'Owners',
    tag: 'OWNER',
    people: 'Usually the couple',
    text: 'Everything co-admins can do, plus inviting members, changing roles and archiving the wedding.',
    tone: 'rose',
  },
  {
    who: 'Co-admins',
    tag: 'CO-ADMIN',
    people: 'Parents, siblings, cousins',
    text: 'Manage functions, tasks, guests and expenses with you, so nothing waits on one person.',
    tone: 'gold',
  },
  {
    who: 'Guests',
    tag: 'GUEST LINK',
    people: 'Everyone you invite',
    text: 'Open a private link, see only the functions they’re invited to, and RSVP. No password, nothing to install.',
    tone: 'plain',
  },
];

export const PRIVACY = [
  { title: 'Private to your wedding', text: 'Only the members of your wedding can see its plans, guests and budget.' },
  { title: 'Clear roles', text: 'Owners manage members. Co-admins help plan. Guests see only their own invitations.' },
  { title: 'Links you control', text: 'Every guest link can be turned off or replaced in seconds if it’s shared by mistake.' },
  { title: 'Nothing deleted by accident', text: 'Archiving hides a wedding without deleting anything, and an owner can restore it.' },
];

export const FAQ = [
  {
    q: 'Do guests need to create an account?',
    a: 'No. Each guest gets a private link that opens only their invitations. If a link is shared by mistake, you can turn it off and make a new one in seconds.',
  },
  {
    q: 'Can family members help plan?',
    a: 'Yes. Owners invite co-admins by email, even if they have never used Make My Marriage. Once they accept, they can manage functions, tasks, guests and expenses.',
  },
  {
    q: 'I already have my guest list in a spreadsheet.',
    a: 'Save it as CSV and import it. Function names are matched for you, guests already on your list are skipped, and if any row has a problem nothing is imported until you fix it.',
  },
  {
    q: 'Can guests answer differently for each function?',
    a: 'Yes. A guest can say yes to Sangeet and no to Reception. Plus-ones are limited to what you allow for each guest.',
  },
  {
    q: 'What happens to times if family abroad opens it?',
    a: 'Dates and times stay exactly as you set them in the wedding’s timezone, so 7:00 PM in Jaipur never shows up as a different time.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. Every screen works on a phone, which is where most guests will open their link.',
  },
];
