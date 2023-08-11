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
        this.loadLastOnlineConfig()
            .catch(error => log.info('ConfigUpdater.start: loadLastOnlineConfig failed!', error))
            .then(() => this.updateLoop())
    }

    public stop(): void
    {
        clearTimeout(this.updateCheckTimer)
        this.updateCheckTimer = null;
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
            const onlineConfig = await this.app.getUrlFetcher().fetchJson(configUrl)
            Config.setOnlineTree(onlineConfig)
            this.lastUpdateTimeMs = Date.now()
            this.callOnUpdate()
            try {
                const onlineConfigStr = JSON.stringify(onlineConfig)
                await Memory.setLocal('config.lastOnlineConfig', onlineConfigStr)
            } catch (error) {
                log.info('ConfigUpdater.getUpdate', 'Storing of retrieved config in local memory failed', { configUrl, onlineConfig }, error)
            }
        })().catch (error => log.info('ConfigUpdater.getUpdate', 'fetchConfig failed', configUrl, error))
    }

}
