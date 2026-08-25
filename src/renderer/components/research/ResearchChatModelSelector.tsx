import { useEffect, useMemo, useState } from 'react'
import type { AiProvider, ResearchChatExecution } from '../../../shared/types'
import { AI_MODEL_OPTIONS, AI_PROVIDER_INFO, AI_PROVIDER_ORDER } from '../../constants'

const PROVIDERS = AI_PROVIDER_ORDER

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  gemini: 'Gemini API',
  'claude-cli': AI_PROVIDER_INFO['claude-cli'].label,
  'codex-cli': AI_PROVIDER_INFO['codex-cli'].label
}

type ProviderAvailability = Record<AiProvider, boolean | null>

const INITIAL_AVAILABILITY: ProviderAvailability = {
  anthropic: null,
  openai: null,
  gemini: null,
  'claude-cli': null,
  'codex-cli': null
}

function optionValue(execution: ResearchChatExecution): string {
  return `${execution.provider}:${execution.model}`
}

function unavailableReason(provider: AiProvider): string {
  return provider.endsWith('-cli') ? 'Not installed' : 'API key required'
}

export function researchChatExecutionLabel(execution: ResearchChatExecution): string {
  const model =
    AI_MODEL_OPTIONS[execution.provider]?.find((option) => option.value === execution.model)
      ?.label ?? (execution.model === 'default' ? 'Default model' : execution.model)
  const provider =
    execution.provider === 'claude-cli'
      ? 'Claude Code'
      : execution.provider === 'codex-cli'
        ? 'Codex'
        : PROVIDER_LABELS[execution.provider].replace(' API', '')
  return `${provider} · ${model}`
}

interface ResearchChatModelSelectorProps {
  defaultProvider: AiProvider | ''
  defaultModel: string
  execution: ResearchChatExecution | null
  disabled?: boolean
  onChange: (execution: ResearchChatExecution | null) => void
}

export function ResearchChatModelSelector({
  defaultProvider,
  defaultModel,
  execution,
  disabled = false,
  onChange
}: ResearchChatModelSelectorProps) {
  const [availability, setAvailability] = useState<ProviderAvailability>(INITIAL_AVAILABILITY)

  useEffect(() => {
    let active = true
    void Promise.allSettled([
      window.api.aiHasApiKey('anthropic'),
      window.api.aiHasApiKey('openai'),
      window.api.aiHasApiKey('gemini'),
      window.api.aiCheckCli(),
      window.api.aiCheckCodexCli()
    ]).then((results) => {
      if (!active) return
      setAvailability({
        anthropic: results[0].status === 'fulfilled' && results[0].value,
        openai: results[1].status === 'fulfilled' && results[1].value,
        gemini: results[2].status === 'fulfilled' && results[2].value,
        'claude-cli': results[3].status === 'fulfilled' && results[3].value,
        'codex-cli': results[4].status === 'fulfilled' && results[4].value
      })
    })
    return () => {
      active = false
    }
  }, [])

  const choices = useMemo(
    () =>
      new Map(
        PROVIDERS.flatMap((provider) =>
          (AI_MODEL_OPTIONS[provider] ?? []).map((model) => {
            const candidate = { provider, model: model.value }
            return [optionValue(candidate), candidate] as const
          })
        )
      ),
    []
  )

  const defaultExecution = defaultProvider
    ? { provider: defaultProvider, model: defaultModel || 'default' }
    : null
  const defaultLabel = defaultExecution
    ? `Default · ${researchChatExecutionLabel(defaultExecution)}`
    : 'Default · Configure AI in Settings'

  return (
    <label className="research-chat-model-selector" title="Model for this conversation">
      <span className="sr-only">Research Chat model</span>
      <select
        aria-label="Research Chat model"
        disabled={disabled}
        value={execution ? optionValue(execution) : ''}
        onChange={(event) =>
          onChange(event.target.value ? (choices.get(event.target.value) ?? null) : null)
        }
      >
        <option value="">{defaultLabel}</option>
        {PROVIDERS.map((provider) => (
          <optgroup label={PROVIDER_LABELS[provider]} key={provider}>
            {(AI_MODEL_OPTIONS[provider] ?? []).map((model) => {
              const providerAvailable = availability[provider]
              const suffix =
                providerAvailable === false
                  ? ` — ${unavailableReason(provider)}`
                  : providerAvailable === null
                    ? ' — Checking…'
                    : ''
              return (
                <option
                  disabled={providerAvailable !== true}
                  key={`${provider}:${model.value}`}
                  value={optionValue({ provider, model: model.value })}
                >
                  {model.label}
                  {suffix}
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
