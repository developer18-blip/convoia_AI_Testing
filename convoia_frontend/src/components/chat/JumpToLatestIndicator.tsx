import { ArrowDown } from 'lucide-react'

/**
 * JumpToLatestIndicator — floating pill that appears when the chat scroll
 * state machine flips to USER_DETACHED. Default label "Jump to latest";
 * shows "↓ N new" when new tokens have streamed in while detached.
 *
 * Visibility is driven by `visible`; when false the element stays in the
 * DOM but with opacity 0 + pointer-events: none so it never traps clicks
 * during the fade-out and the transition is smooth.
 */

interface Props {
  visible: boolean
  count: number
  onClick: () => void
}

export function JumpToLatestIndicator({ visible, count, onClick }: Props) {
  const label = count > 0
    ? `${count} new ${count === 1 ? 'message' : 'updates'}`
    : 'Jump to latest'

  return (
    <button
      type="button"
      className={'jump-to-latest' + (visible ? ' jump-to-latest--visible' : '')}
      aria-label={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
    >
      <ArrowDown size={14} />
      <span className="jump-to-latest__label">{label}</span>
    </button>
  )
}

export default JumpToLatestIndicator
