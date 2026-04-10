import { useEffect, useRef } from 'react'
import { Mic } from 'lucide-react'
import { useVoiceConversation } from '../../hooks/useVoiceConversation'

interface Props {
  onTranscript: (text: string) => void
  onAutoSend?: (text: string) => void  // auto-submit voice transcript
  disabled?: boolean
  onSpeakResponse?: string
}

export function VoiceInputButton({ onTranscript, onAutoSend, disabled, onSpeakResponse }: Props) {
  const hasUsedVoiceRef = useRef(false)

  const {
    mode,
    isListening,
    isProcessing,
    isSpeaking,
    isSupported,
    startListening,
    stopListening,
    stopSpeaking,
    speakText,
  } = useVoiceConversation({
    onTranscript: (text) => {
      hasUsedVoiceRef.current = true
      console.log('[Voice] Transcript received:', text.substring(0, 50))
      if (onAutoSend) {
        // Auto-send: voice transcript goes directly to AI
        onAutoSend(text)
      } else {
        // Fallback: populate input field
        onTranscript(text)
      }
    },
    onError: (msg) => {
      console.error('Voice error:', msg)
    },
    voice: 'nova',
  })

  // Strip markdown formatting for cleaner TTS output
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/`[^`]*`/g, '')        // remove inline code
      .replace(/#{1,6}\s?/g, '')      // remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // bold → plain
      .replace(/\*([^*]+)\*/g, '$1')     // italic → plain
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/>\s?/g, '')           // remove blockquotes
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text only
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // remove images
      .replace(/[-*+]\s/g, '')        // remove list bullets
      .replace(/\d+\.\s/g, '')        // remove numbered list
      .replace(/\|[^\n]+\|/g, '')     // remove tables
      .replace(/---+/g, '')           // remove horizontal rules
      .replace(/\n{3,}/g, '\n\n')     // collapse multiple newlines
      .trim()
  }

  // Track last spoken response to avoid re-speaking the same one
  const lastSpokenRef = useRef('')

  // Auto-speak AI response after voice was used
  useEffect(() => {
    if (
      onSpeakResponse &&
      onSpeakResponse.trim() &&
      hasUsedVoiceRef.current &&
      mode === 'idle' &&
      onSpeakResponse !== lastSpokenRef.current
    ) {
      console.log('[Voice] Auto-speak triggered, response length:', onSpeakResponse.length)
      lastSpokenRef.current = onSpeakResponse
      const cleanText = stripMarkdown(onSpeakResponse)
      if (cleanText) {
        console.log('[Voice] Speaking cleaned text:', cleanText.substring(0, 80))
        speakText(cleanText)
      } else {
        console.log('[Voice] Cleaned text was empty after markdown strip')
      }
    }
  }, [onSpeakResponse, mode])

  if (!isSupported) return null

  const handleClick = () => {
    if (disabled) return
    if (isSpeaking) { stopSpeaking(); return }
    if (isListening) { stopListening(); return }
    if (isProcessing) return
    startListening()
  }

  const getButtonStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: 36,
      height: 36,
      borderRadius: '50%',
      border: 'none',
      cursor: isProcessing ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      position: 'relative',
      flexShrink: 0,
    }

    if (isListening) return {
      ...base,
      background: '#5B5BD6',
      color: '#fff',
      animation: 'voicePulse 1.5s infinite',
    }

    if (isProcessing) return {
      ...base,
      background: '#FFF3E0',
      color: '#FF9F0A',
    }

    if (isSpeaking) return {
      ...base,
      background: '#E8F5E9',
      color: '#30D158',
    }

    return {
      ...base,
      background: 'transparent',
      color: 'var(--color-text-secondary, #666)',
    }
  }

  const getTooltip = () => {
    if (isListening) return 'Listening... (tap to stop)'
    if (isProcessing) return 'Transcribing...'
    if (isSpeaking) return 'Speaking... (tap to stop)'
    return 'Click to speak'
  }

  const getIcon = () => {
    if (isProcessing) return (
      <svg
        width="16" height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ animation: 'voiceSpin 1s linear infinite' }}
      >
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
    )
    if (isSpeaking) return (
      <svg
        width="16" height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    )
    return <Mic size={16} />
  }

  return (
    <>
      <style>{`
        @keyframes voicePulse {
          0% { box-shadow: 0 0 0 0 rgba(91,91,214,0.4); }
          70% { box-shadow: 0 0 0 10px rgba(91,91,214,0); }
          100% { box-shadow: 0 0 0 0 rgba(91,91,214,0); }
        }
        @keyframes voiceSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <button
        onClick={handleClick}
        disabled={disabled || isProcessing}
        style={getButtonStyle()}
        title={getTooltip()}
        aria-label={getTooltip()}
      >
        {getIcon()}
      </button>
    </>
  )
}
