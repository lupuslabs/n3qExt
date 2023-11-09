import { ContentApp } from './ContentApp'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { ItemFilters } from '../lib/ItemFilters'
import ItemFilter = ItemFilters.ItemFilter
import parseItemFilters = ItemFilters.parseItemFilters

type ItemFilterRecord = {
    filter: ItemFilter,
    matchingItemIds: Set<string>,
}

export type FilterGuiVisibilityHandler = (isFilterGuiVisible: boolean) => void
export type ItemFilterVisibilityHandler = (itemId: string, isFilterVisible: boolean) => void

export class BackpackWindowItemFilters
{

    private readonly app: ContentApp
    private readonly windowName: string
    private readonly guiVisibilityHandler: FilterGuiVisibilityHandler
    private readonly itemVisibilityHandler: ItemFilterVisibilityHandler

    private readonly itemFilters: Map<string,ItemFilterRecord> = new Map()
    private readonly knownItemIds: Set<string> = new Set()
    private visibleItemIds: Set<string> = this.knownItemIds
    private readonly filterButtonsBarElem: HTMLElement
    private currentItemFilterId: null|string = null
    private currentItemFilterIdRestored: boolean = false

    public constructor(app: ContentApp, windowName: string, guiVisibilityHandler: FilterGuiVisibilityHandler, itemVisibilityHandler: ItemFilterVisibilityHandler)
    {
        this.app = app
        this.windowName = windowName
        this.guiVisibilityHandler = guiVisibilityHandler
        this.itemVisibilityHandler = itemVisibilityHandler
        this.parseFilters()
        this.filterButtonsBarElem = this.makeGui()
    }

    public getGuiElem(): HTMLElement
    {
        return this.filterButtonsBarElem
    }

    public getVisibleItemIdsView(): ReadonlySet<string>
    {
        return this.visibleItemIds;
    }

    public onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        let anyFilterButtonVisible = false
        const itemsHideIds = itemsHide.map(item => item[Pid.Id])
        for (const filterRecord of this.itemFilters.values()) {
            const buttonIsVisible = this.updateFilter(filterRecord, itemsHideIds, itemsShowOrSet)
            anyFilterButtonVisible = anyFilterButtonVisible || buttonIsVisible
        }
        itemsHideIds.forEach(itemId => this.knownItemIds.delete(itemId));
        itemsShowOrSet.forEach(item => this.knownItemIds.add(ItemProperties.getId(item)));
        (this.guiVisibilityHandler)(anyFilterButtonVisible)
        this.selectFilter(this.currentItemFilterId, true)

        if (anyFilterButtonVisible && !this.currentItemFilterIdRestored) {
            this.currentItemFilterIdRestored = true
            this.loadItemFilterIdFromMemory()
        }
    }

    private updateFilter(filterRecord: ItemFilterRecord, itemsHideIds: ReadonlyArray<string>, itemsShowOrSet: ReadonlyArray<ItemProperties>): boolean
    {
        const { filter, matchingItemIds } = filterRecord
        const filterId = filter.getId()
        itemsHideIds.forEach(itemId => matchingItemIds.delete(itemId))
        itemsShowOrSet.forEach(item => {
            const itemId = item[Pid.Id]
            const isMatching = filter.isMatchingItem(item)
            if (isMatching) {
                matchingItemIds.add(itemId)
            } else {
                matchingItemIds.delete(itemId)
            }
        })

        const buttonIsVisible = matchingItemIds.size !== 0
        const buttonElemId = this.makeFilterButtonElemId(filterId)
        const buttonElem = this.filterButtonsBarElem.querySelector(`#${buttonElemId}`)
        DomUtils.setElemClassPresent(buttonElem, 'hidden', !buttonIsVisible)

        return buttonIsVisible
    }

    private makeGui(): HTMLElement
    {
        const filterButtonsBarElem = DomUtils.elemOfHtml('<div class="filters" data-translate="children"></div>')
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, filterButtonsBarElem)

        const language = this.app.getLanguage()
        for (const { filter, matchingItemIds } of this.itemFilters.values()) {
            const filterId = filter.getId()
            const stateElemId = this.makeFilterStateElemId(filterId)

            const stateElem = DomUtils.elemOfHtml(`<input type="radio" id="${stateElemId}" name="n3q-backpack-filter" value="${filterId}"/>`)
            filterButtonsBarElem.append(stateElem)
            stateElem.addEventListener('change', ev => this.userSelectFilter(filterId))

            const buttonElemId = this.makeFilterButtonElemId(filterId)
            const buttonElem = DomUtils.elemOfHtml(`<label id="${buttonElemId}" for="${stateElemId}"></label>`)
            buttonElem.setAttribute('title', filter.getHelpText(language))
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, buttonElem)
            filterButtonsBarElem.append(buttonElem)

            buttonElem.append(this.app.makeIcon(filter.getIconUrl()))

            const labelTextElem = DomUtils.elemOfHtml(`<span class="text"></span>`)
            labelTextElem.innerText = filter.getLabelText(language)
            buttonElem.append(labelTextElem)
        }
        return filterButtonsBarElem
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
        return `n3q-backpack-${this.windowName}-filter-${filterId}`
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
        if ((newFilterRecord?.matchingItemIds.size ?? 0) !== 0) {
            return filterId
        }
        filterId = this.currentItemFilterId
        newFilterRecord = this.itemFilters.get(filterId)
        if ((newFilterRecord?.matchingItemIds.size ?? 0) !== 0) {
            return filterId
        }
        return null
    }

    private storeItemFilterIdInMemory(): void
    {
        Memory.setLocal(`window.${this.windowName}.currentItemFilterId`, this.currentItemFilterId)
            .catch(error => this.app.onError(error))
    }

    private loadItemFilterIdFromMemory(): void
    {
        Memory.getLocal(`window.${this.windowName}.currentItemFilterId`, this.currentItemFilterId)
            .then(filterId => this.selectFilter(filterId, false))
            .catch(error => this.app.onError(error))
    }

    private userSelectFilter(filterId: null|string): void
    {
        this.selectFilter(filterId, false)
        this.storeItemFilterIdInMemory()
    }

    private selectFilter(filterId: null|string, alwaysUpdateItems: boolean)
    {
        const newFilterId = this.getFilterIdToSelect(filterId)
        if (!alwaysUpdateItems && newFilterId === this.currentItemFilterId) {
            return
        }
        this.currentItemFilterId = newFilterId
        this.setFilterButtonPressed(newFilterId)

        const itemIdsToShow = this.itemFilters.get(this.currentItemFilterId)?.matchingItemIds ?? this.knownItemIds
        this.visibleItemIds = itemIdsToShow
        for (const itemId of this.knownItemIds.values()) {
            this.itemVisibilityHandler(itemId, itemIdsToShow.has(itemId))
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

        for (const filter of itemFilters) {
            const filterId = filter.getId()
            this.itemFilters.set(filterId, { filter, matchingItemIds: new Set() })
        }
    }

}
