import React, { useState } from 'react';
import { 
  Sprout, 
  Lock, 
  Mail, 
  Loader2, 
  AlertTriangle
} from 'lucide-react';
import { 
  loginSupabaseUser, 
  SupabaseUser
} from '../supabaseClient';

interface LoginProps {
  onSuccess: (user: SupabaseUser) => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthMessage({ text: 'Por favor, rellene todos los campos.', isError: true });
      return;
    }
    setIsAuthLoading(true);
    setAuthMessage(null);
    
    const result = await loginSupabaseUser(authEmail.trim(), authPassword);
    setIsAuthLoading(false);
    if (result.success && result.user) {
      onSuccess(result.user);
    } else {
      setAuthMessage({ text: result.message || 'Credenciales inválidas o error de inicio de sesión.', isError: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#f9f9f9] px-4 py-8 font-sans antialiased text-[#1a1c1c]">
      <div className="w-full max-w-md space-y-6">
        
        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-[#00450d] text-white rounded-2xl shadow-md transform hover:rotate-6 transition-transform">
            <Sprout className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#00450d] tracking-tight">Bobadilla Viveros</h1>
            <p className="text-xs text-[#717a6d] font-bold uppercase tracking-wider">Sistema de Gestión Agrícola</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-[#c0c9bb]/60 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="border-b border-[#c0c9bb]/20 pb-3">
            <h2 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wider">
              Acceso de Operadores
            </h2>
            <p className="text-[10px] text-[#717a6d] mt-0.5 font-semibold">
              Ingrese sus credenciales para acceder al sistema.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-[#717a6d] uppercase flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-[#00450d]" /> Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="ejemplo@vivero.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                className="h-11 border border-[#c0c9bb] rounded-xl px-3 text-xs font-semibold focus:border-[#00450d] focus:ring-1 focus:ring-[#00450d] outline-none bg-white transition-all text-[#1a1c1c]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-[#717a6d] uppercase flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-[#00450d]" /> Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                className="h-11 border border-[#c0c9bb] rounded-xl px-3 text-xs font-semibold focus:border-[#00450d] focus:ring-1 focus:ring-[#00450d] outline-none bg-white transition-all text-[#1a1c1c]"
              />
            </div>

            {authMessage && (
              <div className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-1.5 bg-[#ffdad6]/40 border-[#ffdaae] text-[#ba1a1a]`}>
                <AlertTriangle className="w-4.5 h-4.5 text-[#ba1a1a] shrink-0 mt-0.5" />
                <p>{authMessage.text}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-3 bg-[#00450d] hover:bg-[#002203] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 uppercase tracking-widest mt-2"
            >
              {isAuthLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
                </>
              ) : (
                <>
                  <Lock className="w-4.5 h-4.5" /> Iniciar Sesión
                </>
              )}
            </button>
          </form>
        </div>

        {/* Global Footer info */}
        <p className="text-center text-[10px] text-[#717a6d] font-semibold">
          Bobadilla Viveros • Sistema Seguro
        </p>
      </div>
    </div>
  );
}
