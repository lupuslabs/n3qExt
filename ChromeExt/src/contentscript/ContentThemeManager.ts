import { is } from '../lib/is'
import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { DomUtils } from '../lib/DomUtils'
import { ContentApp } from './ContentApp'

import { ThemeUtils } from '../lib/ThemeUtils'
import Theme = ThemeUtils.Theme
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'

export class ContentThemeManager
{
    private readonly app: ContentApp
    private themes: Theme[] = []
    private enabledThemesCss: string = ''
    private enabledThemesElem: null|HTMLElement = null

    private readonly callableThemesChangedListeners: CallableEventListeners<string> = new CallableEventListeners('themesChanged')
    public readonly themesChangedListeners: EventListeners<string>

    public constructor(app: ContentApp)
    {
        this.app = app
        this.themesChangedListeners = this.callableThemesChangedListeners
    }

    public isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('themes.enabled'))
    }

    public getThemes(): ReadonlyArray<Theme>
    {
        return this.themes
    }

    public getEnabledThemesCss(): string
    {
        return this.enabledThemesCss
    }

    public stop(): void
    {
        this.themes = []
        this.update()
    }

    public onThemesFromBackground(message: unknown): void
    {
        const themes: unknown = message?.['themes'] ?? null
        if (this.isFeatureEnabled() && is.array(themes, ThemeUtils.isTheme)) {
            this.themes = [...themes]
        }
        this.update()
    }

    private update(): void
    {
        if (this.updateEnabledThemesCss()) {
            this.updateDisplay()
            this.callableThemesChangedListeners.callListeners(this.enabledThemesCss)
        }
    }

    private updateEnabledThemesCss(): boolean
    {
        const newThemesCss = this.themes
            .filter(theme => theme.isEnabled)
            .map(theme => `/* Theme ${theme.id} */\n\n${theme.css.trim()}`)
            .join('\n\n')
        if (newThemesCss === this.enabledThemesCss) {
            return false
        }
        this.enabledThemesCss = newThemesCss
        return true
    }

    private updateDisplay(): void
    {
        this.enabledThemesElem?.remove()
        this.enabledThemesElem = null
        if (this.enabledThemesCss.length === 0) {
            return
        }
        this.enabledThemesElem = DomUtils.elemOfHtml(`<style data-type="theme">\n${this.enabledThemesCss}\n</style>`)
        this.app.getShadowDomRoot().append(this.enabledThemesElem)
    }

}
