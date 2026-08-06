export type EventListeners<EventDataType> = Readonly<{
    readonly addListener: (listener: (eventData: EventDataType) => void) => void
    readonly removeListener: (listener: (eventData: EventDataType) => void) => void
}>

export class CallableEventListeners<EventDataType>
{
    private readonly eventName: string
    private listeners: ((eventData: EventDataType) => void)[] = []

    public constructor(eventName: string)
    {
        this.eventName = eventName
    }

    public addListener(listener: (eventData: EventDataType) => void): void
    {
        if (this.listeners.indexOf(listener) !== -1) {
            return
        }
        this.listeners.push(listener)
    }

    public removeListener(listener: (eventData: EventDataType) => void): void
    {
        const index = this.listeners.indexOf(listener)
        if (index === -1) {
            return
        }
        this.listeners.splice(index, 1)
    }

    public callListeners(eventData: EventDataType): void
    {
        for (const handler of this.listeners) {
            try {
                handler(eventData)
            } catch (error) {
                console.log(`EventHandlers.callHandlers: ${this.eventName} handler failed!`, { eventData, handler, error })
            }
        }
    }

}

export type EventListeners1D<Id1Type,EventDataType> = Readonly<{
    readonly addListener: (id1: Id1Type, listener: (eventData: EventDataType) => void) => void
    readonly removeListener: (id1: Id1Type, listener: (eventData: EventDataType) => void) => void
}>

export class CallableEventListeners1D<Id1Type,EventDataType>
{
    private readonly eventName: string
    private listeners: Map<Id1Type,((eventData: EventDataType) => void)[]> = new Map()

    public constructor(eventName: string)
    {
        this.eventName = eventName
    }

    public addListener(id1: Id1Type, listener: (eventData: EventDataType) => void): void
    {
        let listeners = this.listeners.get(id1)
        if ((listeners?.indexOf(listener) ?? -1) !== -1) {
            return
        }
        if (!listeners) {
            listeners = []
            this.listeners.set(id1, listeners)
        }
        listeners.push(listener)
    }

    public removeListener(id1: Id1Type, listener: (eventData: EventDataType) => void): void
    {
        const listeners = this.listeners.get(id1) ?? []
        const index = listeners.indexOf(listener)
        if (index === -1) {
            return
        }
        listeners.splice(index, 1)
    }

    public callListeners(id1: Id1Type, eventData: EventDataType): void
    {
        const listeners = this.listeners.get(id1) ?? []
        for (const handler of listeners) {
            try {
                handler(eventData)
            } catch (error) {
                console.log(`EventHandlers.callHandlers: ${this.eventName} handler failed!`, { eventData, handler, error })
            }
        }
    }

}
