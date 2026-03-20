import { useEffect, useRef } from 'react'

interface MatrixRainProps {
    opacity?: number
    color?: string
    fontSize?: number
    speed?: number
}

export default function MatrixRain({ 
    opacity = 0.06, 
    color = '#00e676',
    fontSize = 14,
    speed = 33
}: MatrixRainProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Matrix characters (katakana + latin + numbers + symbols)
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]|/\\+=*&^%$#@!?'
        const charArray = chars.split('')

        let columns: number
        let drops: number[]

        const resize = () => {
            canvas.width = canvas.offsetWidth
            canvas.height = canvas.offsetHeight
            columns = Math.floor(canvas.width / fontSize)
            drops = new Array(columns).fill(0).map(() => Math.random() * -100)
        }

        resize()
        window.addEventListener('resize', resize)

        const draw = () => {
            // Semi-transparent black to create trail effect
            ctx.fillStyle = 'rgba(5, 5, 5, 0.05)'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            ctx.font = `${fontSize}px monospace`

            for (let i = 0; i < columns; i++) {
                // Random character
                const char = charArray[Math.floor(Math.random() * charArray.length)]
                const x = i * fontSize
                const y = drops[i] * fontSize

                // Brighter head character
                if (Math.random() > 0.98) {
                    ctx.fillStyle = '#ffffff'
                } else {
                    // Vary the green brightness
                    const brightness = Math.random() * 0.5 + 0.5
                    ctx.fillStyle = `rgba(0, 230, 118, ${brightness})`
                }

                ctx.fillText(char, x, y)

                // Reset drop when it goes past canvas or randomly
                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0
                }

                drops[i] += 0.5 + Math.random() * 0.5 // Slow, varied speed
            }
        }

        const intervalId = setInterval(draw, speed)

        return () => {
            clearInterval(intervalId)
            window.removeEventListener('resize', resize)
        }
    }, [color, fontSize, speed])

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity, zIndex: 0 }}
        />
    )
}
