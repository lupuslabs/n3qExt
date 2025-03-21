import { as } from '../lib/as'
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config'
import { ParticipantMenu } from './ParticipantMenu';
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
        this.addActionItem('privateVideoConference', 'Private Videoconf', privateVideoConferenceIconUrl, true, () => {
            this.participant.initiatePrivateVidconf(this.participant.getElem()).catch(error => this.app.onError(error));
        });

        const imManager = this.app.instantMessageManager;
        const otherUserId = this.participant.getUserId();
        if (imManager.isFeatureEnabled() && this.participant.getSupportsPrivateChat()) {
            const action = () => imManager.openInstantMessagesWindow(otherUserId);
            this.addActionItem('privateChat', 'Private Chat', privateChatIconUrl, true, action);
        }

        this.addActionItem('greet', 'Greet', greetIconUrl, true, () => {
            this.participant.sendPoke('greet');
            this.participant.do('wave', false);
        });
        this.addActionItem('bye', 'Bye', byeIconUrl, true, () => {
            this.participant.sendPoke('bye');
            this.participant.do('wave', false);
        });
        if (Utils.isBackpackEnabled() && this.participant.getSupportsPersonApi()) {
            this.makePersonMenuAndItem();
        }
        this.makeDebugMenuAndItem();
    }

    protected makePersonMenuAndItem(): void
    {
        const personData = this.app.personManager.getPersonDataOrNull(this.participant.getUserId())
        if (!personData) {
            return;
        }
        const { userId, userName, userImageUrl, ownFriendStatus, ownPersonItem } = personData;
        const personMenu = this.addSubmenuItem('person', 'Person', personIconUrl, true);

        if (!ownPersonItem) {
            personMenu.addActionItem('remember', 'Remember', null, null, () => {
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
                personMenu.addActionItem(menuItemId, 'ProposeFriendship', null, null, () => {
                    this.app.personManager.showProposeFriendshipToast(personData);
                });
            } break;
            case 'ProposedByOwner': {
                personMenu.addActionItem(menuItemId, 'CancelFriendshipProposal', null, null, () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', props)
                        .catch(error => this.app.onError(error))
                });
            } break;
            case 'ProposedByOther': {
                personMenu.addActionItem(menuItemId, 'AcceptFriendshipProposal', null, null, () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.AcceptFriendship', props)
                        .catch(error => this.app.onError(error))
                });
                personMenu.addActionItem(menuItemId, 'DeclineFriendshipProposal', null, null, () => {
                    const props = { [Pid.UserId]: userId };
                    BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', props)
                        .catch(error => this.app.onError(error))
                });
            } break;
            case 'Yes': {
                personMenu.addActionItem(menuItemId, 'CancelFriendship', null, null, () => {
                    this.app.personManager.showCancelFriendshipToast(personData);
                });
            } break;
        }

        if (ownPersonItem) {
            personMenu.addActionItem('forget', 'Forget', null, null, () => {
                this.app.deleteItemAsk(ItemProperties.getId(ownPersonItem));
            });
        }
    }

    protected makeDebugMenuAndItem(): void
    {
        const withRequestUserInfoItem = as.Bool(Config.get('room.showPrivateChatInfoButton'));
        if (!withRequestUserInfoItem) {
            return;
        }
        const debugMenu = this.addSubmenuItem('debug', 'Debug', null, null);

        if (withRequestUserInfoItem) {
            debugMenu.addActionItem('requestUserInfo', 'Info', null, null, () => {
                this.participant.fetchVersionInfo();
            });
        }
    }

}
