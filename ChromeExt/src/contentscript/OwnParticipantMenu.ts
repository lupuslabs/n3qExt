﻿import { Utils } from '../lib/Utils';
import { Environment } from '../lib/Environment';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { ParticipantMenu } from './ParticipantMenu';
import { MenuColumn } from './Menu';
import { as } from '../lib/as';
import { TestWindow } from './TestWindow'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { TutorialWindow } from './TutorialWindow';
import { AboutWindow } from './AboutWindow';
import { SimpleToast } from './Toast';

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
            const onClick = () =>
            {
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

        this.makeHelpMenuAndItem(column);

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
        const animations = this.participant.getAvatar()?.getAnimations()?.sequences ?? {};
        const actionsMenu = column.addSubmenuItem('emotes', 'Emotes');
        const actionsColumn = actionsMenu.addColumn('emotes');
        const groupBlocklist = [...Config.get('avatars.animationGroupBlocklistForAvatarMenu', [])];
        for (const key in animations) {
            const action = as.String(animations[key].group);
            if (!groupBlocklist.includes(action)) {
                actionsColumn.addActionItem(null, action, () => this.participant.do(action));
                groupBlocklist.push(action);
            }
        }
    }

    protected makeHelpMenuAndItem(column: MenuColumn): void
    {
        const menuItem = column.addSubmenuItem('help', 'Help');
        const menuColumn = menuItem.addColumn('help');

        menuColumn.addActionItem(null, 'About weblin', () => new AboutWindow(this.app).show({}));
        menuColumn.addActionItem(null, 'Tutorials', () => new TutorialWindow(this.app).show({}));
    }

    protected makeDebugMenuAndItem(column: MenuColumn): void
    {
        const actionsMenu = column.addSubmenuItem('debug', 'Debug');
        const debugColumn = actionsMenu.addColumn('debug');

        debugColumn.addActionItem(null, 'Integration tests...', () => new TestWindow(this.app).show({}));
        debugColumn.addActionItem(null, 'Avatar Effect Test', () => this.app.test());
        debugColumn.addActionItem(null, 'Show a Toast', () =>
        {
            new SimpleToast(this.app,
                'privatevidconfrestestponse',
                10,
                'notice',
                'You Can Claim Activity Points',
                'Activity points can be claimed')
                .show()
        });
        debugColumn.addActionItem(null, 'Open or focus test popup', () =>
        {
            BackgroundMessage.openOrFocusPopup({
                id: 'testPopupWindow',
                url: 'https://chat.openai.com/chat',
                left: 30,
                top: 50,
                width: 400,
                height: 300,
            }).catch(error => this.app.onError(error));
        });
    }

}
