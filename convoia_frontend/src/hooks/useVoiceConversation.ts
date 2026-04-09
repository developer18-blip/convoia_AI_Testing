import { useState, useRef, useCallback, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

interface VoiceState {
  mode: 'idle' | 'listening' | 'processing' | 'speaking'
  transcript: string
  error: string | null
  isSupported: boolean
}

export function useVoiceConversation({
  onTranscript,
  onError,
  voice = 'nova',
}: {
  onTranscript: (text: string) => void
  onError: (msg: string) => void
  voice?: string
}) {
  const [state, setState] = useState<VoiceState>({
    mode: 'idle',
    transcript: '',
    error: null,
    isSupported: typeof MediaRecorder !== 'undefined',
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── START LISTENING ──
  const startListening = useCallback(async () => {
    if (state.mode !== 'idle') return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      streamRef.current = stream
      audioChunksRef.current = []

      // Determine best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })

        if (audioBlob.size < 1000) {
          // Too small — probably just silence
          setState((s) => ({ ...s, mode: 'idle' }))
          return
        }

        await processAudio(audioBlob, mimeType)
      }

      // Collect data every 250ms
      recorder.start(250)
      setState((s) => ({ ...s, mode: 'listening', error: null }))

      // ── SILENCE DETECTION ──
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 512

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let silenceStart: number | null = null
      const SILENCE_THRESHOLD = 15
      const SILENCE_DURATION = 2500

      const checkSilence = () => {
        if (mediaRecorderRef.current?.state !== 'recording') {
          audioContext.close()
          return
        }

        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

        if (avg < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now()
          if (Date.now() - silenceStart > SILENCE_DURATION) {
            stopListening()
            audioContext.close()
            return
          }
        } else {
          silenceStart = null
        }

        requestAnimationFrame(checkSilence)
      }

      requestAnimationFrame(checkSilence)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        onError('Microphone permission denied. Please allow microphone access.')
      } else {
        onError('Could not access microphone: ' + err.message)
      }
      setState((s) => ({ ...s, mode: 'idle' }))
    }
  }, [state.mode])

  // ── STOP LISTENING ──
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setState((s) => ({ ...s, mode: 'processing' }))
    }
  }, [])

  // ── PROCESS AUDIO → TRANSCRIBE ──
  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    try {
      setState((s) => ({ ...s, mode: 'processing' }))

      const formData = new FormData()
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      formData.append('audio', audioBlob, `recording.${ext}`)

      const token = localStorage.getItem('convoia_token')

      const response = await fetch(`${API_URL}/audio/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Transcription failed')
      }

      const data = await response.json()
      const transcript = data.data.transcript

      if (transcript && transcript.trim()) {
        setState((s) => ({ ...s, transcript, mode: 'idle' }))
        onTranscript(transcript)
      } else {
        setState((s) => ({ ...s, mode: 'idle' }))
        onError('No speech detected. Please try again.')
      }
    } catch (err: any) {
      setState((s) => ({ ...s, mode: 'idle', error: err.message }))
      onError(err.message)
    }
  }

  // ── SPEAK TEXT (TTS) ──
  const speakText = useCallback(
    async (text: string) => {
      if (!text) return

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      setState((s) => ({ ...s, mode: 'speaking' }))

      try {
        const token = localStorage.getItem('convoia_token')

        const response = await fetch(`${API_URL}/audio/speak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text, voice }),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Speech synthesis failed' }))
          throw new Error(error.message || 'Speech synthesis failed')
        }

        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          setState((s) => ({ ...s, mode: 'idle' }))
          audioRef.current = null
        }

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          setState((s) => ({ ...s, mode: 'idle' }))
        }

        await audio.play().catch(() => {
          // Autoplay blocked — reset state silently
          setState((s) => ({ ...s, mode: 'idle' }))
        })
      } catch (err: any) {
        setState((s) => ({ ...s, mode: 'idle' }))
        onError('Could not play audio: ' + err.message)
      }
    },
    [voice]
  )

  // ── STOP SPEAKING ──
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setState((s) => ({ ...s, mode: 'idle' }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (audioRef.current) audioRef.current.pause()
    }
  }, [])

  return {
    mode: state.mode,
    transcript: state.transcript,
    error: state.error,
    isSupported: state.isSupported,
    isListening: state.mode === 'listening',
    isProcessing: state.mode === 'processing',
    isSpeaking: state.mode === 'speaking',
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
  }
}
