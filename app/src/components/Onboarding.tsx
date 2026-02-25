import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface OnboardingProps {
    userId: string;
    onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ userId, onComplete }) => {
    const [step, setStep] = useState(1);
    const [companyName, setCompanyName] = useState('');
    const [agentName, setAgentName] = useState('');
    const [agentPrompt, setAgentPrompt] = useState(
        'Você é um assistente de atendimento profissional e amigável. Responda de forma clara e objetiva, sempre buscando ajudar o cliente da melhor forma possível.'
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateSlug = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const handleFinish = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Create Tenant
            const slug = generateSlug(companyName);
            const { data: tenant, error: tenantErr } = await supabase
                .from('tenants')
                .insert({ name: companyName, slug, owner_id: userId })
                .select()
                .single();

            if (tenantErr) throw tenantErr;

            // 2. Add owner as tenant member
            const { error: memberErr } = await supabase
                .from('tenant_members')
                .insert({ tenant_id: tenant.id, user_id: userId, role: 'owner' });

            if (memberErr) throw memberErr;

            // 3. Create first agent
            const { error: agentErr } = await supabase
                .from('agents')
                .insert({
                    tenant_id: tenant.id,
                    name: agentName,
                    system_prompt: agentPrompt,
                });

            if (agentErr) throw agentErr;

            onComplete();
        } catch (err: any) {
            setError(err.message || 'Erro ao criar organização');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100svh] flex items-center justify-center bg-background-dark font-display antialiased overflow-y-auto py-8">
            {/* Ambient glow */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-primary/5 blur-[100px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-lg px-6">
                {/* Progress */}
                <div className="flex items-center justify-center gap-3 mb-12">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex items-center gap-3">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${step >= s
                                        ? 'bg-primary text-black shadow-primary'
                                        : 'bg-white/5 text-white/30 border border-white/10'
                                    }`}
                            >
                                {step > s ? (
                                    <span className="material-symbols-outlined text-lg">check</span>
                                ) : (
                                    s
                                )}
                            </div>
                            {s < 3 && (
                                <div className={`w-16 h-px transition-all duration-500 ${step > s ? 'bg-primary' : 'bg-white/10'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Card */}
                <div className="obsidian-card rounded-3xl overflow-hidden">
                    <div className="p-10 md:p-14">
                        {/* Step 1: Company */}
                        {step === 1 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div>
                                    <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-2">Passo 1 de 3</p>
                                    <h2 className="text-white text-2xl font-heading font-light tracking-tight">Sua Organização</h2>
                                    <p className="text-white/40 text-sm mt-2">Como se chama a sua empresa ou projeto?</p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">
                                        Nome da Empresa
                                    </label>
                                    <input
                                        type="text"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        className="w-full bg-transparent border-0 border-b border-white/10 text-white py-3 focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-lg"
                                        placeholder="Ex: Minha Empresa"
                                        required
                                    />
                                </div>

                                <button
                                    onClick={() => companyName.trim() && setStep(2)}
                                    disabled={!companyName.trim()}
                                    className="backstagefy-btn-primary w-full py-4 rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <span className="text-[10px] tracking-[0.3em] uppercase">Continuar</span>
                                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                </button>
                            </div>
                        )}

                        {/* Step 2: Agent Name */}
                        {step === 2 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div>
                                    <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-2">Passo 2 de 3</p>
                                    <h2 className="text-white text-2xl font-heading font-light tracking-tight">Seu Agente de IA</h2>
                                    <p className="text-white/40 text-sm mt-2">Dê um nome ao seu assistente virtual.</p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">
                                        Nome do Agente
                                    </label>
                                    <input
                                        type="text"
                                        value={agentName}
                                        onChange={(e) => setAgentName(e.target.value)}
                                        className="w-full bg-transparent border-0 border-b border-white/10 text-white py-3 focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-lg"
                                        placeholder="Ex: Luna, Max, Atena..."
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep(1)}
                                        className="flex-1 py-4 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all text-[10px] tracking-[0.2em] uppercase"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={() => agentName.trim() && setStep(3)}
                                        disabled={!agentName.trim()}
                                        className="flex-1 backstagefy-btn-primary py-4 rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-[10px] tracking-[0.3em] uppercase">Continuar</span>
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Agent Prompt */}
                        {step === 3 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div>
                                    <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-2">Passo 3 de 3</p>
                                    <h2 className="text-white text-2xl font-heading font-light tracking-tight">Instruções do Agente</h2>
                                    <p className="text-white/40 text-sm mt-2">
                                        Defina a personalidade e o comportamento base do seu agente. Você poderá refinar depois.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest pl-1 font-bold">
                                        Prompt Base
                                    </label>
                                    <textarea
                                        value={agentPrompt}
                                        onChange={(e) => setAgentPrompt(e.target.value)}
                                        rows={5}
                                        className="w-full bg-white/[0.03] border border-white/10 text-white py-4 px-4 rounded-2xl focus:ring-0 focus:border-primary transition-all duration-500 placeholder-white/20 font-light text-sm resize-none"
                                        placeholder="Descreva como o agente deve se comportar..."
                                    />
                                </div>

                                {error && (
                                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest text-center">
                                        {error}
                                    </div>
                                )}

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep(2)}
                                        className="flex-1 py-4 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all text-[10px] tracking-[0.2em] uppercase"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleFinish}
                                        disabled={loading || !agentPrompt.trim()}
                                        className="flex-1 backstagefy-btn-primary py-4 rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-[10px] tracking-[0.3em] uppercase">
                                            {loading ? 'Criando...' : 'Finalizar Setup'}
                                        </span>
                                        <span className="material-symbols-outlined text-lg">rocket_launch</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
