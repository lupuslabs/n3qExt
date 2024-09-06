import { Logger } from './Logger'

export abstract class App {

    public abstract onError(error: unknown): void

    public abstract getLogger(): Logger

}

export abstract class AppWithDom extends App {

    public abstract getShadowDomRoot(): DocumentOrShadowRoot

}
