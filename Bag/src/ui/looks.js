// Background looks from around the world. Each look changes only the
// background: the money sign on the floating coins, a few line drawings of
// things that place is known for, and the tint of the soft glow. No flags,
// nothing religious. Drawings are 24x24 line paths.

export const DRAW = {
  coin: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z',
  note: 'M4.5 6.5h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z M12 9.4a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 1 0 0-5.2Z',
  stack: 'M5 7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5s-3.1-2.5-7-2.5S5 5.6 5 7v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7 M5 11v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Z M4 7l11-3v3',
  safe: 'M5.5 4h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M12 8a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7Z M6 19v2 M18 19v2',
  bank: 'M3 10 12 4l9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18',
  card: 'M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z M2.5 10h19 M6 15h4',
  fern: 'M12 22V2 M12 6c-3 0-5-2-6-4 M12 6c3 0 5-2 6-4 M12 10c-3 0-6-2-7-4 M12 10c3 0 6-2 7-4 M12 14c-3 0-6-2-7-4 M12 14c3 0 6-2 7-4',
  koru: 'M5 21c0-9 5-16 12-16 3 0 4 2 4 4 0 3-2 5-5 5-2 0-3-1-3-3 0-1.5 1-2.5 2.5-2.5',
  kiwi: 'M6 14c0-4 4-7 9-6 4 1 5 5 3 8-2 2-6 3-9 2 M18 11l5 2 M9 18l-1 3 M12 18v3',
  lily: 'M12 18c-3-2-5-6-4-10 2 1 3 3 4 5 1-2 2-4 4-5 1 4-1 8-4 10Z M12 18c-4 0-8-2-9-5 3-1 6 0 9 2 3-2 6-3 9-2-1 3-5 5-9 5Z',
  rickshaw: 'M6 14a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z M18 14a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z M6 17h12 M9 17l2-7h6l1 7 M11 10V6h7',
  boat: 'M3 15h18l-3 4H6Z M12 15V4l6 9h-6',
  tiger: 'M12 6a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z M7 8 5 5 M17 8l2-3 M10 16c1 1 3 1 4 0 M12 6v3',
  sakura: 'M12 12c-1-3-1-6 0-8 1 2 1 5 0 8Z M12 12c3-1 6-1 8 0-2 1-5 1-8 0Z M12 12c1 3 1 6 0 8-1-2-1-5 0-8Z M12 12c-3 1-6 1-8 0 2-1 5-1 8 0Z',
  wave: 'M2 16a5 5 0 0 1 10 0a5 5 0 0 1 10 0 M5 16a2 2 0 0 1 4 0 M15 16a2 2 0 0 1 4 0',
  fuji: 'M2 20 9 8c1-1 2-1 3 0l1 1 1-1c1-1 2-1 3 0l5 12Z M8 10l2 2 2-2 2 2 2-2',
  fan: 'M12 20 3 9a12 12 0 0 1 18 0Z M12 20 7 8 M12 20V6 M12 20l5-12',
  paisley: 'M14 4c4 2 6 7 3 12-2 4-7 5-9 2-2-3 1-6 4-5 2 1 2 4 0 4',
  lotus: 'M12 20c-4 0-8-3-9-7 3 0 6 2 9 4 3-2 6-4 9-4-1 4-5 7-9 7Z M12 17c-2-3-2-7 0-11 2 4 2 8 0 11Z',
  elephant: 'M5 17V11a6 6 0 0 1 12 0v6 M17 12c2 0 3 2 3 4v3 M8 17v3 M14 17v3',
  peacock: 'M12 21v-7 M12 14c-4-1-7-5-7-9 3 0 6 3 7 6 1-3 4-6 7-6 0 4-3 8-7 9Z',
  mango: 'M9 5c5-2 10 3 9 9-1 5-7 7-10 4-3-3-4-10 1-13Z M11 5c0-2 1-3 3-3',
  star8: 'M12 2l2.5 5.5L20 5l-2.5 5.5L22 12l-4.5 1.5L20 19l-5.5-2.5L12 22l-2.5-5.5L4 19l2.5-5.5L2 12l4.5-1.5L4 5l5.5 2.5Z',
  camel: 'M3 13c2 0 3-4 5-4s2 3 4 3 2-4 4-4 2 3 3 5v1H3 M6 14v6 M10 14v6 M15 14v6 M19 14v6',
  palm: 'M12 21c0-5 0-9 1-12 M13 9c-2-3-6-4-9-3 3 0 6 2 9 3Z M13 9c2-3 6-4 8-2-3-1-6 1-8 2Z',
  coffee: 'M6 8h10v7a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4Z M16 10h2a2 2 0 0 1 0 4h-2',
  lantern: 'M12 2v3 M9 5h6 M7 8c0-2 2-3 5-3s5 1 5 3v7c0 2-2 3-5 3s-5-1-5-3Z M12 18v4 M7 11h10',
  cloud: 'M4 15c-2 0-2-4 1-4 0-3 4-4 6-2 1-3 6-3 7 1 3 0 4 4 1 5-1 2-4 2-5 0-2 2-6 2-7 0-1 1-2 0-3 0Z',
  panda: 'M12 6a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z M7 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4Z M17 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4Z M11 16h2',
  picado: 'M3 4h18v10l-3 3-3-3-3 3-3-3-3 3-3-3Z M11 8l1 2 1-2',
  cactus: 'M12 21V5a2 2 0 0 1 4 0v8 M12 13H9a2 2 0 0 1-2-2V8a1.5 1.5 0 0 1 3 0v2 M8 21h10',
  guitar: 'M9 12a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z M14 11 21 4 M19 3l2 2',
  kente: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  baobab: 'M10 21c0-5-1-9-1-11h6c0 2-1 6-1 11Z M9 10c-2-1-4-3-4-5 M15 10c2-1 4-3 4-5 M12 10V5',
  drum: 'M6 4h12l-3 8 3 8H6l3-8Z',
  crown: 'M3 18h18 M4 18l-1-10 5 4 4-7 4 7 5-4-1 10',
  bus: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M4 10h16 M8 18v2 M16 18v2',
  teacup: 'M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6Z M17 10h1.5a2.5 2.5 0 0 1 0 5H17 M3 21h16',
  maple: 'M12 21v-5 M12 16l-6 1 2-3-4-3 3-1-1-4 3 2 1-3 2 3 2-3 1 3 3-2-1 4 3 1-4 3 2 3Z',
  pine: 'M12 2 6 10h3l-4 6h4l-3 5h12l-3-5h4l-4-6h3Z',
  canoe: 'M2 14c5 3 15 3 20 0-5 1-15 1-20 0Z M15 6l-4 10',
};

export const LOOKS = [
  { id: 'bag', name: 'Bag classic', sym: '$', glow: ['#5EC8D8', '#B79CF0'], draw: ['coin', 'note', 'stack', 'wallet', 'safe', 'bank', 'card'] },
  { id: 'nz', name: 'Aotearoa', sym: '$', glow: ['#3FA58A', '#3E7FB0'], draw: ['fern', 'koru', 'kiwi', 'coin', 'fern'] },
  { id: 'bd', name: 'Bangladesh', sym: '৳', glow: ['#2E9E68', '#C2475E'], draw: ['lily', 'rickshaw', 'boat', 'tiger', 'coin'] },
  { id: 'jp', name: 'Japan', sym: '¥', glow: ['#E890A8', '#4A6EA8'], draw: ['sakura', 'wave', 'fuji', 'fan', 'coin'] },
  { id: 'in', name: 'India', sym: '₹', glow: ['#E89A3A', '#2E9E9E'], draw: ['paisley', 'lotus', 'elephant', 'peacock', 'mango'] },
  { id: 'gulf', name: 'Gulf', sym: 'د', glow: ['#D9B45A', '#2E7F8A'], draw: ['star8', 'camel', 'palm', 'coffee', 'coin'] },
  { id: 'cn', name: 'China', sym: '元', glow: ['#D9534A', '#C9A040'], draw: ['lantern', 'cloud', 'panda', 'coin', 'cloud'] },
  { id: 'mx', name: 'Mexico', sym: '$', glow: ['#E86A9A', '#3FA58A'], draw: ['picado', 'cactus', 'guitar', 'coin', 'picado'] },
  { id: 'gh', name: 'West Africa', sym: '₵', glow: ['#E2B528', '#2E8A4E'], draw: ['kente', 'baobab', 'drum', 'coin', 'kente'] },
  { id: 'uk', name: 'Britain', sym: '£', glow: ['#5A6EB0', '#C2475E'], draw: ['crown', 'bus', 'teacup', 'coin', 'bus'] },
  { id: 'ca', name: 'Canada', sym: '$', glow: ['#D9634A', '#3E7FB0'], draw: ['maple', 'pine', 'canoe', 'coin', 'maple'] },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

// Which look to use when Bag opens. mode: each (a different one every
// open), daily (one a day), keep (always the first you picked).
export function pickLook(looks, last, lastDay, today) {
  const pick = (looks && looks.pick && looks.pick.length ? looks.pick : ['bag']).filter((id) => LOOKS.some((l) => l.id === id));
  const list = pick.length ? pick : ['bag'];
  const mode = (looks && looks.mode) || 'each';
  if (mode === 'keep' || list.length === 1) return { id: list[0], day: today };
  if (mode === 'daily' && lastDay === today && list.includes(last)) return { id: last, day: today };
  const others = list.filter((id) => id !== last);
  const from = others.length ? others : list;
  return { id: from[Math.floor(Math.random() * from.length)], day: today };
}
