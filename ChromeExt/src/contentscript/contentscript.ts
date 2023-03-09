import log = require('loglevel');
import './contentscript.scss';
import * as $ from 'jquery';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { Environment } from '../lib/Environment';
import { ContentApp, ContentAppNotification } from './ContentApp';
import { ContentMessage } from '../lib/ContentMessage';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { SingleEntryPlugin } from 'webpack';

// This prevents the site and everyone else (including us) from processing focus events directed at our GUI:
// Listeners need to be registered before listeners of site for maximum reliability.
function preventAnyEventInterferenceIfEventIsForUs(ev: Event): void
{
    if (ev.target instanceof Element && ev.target.id === 'n3q') {
        ev.stopImmediatePropagation(); // No further event propagation - not to site-registered listener nor our own.
    }
}
window.addEventListener('focusin', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true});
window.addEventListener('focusout', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true});
window.addEventListener('focus', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true});
window.addEventListener('blur', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true});

$(function ()
{
    let debug = Environment.isDevelopment();
    console.debug('weblin.io Content', 'dev', debug);

    log.setLevel(log.levels.INFO);

    if (debug) {
        log.setLevel(log.levels.DEBUG);
        // log.setLevel(log.levels.TRACE);
    }

    const visibilityState = document.visibilityState;
    log.debug('Contentscript.init', { visibilityState });

    try {

        var app: ContentApp = null;
        let onTabChangeStay = false;

        let runtimeMessageHandlerWhileDeactivated: (message: any, sender: any, sendResponse: any) => any;
        function onRuntimeMessage(message, sender, sendResponse): any
        {
            if (message.type === ContentMessage.type_extensionActiveChanged && message.data && message.data.state) {
                activate();
            }
            sendResponse();
            return false;
        }

        function activate()
        {
            if (app == null) {
                if (Environment.isExtension() && chrome.runtime.onMessage && runtimeMessageHandlerWhileDeactivated) {
                    chrome.runtime.onMessage.removeListener(runtimeMessageHandlerWhileDeactivated);
                }

                log.debug('Contentscript.activate');
                app = new ContentApp(document.querySelector('body'), msg =>
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
                            deactivate();
                        } break;

                        case ContentAppNotification.type_restart: {
                            restart();
                        } break;
                    }
                });
                let styleUrl;
                try {
                    styleUrl = chrome.runtime.getURL('contentscript.css');
                } catch(error) {
                    log.debug('Contentscript.activate: Extension gone.');
                    return;
                }
                app.start({ styleUrl }).catch(error => log.error(error));
            } else {
                app.wakeup();
            }
        }

        function tabInvisible()
        {
            if (app != null) {
                app.sleep('TabInvisible'); // see Config.translations
            }
        }

        function deactivate()
        {
            if (app != null) {
                log.debug('Contentscript.deactivate');
                app.stop();
                app = null;

                if (Environment.isExtension() && chrome.runtime.onMessage) {
                    runtimeMessageHandlerWhileDeactivated = (message, sender, sendResponse) => onRuntimeMessage(message, sender, sendResponse);
                    chrome.runtime.onMessage.addListener(runtimeMessageHandlerWhileDeactivated);
                }
            }
        }

        function restart()
        {
            setTimeout(restart_deactivate, 100);
        }

        function restart_deactivate()
        {
            deactivate();
            setTimeout(restart_activate, 100);
        }

        function restart_activate()
        {
            activate();
        }

        Panic.onNow(() =>
        {
            if (app != null) {
                if (Config.get('environment.reloadPageOnPanic', false)) {
                    document.location.reload();
                } else {
                    log.debug('Contentscript.onUnload');
                    app.onUnload();
                    app = null;
                }
            }
        });

        window.addEventListener('unload', function ()
        {
            deactivate();
        });

        window.addEventListener('visibilitychange', function ()
        {
            const visibilityState = document.visibilityState;
            log.debug('Contentscript.onVisibilitychange', { visibilityState });
            if (visibilityState !== 'hidden') {
                if (visibilityState !== 'visible') {
                    $('body').append($('<div style="position:fixed;right:0;bottom:0;width:100px;height:100px;background-color:red;"></div>'));
                }
                activate();
            } else {
                if (onTabChangeStay) {
                    tabInvisible()
                } else {
                    deactivate();
                }
            }
        });

        if (visibilityState !== 'hidden') {
            if (visibilityState !== 'visible') {
                $('body').append($('<div style="position:fixed;right:0;bottom:0;width:100px;height:100px;background-color:red;"></div>'));
            }
            activate();
        }

    } catch (error) {
        log.info(error);
    }

});
