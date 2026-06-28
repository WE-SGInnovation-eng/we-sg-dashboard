export const config = {
  matcher: '/(.*)',
}

export default function middleware(request) {
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
