// Shared test data shaped like the API responses.

export function makeGuest(overrides = {}) {
  return {
    id: 1,
    name: 'Maria Silva',
    document: '12345678900',
    phone: '11912345678',
    ...overrides,
  }
}

export function makeReservation(overrides = {}) {
  const guest = overrides.guest_detail ?? makeGuest()
  return {
    id: 10,
    guest: guest.id,
    guest_detail: guest,
    check_in_date: '2026-11-07',
    check_out_date: '2026-11-08',
    has_car: false,
    status: 'RESERVED',
    checked_in_at: null,
    checked_out_at: null,
    total_amount: null,
    ...overrides,
  }
}

export function makePage(results) {
  return { count: results.length, next: null, previous: null, results }
}

/** Bill for one Saturday night with a car and no late fee. */
export function makeBill(overrides = {}) {
  return {
    nights: [
      { date: '2026-11-07', weekend: true, daily_rate: '180.00', parking_fee: '20.00' },
    ],
    nights_count: 1,
    daily_total: '180.00',
    parking_total: '20.00',
    late_checkout: false,
    late_checkout_fee: '0.00',
    total: '200.00',
    ...overrides,
  }
}
