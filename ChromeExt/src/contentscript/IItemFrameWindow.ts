export interface IItemFrameWindow
{
    close(): void;
    setVisibility(visible: boolean): void;
    getVisibility(): boolean;
    isOpen(): boolean;
    toFront(layer?: number | string): void;
    getWindowElem(): null | HTMLElement;
    getIframeElem(): null | HTMLIFrameElement;
    toFrontFrame(layer?: undefined | number | string): void;
    setTitleText(titleText: string): void;
    moveToAnchor(): void;
    positionFrame(width: number, height: number, left: number, bottom: number, options?: any): void;
    setWindowStyle(style: string): void; // Deprecated. Todo: Replace use with a proper maximize method and positionFrame.
}
