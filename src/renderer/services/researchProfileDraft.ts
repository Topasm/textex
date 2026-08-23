let researchProfileDraftDirty = false

export function setResearchProfileDraftDirty(dirty: boolean): void {
  researchProfileDraftDirty = dirty
}

export function hasUnsavedResearchProfileDraft(): boolean {
  return researchProfileDraftDirty
}

export function confirmResearchProfileDraftDiscard(): boolean {
  if (!researchProfileDraftDirty) return true
  return window.confirm('The research profile has unsaved changes. Discard them and continue?')
}

export function clearResearchProfileDraft(): void {
  researchProfileDraftDirty = false
}
