import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './theme/neon-glass.css'

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { error: null }
    }
    static getDerivedStateFromError(error: Error) {
        return { error }
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'monospace' }}>
                    <div style={{ color: '#22c55e', fontSize: '1.5rem', marginBottom: '1rem' }}>⚠ Erro ao carregar</div>
                    <pre style={{ color: '#f87171', background: '#0a0a0a', padding: '1rem', borderRadius: '8px', maxWidth: '90vw', overflow: 'auto', fontSize: '0.8rem' }}>
                        {this.state.error.message}{'\n\n'}{this.state.error.stack}
                    </pre>
                </div>
            )
        }
        return this.props.children
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
