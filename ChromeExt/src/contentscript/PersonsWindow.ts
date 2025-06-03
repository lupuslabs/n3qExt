import { DomUtils } from '../lib/DomUtils'
import { BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { ContentMessage, ContentOpenPersonsWindowMessage, ContentSetGuiModeMessage } from '../lib/ContentMessage'
import { Config } from '../lib/Config'
import { BackpackWindow } from './BackpackWindow'

export class PersonsWindow extends BackpackWindow
{
    private noItemsInfoElem: null|HTMLElement = null;

    protected initWindowSettings(): void {
        super.initWindowSettings()
        this.windowSettingsId = 'Contacts'
        this.windowCssClasses.push('personswindow')
        this.titleText = 'Contacts'
        this.titleTextId = 'PersonsWindow.title'
        this.singleFilterId = Config.get('personsWindow.itemFilterId', 'persons')
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupId = `Persons`
        const setGuiRequest: ContentSetGuiModeMessage = {
            type: ContentMessage.type_setGuiMode, mode: 'popupWindow',
        }
        const openPersonsRequest: ContentOpenPersonsWindowMessage = {
            type: ContentMessage.type_openPersonsWindow,
        }
        const startupRequests: BackgroundRequest[] = [setGuiRequest, openPersonsRequest]
        const startupRequestsArg = encodeURIComponent(JSON.stringify(startupRequests))
        const popupDefinition: PopupDefinition = {
            id: popupId,
            url: '/assets/popupApp.html?startupRequests=' + startupRequestsArg,
            top: Config.get('personsWindow.undockedTop', 100),
            left: Config.get('personsWindow.undockedLeft', 100),
            height: Config.get('personsWindow.undockedHeight', 400),
            width: Config.get('personsWindow.undockedWidth', 600),
            allowContentApp: true,
        }
        return popupDefinition
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
        this.noItemsInfoElem = DomUtils.elemOfHtml('<div class="no-items-info"></div>')
        const text = this.app.translateText('PersonsWindow.noItemsInfoText', 'You have no contacts yet')
        this.noItemsInfoElem.append(...DomUtils.paragraphNodesOfText(text))
        this.paneElem.append(this.noItemsInfoElem)
        this.updateNoItemsInfoVisibility()
    }

    protected onAfterItemVisibilityChange(): void
    {
        super.onAfterItemVisibilityChange()
        this.updateNoItemsInfoVisibility()
    }

    protected updateNoItemsInfoVisibility(): void
    {
        const hasItems = this.filters.getFullVisibilityItemIds().size !== 0
        DomUtils.setElemClassPresent(this.noItemsInfoElem, 'removed', hasItems)
    }

}
