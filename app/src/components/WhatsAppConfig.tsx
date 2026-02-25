import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

export default function WhatsAppConfig() {
    const [profile, setProfile] = useState<{ name?: string, number?: string, avatar?: string } | null>(null)
    const [status, setStatus] = useState('disconnected')
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [qrExpired, setQrExpired] = useState(false)
    const [qrCountdown, setQrCountdown] = useState(0)
    const qrTimestampRef = useRef<number | null>(null)
    const QR_EXPIRY_SECONDS = 30

    // Settings State
    const [handoverNumber, setHandoverNumber] = useState('')
    const [whitelistEnabled, setWhitelistEnabled] = useState(false)
    const [whitelistNumbers, setWhitelistNumbers] = useState('')
    const [blacklistNumbers, setBlacklistNumbers] = useState('')
    const [savingSettings, setSavingSettings] = useState(false)
    const [lastError, setLastError] = useState<string | null>(null)

    const [behaviors, setBehaviors] = useState({
        rejectCalls: false,
        ignoreGroups: false,
        viewStatus: false,
        autoRead: false,
        alwaysOnline: false,
        historySync: false
    });


    const fetchSettings = async () => {
        if (!supabase) return
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager?action=get-settings')
            if (!error && data) {
                setWhitelistEnabled(data.whitelistEnabled || false)
                setWhitelistNumbers((data.whitelistNumbers || []).join(', '))
                setBlacklistNumbers((data.blacklistNumbers || []).join(', '))
                setHandoverNumber(data.handoverNumber || '')
                setBehaviors({
                    rejectCalls: data.rejectCalls || false,
                    ignoreGroups: data.ignoreGroups || false,
                    viewStatus: data.viewStatus || false,
                    autoRead: data.autoRead || false,
                    alwaysOnline: data.alwaysOnline || false,
                    historySync: data.historySync || false
                })
            }
        } catch (err) {
            console.error('Fetch Settings Error:', err)
        }
    }

    const checkStatus = async () => {
        if (!supabase) return
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager?action=status')
            if (!error && data) {
                setStatus(data.status || 'disconnected')
                if (data.qrcode) setQrCode(data.qrcode)
                if (data.profile) setProfile(data.profile)
                setLastError(null) // Clear error on success
            }
        } catch (err: any) {
            console.error('Status Check Error:', err)
            // Only set critical errors if disconnected
            if (status === 'disconnected') {
                setLastError(err.message || 'Erro ao conectar com API')
            }
        }
    }

    const handleDebug = async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager?action=debug');
            if (error) throw error;
            alert(`Diagnóstico:\n${JSON.stringify(data, null, 2)}`);
        } catch (err: any) {
            alert(`Erro no Diagnóstico: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    // QR Code expiry countdown
    useEffect(() => {
        if (!qrCode || status === 'connected') {
            setQrExpired(false)
            setQrCountdown(0)
            qrTimestampRef.current = null
            return
        }

        if (!qrTimestampRef.current) {
            qrTimestampRef.current = Date.now()
        }

        const timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - (qrTimestampRef.current || Date.now())) / 1000)
            const remaining = Math.max(0, QR_EXPIRY_SECONDS - elapsed)
            setQrCountdown(remaining)
            if (remaining <= 0) {
                setQrExpired(true)
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [qrCode, status])

    useEffect(() => {
        checkStatus()
        fetchSettings()
        const interval = setInterval(checkStatus, 15000)
        return () => clearInterval(interval)
    }, [])

    const handleReconnect = useCallback(async () => {
        if (!supabase) return
        setLoading(true)
        setQrCode(null)
        setProfile(null)
        setQrExpired(false)
        qrTimestampRef.current = null
        setLastError(null)
        console.log('🔄 [UAZAPI] Reconnect: limpando instância anterior e gerando nova...')

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager?action=reconnect')

            if (error) {
                let errorMsg = error.message
                if (error.context instanceof Response) {
                    try {
                        const text = await error.context.text()
                        const parsed = JSON.parse(text)
                        if (parsed?.error) errorMsg = parsed.error
                    } catch (_e) { /* ignore */ }
                }
                throw new Error(errorMsg)
            }

            if (data?.error) throw new Error(data.error)
            if (data?.status) setStatus(data.status)
            if (data?.qrcode) {
                setQrCode(data.qrcode)
                qrTimestampRef.current = Date.now()
                setQrExpired(false)
            }
            if (data?.profile) setProfile(data.profile)

            // Poll for QR if not immediately available
            if (!data?.qrcode && data?.status !== 'connected') {
                let attempts = 0
                const maxAttempts = 8
                const poll = async () => {
                    if (!supabase) return
                    attempts++
                    try {
                        const { data: statusData } = await supabase.functions.invoke('whatsapp-manager?action=status')
                        if (statusData?.qrcode) {
                            setQrCode(statusData.qrcode)
                            setStatus(statusData.status)
                            qrTimestampRef.current = Date.now()
                            setQrExpired(false)
                            return
                        }
                        if (statusData?.status === 'connected') {
                            setStatus('connected')
                            setProfile(statusData.profile)
                            return
                        }
                    } catch (_e) { /* ignore poll errors */ }
                    if (attempts < maxAttempts) setTimeout(poll, 3000)
                }
                setTimeout(poll, 2000)
            }
        } catch (err: any) {
            console.error('❌ [UAZAPI] Reconnect error:', err)
            setLastError(err.message)
        } finally {
            setLoading(false)
        }
    }, [status])

    const handleSaveSettings = async () => {
        if (!supabase) return
        setSavingSettings(true)
        try {
            // Remove espaços, hifens, parênteses e outros caracteres não numéricos
            const numbersArray = whitelistNumbers.split(',')
                .map(n => n.trim().replace(/\D/g, ''))
                .filter(n => n.length > 0)

            const blacklistArray = blacklistNumbers.split(',')
                .map(n => n.trim().replace(/\D/g, ''))
                .filter(n => n.length > 0)

            const sanitizedHandover = handoverNumber.replace(/\D/g, '')

            const { error } = await supabase.functions.invoke('whatsapp-manager?action=save-settings', {
                body: {
                    whitelistEnabled,
                    whitelistNumbers: numbersArray,
                    blacklistNumbers: blacklistArray,
                    handoverNumber: sanitizedHandover,
                    ...behaviors
                }
            })
            if (error) throw error

            // Atualiza o estado visual para refletir os números limpos após o salvamento
            setWhitelistNumbers(numbersArray.join(', '))
            setBlacklistNumbers(blacklistArray.join(', '))
            setHandoverNumber(sanitizedHandover)

            alert('Configurações salvas com sucesso!')
        } catch (err: any) {
            console.error('Save Settings Error:', err)
            alert('Erro ao salvar: ' + err.message)
        } finally {
            setSavingSettings(false)
        }
    }

    const handleGenerateQR = async () => {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return
        }
        setLoading(true)
        setQrCode(null)
        setProfile(null)
        console.log('🚀 [UAZAPI] Iniciando conexão para gerar QR Code...');

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager?action=connect')

            if (error) {
                console.error('❌ [UAZAPI] Erro no Invoke da Edge Function:', error);
                let errorMsg = error.message;

                // Try to extract body from context (Response object)
                if (error.context instanceof Response) {
                    try {
                        const text = await error.context.text();
                        console.log('📡 [UAZAPI] Resposta bruta da Edge Function:', text);
                        try {
                            const parsed = JSON.parse(text);
                            if (parsed?.error) errorMsg = parsed.error;
                            else if (parsed?.message) errorMsg = parsed.message;
                        } catch {
                            if (text && text.length < 200) errorMsg = text;
                        }
                    } catch (e) {
                        console.warn('⚠️ [UAZAPI] Falha ao ler corpo da resposta de erro:', e);
                    }
                }
                throw new Error(errorMsg);
            }

            console.log('✅ [UAZAPI] Resposta da Edge Function recebida:', data);

            if (data?.error) {
                console.error('❌ [UAZAPI] Erro retornado pela API:', data.error);
                throw new Error(data.error);
            }

            if (data?.status) setStatus(data.status)
            if (data?.qrcode) {
                console.log('✨ [UAZAPI] QR Code detectado na resposta inicial');
                setQrCode(data.qrcode)
            }
            if (data?.profile) setProfile(data.profile)

            if (!data?.qrcode && data?.status !== 'connected') {
                console.log('⏳ [UAZAPI] QR Code ainda não está pronto, iniciando polling...');
                let attempts = 0;
                const maxAttempts = 8;

                const poll = async () => {
                    if (!supabase) return;
                    attempts++;
                    console.log(`🔍 [UAZAPI] Tentativa de polling ${attempts}/${maxAttempts}...`);

                    try {
                        const { data: statusData, error: pollError } = await supabase.functions.invoke('whatsapp-manager?action=status');

                        if (pollError) {
                            console.warn('⚠️ [UAZAPI] Erro no polling de status:', pollError);
                        } else {
                            console.log('📡 [UAZAPI] Status recebido via polling:', statusData?.status);

                            if (statusData?.qrcode) {
                                console.log('✨ [UAZAPI] QR Code recuperado via polling!');
                                setQrCode(statusData.qrcode);
                                setStatus(statusData.status);
                                return true;
                            }
                            if (statusData?.status === 'connected') {
                                console.log('🔗 [UAZAPI] Dispositivo conectado durante o polling!');
                                setStatus('connected');
                                setProfile(statusData.profile);
                                return true;
                            }
                        }
                    } catch (pollExc) {
                        console.error('🔥 [UAZAPI] Exceção durante o polling:', pollExc);
                    }

                    if (attempts < maxAttempts) {
                        setTimeout(poll, 3000);
                    } else {
                        console.warn('⚠️ [UAZAPI] Polling de QR Code atingiu o limite de tentativas.');
                    }
                }
                setTimeout(poll, 2000);
            }

        } catch (err: any) {
            console.error('❌ [UAZAPI] Erro crítico na inicialização:', err)
            alert('Erro ao iniciar conexão: ' + err.message)
        } finally {
            setLoading(false)
        }
    }


    const botBehaviors = [
        { id: 'reject-calls', label: 'Rejeitar Chamadas', icon: 'call_end', desc: 'Recusa chamadas de voz/vídeo automaticamente' },
        { id: 'ignore-groups', label: 'Ignorar Grupos', icon: 'group_off', desc: 'Responde apenas chats privados' },
        { id: 'view-status', label: 'Visualizar Status', icon: 'visibility', desc: 'Marca status vistos automaticamente' },
        { id: 'auto-read', label: 'Lidas Automaticamente', icon: 'check_circle', desc: 'Marca mensagens como lidas' },
        { id: 'always-online', label: 'Sempre Online', icon: 'bolt', desc: 'Mantém status online permanentemente' },
        { id: 'history-sync', label: 'Histórico na Conexão', icon: 'history', desc: 'Baixa mensagens recentes ao conectar' },
    ]

    const handleDisconnect = async () => {
        if (!confirm('Tem certeza? Isso irá desconectar o WhatsApp e remover a instância.')) return;
        setLoading(true);
        try {
            const { error } = await supabase!.functions.invoke('whatsapp-manager?action=delete-instance');
            if (error) throw error;
            setStatus('disconnected');
            setQrCode(null);
            setProfile(null);
            alert('Instância removida com sucesso!');
        } catch (err: any) {
            console.error('Disconnect Error:', err);
            alert('Erro ao desconectar: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-7xl mx-auto space-y-16 pb-24 animate-in fade-in slide-in-from-bottom-5 duration-700">

            {/* Canais Disponíveis */}
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <div className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-xl">hub</span>
                    </div>
                    <div>
                        <h2 className="text-white text-2xl font-heading font-light tracking-tight">Canais de Comunicação</h2>
                        <p className="text-white/30 text-xs mt-0.5">Gerencie os canais de atendimento do seu agente</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {/* WhatsApp - Active */}
                    <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 relative overflow-hidden group cursor-default">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-[30px] -mr-12 -mt-12 pointer-events-none" />
                        <div className="flex items-center gap-3 mb-3 relative z-10">
                            <div className="size-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-xl">chat</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-sm font-semibold">WhatsApp</p>
                                <p className="text-primary text-[9px] font-bold uppercase tracking-widest">Ativo</p>
                            </div>
                            <div className="size-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                        </div>
                        <p className="text-white/40 text-[10px] leading-relaxed relative z-10">
                            Canal principal de atendimento via API integrada.
                        </p>
                    </div>

                    {/* Instagram - Coming Soon */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden opacity-60 cursor-default">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                                <span className="material-symbols-outlined text-white/30 text-xl">photo_camera</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white/60 text-sm font-semibold">Instagram Direct</p>
                            </div>
                            <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-primary/50 shadow-[0_0_8px_rgba(34,197,94,0.3)] animate-pulse">
                                Em Breve
                            </span>
                        </div>
                        <p className="text-white/30 text-[10px] leading-relaxed">
                            Responda DMs automaticamente via Meta API.
                        </p>
                    </div>

                    {/* Telegram - Coming Soon */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden opacity-60 cursor-default">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                                <span className="material-symbols-outlined text-white/30 text-xl">send</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white/60 text-sm font-semibold">Telegram</p>
                            </div>
                            <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-primary/50 shadow-[0_0_8px_rgba(34,197,94,0.3)] animate-pulse">
                                Em Breve
                            </span>
                        </div>
                        <p className="text-white/30 text-[10px] leading-relaxed">
                            Integração via Bot API do Telegram.
                        </p>
                    </div>

                    {/* Webchat - Coming Soon */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden opacity-60 cursor-default">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                                <span className="material-symbols-outlined text-white/30 text-xl">language</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white/60 text-sm font-semibold">Webchat</p>
                            </div>
                            <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-primary/50 shadow-[0_0_8px_rgba(34,197,94,0.3)] animate-pulse">
                                Em Breve
                            </span>
                        </div>
                        <p className="text-white/30 text-[10px] leading-relaxed">
                            Widget de chat para o seu site ou landing page.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Whitelist (Célula de Teste) */}
                <div className="backstagefy-glass-card p-10 bg-black/40 border-white/[0.03]">
                    <div className="flex items-center gap-4 mb-6">
                        <div className={`p-3 rounded-xl ${whitelistEnabled ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-gray-500'}`}>
                            <span className="material-symbols-outlined">shield_lock</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-heading font-light text-white">Célula de Teste (Whitelist)</h3>
                            <p className="text-gray-500 text-xs text-balance">Ative para testar com números específicos antes do lançamento geral.</p>
                        </div>
                        <button
                            onClick={() => setWhitelistEnabled(!whitelistEnabled)}
                            className={`ml-auto relative w-12 h-6 rounded-full transition-colors ${whitelistEnabled ? 'bg-amber-500/20' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform ${whitelistEnabled ? 'translate-x-6 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-gray-500'}`}></div>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Números de Teste</label>
                            {!whitelistEnabled && <span className="text-[10px] text-primary/60 font-bold uppercase">Modo Público Ativo</span>}
                        </div>
                        <textarea
                            value={whitelistNumbers}
                            onChange={(e) => setWhitelistNumbers(e.target.value)}
                            placeholder="Ex: 5511999999999, 5519981316733"
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:border-amber-500/50 outline-none h-32 resize-none font-mono"
                        />
                        {whitelistEnabled && whitelistNumbers.trim() === '' && (
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <span className="material-symbols-outlined text-amber-500 text-sm">warning</span>
                                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wide">
                                    Whitelist ativa mas vazia — A IA não responderá ninguém
                                </p>
                            </div>
                        )}
                        <p className="text-[10px] text-gray-600 leading-relaxed italic">
                            * Se a lista estiver vazia ou desativada, a IA responderá a todas as conversas privadas automaticamente.
                        </p>
                    </div>
                </div>

                {/* Human Handover */}
                <div className="backstagefy-glass-card p-10 bg-black/40 border-white/[0.03]">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
                            <span className="material-symbols-outlined">support_agent</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-heading font-light text-white">Atendimento Humano</h3>
                            <p className="text-gray-500 text-xs">Onde as notificações e transferências serão entregues.</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">WhatsApp do Especialista</label>
                            <input
                                type="text"
                                value={handoverNumber}
                                onChange={(e) => setHandoverNumber(e.target.value)}
                                placeholder="DDI + DDD + Número (Ex: 5519981316733)"
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:border-purple-500/50 outline-none font-mono"
                            />
                        </div>

                        <button
                            onClick={handleSaveSettings}
                            disabled={savingSettings}
                            className={`w-full py-4 rounded-xl border transition-all flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.2em] ${savingSettings ? 'bg-white/5 text-gray-500 border-white/5' : 'bg-primary/20 text-primary border-primary/20 hover:bg-primary/30 hover:border-primary/40'}`}
                        >
                            {savingSettings ? (
                                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                            ) : (
                                <span className="material-symbols-outlined text-sm">save</span>
                            )}
                            {savingSettings ? 'Gravando...' : 'Gravar Parâmetros'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Blacklist */}
            <div className="backstagefy-glass-card p-10 bg-black/40 border-white/[0.03]">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
                        <span className="material-symbols-outlined">block</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-heading font-light text-white">Lista Negra (Blacklist)</h3>
                        <p className="text-gray-500 text-xs">Números que a IA nunca vai responder, independente de qualquer configuração.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Números Bloqueados</label>
                    <textarea
                        value={blacklistNumbers}
                        onChange={(e) => setBlacklistNumbers(e.target.value)}
                        placeholder="Ex: 5511999999999, 5519981316733"
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:border-red-500/50 outline-none h-32 resize-none font-mono"
                    />
                    <p className="text-[10px] text-gray-600 leading-relaxed italic">
                        * Mensagens de números nesta lista serão silenciosamente ignoradas pela IA. Apenas um operador humano poderá enviar mensagens manualmente.
                    </p>
                </div>
            </div>

            {/* Connection & QR Section */}
            <div className="flex flex-col xl:flex-row gap-10">
                <div className="flex-[5]">
                    <div className="backstagefy-glass-card p-12 bg-black/40 border-white/[0.03]">
                        {lastError && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs font-mono">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {lastError}
                            </div>
                        )}
                        <div className="flex flex-col lg:flex-row items-center gap-14">
                            {/* QR Zone */}
                            <div className="relative group">
                                <div className="absolute -inset-4 bg-primary/10 rounded-[40px] blur-2xl group-hover:bg-primary/20 transition-all duration-700"></div>
                                <div className="relative size-64 bg-white/[0.02] border-2 border-dashed border-white/10 rounded-[35px] flex items-center justify-center overflow-hidden">
                                    {status === 'connected' && profile?.avatar ? (
                                        <img src={profile.avatar} alt="Avatar" className="size-full object-cover animate-in fade-in zoom-in-95 duration-700" />
                                    ) : qrCode ? (
                                        <img src={qrCode} alt="WhatsApp QR Code" className={`size-full object-contain p-4 animate-in fade-in zoom-in-95 duration-500 ${qrExpired ? 'opacity-20 blur-sm' : ''}`} />
                                    ) : (
                                        <span className="material-symbols-outlined text-white/5 text-8xl">qr_code_2</span>
                                    )}

                                    {/* QR Expired Overlay */}
                                    {qrCode && qrExpired && (
                                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center gap-3">
                                            <span className="material-symbols-outlined text-red-500 text-3xl">timer_off</span>
                                            <p className="text-red-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                                                QR Code Expirado
                                            </p>
                                            <button
                                                onClick={handleReconnect}
                                                disabled={loading}
                                                className="mt-1 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-primary/30 transition-all flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                                                    {loading ? 'progress_activity' : 'refresh'}
                                                </span>
                                                {loading ? 'Reconectando...' : 'Gerar Novo QR'}
                                            </button>
                                        </div>
                                    )}

                                    {(status === 'disconnected' && !qrCode) && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-8 text-center">
                                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.3em] leading-relaxed">
                                                {loading ? 'Gerando...' : 'Nenhuma sessão ativa detectada'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Details Zone */}
                            <div className="flex-1 space-y-8 text-center lg:text-left">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center lg:justify-start gap-3">
                                        <div className={`flex items-center gap-2 ${status === 'connected' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} border px-3 py-1 rounded-full`}>
                                            <div className={`size-1.5 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                                            <span className={`${status === 'connected' ? 'text-green-500' : 'text-red-500'} text-[9px] font-bold uppercase tracking-widest`}>
                                                {status === 'connected' ? 'Conectado' : 'Desconectado'}
                                            </span>
                                        </div>

                                        {/* QR Countdown Timer */}
                                        {qrCode && !qrExpired && qrCountdown > 0 && status !== 'connected' && (
                                            <div className={`flex items-center gap-1.5 border px-3 py-1 rounded-full ${qrCountdown <= 10 ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/10 border-primary/20'}`}>
                                                <span className={`material-symbols-outlined text-xs ${qrCountdown <= 10 ? 'text-red-400' : 'text-primary'}`}>timer</span>
                                                <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${qrCountdown <= 10 ? 'text-red-400' : 'text-primary'}`}>
                                                    {qrCountdown}s
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {status === 'connected' && profile ? (
                                        <div className="animate-in slide-in-from-left-5 duration-500">
                                            <h2 className="text-white text-3xl font-heading font-light tracking-tight mb-2">
                                                {profile.name || 'WhatsApp Business'}
                                            </h2>
                                            <p className="text-primary text-sm font-mono tracking-widest bg-primary/10 inline-block px-3 py-1 rounded-lg border border-primary/20">
                                                {profile.number}
                                            </p>
                                        </div>
                                    ) : (
                                        <h2 className="text-white text-4xl font-heading font-light tracking-tight">Vincule sua Inteligência</h2>
                                    )}

                                    <p className="text-gray-500 text-sm max-w-lg leading-relaxed">
                                        {status === 'connected'
                                            ? 'Seu WhatsApp está vinculado com sucesso. A IA está monitorando conversas ativamente.'
                                            : 'Escaneie o QR Code para sincronizar o assistente BackStageFy Concierge. A IA terá acesso em tempo real para responder Inquiries de luxo.'
                                        }
                                    </p>
                                </div>
                                <div className="space-y-6">
                                    <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                                        {status === 'connected' ? (
                                            <button
                                                onClick={handleDisconnect}
                                                disabled={loading}
                                                className="px-10 py-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-3 disabled:opacity-50"
                                            >
                                                <span className="material-symbols-outlined">delete_forever</span>
                                                {loading ? 'Removendo...' : 'Excluir Instância'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={qrCode || qrExpired ? handleReconnect : handleGenerateQR}
                                                disabled={loading}
                                                className="backstagefy-btn-primary px-10 py-5 rounded-2xl group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span className={`material-symbols-outlined font-bold ${loading ? 'animate-spin' : 'group-hover:rotate-12'} transition-transform`}>
                                                    {loading ? 'progress_activity' : (qrCode || qrExpired ? 'refresh' : 'qr_code_scanner')}
                                                </span>
                                                {loading ? 'Processando...' : (qrCode || qrExpired ? '🔄 Gerar Novo QR Code' : 'Gerar Novo QR Code')}
                                            </button>
                                        )}
                                        <button
                                            onClick={handleDebug}
                                            disabled={loading}
                                            className="px-6 py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-all text-xs font-mono"
                                            title="Diagnóstico de Conexão"
                                        >
                                            <span className="material-symbols-outlined">bug_report</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Neural Behavior */}
            <div className="space-y-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-xl">psychology</span>
                        </div>
                        <h2 className="text-white text-2xl font-heading font-light tracking-tight">Comportamento Neural</h2>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-white/5 border border-white/5 px-3 py-1 rounded-full">V5.0 Edge</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {botBehaviors.map((item) => (
                        <div key={item.id} className="backstagefy-glass-card p-8 group border-white/[0.02] hover:border-primary/20">
                            <div className="flex items-center justify-between mb-6">
                                <div className="size-12 rounded-2xl bg-white/[0.03] flex items-center justify-center text-gray-500 group-hover:text-primary group-hover:bg-primary/5 transition-all duration-500">
                                    <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={(behaviors as any)[item.id.replace(/-([a-z])/g, (g) => g[1].toUpperCase())]}
                                        onChange={(e) => {
                                            const camelId = item.id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                                            setBehaviors(prev => ({ ...prev, [camelId]: e.target.checked }));
                                        }}
                                    />
                                    <div className="w-12 h-6.5 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[5px] after:bg-gray-600 after:border-transparent after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black peer-checked:after:scale-110 peer-checked:border-primary/30"></div>
                                </label>
                            </div>
                            <h4 className="text-white font-bold text-sm mb-2">{item.label}</h4>
                            <p className="text-gray-500 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
