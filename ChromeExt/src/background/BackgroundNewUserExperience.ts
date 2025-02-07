import { as } from '../lib/as';
import { Environment } from '../lib/Environment';
import { Logger } from '../lib/Logger'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory';
import { Pid } from '../lib/ItemProperties'
import { BackgroundApp } from './BackgroundApp';

export class BackgroundNewUserExperience
{
    private readonly app: BackgroundApp
    private readonly logger: Logger
    private isStopped: boolean = false

    public constructor(app: BackgroundApp) {
        this.app = app
        this.logger = this.app.getLogger().getSubLogger('', 'BackgroundNewUserExperience')
        this.app.getBackgroundStopListeners().addListener(() => this.onBackgroundStop())
        this.app.getBackgroundReadyListeners().addListener(() => this.onBackgroundReady())
        if (this.app.getIsReady()) {
            this.onBackgroundReady()
        }
    }

    private onBackgroundStop(): void {
        this.isStopped = true
    }

    private onBackgroundReady(): void {
        this.navigateToPage().catch(error => this.logger.logError(error))
    }

    private async navigateToPage(): Promise<void> {
        if (this.isStopped || !Environment.isExtension()) {
            return
        }
        if (as.Bool(await Memory.getLocal('newUserExperience.navigatedToPage'))) {
            return
        }
        const nowMs = Date.now()
        const firstStartMs = as.Int(await Memory.getLocal('client.firstStart'), nowMs);
        const secsSinceFirstStart = (nowMs - firstStartMs) * 1e-3
        if (secsSinceFirstStart > Config.get('newUserExperience.firstStartMaxAgeSec', Number.MAX_VALUE)) {
            return
        }
        const userPoints = as.Int(this.app.getBackpack().getPointsItem()?.[Pid.PointsTotal]);
        if (userPoints > Config.get('newUserExperience.experiencedUserPointsLimit', Number.MAX_VALUE)) {
            return
        }
        if (!as.Bool(Config.get('newUserExperience.navigateToPageEnabled'))) {
            return
        }

        const pageUrl: string = as.String(Config.get('newUserExperience.navigateToPageUrl'))
        if (pageUrl.length === 0) {
            return
        }
        await this.app.getBrowserTabs().openTab(pageUrl, true)
        await Memory.setLocal('newUserExperience.navigatedToPage', true)
    }

}
