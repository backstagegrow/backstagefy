import React from 'react';
import { motion } from 'framer-motion';

interface Testimonial {
    text: string;
    name: string;
    role: string;
}

export const TestimonialsColumn = ({
    className = '',
    testimonials,
    duration = 10,
}: {
    className?: string;
    testimonials: Testimonial[];
    duration?: number;
}) => {
    return (
        <div className={`overflow-hidden ${className}`}>
            <motion.div
                animate={{ translateY: '-50%' }}
                transition={{
                    duration,
                    repeat: Infinity,
                    ease: 'linear',
                    repeatType: 'loop',
                }}
                className="flex flex-col gap-5 pb-5"
            >
                {[...Array(2)].map((_, idx) => (
                    <React.Fragment key={idx}>
                        {testimonials.map((t, i) => (
                            <div
                                key={i}
                                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 max-w-xs w-full hover:border-white/10 transition-colors"
                            >
                                {/* Stars */}
                                <div className="flex items-center gap-0.5 mb-3">
                                    {[...Array(5)].map((_, j) => (
                                        <span
                                            key={j}
                                            className="material-symbols-outlined text-primary text-sm"
                                            style={{ fontVariationSettings: "'FILL' 1" }}
                                        >
                                            star
                                        </span>
                                    ))}
                                </div>

                                {/* Quote */}
                                <p className="text-white/45 text-sm leading-relaxed mb-5 italic">
                                    "{t.text}"
                                </p>

                                {/* Author */}
                                <div>
                                    <p className="text-white text-sm font-medium">{t.name}</p>
                                    <p className="text-primary/50 text-xs">{t.role}</p>
                                </div>
                            </div>
                        ))}
                    </React.Fragment>
                ))}
            </motion.div>
        </div>
    );
};
