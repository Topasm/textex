import type { AppCommandId, RendererShortcutId } from './appCommandManifest'
import type { LearnSectionId, TourItemId } from './learningIds'

export type { LearnSectionId, TourItemId } from './learningIds'

export type LearnVisual =
  | 'start'
  | 'compile'
  | 'commands'
  | 'swipe'
  | 'page'
  | 'zoom'
  | 'tabs'
  | 'resize'
  | 'sync'
  | 'references'
  | 'chat'
  | 'project'

export type LearnShortcutId = AppCommandId | RendererShortcutId

export interface LearnItem {
  readonly id: string
  readonly sectionId: Exclude<LearnSectionId, 'tour' | 'shortcuts'>
  readonly titleKey: string
  readonly descriptionKey: string
  readonly visual: LearnVisual
  readonly actionCommandId?: AppCommandId
  readonly shortcutId?: LearnShortcutId
  readonly requiredContext?: 'document' | 'pdf' | 'project'
  readonly gestureInputKey?: string
  readonly alternativeKey?: string
}

export interface LearnSection {
  readonly id: LearnSectionId
  readonly titleKey: string
  readonly descriptionKey: string
}

export const LEARN_SECTIONS: readonly LearnSection[] = [
  {
    id: 'tour',
    titleKey: 'learning.sections.tour.title',
    descriptionKey: 'learning.sections.tour.description'
  },
  {
    id: 'quick-start',
    titleKey: 'learning.sections.quickStart.title',
    descriptionKey: 'learning.sections.quickStart.description'
  },
  {
    id: 'gestures',
    titleKey: 'learning.sections.gestures.title',
    descriptionKey: 'learning.sections.gestures.description'
  },
  {
    id: 'writing',
    titleKey: 'learning.sections.writing.title',
    descriptionKey: 'learning.sections.writing.description'
  },
  {
    id: 'research',
    titleKey: 'learning.sections.research.title',
    descriptionKey: 'learning.sections.research.description'
  },
  {
    id: 'ai',
    titleKey: 'learning.sections.ai.title',
    descriptionKey: 'learning.sections.ai.description'
  },
  {
    id: 'project',
    titleKey: 'learning.sections.project.title',
    descriptionKey: 'learning.sections.project.description'
  },
  {
    id: 'shortcuts',
    titleKey: 'learning.sections.shortcuts.title',
    descriptionKey: 'learning.sections.shortcuts.description'
  }
]

export const LEARN_ITEMS: readonly LearnItem[] = [
  {
    id: 'open-project',
    sectionId: 'quick-start',
    titleKey: 'commandPalette.commands.file_openFolder',
    descriptionKey: 'learning.items.openProject',
    visual: 'start',
    actionCommandId: 'file.openFolder',
    shortcutId: 'file.openFolder'
  },
  {
    id: 'compile-document',
    sectionId: 'quick-start',
    titleKey: 'commandPalette.commands.compile_run',
    descriptionKey: 'learning.items.compileDocument',
    visual: 'compile',
    actionCommandId: 'compile.run',
    shortcutId: 'compile.run',
    requiredContext: 'document'
  },
  {
    id: 'command-palette',
    sectionId: 'quick-start',
    titleKey: 'commandPalette.title',
    descriptionKey: 'learning.items.commandPalette',
    visual: 'commands',
    shortcutId: 'commandPalette.open'
  },
  {
    id: 'paired-workspace',
    sectionId: 'gestures',
    titleKey: 'learning.items.pairedWorkspaceTitle',
    descriptionKey: 'learning.items.pairedWorkspace',
    visual: 'swipe',
    actionCommandId: 'view.toggleProse',
    shortcutId: 'view.toggleProse',
    requiredContext: 'document',
    gestureInputKey: 'learning.gestures.horizontalSwipe',
    alternativeKey: 'learning.gestures.proseAlternative'
  },
  {
    id: 'pdf-pages',
    sectionId: 'gestures',
    titleKey: 'learning.items.pdfPagesTitle',
    descriptionKey: 'learning.items.pdfPages',
    visual: 'page',
    requiredContext: 'pdf',
    gestureInputKey: 'learning.gestures.pageSwipe',
    alternativeKey: 'learning.gestures.pageAlternative'
  },
  {
    id: 'pdf-zoom',
    sectionId: 'gestures',
    titleKey: 'learning.items.pdfZoomTitle',
    descriptionKey: 'learning.items.pdfZoom',
    visual: 'zoom',
    actionCommandId: 'pdf.zoomIn',
    shortcutId: 'pdf.zoomIn',
    requiredContext: 'pdf',
    gestureInputKey: 'learning.gestures.zoomGesture',
    alternativeKey: 'learning.gestures.zoomAlternative'
  },
  {
    id: 'panel-tabs',
    sectionId: 'gestures',
    titleKey: 'learning.items.panelTabsTitle',
    descriptionKey: 'learning.items.panelTabs',
    visual: 'tabs',
    requiredContext: 'project',
    gestureInputKey: 'learning.gestures.horizontalSwipe',
    alternativeKey: 'learning.gestures.tabsAlternative'
  },
  {
    id: 'resize-layout',
    sectionId: 'gestures',
    titleKey: 'learning.items.resizeTitle',
    descriptionKey: 'learning.items.resize',
    visual: 'resize',
    requiredContext: 'project',
    gestureInputKey: 'learning.gestures.resizeGesture',
    alternativeKey: 'learning.gestures.resizeAlternative'
  },
  {
    id: 'save-document',
    sectionId: 'writing',
    titleKey: 'commandPalette.commands.file_save',
    descriptionKey: 'learning.items.saveDocument',
    visual: 'start',
    actionCommandId: 'file.save',
    shortcutId: 'file.save',
    requiredContext: 'document'
  },
  {
    id: 'source-pdf-sync',
    sectionId: 'writing',
    titleKey: 'learning.items.syncTitle',
    descriptionKey: 'learning.items.sync',
    visual: 'sync',
    requiredContext: 'pdf'
  },
  {
    id: 'search-pdf',
    sectionId: 'writing',
    titleKey: 'commandPalette.commands.view_search_pdf',
    descriptionKey: 'learning.items.searchPdf',
    visual: 'commands',
    actionCommandId: 'view.search.pdf',
    shortcutId: 'view.search.pdf',
    requiredContext: 'pdf'
  },
  {
    id: 'citation-search',
    sectionId: 'research',
    titleKey: 'commandPalette.commands.view_search_citations',
    descriptionKey: 'learning.items.citationSearch',
    visual: 'references',
    actionCommandId: 'view.search.citations',
    shortcutId: 'view.search.citations',
    requiredContext: 'project'
  },
  {
    id: 'submission-check',
    sectionId: 'research',
    titleKey: 'commandPalette.commands.compile_submissionCheck',
    descriptionKey: 'learning.items.submissionCheck',
    visual: 'references',
    actionCommandId: 'compile.submissionCheck',
    requiredContext: 'document'
  },
  {
    id: 'research-panel',
    sectionId: 'research',
    titleKey: 'commandPalette.commands.view_toggleResearchPanel',
    descriptionKey: 'learning.items.researchPanel',
    visual: 'references',
    actionCommandId: 'view.toggleResearchPanel',
    shortcutId: 'view.toggleResearchPanel',
    requiredContext: 'project'
  },
  {
    id: 'research-chat',
    sectionId: 'ai',
    titleKey: 'learning.items.researchChatTitle',
    descriptionKey: 'learning.items.researchChat',
    visual: 'chat',
    actionCommandId: 'view.toggleResearchPanel',
    shortcutId: 'view.toggleResearchPanel',
    requiredContext: 'project'
  },
  {
    id: 'ai-selection',
    sectionId: 'ai',
    titleKey: 'learning.items.selectionAiTitle',
    descriptionKey: 'learning.items.selectionAi',
    visual: 'chat',
    requiredContext: 'document'
  },
  {
    id: 'ai-settings',
    sectionId: 'ai',
    titleKey: 'settings.tabs.ai',
    descriptionKey: 'learning.items.aiSettings',
    visual: 'chat',
    actionCommandId: 'app.settings'
  },
  {
    id: 'templates',
    sectionId: 'project',
    titleKey: 'commandPalette.commands.file_newTemplate',
    descriptionKey: 'learning.items.templates',
    visual: 'project',
    actionCommandId: 'file.newTemplate',
    shortcutId: 'file.newTemplate'
  },
  {
    id: 'project-terminal',
    sectionId: 'project',
    titleKey: 'commandPalette.commands.project_openTerminal',
    descriptionKey: 'learning.items.projectTerminal',
    visual: 'project',
    actionCommandId: 'project.openTerminal',
    requiredContext: 'project'
  },
  {
    id: 'export-document',
    sectionId: 'project',
    titleKey: 'commandPalette.commands.file_export_docx',
    descriptionKey: 'learning.items.exportDocument',
    visual: 'project',
    actionCommandId: 'file.export.docx',
    requiredContext: 'document'
  }
]

export interface TourItem {
  readonly id: TourItemId
  readonly titleKey: string
  readonly descriptionKey: string
  readonly actionCommandId?: AppCommandId
  readonly requiredContext?: 'document' | 'pdf' | 'project'
}

export const TOUR_ITEMS: readonly TourItem[] = [
  {
    id: 'tour-edit',
    titleKey: 'learning.tour.editTitle',
    descriptionKey: 'learning.tour.editDescription',
    requiredContext: 'document'
  },
  {
    id: 'tour-compile',
    titleKey: 'learning.tour.compileTitle',
    descriptionKey: 'learning.tour.compileDescription',
    actionCommandId: 'compile.run',
    requiredContext: 'document'
  },
  {
    id: 'tour-prose',
    titleKey: 'learning.tour.proseTitle',
    descriptionKey: 'learning.tour.proseDescription',
    actionCommandId: 'view.toggleProse',
    requiredContext: 'document'
  },
  {
    id: 'tour-references',
    titleKey: 'learning.tour.referencesTitle',
    descriptionKey: 'learning.tour.referencesDescription',
    actionCommandId: 'view.search.citations',
    requiredContext: 'project'
  },
  {
    id: 'tour-sync',
    titleKey: 'learning.tour.syncTitle',
    descriptionKey: 'learning.tour.syncDescription',
    requiredContext: 'pdf'
  },
  {
    id: 'tour-submission',
    titleKey: 'learning.tour.submissionTitle',
    descriptionKey: 'learning.tour.submissionDescription',
    actionCommandId: 'compile.submissionCheck',
    requiredContext: 'document'
  },
  {
    id: 'tour-export',
    titleKey: 'learning.tour.exportTitle',
    descriptionKey: 'learning.tour.exportDescription',
    requiredContext: 'project'
  }
]
