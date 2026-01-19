function isValidISODate10(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

module.exports = { isValidISODate10 };
