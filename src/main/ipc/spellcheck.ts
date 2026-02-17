import { ipcMain } from 'electron'
import { checkWords, getSuggestions, initSpellChecker, addWord, setLanguage } from '../spellcheck'

export function registerSpellcheckHandlers(): void {
  ipcMain.handle('spell:init', async (_event, language: string) => {
    return initSpellChecker(language)
  })

  ipcMain.handle('spell:check', async (_event, words: string[]) => {
    return checkWords(words)
  })

  ipcMain.handle('spell:suggest', async (_event, word: string) => {
    return getSuggestions(word)
  })

  ipcMain.handle('spell:add-word', async (_event, word: string) => {
    return addWord(word)
  })

  ipcMain.handle('spell:set-language', async (_event, language: string) => {
    return setLanguage(language)
  })
}
