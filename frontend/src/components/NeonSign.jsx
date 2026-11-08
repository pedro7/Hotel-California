/**
 * The roadside neon sign: "Hotel California" in script plus a VACANCY box.
 * The VACANCY box is decorative; the brand name stays readable for screen readers.
 */
export default function NeonSign({ size = 'large' }) {
  return (
    <div className={`neon-sign neon-sign-${size}`}>
      <span className="neon-arrow" aria-hidden="true" />
      <span className="brand">
        <span className="brand-hotel">
          H<span className="flicker">o</span>tel
        </span>{' '}
        <span className="brand-california">
          Califo<span className="flicker-slow">r</span>nia
        </span>
      </span>
      <span className="vacancy" aria-hidden="true">
        <span className="vacancy-no">No</span> Vacancy
      </span>
    </div>
  )
}
