import api from './api'
import type { ChatFolder } from '../types'

interface FolderCreateInput {
  name: string
  color?: string
  sortOrder?: number
}

interface FolderUpdateInput {
  name?: string
  color?: string | null
  sortOrder?: number
}

export async function fetchFolders(): Promise<ChatFolder[]> {
  const { data } = await api.get<{ success: boolean; data: ChatFolder[] }>('/folders')
  return data.data
}

export async function createFolderApi(input: FolderCreateInput): Promise<ChatFolder> {
  const { data } = await api.post<{ success: boolean; data: ChatFolder }>('/folders', input)
  return data.data
}

export async function updateFolderApi(id: string, patch: FolderUpdateInput): Promise<ChatFolder> {
  const { data } = await api.patch<{ success: boolean; data: ChatFolder }>(`/folders/${id}`, patch)
  return data.data
}

export async function deleteFolderApi(id: string): Promise<void> {
  await api.delete(`/folders/${id}`)
}
