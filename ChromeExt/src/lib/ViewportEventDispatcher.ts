import { App } from './App'

export class ViewportEventDispatcher {

    private readonly app: App;
    private readonly visibleListeners: Set<() => void> = new Set();
    private readonly invisibleListeners: Set<() => void> = new Set();
    private readonly resizeListeners: Set<() => void> = new Set();

    public constructor(app: App) {
        this.app = app;
        window.addEventListener('visibilitychange', (ev: UIEvent) => this.onViewportVisibilityChange(ev), { capture: true });
        window.addEventListener('resize', (ev: UIEvent) => this.onViewportResize(ev), { capture: true });
    }

    public getVisibility(): boolean
    {
        return document.visibilityState !== 'hidden';
    }

    public stop(): void
    {
        this.visibleListeners.clear();
        this.invisibleListeners.clear();
        this.resizeListeners.clear();
    }

    public addVisibleListener(listener: () => void): void
    {
        this.visibleListeners.add(listener);
    }

    public removeVisibleListener(listener: () => void): void
    {
        this.visibleListeners.delete(listener);
    }

    public addInvisibleListener(listener: () => void): void
    {
        this.invisibleListeners.add(listener);
    }

    public removeInvisibleListener(listener: () => void): void
    {
        this.invisibleListeners.delete(listener);
    }

    public addResizeListener(listener: () => void): void
    {
        this.resizeListeners.add(listener);
    }

    public removeResizeListener(listener: () => void): void
    {
        this.resizeListeners.delete(listener);
    }

    private onViewportVisibilityChange(ev: UIEvent): void
    {
        if (this.getVisibility()) {
            this.visibleListeners.forEach(listener => {
                try {
                    listener();
                } catch (error) {
                    this.app.onError(error);
                }
            });
        } else {
            this.invisibleListeners.forEach(listener => {
                try {
                    listener();
                } catch (error) {
                    this.app.onError(error);
                }
            });
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