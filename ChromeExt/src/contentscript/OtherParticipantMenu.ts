import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { ParticipantMenu } from './ParticipantMenu';
import { MenuColumn } from './Menu'
import * as privateVideoConferenceIconUrl from '../assets/icons/mdi_monitor-eye.svg';
import * as privateChatIconUrl from '../assets/icons/ri_chat-private-line.svg';
import * as greetIconUrl from '../assets/icons/mdi_human-greeting.svg';
import * as byeIconUrl from '../assets/icons/bye-32.png';
import * as personIconUrl from '../assets/icons/person.svg'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { BackgroundMessage } from '../lib/BackgroundMessage'

export class OtherParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('interaction');
        column.addActionItem('privateVideoConference', privateVideoConferenceIconUrl, 'Private Videoconf', () => {
            this.participant.initiatePrivateVidconf(this.participant.getElem()).catch(error => this.app.onError(error));
        });

        const imManager = this.app.getInstantMessageManager();
        const otherUserId = this.participant.getUserId();
        if (otherUserId.length !== 0 && imManager.isFeatureEnabled()) {
            const action = () => imManager.openInstantMessagesWindow(otherUserId);
            column.addActionItem('privateChat', privateChatIconUrl, 'Private Chat', action);
        }

        column.addActionItem('greet', greetIconUrl, 'Greet', () => {
            this.participant.sendPoke('greet');
            this.participant.do('wave', false);
        });
        column.addActionItem('bye', byeIconUrl, 'Bye', () => {
            this.participant.sendPoke('bye');
            this.participant.do('wave', false);
        });
        if (this.participant.getSupportsPersonApi()) {
            this.makePersonMenuAndItem(column);
        }
        this.makeDebugMenuAndItem(column);
    }

    protected makePersonMenuAndItem(column: MenuColumn): void
    {
        const personData = this.app.getPersonManager().getPersonDataOrNull(this.participant.getUserId())
        if (!personData) {
            return;
        }
        const { userId, userName, userImageUrl, ownFriendStatus, ownPersonItem } = personData;

        const menuItem = column.addSubmenuItem('person', personIconUrl, 'Person');
        const menuColumn = menuItem.addColumn('person');

        if (!ownPersonItem) {
            menuColumn.addActionItem('remember', null, 'Remember', () => {
                const method = 'N3q.MemorizePerson';
                const props = { [Pid.UserId]: this.participant.getUserId() };
                BackgroundMessage.executeBackpackItemActionOnGenericitem(method, props)
                    .catch(error => this.app.onError(error))
            });
        }

        const menuItemId = `friendship${ownFriendStatus}`;
        switch (ownFriendStatus) {
            default:
            case 'No': {
                menuColumn.addActionItem(menuItemId, null, 'ProposeFriendship', () => {
                    this.app.getPersonManager().showProposeFriendshipToast(personData);
                });
            } break;
            case 'ProposedByOwner': {
                menuColumn.addActionItem(menuItemId, null, 'CancelFriendshipProposal', () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', props)
                        .catch(error => this.app.onError(error))
                });
            } break;
            case 'ProposedByOther': {
                menuColumn.addActionItem(menuItemId, null, 'AcceptFriendshipProposal', () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.AcceptFriendship', props)
                        .catch(error => this.app.onError(error))
                });
                menuColumn.addActionItem(menuItemId, null, 'DeclineFriendshipProposal', () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', props)
                        .catch(error => this.app.onError(error))
                });
            } break;
            case 'Yes': {
                menuColumn.addActionItem(menuItemId, null, 'CancelFriendship', () => {
                    this.app.getPersonManager().showCancelFriendshipToast(personData);
                });
            } break;
        }

        if (ownPersonItem) {
            menuColumn.addActionItem('forget', null, 'Forget', () => {
                this.app.deleteItemAsk(ItemProperties.getId(ownPersonItem));
            });
        }
    }

    protected makeDebugMenuAndItem(column: MenuColumn): void
    {
        const withRequestUserInfoItem = as.Bool(Config.get('room.showPrivateChatInfoButton'));
        if (!withRequestUserInfoItem) {
            return;
        }
        const menuItem = column.addSubmenuItem('debug', null, 'Debug');
        const menuColumn = menuItem.addColumn('debug');

        if (withRequestUserInfoItem) {
            menuColumn.addActionItem('requestUserInfo', null, 'Info', () => {
                this.participant.fetchVersionInfo();
            });
        }
    }

}
