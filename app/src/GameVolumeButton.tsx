import { useEffect, useRef } from 'react'
import { bindGameVolumeButton } from './gameVolume'

/** The audio button opens a continuous slider; zero on the slider is mute. */
export function GameVolumeButton({ className = 'round-btn' }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current ? bindGameVolumeButton(ref.current) : undefined, [])
  return <button ref={ref} className={className} type="button" aria-label="Volume">🔊</button>
}
