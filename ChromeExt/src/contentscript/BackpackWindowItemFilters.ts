import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { ItemProperties } from '../lib/ItemProperties'
import { ItemFilters } from '../lib/ItemFilters'
import { ContentApp } from './ContentApp'

import ItemFilter = ItemFilters.ItemFilter
import parseItemFilters = ItemFilters.parseItemFilters
import BasicItemFilter = ItemFilters.BasicItemFilter

type ItemFilterRecord = {
    readonly filter: ItemFilter,
    readonly matchingItemIds: Set<string>,
}

export type ItemVisibility = 'none'|'faded'|'full'

export type FilterGuiVisibilityHandler = (isFilterGuiVisible: boolean) => void
export type ItemVisibilityHandler = (itemId: string, itemVisibility: ItemVisibility) => void

export class BackpackWindowItemFilters
{

    private readonly app: ContentApp
    private readonly windowName: string
    private readonly currentFilterMemoryKey: string
    private readonly guiVisibilityHandler: FilterGuiVisibilityHandler
    private readonly itemVisibilityHandler: ItemVisibilityHandler

    private readonly singleFilterMode: boolean
    private readonly singleFilterId: string
    private readonly hideFilterTags: ReadonlyArray<string>

    private readonly itemFilters: Map<string,ItemFilterRecord> = new Map()
    private fadedVisibilityItemIds: Set<string> = new Set()
    private fullVisibilityItemIds: Set<string> = new Set()
    private readonly filtersGui: BackpackWindowItemFiltersGui

    private currentItemFilterId: null|string = null
    private currentItemFilterIdRestored: boolean = false

    private forcedFilterId: null|string = null

    public constructor(app: ContentApp, singleFilterId: null|string, hideFilterTags: ReadonlyArray<string>, windowName: string, guiVisibilityHandler: FilterGuiVisibilityHandler, itemVisibilityHandler: ItemVisibilityHandler)
    {
        this.app = app

        this.singleFilterMode = is.nonEmptyString(singleFilterId)
        this.singleFilterId = this.singleFilterMode ? singleFilterId : ''
        this.hideFilterTags = this.singleFilterMode ? [] : hideFilterTags

        this.windowName = windowName
        this.currentFilterMemoryKey = `window.${this.windowName}.currentItemFilterId`
        this.guiVisibilityHandler = guiVisibilityHandler
        this.itemVisibilityHandler = itemVisibilityHandler
        this.parseFilters()
        this.filtersGui = new BackpackWindowItemFiltersGui(app, windowName, this)
        this.filtersGui.updateFilters(new Set())
    }

    public getGuiElem(): HTMLElement
    {
        return this.filtersGui.getGuiElem()
    }

    public getFullVisibilityItemIds(): ReadonlySet<string>
    {
        return this.fullVisibilityItemIds
    }

    public showFilter(filterId: string): void
    {
        this.forcedFilterId = filterId
        this.selectFilter(filterId)
    }

    public onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        const itemsHideIds = itemsHide.map(item => ItemProperties.getId(item))
        const itemsShowOrSetPrefiltered = []
        for (const item of itemsShowOrSet) {
            if (ItemProperties.getIsVisibleInBackpack(item)) {
                itemsShowOrSetPrefiltered.push(item)
            } else {
                itemsHideIds.push(ItemProperties.getId(item))
            }
        }

        const nonEmptyFilters: Set<string> = new Set()
        for (const [filterId, {filter, matchingItemIds}] of this.itemFilters.entries()) {
            this.updateFilterMatchingItemIds(filter, matchingItemIds, itemsHideIds, itemsShowOrSetPrefiltered)
            if (matchingItemIds.size !== 0) {
                nonEmptyFilters.add(filterId)
            }
        }

        this.filtersGui.updateFilters(nonEmptyFilters)
        {(this.guiVisibilityHandler)(nonEmptyFilters.size > 1)}

        for (const itemId of itemsHideIds) {
            this.fadedVisibilityItemIds.delete(itemId)
            this.fullVisibilityItemIds.delete(itemId)
            this.itemVisibilityHandler(itemId, 'none')
        }
        this.selectFilter(this.currentItemFilterId)

        if (nonEmptyFilters.size !== 0 && !this.singleFilterMode && !this.currentItemFilterIdRestored) {
            this.currentItemFilterIdRestored = true
            Memory.getLocal(this.currentFilterMemoryKey)
                .then(filterId => this.selectFilter(as.String(filterId, this.currentItemFilterId)))
                .catch(error => this.app.onError(error))
        }
    }

    private updateFilterMatchingItemIds(filter: ItemFilter, matchingItemIds: Set<string>, itemsHideIds: ReadonlyArray<string>, itemsShowOrSet: ReadonlyArray<ItemProperties>)
    {
        itemsHideIds.forEach(itemId => matchingItemIds.delete(itemId))
        itemsShowOrSet.forEach(item => {
            const itemId = ItemProperties.getId(item)
            if (filter.isMatchingItem(item)) {
                matchingItemIds.add(itemId)
            } else {
                matchingItemIds.delete(itemId)
            }
        })
    }

    public getItemFilters(): ReadonlyArray<ItemFilter>
    {
        return iter(this.itemFilters.values()).map(record => record.filter).toArray()
    }

    private getFilterIdToSelect(preferredFilterId: null|string): null|string
    {
        if (this.singleFilterMode) {
            return this.singleFilterId
        }
        let filterId = this.forcedFilterId ?? preferredFilterId
        let newFilterRecord = this.itemFilters.get(filterId)
        if ((newFilterRecord?.matchingItemIds.size ?? 0) !== 0) {
            return filterId
        }
        filterId = this.currentItemFilterId
        newFilterRecord = this.itemFilters.get(filterId)
        if ((newFilterRecord?.matchingItemIds.size ?? 0) !== 0) {
            return filterId
        }
        filterId = iter(this.itemFilters.values())
            .filter(filter => filter.matchingItemIds.size !== 0)
            .getNext()?.filter.getId() ?? null
        return filterId
    }

    public onUserSelectFilter(filterId: null|string): void
    {
        this.forcedFilterId = null
        this.selectFilter(filterId)
        if (!this.singleFilterMode) {
            Memory.setLocal(this.currentFilterMemoryKey, this.currentItemFilterId)
                .catch(error => this.app.onError(error))
        }
    }

    private selectFilter(filterId: null|string)
    {
        const newFilterId = this.getFilterIdToSelect(filterId)
        this.currentItemFilterId = newFilterId
        this.filtersGui.showFilterSelected(newFilterId)

        const filterRecord = this.itemFilters.get(this.currentItemFilterId) ?? null
        const newFullItemIds = new Set(filterRecord?.matchingItemIds ?? [])
        const itemsBecomingFaded = new Set(this.fullVisibilityItemIds)
        const itemsBecomingFull: Set<string> = new Set()
        for (const itemId of newFullItemIds) {
            itemsBecomingFaded.delete(itemId)
            if (!this.fullVisibilityItemIds.has(itemId)) {
                itemsBecomingFull.add(itemId)
                this.fadedVisibilityItemIds.delete(itemId)
            }
        }
        for (const itemId of itemsBecomingFaded) {
            this.fadedVisibilityItemIds.add(itemId)
            this.itemVisibilityHandler(itemId, 'faded')
        }
        this.fullVisibilityItemIds = newFullItemIds
        for (const itemId of itemsBecomingFull) {
            this.itemVisibilityHandler(itemId, 'full')
        }
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
        if (this.singleFilterMode) {
            itemFilters = itemFilters.filter(filter => filter.getId() === this.singleFilterId)
        } else {
            if (itemFilters.length === 0) {
                itemFilters.push(new BasicItemFilter('defaultAll', new Set(), null, new Map([['en-US', 'All']]), new Map(), item => true))
            } else {
                itemFilters = itemFilters.filter(filter => !this.hideFilterTags.some(tag => filter.hasTag(tag)))
            }
        }
        for (const filter of itemFilters) {
            const filterId = filter.getId()
            this.itemFilters.set(filterId, { filter, matchingItemIds: new Set() })
        }
    }

}

class BackpackWindowItemFiltersGui
{
    private readonly app: ContentApp
    private readonly backpackFilters: BackpackWindowItemFilters
    private readonly windowName: string

    private readonly filterButtonsBarElem: HTMLElement
    private readonly filterButtonElems: Map<string,HTMLElement> = new Map()
    private readonly filterStateElems: Map<string,HTMLInputElement> = new Map()

    public constructor(app: ContentApp, windowName: string, backpackFilters: BackpackWindowItemFilters)
    {
        this.app = app
        this.windowName = windowName
        this.backpackFilters = backpackFilters
        this.filterButtonsBarElem = this.makeGui()
    }

    public getGuiElem(): HTMLElement
    {
        return this.filterButtonsBarElem
    }

    public showFilterSelected(filterId: string): void
    {
        const stateElem: null|HTMLInputElement = this.filterStateElems.get(filterId) ?? null
        if (stateElem) {
            stateElem.checked = true
        }
    }

    public updateFilters(visibleFilters: ReadonlySet<string>): void
    {
        for (const [filterId, buttonElem] of this.filterButtonElems.entries()) {
            const buttonIsVisible = visibleFilters.has(filterId)
            DomUtils.setElemClassPresent(buttonElem, 'removed', !buttonIsVisible)
        }
    }

    private makeGui(): HTMLElement
    {
        const filterButtonsBarElem = DomUtils.elemOfHtml('<div class="backpack-filters" data-translate="children"></div>')
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, filterButtonsBarElem)

        const language = this.app.getLanguage()
        const filterGuiId = `n3q-backpack-${this.windowName}-filter`
        for (const filter of this.backpackFilters.getItemFilters()) {
            const filterId = filter.getId()
            const filterelemId = `${filterGuiId}-${filterId}`
            const stateElemId = `${filterelemId}-state`

            const stateElem = <HTMLInputElement> DomUtils.elemOfHtml(`<input type="radio" class="removed" id="${stateElemId}" name="${filterGuiId}" value="${filterId}"/>`)
            stateElem.addEventListener('change', ev => this.backpackFilters.onUserSelectFilter(filterId))
            filterButtonsBarElem.append(stateElem)
            this.filterStateElems.set(filterId, stateElem)

            const buttonElemId = `${filterelemId}-button`
            const [buttonElem, buttonEventDispatcher] = this.app.uiHelper.makeButton({
                buttonTag: 'label',
                style: ['default', 'merged'],
                iconUrl: filter.getIconUrl(),
                iconAsCssMask: true,
                text: filter.getLabelText(language),
                title: filter.getHelpText(language),
                onClick: () => stateElem.click(),
            })
            buttonElem.setAttribute('id', buttonElemId)
            buttonElem.setAttribute('for', stateElemId)
            filterButtonsBarElem.append(buttonElem)
            this.filterButtonElems.set(filterId, buttonElem)
        }
        return filterButtonsBarElem
    }

}
