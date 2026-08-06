import { Environment } from './Environment';
import { Utils } from './Utils';

export type LogFun = (message: string, data?: { [p: string]: unknown }, error?: Error) => void;

export interface Logger {
    getSubLogger(nonErrorEnabledFlagName: string, messagePrefix: string): Logger;
    logDebug(message: string, data?: { [p: string]: unknown }, error?: Error): void;
    logInfo(message: string, data?: { [p: string]: unknown }, error?: Error): void;
    logWarning(message: string, data?: { [p: string]: unknown }, error?: Error): void;
    logError(message: string, data?: { [p: string]: unknown }, error?: Error): void;
}

const noopLogFun: LogFun = () => {};

export class ConsoleLogger implements Logger {

    private readonly nonErrorEnabledFlagName: string;
    private readonly messagePrefix: string;
    private readonly boundDebug: LogFun;
    private readonly boundInfo: LogFun;
    private readonly boundWarning: LogFun;
    private readonly boundError: LogFun;

    public constructor(nonErrorEnabledFlagName: string, messagePrefix: string) {
        this.nonErrorEnabledFlagName = nonErrorEnabledFlagName;
        this.messagePrefix = messagePrefix.trim();
        // Bound console methods make DevTools attribute each line to the caller's file:line.
        const prefixArgs: string[] = this.messagePrefix.length === 0 ? [] : [this.messagePrefix];
        this.boundDebug = console.debug.bind(console, ...prefixArgs);
        this.boundInfo = console.info.bind(console, ...prefixArgs);
        this.boundWarning = console.warn.bind(console, ...prefixArgs);
        // console.warn: prominent in DevTools but not collected into the browser's extensions page.
        this.boundError = console.warn.bind(console, ...prefixArgs);
    }

    public getSubLogger(nonErrorEnabledFlagName: string, messagePrefix: string): Logger {
        return new ConsoleLogger(nonErrorEnabledFlagName, `${this.messagePrefix} ${messagePrefix}`);
    }

    // The getters gate per call yet return bound functions, so the console call itself still
    // happens at the caller's line.

    public get logDebug(): LogFun {
        return this.isNonErrorEnabled() && Environment.isDevelopment() ? this.boundDebug : noopLogFun;
    }

    public get logInfo(): LogFun {
        return this.isNonErrorEnabled() ? this.boundInfo : noopLogFun;
    }

    public get logWarning(): LogFun {
        return this.boundWarning;
    }

    public get logError(): LogFun {
        return this.boundError;
    }

    private isNonErrorEnabled(): boolean {
        return Utils.logChannel(this.nonErrorEnabledFlagName, true);
    }

}
