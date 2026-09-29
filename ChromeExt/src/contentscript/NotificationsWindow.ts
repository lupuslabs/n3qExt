import { is } from '../lib/is';
import { as } from '../lib/as';
import { ErrorWithData } from '../lib/Utils';
import { DomUtils } from '../lib/DomUtils';
import { ChatUtils } from '../lib/ChatUtils';
import type { TranslationOpts } from '../lib/Translator';
import type { ContentApp } from './ContentApp';
import { InstantMessagesWindow } from './InstantMessagesWindow';
import systemNotificationMessageType = ChatUtils.systemNotificationMessageType;
import { SimpleToast } from './Toast';

type NotificationData = {
    readonly feature: string
    readonly event: string
    readonly actorUserId: string
    readonly actorName: string
    readonly actorImageUrl: string
};

export class NotificationsWindow extends InstantMessagesWindow {
    private readonly toastableNotificationFeatures: ReadonlyArray<string> = [];

    public constructor(app: ContentApp) {
        super(app, app.personManager.getSystemUserData());

        this.windowCssClasses.push('notificationswindow');
        this.titleText = 'Notifications';
        this.titleTextId = 'Notifications.windowTitle';
        this.titleTextReplacements.clear();
    }

    protected isReadOnly(): boolean { return true; }

    protected makeVidconfButton(): null|HTMLElement { return null; }

    protected isToastableMessageType(message: ChatUtils.ChatMessage): boolean {
        return this.toastableNotificationFeatures.includes(this.parseNotificationData(message).feature);
    }

    protected storeChatMessage(chatMessage: ChatUtils.ChatMessage): void {
        if (chatMessage.type !== systemNotificationMessageType) {
            return;
        }
        const notificationData = this.parseNotificationDataOrNull(chatMessage);
        if (!notificationData) {
            return;
        }
        super.storeChatMessage(chatMessage);
    }

    protected async sendChat(text: string): Promise<void> {
        // No-op: NotificationsWindow has no input field (isReadOnly() returns true).
    }

    protected onVisible(): void {
        super.onVisible();
        this.markMessagesAsReadByType('notification');
    }

    protected makeMessageTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement] {
        const textElem = DomUtils.elemOfHtml(`<span class="text"></span>`);

        const notificationData = this.parseNotificationData(message);
        const messageCssClasses = ['notification', `notification-${notificationData.feature}`];

        const event = notificationData.event;
        const authorName = as.NonEmptyStringOrNull(notificationData.actorName) ?? message.authorName;
        const translateOpts: TranslationOpts = {
            replacements: [['{otherUserName}', authorName]],
        };
        const textId = `Notifications.${notificationData.feature}.${event}Message`;
        const text = this.app.translateText(textId, translateOpts);
        ChatUtils.prepareTextHtml(text).textNodes.forEach(node => textElem.appendChild(node));

        return [messageCssClasses, textElem];
    }

    protected showUnreadMessageToast(lastMessage: ChatUtils.ChatMessage, unreadMessageCount: number): void {
        const notificationData = this.parseNotificationDataOrNull(lastMessage);
        if (!notificationData) {
            return;
        }
        const event = as.String(notificationData?.event);
        const userName = as.NonEmptyStringOrNull(notificationData?.actorName)
            ?? as.NonEmptyStringOrNull(lastMessage.authorName)
            ?? this.otherUser.userName;
        const userImageUrl = as.NonEmptyStringOrNull(notificationData?.actorImageUrl)
            ?? as.NonEmptyStringOrNull(lastMessage.authorImageUrl)
            ?? this.otherUser.userImageUrl;

        const translateOpts: TranslationOpts = {
            replacements: [['{otherUserName}', userName]],
        };

        const toastId = `notifications.${lastMessage.id}`;
        const toastType = `Notifications.${notificationData.feature}`;
        const title = this.app.translateText(`Notifications.${notificationData.feature}.${event}Message`, translateOpts);
        const text = '';
        const toast = new SimpleToast(this.app, toastId, 0, toastType, title, text);
        toast.setIcon(this.app.personManager.getAvatarImageUrlOrDefault(userImageUrl), 10, 64, 64);

        const onCloseAction = (): void => this.markMessagesAsReadByType('notification');
        toast.setDefaultAction(onCloseAction);

        const buttonDefs = this.makeToastNotificationActionButtonDefs(notificationData, onCloseAction);
        for (const [label, action] of buttonDefs) {
            toast.addClosingActionButton(label, action);
        }

        toast.setDontShow(false);
        this.unreadMessageToast = toast;
        this.unreadMessageToastMessageId = lastMessage.id;
        toast.show();
    }

    private makeToastNotificationActionButtonDefs(notificationData: null|NotificationData, onCloseAction: () => void): [string, () => void][] {
        const buttonDefs: [string, () => void][] = [];

        const allButtonText = this.app.translateText('Notifications.openNotificationsButton', 'All notifications');
        const allButtonAction = (): void => {
            onCloseAction();
            const options = { undocked: this.app.getIsExclusiveWindowPopup() };
            this.show(options);
        };
        buttonDefs.push([allButtonText, allButtonAction]);
        return buttonDefs;
    }

    private parseNotificationData(message: ChatUtils.ChatMessage): NotificationData {
        const notificationData = this.parseNotificationDataOrNull(message);
        if (!notificationData) {
            throw new ErrorWithData('Message doesn\'t contain valid notification data!', { message });
        }
        return notificationData;
    }

    private parseNotificationDataOrNull(message: ChatUtils.ChatMessage): null|NotificationData {
        let parsed: unknown;
        try {
            parsed = JSON.parse(message.text);
        } catch (error) {
            return null;
        }
        if (!is.object(parsed)) {
            return null;
        }
        const feature = as.String(parsed.feature);
        return {
            feature: feature,
            event: as.String(parsed.event),
            actorUserId: as.String(parsed.actorUserId),
            actorName: as.String(parsed.actorName),
            actorImageUrl: as.String(parsed.actorImageUrl),
        };
    }
}
