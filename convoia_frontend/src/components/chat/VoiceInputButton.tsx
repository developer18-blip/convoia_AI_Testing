import { useState, useRef } from 'react'
import { Mic, Square } from 'lucide-react'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInputButton({ onTranscript, disabled }: Props) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [uploading, setUploading] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const streamRef = useRef<MediaStream | null>(null)

  const transcribeAudio = async (blob: Blob) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, 'voice.webm')

      const token = localStorage.getItem('convoia_token')
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/files/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      )

      const data = await res.json()

      if (data.success && data.data.transcript) {
        onTranscript(data.data.transcript)
      }
    } catch (err) {
      console.error('Transcription error:', err)
    } finally {
      setUploading(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        await transcribeAudio(blob)
      }

      mediaRecorder.start(100)
      setRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= 120) {
            stopRecording()
            return d
          }
          return d + 1
        })
      }, 1000)
    } catch (err) {
      console.error('Microphone error:', err)
      alert('Microphone access denied. Please allow microphone access in your browser settings.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (uploading) {
    return (
      <div className="flex items-center gap-1 px-2">
        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-muted">Transcribing...</span>
      </div>
    )
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-danger/10 border border-danger/30 rounded-lg px-2 py-1">
          <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <span className="text-xs text-danger font-mono">{formatDuration(duration)}</span>
        </div>
        <button
          onClick={stopRecording}
          className="p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 transition-colors"
          title="Stop recording"
        >
          <Square size={16} fill="currentColor" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="p-2 rounded-lg text-text-muted hover:text-white hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Voice input (click to record)"
    >
      <Mic size={18} />
    </button>
  )
}
