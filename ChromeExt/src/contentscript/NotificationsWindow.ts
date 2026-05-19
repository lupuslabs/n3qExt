import { is } from '../lib/is';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ChatUtils } from '../lib/ChatUtils';
import { DomUtils } from '../lib/DomUtils';
import type { TranslationOpts } from '../lib/Translator';
import type { ContentApp } from './ContentApp';
import { InstantMessagesWindow } from './InstantMessagesWindow';
import { SimpleToast } from './Toast';

type NotesNotificationBody = {
    readonly boardId: string
    readonly event: string
    readonly postId: string
    readonly noteId: string
    readonly actorUserId: string
    readonly actorName: string
    readonly actorImageUrl: string
};

export class NotificationsWindow extends InstantMessagesWindow {
    public constructor(app: ContentApp) {
        super(app, app.personManager.getSystemUserData());

        this.windowCssClasses.push('notificationswindow');
        this.titleText = 'Notifications';
        this.titleTextId = 'Notifications.windowTitle';
        this.titleTextReplacements.clear();
    }

    protected isReadOnly(): boolean { return true; }

    protected makeVidconfButton(): null|HTMLElement { return null; }

    protected isToastableMessageType(type: ChatUtils.ChatMessageType): boolean {
        return type === 'notes' && Utils.isThoughtsEnabled();
    }

    protected async sendChat(text: string): Promise<void> {
        // No-op: NotificationsWindow has no input field (isReadOnly() returns true).
    }

    protected onVisible(): void {
        super.onVisible();
        this.markMessagesAsReadByType('notes');
    }

    protected makeMessageTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement] {
        switch (message.type) {
            case 'notes': {
                return this.makeNotesNotificationTextHtmlElement(message);
            } break;
            default: {
                return super.makeMessageTextHtmlElement(message);
            } break;
        }
    }

    protected makeNotesNotificationTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement] {
        const body = this.getNotesNotificationBodyOrNull(message.text);
        if (!body) {
            return super.makeMessageTextHtmlElement(message);
        }

        const event = body.event;
        const triggerUserName = as.NonEmptyStringOrNull(body.actorName) ?? message.authorName;
        const translateOpts: TranslationOpts = {
            replacements: [['{otherUserName}', triggerUserName]],
        };
        const eventTextKey = `thoughts.notification.${event}Message`;
        const eventText = this.app.translateText(eventTextKey, translateOpts);
        const viewLinkText = this.app.translateText('thoughts.notification.openThoughtButton', 'View');

        const textElem = DomUtils.elemOfHtml(`<span class="text"></span>`);
        const pNode = document.createElement('p');
        const eventSpan = document.createElement('span');
        eventSpan.textContent = eventText;
        pNode.append(eventSpan);
        pNode.append(document.createTextNode(' '));

        if (this.getThoughtsClientRoomIdIfAvailable(body) !== null) {
            const linkNode = DomUtils.elemOfHtml(`<a class="link"></a>`);
            linkNode.textContent = viewLinkText;
            linkNode.addEventListener('click', () => {
                this.openThoughtFromBody(body);
                this.markMessageAsRead(message);
            });
            pNode.append(linkNode);
        }
        textElem.append(pNode);
        return [[], textElem];
    }

    protected showUnreadMessageToast(lastMessage: ChatUtils.ChatMessage, unreadMessageCount: number): void {
        const body = this.getNotesNotificationBodyOrNull(lastMessage.text);
        const event = as.String(body?.event);
        const userName = as.NonEmptyStringOrNull(body?.actorName)
            ?? as.NonEmptyStringOrNull(lastMessage.authorName)
            ?? this.otherUser.userName;
        const userImageUrl = as.NonEmptyStringOrNull(body?.actorImageUrl)
            ?? as.NonEmptyStringOrNull(lastMessage.authorImageUrl)
            ?? this.otherUser.userImageUrl;

        const translateOpts: TranslationOpts = {
            replacements: [['{otherUserName}', userName]],
        };

        const toastId = `thoughts.notification.${lastMessage.id}`;
        const toastType = 'thoughts.notification';
        const title = this.app.translateText(`thoughts.notification.${event}Message`, translateOpts);
        const text = '';
        const toast = new SimpleToast(this.app, toastId, 0, toastType, title, text);
        toast.setIcon(this.app.personManager.getAvatarImageUrlOrDefault(userImageUrl), 10, 64, 64);

        const onCloseAction = (): void => this.markMessagesAsReadByType('notes');
        toast.setDefaultAction(onCloseAction);

        const viewButtonText = this.app.translateText('thoughts.notification.openThoughtButton', 'View');
        toast.addClosingActionButton(viewButtonText, () => {
            onCloseAction();
            if (body) {
                this.openThoughtFromBody(body);
            }
        });

        const allButtonText = this.app.translateText('notifications.openNotificationsButton', 'All notifications');
        toast.addClosingActionButton(allButtonText, () => {
            onCloseAction();
            const options = { undocked: this.app.getIsExclusiveWindowPopup() };
            this.show(options);
        });

        toast.setDontShow(false);
        this.unreadMessageToast = toast;
        this.unreadMessageToastMessageId = lastMessage.id;
        toast.show();
    }

    private openThoughtFromBody(body: NotesNotificationBody): void {
        const clientRoomId = this.getThoughtsClientRoomIdIfAvailable(body);
        if (clientRoomId === null) {
            return;
        }
        const target = { clientRoomId, postId: body.postId, noteId: body.noteId };
        this.app.itemFrames.openThoughtsFrame(null, target);
    }

    private getThoughtsClientRoomIdIfAvailable(body: null|NotesNotificationBody): null|string {
        if (!body || !Utils.isThoughtsEnabled()) {
            return null;
        }
        return ChatUtils.getThoughtsClientRoomIdOfNotesBoardId(body.boardId);
    }

    private getNotesNotificationBodyOrNull(messageText: string): null|NotesNotificationBody {
        let parsed: unknown;
        try {
            parsed = JSON.parse(messageText);
        } catch (error) {
            return null;
        }
        if (!is.object(parsed)) {
            return null;
        }
        return {
            boardId: as.String(parsed.boardId),
            event: as.String(parsed.event),
            postId: as.String(parsed.postId),
            noteId: as.String(parsed.noteId),
            actorUserId: as.String(parsed.actorUserId),
            actorName: as.String(parsed.actorName),
            actorImageUrl: as.String(parsed.actorImageUrl),
        };
    }
}
