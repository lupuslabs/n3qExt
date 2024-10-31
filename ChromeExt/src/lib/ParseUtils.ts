export namespace ParseUtils {

    export function escapeForRe(text: string): string
    {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    export type TokenDef = {
        name: string
        re?: RegExp
        onlyAfter?: string[] // Prevents matching if it wouldn't follow a token of any given name.
        onlyBefore?: string[] // Backtracks and excludes this token def for this index when next matched token is of any given name.
    }

    export type Token = {
        name: string
        startOffset: number
        parts: {[name: string]: string}
        tokenDef: TokenDef
    }

    export function tokenizeString(text: string, tokenDefs: TokenDef[], defaultName: string): Token[]
    {
        const tokens: Token[] = [];
        const allowedDefs: TokenDef[][] = []
        let nextOffset = 0
        while (nextOffset < text.length) {
            const tokenIndex = tokens.length
            const lastTokenIndex = tokenIndex - 1
            const lastToken = tokens[lastTokenIndex]

            // Get token at nextOffset:
            const lastTokenName = lastToken?.name ?? ''
            const defs = allowedDefs[tokenIndex] ?? tokenDefs.filter(def => !def.onlyAfter || def.onlyAfter.includes(lastTokenName))
            const result = getTokenOfString(text, nextOffset, defs, defaultName)
            if (result.nextOffset <= nextOffset) {
                throw new Error('nextOffset didn\'t advance!')
            }
            const token = result.token

            // If last token, check whether it may precede end of text:
            if (nextOffset >= text.length) {
                const onlyBefore = token.tokenDef.onlyBefore
                if (onlyBefore && !onlyBefore.includes('')) {
                    allowedDefs[tokenIndex] = defs.filter(def => def !== token.tokenDef)
                    continue
                }
            }

            // Check whether previous token may precede this token:
            const onlyBefore = lastToken?.tokenDef.onlyBefore ?? null
            if (onlyBefore && !onlyBefore.includes(token.name)) {
                tokens.pop()
                allowedDefs[lastTokenIndex] = allowedDefs[lastTokenIndex].filter(def => def !== lastToken.tokenDef)
                nextOffset = lastToken.startOffset
                continue
            }

            nextOffset = result.nextOffset
            tokens.push(token)
            allowedDefs[tokenIndex] = defs
            allowedDefs[tokenIndex + 1] = null
        }
        return tokens
    }

    export function getTokenOfString(text: string, startOffset: number, tokenDefs: TokenDef[], defaultName: string): {token: Token, nextOffset: number}
    {
        for (const tokenDef of tokenDefs) {
            const {name, re} = tokenDef
            if (!re) {
                continue
            }
            const match = re.exec(text.substring(startOffset))
            if (match?.index !== 0) {
                continue
            }
            const token = {name, startOffset, parts: match.groups ?? {text: match[0]}, tokenDef}
            const nextOffset = startOffset + match[0].length
            return {token, nextOffset}
        }
        const name = defaultName
        const parts = {text: text.substring(startOffset)}
        const token = {name, startOffset, parts, tokenDef: {name}}
        return {token, nextOffset: text.length}
    }

}
