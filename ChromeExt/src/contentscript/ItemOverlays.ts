import { is } from '../lib/is'
import { as } from '../lib/as';
import { iter } from '../lib/Iter'
import { ItemProperties, ItemOverlayDefinition } from '../lib/ItemProperties'
import { Config } from '../lib/Config';
import { DomUtils } from '../lib/DomUtils'
import { ContentApp } from './ContentApp'

export type ItemOverlaysState = {
    readonly overlaysContainer: HTMLElement,
    readonly overlayElems: ReadonlyMap<string,HTMLElement>
}

type ProviderOverlayState = {
    readonly version: number,
    readonly overlayImageUrl: null|string,
    readonly iconElem: null|HTMLImageElement,
    readonly isIconLoadedPromise: null|Promise<boolean>,
}

const emptyProviderOverlayState: ProviderOverlayState = {
    version: 0,
    overlayImageUrl: null,
    iconElem: null,
    isIconLoadedPromise: null,
}

export class ItemOverlays
{
    private readonly app: ContentApp

    private overlays: ReadonlyMap<string,ItemOverlayDefinition> = new Map()

    private providerOverlays: Map<string,ProviderOverlayState> = new Map()

    public constructor(app: ContentApp)
    {
        this.app = app
        this.app.ownItems.backpackUpdateListeners.addListener(({itemsDeleted, itemsNewOrChanged}) => this.onBackpackUpdate(itemsDeleted, itemsNewOrChanged))
    }

    private onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
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
        const elem = this.app.uiHelper.makeIcon(imageUrl)//, true)
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

    /**
     * Returns oldElem if nothing changed and null if the provider has no overlay image.
     */
    public makeProviderOverlayElem(item: ItemProperties, oldElem: null|HTMLElement): null|HTMLElement
    {
        const providerId = ItemProperties.getProviderId(item);
        const overlayState = this.updateAndGetProviderOverlayState(providerId);
        const oldVersion = as.Int(oldElem?.getAttribute('data-version'), 0);
        if (oldVersion === overlayState.version) {
            return oldElem;
        }
        const { version, iconElem, isIconLoadedPromise } = overlayState;
        if (is.nil(iconElem) || is.nil(isIconLoadedPromise)) {
            return null;
        }
        const overlayElem = DomUtils.elemOfHtml(`<div class="item-provider-overlay" data-version="${version}"></div>`);
        const clonedIconPromise = isIconLoadedPromise.then(ok => {
            return ok ? <HTMLImageElement> iconElem.cloneNode(true) : null;
        });
        overlayElem.append(this.app.uiHelper.makeIconWrap(clonedIconPromise, false));
        return overlayElem;
    }

    public getProviderOverlayImageUrl(providerId: string): null|string
    {
        return as.NonEmptyStringOrNull(Config.get('itemProviders', {})?.[providerId]?.['itemOverlayImageUrl']);
    }

    private updateAndGetProviderOverlayState(providerId: string): ProviderOverlayState
    {
        const overlayImageUrl = this.getProviderOverlayImageUrl(providerId);
        const oldstate = this.providerOverlays.get(providerId) ?? emptyProviderOverlayState;
        if (oldstate.overlayImageUrl === overlayImageUrl) {
            this.providerOverlays.set(providerId, oldstate);
            return oldstate;
        }
        const version = oldstate.version + 1;
        if (is.nil(overlayImageUrl)) {
            const newState = { ...emptyProviderOverlayState, version };
            this.providerOverlays.set(providerId, newState);
            return newState;
        }
        const [iconElem, isIconLoadedPromise] = this.app.uiHelper.fetchImage(overlayImageUrl);
        const newState: ProviderOverlayState = { version, overlayImageUrl, iconElem, isIconLoadedPromise };
        this.providerOverlays.set(providerId, newState);
        return newState;
    }
}
