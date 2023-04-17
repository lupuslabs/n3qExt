import { BackgroundMessage } from '../lib/BackgroundMessage';
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
                this.out(context, [
                    ['[help]', '/clear # empty chat window'],
                    ['[help]', '/xmpp # show xmpp console'],
                    ['[help]', '/room # show room info'],
                    ['[help]', '/changes # show versions and changes'],
                    ['[help]', '/i /items /inventory /backpack # toggle backpack window'],
                    ['[help]', '/b /badges # toggle badges edit mode'],
                    ['[help]', '/v /video /vid /vidconf /conf # toggle video conf window'],
                    ['[help]', '/c /chat # toggle chat window'],
                    ['[help]', '/info # show client info'],
                    ['[help]', '/who # show participants'],
                    ['[help]', '/what # show items'],
                    ['[help]', '/map <URL> # show URL mapping for url'],
                ]);
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
            case '/info':
                ChatConsole.out(context, [
                    ['info', JSON.stringify(Client.getDetails())]
                ]);
                break;
            case '/room':
                context.room?.getInfo().forEach(line =>
                {
                    ChatConsole.out(context, [line[0], line[1]]);
                });
                break;
            case '/who':
                context.room?.getParticipantIds().forEach(participantNick =>
                {
                    ChatConsole.out(context, [participantNick, context.room?.getParticipant(participantNick).getDisplayName()]);
                });
                break;
            case '/what':
                context.room?.getItemIds().forEach(itemId =>
                {
                    ChatConsole.out(context, [itemId, context.room?.getItem(itemId).getDisplayName()]);
                });
                break;
            case '/map':
                const vpi = new VpiResolver(BackgroundMessage, Config);
                const language: string = Translator.mapLanguage(navigator.language, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, as.String(Config.get('i18n.defaultLanguage'), 'en-US'));
                const translator = new Translator(Config.get('i18n.translations', {})[language], language, as.String(Config.get('i18n.serviceUrl'), ''));
                vpi.language = Translator.getShortLanguageCode(translator.getLanguage());
                const lines = new Array<[string, string]>();
                const url = parts[1];
                lines.push(['URL', url]);
                vpi.trace = (key, value) => { lines.push([key, value]); };
                vpi.map(url).then(result =>
                {
                    lines.forEach(line =>
                    {
                        ChatConsole.out(context, [line[0], line[1]]);
                    });
                    // ChatConsole.out(context, ['valid', result.isValid]);
                    // ChatConsole.out(context, ['room', result.roomJid]);
                    // ChatConsole.out(context, ['destination', result.destinationUrl]);
                });
                break;
        }
    }

    private static out(context: ChatConsoleContext, data: any): void
    {
        if (context.out) { context.out(data); }
    }
}
