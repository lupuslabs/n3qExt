import { ContentApp } from './ContentApp'
import { WindowBase, WindowBaseOptions } from './WindowBase'

export type FullWindowOptions = WindowBaseOptions

export abstract class FullWindow<OptionsType extends FullWindowOptions> extends WindowBase<OptionsType>
{
    protected constructor(app: ContentApp) {
        super(app)
        this.style = 'window'
        this.withCloseButton = true
        this.withActionbar = false
        this.closeIsHide = false
        this.isMovable = true
        this.isResizable = true
        this.geometryInitstrategy = 'afterContent'
        this.defaultWidth = 'content'
        this.defaultHeight = 'content'
    }
}
