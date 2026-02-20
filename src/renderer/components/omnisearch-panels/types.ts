import type { BookOpen } from 'lucide-react'
import type { ZoteroSearchResult } from '../../types/api'
import type { BibEntry, RecentProject } from '../../../shared/types'

export type SearchMode = 'cite' | 'zotero' | 'pdf' | 'tex'

export interface ModeConfig {
  icon: typeof BookOpen
  placeholder: string
  label: string
  shortcut: string
}

export interface TexSearchResult {
  line: number
  text: string
}

export interface HomeSlashCommand {
  command: string
  label: string
  descriptionKey: string
  icon: React.ReactNode
}

export type HomeResultKind = 'project' | 'template' | 'command'

export interface HomeResult {
  kind: HomeResultKind
  label: string
  detail: string
  badgeKey: string
  data: RecentProject | { name: string; description: string } | HomeSlashCommand
}

export type { ZoteroSearchResult, BibEntry, RecentProject }
