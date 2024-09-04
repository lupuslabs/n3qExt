import Loglevel = require('loglevel')
import { Utils } from './Utils'

export interface Logger {
    getSubLogger(nonErrorEnabledFlagName: string, messagePrefix: string): Logger

    logDebug(  message: string, data?: { [p:string]: unknown }, error?: Error): void
    logInfo(   message: string, data?: { [p:string]: unknown }, error?: Error): void
    logWarning(message: string, data?: { [p:string]: unknown }, error?: Error): void
    logError(  message: string, data?: { [p:string]: unknown }, error?: Error): void
}

export class LoglevelLogger implements Logger {
    private messagePrefix: string
    private nonErrorEnabledFlagName: string

    constructor(nonErrorEnabledFlagName: string, messagePrefix: string)
    {
        this.nonErrorEnabledFlagName = nonErrorEnabledFlagName

        messagePrefix = messagePrefix.trim()
        if (messagePrefix.length !== 0) {
            messagePrefix = messagePrefix + ' '
        }
        this.messagePrefix = messagePrefix
    }

    public getSubLogger(enabledFlagName: string, messagePrefix: string): Logger
    {
        return new LoglevelLogger(enabledFlagName, `${this.messagePrefix} ${messagePrefix}`)
    }

    public logDebug(message: string, data?: { [p:string]: unknown }, error?: Error): void
    {
        if (Utils.logChannel(this.nonErrorEnabledFlagName, true)) {
            Loglevel.debug(...this.prepareMessageParts(message, data, error))
        }
    }

    public logInfo(message: string, data?: { [p:string]: unknown }, error?: Error): void
    {
        if (Utils.logChannel(this.nonErrorEnabledFlagName, true)) {
            Loglevel.info(...this.prepareMessageParts(message, data, error))
        }
    }

    public logWarning(message: string, data?: { [p:string]: unknown }, error?: Error): void
    {
        Loglevel.warn(...this.prepareMessageParts(message, data, error))
    }

    public logError(message: string, data?: { [p:string]: unknown }, error?: Error): void
    {
        Loglevel.error(...this.prepareMessageParts(message, data, error))
    }

    private prepareMessageParts(message: string, data?: { [p:string]: unknown }, error?: Error): unknown[]
    {
        const parts: unknown[] = [this.messagePrefix + message]
        if (error) {
            parts.push(error)
        }
        if (data && Object.keys(data).length !== 0) {
            parts.push(data)
        }
        return parts
    }
}
