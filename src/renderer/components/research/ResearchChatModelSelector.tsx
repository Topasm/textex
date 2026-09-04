import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import type { AiProvider, ResearchChatExecution } from '../../../shared/types'
import { AI_MODEL_OPTIONS, AI_PROVIDER_INFO, AI_PROVIDER_ORDER } from '../../constants'
import { useAiProviderAvailabilityStore } from '../../store/useAiProviderAvailabilityStore'

const PROVIDERS = AI_PROVIDER_ORDER

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  gemini: 'Gemini API',
  'claude-cli': AI_PROVIDER_INFO['claude-cli'].label,
  'codex-cli': AI_PROVIDER_INFO['codex-cli'].label
}

function optionValue(execution: ResearchChatExecution): string {
  return `${execution.provider}:${execution.model}`
}

export function researchChatExecutionLabel(execution: ResearchChatExecution): string {
  const model =
    AI_MODEL_OPTIONS[execution.provider]?.find((option) => option.value === execution.model)
      ?.label ??
    (execution.model === 'default'
      ? i18n.t('researchPanel.modelSelector.defaultModel')
      : execution.model)
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
  const { t } = useTranslation()
  const availability = useAiProviderAvailabilityStore((state) => state.availability)
  const checked = useAiProviderAvailabilityStore((state) => state.checked)
  const checking = useAiProviderAvailabilityStore((state) => state.checking)
  const refresh = useAiProviderAvailabilityStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
    const refreshOnFocus = () => void refresh()
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [refresh])

  const enabledProviders = useMemo(
    () => PROVIDERS.filter((provider) => availability[provider] === true),
    [availability]
  )

  const choices = useMemo(
    () =>
      new Map(
        enabledProviders.flatMap((provider) =>
          (AI_MODEL_OPTIONS[provider] ?? []).map((model) => {
            const candidate = { provider, model: model.value }
            return [optionValue(candidate), candidate] as const
          })
        )
      ),
    [enabledProviders]
  )

  const defaultExecution = defaultProvider
    ? { provider: defaultProvider, model: defaultModel || 'default' }
    : null
  const defaultAvailable = Boolean(defaultProvider && availability[defaultProvider] === true)
  const defaultLabel =
    defaultExecution && defaultAvailable
      ? t('researchPanel.modelSelector.defaultWithModel', {
          model: researchChatExecutionLabel(defaultExecution)
        })
      : t('researchPanel.modelSelector.defaultUnconfigured')

  useEffect(() => {
    if (!checked || checking) return
    const currentAvailable = execution
      ? availability[execution.provider] === true
      : defaultAvailable
    if (currentAvailable) return
    const provider = enabledProviders[0]
    const model = provider ? AI_MODEL_OPTIONS[provider]?.[0]?.value : undefined
    if (provider && model) onChange({ provider, model })
  }, [availability, checked, checking, defaultAvailable, enabledProviders, execution, onChange])

  return (
    <label className="research-chat-model-selector" title={t('researchPanel.modelSelector.title')}>
      <span className="sr-only">{t('researchPanel.modelSelector.label')}</span>
      <select
        aria-label={t('researchPanel.modelSelector.label')}
        disabled={disabled || (checked && enabledProviders.length === 0)}
        value={execution ? optionValue(execution) : ''}
        onChange={(event) =>
          onChange(event.target.value ? (choices.get(event.target.value) ?? null) : null)
        }
      >
        {(!checked || defaultAvailable || enabledProviders.length === 0) && (
          <option value="">{defaultLabel}</option>
        )}
        {enabledProviders.map((provider) => (
          <optgroup label={PROVIDER_LABELS[provider]} key={provider}>
            {(AI_MODEL_OPTIONS[provider] ?? []).map((model) => (
              <option
                key={`${provider}:${model.value}`}
                value={optionValue({ provider, model: model.value })}
              >
                {model.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
