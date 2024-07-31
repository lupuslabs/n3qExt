import { CallableEventListeners, EventListeners } from '../lib/EventListeners'
import { ErrorWithData } from '../lib/Utils'
import { ContentApp } from './ContentApp'

export class TabContentData
{
    private readonly app: ContentApp
    private readonly data: Map<string,unknown> = new Map()
    private readonly callableInitListeners: CallableEventListeners<void> = new CallableEventListeners<void>('init')
    private readonly callableChangeListeners: CallableEventListeners<void> = new CallableEventListeners<void>('change')

    public readonly initListeners: EventListeners<void>
    public readonly changeListeners: EventListeners<void>

    private isInitialized: boolean = false

    public constructor(app: ContentApp)
    {
        this.app = app
        this.initListeners = this.callableInitListeners
        this.changeListeners = this.callableChangeListeners
    }

    public getIsInitialized(): boolean
    {
        return this.isInitialized
    }

    public get(key: string): unknown
    {
        return this.data.get(key)
    }

    public getAll(): ReadonlyMap<string,unknown>
    {
        return this.data
    }

    /**
     * To be called exactly once at ContentApp startup after retrieving cached tab data from background.
     */
    public initWithDataFromBackground(tabData: [string, unknown][]): void
    {
        if (this.isInitialized) {
            this.app.onError(new Error('TabContentData.initWithDataFromBackground called twice!'))
            return
        }
        tabData.forEach(([key, value]) => this.data.set(key, value))
        this.isInitialized = true
        this.callableInitListeners.callListeners()
    }

    public set(key: string, value: unknown): void
    {
        if (!this.isInitialized) {
            this.app.onError(new ErrorWithData('TabContentData.set called before initWithDataFromBackground!', { key, value }))
            return
        }
        this.data.set(key, value)
        this.callableChangeListeners.callListeners()
    }

}
