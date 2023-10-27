import log = require('loglevel');
import { is } from '../lib/is'
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundApp } from './BackgroundApp';

interface ConfigUpdaterCallabck { (): void }

export class ConfigUpdater
{
    private app: BackgroundApp;

    private lastUpdateTimeMs: number = 0;
    private updateRunning: boolean = false;
    private onUpdate: ConfigUpdaterCallabck;

    public constructor(app: BackgroundApp)
    {
        this.app = app;
    }

    public start(onUpdate: ConfigUpdaterCallabck): void
    {
        this.onUpdate = onUpdate
        this.updateRunning = true;
        this.loadLastOnlineConfig()
            .catch(error => log.info('ConfigUpdater.start: loadLastOnlineConfig failed!', error))
            .then(() => {
                this.updateRunning = false;
                this.maintain()
            })
    }

    public stop(): void
    {
        // Nothing to do.
    }

    private async loadLastOnlineConfig(): Promise<void>
    {
        const lastOnlineConfigStr = await Memory.getLocal('config.lastOnlineConfig', null)
        if (!is.string(lastOnlineConfigStr)) {
            return
        }
        const lastOnlineConfig = JSON.parse(lastOnlineConfigStr)
        if (!is.object(lastOnlineConfig)) {
            return
        }
        if (Utils.logChannel('startup', true)) {
            log.info('ConfigUpdater.loadLastOnlineConfig: Loaded online config from cache.', { lastOnlineConfig })
        }
        Config.setOnlineTree(lastOnlineConfig)
        this.callOnUpdate()
    }

    private callOnUpdate(): void
    {
        try {
            this.onUpdate()
        } catch (error) {
            log.info(error)
        }
    }

    public maintain(): void
    {
        if (this.updateRunning) {
            return;
        }
        const intervalSec = as.Int(Config.get('config.updateIntervalSec', 86331))
        const secsSinceUpdate = (Date.now() - this.lastUpdateTimeMs) / 1000
        if (secsSinceUpdate > intervalSec) {
            this.getUpdate()
        }
    }

    private getUpdate(): void
    {
        this.updateRunning = true;
        const configUrl = as.String(Config.get('config.serviceUrl'), 'https://webex.vulcan.weblin.com/Config');
        if (Utils.logChannel('startup', true)) {
            log.info('ConfigUpdater.getUpdate', configUrl)
        }
        this.app.getUrlFetcher().fetchJson(configUrl)
            .then(onlineConfig => {
                Config.setOnlineTree(onlineConfig)
                this.lastUpdateTimeMs = Date.now()
                this.storeLastOnlineConfig(onlineConfig).catch(error => {
                    log.info('ConfigUpdater.getUpdate', 'Storing of retrieved config in local memory failed', { configUrl, onlineConfig }, error)
                })
                this.callOnUpdate()
            }).catch (error => {
                log.info('ConfigUpdater.getUpdate', 'fetchConfig failed', configUrl, error)
            }).finally(() => {
                this.updateRunning = false
            })
    }

    private async storeLastOnlineConfig(onlineConfig: {}): Promise<void>
    {
        const onlineConfigStr = JSON.stringify(onlineConfig)
        await Memory.setLocal('config.lastOnlineConfig', onlineConfigStr)
    }

}
