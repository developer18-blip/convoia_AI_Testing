interface SignalLineProps {
  className?: string
  council?: boolean
}

export function SignalLine({ className = '', council = false }: SignalLineProps) {
  return <div className={`signal-line ${council ? 'signal-line--council' : ''} ${className}`} />
}
