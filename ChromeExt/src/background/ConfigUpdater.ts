import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundApp } from './BackgroundApp';

interface ConfigUpdaterCallabck { (): void }

export class ConfigUpdater
{
    private app: BackgroundApp;

    private updateCheckTimer: null|ReturnType<typeof setTimeout> = null;
    private lastUpdateTimeMs: number = 0;
    private onUpdate: ConfigUpdaterCallabck;

    public constructor(app: BackgroundApp)
    {
        this.app = app;
    }

    public start(onUpdate: ConfigUpdaterCallabck): void
    {
        this.onUpdate = onUpdate
        if (this.updateCheckTimer) {
            return
        }
        (async () => {
            const lastOnlineConfig = await Memory.getLocal('config.lastOnlineConfig', {})
            Config.setOnlineTree(lastOnlineConfig)
            this.callOnUpdate()
            this.updateLoop()
        })().catch(error => log.info(error))
    }

    public stop(): void
    {
        clearTimeout(this.updateCheckTimer)
        this.updateCheckTimer = null;
    }

    private callOnUpdate(): void
    {
        try {
            this.onUpdate()
        } catch (error) {
            log.info(error)
        }
    }

    private updateLoop(): void
    {
        const intervalSec = as.Int(Config.get('config.updateIntervalSec', 86331))
        const secsSinceUpdate = (Date.now() - this.lastUpdateTimeMs) / 1000
        if (secsSinceUpdate > intervalSec) {
            this.getUpdate()
        }
        const updateCheckIntervalSec = as.Float(Config.get('config.checkUpdateIntervalSec'), 61)
        this.updateCheckTimer = setTimeout(() => this.updateLoop(), updateCheckIntervalSec * 1000)
    }

    private getUpdate(): void
    {
        const configUrl = as.String(Config.get('config.serviceUrl'), 'https://webex.vulcan.weblin.com/Config');
        (async () => {
            if (Utils.logChannel('startup', true)) {
                log.info('ConfigUpdater.getUpdate', configUrl)
            }
            const data = await this.app.getUrlFetcher().fetchJson(configUrl)
            Config.setOnlineTree(data)
            this.lastUpdateTimeMs = Date.now()
            this.callOnUpdate()
            await Memory.setLocal('config.lastOnlineConfig', data)
        })().catch (error => log.info('ConfigUpdater.getUpdate', 'fetchConfig failed', configUrl, error))
    }

}
