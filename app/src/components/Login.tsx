import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LoginProps {
    onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSignUp, setIsSignUp] = useState(false);
    const [signUpSuccess, setSignUpSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (!supabase) throw new Error('Supabase client not initialized');

            if (isSignUp) {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName },
                    },
                });
                if (signUpError) throw signUpError;
                setSignUpSuccess(true);
            } else {
                const { error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (authError) throw authError;
                onLoginSuccess();
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao processar requisição');
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsSignUp(!isSignUp);
        setError(null);
        setSignUpSuccess(false);
    };

    return (
        <div className="min-h-[100svh] flex flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-background-dark font-display selection:bg-primary/30 antialiased py-8 lg:py-0">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-primary/5 blur-[100px] rounded-full"></div>
            </div>

            <div className="relative z-10 w-full max-w-4xl px-8 flex flex-col items-center justify-center text-center">
                <div className="w-full flex flex-col items-center">

                    {/* Branding Section */}
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 mt-16 pb-8">
                        <div className="flex flex-col items-center space-y-2">
                            <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase opacity-80">O Hub</p>
                            <h1 className="font-serif text-6xl md:text-8xl tracking-tight shimmer-text">BACKSTAGEFY</h1>
                        </div>
                    </div>

                    {/* Auth Card Section */}
                    <div className="relative mt-8 w-full max-w-md animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 mx-auto text-left">
                        <div className="absolute -inset-1 bg-primary/5 blur-2xl rounded-huge opacity-50"></div>
                        <div className="obsidian-card relative rounded-huge overflow-hidden">
                            <div className="pt-16 pb-12 px-10 md:px-14">
                                <div className="mb-10">
                                    <h3 className="text-primary text-[10px] font-bold tracking-[0.5em] uppercase mb-2">
                                        {isSignUp ? 'Criar Conta' : 'Acesso Restrito'}
                                    </h3>
                                    <div className="h-px w-12 bg-primary/40"></div>
                                </div>

                                {signUpSuccess ? (
                                    <div className="space-y-6 animate-in fade-in duration-500">
                                        <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 text-center space-y-3">
                                            <span className="material-symbols-outlined text-primary text-4xl">mark_email_read</span>
                                            <p className="text-white text-sm font-medium">Conta criada com sucesso!</p>
                                            <p className="text-white/40 text-xs">Verifique seu email para confirmar o cadastro, depois volte aqui para fazer login.</p>
                                        </div>
                                        <button
                                            onClick={toggleMode}
                                            className="w-full py-4 text-[10px] text-primary tracking-[0.3em] uppercase hover:text-primary-glow transition-colors"
                                        >
                                            ← Voltar para Login
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="space-y-8">
                                        {/* Name field (Sign Up only) */}
                                        {isSignUp && (
                                            <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                                                <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">Nome Completo</label>
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={fullName}
                                                        onChange={(e) => setFullName(e.target.value)}
                                                        className="w-full bg-transparent border-0 border-b border-white/10 text-white py-3 pl-8 focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-lg"
                                                        placeholder="Seu nome"
                                                        required
                                                    />
                                                    <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors text-xl">person</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">E-mail</label>
                                            <div className="relative group">
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className="w-full bg-transparent border-0 border-b border-white/10 text-white py-3 pl-8 focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-lg"
                                                    placeholder="Digite seu e-mail"
                                                    required
                                                />
                                                <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors text-xl">account_circle</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">Senha</label>
                                            <div className="relative group">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="w-full bg-transparent border-0 border-b border-white/10 text-white py-3 pl-8 pr-10 focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-lg"
                                                    placeholder="••••••••"
                                                    required
                                                    minLength={6}
                                                />
                                                <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors text-xl">vpn_key</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30 hover:text-primary transition-colors p-1"
                                                    tabIndex={-1}
                                                >
                                                    <span className="material-symbols-outlined text-xl">
                                                        {showPassword ? 'visibility_off' : 'visibility'}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest text-center animate-shake">
                                                {error}
                                            </div>
                                        )}

                                        <div className="pt-8 flex flex-col items-end">
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="primary-glow group w-full bg-primary hover:bg-primary-glow text-black font-bold py-5 px-8 rounded-xl transition-all duration-500 flex items-center justify-between active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span className="text-[10px] tracking-[0.3em] uppercase ml-2">
                                                    {loading
                                                        ? 'Processando...'
                                                        : isSignUp
                                                            ? 'Criar Conta'
                                                            : 'Acessar Plataforma'}
                                                </span>
                                                <div className="bg-black/10 p-1 rounded-sm group-hover:translate-x-1 transition-transform">
                                                    <span className="material-symbols-outlined text-lg">
                                                        {isSignUp ? 'person_add' : 'arrow_forward_ios'}
                                                    </span>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={toggleMode}
                                                className="mt-6 text-[10px] text-white/30 hover:text-primary tracking-widest uppercase transition-colors duration-300"
                                            >
                                                {isSignUp ? '← Já tem conta? Entrar' : 'Novo aqui? Criar Conta →'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>

                            {/* Decorative corner element */}
                            <div className="absolute top-0 right-0 p-8">
                                <div className="w-12 h-12 border-t border-r border-primary/20"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="mt-12 flex flex-col md:flex-row justify-between items-center text-[9px] text-white/20 tracking-[0.4em] uppercase pb-8 border-t border-white/5 pt-8 w-full">
                    <div className="flex gap-8 mb-4 md:mb-0">
                        <span className="hover:text-white/40 transition-colors cursor-pointer text-center">Security Protocol 8.2</span>
                        <span className="hover:text-white/40 transition-colors cursor-pointer text-center">Geneva Node</span>
                    </div>
                    <p className="text-center">© 2026 BACKSTAGEFY Global • Todos os direitos reservados</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
