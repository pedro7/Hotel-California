import { useRef, useState } from 'react'
import { formatDate, maskDate, parseBrDate } from '../utils/format'

/**
 * Date field typed as dd/mm/aaaa (independent of the browser locale), with a calendar button
 * that opens the native date picker. `value`, `min` and `onChange` use ISO "YYYY-MM-DD";
 * onChange gets '' while the typed text is incomplete/invalid.
 */
export default function DateInput({ value, onChange, min, ...rest }) {
  const [text, setText] = useState(value ? formatDate(value) : '')
  const pickerRef = useRef(null)

  function handleChange(event) {
    const masked = maskDate(event.target.value)
    setText(masked)
    onChange(parseBrDate(masked))
  }

  function handlePick(event) {
    const iso = event.target.value
    if (!iso) return
    setText(formatDate(iso))
    onChange(iso)
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker) return
    if (typeof picker.showPicker === 'function') picker.showPicker()
    else picker.focus()
  }

  return (
    <span className="date-input">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        autoComplete="off"
        {...rest}
        value={text}
        onChange={handleChange}
      />
      <button type="button" className="date-input-btn" onClick={openPicker} aria-label="Abrir calendário">
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-input-native"
        tabIndex={-1}
        aria-hidden="true"
        // Not tied to any form: it is only a picker, so its min/value must not block submission.
        form="date-picker-detached"
        min={min}
        value={value || ''}
        onChange={handlePick}
      />
    </span>
  )
}
