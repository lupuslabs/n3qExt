import { Utils } from '../lib/Utils';
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
//import * as checkboxUncheckedIconUrl from '../assets/icons/checkbox-unchecked.svg';
//import * as checkboxCheckedIconUrl from '../assets/icons/checkbox-checked.svg';
import * as getWeblinIconUrl from '../assets/icons/weblin.png';
import * as backpackIconUrl from '../assets/icons/bi_grid-3x2-gap-fill.svg';
import * as badgesEditModeIconUrl from '../assets/icons/ic_badgesEditMode.svg';
import * as settingsIconUrl from '../assets/icons/ic_baseline-settings.svg';
import * as videoConferenceIconUrl from '../assets/icons/mdi_monitor-eye.svg';
import * as chatHistoryIconUrl from '../assets/icons/ic_outline-chat.svg';
import * as chatIconUrl from '../assets/icons/ic_baseline-chat-bubble-outline.svg';
import * as emotesIconUrl from '../assets/icons/smiley.svg';
import * as helpIconUrl from '../assets/icons/weblin.png';

export class OwnParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('main');

        if (Environment.isEmbedded() && !Utils.isBackpackEnabled()) {
            const url = Config.get('extension.storeUrl', 'https://chrome.google.com/webstore/detail/weblin/cgfkfhdinajjhfeghebnljbanpcjdlkm');
            column.addActionItem('getWeblin', getWeblinIconUrl, 'Get weblin everywhere', () => this.app.navigate(url, '_top'));
        } else {
            column.addActionItem('backpack', backpackIconUrl, 'Backpack', () => this.app.showBackpackWindow());
        }

        if (!is.nil(this.participant.getBadgesDisplay())) {
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
            column.addActionItem('badgesEditMode', badgesEditModeIconUrl, 'BadgesEditMode', onClick);
        }

        column.addSeparatorItem('separator');

        column.addActionItem('videoConference', videoConferenceIconUrl, 'Video Conference', () => this.app.showVidconfWindow());

        column.addActionItem('chat', chatIconUrl, 'Chat', () => this.participant.toggleChatin());

        column.addActionItem('chatHistory', chatHistoryIconUrl, 'Chat Window', () => this.app.toggleChatWindow());

        this.makeEmotesMenuAndItem(column);

        column.addSeparatorItem('separator');

        this.makeHelpMenuAndItem(column);

        column.addActionItem('settings', settingsIconUrl, 'Settings', () => this.app.showSettings(this.participant.getElem()));

        if (Environment.isDevelopment()) {
            this.makeDebugMenuAndItem(column);
        }

        // column.addActionItem(
        //     'stayHere',
        //     app.getStayHereIsChecked() ? checkboxCheckedIconUrl : checkboxUncheckedIconUrl,
        //     'Stay Here',
        //     () => this.app.toggleStayHereIsChecked()
        // ));
    }

    protected makeEmotesMenuAndItem(column: MenuColumn): void
    {
        const animations = this.participant.getAvatar()?.getAnimations()?.sequences ?? {};
        const actionsMenu = column.addSubmenuItem('emotes', emotesIconUrl, 'Emotes');
        const actionsColumn = actionsMenu.addColumn('emotes');
        const groupBlocklist = [...Config.get('avatars.animationGroupBlocklistForAvatarMenu', [])];
        for (const key in animations) {
            const action = as.String(animations[key].group);
            if (!groupBlocklist.includes(action)) {
                actionsColumn.addActionItem(`emote-${action}`, null, action, () => this.participant.do(action));
                groupBlocklist.push(action);
            }
        }
    }

    protected makeHelpMenuAndItem(column: MenuColumn): void
    {
        const menuItem = column.addSubmenuItem('help', helpIconUrl, 'Help');
        const menuColumn = menuItem.addColumn('help');

        menuColumn.addActionItem('about', null, 'About weblin', () => new AboutWindow(this.app).show({}));
        menuColumn.addActionItem('tutorials', null, 'Tutorials', () => new TutorialWindow(this.app).show({}));
    }

    protected makeDebugMenuAndItem(column: MenuColumn): void
    {
        const actionsMenu = column.addSubmenuItem('debug', null, 'Debug');
        const debugColumn = actionsMenu.addColumn('debug');

        debugColumn.addActionItem('itegrationTests', null, 'Integration tests...', () => new TestWindow(this.app).show({}));
        debugColumn.addActionItem('avatarEffectTest', null, 'Avatar Effect Test', () => this.app.test());
        debugColumn.addActionItem('toastTest', null, 'Show a Toast', () =>
        {
            new SimpleToast(this.app,
                'privatevidconfrestestponse',
                10,
                'notice',
                'You Can Claim Activity Points',
                'Activity points can be claimed')
                .show()
        });
        debugColumn.addActionItem('popupTest', null, 'Open or focus test popup', () =>
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
