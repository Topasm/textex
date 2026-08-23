export function showStartupError(root: HTMLElement, error: unknown): void {
  const surface = document.createElement('main')
  surface.className = 'startup-error'
  surface.setAttribute('role', 'alert')
  surface.setAttribute('aria-live', 'assertive')

  const card = document.createElement('div')
  card.className = 'startup-error__card'

  const title = document.createElement('h1')
  title.textContent = 'TextEx could not start'

  const detail = document.createElement('p')
  detail.textContent = error instanceof Error ? error.message : String(error)

  card.append(title, detail)
  surface.append(card)
  root.replaceChildren(surface)
}
