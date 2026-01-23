import { Client } from '../lib/Client';
import { Config } from '../lib/Config';
import { Translator } from '../lib/Translator';
import { ContentApp } from './ContentApp';
import { Room } from './Room';
import { TestWindow } from './TestWindow';
import { TutorialWindow } from './TutorialWindow';
import { AboutWindow } from './AboutWindow';
import { VpiResolver } from './VpiResolver';
import { as } from '../lib/as';
import { BackgroundMessageUrlFetcher } from '../lib/UrlFetcher'

export interface ChatConsoleOut { (data: any): void }

export class ChatConsoleContext
{
    app: ContentApp;
    room: Room;
    out: ChatConsoleOut;
}

export class ChatConsole
{
    public static isChatCommand(text: string): boolean
    {
        return text.startsWith('/') && !text.startsWith('/do ');
    }

    public static chatCommand(text: string, context: ChatConsoleContext)
    {
        this.out(context, ['[in]', text]);

        const parts: string[] = text.split(' ');
        const cmd: string = parts[0];

        if (parts.length < 1) {
            return;
        }

        switch (cmd) {
            default:
            case '/help':
            case '/?':
                this.out(context, [['[help]', [
                    '/clear: Empty chat window',
                    '/xmpp: Show xmpp console',
                    '/room: Show room info',
                    '/changes: Show versions and changes',
                    '/i /items /inventory /backpack: Toggle backpack window',
                    '/b /badges: Toggle badges edit mode',
                    '/v /video /vid /vidconf /conf: Toggle video conf window',
                    '/c /chat: Toggle chat window',
                    '/tutorial: Show tutorials',
                    '/info: Show client info',
                    '/who: Show participants',
                    '/what:Sshow items',
                    '/map <URL>: Show URL mapping for url',
                ].join('\n')]]);
                break;
            case '/clear':
                context.app?.getRoom().clearChatWindow();
                break;
            case '/xmpp':
                context.app?.showXmppWindow();
                break;
            case '/c':
            case '/chat':
                context.app?.toggleChatWindow();
                break;
            case '/i':
            case '/items':
            case '/inventory':
            case '/backpack':
            case '/stuff':
            case '/things':
                context.app?.showBackpackWindow();
                break;
            case '/badges':
            case '/badge':
            case '/b':
                context.app?.toggleBadgesEditMode();
                break;
            case '/v':
            case '/vid':
            case '/video':
            case '/vidconf':
            case '/conf':
            case '/jitsi':
                context.app?.showVidconfWindow();
                break;
            case '/test':
                new TestWindow(context.app).show({});
                break;
            case '/tutorial':
            case '/tut':
                new TutorialWindow(context.app).show({});
                break;
            case '/about':
                new AboutWindow(context.app).show({});
                break;
            case '/changes':
                context.app?.showChangesWindow();
                break;
            case '/info': {
                const text = Object.entries(Client.getDetails())
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');
                ChatConsole.out(context, [['[info]', text]]);
            } break;
            case '/room': {
                const roomInfo = context.room?.getInfo() ?? null;
                if (roomInfo) {
                    const roomInfoText = roomInfo
                        .map(([name, value]) => `${name}: ${value}`)
                        .join('\n');
                    ChatConsole.out(context, [['[room]', roomInfoText]]);
                }
            } break;
            case '/who': {
                const participantRoomId = context.room?.getParticipantIds() ?? null;
                if (participantRoomId) {
                    const text = participantRoomId
                        .map(id => `${id}: ${context.room.getParticipant(id).getDisplayName()}`)
                        .join('\n');
                    ChatConsole.out(context, [['[who]', text]]);
                }
            } break;
            case '/what': {
                const itemIds = context.room?.getItemIds() ?? null;
                if (itemIds) {
                    const text = itemIds
                        .map(itemId => `${itemId}: ${context.room.getItemByItemId(itemId).getDisplayName()}`)
                        .join('\n');
                    ChatConsole.out(context, [['[what]', text]]);
                }
            } break;
            case '/map': {
                const urlFetcher = new BackgroundMessageUrlFetcher()
                const vpi = new VpiResolver(urlFetcher, Config);
                const language: string = Translator.mapLanguage(navigator.language, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, as.String(Config.get('i18n.defaultLanguage'), 'en-US'));
                const translator = new Translator(Config.get('i18n.translations', {})[language], language, as.String(Config.get('i18n.serviceUrl'), ''), urlFetcher);
                vpi.language = Translator.getShortLanguageCode(translator.getLanguage());
                const lines = new Array<[string, string]>();
                const url = parts[1];
                lines.push(['URL', url]);
                vpi.trace = (key, value) => { lines.push([key, value]); };
                vpi.map(url).then(result =>
                {
                    //lines.push(['valid', as.String(result.isValid)]);
                    //lines.push(['room', result.roomJid]);
                    //lines.push(['destination', result.destinationUrl]);
                    if (lines) {
                        const text = lines
                            .map(([action, target]) => `${action} ${target}`)
                            .join('\n');
                        ChatConsole.out(context, [['[map]', text]]);
                    }
                }).catch(error => {
                    const errorText = error?.message ?? String(error);
                    const traceText = lines.length > 0
                        ? lines.map(([action, target]) => `${action} ${target}`).join('\n') + '\n'
                        : '';
                    ChatConsole.out(context, [['[map error]', traceText + 'Error: ' + errorText]]);
                });
            } break;
        }
    }

    private static out(context: ChatConsoleContext, data: any): void
    {
        if (context.out) { context.out(data); }
    }
}
