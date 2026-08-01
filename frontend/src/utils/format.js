// Strict Forensic Date Formatter
// Forces all timestamps into a standard, readable chronological format.
// Falls back to the raw string for unparseable input rather than throwing.
export function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
