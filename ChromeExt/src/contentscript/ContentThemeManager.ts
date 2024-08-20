import { is } from '../lib/is'
import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { DomUtils } from '../lib/DomUtils'
import { ContentApp } from './ContentApp'

import { ThemeUtils } from '../lib/ThemeUtils'
import Theme = ThemeUtils.Theme

export class ContentThemeManager
{
    private readonly app: ContentApp
    private themes: Theme[] = []

    public constructor(app: ContentApp)
    {
        this.app = app
    }

    public isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('themes.enabled'))
    }

    public getThemes(): ReadonlyArray<Theme>
    {
        return this.themes
    }

    public onThemesFromBackground(message: unknown): void
    {
        const themes: unknown = message?.['themes'] ?? null
        if (!this.isFeatureEnabled() || !is.array(themes, ThemeUtils.isTheme)) {
            return
        }
        this.themes = [...themes]
        this.updateDisplay()
    }

    private updateDisplay(): void
    {
        const root = this.app.getShadowDomRoot()

        const styleElemsOld = root.querySelectorAll('style[data-isTheme]')
        styleElemsOld.forEach(styleElem => styleElem.remove())

        for (const { id, css} of this.themes.filter(theme => theme.isEnabled)) {
            const styleElem = DomUtils.elemOfHtml(`<style data-isTheme="1">\n${css}\n</style>`)
            root.appendChild(styleElem)
        }
    }

}
