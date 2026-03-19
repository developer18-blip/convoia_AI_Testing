import { useContext } from 'react'
import { ChatContext, type ChatContextType } from '../contexts/ChatContext'

export function useChat(): ChatContextType {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
