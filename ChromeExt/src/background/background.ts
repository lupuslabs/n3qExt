import log = require('loglevel');
import { is } from '../lib/is';
import { Environment } from '../lib/Environment';
import { BackgroundApp } from './BackgroundApp';

const debug = Environment.isDevelopment();
console.debug('weblin.io Background', 'dev', debug);

log.setLevel(log.levels.INFO);

if (debug) {
    log.setLevel(log.levels.DEBUG);
    // log.setLevel(log.levels.TRACE);
}

let app = null;

function activate()
{
    if (is.nil(app)) {
        app = new BackgroundApp();

        app.start().catch(error => {
            app = null;
        });
    }
}

function deactivate()
{
    if (!is.nil(app)) {
        app.stop();
        app = null;
    }
}

activate();
