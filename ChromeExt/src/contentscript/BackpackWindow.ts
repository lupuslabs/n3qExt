import * as $ from 'jquery'
import log = require('loglevel')
import { is } from '../lib/is'
import { as } from '../lib/as'
import { Iter } from '../lib/Iter'
import { ErrorWithData, Utils } from '../lib/Utils'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { ContentApp } from './ContentApp'
import { Window, WindowOptions } from './Window'
import { BackpackItem as BackpackItem } from './BackpackItem'
import { ItemException } from '../lib/ItemException'
import { FreeSpace } from './FreeSpace'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { ItemFilters } from '../lib/ItemFilters'
import ItemFilter = ItemFilters.ItemFilter
import parseItemFilters = ItemFilters.parseItemFilters

type ItemFilterRecord = {
    filter: ItemFilter,
    buttonIsVisible: boolean,
    matchingItemIds: Set<string>,
}

export class BackpackWindow extends Window<WindowOptions>
{
    private paneElem: HTMLElement
    private filterButtonsBarElem: HTMLElement
    private visibleFilterButtonsCount: number = 0
    private items: { [id: string]: BackpackItem } = {}
    private itemFilters: Map<string,ItemFilterRecord> = new Map()
    private currentItemFilterId: null|string = null

    public constructor(app: ContentApp)
    {
        super(app)
        this.windowName = 'Backpack'
        this.isResizable = true
        this.persistGeometry = true
    }

    public getPane() {
        return this.paneElem
    }

    public getItem(itemId: string) {
        return this.items[itemId]
    }

    public getItemsAsProperties(): ItemProperties[]
    {
        return Object.values(this.items).map(item => item.getProperties())
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom()
        this.windowCssClasses.push('n3q-backpackwindow')
        this.titleText = this.app.translateText('BackpackWindow.Inventory', 'Local Stuff')
        this.withButtonbar = true
        this.defaultWidth = 600
        this.defaultHeight = 400
        this.defaultBottom = 200
        this.defaultLeft = 50
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()

        this.paneElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-pane" data-translate="children"></div>')
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.paneElem)
        this.contentElem.append(this.paneElem)

        this.makeFilterButtonbar()
        BackgroundMessage.requestBackpackState().catch(ex => this.app.onError(ex))
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose()
        const ids = []
        for (let id in this.items) {
            ids.push(id)
        }
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i]
            let backpackItem = this.items[id]
            backpackItem.destroy()
            delete this.items[id]
        }
    }

    public getFreeCoordinate(): { x: number, y: number }
    {
        const width = $(this.paneElem).width()
        const height = $(this.paneElem).height()

        const rects: Array<{ left: number, top: number, right: number, bottom: number }> = []
        for (const id in this.items) {
            const itemElem = this.items[id].getElem()
            rects.push({ left: $(itemElem).position().left, top: $(itemElem).position().top, right: $(itemElem).position().left + $(itemElem).width(), bottom: $(itemElem).position().top + $(itemElem).height() })
        }

        rects.push({ left: width - 50, top: 0, right: width, bottom: 50 })

        const f = new FreeSpace(Math.max(10, Math.floor((width + height) / 2 / 64)), width, height, rects)
        return f.getFreeCoordinate(null)
        // return f.getFreeCoordinate(this.paneElem)
    }

    public onBackpackUpdate(itemsHide: ItemProperties[], itemsShowOrSet: ItemProperties[]): void
    {
        const isFilterToBeRestored = Object.values(this.items).length === 0
        itemsHide.forEach(item => this.onHideItem(item))
        itemsShowOrSet.forEach(item => this.onShowOrSetItem(item))
        if (isFilterToBeRestored) {
            this.restoreItemFilterIdFromMemory()
        }
    }

    private onShowOrSetItem(properties: ItemProperties): void
    {
        if (!this.paneElem) {
            return
        }
        const isInvisible = as.Bool(properties[Pid.IsInvisible], false)
        if (isInvisible) {
            const showInvisibleItems = Config.get('backpack.showInvisibleItems', false)
            if (!showInvisibleItems) {
                this.onHideItem(properties)
                return
            }
        }

        const itemId = properties[Pid.Id]
        let item = this.items[itemId]
        if (item) {
            item.setProperties(properties)
        } else {
            item = new BackpackItem(this.app, this, itemId, properties)
            this.items[itemId] = item
        }
        this.updateItemMatchesFilters(item)

        this.app.toFront(item.getElem(), ContentApp.LayerWindowContent)
    }

    private onHideItem(properties: ItemProperties): void
    {
        if (!this.paneElem) {
            return
        }
        const itemId = properties[Pid.Id]
        this.setItemNoFilterMatch(itemId)
        this.items[itemId]?.destroy()
        delete this.items[itemId]
    }

    public rezItem(itemId: string, room: string, x: number, destination: string): void
    {
        this.rezItemAsync(itemId, room, x, destination)
            .catch (ex => this.app.onError(ErrorWithData.ofError(ex, 'Caught error!', { itemId: itemId })))
    }

    private async rezItemAsync(itemId: string, room: string, x: number, destination: string): Promise<void>
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.rezItemAsync', itemId, 'to', room) }
        const props = await BackgroundMessage.getBackpackItemProperties(itemId)

        if (as.Bool(props[Pid.ClaimAspect])) {
            if (await this.app.getRoom().propsClaimYieldsToExistingClaim(props)) {
                throw new ItemException(ItemException.Fact.ClaimFailed, ItemException.Reason.ItemMustBeStronger, this.app.getRoom()?.getPageClaimItem()?.getDisplayName())
            }
        }

        if (as.Bool(props[Pid.AutorezAspect])) {
            await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.AutorezIsActive]: 'true' }, [], { skipPresenceUpdate: true })
        }

        const moveInsteadOfRez = as.Bool(props[Pid.IsRezzed]) && props[Pid.RezzedLocation] === room
        if (moveInsteadOfRez) {
            await this.app.moveRezzedItemAsync(itemId, x)
        } else {
            if (as.Bool(props[Pid.IsRezzed])) {
                await this.app.derezItemAsync(itemId)
            }
            await BackgroundMessage.rezBackpackItem(itemId, room, x, destination, {})
        }
    }

    // Filter-related helpers

    private makeFilterButtonbar(): void
    {
        this.filterButtonsBarElem?.remove()
        this.filterButtonsBarElem = null
        this.parseFilters()

        this.filterButtonsBarElem = DomUtils.elemOfHtml('<div class="filters" data-translate="children"></div>')
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.filterButtonsBarElem)
        this.buttonbarElem.append(this.filterButtonsBarElem)

        const language = this.app.getLanguage()
        for (const { filter, matchingItemIds } of this.itemFilters.values()) {
            const filterId = filter.getId()
            const stateElemId = this.makeFilterStateElemId(filterId)

            const stateElem = DomUtils.elemOfHtml(`<input type="radio" id="${stateElemId}" name="n3q-backpack-filter" value="${filterId}"/>`)
            this.filterButtonsBarElem.append(stateElem)
            stateElem.addEventListener('change', ev => this.userSelectFilter(filterId))

            const buttonElemId = this.makeFilterButtonElemId(filterId)
            const buttonElem = DomUtils.elemOfHtml(`<label id="${buttonElemId}" for="${stateElemId}"></label>`)
            buttonElem.setAttribute('title', filter.getHelpText(language))
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, buttonElem)
            this.filterButtonsBarElem.append(buttonElem)

            buttonElem.append(this.app.makeIcon(filter.getIconUrl()))

            const labelTextElem = DomUtils.elemOfHtml(`<span class="text"></span>`)
            labelTextElem.innerText = filter.getLabelText(language)
            buttonElem.append(labelTextElem)

            this.updateFilterButtonVisibility(filterId)
        }
        this.selectFilter(this.currentItemFilterId)
    }

    private updateFilterButtonVisibility(filterId: string): void
    {
        const filterRecord = this.itemFilters.get(filterId)
        const newIsVisible = filterId === Iter.next(this.itemFilters.keys()) || filterRecord.matchingItemIds.size !== 0
        if (!filterRecord || newIsVisible === filterRecord.buttonIsVisible) {
            return
        }
        const buttonElemId = this.makeFilterButtonElemId(filterId)
        const buttonElem = this.filterButtonsBarElem?.querySelector(`#${buttonElemId}`)
        if (!buttonElem) {
            return
        }
        DomUtils.setElemClassPresent(buttonElem, 'hidden', !newIsVisible)
        filterRecord.buttonIsVisible = newIsVisible
        this.visibleFilterButtonsCount += newIsVisible ? 1 : -1
        this.setButtonBarVisibleState(this.visibleFilterButtonsCount > 1)
    }

    private setFilterButtonPressed(filterId: string): void
    {
        const stateElemId = this.makeFilterStateElemId(filterId)
        const stateElem: null|HTMLInputElement = this.filterButtonsBarElem?.querySelector(`#${stateElemId}`)
        if (!stateElem) {
            return
        }
        stateElem.checked = true
    }

    private makeFilterElemId(filterId: string): string
    {
        return `n3q-backpack-${this.windowId}-filter-${filterId}`
    }

    private makeFilterButtonElemId(filterId: string): string
    {
        return `${this.makeFilterElemId(filterId)}-button`
    }

    private makeFilterStateElemId(filterId: string): string
    {
        return `${this.makeFilterElemId(filterId)}-state`
    }

    private getFilterIdToSelect(preferredFilterId: null|string): null|string
    {
        let filterId = preferredFilterId
        let newFilterRecord = this.itemFilters.get(filterId)
        if (newFilterRecord?.buttonIsVisible) {
            return filterId
        }
        filterId = this.currentItemFilterId
        newFilterRecord = this.itemFilters.get(filterId)
        if (newFilterRecord?.buttonIsVisible) {
            return filterId
        }
        filterId = Iter.next(this.itemFilters.keys())
        return filterId
    }

    private restoreItemFilterIdFromMemory(): void
    {
        Memory.getLocal(`window.${this.windowName}.currentItemFilterId`, this.currentItemFilterId)
            .then(filterId => this.selectFilter(filterId))
            .catch(error => this.app.onError(error))
    }

    private storeItemFilterIdInMemory(): void
    {
        Memory.setLocal(`window.${this.windowName}.currentItemFilterId`, this.currentItemFilterId)
            .catch(error => this.app.onError(error))
    }

    private userSelectFilter(filterId: null|string): void
    {
        this.selectFilter(filterId)
        this.storeItemFilterIdInMemory()
    }

    private selectFilter(filterId: null|string): void
    {
        const newFilterId = this.getFilterIdToSelect(filterId)
        if (newFilterId === this.currentItemFilterId) {
            return
        }
        this.currentItemFilterId = newFilterId
        this.setFilterButtonPressed(newFilterId)

        const itemIdsToShow = this.itemFilters.get(this.currentItemFilterId)?.matchingItemIds ?? null
        for (const item of Object.values(this.items)) {
            item.setFilteredStyle(itemIdsToShow?.has(item.getItemId()) ?? true)
        }
    }

    private updateItemMatchesFilters(item: BackpackItem): void
    {
        for (const [filterId, { filter, matchingItemIds }] of this.itemFilters.entries()) {
            const itemId = item.getItemId()
            if (filter.isMatchingItem(item.getProperties())) {
                matchingItemIds.add(itemId)
            } else {
                matchingItemIds.delete(itemId)
            }
            this.updateFilterButtonVisibility(filterId)
        }
        this.selectFilter(this.currentItemFilterId)
        item.setFilteredStyle(this.itemFilters.get(this.currentItemFilterId)?.matchingItemIds.has(item.getItemId()) ?? true)
    }

    private setItemNoFilterMatch(itemId: string): void
    {
        for (const [filterId, { matchingItemIds }] of this.itemFilters.entries()) {
            matchingItemIds.delete(itemId)
            this.updateFilterButtonVisibility(filterId)
        }
        this.selectFilter(this.currentItemFilterId)
    }

    private parseFilters(): void
    {
        let itemFilters: ItemFilter[]
        try {
            const itemfilterDefs = Config.get('backpack.filters')
            itemFilters = parseItemFilters(itemfilterDefs)
        } catch (error) {
            this.app.onError(error)
            return
        }

        this.itemFilters.clear()
        const items: [string, ItemProperties][] = Object.entries(this.items)
            .map(([itemId, item]) => [itemId, item.getProperties()])
        for (const filter of itemFilters) {
            const filterId = filter.getId()
            const matchingItemIds = new Set<string>()
            for (const [itemId, itemProps] of items) {
                if (filter.isMatchingItem(itemProps)) {
                    matchingItemIds.add(itemId)
                }
            }
            this.itemFilters.set(filterId, { filter, buttonIsVisible: true, matchingItemIds })
            this.visibleFilterButtonsCount++
            this.updateFilterButtonVisibility(filterId)
        }
    }

}
