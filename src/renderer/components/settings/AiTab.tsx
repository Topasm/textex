import { useCallback, useEffect, useMemo, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { AiProvider, UserSettings } from '../../../shared/types'
import {
  AlertCircle,
  Bot,
  Check,
  Cloud,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Brain,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Terminal
} from 'lucide-react'
import { Toggle } from './Toggle'

import { AI_MODEL_OPTIONS, AI_PROVIDER_INFO, AI_PROVIDER_ORDER } from '../../constants'

const DEFAULT_PROMPTS: Record<
  string,
  { labelKey: string; key: keyof UserSettings; placeholder: string }
> = {
  generate: {
    labelKey: 'settings.ai.promptGenerate',
    key: 'aiPromptGenerate' as keyof UserSettings,
    placeholder:
      'You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code...'
  },
  fix: {
    labelKey: 'settings.ai.promptFix',
    key: 'aiPromptFix' as keyof UserSettings,
    placeholder:
      'Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.'
  },
  academic: {
    labelKey: 'settings.ai.promptAcademic',
    key: 'aiPromptAcademic' as keyof UserSettings,
    placeholder:
      'Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.'
  },
  summarize: {
    labelKey: 'settings.ai.promptSummarize',
    key: 'aiPromptSummarize' as keyof UserSettings,
    placeholder: 'Summarize the following text briefly. Return ONLY the summary.'
  },
  longer: {
    labelKey: 'settings.ai.promptLonger',
    key: 'aiPromptLonger' as keyof UserSettings,
    placeholder:
      'Paraphrase the following text to be longer and more detailed, expanding on the key points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
  },
  shorter: {
    labelKey: 'settings.ai.promptShorter',
    key: 'aiPromptShorter' as keyof UserSettings,
    placeholder:
      'Paraphrase the following text to be shorter and more concise, keeping only the essential points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
  }
}

const AiPromptsEditor = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)

  const promptEntries = Object.entries(DEFAULT_PROMPTS)

  const handleReset = (key: keyof UserSettings) => {
    updateSetting(key, '' as never)
  }

  const hasCustomValue = (key: keyof UserSettings): boolean => {
    const val = settings[key]
    return typeof val === 'string' && val.trim().length > 0
  }

  return (
    <div>
      <div className="settings-flex-row-start">
        <MessageSquare size={ICON_SIZE.control} className="settings-icon-secondary" />
        <h3 className="settings-heading settings-no-mb">{t('settings.ai.customPrompts')}</h3>
      </div>
      <p className="settings-subheading">{t('settings.ai.customPromptsDesc')}</p>
      <div className="ai-prompts-list">
        {promptEntries.map(([id, prompt]) => {
          const isExpanded = expandedPrompt === id
          const isCustom = hasCustomValue(prompt.key)
          return (
            <div key={id} className="ai-prompt-item">
              <button
                className="ai-prompt-header"
                onClick={() => setExpandedPrompt(isExpanded ? null : id)}
              >
                <div className="settings-section-header-row">
                  {isExpanded ? (
                    <ChevronDown size={ICON_SIZE.compact} />
                  ) : (
                    <ChevronRight size={ICON_SIZE.compact} />
                  )}
                  <span>{t(prompt.labelKey)}</span>
                  {isCustom && (
                    <span className="settings-configured-tag">{t('settings.ai.custom')}</span>
                  )}
                </div>
              </button>
              {isExpanded && (
                <div className="ai-prompt-body">
                  <textarea
                    className="ai-prompt-textarea"
                    value={(settings[prompt.key] as string) || ''}
                    onChange={(e) => updateSetting(prompt.key, e.target.value as never)}
                    placeholder={prompt.placeholder}
                    rows={3}
                  />
                  {isCustom && (
                    <button
                      className="ai-prompt-reset"
                      onClick={() => handleReset(prompt.key)}
                      title={t('settings.ai.resetToDefault')}
                    >
                      <RotateCcw size={ICON_SIZE.micro} />
                      {t('settings.editor.resetColors')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ProviderAvailability = Record<AiProvider, boolean | null>

const INITIAL_AVAILABILITY: ProviderAvailability = {
  anthropic: null,
  openai: null,
  gemini: null,
  'claude-cli': null,
  'codex-cli': null
}

const API_PROVIDERS = AI_PROVIDER_ORDER.filter(
  (provider) => AI_PROVIDER_INFO[provider].kind === 'api'
)
const CLI_PROVIDERS = AI_PROVIDER_ORDER.filter(
  (provider) => AI_PROVIDER_INFO[provider].kind === 'cli'
)

function targetValue(provider: AiProvider, model: string): string {
  return `${provider}:${model || '__default__'}`
}

export const AiTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  const provider = settings.aiProvider
  const initialConnection = provider || 'anthropic'
  const [selectedConnection, setSelectedConnection] = useState<AiProvider>(
    initialConnection as AiProvider
  )
  const [availability, setAvailability] = useState<ProviderAvailability>(INITIAL_AVAILABILITY)
  const [connectionErrors, setConnectionErrors] = useState<Partial<Record<AiProvider, boolean>>>({})
  const [checkingConnections, setCheckingConnections] = useState(false)
  const [customTargetProvider, setCustomTargetProvider] = useState<AiProvider | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const refreshConnections = useCallback(async () => {
    setCheckingConnections(true)
    setConnectionErrors({})
    const results = await Promise.allSettled([
      window.api.aiHasApiKey('anthropic'),
      window.api.aiHasApiKey('openai'),
      window.api.aiHasApiKey('gemini'),
      window.api.aiCheckCli(),
      window.api.aiCheckCodexCli()
    ])
    const nextAvailability = { ...INITIAL_AVAILABILITY }
    const nextErrors: Partial<Record<AiProvider, boolean>> = {}
    AI_PROVIDER_ORDER.forEach((currentProvider, index) => {
      const result = results[index]
      nextAvailability[currentProvider] = result.status === 'fulfilled' ? result.value : false
      if (result.status === 'rejected') nextErrors[currentProvider] = true
    })
    setAvailability(nextAvailability)
    setConnectionErrors(nextErrors)
    setCheckingConnections(false)
  }, [])

  useEffect(() => {
    void refreshConnections()
  }, [refreshConnections])

  useEffect(() => {
    setApiKey('')
    setShowKey(false)
    setKeySaved(false)
    setKeyError(null)
  }, [selectedConnection])

  const knownCurrentModel =
    !!provider && AI_MODEL_OPTIONS[provider]?.some((model) => model.value === settings.aiModel)
  const usesCustomModel =
    !!provider && (customTargetProvider === provider || (!!settings.aiModel && !knownCurrentModel))
  const selectedTarget = !provider
    ? ''
    : usesCustomModel
      ? `${provider}:__custom__`
      : targetValue(provider, settings.aiModel)

  const targetChoices = useMemo(
    () =>
      new Map(
        AI_PROVIDER_ORDER.flatMap((currentProvider) => [
          [targetValue(currentProvider, ''), { provider: currentProvider, model: '' }] as const,
          ...(AI_MODEL_OPTIONS[currentProvider] ?? []).map(
            (model) =>
              [
                targetValue(currentProvider, model.value),
                { provider: currentProvider, model: model.value }
              ] as const
          )
        ])
      ),
    []
  )

  const handleTargetChange = (value: string) => {
    if (!value) {
      updateSetting('aiProvider', '')
      updateSetting('aiModel', '')
      setCustomTargetProvider(null)
      return
    }
    const separator = value.indexOf(':')
    const nextProvider = value.slice(0, separator) as AiProvider
    const model = value.slice(separator + 1)
    if (model === '__custom__') {
      updateSetting('aiProvider', nextProvider)
      updateSetting('aiModel', '')
      setCustomTargetProvider(nextProvider)
      return
    }
    const target = targetChoices.get(value)
    if (!target) return
    updateSetting('aiProvider', target.provider)
    updateSetting('aiModel', target.model)
    setCustomTargetProvider(null)
  }

  const handleSaveKey = async () => {
    if (AI_PROVIDER_INFO[selectedConnection].kind !== 'api' || !apiKey.trim()) return
    try {
      await window.api.aiSaveApiKey(selectedConnection, apiKey.trim())
      setAvailability((current) => ({ ...current, [selectedConnection]: true }))
      setConnectionErrors((current) => ({ ...current, [selectedConnection]: false }))
      setKeySaved(true)
      setKeyError(null)
      setApiKey('')
      setShowKey(false)
      setTimeout(() => setKeySaved(false), 2000)
    } catch {
      setKeySaved(false)
      setKeyError('saveFailed')
    }
  }

  const renderConnectionGroup = (title: string, providers: AiProvider[]) => (
    <div className="ai-connections-group">
      <div className="ai-connections-group-title">{title}</div>
      <div className="ai-connections-list">
        {providers.map((currentProvider) => {
          const info = AI_PROVIDER_INFO[currentProvider]
          const available = availability[currentProvider]
          const hasError = connectionErrors[currentProvider]
          const isSelected = selectedConnection === currentProvider
          return (
            <button
              type="button"
              className={`ai-connection-row${isSelected ? ' selected' : ''}`}
              key={currentProvider}
              onClick={() => setSelectedConnection(currentProvider)}
              aria-pressed={isSelected}
            >
              <span className="ai-connection-icon" aria-hidden="true">
                {info.kind === 'cli' ? (
                  <Terminal size={ICON_SIZE.control} />
                ) : (
                  <Cloud size={ICON_SIZE.control} />
                )}
              </span>
              <span className="ai-connection-copy">
                <span className="ai-connection-name">{info.label}</span>
                <span className="ai-connection-description">
                  {info.kind === 'cli'
                    ? t('settings.ai.localCliConnection')
                    : t('settings.ai.cloudApiConnection')}
                </span>
              </span>
              <span
                className={`ai-connection-status${
                  available === true ? ' ready' : available === false ? ' unavailable' : ''
                }`}
              >
                <span className="settings-status-dot" />
                {available === null
                  ? t('settings.ai.checking')
                  : hasError
                    ? t('settings.ai.checkFailedShort')
                    : available
                      ? t('settings.ai.ready')
                      : info.kind === 'cli'
                        ? t('settings.ai.notInstalled')
                        : t('settings.ai.keyRequired')}
              </span>
              <ChevronRight
                size={ICON_SIZE.compact}
                className="ai-connection-chevron"
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </div>
  )

  const selectedInfo = AI_PROVIDER_INFO[selectedConnection]
  const selectedAvailable = availability[selectedConnection]

  return (
    <div className="settings-tab-content settings-animate-in ai-settings-tab">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Bot size={ICON_SIZE.prominent} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">{t('settings.ai.title')}</h3>
              <Toggle
                checked={!!settings.aiEnabled}
                onChange={(checked) => updateSetting('aiEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">{t('settings.ai.description')}</p>
          </div>
        </div>
      </div>

      {settings.aiEnabled && (
        <>
          <section className="ai-settings-block" aria-labelledby="ai-default-target-heading">
            <div className="ai-settings-block-heading">
              <div>
                <h3 id="ai-default-target-heading" className="settings-heading">
                  {t('settings.ai.defaultTarget')}
                </h3>
                <p className="settings-subheading">{t('settings.ai.defaultTargetDesc')}</p>
              </div>
              <span className="ai-settings-kicker">{t('settings.ai.execution')}</span>
            </div>
            <label className="settings-label" htmlFor="ai-default-target">
              {t('settings.ai.providerAndModel')}
            </label>
            <select
              id="ai-default-target"
              className="settings-select ai-target-select"
              value={selectedTarget}
              onChange={(event) => handleTargetChange(event.target.value)}
            >
              <option value="">{t('settings.ai.noDefaultTarget')}</option>
              <optgroup label={t('settings.ai.localAgents')}>
                {CLI_PROVIDERS.flatMap((currentProvider) => {
                  const info = AI_PROVIDER_INFO[currentProvider]
                  return [
                    <option
                      key={`${currentProvider}:default`}
                      value={targetValue(currentProvider, '')}
                    >
                      {info.shortLabel} · {t('settings.ai.agentDefault')}
                    </option>,
                    ...(AI_MODEL_OPTIONS[currentProvider] ?? []).map((model) => (
                      <option
                        key={`${currentProvider}:${model.value}`}
                        value={targetValue(currentProvider, model.value)}
                      >
                        {info.shortLabel} · {model.label}
                      </option>
                    )),
                    <option
                      key={`${currentProvider}:custom`}
                      value={`${currentProvider}:__custom__`}
                    >
                      {info.shortLabel} · {t('settings.ai.customModel')}
                    </option>
                  ]
                })}
              </optgroup>
              <optgroup label={t('settings.ai.cloudModels')}>
                {API_PROVIDERS.flatMap((currentProvider) => {
                  const info = AI_PROVIDER_INFO[currentProvider]
                  return [
                    <option
                      key={`${currentProvider}:default`}
                      value={targetValue(currentProvider, '')}
                    >
                      {info.shortLabel} · {t('settings.ai.providerDefault')}
                    </option>,
                    ...(AI_MODEL_OPTIONS[currentProvider] ?? []).map((model) => (
                      <option
                        key={`${currentProvider}:${model.value}`}
                        value={targetValue(currentProvider, model.value)}
                      >
                        {info.shortLabel} · {model.label}
                      </option>
                    )),
                    <option
                      key={`${currentProvider}:custom`}
                      value={`${currentProvider}:__custom__`}
                    >
                      {info.shortLabel} · {t('settings.ai.customModel')}
                    </option>
                  ]
                })}
              </optgroup>
            </select>
            {usesCustomModel && provider && (
              <div className="ai-custom-model-field">
                <label className="settings-label" htmlFor="ai-custom-model">
                  {t('settings.ai.customModelId')}
                </label>
                <input
                  id="ai-custom-model"
                  value={settings.aiModel}
                  onChange={(event) => updateSetting('aiModel', event.target.value)}
                  placeholder={t('settings.ai.customModelPlaceholder')}
                  className="settings-input"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            )}
            {provider && availability[provider] === false && (
              <div className="ai-settings-notice warning">
                <AlertCircle size={ICON_SIZE.compact} />
                <span>{t('settings.ai.defaultTargetUnavailable')}</span>
                <button type="button" onClick={() => setSelectedConnection(provider)}>
                  {t('settings.ai.configure')}
                </button>
              </div>
            )}
            <p className="ai-settings-footnote">{t('settings.ai.sessionOverrideHint')}</p>
          </section>

          <section className="ai-settings-block" aria-labelledby="ai-connections-heading">
            <div className="ai-settings-block-heading">
              <div>
                <h3 id="ai-connections-heading" className="settings-heading">
                  {t('settings.ai.connections')}
                </h3>
                <p className="settings-subheading">{t('settings.ai.connectionsDesc')}</p>
              </div>
              <button
                type="button"
                className="ai-refresh-button"
                onClick={() => void refreshConnections()}
                disabled={checkingConnections}
              >
                <RefreshCw
                  size={ICON_SIZE.compact}
                  className={checkingConnections ? 'spinning' : ''}
                />
                {t('settings.ai.refresh')}
              </button>
            </div>

            <div className="ai-connections-layout">
              <div className="ai-connections-column">
                {renderConnectionGroup(t('settings.ai.cloudApi'), API_PROVIDERS)}
                {renderConnectionGroup(t('settings.ai.localCli'), CLI_PROVIDERS)}
              </div>

              <div className="ai-connection-detail">
                <div className="ai-connection-detail-header">
                  <span className="ai-connection-icon large" aria-hidden="true">
                    {selectedInfo.kind === 'cli' ? (
                      <Terminal size={ICON_SIZE.feature} />
                    ) : (
                      <Key size={ICON_SIZE.feature} />
                    )}
                  </span>
                  <div>
                    <h4>{selectedInfo.label}</h4>
                    <p>
                      {selectedInfo.kind === 'cli'
                        ? t('settings.ai.cliStatusDesc', { provider: selectedInfo.shortLabel })
                        : t('settings.ai.apiKeyDesc', { provider: selectedInfo.shortLabel })}
                    </p>
                  </div>
                </div>

                {selectedInfo.kind === 'api' ? (
                  <>
                    <div className="settings-key-row settings-field-mt-sm">
                      <div className="settings-key-input-wrapper">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          placeholder={
                            selectedAvailable ? t('settings.ai.enterNewKey') : selectedInfo.keyHint
                          }
                          className="settings-input settings-input-pr"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleSaveKey()
                          }}
                        />
                        <button
                          type="button"
                          className="settings-key-toggle-btn"
                          onClick={() => setShowKey(!showKey)}
                          title={showKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
                        >
                          {showKey ? (
                            <EyeOff size={ICON_SIZE.control} />
                          ) : (
                            <Eye size={ICON_SIZE.control} />
                          )}
                        </button>
                      </div>
                      <button
                        className="primary-button settings-nowrap"
                        onClick={() => void handleSaveKey()}
                        disabled={!apiKey.trim()}
                      >
                        {keySaved ? (
                          <>
                            <Check size={ICON_SIZE.compact} /> {t('settings.ai.saved')}
                          </>
                        ) : (
                          t('settings.ai.saveKey')
                        )}
                      </button>
                    </div>
                    {keyError && (
                      <span className="settings-status-text error settings-status-inline">
                        <span className="settings-status-dot error" />
                        {t(`settings.ai.${keyError}`)}
                      </span>
                    )}
                  </>
                ) : (
                  <div
                    className={`ai-settings-notice${selectedAvailable ? ' success' : ' warning'}`}
                  >
                    {selectedAvailable ? (
                      <Check size={ICON_SIZE.compact} />
                    ) : (
                      <AlertCircle size={ICON_SIZE.compact} />
                    )}
                    <span>
                      {selectedAvailable
                        ? t('settings.ai.cliFound', { provider: selectedInfo.shortLabel })
                        : t('settings.ai.cliNotFound', { provider: selectedInfo.shortLabel })}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  className="ai-external-link"
                  onClick={() => void window.api.openExternal(selectedInfo.keyUrl)}
                >
                  {selectedInfo.kind === 'cli'
                    ? t('settings.ai.openSetupGuide')
                    : t('settings.ai.getKey')}
                  <ExternalLink size={ICON_SIZE.micro} />
                </button>
                {connectionErrors[selectedConnection] && (
                  <span className="settings-status-text error settings-status-inline">
                    <span className="settings-status-dot error" />
                    {t('settings.ai.checkFailed')}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="ai-settings-block" aria-labelledby="ai-reasoning-heading">
            <div className="settings-flex-row-start">
              <Brain size={ICON_SIZE.control} className="settings-icon-secondary" />
              <h3 id="ai-reasoning-heading" className="settings-heading settings-no-mb">
                {t('settings.ai.thinking')}
              </h3>
            </div>
            {provider && AI_PROVIDER_INFO[provider].kind === 'cli' ? (
              <div className="ai-settings-notice neutral">
                <Terminal size={ICON_SIZE.compact} />
                <span>{t('settings.ai.cliReasoningManaged')}</span>
              </div>
            ) : (
              <>
                <p className="settings-subheading">{t('settings.ai.thinkingDesc')}</p>
                <div className="settings-column-group">
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">{t('settings.ai.enableThinking')}</div>
                      <div className="settings-row-description">
                        {t('settings.ai.enableThinkingDesc')}
                      </div>
                    </div>
                    <Toggle
                      checked={!!settings.aiThinkingEnabled}
                      onChange={(checked) => updateSetting('aiThinkingEnabled', checked)}
                    />
                  </div>
                  {settings.aiThinkingEnabled && (
                    <div className="settings-thinking-sub">
                      <label className="settings-label">{t('settings.ai.thinkingBudget')}</label>
                      <div className="settings-thinking-budget-row">
                        <select
                          value={settings.aiThinkingBudget || 0}
                          onChange={(event) =>
                            updateSetting('aiThinkingBudget', parseInt(event.target.value))
                          }
                          className="settings-select settings-select-wide"
                        >
                          <option value={0}>{t('settings.ai.budgetDefault')}</option>
                          <option value={4096}>{t('settings.ai.budgetLight')}</option>
                          <option value={8192}>{t('settings.ai.budgetMedium')}</option>
                          <option value={16384}>{t('settings.ai.budgetDeep')}</option>
                          <option value={32768}>{t('settings.ai.budgetMaximum')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="ai-settings-block">
            <AiPromptsEditor />
          </section>
        </>
      )}
    </div>
  )
}
