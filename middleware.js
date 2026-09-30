export const config = {
  matcher: '/(.*)',
}

// Called by the Google Sheet's script, which can't log in. It checks its own
// shared secret instead (see api/sheet-sync.js).
const PUBLIC_PATHS = ['/api/sheet-sync']

export default function middleware(request) {
  if (PUBLIC_PATHS.includes(new URL(request.url).pathname)) return

  const password = process.env.DASHBOARD_PASSWORD
  const authHeader = request.headers.get('authorization')

  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6))
    const inputPassword = decoded.slice(decoded.indexOf(':') + 1)
    if (inputPassword === password) return
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="WE SG Dashboard"',
    },
  })
}
