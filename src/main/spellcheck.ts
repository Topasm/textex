import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import nspell from 'nspell'

const isDev = !app.isPackaged

let spell: ReturnType<typeof nspell> | null = null
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
    const [affData, dicData] = await Promise.all([
      fs.readFile(paths.aff, 'utf-8'),
      fs.readFile(paths.dic, 'utf-8')
    ])
    spell = nspell(affData, dicData)
    initialized = true
    return { success: true }
  } catch {
    initialized = false
    return { success: false }
  }
}

export async function checkWords(words: string[]): Promise<string[]> {
  if (!initialized || !spell) return []
  return words.filter((w) => !spell!.correct(w))
}

export async function getSuggestions(word: string): Promise<string[]> {
  if (!initialized || !spell) return []
  return spell.suggest(word).slice(0, 5)
}

export async function addWord(word: string): Promise<{ success: boolean }> {
  if (spell) {
    spell.add(word)
  }
  return { success: true }
}

export async function setLanguage(language: string): Promise<{ success: boolean }> {
  return initSpellChecker(language)
}
