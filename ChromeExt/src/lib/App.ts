export abstract class App {

    public abstract onError(error: unknown): void;

}

export abstract class AppWithDom extends App {

    public abstract getShadowDomRoot(): DocumentOrShadowRoot;

}
