// Seed data for merchant aliases
// Format: { alias_or_merchant: "Standard Merchant Name", category: "Standard Category Name" }

const SEED_MERCHANT_ALIASES = [
  // Food
  { alias: 'bk', merchant: 'burger king', category: 'Food' },
  { alias: 'burgerking', merchant: 'burger king', category: 'Food' },
  { alias: 'burger king india', merchant: 'burger king', category: 'Food' },
  { alias: 'mcd', merchant: 'mcdonalds', category: 'Food' },
  { alias: 'mcdonald', merchant: 'mcdonalds', category: 'Food' },
  { alias: 'mcdonalds india', merchant: 'mcdonalds', category: 'Food' },
  { alias: 'kfc india', merchant: 'kfc', category: 'Food' },
  { alias: 'starbucks coffee', merchant: 'starbucks', category: 'Food' },

  // Entertainment
  { alias: 'netflix premium', merchant: 'netflix', category: 'Entertainment' },
  { alias: 'netflix annual', merchant: 'netflix', category: 'Entertainment' },
  { alias: 'spotify premium', merchant: 'spotify', category: 'Entertainment' },
  { alias: 'amazon prime', merchant: 'prime video', category: 'Entertainment' },

  // Health
  { alias: 'apollo', merchant: 'apollo pharmacy', category: 'Health' },
  { alias: 'apollo medical', merchant: 'apollo pharmacy', category: 'Health' },
  { alias: 'medplus', merchant: 'medplus pharmacy', category: 'Health' },

  // Fuel
  { alias: 'shell fuel', merchant: 'shell', category: 'Fuel' },
  { alias: 'indian oil', merchant: 'indian oil', category: 'Fuel' },
  { alias: 'hp petrol', merchant: 'hp petrol', category: 'Fuel' },
  { alias: 'bpcl', merchant: 'bpcl', category: 'Fuel' },

  // Travel
  { alias: 'uber ride', merchant: 'uber', category: 'Travel' },
  { alias: 'ola cab', merchant: 'ola', category: 'Travel' },

  // Shopping
  { alias: 'amazon order', merchant: 'amazon', category: 'Shopping' },
  { alias: 'flipkart order', merchant: 'flipkart', category: 'Shopping' },
  { alias: 'myntra fashion', merchant: 'myntra', category: 'Shopping' }
];

module.exports = {
  SEED_MERCHANT_ALIASES,
};
