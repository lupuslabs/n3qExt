import log = require('loglevel')
import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory';
import { BackgroundApp } from './BackgroundApp';
import { BackgroundBrowserTab } from './BackgroundBrowserTabs'
import { ContentMessage, ContentThemesMessage } from '../lib/ContentMessage'
import { ExtensionMessage } from './ExtensionMessages'

import { ThemeUtils } from '../lib/ThemeUtils'
import ThemeSourceType = ThemeUtils.ThemeSourceType
import Theme = ThemeUtils.Theme
import isTheme = ThemeUtils.isTheme
import cmpTheme = ThemeUtils.cmpTheme

type MemoryState = {
    themes: Theme[]
}

const stateStorageKey = 'Themes';

export class BackgroundThemeManager
{
    private readonly app: BackgroundApp

    private readonly themes: Map<string,Theme> = new Map()

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.init().then(() => {})
    }

    private isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('themes.enabled'))
    }

    public onSetThemeStateFromContent(message: unknown): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        const themeId = as.String(message?.['themeId'])
        const isEnabled = as.Bool(message?.['isEnabled'])
        const theme = this.themes.get(themeId) ?? null
        if (!theme || theme.isEnabled === isEnabled) {
            return
        }
        theme.isEnabled = isEnabled
        this.saveState()
        this.sendThemesToAllTabs()
    }

    public onDeleteThemesFromContent(message: unknown): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        const themeIds = message?.['themeIds']
        if (!is.array(themeIds, is.string)) {
            return
        }
        let isChanged = false
        for (const themeId of themeIds) {
            if (this.themes.delete(themeId)) {
                isChanged = true
            }
        }
        if (isChanged) {
            this.saveState()
            this.sendThemesToAllTabs()
        }
    }

    public onThemesFromExtension(extensionId: string, message: unknown): true|Error
    {
        if (!this.isFeatureEnabled()) {
            return true
        }
        const themes = message['themes'] ?? null
        if (!is.array(themes, ExtensionMessage.isExtensionTheme)) {
            const msg = 'Invalid or missing message.themes in message!'
            this.logError(msg, { extensionId, message })
            return new Error(msg)
        }
        this.onThemes('extension', extensionId, themes)
        return true
    }

    public onThemesFromUser(message: unknown): void
    {
        const themes = message['themes'] ?? null
        if (!is.array(themes, ExtensionMessage.isExtensionTheme)) {
            const msg = 'Invalid or missing message.themes in message!'
            this.logError(msg, { message })
            return
        }
        this.onThemes('user', '', themes)
    }

    private onThemes(sourceType: ThemeSourceType, sourceId: string, themes: {name: string, isEnabled?: null|boolean, css: string}[]): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        themes = themes.filter(({ name }) => name.length !== 0)
        let isChanged = false

        // Add/update given themes of source:
        let orderIndex = 0
        for (const { name, isEnabled, css } of themes) {
            const id = `${sourceType}:${sourceId}:${name}`
            orderIndex++
            if (this.onTheme(id, name, orderIndex, sourceType, sourceId, isEnabled, css)) {
                isChanged = true
            }
        }

        // Delete missing themes of source:
        const namesToKeep = new Set(themes.map(({ name }) => name))
        const themesToDelete = iter(this.themes.values())
            .filter(theme => theme.sourceType === sourceType && theme.sourceId === sourceId && !namesToKeep.has(theme.name))
        for (const theme of themesToDelete) {
            this.themes.delete(theme.id)
            isChanged = true
        }

        if (isChanged) {
            this.saveState()
            this.sendThemesToAllTabs()
        }
    }

    private onTheme(id: string, name: string, orderIndex: number, sourceType: ThemeSourceType, sourceId: string, isEnabled: null|boolean, css: string): boolean
    {
        const oldTheme: null|Theme = this.themes.get(id) ?? null
        if (oldTheme && oldTheme.name === name && oldTheme.orderIndex === orderIndex && oldTheme.css === css) {
            return false
        }
        if (!name.length) {
            this.themes.delete(id)
            return true
        }
        isEnabled = isEnabled ?? oldTheme?.isEnabled ?? false
        const newTheme: Theme = { id, name, orderIndex, sourceType, sourceId, css, isEnabled }
        this.themes.set(id, newTheme)
        return true
    }

    private onContentReady(tab: BackgroundBrowserTab): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        tab.sendMessage(this.makeContentThemesMessage())
    }

    private sendThemesToAllTabs(): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        this.app.sendToAllTabs(this.makeContentThemesMessage())
    }

    private makeContentThemesMessage(): ContentThemesMessage
    {
        return { type: ContentMessage.type_themes, themes: [...this.themes.values()].sort(cmpTheme) }
    }

    private async init(): Promise<void>
    {
        this.themes.clear()
        const oldState: unknown = await Memory.getLocal(stateStorageKey, null)
        const themes: unknown = oldState?.['themes'] ?? null
        if (is.array(themes)) {
            iter(themes).filterType(isTheme).forEach(theme => this.themes.set(theme.id, theme))
        }
        this.saveState()
        this.app.getBrowserTabs().tabContentReadyListeners.addListener(tab => this.onContentReady(tab))
        this.sendThemesToAllTabs()
    }

    private saveState(): void
    {
        const state: MemoryState = { themes: [...this.themes.values()] }
        Memory.setLocal(stateStorageKey, state)
            .catch(error => this.logError('Saving state to local memory failed!', error, { state }))
    }

    private logError(msg: string, ...data: any[]): void {
        log.info(`Themes: ${msg}`, ...data)
    }

}
