import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const role = session.user?.role;

  if (role === 'LEGAL_GM')         redirect('/legal-gm-home');
  if (role === 'SPECIAL_APPROVER') redirect('/special-approver-home');
  if (role === 'FINANCE_TEAM')     redirect('/finance');
  redirect('/home');
}
