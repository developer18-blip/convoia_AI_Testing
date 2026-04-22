import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

/**
 * Premium empty state for the chat surface. Shown when a conversation
 * has zero messages — matches the Claude.ai / ChatGPT / Gemini pattern:
 * branded sparkle mark, time-aware personalized greeting, four category
 * suggestion cards with distinct accent colors, ambient background
 * glows for depth.
 *
 * Kept purely presentational — all styling lives in welcome-screen.css
 * so the theme variables (class-based `.dark` / `.light` on <html>) can
 * drive light/dark without prop threading.
 */

interface WelcomeScreenProps {
  /** Called with the suggestion text when a card is clicked. The
   *  ChatPage pre-fills the composer rather than auto-sending, so users
   *  can edit before submitting. */
  onSuggestionClick: (prompt: string) => void
}

interface Suggestion {
  id: string
  accent: 'write' | 'code' | 'research' | 'analyze'
  title: string
  description: string
  prompt: string
  icon: React.ReactNode
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: 'write',
    accent: 'write',
    title: 'Write',
    description: 'Draft an email, write a blog post, or craft a message',
    prompt: 'Help me write a professional email to request a project deadline extension',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: 'code',
    accent: 'code',
    title: 'Code',
    description: 'Debug, refactor, or build something from scratch',
    prompt: 'Write a Python script to analyze CSV data and generate summary statistics',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'research',
    accent: 'research',
    title: 'Research',
    description: 'Compare options, gather insights, or explore a topic',
    prompt: 'Compare the top 5 cloud providers for deploying a Node.js application',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    accent: 'analyze',
    title: 'Analyze',
    description: 'Break down data, explain concepts, or review files',
    prompt: 'Explain how transformer models work in natural language processing',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

function getGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 5) return `Still up, ${firstName}?`
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 17) return `Good afternoon, ${firstName}`
  if (hour < 22) return `Good evening, ${firstName}`
  return `Working late, ${firstName}?`
}

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const { user } = useAuth()
  const firstName = (user?.name?.split(' ')[0] || 'there').trim() || 'there'
  const [main, setMain] = useState(() => getGreeting(firstName))

  // Refresh the greeting if the user crosses an hour boundary mid-session.
  useEffect(() => {
    const interval = setInterval(() => setMain(getGreeting(firstName)), 60_000)
    return () => clearInterval(interval)
  }, [firstName])

  return (
    <div className="welcome-screen">
      {/* Ambient background glows — purely decorative, pointer-events:none */}
      <div className="welcome-ambient welcome-ambient--top" aria-hidden="true" />
      <div className="welcome-ambient welcome-ambient--bottom" aria-hidden="true" />

      <div className="welcome-hero">
        <div className="welcome-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L14 8L20 10L14 12L12 18L10 12L4 10L10 8Z" fill="white" stroke="none" />
            <circle cx="19" cy="5" r="1" fill="white" />
            <circle cx="5" cy="19" r="0.8" fill="white" fillOpacity="0.6" />
          </svg>
        </div>

        <div className="welcome-greeting">
          <div className="welcome-eyebrow">Chat with Intellect AI</div>
          <h1 className="welcome-title">{main}</h1>
          <p className="welcome-subtitle">What would you like to explore today?</p>
        </div>
      </div>

      <div className="welcome-cards">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            className={`welcome-card welcome-card--${s.accent}`}
            onClick={() => onSuggestionClick(s.prompt)}
            type="button"
          >
            <div className="welcome-card-head">
              <div className="welcome-card-icon">{s.icon}</div>
              <div className="welcome-card-title">{s.title}</div>
            </div>
            <div className="welcome-card-desc">{s.description}</div>
            <div className="welcome-card-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <div className="welcome-hint">
        <span>Drop a file anywhere</span>
        <span className="welcome-hint-dot">·</span>
        <span>or start typing below</span>
      </div>
    </div>
  )
}
