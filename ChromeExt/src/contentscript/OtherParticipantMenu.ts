import { ParticipantMenu } from './ParticipantMenu';
import { MenuColumn } from './Menu'
import * as privateVideoConferenceIconUrl from '../assets/icons/mdi_monitor-eye.svg';
import * as privateChatIconUrl from '../assets/icons/ri_chat-private-line.svg';
import * as greetIconUrl from '../assets/icons/mdi_human-greeting.svg';
import * as byeIconUrl from '../assets/icons/bye-32.png';
import * as personIconUrl from '../assets/icons/person.svg'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { iter } from '../lib/Iter'

export class OtherParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('interaction');
        column.addActionItem('privateVideoConference', privateVideoConferenceIconUrl, 'Private Videoconf', () => {
            this.participant.initiatePrivateVidconf(this.participant.getElem()).catch(error => this.app.onError(error));
        });
        column.addActionItem('privateChat', privateChatIconUrl, 'Private Chat', () => {
            this.participant.openPrivateChat();
        });
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
    }

    protected makePersonMenuAndItem(column: MenuColumn): void
    {
        const menuItem = column.addSubmenuItem('person', personIconUrl, 'Person');
        const menuColumn = menuItem.addColumn('person');
        const personId = this.participant.getUserId()
        const item = iter(this.app.getOwnItems().values())
            .filter(item => ItemProperties.getIsPerson(item) && ItemProperties.getPersonId(item) === personId)
            .getNext()
        if (item) {
            menuColumn.addActionItem('forget', null, 'Forget', () => this.app.deleteItem(item))
        } else {
            menuColumn.addActionItem('remember', null, 'Remember', () => {
                const method = 'N3q.MemorizePerson';
                const props = { [Pid.PersonId]: this.participant.getUserId() };
                BackgroundMessage.executeBackpackItemActionOnGenericitem(method, props)
                    .catch(error => this.app.onError(error))
            });
        }
    }

}
