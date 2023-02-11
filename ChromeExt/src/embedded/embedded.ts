import log = require('loglevel');
import { Environment } from '../lib/Environment';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentMessage } from '../lib/ContentMessage';
import { BackgroundApp } from '../background/BackgroundApp';
import { ContentApp, ContentAppNotification, ContentAppParams } from '../contentscript/ContentApp';
import '../contentscript/contentscript.scss';
import * as $ from 'jquery';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { is } from '../lib/is';

declare var n3q: any; // This tells the compiler to assume that the variable exists. It doesn't actually declare it.

$(async function ()
{
    let devConfigJson = await Memory.getLocal(Utils.localStorageKey_CustomConfig(), '{}');
    let devConfig = JSON.parse(devConfigJson);
    Config.setDevTree(devConfig);

    let preferredClient = 'extension';
    if (typeof n3q != 'undefined' && typeof n3q.preferredClient != 'undefined') {
        preferredClient = n3q.preferredClient;
    }

    removeEmbeddedStyle(); // Always remove pre-shadow-DOM global style.
    if (preferredClient === 'extension') {
        let extensionId = Config.get('extension.id', 'cgfkfhdinajjhfeghebnljbanpcjdlkm');
        fetch('chrome-extension://' + extensionId + '/manifest.json').catch((error) => activateAll());
    } else {
        activateAll();
    }

    function parseScriptOrStyleUrl(scriptOrStyleUrl: string): null|{folderUrl: string, baseName: string, query: string}
    {
        const re = /^(https?:\/\/cdn\.weblin\.io(?::[0-9]+)?\/v1\/|https?:\/\/localhost(?::[0-9]+)?\/extdist\/)(embedded)(\.(?:js|css))((?:\?.*)?)$/;
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

    function activateAll()
    {
        let debug = Environment.isDevelopment();
        console.log('cdn.weblin.io Background', 'dev', debug);

        log.setLevel(log.levels.INFO);

        if (debug) {
            log.setLevel(log.levels.DEBUG);
        }

        let appBackground: BackgroundApp = null;

        async function activate()
        {
            log.debug('Background.activate');
            if (appBackground == null) {
                appBackground = new BackgroundApp();
                BackgroundMessage.background = appBackground;

                try {
                    await appBackground.start();
                }
                catch (error) {
                    appBackground = null;
                }
            }
        }

        function deactivate()
        {
            if (appBackground != null) {
                appBackground.stop();
                appBackground = null;
            }
        }

        window.addEventListener('message', (event) =>
        {
            if (event.data.type === BackgroundMessage.userSettingsChanged.name) {
                if (appBackground) {
                    appBackground.handle_userSettingsChanged();
                }
            }
        }, false);

        activate();

        // contentscript

        console.log('cdn.weblin.io Content', 'dev', debug);

        let appContent: ContentApp = null;
        let onTabChangeStay = false;

        try {

            function activateContent()
            {
                if (appContent == null) {
                    log.debug('Contentscript.activate');
                    appContent = new ContentApp(document.querySelector('body'), msg =>
                    {
                        log.debug('Contentscript msg', msg.type);
                        switch (msg.type) {
                            case ContentAppNotification.type_onTabChangeStay: {
                                onTabChangeStay = true;
                            } break;

                            case ContentAppNotification.type_onTabChangeLeave: {
                                onTabChangeStay = false;
                            } break;

                            case ContentAppNotification.type_stopped: {
                            } break;

                            case ContentAppNotification.type_restart: {
                                restartContent();
                            } break;
                        }
                    });
                    ContentMessage.content = appContent;
                    let params: ContentAppParams = typeof n3q === 'undefined' ? {} : n3q;
                    params.styleUrl = params.styleUrl ?? getStyleUrl();
                    appContent.start(params);
                }
            }

            function deactivateContent()
            {
                if (appContent != null) {
                    log.debug('Contentscript.deactivate');
                    appContent.stop();
                    appContent = null;
                }
            }

            function restartContent()
            {
                setTimeout(restart_deactivateContent, 100);
            }

            function restart_deactivateContent()
            {
                deactivateContent();
                setTimeout(restart_activateContent, 100);
            }

            function restart_activateContent()
            {
                activateContent();
            }

            function onUnloadContent()
            {
                if (appContent != null) {
                    log.debug('Contentscript.onUnload');
                    appContent.onUnload();
                    appContent = null;
                }
            }

            Panic.onNow(onUnloadContent);

            window.addEventListener('onbeforeunload', deactivateContent);

            window.addEventListener('visibilitychange', function ()
            {
                if (document.visibilityState === 'visible') {
                    activateContent();
                } else {
                    if (onTabChangeStay) {
                        log.debug('staying');
                    } else {
                        deactivateContent();
                    }
                }
            });

            if (document.visibilityState === 'visible') {
                activateContent();
            }

        } catch (error) {
            log.info(error);
        }
    }
});
