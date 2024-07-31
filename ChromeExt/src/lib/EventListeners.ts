import log = require('loglevel');

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
        this.listeners = this.listeners.splice(index, 1)
    }

    public callListeners(eventData: EventDataType): void
    {
        for (const handler of this.listeners) {
            try {
                handler(eventData)
            } catch (error) {
                log.info(`EventHandlers.callHandlers: ${this.eventName} handler failed!`, { eventData, handler })
            }
        }
    }

}
