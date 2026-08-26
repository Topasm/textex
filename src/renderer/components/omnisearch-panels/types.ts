import type { BookOpen } from 'lucide-react'
import type {
  AppCommandId,
  BibEntry,
  ProjectIndexEntry,
  RecentProject,
  ZoteroSearchResult
} from '../../../shared/types'

export type SearchMode = 'file' | 'cite' | 'zotero' | 'online' | 'pdf' | 'tex'

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

export type ProjectFileSearchResult = ProjectIndexEntry

export interface HomeSlashCommand {
  command: string
  label: string
  descriptionKey: string
  icon: React.ReactNode
}

export type HomeResultKind = 'project' | 'template' | 'command' | 'app-command'

export interface HomeAppCommand {
  id: AppCommandId
}

export interface HomeResult {
  kind: HomeResultKind
  label: string
  detail: string
  badgeKey: string
  disabled?: boolean
  shortcut?: string
  data: RecentProject | { name: string; description: string } | HomeSlashCommand | HomeAppCommand
}

export type { ZoteroSearchResult, BibEntry, RecentProject }
