import { Utils } from '../lib/Utils';
import { Environment } from '../lib/Environment';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { ParticipantMenu } from './ParticipantMenu';
import { MenuColumn } from './Menu';
import { AnimationsDefinition } from './AnimationsXml';
import { as } from '../lib/as';

export class OwnParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('main');

        if (Environment.isEmbedded() && !Utils.isBackpackEnabled()) {
            const url = Config.get('extension.storeUrl', 'https://chrome.google.com/webstore/detail/weblin/cgfkfhdinajjhfeghebnljbanpcjdlkm');
            column.addActionItem('getweblin', 'Get weblin everywhere', () => this.app.navigate(url, '_top'));
        } else {
            column.addActionItem('inventory', 'Backpack', () => this.app.showBackpackWindow());
        }

        if (!is.nil(this.participant.getBadgesDisplay())) {
            const [menuItemId, labelId] = ['badgesEditMode', 'BadgesEditMode'];
            const onClick = () => {
                const badges = this.participant.getBadgesDisplay();
                if (is.nil(badges)) {
                    return;
                }
                if (badges.getIsInEditMode()) {
                    badges.exitEditMode();
                } else {
                    badges.enterEditMode();
                }
            };
            column.addActionItem(menuItemId, labelId, onClick);
        }

        column.addActionItem('settings', 'Settings', () => this.app.showSettings(this.participant.getElem()));

        column.addActionItem('vidconf', 'Video Conference', () => this.app.showVidconfWindow());

        column.addActionItem('chatwin', 'Chat Window', () => this.app.toggleChatWindow());

        column.addActionItem('chat', 'Chat', () => this.participant.toggleChatin());

        this.makeEmotesMenuAndItem(column);

        if (Environment.isDevelopment()) {
            this.makeDebugMenuAndItem(column);
        }

        // column.addActionItem(
        //     app.getStayHereIsChecked() ? 'checkboxChecked' : 'checkboxUnchecked',
        //     'Stay Here',
        //     () => this.app.toggleStayHereIsChecked()
        // ));
    }

    protected makeEmotesMenuAndItem(column: MenuColumn): void
    {
        const animations = this.participant.getAvatar()?.getAnimations() ?? new AnimationsDefinition({}, {});
        const actionsMenu = column.addSubmenuItem('emotes', 'Emotes');
        const actionsColumn = actionsMenu.addColumn('emotes');
        const groupBlocklist = [...Config.get('avatars.animationGroupBlocklistForAvatarMenu', [])];
        for (const key in animations.sequences) {
            const action = as.String(animations.sequences[key].group);
            if (!groupBlocklist.includes(action)) {
                actionsColumn.addActionItem(null, action, () => this.participant.do(action));
                groupBlocklist.push(action);
            }
        }
    }

    protected makeDebugMenuAndItem(column: MenuColumn): void
    {
        const actionsMenu = column.addSubmenuItem('debug', 'Debug');
        const debugColumn = actionsMenu.addColumn('debug');
        const debugUtils = this.app.getDebugUtils();

        debugColumn.addActionItem(null, 'Avatar Effect Test', () => this.app.test());

        {
            const isEnabled = debugUtils.getIframeTestBoxEnabled();
            const iconId = isEnabled ? 'checkbox-checked' : 'checkbox-unchecked';
            const action = () => debugUtils.toggleIframeTestBoxEnabled();
            debugColumn.addActionItem(iconId, 'iFrame Test', action);
        }
    }

}
