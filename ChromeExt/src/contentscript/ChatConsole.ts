import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Client } from '../lib/Client';
import { Config } from '../lib/Config';
import { Translator } from '../lib/Translator';
import { ContentApp } from './ContentApp';
import { Room } from './Room';
import { TestWindow } from './TestWindow';
import { VpiResolver } from './VpiResolver';

export interface ChatConsoleOut { (data: any): void }

export class ChatConsoleContext
{
    app: ContentApp;
    room: Room;
    out: ChatConsoleOut;
}

export class ChatConsole
{
    static isChatCommand(text: string, context: ChatConsoleContext): boolean
    {
        if (text.substring(0, 1) == '/') {
            return ChatConsole.chatCommand(text, context);
        }
        return false;
    }

    private static chatCommand(text: string, context: ChatConsoleContext): boolean
    {
        let isHandled = false;

        var parts: string[] = text.split(' ');
        if (parts.length < 1) { return; }
        var cmd: string = parts[0];

        this.out(context, text);

        isHandled = true;
        switch (cmd) {
            case '/help':
            case '/?':
                this.out(context, [
                    ['help', '/clear # empty chat window'],
                    ['help', '/xmpp # show xmpp console'],
                    ['help', '/room # show room info'],
                    ['help', '/changes # show versions and changes'],
                    ['help', '/i /items /stuff /backpack /things # toggle backpack window'],
                    ['help', '/v /video /vid /vidconf /conf /jitsi # toggle video conf window'],
                    ['help', '/c /chat # toggle chat window'],
                    ['help', '/info # show client info'],
                    ['help', '/who # show participants'],
                    ['help', '/what # show items'],
                    ['help', '/map <URL> # show URL mapping for url'],
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
                context.app?.showChatWindow();
                break;
            case '/i':
            case '/items':
            case '/backpack':
            case '/stuff':
            case '/things':
                context.app?.showBackpackWindow();
                break;
            case '/v':
            case '/vid':
            case '/vidconf':
            case '/conf':
            case '/jitsi':
                context.app?.showVidconfWindow();
                break;
            case '/test':
                new TestWindow(context.app).show({});
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
                let vpi = new VpiResolver(BackgroundMessage, Config);
                let language: string = Translator.mapLanguage(navigator.language, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));
                let translator = new Translator(Config.get('i18n.translations', {})[language], language, Config.get('i18n.serviceUrl', ''));
                vpi.language = Translator.getShortLanguageCode(translator.getLanguage());
                let lines = new Array<[string, string]>();
                let url = parts[1];
                lines.push(['URL', url]);
                vpi.trace = (key, value) => { lines.push([key, value]); };
                vpi.map(url).then(location =>
                {
                    lines.forEach(line =>
                    {
                        ChatConsole.out(context, [line[0], line[1]]);
                    });
                });
                break;
            default:
                isHandled = false;
        }

        return isHandled;
    }

    private static out(context: ChatConsoleContext, data: any): void
    {
        if (context.out) { context.out(data); }
    }
}
