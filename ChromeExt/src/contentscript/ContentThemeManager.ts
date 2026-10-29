import { is } from '../lib/is'
import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { ContentApp } from './ContentApp'

import { ThemeUtils } from '../lib/ThemeUtils'
import Theme = ThemeUtils.Theme
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'

export class ContentThemeManager
{
    private readonly app: ContentApp
    private themes: Theme[] = []
    private enabledThemesCssWithLayers: string = ''
    private enabledThemesCssForFrames: string = ''

    private readonly callableThemesChangedListeners: CallableEventListeners<void> = new CallableEventListeners('themesChanged')
    public readonly themesChangedListeners: EventListeners<void>

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

    public getEnabledThemesCssForFrames(): string
    {
        return this.enabledThemesCssForFrames
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
            this.app.display.setThemeCss(this.enabledThemesCssWithLayers)
            this.callableThemesChangedListeners.callListeners()
        }
    }

    private updateEnabledThemesCss(): boolean
    {
        const enabledThemes = this.themes.filter(theme => theme.isEnabled)
        const newThemesCssForFrames = enabledThemes
            .map(theme => `/* theme-${CSS.escape(theme.id)} */\n${theme.css.trim()}`)
            .join('\n\n')
        if (newThemesCssForFrames === this.enabledThemesCssForFrames) {
            return false
        }
        const newThemesCss = enabledThemes
            .map(theme => `@layer theme-${CSS.escape(theme.id)} {\n\n${theme.css.trim()}\n\n}`)
            .join('\n\n')
        this.enabledThemesCssWithLayers = newThemesCss
        this.enabledThemesCssForFrames = newThemesCssForFrames
        return true
    }
}
