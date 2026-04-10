import { useState, useEffect, useRef } from 'react'
import { X, Mic } from 'lucide-react'
import { useVoiceConversation } from '../hooks/useVoiceConversation'

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/>\s?/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\d+\.\s/g, '')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onTranscript: (text: string) => void
  latestAIResponse?: string
  isAIStreaming?: boolean
}

export function VoiceConversationMode({ isOpen, onClose, onTranscript, latestAIResponse, isAIStreaming }: Props) {
  const [autoLoop, setAutoLoop] = useState(true)
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const lastSpokenRef = useRef('')

  const {
    mode,
    isListening,
    isProcessing,
    isSpeaking,
    startListening,
    stopListening,
    stopSpeaking,
    speakText,
  } = useVoiceConversation({
    onTranscript: (text) => {
      setLastTranscript(text)
      onTranscript(text)
    },
    onError: (msg) => console.error('Voice mode error:', msg),
    voice: 'nova',
  })

  // Auto-start listening when overlay opens
  const didAutoStartRef = useRef(false)
  useEffect(() => {
    if (isOpen && !didAutoStartRef.current && mode === 'idle') {
      didAutoStartRef.current = true
      const timer = setTimeout(() => startListening(), 500)
      return () => clearTimeout(timer)
    }
    if (!isOpen) didAutoStartRef.current = false
  }, [isOpen, mode])

  // Track if we just finished speaking (for auto-loop)
  const prevModeRef = useRef(mode)
  const hasSpokenOnceRef = useRef(false)

  // Auto-speak latest AI response (strip markdown for clean TTS)
  useEffect(() => {
    if (
      isOpen &&
      latestAIResponse &&
      latestAIResponse.trim() &&
      latestAIResponse !== lastSpokenRef.current &&
      mode === 'idle'
    ) {
      lastSpokenRef.current = latestAIResponse
      const cleanText = stripMarkdown(latestAIResponse)
      setLastResponse(cleanText || latestAIResponse)
      if (cleanText) {
        hasSpokenOnceRef.current = true
        speakText(cleanText)
      }
    }
  }, [latestAIResponse, isOpen, mode])

  // Auto-loop: after TTS finishes → auto-listen (like ChatGPT)
  useEffect(() => {
    const wasSpeaking = prevModeRef.current === 'speaking'
    prevModeRef.current = mode

    if (isOpen && wasSpeaking && mode === 'idle' && autoLoop) {
      const timer = setTimeout(() => {
        startListening()
      }, 600) // faster than before — feels more natural
      return () => clearTimeout(timer)
    }
  }, [mode, autoLoop, isOpen])

  if (!isOpen) return null

  const handleMicClick = () => {
    if (isSpeaking) { stopSpeaking(); return }
    if (isListening) { stopListening(); return }
    if (isProcessing) return
    startListening()
  }

  const handleClose = () => {
    stopSpeaking()
    stopListening()
    onClose()
  }

  const getOrbStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: 80,
      height: 80,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.3s ease',
    }

    if (isListening) return {
      ...base,
      background: '#5B5BD6',
      animation: 'orbPulse 1.5s ease-in-out infinite',
      boxShadow: '0 0 30px rgba(91,91,214,0.5)',
    }
    if (isProcessing) return {
      ...base,
      background: '#FF9F0A',
      boxShadow: '0 0 20px rgba(255,159,10,0.4)',
    }
    if (isSpeaking) return {
      ...base,
      background: '#30D158',
      animation: 'orbWave 1s ease-in-out infinite',
      boxShadow: '0 0 30px rgba(48,209,88,0.5)',
    }
    if (isAIStreaming) return {
      ...base,
      background: 'rgba(255,159,10,0.3)',
      animation: 'orbPulse 2s ease-in-out infinite',
      boxShadow: '0 0 20px rgba(255,159,10,0.3)',
    }
    return {
      ...base,
      background: 'rgba(91,91,214,0.15)',
      border: '2px solid rgba(91,91,214,0.3)',
    }
  }

  const getStatusText = () => {
    if (isListening) return 'Listening...'
    if (isProcessing) return 'Transcribing...'
    if (isAIStreaming) return 'AI is thinking...'
    if (isSpeaking) return 'Speaking...'
    return 'Tap to speak'
  }

  const getMicStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: 64,
      height: 64,
      borderRadius: '50%',
      border: 'none',
      cursor: isProcessing ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
    }
    if (isListening) return { ...base, background: '#5B5BD6', color: '#fff' }
    if (isProcessing) return { ...base, background: 'rgba(255,159,10,0.2)', color: '#FF9F0A' }
    if (isSpeaking) return { ...base, background: 'rgba(48,209,88,0.2)', color: '#30D158' }
    return { ...base, background: 'rgba(255,255,255,0.1)', color: '#fff' }
  }

  return (
    <>
      <style>{`
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes orbWave {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}>
        {/* Header */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 20px',
        }}>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>
            Voice Conversation
          </span>
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              right: 20,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: 8,
            }}
            aria-label="Close voice mode"
          >
            <X size={24} />
          </button>
        </div>

        {/* Orb */}
        <div style={getOrbStyle()} />

        {/* Status */}
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
          {getStatusText()}
        </span>

        {/* Last transcript */}
        {lastTranscript && (
          <div style={{
            maxWidth: 300,
            textAlign: 'center',
            fontSize: 14,
            color: 'rgba(255,255,255,0.7)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            "{lastTranscript}"
          </div>
        )}

        {/* Last AI response */}
        {lastResponse && (
          <div style={{
            maxWidth: 320,
            textAlign: 'center',
            fontSize: 15,
            color: '#fff',
            maxHeight: 80,
            overflowY: 'auto',
            lineHeight: 1.5,
          }}>
            {lastResponse.length > 200 ? lastResponse.slice(0, 200) + '...' : lastResponse}
          </div>
        )}

        {/* Mic button */}
        <button
          onClick={handleMicClick}
          disabled={isProcessing}
          style={getMicStyle()}
          aria-label={getStatusText()}
        >
          <Mic size={28} />
        </button>

        {/* Auto-loop toggle */}
        <button
          onClick={() => setAutoLoop((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Auto-listen: {autoLoop ? 'ON' : 'OFF'}
        </button>
      </div>
    </>
  )
}
