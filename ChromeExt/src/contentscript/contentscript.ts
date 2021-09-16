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

$(function ()
{
    let debug = Environment.isDevelopment();
    console.debug('weblin.io Content', 'dev', debug);

    log.setLevel(log.levels.INFO);

    if (debug) {
        log.setLevel(log.levels.DEBUG);
        // log.setLevel(log.levels.TRACE);
    }

    try {

        var app = null;
        let onTabChangeStay = false;

        let runtimeMessageHandlerWhileDeactivated: (message: any, sender: any, sendResponse: any) => any;
        function onRuntimeMessage(message, sender, sendResponse): any
        {
            if (message.type == ContentMessage.type_extensionActiveChanged && message.data && message.data.state) {
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
                app = new ContentApp($('body').get(0), msg =>
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
                app.start();
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
            if (document.visibilityState === 'visible') {
                activate();
            } else {
                if (onTabChangeStay) {
                    tabInvisible()
                } else {
                    deactivate();
                }
            }
        });

        if (document.visibilityState === 'visible') {
            activate();
        }

    } catch (error) {
        log.info(error);
    }

});
