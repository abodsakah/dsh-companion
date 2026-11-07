import { log } from '../log'

/** Extract the launch token from a dsh web URL (`?token=…`). */
export function launchTokenFromUrl(url: string): string | undefined {
  const match = /[?&]token=([^&]+)/.exec(url)
  return match?.[1]
}

/**
 * Exchange the launch token for the signed API cookie on `/connect`.
 * React Native fetch does not expose Set-Cookie, so this uses XHR.
 */
export function exchangeLaunchToken(hostUrl: string, launchToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${hostUrl.replace(/\/+$/, '')}/connect?token=${encodeURIComponent(launchToken)}&interactions=answer`
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.setRequestHeader('cache-control', 'no-store')
    xhr.onreadystatechange = (): void => {
      if (xhr.readyState !== 4) return
      const setCookie = xhr.getResponseHeader('set-cookie')
      if (xhr.status === 302 || (xhr.status === 200 && setCookie !== null && setCookie !== '')) {
        const first = setCookie?.split(';')[0]
        if (first !== undefined && first !== null && first !== '') {
          log(`auth: /connect exchange ok (status ${String(xhr.status)})`)
          resolve(first)
          return
        }
      }
      log(`auth: /connect exchange failed status=${String(xhr.status)} set-cookie=${JSON.stringify(setCookie)}`)
      reject(new Error(`/connect exchange failed: HTTP ${String(xhr.status)}`))
    }
    xhr.onerror = (): void => {
      log(`auth: /connect network error`)
      reject(new Error('connect exchange network error'))
    }
    xhr.send()
  })
}
