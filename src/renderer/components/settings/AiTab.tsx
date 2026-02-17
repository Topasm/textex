import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { UserSettings } from '../../../shared/types'
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  Key,
  Brain,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  RotateCcw
} from 'lucide-react'
import { Toggle } from './Toggle'

import { AI_MODEL_OPTIONS, AI_PROVIDER_INFO } from '../../constants'

const DEFAULT_PROMPTS: Record<
  string,
  { label: string; key: keyof UserSettings; placeholder: string }
> = {
  generate: {
    label: 'Draft Generation',
    key: 'aiPromptGenerate' as keyof UserSettings,
    placeholder:
      'You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code...'
  },
  fix: {
    label: 'Fix Grammar',
    key: 'aiPromptFix' as keyof UserSettings,
    placeholder:
      'Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.'
  },
  academic: {
    label: 'Academic Rewrite',
    key: 'aiPromptAcademic' as keyof UserSettings,
    placeholder:
      'Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.'
  },
  summarize: {
    label: 'Summarize',
    key: 'aiPromptSummarize' as keyof UserSettings,
    placeholder: 'Summarize the following text briefly. Return ONLY the summary.'
  },
  longer: {
    label: 'Make Longer',
    key: 'aiPromptLonger' as keyof UserSettings,
    placeholder:
      'Paraphrase the following text to be longer and more detailed, expanding on the key points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
  },
  shorter: {
    label: 'Make Shorter',
    key: 'aiPromptShorter' as keyof UserSettings,
    placeholder:
      'Paraphrase the following text to be shorter and more concise, keeping only the essential points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
  }
}

const AiPromptsEditor = () => {
  const settings = useAppStore((state) => state.settings)
  const updateSetting = useAppStore((state) => state.updateSetting)
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
        <MessageSquare size={16} className="settings-icon-secondary" />
        <h3 className="settings-heading settings-no-mb">Custom Prompts</h3>
      </div>
      <p className="settings-subheading">
        Customize the system prompts used for each AI action. Leave empty to use the built-in
        defaults.
      </p>
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
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{prompt.label}</span>
                  {isCustom && <span className="settings-configured-tag">Custom</span>}
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
                      title="Reset to default"
                    >
                      <RotateCcw size={13} />
                      Reset
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

export const AiTab = () => {
  const settings = useAppStore((state) => state.settings)
  const updateSetting = useAppStore((state) => state.updateSetting)

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  const provider = settings.aiProvider
  const providerInfo = provider ? AI_PROVIDER_INFO[provider] : null
  const currentModels = provider ? (AI_MODEL_OPTIONS[provider] ?? []) : []

  // Check if API key exists for current provider
  useEffect(() => {
    if (provider) {
      window.api.aiHasApiKey(provider).then(setHasKey)
    } else {
      setHasKey(false)
    }
    setApiKey('')
    setShowKey(false)
    setKeySaved(false)
  }, [provider])

  const handleSaveKey = async () => {
    if (!provider || !apiKey.trim()) return
    await window.api.aiSaveApiKey(provider, apiKey.trim())
    setHasKey(true)
    setKeySaved(true)
    setApiKey('')
    setShowKey(false)
    setTimeout(() => setKeySaved(false), 2000)
  }

  return (
    <div className="settings-tab-content settings-animate-in">
      {/* Master toggle */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Bot size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">AI Assistant</h3>
              <Toggle
                checked={!!settings.aiEnabled}
                onChange={(checked) => updateSetting('aiEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">
              Generate LaTeX from notes, fix grammar, rewrite academically, and paraphrase text.
              Bring your own API key from any supported provider.
            </p>
          </div>
        </div>
      </div>

      {settings.aiEnabled && (
        <>
          {/* Provider selection */}
          <hr className="settings-divider" />
          <div>
            <h3 className="settings-heading">Provider</h3>
            <p className="settings-subheading">
              Choose which AI service to use for text generation.
            </p>
            <div className="settings-theme-grid settings-field-mt-sm">
              {(['openai', 'anthropic', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    updateSetting('aiProvider', p)
                    updateSetting('aiModel', '')
                  }}
                  className={`settings-theme-card${provider === p ? ' selected' : ''}`}
                >
                  <span className="settings-theme-card-label">{AI_PROVIDER_INFO[p].label}</span>
                  {provider === p && (
                    <div className="settings-theme-card-check">
                      <Check size={16} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Model + API Key -- only shown when provider is selected */}
          {provider && providerInfo && (
            <>
              <hr className="settings-divider" />

              {/* Model */}
              <div>
                <h3 className="settings-heading">Model</h3>
                <p className="settings-subheading">
                  Select which model to use. Leave on Default for the recommended option.
                </p>
                <div className="settings-field-group settings-field-mt-sm">
                  <select
                    value={settings.aiModel}
                    onChange={(e) => updateSetting('aiModel', e.target.value)}
                    className="settings-select"
                  >
                    <option value="">Default</option>
                    {currentModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <hr className="settings-divider" />

              {/* API Key */}
              <div>
                <div className="settings-flex-row-start">
                  <Key size={16} className="settings-icon-secondary" />
                  <h3 className="settings-heading settings-no-mb">API Key</h3>
                  {hasKey && !keySaved && (
                    <span className="settings-configured-tag">Configured</span>
                  )}
                  {keySaved && (
                    <span className="settings-configured-tag settings-tag-saved">Saved</span>
                  )}
                </div>
                <p className="settings-subheading">
                  Enter your {providerInfo.label} API key. Keys are stored locally and never shared.{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.api.openExternal(providerInfo.keyUrl)
                    }}
                    className="settings-accent-link"
                  >
                    Get a key
                  </a>
                </p>
                <div className="settings-key-row settings-field-mt-sm">
                  <div className="settings-key-input-wrapper">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={hasKey ? 'Enter new key to replace...' : providerInfo.keyHint}
                      className="settings-input settings-input-pr"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveKey()
                      }}
                    />
                    <button
                      className="settings-key-toggle-btn"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    className="primary-button settings-nowrap"
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim()}
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Thinking / Reasoning */}
          <hr className="settings-divider" />
          <div>
            <div className="settings-flex-row-start">
              <Brain size={16} className="settings-icon-secondary" />
              <h3 className="settings-heading settings-no-mb">Thinking / Reasoning</h3>
            </div>
            <p className="settings-subheading">
              Enable extended thinking for deeper reasoning. Supported on Gemini 2.5, Claude
              Sonnet/Opus, and OpenAI o-series models.
            </p>
            <div className="settings-column-group">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Enable Thinking</div>
                  <div className="settings-row-description">
                    Let the model reason step-by-step before answering
                  </div>
                </div>
                <Toggle
                  checked={!!settings.aiThinkingEnabled}
                  onChange={(checked) => updateSetting('aiThinkingEnabled', checked)}
                />
              </div>
              {settings.aiThinkingEnabled && (
                <div className="settings-thinking-sub">
                  <label className="settings-label">Thinking Budget (tokens)</label>
                  <div className="settings-thinking-budget-row">
                    <select
                      value={settings.aiThinkingBudget || 0}
                      onChange={(e) => updateSetting('aiThinkingBudget', parseInt(e.target.value))}
                      className="settings-select settings-select-wide"
                    >
                      <option value={0}>Default (provider decides)</option>
                      <option value={4096}>Light (4K tokens)</option>
                      <option value={8192}>Medium (8K tokens)</option>
                      <option value={16384}>Deep (16K tokens)</option>
                      <option value={32768}>Maximum (32K tokens)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Custom Prompts */}
          <hr className="settings-divider" />
          <AiPromptsEditor />
        </>
      )}
    </div>
  )
}
