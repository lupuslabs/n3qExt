import { is } from '../lib/is'
import { iter } from '../lib/Iter'
import { ItemProperties, ItemOverlayDefinition } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'

export type ItemOverlaysState = {
    readonly overlaysContainer: HTMLElement,
    readonly overlayElems: ReadonlyMap<string,HTMLElement>
}

export class ItemOverlays
{
    private readonly app: ContentApp

    private overlays: ReadonlyMap<string,ItemOverlayDefinition> = new Map()

    public constructor(app: ContentApp)
    {
        this.app = app
    }

    public onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        itemsShowOrSet.forEach(item => this.parseOverlays(item))
    }

    public makeItemOverlaysStateOfContainer(containerElem: HTMLElement): ItemOverlaysState
    {
        return { overlaysContainer: containerElem, overlayElems: new Map() }
    }

    public updateItemOverlays(item: ItemProperties, oldOverlaysState: ItemOverlaysState): ItemOverlaysState
    {
        const overlaysContainer = oldOverlaysState.overlaysContainer
        const oldOverlayElems = oldOverlaysState.overlayElems
        const overlayElems: Map<string,HTMLElement> = new Map()
        const elemsList: HTMLElement[] = []
        for (const id of ItemProperties.getItemOverlayIds(item)) {
            const overlay = this.overlays.get(id) ?? null
            if (!overlay) {
                continue
            }
            let elem = oldOverlayElems.get(id) ?? this.makeOverlayElem(overlay)
            overlayElems.set(id, elem)
            elemsList.push(elem)
        }
        overlaysContainer.replaceChildren(...elemsList)
        return { overlaysContainer, overlayElems }
    }

    private makeOverlayElem({id, imageUrl, tooltipText}: ItemOverlayDefinition): HTMLElement
    {
        const [elem, _readyPromise] = this.app.makeIcon(imageUrl)
        elem.classList.add(`item-overlay-${id}`)
        const tooltipTextTranslated = tooltipText.get(this.app.getLanguage()) ?? iter(tooltipText.values()).getNext() ?? null
        if (!is.nil(tooltipTextTranslated)) {
            elem.setAttribute('title', tooltipTextTranslated)
        }
        return elem
    }

    private parseOverlays(item: ItemProperties): void
    {
        const definitions = ItemProperties.getItemOverlayDefinitions(item)
        if (!definitions) {
            return;
        }
        this.overlays = definitions
    }

}
