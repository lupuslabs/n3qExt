import log = require('loglevel');
import { Environment } from '../lib/Environment';
import { Client } from '../lib/Client';
import { BackgroundApp, ContentCommunicatorFactory } from '../background/BackgroundApp';
import { ContentApp, ContentAppNotification, ContentAppParams } from '../contentscript/ContentApp';
import '../contentscript/contentscript.scss';
import * as $ from 'jquery';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { BackgroundToContentCommunicator } from '../lib/BackgroundToContentCommunicator'
import { ContentRequestHandler, ContentToBackgroundCommunicator } from '../lib/ContentToBackgroundCommunicator'
import { SamethreadBackgroundMessagePipeProvider, SamethreadContentMessagePipeProvider } from '../lib/SamethreadMessagePipe'
import { BackgroundErrorResponse, BackgroundRequest, BackgroundResponse, } from '../lib/BackgroundMessage'

declare var n3q: any; // This tells the compiler to assume that the variable exists. It doesn't create it.

$(async function ()
{
    Client.initLog();
    const isDevelopment = Environment.isDevelopment();
    console.debug('weblin.io Embedded', { isDevelopment });

    await Client.initDevConfig();

    let preferredClient = 'extension';
    if (is.string(n3q?.preferredClient ?? null)) {
        preferredClient = n3q.preferredClient;
    }
    removeEmbeddedStyle(); // Always remove pre-shadow-DOM global style.

    let backgroundPipeProvider: null|SamethreadBackgroundMessagePipeProvider = null;
    let backgroundCommunicator: null|BackgroundToContentCommunicator = null;
    let backgroundApp: null|BackgroundApp = null;

    let contentRequestFromBackgroundHandler: null|ContentRequestHandler = null;
    let contentApp: ContentApp = null;
    let onTabChangeStay = false;

    if (preferredClient === 'extension') {
        let extensionId = Config.get('extension.id', 'cgfkfhdinajjhfeghebnljbanpcjdlkm');
        fetch(`chrome-extension://${extensionId}/manifest.json`).catch((error) => activateAll());
    } else {
        activateAll();
    }

    function parseScriptOrStyleUrl(scriptOrStyleUrl: string): null|{folderUrl: string, baseName: string, query: string}
    {
        const re = /^(https?:\/\/(?:cdn\.weblin\.io|localhost)(?::[0-9]+)?\/(?:v1|extdist)\/)(embedded)(\.(?:js|css))((?:\?.*)?)$/;
        const parts: string[] = re.exec(scriptOrStyleUrl) ?? [];
        if (!parts.length) {
            return null;
        }
        return {folderUrl: parts[1], baseName: parts[2], query: parts[4]};
    }

    function removeEmbeddedStyle()
    {
        const linkTags = document.getElementsByTagName('link');
        for (let i = 0; i < linkTags.length; i++) {
            const linkTag = linkTags[i];
            if (linkTag.getAttribute('type') === 'text/css' && linkTag.getAttribute('rel') === 'stylesheet') {
                const linkHref = linkTag.getAttribute('href');
                if (!is.nil(parseScriptOrStyleUrl(linkHref))) {
                    console.log('cdn.weblin.io removing embedded stylesheet');
                    linkTag.remove();
                }
            }
        }
    }

    function getStyleUrl(): null|string
    {
        for (const elem of document.getElementsByTagName('script')[Symbol.iterator]()) {
            const elemSrcUrl = (<HTMLScriptElement>elem).src ?? '';
            const ownAssetFolderUrl = parseScriptOrStyleUrl(elemSrcUrl);
            if (!is.nil(ownAssetFolderUrl)) {
                return `${ownAssetFolderUrl.folderUrl}${ownAssetFolderUrl.baseName}.css${ownAssetFolderUrl.query}`;
            }
        }
        return null;
    }

    function activateBackground(): void
    {
        log.debug('Background.activate');
        backgroundPipeProvider = new SamethreadBackgroundMessagePipeProvider()
        const backgroundCommunicatorMaker: ContentCommunicatorFactory = (heartbeatHandler, tabHeartbeatHandler, requestHandler) => {
            backgroundCommunicator = new BackgroundToContentCommunicator(backgroundPipeProvider, heartbeatHandler, tabHeartbeatHandler, requestHandler)
            return backgroundCommunicator
        }
        backgroundApp = new BackgroundApp(backgroundCommunicatorMaker);
        backgroundApp.start()
            .catch(error => log.debug('BackgroundApp.start failed!', error));
    }

    function deactivateBackground(): void
    {
        log.debug('Embedded.deactivateBackground');
        backgroundApp?.stop();
        backgroundApp = null;
        backgroundCommunicator?.stop();
        backgroundCommunicator = null;
        backgroundPipeProvider = null;
    }

    function activateContent()
    {
        if (contentApp) {
            return;
        }

        const domAppContainer = document.querySelector('body');
        const appMsgHandler = msg => {
            log.debug('Embedded msg', msg.type);
            switch (msg.type) {
                case ContentAppNotification.type_onTabChangeStay: {
                    onTabChangeStay = true;
                } break;
                case ContentAppNotification.type_onTabChangeLeave: {
                    onTabChangeStay = false;
                } break;
                case ContentAppNotification.type_stopped: {
                    deactivateContent();
                    deactivateBackground();
                } break;
                case ContentAppNotification.type_restart: {
                    restartAll();
                } break;
            }
        };

        const onRequestFromBackground = async(request: BackgroundRequest): Promise<BackgroundResponse> => {
            if (contentApp) {
                if (contentRequestFromBackgroundHandler) {
                    return contentRequestFromBackgroundHandler(request);
                }
                return new BackgroundErrorResponse('uninitialized', 'ContentApp not ready yet.');
            }
            return new BackgroundErrorResponse('uninitialized', 'ContentApp not initialized yet.');
        };
        const messagePipeProvider = new SamethreadContentMessagePipeProvider(backgroundPipeProvider)

        const backgroundCommunicatorFactoryForApp = (contentRequestHandler: ContentRequestHandler) => {
            contentRequestFromBackgroundHandler = contentRequestHandler;
            const contentCommunicator = new ContentToBackgroundCommunicator(messagePipeProvider, onRequestFromBackground);
            contentCommunicator.start();
            return contentCommunicator;
        };

        contentApp = new ContentApp(domAppContainer, appMsgHandler, backgroundCommunicatorFactoryForApp);
        const params: ContentAppParams = typeof n3q === 'undefined' ? {} : n3q;
        params.styleUrl = params.styleUrl ?? getStyleUrl();
        contentApp.start(params).catch(error => log.error(error));
    }

    function deactivateContent()
    {
        if (contentApp) {
            log.debug('Embedded.deactivate');
            contentApp.stop();
            contentApp = null;
            contentRequestFromBackgroundHandler = null;
        }
    }

    function onUnloadContent()
    {
        if (contentApp) {
            log.debug('Embedded.onUnload');
            contentApp.onUnload();
            contentApp = null;
        }
    }

    function onVisibilitychange()
    {
        const visibilityState = document.visibilityState;
        log.debug('Contentscript.onVisibilitychange', { visibilityState });
        if (visibilityState !== 'hidden') {
            activateContent();
        } else {
            if (onTabChangeStay) {
                contentApp?.sleep('TabInvisible'); // see Config.translations
            } else {
                deactivateContent();
            }
        }
    }

    function activateAll()
    {
        console.log('cdn.weblin.io Embedded', 'dev', Environment.isDevelopment());
        activateBackground()
        Panic.onNow(() => onUnloadContent());
        window.addEventListener('onbeforeunload', () => deactivateContent());
        window.addEventListener('visibilitychange', () => onVisibilitychange());
        onVisibilitychange()
    }

    function restartAll()
    {
        log.debug('Embedded.restartAll');
        new Promise(resolve => setTimeout(resolve, 100))
            .then(() => deactivateContent())
            .then(() => new Promise(resolve => setTimeout(resolve, 100)))
            .then(() => deactivateBackground())
            .then(() => new Promise(resolve => setTimeout(resolve, 100)))
            .then(() => activateBackground())
            .then(() => new Promise(resolve => setTimeout(resolve, 100)))
            .then(() => activateContent())
    }

});
