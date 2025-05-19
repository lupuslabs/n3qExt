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
import { ItemProperties } from '../lib/ItemProperties'

type MemoryState = {
    themes: Theme[]
}

const stateStorageKey = 'Themes';

export class BackgroundThemeManager
{
    private readonly app: BackgroundApp

    private readonly themes: Map<string,Theme> = new Map()
    private lastExtensionsUpdate: Date = new Date()

    private backgroundStopHandler = () => this.onBackgroundStop()
    private tabContentReadyHandler = (tab: BackgroundBrowserTab) => this.onContentReady(tab)
    private backpackUpdateHandler = () => this.onBackpackUpdate()
    private isStopped: boolean = false

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.app.getBackgroundStopListeners().addListener(this.backgroundStopHandler)
        this.init().then(() => {})
    }

    private isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('themes.enabled'))
    }

    public maintain(): void
    {
        if (this.isStopped) {
            return
        }
        const now = new Date()
        const updateIntervalSecs = as.Float(Config.get('themes.updateIntervalSec'), 10)
        if (now.getTime() - this.lastExtensionsUpdate.getTime() > 1e3 * updateIntervalSecs) {
            this.lastExtensionsUpdate = now
            iter(this.themes.values())
                .filter(theme => theme.sourceType === 'extension')
                .map(({sourceId}) => sourceId)
                .toSet()
                .forEach(extensionId => this.updateExtensionThemes(extensionId))
        }
    }

    public onSetThemeStateFromContent(message: unknown): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
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
        if (this.isStopped || !this.isFeatureEnabled()) {
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
        if (this.isStopped || !this.isFeatureEnabled()) {
            return true
        }
        const themes = message['themes'] ?? null
        if (!is.array(themes, ExtensionMessage.isExtensionTheme)) {
            const msg = 'Invalid or missing message.themes in message!'
            this.logError(msg, { extensionId, message })
            this.onThemes('extension', extensionId, [])
            return new Error(msg)
        }
        this.onThemes('extension', extensionId, themes)
        return true
    }

    public onThemesFromUser(message: unknown): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        const themes = message['themes'] ?? null
        if (!is.array(themes, ExtensionMessage.isExtensionTheme)) {
            const msg = 'Invalid or missing message.themes in message!'
            this.logError(msg, { message })
            return
        }
        this.onThemes('user', '', themes)
    }

    private onThemes(sourceType: ThemeSourceType, sourceId: string, themes: {id?: string, name: string, isEnabled?: null|boolean, css: string}[]): void
    {
        if (!this.isFeatureEnabled()) {
            return
        }
        let isChanged = false

        // Add/update given themes of source:
        const idsToKeep = new Set()
        let orderIndex = 0
        for (const theme of themes) {
            const id = `${sourceType}:${sourceId}:${theme.id}:${theme.name}`
            idsToKeep.add(id)
            orderIndex++
            if (this.onTheme(id, theme.name, orderIndex, sourceType, sourceId, theme.isEnabled, theme.css)) {
                isChanged = true
            }
        }

        // Delete missing themes of source:
        const themesToDelete = iter(this.themes.values())
            .filter(theme => theme.sourceType === sourceType && theme.sourceId === sourceId && !idsToKeep.has(theme.id))
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
        if (oldTheme && oldTheme.name === name && oldTheme.orderIndex === orderIndex && oldTheme.css === css && (is.nil(isEnabled) || isEnabled === oldTheme?.isEnabled)) {
            return false
        }
        if (!name.length) {
            this.themes.delete(id)
            return true
        }
        isEnabled = isEnabled ?? oldTheme?.isEnabled ?? true
        const newTheme: Theme = { id, name, orderIndex, sourceType, sourceId, css, isEnabled }
        this.themes.set(id, newTheme)
        return true
    }

    private onBackgroundStop(): void
    {
        if (this.isStopped) {
            return
        }
        this.isStopped = true
        this.app.getBackgroundStopListeners().removeListener(this.backgroundStopHandler)
        this.app.getBrowserTabs().tabContentReadyListeners.removeListener(this.tabContentReadyHandler)
        this.app.getBackpack().backpackUpdateListeners.removeListener(this.backpackUpdateHandler)
    }

    private onBackpackUpdate(): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        const itemThemes = iter(this.app.getBackpack().getItems().values())
            .map(item => ItemProperties.getThemeData(item))
            .filter(theme => !!theme)
            .toArray()
            .sort((themeA, themeB) => {
                if (themeA.y !== themeB.y) {
                    return themeA.y - themeB.y
                }
                if (themeA.x !== themeB.x) {
                    return themeA.x - themeB.x
                }
                if (themeA.name !== themeB.name) {
                    return themeA.name < themeB.name ? -1 : 1
                }
                return themeA.id < themeB.id ? -1 : 1
            })
        this.onThemes('item', '', itemThemes)
    }

    private updateExtensionThemes(extensionId: string): void
    {
        const themesRequestMessage = { type: ExtensionMessage.type_ExtensionThemesRequest }
        chrome.runtime.sendMessage(extensionId, themesRequestMessage)
            .then(response => this.onThemesFromExtension(extensionId, response))
            .catch(_error => this.onThemes('extension', extensionId, []))
    }

    private onContentReady(tab: BackgroundBrowserTab): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        tab.sendMessage(this.makeContentThemesMessage())
    }

    private sendThemesToAllTabs(): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
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
        if (this.isStopped) {
            return
        }
        this.themes.clear()
        const oldState: unknown = await Memory.getLocal(stateStorageKey)
        if (this.isStopped) {
            return
        }
        const themes: unknown = oldState?.['themes'] ?? null
        if (is.array(themes)) {
            iter(themes).filterType(isTheme).forEach(theme => this.themes.set(theme.id, theme))
        }
        this.saveState()
        this.app.getBrowserTabs().tabContentReadyListeners.addListener(this.tabContentReadyHandler)
        this.app.getBackpack().backpackUpdateListeners.addListener(this.backpackUpdateHandler)
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
