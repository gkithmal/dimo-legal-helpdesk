import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: ['/home/:path*', '/form1/:path*', '/legal-gm-home/:path*', '/settings/:path*', '/finance/:path*'],
};
