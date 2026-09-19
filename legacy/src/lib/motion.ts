/**
 * Shared animation presets for MotelTrack.
 *
 * All presets animate ONLY hardware-accelerated properties (transform, opacity)
 * to guarantee GPU-composited rendering at 120fps via the Web Animations API.
 *
 * Usage:
 *   import { dialogContentAnimation } from '@/lib/motion'
 *   <motion.div {...dialogContentAnimation} />
 */

// --- Overlay (backdrop) ---
export const overlayAnimation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
}

// --- Dialog / Modal content ---
export const dialogContentAnimation = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
  transition: { type: 'spring' as const, damping: 25, stiffness: 400 },
}

// --- Page-level transition (fade + slide) ---
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

// --- Card interactive hover ---
export const cardHover = {
  whileHover: {
    scale: 1.01,
    transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
  },
  whileTap: { scale: 0.99 },
}

// --- Accessibility: reduced motion preference ---
// Re-export for centralized access. Feature components should check this
// before applying heavy spatial animations (scale, translate, etc.).
export { useReducedMotion } from 'motion/react'
