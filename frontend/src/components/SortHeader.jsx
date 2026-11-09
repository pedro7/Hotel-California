/**
 * Clickable table header. `ordering` is the current API ordering ("field" or "-field");
 * `onSort(field)` is called on click (the page decides the next direction, see `nextOrdering`).
 */
export default function SortHeader({ field, ordering, onSort, children }) {
  const descending = ordering === `-${field}`
  const active = descending || ordering === field
  return (
    <th aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => onSort(field)}>
        {children}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (descending ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  )
}

/** Ascending on first click, then toggles between descending and ascending. */
export function nextOrdering(current, field) {
  return current === field ? `-${field}` : field
}
