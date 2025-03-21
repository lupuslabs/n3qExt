import { ContentApp } from './ContentApp'
import { WindowBase, WindowBaseOptions } from './WindowBase'

export type PopupWindowOptions = WindowBaseOptions

export abstract class PopupWindow<OptionsType extends PopupWindowOptions> extends WindowBase<OptionsType>
{
    protected constructor(app: ContentApp) {
        super(app)
        this.style = 'popup'
        this.withCloseButton = true
        this.withActionbar = false
        this.closeIsHide = false
        this.isMovable = true
        this.isResizable = false
        this.geometryInitstrategy = 'afterContent'
        this.defaultWidth = 'content'
        this.defaultHeight = 'content'
    }
}
