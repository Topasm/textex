import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'

const isDev = !app.isPackaged

// Simple spell checker using word list approach
// In production you'd use nspell with proper dictionaries
let dictionary: Set<string> = new Set()
const customWords: Set<string> = new Set()
let initialized = false

function getDictionaryPath(language: string): { aff: string; dic: string } {
  const basePath = isDev
    ? path.join(__dirname, '../../resources/dictionaries')
    : path.join(process.resourcesPath!, 'dictionaries')

  return {
    aff: path.join(basePath, `${language}.aff`),
    dic: path.join(basePath, `${language}.dic`)
  }
}

export async function initSpellChecker(language: string): Promise<{ success: boolean }> {
  try {
    const paths = getDictionaryPath(language)
    const content = await fs.readFile(paths.dic, 'utf-8')
    const words = content
      .split('\n')
      .slice(1) // first line is count
      .map((w) => w.split('/')[0].trim().toLowerCase())
      .filter((w) => w.length > 0)
    dictionary = new Set(words)
    initialized = true
    return { success: true }
  } catch {
    // If dictionary not found, use an empty set - spell check will flag everything
    // In practice, dictionaries should be bundled
    initialized = false
    return { success: false }
  }
}

function isCorrect(word: string): boolean {
  if (!initialized) return true // don't flag if not initialized
  const lower = word.toLowerCase()
  return dictionary.has(lower) || customWords.has(lower)
}

export async function checkWords(words: string[]): Promise<string[]> {
  return words.filter((w) => !isCorrect(w))
}

export async function getSuggestions(word: string): Promise<string[]> {
  if (!initialized) return []
  const lower = word.toLowerCase()
  const suggestions: string[] = []

  // Simple edit distance 1 suggestions
  for (const dictWord of dictionary) {
    if (Math.abs(dictWord.length - lower.length) > 2) continue
    if (editDistance(lower, dictWord) <= 2) {
      suggestions.push(dictWord)
      if (suggestions.length >= 5) break
    }
  }
  return suggestions
}

function editDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

export async function addWord(word: string): Promise<{ success: boolean }> {
  customWords.add(word.toLowerCase())
  return { success: true }
}

export async function setLanguage(language: string): Promise<{ success: boolean }> {
  return initSpellChecker(language)
}
