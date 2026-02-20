import { type NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

const azureProvider = process.env.AZURE_AD_CLIENT_ID ? [
  AzureADProvider({
    clientId:     process.env.AZURE_AD_CLIENT_ID,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    tenantId:     process.env.AZURE_AD_TENANT_ID!,
  }),
] : [];

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
          if (!user || !user.password) return null;
          if (user.password !== hashPassword(credentials.password)) return null;
          if (!user.isActive) return null;
          return { id: user.id, name: user.name ?? '', email: user.email, role: user.role };
        } catch (err) {
          console.error('Auth error:', err);
          return null;
        }
      },
    }),
    ...azureProvider,
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.name = (user as any).name;
        token.role   = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id   = token.userId as string;
        session.user.role = token.role   as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
