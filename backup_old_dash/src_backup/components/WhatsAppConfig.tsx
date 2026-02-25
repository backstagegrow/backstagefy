import { useState } from 'react'
import { motion } from 'framer-motion'

export default function WhatsAppConfig() {
    const [status, setStatus] = useState('disconnected') // disconnected, connecting, connected
    const [handoverNumber, setHandoverNumber] = useState('5514991117987')

    const botBehaviors = [
        { id: 'reject-calls', label: 'Rejeitar Chamadas', icon: 'call_end', desc: 'Recusa chamadas de voz/vídeo automaticamente' },
        { id: 'ignore-groups', label: 'Ignorar Grupos', icon: 'group_off', desc: 'Responde apenas chats privados' },
        { id: 'view-status', label: 'Visualizar Status', icon: 'visibility', desc: 'Marca status vistos automaticamente' },
        { id: 'auto-read', label: 'Lidas Automaticamente', icon: 'check_circle', desc: 'Marca mensagens como lidas' },
        { id: 'always-online', label: 'Sempre Online', icon: 'bolt', desc: 'Mantém status online permanentemente' },
        { id: 'history-sync', label: 'Histórico na Conexão', icon: 'history', desc: 'Baixa mensagens recentes ao conectar' },
    ]

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            {/* Connection Section */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 w-full">
                    <div className="sphaus-glass-card p-10 relative overflow-hidden group">
                        <div className="absolute -right-20 -top-20 size-64 bg-primary/10 blur-[100px] rounded-full group-hover:bg-primary/20 transition-all duration-1000"></div>

                        <div className="flex flex-col md:flex-row items-center gap-12">
                            {/* QR Code Area */}
                            <div className="relative">
                                <div className="size-56 rounded-3xl bg-white/5 border-2 border-dashed border-white/10 flex items-center justify-center relative overflow-hidden">
                                    <span className="material-symbols-outlined text-white/10 text-6xl">qr_code_2</span>
                                    {status === 'disconnected' && (
                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                                            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">Nenhuma sessão ativa</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Connection Details */}
                            <div className="flex-1 space-y-6 text-center md:text-left">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-center md:justify-start gap-3">
                                        <div className={`size-2.5 rounded-full animate-pulse ${status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        <span className="text-red-500 text-xs font-bold uppercase tracking-widest">Status: Desconectado</span>
                                    </div>
                                    <h2 className="text-white text-3xl font-heading tracking-tight">Conecte seu WhatsApp</h2>
                                    <p className="text-gray-500 text-sm max-w-md">Escaneie o QR Code ao lado para ativar seu assistente <span className="text-primary italic">spHAUS Concierge</span> em tempo real.</p>
                                </div>

                                <button className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-lg shadow-primary/20 active:scale-95">
                                    <span className="material-symbols-outlined font-bold">qr_code_scanner</span>
                                    Gerar Novo QR Code
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Handover Sidebar */}
                <div className="w-full md:w-80">
                    <div className="sphaus-glass-card p-8 border-primary/20 bg-primary/5">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary">support_agent</span>
                            </div>
                            <h3 className="text-white font-heading text-sm uppercase tracking-widest">Atendimento Humano</h3>
                        </div>
                        <p className="text-gray-400 text-[11px] leading-relaxed mb-6">
                            Defina o número que receberá os alertas de leads e agendamentos feitos pela spHAUS IA. Assim ela saberá para quem avisar quando um cliente solicitar falar com uma pessoa.
                        </p>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1">Número WhatsApp</label>
                                <input
                                    type="text"
                                    value={handoverNumber}
                                    onChange={(e) => setHandoverNumber(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary/50 transition-all font-mono"
                                />
                            </div>
                            <button className="w-full py-3.5 bg-primary text-black font-bold rounded-xl text-xs uppercase tracking-widest hover:brightness-110 transition-all">
                                Salvar Atendimento
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bot Behavior Grid */}
            <div className="space-y-8">
                <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-primary">settings_suggest</span>
                    <h2 className="text-white text-xl font-heading tracking-tight">Comportamento do Bot</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {botBehaviors.map((item) => (
                        <div key={item.id} className="sphaus-glass-card p-6 hover:border-primary/20 group transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors">
                                    <span className="material-symbols-outlined">{item.icon}</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" />
                                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-gray-500 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black peer-checked:after:border-transparent"></div>
                                </label>
                            </div>
                            <h4 className="text-white font-bold text-sm mb-1">{item.label}</h4>
                            <p className="text-gray-500 text-[11px] leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Access Control */}
            <div className="space-y-8">
                <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-primary">security</span>
                    <h2 className="text-white text-xl font-heading tracking-tight">Controle de Acesso</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Whitelist */}
                    <div className="sphaus-glass-card p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="material-symbols-outlined text-green-500">verified_user</span>
                            <h3 className="text-white font-bold text-sm uppercase tracking-widest">Modo de Teste (Whitelist)</h3>
                        </div>
                        <p className="text-gray-500 text-[11px] mb-6">IA responderá SOMENTE a estes números.</p>
                        <div className="flex gap-3 mb-6">
                            <input
                                type="text"
                                placeholder="Ex: 5511999998888"
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary/50 transition-all font-mono"
                            />
                            <button className="px-6 bg-primary text-black font-bold rounded-xl text-[10px] uppercase tracking-widest">Add</button>
                        </div>
                        <div className="h-20 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
                            <p className="text-gray-600 text-[10px] uppercase tracking-[0.2em] font-bold">Lista Vazia (IA Pública)</p>
                        </div>
                    </div>

                    {/* Blacklist */}
                    <div className="sphaus-glass-card p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="material-symbols-outlined text-red-500">block</span>
                            <h3 className="text-white font-bold text-sm uppercase tracking-widest">Lista Negra (Blacklist)</h3>
                        </div>
                        <p className="text-gray-500 text-[11px] mb-6">Bloqueia números específicos permanentemente.</p>
                        <div className="flex gap-3 mb-6">
                            <input
                                type="text"
                                placeholder="Ex: 5511999998888"
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500/50 transition-all font-mono"
                            />
                            <button className="px-6 bg-red-500 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest">Block</button>
                        </div>
                        <div className="h-20 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
                            <p className="text-gray-600 text-[10px] uppercase tracking-[0.2em] font-bold">Ninguém Bloqueado</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
