import log = require('loglevel');
import { Environment } from '../lib/Environment';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentMessage } from '../lib/ContentMessage';
import { BackgroundApp } from '../background/BackgroundApp';
import { ContentApp, ContentAppNotification } from '../contentscript/ContentApp';
import '../contentscript/contentscript.scss';
import * as $ from 'jquery';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';

declare var n3q: any;

$(async function ()
{
    let devConfigJson = await Memory.getLocal(Utils.localStorageKey_CustomConfig(), '{}');
    let devConfig = JSON.parse(devConfigJson);
    Config.setDevTree(devConfig);

    let preferredClient = 'extension';
    if (typeof n3q != 'undefined' && typeof n3q.preferredClient != 'undefined') {
        preferredClient = n3q.preferredClient;
    }

    if (preferredClient == 'extension') {
        let extensionId = Config.get('extension.id', 'cgfkfhdinajjhfeghebnljbanpcjdlkm');
        fetch('chrome-extension://' + extensionId + '/manifest.json')
            .then(function (response) { })
            .catch(function (error)
            {
                activateAll();
            });
    } else {
        activateAll();
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
                    appContent = new ContentApp($('body').get(0), msg =>
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
                    appContent.start(typeof n3q == 'undefined' ? {} : n3q);
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
