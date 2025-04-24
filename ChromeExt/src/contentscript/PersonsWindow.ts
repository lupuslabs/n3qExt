import { BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { ContentMessage, ContentOpenPersonsWindowMessage, ContentSetGuiModeMessage } from '../lib/ContentMessage'
import { Config } from '../lib/Config'
import { BackpackWindow } from './BackpackWindow'

export class PersonsWindow extends BackpackWindow
{
    protected initWindowSettings(): void {
        super.initWindowSettings()
        this.windowSettingsId = 'Contacts'
        this.windowCssClasses.push('contacts')
        this.titleText = 'Contacts'
        this.titleTextId = 'Menu.Persons'
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
}
