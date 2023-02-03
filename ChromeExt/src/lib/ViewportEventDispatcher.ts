import { App } from './App'

export class ViewportEventDispatcher {

    private readonly app: App;
    private readonly resizeListeners: Set<() => void> = new Set();
    private resizeHandler: null|((ev: UIEvent) => void) = null;

    public constructor(app: App) {
        this.app = app;
    }

    public stop(): void
    {
        this.resizeListeners.clear();
        this.maintain();
    }

    public addResizeListener(listener: () => void): void
    {
        this.resizeListeners.add(listener);
        this.maintain();
    }

    public removeResizeListener(listener: () => void): void
    {
        this.resizeListeners.delete(listener);
        this.maintain();
    }

    private maintain(): void
    {
        if (this.resizeHandler) {
            if (!this.resizeListeners.size) {
                window.removeEventListener('resize', this.resizeHandler, { capture: true });
                this.resizeHandler = null;
            }
        } else {
            if (this.resizeListeners.size) {
                this.resizeHandler = (ev: UIEvent) => this.onViewportResize(ev);
                window.addEventListener('resize', this.resizeHandler, { capture: true });
            }
        }
    }

    private onViewportResize(ev: UIEvent): void
    {
        this.resizeListeners.forEach(listener => {
            try {
                listener();
            } catch (error) {
                this.app.onError(error);
            }
        });
    }

}