// The categories Bag starts with. They match the cash book Tamal imported,
// and every one can be renamed, re-iconed or deleted later.

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', emoji: '🛒', kind: 'expense', order: 1 },
  { id: 'rent', name: 'Rent', emoji: '🏠', kind: 'expense', order: 2 },
  { id: 'bills', name: 'Bills and other', emoji: '💡', kind: 'expense', order: 3 },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '🔁', kind: 'expense', order: 4 },
  { id: 'transport', name: 'Transport', emoji: '🚌', kind: 'expense', order: 5 },
  { id: 'furniture', name: 'Furniture', emoji: '🛋️', kind: 'expense', order: 6 },
  { id: 'electronics', name: 'Electronics', emoji: '💻', kind: 'expense', order: 7 },
  { id: 'clothing', name: 'Clothing and accessories', emoji: '👕', kind: 'expense', order: 8 },
  { id: 'salary', name: 'Salary', emoji: '💼', kind: 'income', order: 1 },
  { id: 'other-income', name: 'Other income', emoji: '💰', kind: 'income', order: 2 },
];

// Emoji offered first when changing a category's icon. "All emoji" opens the
// phone's own emoji keyboard.
export const EMOJI_SUGGESTIONS = ['🛒', '🏠', '💡', '🔁', '🚌', '🛋️', '💻', '👕', '🍽️', '☕', '💊', '🎓', '🎁', '✈️', '⛽', '📱', '🐾', '💼', '💰', '🏦', '🎮', '💇', '🧾', '🕌'];

// Home cards in their default order. Balance is always first and can't be hidden.
export const HOME_CARDS = [
  { id: 'month', label: 'Cash in and out', hidden: false },
  { id: 'coming', label: 'Coming up', hidden: false },
  { id: 'recent', label: 'Recent', hidden: false },
  { id: 'budgets', label: 'Budgets', hidden: true },
  { id: 'goals', label: 'Goals', hidden: true },
  { id: 'networth', label: 'Net worth', hidden: true },
];

export const ACCENTS = {
  slate: { light: '#3B4B5E', dark: '#A9C1DA', soft: '#E1E7EE', softDark: '#253041', label: 'Slate' },
  blue: { light: '#1D4ED8', dark: '#8AB4FF', soft: '#E8EEFC', softDark: '#1E2A4A', label: 'Blue' },
  teal: { light: '#0F766E', dark: '#5EEAD4', soft: '#E0F2EF', softDark: '#123430', label: 'Teal' },
  purple: { light: '#6D28D9', dark: '#C4B5FD', soft: '#EFE9FC', softDark: '#2A2145', label: 'Purple' },
  pink: { light: '#BE185D', dark: '#F9A8D4', soft: '#FCE8F1', softDark: '#3F1B2D', label: 'Pink' },
  ink: { light: '#18181B', dark: '#F4F4F5', soft: '#EDEDE8', softDark: '#2A2A2F', label: 'Ink' },
};
