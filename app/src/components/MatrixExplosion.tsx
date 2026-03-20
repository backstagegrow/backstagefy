import { useEffect, useRef, useState } from 'react'

interface MatrixExplosionProps {
    trigger: boolean
}

interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    char: string
    alpha: number
    size: number
    decay: number
    color: string
}

export default function MatrixExplosion({ trigger }: MatrixExplosionProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const particlesRef = useRef<Particle[]>([])
    const hasTriggeredRef = useRef(false)
    const animFrameRef = useRef<number>(0)
    const [show, setShow] = useState(false)

    useEffect(() => {
        if (trigger && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true
            setShow(true)

            const canvas = canvasRef.current
            if (!canvas) return

            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = canvas.offsetWidth
            canvas.height = canvas.offsetHeight

            const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF<>{}[]|'
            const charArray = chars.split('')

            // Create particles that "fall in" from top and then explode outward
            const particles: Particle[] = []
            const centerX = canvas.width / 2
            const centerY = 80 // near top

            // Generate ~120 particles streaming in from top then exploding
            for (let i = 0; i < 120; i++) {
                const angle = (Math.random() * Math.PI * 2)
                const speed = 1.5 + Math.random() * 4
                const brightness = Math.random()
                
                particles.push({
                    x: centerX + (Math.random() - 0.5) * canvas.width * 0.6,
                    y: centerY + (Math.random() - 0.5) * 40,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed + 1.5, // bias downward
                    char: charArray[Math.floor(Math.random() * charArray.length)],
                    alpha: 0.7 + Math.random() * 0.3,
                    size: 10 + Math.random() * 14,
                    decay: 0.005 + Math.random() * 0.008,
                    color: brightness > 0.9 ? '#ffffff' : brightness > 0.5 ? '#00e676' : '#00c853'
                })
            }

            particlesRef.current = particles

            const animate = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height)

                let alive = false
                for (const p of particlesRef.current) {
                    if (p.alpha <= 0) continue
                    alive = true

                    p.x += p.vx
                    p.y += p.vy
                    p.vy += 0.03 // slight gravity
                    p.vx *= 0.995 // friction
                    p.alpha -= p.decay

                    // Change character occasionally for "digital" feel
                    if (Math.random() > 0.92) {
                        p.char = charArray[Math.floor(Math.random() * charArray.length)]
                    }

                    ctx.save()
                    ctx.globalAlpha = Math.max(0, p.alpha)
                    ctx.fillStyle = p.color
                    ctx.font = `${p.size}px monospace`
                    ctx.textAlign = 'center'
                    ctx.fillText(p.char, p.x, p.y)

                    // Glow effect
                    ctx.shadowColor = '#00e676'
                    ctx.shadowBlur = 8
                    ctx.globalAlpha = Math.max(0, p.alpha * 0.3)
                    ctx.fillText(p.char, p.x, p.y)
                    ctx.restore()
                }

                if (alive) {
                    animFrameRef.current = requestAnimationFrame(animate)
                } else {
                    setShow(false)
                }
            }

            animFrameRef.current = requestAnimationFrame(animate)
        }

        // Reset when section goes out of view so it can trigger again on re-scroll
        if (!trigger) {
            hasTriggeredRef.current = false
        }

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        }
    }, [trigger])

    if (!show && !trigger) return null

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, opacity: 0.8 }}
        />
    )
}
