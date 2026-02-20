'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await signIn('credentials', {
      email, password, redirect: false,
    });
    if (res?.ok) {
      router.push('/');
    } else {
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  const DEV_USERS = [
    { label: 'Initiator',     email: 'oliva.perera@testdimo.com' },
    { label: 'BUM',           email: 'grace.perera@testdimo.com' },
    { label: 'FBP',           email: 'madurika.sama@testdimo.com' },
    { label: 'Cluster Head',  email: 'mangala.wick@testdimo.com' },
    { label: 'Legal Officer', email: 'sandalie.gomes@testdimo.com' },
    { label: 'Legal GM',      email: 'dinali.guru@testdimo.com' },
    { label: 'Spec. Approver', email: 'special.approver@testdimo.com' },
    { label: 'Finance',        email: 'finance.team@testdimo.com' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-10 pb-8 text-center"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white font-black text-xl">DIMO Legal Help Desk</h1>
            <p className="text-white/60 text-sm mt-1">Sign in to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 text-center font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="you@testdimo.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 transition-all" />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 transition-all pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-60 shadow-lg mt-2"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : 'Sign In'}
            </button>
          </form>

          {/* Dev quick-login — only in development */}
          {process.env.NODE_ENV === 'development' && (
          <div className="px-8 pb-8">
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 text-center">Dev Quick Login</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DEV_USERS.map((u) => (
                  <button key={u.email} type="button"
                    onClick={() => { setEmail(u.email); setPassword('Test@1234'); }}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-[#1A438A] bg-[#EEF3F8] hover:bg-[#1A438A] hover:text-white transition-all text-left truncate">
                    {u.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-2">Click a role to fill credentials, then Sign In</p>
            </div>
          </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          © {new Date().getFullYear()} Diesel &amp; Motor Engineering PLC
        </p>
      </div>
    </div>
  );
}
