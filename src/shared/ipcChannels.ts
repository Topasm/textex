/**
 * Type-safe IPC channel definitions.
 *
 * Maps every IPC channel name to its request parameter tuple and response type.
 * Used by main (handlers), preload (bridge), and renderer (type declarations)
 * to guarantee that callers and handlers agree on the wire format.
 */

import type {
  Diagnostic,
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  DirectoryEntry,
  BibEntry,
  GitFileStatus,
  GitLogEntry,
  UserSettings,
  LabelInfo,
  PackageData,
  CitationGroup,
  ZoteroSearchResult,
  SectionNode,
  HistoryItem
} from './types'
import type { Template } from './templates'

// ---- Helpers ----

interface SuccessResult {
  success: boolean
}

interface OpenFileResult {
  content: string
  filePath: string
  warnLargeFile?: boolean
}

interface CompileResult {
  pdfPath: string
}

interface GitStatusResult {
  branch: string
  files: GitFileStatus[]
  staged: string[]
  modified: string[]
  not_added: string[]
}

// ---- Channel Map ----

/**
 * Maps IPC channel names to [RequestArgs, ResponseType].
 * RequestArgs is a tuple of the arguments after `_event`.
 */
export interface IpcChannelMap {
  // File System
  'fs:open': [[], OpenFileResult | null]
  'fs:save': [[content: string, filePath: string], SuccessResult]
  'fs:save-batch': [[files: Array<{ content: string; filePath: string }>], SuccessResult]
  'fs:save-as': [[content: string], { filePath: string } | null]
  'fs:create-template-project': [
    [templateName: string, content: string],
    { projectPath: string; filePath: string } | null
  ]
  'fs:read-file': [[filePath: string], OpenFileResult]
  'fs:open-directory': [[], string | null]
  'fs:read-directory': [[dirPath: string], DirectoryEntry[]]
  'fs:watch-directory': [[dirPath: string], SuccessResult]
  'fs:unwatch-directory': [[], SuccessResult]
  'fs:create-file': [[filePath: string], SuccessResult]
  'fs:create-directory': [[dirPath: string], SuccessResult]
  'fs:copy-file': [[source: string, dest: string], SuccessResult]
  'fs:read-file-base64': [[filePath: string], { data: string; mimeType: string }]

  // Compilation
  'latex:compile': [[filePath: string], CompileResult]
  'latex:cancel': [[], boolean]

  // SyncTeX
  'synctex:forward': [[texFile: string, line: number], SyncTeXForwardResult | null]
  'synctex:inverse': [
    [texFile: string, page: number, x: number, y: number],
    SyncTeXInverseResult | null
  ]

  // Settings
  'settings:load': [[], UserSettings]
  'settings:save': [[partial: Record<string, unknown>], UserSettings]
  'settings:add-recent-project': [[projectPath: string], UserSettings]
  'settings:remove-recent-project': [[projectPath: string], UserSettings]
  'settings:update-recent-project': [
    [projectPath: string, updates: { tag?: string; pinned?: boolean }],
    UserSettings
  ]

  // BibTeX
  'bib:parse': [[filePath: string], BibEntry[]]
  'bib:find-in-project': [[projectRoot: string], BibEntry[]]

  // Zotero
  'zotero:probe': [[port?: number], boolean]
  'zotero:search': [[term: string, port?: number], ZoteroSearchResult[]]
  'zotero:cite-cayw': [[port?: number], string]
  'zotero:export-bibtex': [[citekeys: string[], port?: number], string]

  // Citation Groups
  'citgroups:load': [[projectRoot: string], CitationGroup[]]
  'citgroups:save': [[projectRoot: string, groups: CitationGroup[]], SuccessResult]

  // Spell Check
  'spell:init': [[language: string], SuccessResult]
  'spell:check': [[words: string[]], string[]]
  'spell:suggest': [[word: string], string[]]
  'spell:add-word': [[word: string], SuccessResult]
  'spell:set-language': [[language: string], SuccessResult]

  // Git
  'git:is-repo': [[workDir: string], boolean]
  'git:init': [[workDir: string], SuccessResult]
  'git:status': [[workDir: string], GitStatusResult]
  'git:stage': [[workDir: string, filePath: string], SuccessResult]
  'git:unstage': [[workDir: string, filePath: string], SuccessResult]
  'git:commit': [[workDir: string, message: string], SuccessResult]
  'git:diff': [[workDir: string], string]
  'git:log': [[workDir: string], GitLogEntry[]]
  'git:file-log': [[workDir: string, filePath: string], GitLogEntry[]]

  // Auto Update
  'update:check': [[], { success: boolean; error?: string }]
  'update:download': [[], { success: boolean; error?: string }]
  'update:install': [[], { success: boolean; error?: string }]

  // Labels
  'latex:scan-labels': [[projectRoot: string], LabelInfo[]]

  // Package Data
  'latex:load-package-data': [[packageNames: string[]], Record<string, PackageData>]

  // Export
  'export:convert': [
    [inputPath: string, format: string],
    { success: boolean; outputPath: string } | null
  ]
  'export:formats': [[], { name: string; ext: string }[]]

  // LSP (TexLab)
  'lsp:start': [[workspaceRoot: string], SuccessResult]
  'lsp:stop': [[], SuccessResult]
  'lsp:send': [[message: object], SuccessResult]
  'lsp:status': [[], { status: string }]

  // AI Draft
  'ai:generate': [[input: string, provider: string, model: string], { latex: string }]
  'ai:process': [
    [action: 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter', text: string],
    string
  ]
  'ai:save-api-key': [[provider: string, apiKey: string], SuccessResult]
  'ai:has-api-key': [[provider: string], boolean]

  // Document Structure
  'structure:outline': [[filePath: string, content: string], SectionNode[]]

  // Shell
  'shell:open-external': [[url: string], SuccessResult]

  // History
  'history:save': [[filePath: string, content: string], void]
  'history:list': [[filePath: string], HistoryItem[]]
  'history:load': [[snapshotPath: string], string]

  // Templates
  'templates:list': [[], Template[]]
  'templates:add': [[name: string, description: string, content: string], Template]
  'templates:remove': [[id: string], SuccessResult]
  'templates:import-zip': [[], Template | null]
}

/** All valid invoke channel names. */
export type IpcChannel = keyof IpcChannelMap

/** Extract the request args tuple for a channel. */
export type IpcRequest<C extends IpcChannel> = IpcChannelMap[C][0]

/** Extract the response type for a channel. */
export type IpcResponse<C extends IpcChannel> = IpcChannelMap[C][1]

// ---- Push channels (main -> renderer) ----

export interface IpcPushChannelMap {
  'latex:log': [log: string]
  'latex:diagnostics': [diagnostics: Diagnostic[]]
  'fs:directory-changed': [change: { type: string; filename: string }]
  'fs:watch-error': [message: string]
  'lsp:message': [message: object]
  'lsp:status-change': [status: string, error?: string]
}

export type IpcPushChannel = keyof IpcPushChannelMap
