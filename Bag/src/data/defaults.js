// The categories Bag starts with. They match the cash book Tamal imported,
// and every one can be renamed, re-iconed or deleted later.

export const DEFAULT_CATEGORIES = [
  { id: 'rent', name: 'Rent', emoji: '🏠', kind: 'expense', order: 1, color: '#F2A65A' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒', kind: 'expense', order: 2, color: '#5CC79A' },
  { id: 'eating', name: 'Eating out', emoji: '🍜', kind: 'expense', order: 3, color: '#F28FB0' },
  { id: 'transport', name: 'Transport', emoji: '🚌', kind: 'expense', order: 4, color: '#5EC8D8' },
  { id: 'bills', name: 'Bills', emoji: '💡', kind: 'expense', order: 5, color: '#E9D27A' },
  { id: 'phone', name: 'Phone and internet', emoji: '📱', kind: 'expense', order: 6, color: '#F5C35B' },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '🔁', kind: 'expense', order: 7, color: '#F0857E' },
  { id: 'shopping', name: 'Shopping', emoji: '📦', kind: 'expense', order: 8, color: '#B79CF0' },
  { id: 'clothing', name: 'Clothing', emoji: '👕', kind: 'expense', order: 9, color: '#D9A6F2' },
  { id: 'electronics', name: 'Electronics', emoji: '💻', kind: 'expense', order: 10, color: '#8FB8E8' },
  { id: 'furniture', name: 'Furniture', emoji: '🛋️', kind: 'expense', order: 11, color: '#C9A27E' },
  { id: 'health', name: 'Health', emoji: '💊', kind: 'expense', order: 12, color: '#C4E07A' },
  { id: 'education', name: 'Education', emoji: '📚', kind: 'expense', order: 13, color: '#8C9BF5' },
  { id: 'family', name: 'Family and gifts', emoji: '🎁', kind: 'expense', order: 14, color: '#E8A0E0' },
  { id: 'fun', name: 'Fun and outings', emoji: '🎬', kind: 'expense', order: 15, color: '#FF9F6E' },
  { id: 'care', name: 'Personal care', emoji: '🧴', kind: 'expense', order: 16, color: '#9FD8E8' },
  { id: 'other', name: 'Other', emoji: '🏷️', kind: 'expense', order: 17, color: '#9AA7B6' },
  { id: 'salary', name: 'Salary', emoji: '💼', kind: 'income', order: 1, color: '#7FB2F0' },
  { id: 'side-work', name: 'Side work', emoji: '🧰', kind: 'income', order: 2, color: '#6FD3B2' },
  { id: 'refunds', name: 'Refunds', emoji: '↩️', kind: 'income', order: 3, color: '#A8C8F0' },
  { id: 'gifts-in', name: 'Gifts received', emoji: '🎀', kind: 'income', order: 4, color: '#F2B8D0' },
  { id: 'other-income', name: 'Other income', emoji: '💰', kind: 'income', order: 5, color: '#C9D3DF' },
];

// Colours offered when you make or recolour a category.
export const CATEGORY_COLORS = ['#F2A65A', '#5CC79A', '#F28FB0', '#5EC8D8', '#E9D27A', '#F5C35B', '#F0857E', '#B79CF0', '#D9A6F2', '#8FB8E8', '#C9A27E', '#C4E07A', '#8C9BF5', '#E8A0E0', '#FF9F6E', '#9FD8E8', '#7FB2F0', '#6FD3B2', '#9AA7B6'];

// Kinds of account: each has its own icon and colour.
export const ACCOUNT_KINDS = {
  bank: { label: 'Bank', emoji: '🏦', color: '#7FB2F0' },
  cash: { label: 'Cash', emoji: '💵', color: '#5CC79A' },
  savings: { label: 'Savings', emoji: '🐖', color: '#B79CF0' },
  card: { label: 'Card', emoji: '💳', color: '#F2A65A' },
};

// Emoji offered first when changing a category's icon. "All emoji" opens the
// phone's own emoji keyboard.
export const EMOJI_SUGGESTIONS = ['🛒', '🏠', '💡', '🔁', '🚌', '🛋️', '💻', '👕', '🍽️', '☕', '💊', '🎓', '🎁', '✈️', '⛽', '📱', '🐾', '💼', '💰', '🏦', '🎮', '💇', '🧾', '🕌'];

// Home cards in their default order. Balance is always first and can't be hidden.
export const HOME_CARDS = [
  { id: 'month', label: 'Cash in and out', hidden: false },
  { id: 'coming', label: 'Upcoming', hidden: false },
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
