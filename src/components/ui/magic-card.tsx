"use client"

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { motion, useMotionTemplate, useMotionValue } from "motion/react"

import { cn } from "../../lib/utils"

interface MagicCardProps {
  children?: ReactNode
  className?: string
  gradientSize?: number
  gradientColor?: string
  gradientOpacity?: number
  gradientFrom?: string
  gradientTo?: string
}

export function MagicCard({
  children,
  className,
  gradientSize = 220,
  gradientColor = "var(--bg-elevated, #4e1d2c)",
  gradientOpacity = 0.6,
  gradientFrom = "var(--accent-bright, #C29A4F)",
  gradientTo = "var(--accent, #8c6b32)",
}: MagicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(-gradientSize)
  const mouseY = useMotionValue(-gradientSize)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (cardRef.current) {
        const { left, top } = cardRef.current.getBoundingClientRect()
        mouseX.set(e.clientX - left)
        mouseY.set(e.clientY - top)
      }
    },
    [mouseX, mouseY]
  )

  const handleMouseLeave = useCallback(() => {
    mouseX.set(-gradientSize)
    mouseY.set(-gradientSize)
  }, [mouseX, gradientSize, mouseY])

  useEffect(() => {
    const node = cardRef.current
    if (!node) return
    mouseX.set(-gradientSize)
    mouseY.set(-gradientSize)
    node.addEventListener("mousemove", handleMouseMove)
    node.addEventListener("mouseleave", handleMouseLeave)
    return () => {
      node.removeEventListener("mousemove", handleMouseMove)
      node.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [gradientSize, handleMouseLeave, handleMouseMove, mouseX, mouseY])

  return (
    <div ref={cardRef} className={cn("relative", className)}>
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom}, ${gradientTo}, transparent 100%)
          `,
          opacity: gradientOpacity,
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)
          `,
        }}
      />
      <div className="relative h-full w-full">{children}</div>
    </div>
  )
}
