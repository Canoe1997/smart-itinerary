/**
 * 记忆系统 — Supabase 连接与记忆操作
 *
 * 指南 Memory 组件实现：
 * - 短期记忆: 对话历史（已在 agent 中实现）
 * - 长期记忆: 用户偏好（本模块 user_preferences 表）
 * - RAG 知识库: 旅行攻略（本模块 travel_knowledge 表）
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { loadConfig } from '../config.js'

/** 用户偏好 */
export interface UserPreference {
  id: string
  preference_type: string
  preference_key: string
  preference_value: string
}

/** 旅行知识条目 */
export interface TravelKnowledge {
  id: string
  note_id: string | null
  title: string
  author: string | null
  content: string
  destination: string | null
  liked_count: number
}

/**
 * 创建记忆系统
 */
export function createMemory() {
  const config = loadConfig()

  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error('Supabase 未配置，请在 .env 中设置 SUPABASE_URL 和 SUPABASE_KEY')
  }

  const supabase: SupabaseClient = createClient(config.supabaseUrl, config.supabaseKey, {
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  })

  // ─── 用户偏好（长期记忆）───

  /** 保存用户偏好 */
  async function savePreference(
    type: string,
    key: string,
    value: string,
    userId = 'default',
  ): Promise<void> {
    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        preference_type: type,
        preference_key: key,
        preference_value: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,preference_type,preference_key' },
    )
    if (error) throw new Error(`保存偏好失败: ${error.message}`)
  }

  /** 搜索用户偏好 */
  async function searchPreferences(
    query: string,
    userId = 'default',
    limit = 10,
  ): Promise<UserPreference[]> {
    const { data, error } = await supabase.rpc('search_user_preferences_text', {
      search_query: query,
      match_user_id: userId,
      match_count: limit,
    })
    if (error) throw new Error(`搜索偏好失败: ${error.message}`)
    return (data ?? []) as UserPreference[]
  }

  /** 获取所有用户偏好 */
  async function getAllPreferences(userId = 'default'): Promise<UserPreference[]> {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('id, preference_type, preference_key, preference_value')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(`获取偏好失败: ${error.message}`)
    return (data ?? []) as UserPreference[]
  }

  // ─── 旅行知识库（RAG）───

  /** 存储旅行攻略知识 */
  async function storeKnowledge(entry: {
    noteId?: string
    title: string
    author?: string
    content: string
    destination?: string
    likedCount?: number
  }): Promise<void> {
    const row = {
      note_id: entry.noteId ?? `gen-${Date.now()}`,
      title: entry.title,
      author: entry.author,
      content: entry.content,
      destination: entry.destination,
      liked_count: entry.likedCount ?? 0,
    }
    const { data, error } = await supabase
      .from('travel_knowledge')
      .upsert(row, { onConflict: 'note_id' })
      .select()
    console.log('[Memory] storeKnowledge result:', data?.length ?? 0, 'rows, error:', error?.message ?? 'none')
    if (error) throw new Error(`存储知识失败: ${error.message}`)
  }

  /** 全文搜索旅行知识（RAG 检索） */
  async function searchKnowledge(
    query: string,
    destination?: string,
    limit = 5,
  ): Promise<TravelKnowledge[]> {
    const { data, error } = await supabase.rpc('search_travel_knowledge_text', {
      search_query: query,
      match_destination: destination ?? null,
      match_count: limit,
    })
    if (error) throw new Error(`搜索知识失败: ${error.message}`)
    return (data ?? []) as TravelKnowledge[]
  }

  /** 按目的地查询知识 */
  async function getKnowledgeByDestination(
    destination: string,
    limit = 10,
  ): Promise<TravelKnowledge[]> {
    const { data, error } = await supabase
      .from('travel_knowledge')
      .select('id, note_id, title, author, content, destination, liked_count')
      .eq('destination', destination)
      .order('liked_count', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`查询知识失败: ${error.message}`)
    return (data ?? []) as TravelKnowledge[]
  }

  return {
    savePreference,
    searchPreferences,
    getAllPreferences,
    storeKnowledge,
    searchKnowledge,
    getKnowledgeByDestination,
  }
}
