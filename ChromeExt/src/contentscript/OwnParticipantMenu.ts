import { iter } from '../lib/Iter'
import { Utils } from '../lib/Utils';
import { Environment } from '../lib/Environment';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { ParticipantMenu } from './ParticipantMenu';
import { Menu } from './Menu';
import { as } from '../lib/as';
import { TestWindow } from './TestWindow'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { TutorialWindow } from './TutorialWindow';
import { AboutWindow } from './AboutWindow';
import { SimpleToast } from './Toast';
import { ItemProperties } from '../lib/ItemProperties'
import { ItemException } from '../lib/ItemException'
import checkboxUncheckedIconUrl from '../assets/icons/checkbox-unchecked.svg';
import checkboxCheckedIconUrl from '../assets/icons/checkbox-checked.svg';
import getWeblinIconUrl from '../assets/icons/weblin.png';
import backpackIconUrl from '../assets/icons/bi_grid-3x2-gap-fill.svg';
import itemShopIconUrl from '../assets/icons/ItemShop.svg';
import badgesEditModeIconUrl from '../assets/icons/ic_badgesEditMode.svg';
import settingsIconUrl from '../assets/icons/ic_baseline-settings.svg';
import videoConferenceIconUrl from '../assets/icons/mdi_monitor-eye.svg';
import chatHistoryIconUrl from '../assets/icons/ic_outline-chat.svg';
import chatIconUrl from '../assets/icons/ic_baseline-chat-bubble-outline.svg';
import emotesIconUrl from '../assets/icons/smiley.svg';
import personsIconUrl from '../assets/icons/person.svg'
import helpIconUrl from '../assets/icons/weblin.png';
import { Memory } from '../lib/Memory'

export class OwnParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        if (Utils.isBackpackEnabled()) {
            this.addActionItem('backpack', 'Backpack', backpackIconUrl, true, () => this.app.showBackpackWindow());
        } else if (Environment.isEmbedded()) {
            const url = Config.get('extension.storeUrl', 'https://chrome.google.com/webstore/detail/weblin/cgfkfhdinajjhfeghebnljbanpcjdlkm');
            this.addActionItem('getWeblin', 'Get weblin everywhere', getWeblinIconUrl, false, () => this.app.navigate(url, '_top'));
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
            this.addActionItem('badgesEditMode', 'BadgesEditMode', badgesEditModeIconUrl, true, onClick);
        }

        if (Utils.isSystemItemShopEnabled()) {
            const systemShopItem = iter(this.app.ownItems.getAllItems().values())
                .filter(ItemProperties.isSystemItemShop)
                .getNext();
            if (systemShopItem) {
                const openShopFun = () => this.app.itemFrames.openItemFrame(systemShopItem, this.participant.getElem())
                this.addActionItem('systemItemShop', 'Item Shop', itemShopIconUrl, true, openShopFun);
            }
        }

        this.addSeparatorItem('separator');

        this.addActionItem('videoConference', 'Video Conference', videoConferenceIconUrl, true, () => this.app.showVidconfWindow());

        this.addActionItem('chat', 'Chat', chatIconUrl, true, () => this.participant.toggleChatin());

        this.addActionItem('chatHistory', 'Chat Window', chatHistoryIconUrl, true, () => this.app.toggleChatWindow());

        this.makeEmotesMenuAndItem();

        this.addActionItem('persons', 'Persons', personsIconUrl, true, () => this.app.setPersonsWindowOpen(true));

        this.addSeparatorItem('separator');

        this.makeHelpMenuAndItem();

        this.addActionItem('settings', 'Settings', settingsIconUrl, true, () => this.app.showSettings(this.participant.getElem()));

        if (Environment.isDevelopment()) {
            this.makeDebugMenuAndItem();
        }

        // column.addActionItem(
        //     'stayHere',
        //     'Stay Here',
        //     app.getStayHereIsChecked() ? checkboxCheckedIconUrl : checkboxUncheckedIconUrl, true,
        //     () => this.app.toggleStayHereIsChecked()
        // ));
    }

    protected makeEmotesMenuAndItem(): void
    {
        const animations = this.participant.getAvatar()?.getAnimations()?.sequences ?? {};
        const actionsMenu = this.addSubmenuItem('emotes', 'Emotes', emotesIconUrl, true);
        const groupBlocklist = [...Config.get('avatars.animationGroupBlocklistForAvatarMenu', [])];
        for (const key in animations) {
            const action = as.String(animations[key].group);
            if (!groupBlocklist.includes(action)) {
                actionsMenu.addActionItem(`emote-${action}`, action, null, null, () => this.participant.do(action));
                groupBlocklist.push(action);
            }
        }
    }

    protected makeHelpMenuAndItem(): void
    {
        const helpMenu = this.addSubmenuItem('help', 'Help', helpIconUrl, false);
        helpMenu.addActionItem('about', 'About weblin', null, null, () => new AboutWindow(this.app).show({}));
        helpMenu.addActionItem('tutorials', 'Tutorials', null, null, () => new TutorialWindow(this.app).show({}));
        helpMenu.addActionItem('feedback', 'Feedback', null, null, () => {
            BackgroundMessage.openOrFocusPopup({
                id: 'feedback-form-popup',
                url: as.String(Config.get('feedbackFormPopup.url'), 'https://forms.office.com/Pages/ResponsePage.aspx?id=JvnN0H3np0ampfQuOROE_DvLG9SnUatHp-dXDHpbTjJUOUpWSk1PMEdDRTNSTzlNOVZDUTFIVU9BVy4u#n3qdisable'),
                left: as.Int(Config.get('feedbackFormPopup.left')),
                top: as.Int(Config.get('feedbackFormPopup.top')),
                width: as.Int(Config.get('feedbackFormPopup.width'), 600),
                height: as.Int(Config.get('feedbackFormPopup.height'), 700),
            }).catch(error => this.app.onError(error));
        });
    }

    protected makeDebugMenuAndItem(): void
    {
        const debugMenu = this.addSubmenuItem('debug', 'Debug', null, null);
        debugMenu.addActionItem('itegrationTests', 'Integration tests...', null, null, () => new TestWindow(this.app).show({}));
        debugMenu.addActionItem('avatarEffectTest', 'Avatar Effect Test', null, null, () => this.app.test());
        debugMenu.addActionItem('youArrowTest', 'Show You Arrow', null, null, () => {
            Memory.setLocal('client.introYou', '0')
                .then(() => this.app.getMyParticipant()?.showIntroYouOnce())
                .catch(error => this.app.onError(error))
        });
        this.makeDebugToastMenuAndItem(debugMenu)
        debugMenu.addActionItem('popupTest', 'Open/focus browser popup', null, null, () =>
        {
            BackgroundMessage.openOrFocusPopup({
                id: 'test-popup-window',
                url: 'https://example.com/#n3qdisable',
                left: 30,
                top: 50,
                width: 400,
                height: 300,
            }).catch(error => this.app.onError(error));
        });
    }

    protected makeDebugToastMenuAndItem(debugMenu: Menu): void
    {
        const toastsMenu = debugMenu.addSubmenuItem('toasts', 'Toast tests', null, null)
        const testToastTextShort = 'Short test toast text.\nLorem ipsum dolor sit amet, consectetur adipiscing elit.'
        const testToastTextLong = 'Long test toast text.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\nmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm'
        const uniqueId = `test-toast-${Date.now()}`;
        toastsMenu.addActionItem(uniqueId, 'Notice, short, don\'t show, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextShort)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.addClosingActionButton('Test Action 3', () => console.log('Test Action 3'))
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Notice, long, don\'t show, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextLong)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.addClosingActionButton('Test Action 3', () => console.log('Test Action 3'))
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Notice, long, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextLong)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.setDontShow(false)
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Notice, short, don\'t show, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextShort)
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Notice, short, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextShort)
            toast.setDontShow(false)
            toast.show()
        })
        for (const icon of ['question', 'notice', 'warning', 'greeting', 'bye', 'privatechat', 'privatevidconf']) {
            const name = icon[0].toUpperCase() + icon.substring(1)
            toastsMenu.addActionItem(uniqueId, `${name}, short, 3s`, null, null, () => {
                const toast = new SimpleToast(this.app, uniqueId, 3, icon, 'Test toast title', testToastTextShort)
                toast.setDontShow(false)
                toast.show()
            })
        }
        toastsMenu.addActionItem(uniqueId, 'Item error', null, null, () => {
            this.app.onError(new ItemException(
                ItemException.Fact.InternalError,
                ItemException.Reason.NetworkProblem,
                'Test error detail!',
                'Test error message!',
                {test: true},
            ))
        })
        toastsMenu.addActionItem(uniqueId, 'Modal, notice, short, don\'t show, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextShort)
            toast.setIsModal(true)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.addClosingActionButton('Test Action 3', () => console.log('Test Action 3'))
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Modal, notice, long, don\'t show, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'notice', 'Test toast title', testToastTextLong)
            toast.setIsModal(true)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.addClosingActionButton('Test Action 3', () => console.log('Test Action 3'))
            toast.show()
        })
        toastsMenu.addActionItem(uniqueId, 'Modal, question, short, don\'t show, buttons, 3s', null, null, () => {
            const toast = new SimpleToast(this.app, uniqueId, 3, 'question', 'Test toast title', testToastTextShort)
            toast.setIsModal(true)
            toast.addClosingActionButton('Test Action 1', () => console.log('Test Action 1'))
            toast.addClosingActionButton('Test Action 2', () => console.log('Test Action 2'))
            toast.addClosingActionButton('Test Action 3', () => console.log('Test Action 3'))
            toast.show()
        })
    }

}
