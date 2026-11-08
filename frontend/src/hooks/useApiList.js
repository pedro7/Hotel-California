import { useCallback, useEffect, useState } from 'react'

/**
 * Loads data with `fetcher(params, signal)` whenever `params` change (or after
 * `reload()`). `fetcher` must be a stable reference (e.g. a function from
 * `src/api`). Previous data stays available while a new request is in flight.
 */
export function useApiList(fetcher, params) {
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const paramsKey = JSON.stringify(params)
  const requestKey = `${reloadKey}:${paramsKey}`

  useEffect(() => {
    const controller = new AbortController()

    fetcher(JSON.parse(paramsKey), controller.signal)
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return
        setResult({ key: requestKey, data: null, error })
      })

    return () => controller.abort()
  }, [fetcher, paramsKey, requestKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  const settled = result.key === requestKey
  return {
    data: result.data,
    error: settled ? result.error : null,
    loading: !settled,
    reload,
  }
}
