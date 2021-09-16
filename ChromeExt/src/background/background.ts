import log = require('loglevel');
import { Environment } from '../lib/Environment';
import { BackgroundApp } from './BackgroundApp';
import { BackgroundMessage } from '../lib/BackgroundMessage';

let debug = Environment.isDevelopment();
console.debug('weblin.io Background', 'dev', debug);

log.setLevel(log.levels.INFO);

if (debug) {
    log.setLevel(log.levels.DEBUG);
    // log.setLevel(log.levels.TRACE);
}

var app = null;

async function activate()
{
    if (app == null) {
        app = new BackgroundApp();

        try {
            await app.start();
        }
        catch (error) {
            app = null;
        }
    }
}

function deactivate()
{
    if (app != null) {
        app.stop();
        app = null;
    }
}

activate();
