import { ContentApp } from './ContentApp';

export class DebugUtils
{
    protected app: ContentApp;

    public constructor(app: ContentApp)
    {
        this.app = app;
    }

    public genericHandleAsyncError(fun: () => Promise<any>): void
    {
        try {
            fun().catch(error => this.app.onError(error));
        } catch (error) {
            this.app.onError(error);
        }
    }

    public onAppStartComplete(): void
    {
        // this.genericHandleAsyncError(() => this.someAsyncInitializer());
    }

}
