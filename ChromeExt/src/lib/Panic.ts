import log = require('loglevel');

interface PanicNowCallback { (): void }

export class Panic
{
    private static callback: PanicNowCallback;
    private static inCallback: boolean = false;
    static isOn: any;

    static onNow(callback: PanicNowCallback): void
    {
        Panic.callback = callback;
    }

    static now(): void
    {
        if (!Panic.inCallback) {
            this.isOn = true;
            if (Panic.callback != undefined) {
                Panic.inCallback = true;
                log.debug('I am not feeling well');
                Panic.callback();
                Panic.inCallback = false;
            }
        }
    }
}