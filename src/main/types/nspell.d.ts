declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean
    suggest(word: string): string[]
    spell(word: string): { correct: boolean; forbidden: boolean; warn: boolean }
    add(word: string): this
    remove(word: string): this
    wordCharacters(): string | null
    dictionary(dic: string | Buffer): this
    personal(dic: string): this
  }

  interface NSpellConstructor {
    (aff: string | Buffer, dic: string | Buffer): NSpell
    new (aff: string | Buffer, dic: string | Buffer): NSpell
  }

  const nspell: NSpellConstructor
  export default nspell
}
